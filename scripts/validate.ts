import {readFile} from 'node:fs/promises';
import {storySchema, wordsOf} from '../src/story/schema';

const story = storySchema.parse(JSON.parse(await readFile(process.argv[2] ?? 'examples/foucault.json', 'utf8')));
console.log(`${story.id}: ${story.beats.length} beats, ${wordsOf(story.narration).length} words, ${story.duration}s target`);
