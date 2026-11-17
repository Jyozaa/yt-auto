import {readFile, writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {z} from 'zod';
import {wordsOf, type Story} from '../story/schema';
import {verifyAlignment, type Alignment, type Word} from '../story/timeline';
import {ffmpeg, probe, run} from './process';

const spans = (text: string) => {
  let cursor = 0;
  return wordsOf(text).map((word) => {
    const start = text.indexOf(word, cursor);
    cursor = start + word.length;
    return {word, start, end: cursor};
  });
};

interface VoiceProvider {
  create(story: Story, dir: string): Promise<{raw: string; words: Word[]; provider?: string}>;
}

const python = process.env.PYTHON || (existsSync('.venv/bin/python') ? '.venv/bin/python' : 'python3.12');
const kokoro: VoiceProvider = {
  async create(story, dir) {
    const path = join(dir, 'kokoro-input.json');
    const raw = join(dir, 'raw-voice.wav');
    const beats = story.beats.map(({text}) => {
      const tokens = spans(text);
      return tokens.map(({word, start, end}, i) => ({
        word,
        before: text.slice(tokens[i - 1]?.end ?? 0, start),
        after: i === tokens.length - 1 ? text.slice(end) : ''
      }));
    });
    await writeFile(path, JSON.stringify({beats}));
    try {
      const {stdout} = await run(python, ['scripts/kokoro_voice.py', path, raw]);
      const result = z.object({voice: z.string(), speed: z.number(), method: z.string(),
        words: z.array(z.object({word: z.string(), start: z.number(), end: z.number(), rms: z.number()}))
      }).parse(JSON.parse(stdout.toString()));
      const {words, ...metadata} = result;
      await writeFile(join(dir, 'voice-alignment.json'), JSON.stringify({
        ...metadata, minWordRms: Math.min(...words.map((word) => word.rms))
      }, null, 2));
      return {raw, words, provider: `kokoro:${result.voice}`};
    } catch (error) {
      throw new Error(`Kokoro narration or offline alignment failed. Check Python 3.12 dependencies, verified assets, and pronunciation. ${String(error)}`);
    }
  }
};

const espeak: VoiceProvider = {
  async create(story, dir) {
    const raw = join(dir, 'raw-voice.wav');
    const script = join(dir, 'narration-input.json');
    const words = spans(story.narration);
    await writeFile(script, JSON.stringify({text: story.narration}));
    const {stdout} = await run(process.env.PYTHON ?? 'python3', ['scripts/espeak-voice.py', script, raw]);
    const marks = JSON.parse(stdout.toString()) as [number, number][];
    const duration = Number((await probe(raw)).format.duration);
    const anchors = new Set<number>();
    let offset = 0;
    for (const beat of story.beats) {
      for (const index of [0, beat.camera.emphasis ?? 0, ...beat.actions.map((a) => a.word), ...beat.sounds.map((s) => s.word)]) {
        anchors.add(offset + index);
      }
      offset += wordsOf(beat.text).length;
    }
    const measured = words.map(({start, end}) => {
      const left = Array.from(story.narration.slice(0, start)).length;
      const right = Array.from(story.narration.slice(0, end)).length;
      return marks.find(([index]) => index >= left && index < right)?.[1];
    });
    const onsets = words.map(({word}, i) => {
      const start = measured[i];
      if (start !== undefined) return {word, start};
      const prev = measured[i - 1];
      const next = measured[i + 1];
      if (anchors.has(i) || !/^(the|a|an|of|to|and)$/i.test(word) || prev === undefined || next === undefined || next - prev > .55) {
        throw new Error(`eSpeak did not report a reliable onset for "${word}" at word ${i}. Use aligned voice file or timestamped TTS.`);
      }
      // eSpeak sometimes folds an unstressed article into the preceding word.
      return {word, start: Math.max(prev + .02, next - .075)};
    });
    return {raw, words: onsets.map((word, i) => ({...word, end: onsets[i + 1]?.start ?? duration - .045}))};
  }
};

const vendorResponse = z.object({
  audio_base64: z.string().min(16),
  alignment: z.object({
    characters: z.array(z.string()), character_start_times_seconds: z.array(z.number()),
    character_end_times_seconds: z.array(z.number())
  })
});

const elevenlabs: VoiceProvider = {
  async create(story, dir) {
    const {ELEVENLABS_API_KEY: key, ELEVENLABS_VOICE_ID: voice} = process.env;
    if (!key || !voice || !/^[a-z0-9_-]{3,90}$/i.test(voice)) throw new Error('Configure ElevenLabs API key and voice ID');
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}/with-timestamps?output_format=mp3_44100_128`, {
      method: 'POST', signal: AbortSignal.timeout(120_000),
      headers: {'xi-api-key': key, 'content-type': 'application/json'},
      body: JSON.stringify({text: story.narration, model_id: process.env.ELEVENLABS_MODEL ?? 'eleven_multilingual_v2'})
    });
    if (!response.ok) throw new Error(`ElevenLabs synthesis failed (HTTP ${response.status})`);
    const {audio_base64, alignment} = vendorResponse.parse(await response.json());
    const {characters, character_start_times_seconds: starts, character_end_times_seconds: ends} = alignment;
    if (characters.join('') !== story.narration || starts.length !== characters.length || ends.length !== characters.length) {
      throw new Error('ElevenLabs timings do not match the submitted narration');
    }
    const raw = join(dir, 'raw-voice.mp3');
    await writeFile(raw, Buffer.from(audio_base64, 'base64'));
    return {raw, words: spans(story.narration).map(({word, start, end}) => ({word,
      start: starts[Array.from(story.narration.slice(0, start)).length],
      end: ends[Array.from(story.narration.slice(0, end)).length - 1]
    }))};
  }
};

export async function createVoice(story: Story, dir: string, enforceRuntime = true) {
  const output = join(dir, 'voice.wav');
  const name = process.env.TTS_PROVIDER || 'kokoro';
  let alignment: Alignment;
  if (name === 'file') {
    const {VOICE_FILE: path, WORDS_FILE: timing} = process.env;
    if (!path || !timing) throw new Error('File voice requires VOICE_FILE and WORDS_FILE');
    alignment = verifyAlignment(story, JSON.parse(await readFile(timing, 'utf8')), enforceRuntime);
    await ffmpeg(['-v', 'error', '-i', path, '-ar', '48000', '-ac', '1', output]);
    const duration = Number((await probe(output)).format.duration);
    if (Math.abs(duration - alignment.duration) > .04) throw new Error('Supplied voice duration differs from its alignment');
    alignment = {...alignment, provider: 'file', duration};
  } else {
    const provider = name === 'kokoro' ? kokoro :
      name === 'espeak' || name === 'local' ? espeak : name === 'elevenlabs' ? elevenlabs : undefined;
    if (!provider) throw new Error(`Unknown TTS_PROVIDER ${name}`);
    const {raw, words, provider: label} = await provider.create(story, dir);
    await ffmpeg(['-v', 'error', '-i', raw, '-ar', '48000', '-ac', '1', output]);
    const duration = Number((await probe(output)).format.duration);
    alignment = {provider: label ?? (name === 'local' ? 'espeak' : name), duration, words};
  }
  verifyAlignment(story, alignment, enforceRuntime);
  await writeFile(join(dir, 'words.json'), JSON.stringify(alignment, null, 2));
  return {alignment, output};
}
