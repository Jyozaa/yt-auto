import {readFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {parseArgs} from 'node:util';
import {storySchema} from '../src/story/schema';
import {produce} from '../src/render/produce';

const {positionals, values} = parseArgs({allowPositionals: true, options: {
  preview: {type: 'boolean'}, output: {type: 'string'}, stills: {type: 'boolean'}
}});
if (positionals.length > 1) throw new Error('Expected one story JSON file');
const story = storySchema.parse(JSON.parse(await readFile(positionals[0] ?? 'examples/foucault.json', 'utf8')));
const dir = resolve(values.output ?? join('out', story.id, values.preview ? 'preview' : 'full'));
const video = await produce(story, dir, Boolean(values.preview), Boolean(values.stills));
console.log(video ?? dir);
