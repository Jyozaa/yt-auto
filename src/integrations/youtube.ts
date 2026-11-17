import {open, stat} from 'node:fs/promises';
import {z} from 'zod';
import type {Story} from '../story/schema';

const oauthEndpoint = 'https://oauth2.googleapis.com/token';
const insertEndpoint = 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status';
const transient = (status: number) => status === 429 || status >= 500;
const chunkSize = 8 * 1024 ** 2;
const videoResult = z.object({id: z.string().regex(/^[A-Za-z0-9_-]{11}$/)});

export function uploadEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.YOUTUBE_UPLOAD_ENABLED === 'true';
}

export function videoMetadata(story: Story, env: NodeJS.ProcessEnv = process.env, now = Date.now()) {
  const publish = story.publish;
  const privacyStatus = publish?.privacy ?? 'private';
  if ((privacyStatus !== 'private' || publish?.publishAt) && env.YOUTUBE_ALLOW_PUBLIC !== 'true') {
    throw new Error('Non-private or scheduled publishing requires YOUTUBE_ALLOW_PUBLIC=true');
  }
  if (publish?.publishAt && (privacyStatus !== 'private' || Date.parse(publish.publishAt) <= now)) {
    throw new Error('Scheduled publication requires a future publishAt and private privacy');
  }
  const citations = story.sources.map(({title, url}) => `${title} — ${url}`).join('\n');
  const description = `${publish?.description ?? story.summary}\n\nSources\n${citations}`;
  if (Buffer.byteLength(description) > 5000 || /[<>]/.test(description + story.youtubeTitle)) {
    throw new Error('YouTube title and description exceed video metadata constraints');
  }
  return {
    snippet: {title: story.youtubeTitle, description, tags: publish?.tags ?? [],
      categoryId: publish?.category ?? '27', defaultLanguage: 'en'},
    status: {privacyStatus, ...(publish?.publishAt ? {publishAt: publish.publishAt} : {}), selfDeclaredMadeForKids: false}
  };
}

async function apiError(response: Response, operation: string) {
  const payload = await response.json().catch(() => undefined) as {error?: {errors?: {reason?: string}[]}} | undefined;
  const reason = payload?.error?.errors?.[0]?.reason;
  const detail = reason && /^[a-zA-Z0-9_]{1,60}$/.test(reason) ? ` (${reason})` : '';
  return new Error(`YouTube ${operation} returned HTTP ${response.status}${detail}`);
}

export async function accessToken(env: NodeJS.ProcessEnv = process.env, transport: typeof fetch = fetch) {
  const {YOUTUBE_CLIENT_ID: client, YOUTUBE_CLIENT_SECRET: secret, YOUTUBE_REFRESH_TOKEN: refresh} = env;
  if (!client || !secret || !refresh) throw new Error('Configure all three YouTube OAuth secrets');
  const response = await transport(oauthEndpoint, {
    method: 'POST', signal: AbortSignal.timeout(25_000), redirect: 'error',
    body: new URLSearchParams({client_id: client, client_secret: secret, refresh_token: refresh, grant_type: 'refresh_token'})
  });
  if (!response.ok) throw new Error(`Google OAuth refresh failed (HTTP ${response.status}). Verify client credentials, refresh token, and OAuth app status.`);
  return z.object({access_token: z.string().min(1)}).parse(await response.json()).access_token;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function uploadVideo(options: {
  path: string;
  story: Story;
  reserveUpload: () => Promise<void>;
  saveVideo: (videoId: string) => Promise<void>;
  env?: NodeJS.ProcessEnv;
  transport?: typeof fetch;
  pause?: (ms: number) => Promise<unknown>;
}) {
  const {path, story, reserveUpload, saveVideo, env = process.env, transport = fetch, pause = wait} = options;
  if (!uploadEnabled(env)) throw new Error('YouTube upload is disabled');
  const resource = videoMetadata(story, env);
  const size = (await stat(path)).size;
  if (!size) throw new Error('Video is empty');
  const access = await accessToken(env, transport);
  const authorization = {Authorization: `Bearer ${access}`};
  // The durable barrier precedes the first call that could create a video. A crashed run cannot create a new session.
  await reserveUpload();
  let session: URL | undefined;
  for (let i = 0; i < 5; i++) {
    const response = await transport(insertEndpoint, {
      method: 'POST', signal: AbortSignal.timeout(30_000), redirect: 'error',
      headers: {...authorization, 'Content-Type': 'application/json', 'X-Upload-Content-Length': String(size), 'X-Upload-Content-Type': 'video/mp4'},
      body: JSON.stringify(resource)
    });
    if (response.ok) {
      session = new URL(response.headers.get('location') ?? '');
      if (session.protocol !== 'https:' || !['www.googleapis.com', 'upload.youtube.com'].includes(session.hostname) ||
        session.username || session.password || session.port) throw new Error('Unexpected resumable session host');
      break;
    }
    if (!transient(response.status) || i === 4) throw await apiError(response, 'session setup');
    await pause(800 * 2 ** i);
  }
  if (!session) throw new Error('YouTube did not return a resumable session');
  const file = await open(path, 'r');
  let offset = 0;
  let failures = 0;
  let checkStatus = false;
  try {
    while (failures < 6) {
      const bytes = Math.min(chunkSize, size - offset);
      if (bytes <= 0) checkStatus = true;
      const payload = new Uint8Array(checkStatus ? 0 : bytes);
      if (!checkStatus && (await file.read(payload, 0, bytes, offset)).bytesRead !== bytes) throw new Error('Video changed during upload');
      let result: Response;
      try {
        result = await transport(session, {
          method: 'PUT', signal: AbortSignal.timeout(125_000), redirect: 'manual',
          headers: {...authorization, 'Content-Type': 'video/mp4', 'Content-Length': String(payload.length),
            'Content-Range': checkStatus ? `bytes */${size}` : `bytes ${offset}-${offset + bytes - 1}/${size}`},
          body: Buffer.from(payload)
        });
      } catch {
        checkStatus = true;
        await pause(900 * 2 ** failures++);
        continue;
      }
      if (result.ok) {
        const {id} = videoResult.parse(await result.json());
        await saveVideo(id);
        return id;
      }
      if (result.status === 308) {
        const range = result.headers.get('range');
        const match = /^bytes=0-(\d+)$/.exec(range ?? '');
        if (range && !match) throw new Error('YouTube returned an invalid resumable range');
        const next = match ? Number(match[1]) + 1 : 0;
        if (next < offset || next > size) throw new Error('YouTube returned an unexpected resumable range');
        if (next === offset && !checkStatus) {
          checkStatus = true;
          await pause(900 * 2 ** failures++);
        } else {
          checkStatus = false;
          if (next > offset) failures = 0;
          offset = next;
          if (offset === size) await pause(900 * 2 ** failures++);
        }
        continue;
      }
      if (!transient(result.status)) throw await apiError(result, 'upload');
      checkStatus = true;
      await pause(900 * 2 ** failures++);
    }
    throw new Error('YouTube resumable retries exhausted. The durable record requires manual reconciliation.');
  } finally {
    await file.close();
  }
}
