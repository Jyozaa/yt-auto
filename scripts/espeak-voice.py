"""Render English narration and collect word onset events from libespeak-ng."""
import ctypes as C
from ctypes.util import find_library
import json
import os
from pathlib import Path
import sys
import wave


class Event(C.Structure):
    _fields_ = [
        ("type", C.c_int), ("identifier", C.c_uint), ("position", C.c_int),
        ("length", C.c_int), ("ms", C.c_int), ("sample", C.c_int),
        ("user", C.c_void_p), ("data", C.c_uint64),
    ]


def synthesize(text, output):
    library = os.environ.get("ESPEAK_LIBRARY") or find_library("espeak-ng")
    if not library and sys.platform == "darwin":
        library = "/opt/homebrew/lib/libespeak-ng.dylib" if Path("/opt/homebrew").exists() else "/usr/local/lib/libespeak-ng.dylib"
    if not library:
        raise RuntimeError("Install libespeak-ng or set ESPEAK_LIBRARY")
    speech = C.CDLL(library)
    data = os.environ.get("ESPEAK_DATA_PARENT")
    if not data and sys.platform == "darwin":
        prefix = "/opt/homebrew" if Path("/opt/homebrew").exists() else "/usr/local"
        data = prefix + "/opt/espeak-ng/share"
    rate = speech.espeak_Initialize(2, 0, os.fsencode(data) if data else None, 0x8000)
    if rate <= 0 or speech.espeak_SetVoiceByName(b"en") != 0:
        raise RuntimeError("Could not initialize the English eSpeak NG voice")
    speech.espeak_SetParameter(1, 215, 0)  # words per minute
    onsets = []
    chunks = []
    callback = C.CFUNCTYPE(C.c_int, C.POINTER(C.c_short), C.c_int, C.POINTER(Event))

    @callback
    def receive(samples, count, events):
        if samples and count > 0:
            chunks.append(C.string_at(samples, count * 2))
        if events:
            i = 0
            while events[i].type:
                event = events[i]
                if event.type == 1 and event.length > 0:
                    onsets.append([event.position - 1, event.ms / 1000])
                i += 1
        return 0

    speech.espeak_SetSynthCallback(receive)
    utf8 = text.encode("utf-8")
    speech.espeak_Synth.argtypes = [C.c_char_p, C.c_size_t, C.c_uint, C.c_int,
                                   C.c_uint, C.c_uint, C.c_void_p, C.c_void_p]
    if speech.espeak_Synth(utf8, len(utf8) + 1, 0, 1, 0, 1, None, None) != 0 or not chunks:
        raise RuntimeError("eSpeak NG failed to produce narration")
    speech.espeak_Terminate()
    with wave.open(output, "wb") as wav:
        wav.setparams((1, 2, rate, 0, "NONE", "not compressed"))
        wav.writeframes(b"".join(chunks))
    print(json.dumps(onsets))


if __name__ == "__main__":
    payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    synthesize(payload["text"], sys.argv[2])
