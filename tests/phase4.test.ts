import assert from 'node:assert/strict';
import {test} from 'node:test';
import lake from '../examples/lake-peigneur-1980.json';
import foucault from '../examples/foucault.json';
import {foley, spatialize, worldFoley} from '../src/audio/foley';
import {faceAt} from '../src/engine/characters/acting';
import {footfalls, gaitAt} from '../src/engine/characters/gait';
import {landingFrame, propAt} from '../src/story/prop-motion';
import {structuralAudit} from '../src/story/quality';
import {fps, hairStyles, storySchema, wordsOf, type Story} from '../src/story/schema';
import {compile} from '../src/story/timeline';
import {contactFrame, worldAt} from '../src/story/world-events';

const fixture = storySchema.parse(lake);
function alignment(story: Story) {
  const words = wordsOf(story.narration);
  const spacing = 66 / words.length;
  return {duration: 66, provider: 'fixture', words: words.map((word, index) =>
    ({word, start: index * spacing, end: (index + .8) * spacing}))};
}
const timing = alignment(fixture);
const film = compile(fixture, timing);

test('Lake Peigneur keeps a cited nine-beat story and six distinct hairstyles', () => {
  assert(structuralAudit(fixture).passed);
  assert.equal(fixture.beats.length, 9);
  assert.deepEqual(new Set(fixture.characters.map(({hairStyle}) => hairStyle)), new Set(hairStyles));
  assert.equal(fixture.publish?.privacy, 'private');
  assert.equal(fixture.delivery, 'connected');
  const older = storySchema.parse(foucault);
  assert.equal(compile(older, alignment(older)).events, undefined);
  assert.equal(older.delivery, undefined);
});

test('new tracks reject missing actors, invalid words, duplicate IDs and unknown versions', () => {
  const story = structuredClone(lake);
  story.beats[2].acting!.cues[0].actor = 'missing-cast';
  story.beats[3].events![0].id = story.beats[2].events![1].id;
  story.beats[3].events![0].word = 600;
  const result = storySchema.safeParse(story);
  assert.equal(result.success, false);
  if (result.success) return;
  for (const message of ['unknown scene actor', 'Duplicate ID', 'index outside beat']) {
    assert(result.error.issues.some((entry) => entry.message.includes(message)), message);
  }
  const unsupported = structuredClone(lake);
  unsupported.beats[1].acting!.version = 2;
  assert.equal(storySchema.safeParse(unsupported).success, false);
});

test('facial cues lead the words by two frames and recover on arbitrary seeks', () => {
  const shot = film.shots[2];
  const lane = shot.faces!.filter(({actor}) => actor === 'rene');
  const cue = lane.find(({expression}) => expression === 'confused')!;
  const offset = fixture.beats.slice(0, 2).reduce((sum, beat) => sum + wordsOf(beat.text).length, 0);
  assert.equal(cue.frame, Math.round(timing.words[offset + cue.word].start * fps) - 2);
  assert.equal(faceAt(lane, cue.frame)?.blink, .5);
  assert.equal(faceAt(lane, cue.frame + 1)?.blink, 1);
  const pose = faceAt(lane, cue.frame + 9);
  assert.equal(pose?.expression, 'confused');
  assert(pose!.tilt > 6);
  assert.equal(faceAt(lane, shot.end + fps), undefined);
  assert.deepEqual(faceAt(lane, cue.frame + 9), pose);
});

test('rig impact, water and refill persist across camera cuts and use the same contact as the mix', () => {
  const events = film.events!;
  const collapse = events.find(({kind}) => kind === 'collapse')!;
  const bind = events.find(({kind}) => kind === 'bind')!;
  const impactFrame = contactFrame(collapse);
  assert.equal(worldAt(events, impactFrame - 1).sink, 0);
  assert.equal(worldAt(events, impactFrame).collision, 1);
  assert(worldAt(events, impactFrame + 10).sink > 0);
  assert.equal(worldAt(events, film.shots[5].start).sink, 1);
  assert(worldAt(events, film.shots[5].start).level < -1);
  assert(worldAt(events, film.frames - 1).level > -.2);
  assert.equal(worldAt(events, contactFrame(bind) + 36).rotation, worldAt(events, contactFrame(bind) + 50).rotation);
  const cues = worldFoley(film);
  assert.equal(cues.find(({kind}) => kind === 'deck-impact')?.frame, impactFrame);
  assert.equal(cues.find(({kind}) => kind === 'drill-bind')?.frame, contactFrame(bind));
  assert.equal(cues.find(({kind}) => kind === 'rotary-motor')?.length,
    contactFrame(bind) - events.find(({kind}) => kind === 'motor')!.frame + 13);
  for (const cue of cues) {
    assert(cue.length > 0);
    const sample = spatialize(foley(cue.kind, 53, cue.phase), 4000, .18);
    const energy = Array.from({length: 18_000}, (_, i) => sample(i / 48_000));
    assert(energy.every(Number.isFinite));
    assert(energy.some((value) => Math.abs(value) > .015), cue.kind);
  }
});

test('footfalls coincide with stance contacts on the accelerated run path', () => {
  const walk = {kind: 'walk', frame: 150, duration: 3} as const;
  const run = {...walk, kind: 'run'} as const;
  assert.equal(gaitAt(run, run.frame).distance, 0);
  assert(gaitAt(run, run.frame + 10).distance < gaitAt(walk, walk.frame + 10).distance);
  assert.equal(gaitAt(run, run.frame + 90).distance, 1);
  assert(footfalls(run).length > footfalls(walk).length);
  for (const frame of footfalls(run)) {
    assert(Math.floor(gaitAt(run, frame).phase * 2) > Math.floor(gaitAt(run, frame - 1).phase * 2));
  }
});

test('a dropped prop accelerates downward and its Foley lands with the visible prop', () => {
  const shot = film.shots[2];
  const drop = shot.actions.find(({kind}) => kind === 'drop')!;
  const tool = shot.scene.props.find(({id}) => id === drop.target)!;
  if (!('to' in drop)) throw new Error('Drop needs a destination');
  const landing = landingFrame(drop);
  const halfway = propAt(tool.at, [drop], (landing + drop.frame) / 2);
  assert(Math.abs(halfway[1] - (tool.at[1] + (drop.to[1] - tool.at[1]) / 4)) < 1e-9);
  assert.deepEqual(propAt(tool.at, [drop], landing + 60), drop.to);
  assert.equal(worldFoley(film).find(({origin}) => origin === tool.id)?.frame, landing);
});

test('the canal motion goes through zero without a jump at reversal', () => {
  const events = film.events!;
  const reverse = events.find(({kind}) => kind === 'reverse')!;
  const before = worldAt(events, reverse.frame - 1).canalTravel;
  const onset = worldAt(events, reverse.frame).canalTravel;
  const next = worldAt(events, reverse.frame + 1).canalTravel;
  assert(before > onset && onset > next);
  assert(Math.abs((onset - before) - (next - onset)) < .002);
  const later = reverse.frame + reverse.length;
  assert(worldAt(events, later + 1).canalTravel > worldAt(events, later).canalTravel);
});
