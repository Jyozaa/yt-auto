import assert from 'node:assert/strict';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';
import example from '../examples/foucault.json';
import {reviewShots, roles, type VisionVerifier} from '../src/qa/review';
import {storySchema, wordsOf} from '../src/story/schema';
import {compile} from '../src/story/timeline';

test('visual review scores each role and gives continuity the prior shot image', async (t) => {
  const story = storySchema.parse(example);
  const words = wordsOf(story.narration);
  const step = 60 / words.length;
  const film = compile(story, {duration: 60, provider: 'fixture',
    words: words.map((word, i) => ({word, start: i * step, end: (i + .9) * step}))});
  const dir = await mkdtemp(join(tmpdir(), 'yt-auto-review-'));
  t.after(() => rm(dir, {recursive: true, force: true}));
  const stills = await Promise.all(['first', 'second'].map(async (sample) => {
    const path = join(dir, `${sample}.jpg`);
    await writeFile(path, sample);
    return path;
  }));
  const verifier: VisionVerifier = {async inspect(role, shot, images) {
    const expected = role === 'continuity' && shot === film.shots[1] ? ['first', 'second'] :
      [shot === film.shots[0] ? 'first' : 'second'];
    assert.deepEqual(images.map((sample) => Buffer.from(sample, 'base64').toString()), expected);
    return role === 'lighting' ? {severity: 'block', findings: ['Excessive bloom'], repair: 'soften-look'} :
      {severity: 'pass', findings: [], repair: 'none'};
  }};
  const result = await reviewShots(film, stills.map((path, index) => ({index, stills: [path]})), verifier);
  assert.equal(result.length, 2 * Object.keys(roles).length);
  assert.deepEqual(result.filter(({severity}) => severity === 'block').map(({shot}) => shot), [0, 1]);
});
