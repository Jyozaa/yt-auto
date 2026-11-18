// Build a Remotion storyboard for front/profile and locomotion comparisons.
import {readFile, writeFile} from 'node:fs/promises';
import {storySchema, type FacialCue, type Story} from '../src/story/schema';
import type {Film, Shot} from '../src/story/timeline';

const source = process.argv[2] ?? 'examples/lake-peigneur-1980.json';
const output = process.argv[3] ?? 'out/acting-study.json';
const story = storySchema.parse(JSON.parse(await readFile(source, 'utf8')));
if (!story.characters.length) throw new Error('An acting study needs at least one character.');

const shots: Shot[] = [];
const hair: {id: string; style: string; view: 'front' | 'side'; frame: number}[] = [];
const expressions: {expression: FacialCue['expression']; frame: number}[] = [];
let frames = 0;

function add(character: Story['characters'][number], duration: number, view: 'front' | 'side',
  movement?: 'walk' | 'run') {
  const scene: Story['scenes'][number] = {
    id: character.id, description: 'Character study', environment: 'diagram', light: 'day', props: [],
    actors: [{id: character.id, at: [movement ? -1.39 : 0, 0, 0], facing: 'right',
      character: character.id, view, look: 'neutral'}]
  };
  const camera: Shot['beat']['camera'] = movement ?
    {from: [0, 1.6, 6.1], to: [.05, 1.61, 6.15], look: [0, .93, 0], motion: 'glide', fov: 52, blur: 0, roll: 0} :
    {from: [.02, 1.52, 2.15], to: [.05, 1.49, 2.12], look: [0, character.height * .76, 0], motion: 'push', fov: 38, blur: 0, roll: 0};
  const shot: Shot = {start: frames, end: frames + duration, scene, emphasis: -1, sounds: [], actions: [],
    beat: {...story.beats[0], scene: scene.id, camera, events: undefined, acting: undefined, actions: [], sounds: []}};
  if (movement) shot.actions.push({target: character.id, word: 0, frame: frames + 6, duration: movement === 'walk' ? 2.43 : 1.55,
    kind: movement, to: [1.39, 0, 0]});
  shots.push(shot);
  frames += duration;
  return shot;
}

const studyExpressions: FacialCue['expression'][] = ['concentrate', 'confused', 'curious', 'doubt',
  'shock', 'fear', 'concern', 'disbelief', 'nervous-laugh', 'sarcasm', 'relief', 'grin'];
for (const [i, character] of story.characters.entries()) {
  for (const view of ['front', 'side'] as const) {
    const shot = add(character, 24, view);
    shot.faces = [{actor: character.id, frame: shot.start, duration: .8, length: 24, word: 0, expression: studyExpressions[(i * 2) % studyExpressions.length],
      eyes: [.2, -.15], blink: 'open', tilt: i % 2 ? -6 : 5}];
    hair.push({id: character.id, style: character.hairStyle ?? 'legacy', view, frame: shot.start + 12});
  }
}
const lead = story.characters[0];
const face = add(lead, studyExpressions.length * 22, 'front');
face.faces = studyExpressions.map((expression, i) => {
  const frame = face.start + i * 22;
  expressions.push({expression, frame: frame + 12});
  return {actor: lead.id, expression, frame, word: 0, duration: 22 / 30, length: 22,
    blink: 'blink', eyes: [i % 2 ? -.54 : .62, i < 4 ? .46 : -.2], tilt: [-5, 9, -9, 3][i % 4]};
});
const walk = add(lead, 84, 'side', 'walk');
const run = add(lead, 78, 'side', 'run');
const film: Film = {story, shots, frames};
await writeFile(output, JSON.stringify({film, frames, hair, expressions, gait: [walk.start, run.end - 1]}, null, 2));
