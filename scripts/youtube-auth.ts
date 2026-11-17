import {createHash, randomBytes} from 'node:crypto';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {z} from 'zod';

const client = z.object({installed: z.object({client_id: z.string(), client_secret: z.string()})})
  .parse(JSON.parse(await readFile(process.argv[2] ?? '', 'utf8'))).installed;
const repository = process.argv[3] ?? 'Jyozaa/yt-auto';
if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repository)) throw new Error('Supply OWNER/REPO');
const state = randomBytes(32).toString('base64url');
const verifier = randomBytes(48).toString('base64url');
const challenge = createHash('sha256').update(verifier).digest('base64url');
let receive!: (code: string) => void;
let fail!: (error: Error) => void;
const code = new Promise<string>((resolve, reject) => { receive = resolve; fail = reject; });
const server = createServer((request, reply) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  if (url.pathname !== '/oauth' || url.searchParams.get('state') !== state) {
    reply.writeHead(400).end('Unknown OAuth request.');
    return;
  }
  const value = url.searchParams.get('code');
  if (!value) {
    reply.writeHead(400).end('Google did not provide an authorization code.');
    fail(new Error('Google authorization was declined or failed'));
    return;
  }
  reply.end('Authorization received. Check the terminal for setup status.');
  receive(value);
});
await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const address = server.address();
if (typeof address !== 'object' || !address) throw new Error('OAuth listener did not start');
const redirect = `http://127.0.0.1:${address.port}/oauth`;
const login = new URL('https://accounts.google.com/o/oauth2/v2/auth');
login.search = new URLSearchParams({
  client_id: client.client_id, redirect_uri: redirect, response_type: 'code', access_type: 'offline', prompt: 'consent',
  scope: 'https://www.googleapis.com/auth/youtube.upload', state, code_challenge: challenge, code_challenge_method: 'S256'
}).toString();
console.log(`Open this URL and authorize the intended YouTube channel:\n${login}`);
const timeout = setTimeout(() => fail(new Error('OAuth callback expired after five minutes')), 300_000);
try {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', signal: AbortSignal.timeout(25_000),
    body: new URLSearchParams({...client, code: await code, redirect_uri: redirect, code_verifier: verifier, grant_type: 'authorization_code'})
  });
  if (!response.ok) throw new Error(`Google token exchange failed (HTTP ${response.status})`);
  const token = z.object({refresh_token: z.string().min(1)}).parse(await response.json()).refresh_token;
  for (const [name, value] of Object.entries({YOUTUBE_CLIENT_ID: client.client_id, YOUTUBE_CLIENT_SECRET: client.client_secret, YOUTUBE_REFRESH_TOKEN: token})) {
    await new Promise<void>((resolve, reject) => {
      const command = spawn('gh', ['secret', 'set', name, '--repo', repository], {stdio: ['pipe', 'ignore', 'inherit']});
      command.on('error', reject);
      command.stdin.on('error', reject);
      command.on('close', (status) => status === 0 ? resolve() : reject(new Error(`gh could not store ${name}`)));
      command.stdin.end(value);
    });
  }
  console.log('YouTube OAuth values stored as GitHub Actions secrets.');
} finally {
  clearTimeout(timeout);
  server.close();
}
