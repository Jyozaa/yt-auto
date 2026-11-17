import {appendFile, copyFile, mkdir, readFile, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {z} from 'zod';
import {GitHub, allowedAuthor, labels, parseIssue, reserve, storyHash, ticketSchema, transition, type Issue, type Ticket} from '../src/integrations/github';
import {uploadEnabled, uploadVideo} from '../src/integrations/youtube';
import {storySchema} from '../src/story/schema';

const {
  GITHUB_TOKEN: token, GITHUB_REPOSITORY: repo, GITHUB_SHA: sha, GITHUB_RUN_ID: runId,
  GITHUB_RUN_ATTEMPT: attempt, STORY_TRUSTED_AUTHORS: authors = 'Jyozaa', GITHUB_OUTPUT: actionsOutput
} = process.env;
const github = new GitHub(token ?? '', repo ?? '');
const run = `${runId ?? ''}.${attempt ?? ''}`;
const runLink = `https://github.com/${repo}/actions/runs/${runId}`;
const dir = resolve('out/queue');
const deliver = resolve('out/queue-delivery');
const command = process.argv[2];
if (!/^\d+\.\d+$/.test(run) || !sha || !/^[a-f0-9]{40}$/.test(sha)) throw new Error('Queue commands run inside GitHub Actions');
const machine = () => github.mutate((ledger) => ledger, sha);

async function mark(issue: Issue, label: keyof typeof labels, summary: string) {
  await github.label(await github.issue(issue.number), label);
  await github.comment(issue.number, `${summary}\n\n[Production run](${runLink})`);
}

async function load() {
  const ticket = ticketSchema.parse(JSON.parse(await readFile(join(dir, 'ticket.json'), 'utf8')));
  const raw = await readFile(join(dir, 'story.json'), 'utf8');
  const story = storySchema.parse(JSON.parse(raw));
  if (ticket.story !== story.id || storyHash(story) !== ticket.hash) throw new Error('Story package differs from the queued reservation');
  return {ticket, story};
}

async function setStatus(ticket: Ticket, status: Parameters<typeof transition>[3], videoId?: string) {
  return github.mutate((ledger) => transition(ledger, ticket, run, status, videoId), sha!);
}

async function claim() {
  const requested = process.env.STORY_ISSUE ?? '0';
  if (!/^\d{1,10}$/.test(requested)) throw new Error('STORY_ISSUE must be a GitHub issue number');
  const retry = process.env.STORY_RETRY === 'true';
  if (retry && requested === '0') throw new Error('A retry requires a specific issue number');
  const issue = Number(requested) ? await github.issue(Number(requested)) : await github.pending(authors);
  if (!issue || issue.state !== 'open' || !allowedAuthor(issue, authors)) return console.log('No eligible story issue.');
  if (!retry && !issue.labels.some(({name}) => name === labels.ready)) return console.log('Story issue is not ready.');
  await github.setupLabels();
  let story;
  try { story = parseIssue(issue.body); }
  catch (error) {
    console.error(String(error));
    await mark(issue, 'rejected', 'Story package rejected. See the validation diagnostics.');
    return;
  }
  const ticket = {story: story.id, issue: issue.number, issueId: issue.id, hash: storyHash(story)};
  await mkdir(dir, {recursive: true});
  await writeFile(join(dir, 'story.json'), JSON.stringify(story, null, 2));
  await writeFile(join(dir, 'ticket.json'), JSON.stringify(ticket));
  const result = await github.mutate((ledger) => reserve(ledger, ticket, run, retry), sha!);
  if (result === 'duplicate' || result === 'changed') {
    await mark(issue, 'rejected', 'Story ID is already reserved or the accepted package has changed.');
    return;
  }
  if (result !== 'claimed') {
    if (result === 'uploaded' || result === 'done') await github.label(issue, 'done');
    else if (result === 'upload-started' || result === 'failed') await github.label(issue, 'failed');
    else await github.label(issue, 'processing');
    return console.log(`Story already recorded as ${result}.`);
  }
  if (actionsOutput) await appendFile(actionsOutput, 'claimed=true\n');
  await github.label(issue, 'processing');
}

async function render() {
  const {ticket, story} = await load();
  const recorded = (await machine()).entries[ticket.issueId];
  if (recorded?.run !== run || recorded.status !== 'processing') throw new Error('This run has no production reservation');
  const {produce} = await import('../src/render/produce');
  const video = await produce(story, dir, false);
  if (!video) throw new Error('Production returned no QA-approved output');
  await mkdir(deliver, {recursive: true});
  await copyFile(video, join(deliver, 'short.mp4'));
}

async function finish() {
  const {ticket, story} = await load();
  const issue = await github.issue(ticket.issue);
  let record = (await machine()).entries[ticket.issueId];
  if (record?.run !== run) throw new Error('This run does not own the production reservation');
  if (uploadEnabled() && record.status === 'processing') {
    try {
      await uploadVideo({path: join(deliver, 'short.mp4'), story,
        reserveUpload: async () => { await setStatus(ticket, 'upload-started'); },
        saveVideo: async (videoId) => { await setStatus(ticket, 'uploaded', videoId); }});
    } catch (error) {
      const status = (await machine()).entries[ticket.issueId]?.status;
      if (status === 'upload-started') await mark(issue, 'failed', 'Upload outcome requires reconciliation in YouTube Studio. Automatic upload is locked for this story.');
      throw error;
    }
  } else if (!uploadEnabled() && record.status === 'processing') {
    await setStatus(ticket, 'done');
  }
  record = (await machine()).entries[ticket.issueId];
  if (!['done', 'uploaded'].includes(record.status)) throw new Error('Story has no successful terminal record');
  const message = record.videoId
    ? `QA passed. Download the MP4 from the Actions artifact. YouTube video ID: \`${record.videoId}\`.`
    : 'QA passed. Download the MP4 from the Actions artifact. YouTube upload is disabled.';
  await mark(issue, 'done', message);
}

async function fail() {
  const {ticket} = await load();
  const record = (await machine()).entries[ticket.issueId];
  if (!record || record.run !== run || record.status !== 'processing') return;
  await setStatus(ticket, 'failed');
  await mark(await github.issue(ticket.issue), 'failed', 'Production failed. See the Actions run and diagnostics artifact.');
}

switch (command) {
  case 'claim': await claim(); break;
  case 'render': await render(); break;
  case 'finish': await finish(); break;
  case 'fail': await fail(); break;
  default: throw new Error('Expected queue command claim, render, finish, or fail');
}
