import {readFile, writeFile} from 'node:fs/promises';
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
  create(story: Story, dir: string): Promise<{raw: string; words: Word[]}>;
}

const local: VoiceProvider = {
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

export async function createVoice(story: Story, dir: string) {
  const output = join(dir, 'voice.wav');
  const name = process.env.TTS_PROVIDER ?? 'local';
  let alignment: Alignment;
  if (name === 'file') {
    const {VOICE_FILE: path, WORDS_FILE: timing} = process.env;
    if (!path || !timing) throw new Error('File voice requires VOICE_FILE and WORDS_FILE');
    alignment = verifyAlignment(story, JSON.parse(await readFile(timing, 'utf8')));
    await ffmpeg(['-v', 'error', '-i', path, '-ar', '48000', '-ac', '1', output]);
    const duration = Number((await probe(output)).format.duration);
    if (Math.abs(duration - alignment.duration) > .04) throw new Error('Supplied voice duration differs from its alignment');
    alignment = {...alignment, provider: 'file', duration};
  } else {
    const provider = name === 'local' ? local : name === 'elevenlabs' ? elevenlabs : undefined;
    if (!provider) throw new Error(`Unknown TTS_PROVIDER ${name}`);
    const {raw, words} = await provider.create(story, dir);
    const rawDuration = Number((await probe(raw)).format.duration);
    const speed = rawDuration / story.duration;
    if (!Number.isFinite(speed) || speed < .68 || speed > 1.40) throw new Error(`Narration pace requires excessive time stretch (${speed})`);
    await ffmpeg(['-v', 'error', '-i', raw, '-af', `atempo=${speed},apad,atrim=duration=${story.duration}`, '-ar', '48000', '-ac', '1', output]);
    alignment = {provider: name, duration: story.duration, words: words.map(({word, start, end}) => ({
      word, start: start / speed, end: Math.min(story.duration, end / speed)
    }))};
  }
  verifyAlignment(story, alignment);
  await writeFile(join(dir, 'words.json'), JSON.stringify(alignment, null, 2));
  return {alignment, output};
}
