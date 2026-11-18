"""Generate speech with Kokoro and align each word to native phoneme durations."""
import json
import os
from pathlib import Path
import re
import sys
import wave

import numpy as np
import onnxruntime as ort
from kokoro_onnx import Kokoro
from num2words import num2words

from voice_assets import ROOT, assets

RATE = 24000
VOICES = {"am_michael": "en-us", "am_fenrir": "en-us", "bm_george": "en-gb"}
UNITS = {"kg": "kilograms", "km": "kilometres", "cm": "centimetres",
         "mm": "millimetres", "m": "metres", "lb": "pounds", "mph": "miles per hour",
         "kmh": "kilometres per hour", "hz": "hertz", "khz": "kilohertz",
         "°c": "degrees Celsius", "°f": "degrees Fahrenheit",
         "s": "seconds", "ms": "milliseconds"}


def normalize(word, prev, dictionary, gap=" "):
    if word.casefold() in dictionary:
        return dictionary[word.casefold()]
    if (gap.strip() in ("", "°") and prev and prev[-1].isdigit()
            and (gap.strip() + word.casefold()) in UNITS):
        return UNITS[gap.strip() + word.casefold()]
    number = re.fullmatch(r"(\d{1,7})(?:(\.\d{1,6})|(st|nd|rd|th))?", word, flags=re.I)
    if not number:
        return word
    digits, fraction, ordinal = number.groups()
    if fraction:
        return num2words(int(digits)) + " point " + " ".join(num2words(int(d)) for d in fraction[1:])
    n = int(digits)
    return num2words(n, to="ordinal" if ordinal else "year" if 1499 < n < 2100 else "cardinal")


def sentence_chunks(beats, dictionary):
    for beat in beats:
        chunk, pending = [], ""
        previous_word = ""
        for entry in beat:
            before, word = entry["before"], entry["word"]
            spoken = normalize(word, previous_word, dictionary, before)
            if previous_word and previous_word[-1].isdigit() and ("°" + word.lower()) in UNITS:
                if before.strip() == "°":
                    before = " "
            previous_word = word
            if chunk and (re.search(r"[.!?][\s\"”’]*$", before) or len(pending) + len(spoken) > 320):
                yield pending + before.rstrip(), chunk, .095 if re.search(r"[.!?]", before) else .065
                chunk, pending = [], ""
                before = ""
            pending += before + spoken
            chunk.append((word, spoken, before))
        if chunk:
            yield pending + beat[-1]["after"], chunk, .115


def make_chunks(beats, dictionary):
    chunk, pending = [], ""
    previous_word = ""
    previous_tail = ""
    for beat in beats:
        for index, entry in enumerate(beat):
            before, word = entry["before"], entry["word"]
            if index == 0 and chunk:
                before = previous_tail + " " + before
            spoken = normalize(word, previous_word, dictionary, before)
            if previous_word and previous_word[-1].isdigit() and ("°" + word.lower()) in UNITS:
                if before.strip() == "°":
                    before = " "
            previous_word = word
            boundary = re.search(r"[.!?][\s\"”’]*$", before)
            if chunk and ((boundary and len(pending) >= 155) or len(pending) + len(spoken) > 300):
                yield pending + before.rstrip(), chunk, .085 if boundary else .035
                chunk, pending = [], ""
                before = ""
            pending += before + spoken
            chunk.append((word, spoken, before))
        previous_tail = beat[-1]["after"]
    if chunk:
        yield pending + previous_tail, chunk, .085


def pronunciation_groups(tokenizer, text, chunk, lang):
    # Keep sentence-context phonemes when the frontend preserves word boundaries.
    # When it joins or splits a word, use explicit per-word phonemes and retain
    # punctuation between them so the ONNX model still infers sentence prosody.
    groups = [tokenizer.phonemize(spoken, lang) for _, spoken, _ in chunk]
    contextual = tokenizer.phonemize(text, lang).split()
    counts = [len(group.split()) for group in groups]
    if any(not count for count in counts):
        raise ValueError("A script word could not be phonemized")
    punctuation = set(",.!?;:—…()“”")
    if len(contextual) == sum(counts) and all(group.strip("".join(punctuation)) for group in contextual):
        cursor = 0
        for count in counts:
            yield " ".join(contextual[cursor:cursor + count])
            cursor += count
        return
    for i, (group, (_, _, before)) in enumerate(zip(groups, chunk)):
        tail = ""
        if i + 1 < len(chunk):
            tail = chunk[i + 1][2]
        else:
            tail = re.search(r"[^\w]+$", text).group(0) if re.search(r"[^\w]+$", text) else ""
        prefix = before if i == 0 else ""
        yield "".join(c for c in prefix if c in punctuation) + group + "".join(c for c in tail if c in punctuation)


