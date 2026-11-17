import {readFile, writeFile} from 'node:fs/promises';
import {storySchema} from '../src/story/schema';
import {auditStory} from '../src/story/quality';

const path = process.argv[2] ?? 'examples/foucault.json';
const story = storySchema.parse(JSON.parse(await readFile(path, 'utf8')));
const report = await auditStory(story);
const json = JSON.stringify(report, null, 2);
if (process.argv[3]) await writeFile(process.argv[3], json);
console.log(json);
if (!report.passed) process.exitCode = 1;
