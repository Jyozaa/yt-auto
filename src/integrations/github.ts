import {createHash} from 'node:crypto';
import {z} from 'zod';
import {storySchema, type Story} from '../story/schema';

export const labels = {
  ready: 'story-ready', processing: 'story-processing', rejected: 'story-rejected',
  failed: 'story-failed', done: 'story-done'
} as const;

export type Issue = {id: number; number: number; state: string; body: string | null; user: {login: string} | null;
  labels: {name: string}[]; pull_request?: object};
export type Ticket = {issue: number; issueId: number; story: string; hash: string};
const ticketShape = {issue: z.number().int().positive(), issueId: z.number().int().positive(),
  story: z.string().regex(/^[a-z][a-z0-9-]{0,47}$/), hash: z.string().regex(/^[a-f0-9]{64}$/)};
export const ticketSchema = z.strictObject(ticketShape);
const entrySchema = z.strictObject({
  ...ticketShape,
  status: z.enum(['processing', 'failed', 'done', 'upload-started', 'uploaded']),
  run: z.string().min(1), videoId: z.string().regex(/^[a-zA-Z0-9_-]{11}$/).optional()
});
export type Entry = z.infer<typeof entrySchema>;
const ledgerSchema = z.strictObject({
  version: z.literal(1), entries: z.record(z.string().regex(/^\d+$/), entrySchema),
  stories: z.record(z.string().regex(/^[a-z][a-z0-9-]{0,47}$/), z.number().int().positive())
});
export type Ledger = z.infer<typeof ledgerSchema>;

export function allowedAuthor(issue: Issue, authors: string) {
  const allowlist = authors.split(',').map((author) => author.trim().toLowerCase()).filter(Boolean);
  return !issue.pull_request && !!issue.user && allowlist.includes(issue.user.login.toLowerCase());
}

