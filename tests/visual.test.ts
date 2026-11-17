import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Vector3} from 'three';
import example from '../examples/foucault.json';
import {cameraPose} from '../src/engine/camera/choreography';
import {designHeight, headBlob} from '../src/engine/characters/toon';
import {storySchema, wordsOf} from '../src/story/schema';
import {compile, type Shot} from '../src/story/timeline';

test('the port preserves the source\'s seeded head aspect and adult source proportions', () => {
  for (let seed = 1; seed <= 7; seed++) {
    const head = headBlob(seed, 118);
    assert(head.b / head.a >= .90 && head.b / head.a <= .98);
    assert(Math.abs(designHeight('adult', seed) / (2 * head.b) - 3.5) < 1e-6);
  }
  assert(designHeight('kid') < designHeight());
});

test('story camera keys and effect cards use aligned word frames', () => {
  const story = storySchema.parse(example);
  const words = wordsOf(story.narration);
  const step = 60 / words.length;
  const film = compile(story, {duration: 60, provider: 'fixture',
    words: words.map((word, i) => ({word, start: i * step, end: (i + .9) * step}))});
  const [hook, setting] = film.shots;
  const key = hook.cameraKeys![0];
  assert.equal(key.frame, Math.round(30 * key.word * step));
  const effect = setting.effects![0];
  assert.equal(effect.frame, Math.round(30 * (effect.word + wordsOf(hook.beat.text).length) * step) - 1);

  const target = new Vector3(-1.55, 0, -1.85);
  const track = () => target;
  const legacy: Shot = {...hook, cameraKeys: undefined};
  assert.deepEqual(cameraPose(hook, key.frame, track), cameraPose(legacy, key.frame));
  const settled = key.frame + key.glide!;
  const pose = cameraPose(hook, settled, track);
  assert(pose.look.distanceTo(target.clone().add(new Vector3(...key.look))) < 1e-6);
  assert.equal(pose.blur, key.blur);
  assert.deepEqual(cameraPose(hook, settled, track), pose);
  const cut: Shot = {...hook, cameraKeys: [{...key, cut: true}]};
  assert.equal(cameraPose(cut, key.frame, track).fov, key.fov);
  assert.equal(cameraPose(hook, key.frame, () => target.clone().setX(2)).look.x, cameraPose(legacy, key.frame).look.x);
});

test('camera apertures and keyed cuts reject unknown subjects and reversed cues', () => {
  const story = storySchema.parse(example);
  story.beats[1].camera.keys![0].track = 'missing';
  story.beats[1].camera.keys!.reverse();
  const parsed = storySchema.safeParse(story);
  assert.equal(parsed.success, false);
  if (parsed.success) return;
  assert(parsed.error.issues.some(({message}) => message.includes('unknown scene placement')));
  assert(parsed.error.issues.some(({message}) => message.includes('strictly increasing')));
});
