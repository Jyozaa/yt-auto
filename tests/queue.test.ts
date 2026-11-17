import assert from 'node:assert/strict';
import {test} from 'node:test';
import {GitHub, allowedAuthor, reserve, transition, type Issue, type Ledger, type Ticket} from '../src/integrations/github';

const base = 'a'.repeat(40);
const first = {issueId: 12, issue: 1, story: 'test-story', hash: 'b'.repeat(64)};
const fresh = (): Ledger => ({version: 1, entries: {}, stories: {}});

test('trusted issue owners are case insensitive and pull requests are excluded', () => {
  const issue: Issue = {id: 12, number: 1, state: 'open', body: '{}', labels: [], user: {login: 'Jyozaa'}};
  assert(allowedAuthor(issue, 'other, jyozaa'));
  assert(!allowedAuthor({...issue, user: {login: 'external'}}, 'Jyozaa'));
  assert(!allowedAuthor({...issue, pull_request: {}}, 'Jyozaa'));
});

test('claims reserve both issue ID and story ID, and protect the accepted bytes', () => {
  const ledger = fresh();
  assert.equal(reserve(ledger, first, '1.1', false), 'claimed');
  assert.equal(reserve(ledger, first, '1.1', false), 'processing');
  assert.equal(reserve(ledger, {...first, issueId: 99}, '2.1', false), 'duplicate');
  assert.equal(reserve(ledger, {...first, hash: 'c'.repeat(64)}, '2.1', true), 'changed');
  assert.throws(() => transition(ledger, first, '2.1', 'done'), /does not own/);
  transition(ledger, first, '1.1', 'failed');
  assert.equal(reserve(ledger, first, '1.2', true), 'claimed');
  transition(ledger, first, '1.2', 'upload-started');
  assert.equal(reserve(ledger, first, '2.1', true), 'upload-started');
  assert.throws(() => transition(ledger, first, '1.2', 'failed'), /Invalid queue transition/);
  transition(ledger, first, '1.2', 'uploaded', '11chr-VID_1');
  assert.equal(reserve(ledger, first, '2.1', false), 'uploaded');
});

test('ledger resolves compare-and-swap conflicts without duplicate claims', async () => {
  let branch = false;
  let commits = 0;
  let ledger = fresh();
  let conflict = true;
  const transport: typeof fetch = async (url, options) => {
    const path = new URL(String(url)).pathname;
    const method = options?.method;
    if (path.endsWith('/git/refs') && method === 'POST') {
      branch = true;
      return Response.json({}, {status: 201});
    }
    if (path.endsWith('/git/ref/heads/yt-auto-ledger')) return Response.json({}, {status: branch ? 200 : 404});
    assert(path.endsWith('/contents/.yt-auto-ledger.json'));
    if (method === 'GET') return commits ? Response.json({sha: String(commits), content: Buffer.from(JSON.stringify(ledger)).toString('base64')}) :
      Response.json({}, {status: 404});
    assert.equal(method, 'PUT');
    if (conflict) {
      conflict = false;
      reserve(ledger, first, '1.1', false);
      commits++;
      return Response.json({}, {status: 409});
    }
    const request = JSON.parse(String(options?.body));
    assert.equal(request.sha, String(commits));
    ledger = JSON.parse(Buffer.from(request.content, 'base64').toString());
    commits++;
    return Response.json({});
  };
  const github = new GitHub('fixture', 'owner/repo', transport);
  const other: Ticket = {...first, issueId: 13, issue: 2};
  assert.equal(await github.mutate((state) => reserve(state, other, '2.1', false), base), 'duplicate');
  assert.equal(await github.mutate((state) => reserve(state, {...other, story: 'constructor'}, '2.1', false), base), 'claimed');
  assert.equal(commits, 2);
});