export function parseIssue(body: string | null): Story {
  if (!body || Buffer.byteLength(body) > 55_000) throw new Error('Issue body empty or over 55 KB');
  const trimmed = body.trim();
  const fenced = /^\x60{3}json\r?\n([\s\S]+)\r?\n\x60{3}$/i.exec(trimmed);
  let raw: unknown;
  try { raw = JSON.parse(fenced?.[1] ?? trimmed); }
  catch { throw new Error('Use a single JSON object or one fenced json block'); }
  const result = storySchema.safeParse(raw);
  if (!result.success) {
    const messages = result.error.issues.slice(0, 10).map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Story validation failed\n${messages.join('\n')}`);
  }
  return result.data;
}

export const storyHash = (story: Story) => createHash('sha256').update(JSON.stringify(story)).digest('hex');

export function reserve(ledger: Ledger, ticket: Ticket, run: string, retry: boolean) {
  const existing = ledger.entries[ticket.issueId];
  if (existing) {
    if (existing.hash !== ticket.hash || existing.story !== ticket.story) return 'changed';
    if (!retry || !['processing', 'failed'].includes(existing.status)) return existing.status;
  }
  const original = Object.hasOwn(ledger.stories, ticket.story) ? ledger.stories[ticket.story] : undefined;
  if (original && original !== ticket.issueId) return 'duplicate';
  ledger.entries[ticket.issueId] = {...ticket, run, status: 'processing'};
  ledger.stories[ticket.story] = ticket.issueId;
  return 'claimed';
}

export function transition(ledger: Ledger, ticket: Ticket, run: string, status: Entry['status'], videoId?: string) {
  const entry = ledger.entries[ticket.issueId];
  if (!entry || entry.run !== run || entry.issue !== ticket.issue || entry.hash !== ticket.hash || entry.story !== ticket.story) {
    throw new Error('This run does not own the reserved story');
  }
  const valid: Record<Entry['status'], Entry['status'][]> = {
    processing: ['failed', 'done', 'upload-started'],
    'upload-started': ['uploaded'], uploaded: [], failed: [], done: []
  };
  if (!valid[entry.status].includes(status)) throw new Error(`Invalid queue transition ${entry.status} to ${status}`);
  if (status === 'uploaded' && !/^[a-zA-Z0-9_-]{11}$/.test(videoId ?? '')) throw new Error('Invalid YouTube video ID');
  entry.status = status;
  if (videoId) entry.videoId = videoId;
  return entry;
}

class GithubError extends Error {
  constructor(readonly status: number, method: string, path: string) {
    super(`GitHub ${method} ${path} returned HTTP ${status}`);
  }
}

export class GitHub {
  constructor(private token: string, private repo: string, private transport: typeof fetch = fetch) {
    if (!token || !/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repo)) throw new Error('Configure GITHUB_TOKEN and GITHUB_REPOSITORY');
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await this.transport(`https://api.github.com/repos/${this.repo}${path}`, {
      method, redirect: 'error', signal: AbortSignal.timeout(30_000),
      headers: {'Authorization': `Bearer ${this.token}`, 'User-Agent': 'yt-auto', 'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28'},
      ...(body === undefined ? {} : {body: JSON.stringify(body)})
    });
    if (!response.ok) throw new GithubError(response.status, method, path);
    return (response.status === 204 ? undefined : await response.json()) as T;
  }

  issue(number: number) { return this.request<Issue>('GET', `/issues/${number}`); }

  async pending(authors: string) {
    for (let page = 1; page <= 8; page++) {
      const batch = await this.request<Issue[]>('GET', `/issues?state=open&labels=story-ready&sort=created&direction=asc&per_page=100&page=${page}`);
      const issue = batch.find((entry) => allowedAuthor(entry, authors));
      if (issue) return issue;
      if (batch.length < 100) return;
    }
  }

  async label(issue: Issue, status: keyof typeof labels) {
    const catalog = Object.values(labels);
    const keep = issue.labels.map(({name}) => name).filter((name) => !catalog.includes(name as typeof catalog[number]));
    await this.request('PUT', `/issues/${issue.number}/labels`, {labels: [...new Set([...keep, labels[status]])]});
  }

  async comment(number: number, text: string) {
    await this.request('POST', `/issues/${number}/comments`, {body: text.slice(0, 3900)});
  }

  async setupLabels() {
    const colors = ['61b886', 'faaf55', 'c0a4d4', 'd76262', '437dbd'];
    for (const [i, name] of Object.values(labels).entries()) {
      try { await this.request('GET', `/labels/${name}`); }
      catch (error) {
        if (!(error instanceof GithubError) || error.status !== 404) throw error;
        await this.request('POST', '/labels', {name, color: colors[i]});
      }
    }
  }

  async mutate<T>(mutate: (ledger: Ledger) => T, base: string): Promise<T> {
    const branch = 'yt-auto-ledger';
    const path = '/contents/.yt-auto-ledger.json';
    for (let attempt = 0; attempt < 4; attempt++) {
      let current: {sha: string; content: string} | undefined;
      try { current = await this.request('GET', `${path}?ref=${branch}`); }
      catch (error) {
        if (!(error instanceof GithubError) || error.status !== 404) throw error;
        try { await this.request('GET', `/git/ref/heads/${branch}`); }
        catch (missing) {
          if (!(missing instanceof GithubError) || missing.status !== 404 || !/^[a-f0-9]{40}$/.test(base)) throw missing;
          try { await this.request('POST', '/git/refs', {ref: `refs/heads/${branch}`, sha: base}); }
          catch (race) { if (!(race instanceof GithubError) || ![409, 422].includes(race.status)) throw race; }
          continue;
        }
      }
      const ledger = current ? ledgerSchema.parse(JSON.parse(Buffer.from(current.content, 'base64').toString())) :
        {version: 1 as const, entries: {}, stories: {}};
      const before = JSON.stringify(ledger);
      const result = mutate(ledger);
      if (JSON.stringify(ledger) === before) return result;
      try {
        await this.request('PUT', path, {branch, message: 'Update story production ledger',
          content: Buffer.from(JSON.stringify(ledger)).toString('base64'), sha: current?.sha});
        return result;
      } catch (error) {
        if (!(error instanceof GithubError) || ![409, 422].includes(error.status) || attempt === 3) throw error;
      }
    }
    throw new Error('Unable to update story ledger after concurrent changes');
  }
}
