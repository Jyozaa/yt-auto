import {mkdir, readFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {createMix} from '../src/audio/mix';
import {createVoice} from '../src/audio/voice';
import {storySchema} from '../src/story/schema';
import {compile} from '../src/story/timeline';

const story = storySchema.parse(JSON.parse(await readFile(process.argv[2] ?? 'examples/foucault.json', 'utf8')));
const dir = resolve(process.argv[3] ?? join('out', story.id, 'audio'));
await mkdir(dir, {recursive: true});
const voice = await createVoice(story, dir);
const film = compile(story, voice.alignment);
const mix = await createMix(film, voice.alignment, voice.output, film.frames, dir);
console.log(`Generated ${voice.output}, ${join(dir, 'words.json')} and ${mix}`);
