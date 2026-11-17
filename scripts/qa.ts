import {readFile} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {inspectVideo} from '../src/qa/report';
import type {Film} from '../src/story/timeline';

const video = resolve(process.argv[2] ?? 'out/foucault-floor/preview/short.mp4');
const base = dirname(video);
const data = JSON.parse(await readFile(process.argv[3] ?? join(base, 'storyboard.json'), 'utf8')) as {
  film: Film; frames: number; width: number; height: number;
};
const report = await inspectVideo({...data, video, dir: join(base, 'qa'), voice: join(base, 'voice.wav'), semantic: true});
console.log(`QA ${report.passed ? 'passed' : 'failed'}: ${join(base, 'qa', 'report.md')}`);
if (!report.passed) process.exitCode = 1;
