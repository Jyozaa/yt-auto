import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {storySchema} from '../src/story/schema';
import {uploadEnabled, uploadVideo, videoMetadata} from '../src/integrations/youtube';
import sample from '../examples/foucault.json';

const story = storySchema.parse(sample);
const env = {YOUTUBE_UPLOAD_ENABLED: 'true', YOUTUBE_CLIENT_ID: 'app', YOUTUBE_CLIENT_SECRET: 'secret', YOUTUBE_REFRESH_TOKEN: 'token'};

test('YouTube upload is opt-in and publication needs a separate switch', () => {
  assert(!uploadEnabled({}));
  assert(!uploadEnabled({YOUTUBE_UPLOAD_ENABLED: 'TRUE'}));
  assert.equal(videoMetadata(story, {}).status.privacyStatus, 'private');
  assert.throws(() => videoMetadata({...story, publish: {category: '28', privacy: 'public'}}, env), /requires YOUTUBE_ALLOW_PUBLIC/);
  const scheduled = {...story, publish: {category: '28' as const, privacy: 'private' as const, publishAt: '2035-01-18T11:11:00Z'}};
  assert.throws(() => videoMetadata(scheduled, env), /requires YOUTUBE_ALLOW_PUBLIC/);
  assert.equal(videoMetadata(scheduled, {...env, YOUTUBE_ALLOW_PUBLIC: 'true'}, 0).status.publishAt, scheduled.publish.publishAt);
});

test('resumable upload probes the server after a lost response and saves the video ID', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'yta-upload-test-'));
  try {
    const path = join(folder, 'fixture.mp4');
    await writeFile(path, '12345');
    const order: string[] = [];
    const transport: typeof fetch = async (url, init) => {
      const destination = new URL(String(url));
      if (destination.host === 'oauth2.googleapis.com') {
        order.push('auth');
        return Response.json({access_token: 'fixture'});
      }
      if (init?.method === 'POST') {
        order.push('session');
        return new Response(null, {status: 200, headers: {location: 'https://www.googleapis.com/upload/fixture'}});
      }
      const range = new Headers(init?.headers).get('content-range');
      order.push(range!);
      if (range === 'bytes 0-4/5') throw new Error('Connection dropped');
      if (range === 'bytes */5') return new Response(null, {status: 308, headers: {range: 'bytes=0-2'}});
      return Response.json({id: '11chr-VID_1'});
    };
    const result = await uploadVideo({path, story, env, transport, pause: async () => {},
      reserveUpload: async () => { order.push('barrier'); },
      saveVideo: async (id) => { order.push(id); }});
    assert.equal(result, '11chr-VID_1');
    assert.deepEqual(order, ['auth', 'barrier', 'session', 'bytes 0-4/5', 'bytes */5', 'bytes 3-4/5', '11chr-VID_1']);
  } finally {
    await rm(folder, {recursive: true, force: true});
  }
});
