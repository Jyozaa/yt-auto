import assert from 'node:assert/strict';
import {test} from 'node:test';
import {z} from 'zod';
import example from '../examples/foucault.json';
import {storySchema, wordsOf} from '../src/story/schema';
import {compile, verifyAlignment, type Alignment} from '../src/story/timeline';
import {parseIssue} from '../src/integrations/github';

test('schema and issue parser accept the original story in both supported body formats', () => {
  const expected = storySchema.parse(example);
  const raw = JSON.stringify(example);
  assert.deepEqual(parseIssue(raw), expected);
  assert.deepEqual(parseIssue('\x60\x60\x60json\n' + raw + '\n\x60\x60\x60'), expected);
  assert.throws(() => parseIssue('Instructions\n' + raw), /single JSON object/);
  assert.throws(() => parseIssue('x'.repeat(55_001)), /55 KB/);
});

test('schema catches unknown fields and citation, prop, cue and narration errors', () => {
  assert.throws(() => storySchema.parse({...example, job: 'run code'}), z.ZodError);
  const raw = structuredClone(example);
  raw.beats[0].actions[0].target = 'unsupported';
  raw.beats[0].sounds[0].word = 999;
  raw.claims[0].risk = 'high';
  raw.claims[0].sources = ['pantheon', 'pantheon'];
  raw.sources[0].url = 'http://localhost/claim';
  raw.narration += ' Invalid.';
  const validation = storySchema.safeParse(raw);
  assert.equal(validation.success, false);
  if (validation.success) return;
  const messages = validation.error.issues.map(({message}) => message);
  assert(messages.some((m) => m.includes('Unsupported action target')));
  assert(messages.some((m) => m.includes('Cue word index')));
  assert(messages.some((m) => m.includes('High-risk claims')));
  assert(messages.some((m) => m.includes('Narration must exactly')));
  assert(validation.error.issues.some(({path}) => path.join('.') === 'sources.0.url'));
});

test('timeline durations and action frames follow the verified word track', () => {
  const story = storySchema.parse(example);
  const words = wordsOf(story.narration);
  const step = 60 / words.length;
  const alignment: Alignment = {duration: 60, provider: 'fixture',
    words: words.map((word, i) => ({word, start: i * step, end: (i + .9) * step}))};
  const film = compile(story, alignment);
  assert.equal(film.frames, 1800);
  assert.equal(film.shots[0].start, 0);
  assert.equal(film.shots[0].end, film.shots[1].start);
  assert.equal(film.shots.at(-1)?.end, 1800);
  const [first] = film.shots[0].actions;
  assert.equal(first.frame, Math.round(alignment.words[first.word].start * 30) - 1);
  assert.equal(film.shots[0].sounds[0].frame, Math.round(alignment.words[film.shots[0].sounds[0].word].start * 30));
  alignment.words[0].word = 'different';
  assert.throws(() => verifyAlignment(story, alignment), /Invalid or missing timing/);
});