def align(kokoro, text, chunk, voice, speed):
    groups = list(pronunciation_groups(kokoro.tokenizer, text, chunk, VOICES[voice]))
    known = [kokoro.tokenizer.known(group) for group in groups]
    phonemes = " ".join(known)
    audio, sr, durations = kokoro.create_timed(phonemes, voice, speed=speed, is_phonemes=True,
                                               trim=False, sentence_pause=.08, clause_pause=.045)
    if sr != RATE or "".join(t.phoneme for t in durations) != phonemes:
        raise ValueError("Kokoro phoneme duration output does not cover the exact synthesized tokens")
    if not np.isfinite(audio).all():
        raise ValueError("Kokoro waveform contains non-finite samples")
    boundaries = []
    cursor = 0
    for (word, _, _), group in zip(chunk, known):
        audible = [timing for timing in durations[cursor:cursor + len(group)]
                   if timing.phoneme.isalpha() or timing.phoneme in "əɪʊɹʃʒθðŋʔ"]
        if not audible:
            raise ValueError(f'No timed speech tokens for "{word}"')
        start, end = audible[0].start, audible[-1].end
        signal = audio[round(start * RATE):round(end * RATE)]
        energy = float(np.sqrt(np.mean(signal * signal))) if len(signal) else 0
        if not np.isfinite(energy) or energy < .0005:
            raise ValueError(f'Timed word "{word}" has no audible signal')
        boundaries.append({"word": word, "start": start, "end": end, "rms": round(energy, 5)})
        cursor += len(group) + 1

    # Trim model padding only outside the first and last speech tokens. A short
    # edge fade keeps joins click-free and never intersects an aligned word.
    first = max(0, round(boundaries[0]["start"] * RATE) - 360)
    last = min(len(audio), round(boundaries[-1]["end"] * RATE) + 600)
    if first >= last:
        raise ValueError("Kokoro produced invalid speech boundaries")
    audio = audio[first:last].copy()
    fade = np.linspace(0, 1, 120, dtype=np.float32)
    audio[:len(fade)] *= fade
    audio[-len(fade):] *= fade[::-1]
    for word in boundaries:
        word["start"] -= first / RATE
        word["end"] -= first / RATE
    return audio, boundaries


def main():
    payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    voice = os.environ.get("KOKORO_VOICE") or "am_fenrir"
    connected = payload.get("delivery") == "connected"
    speed = float(os.environ.get("KOKORO_SPEED") or (1.04 if connected else 1.07))
    if voice not in VOICES or not .92 <= speed <= 1.10:
        raise ValueError(f"Select a supported KOKORO_VOICE ({', '.join(VOICES)}) and speed in 0.92–1.10")
    manifest = assets()
    options = ort.SessionOptions()
    options.intra_op_num_threads = 2
    options.inter_op_num_threads = 1
    providers = ["CPUExecutionProvider"]
    model = ort.InferenceSession(str(manifest["kokoro-v1.0.int8.onnx"]), options, providers=providers)
    kokoro = Kokoro.from_session(model, str(manifest["voices-v1.0.bin"]))
    if not kokoro.has_timings:
        raise ValueError("Kokoro export must return model-native phoneme durations")
    dictionary = json.loads((ROOT / "config" / "pronunciations.json").read_text(encoding="utf-8"))
    chunker = make_chunks if connected else sentence_chunks
    chunks = list(chunker(payload["beats"], dictionary))
    if not chunks:
        raise ValueError("Narration contains no speakable words")
    output = []
    words = []
    offset = 0
    for i, (text, chunk, pause) in enumerate(chunks):
        audio, aligned = align(kokoro, text, chunk, voice, speed)
        for word in aligned:
            words.append({**word, "start": round(offset / RATE + word["start"], 5),
                          "end": round(offset / RATE + word["end"], 5)})
        silence = np.zeros(round((pause if i < len(chunks) - 1 else .16) * RATE), dtype=np.float32)
        output.extend((audio, silence))
        offset += len(audio) + len(silence)
    rendered = np.concatenate(output)
    with wave.open(sys.argv[2], "wb") as stream:
        stream.setparams((1, 2, RATE, 0, "NONE", "not compressed"))
        stream.writeframes((np.clip(rendered, -.999, .999) * 32767).astype("<i2").tobytes())
    print(json.dumps({"voice": voice, "speed": speed, "words": words, "method": "kokoro-phoneme-duration",
                      "phrasing": "connected" if connected else "sentence"}))


if __name__ == "__main__":
    main()
