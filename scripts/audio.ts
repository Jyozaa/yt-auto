import {mkdir, readFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {createMix} from '../src/audio/mix';
import {createVoice} from '../src/audio/voice';
import {storySchema} from '../src/story/schema';
import {compile} from '../src/story/timeline';

const voiceOnly = process.argv.includes('--voice-only');
const args = process.argv.slice(2).filter((arg) => arg !== '--voice-only');
const story = storySchema.parse(JSON.parse(await readFile(args[0] ?? 'examples/foucault.json', 'utf8')));
const dir = resolve(args[1] ?? join('out', story.id, 'audio'));
await mkdir(dir, {recursive: true});
const voice = await createVoice(story, dir, !voiceOnly);
if (voiceOnly) {
  console.log(`Generated ${voice.output} (${voice.alignment.provider}, ${voice.alignment.duration.toFixed(2)}s)`);
} else {
  const film = compile(story, voice.alignment);
  const mix = await createMix(film, voice.alignment, voice.output, film.frames, dir);
  console.log(`Generated ${voice.output}, ${join(dir, 'words.json')} and ${mix}`);
}
