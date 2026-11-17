# Architecture

## Storyboard

New submissions use the version 2 Zod schema. [The Foucault package](../examples/foucault.json) is a complete example. Each beat has narration, an intended visual, claim IDs, an environment reference, a camera path, and word-indexed actions and sounds. The schema checks citation references and requires two distinct citation URLs for a claim marked high-risk. The story author supplies the evidence and checks that it supports the narration. The structural audit checks the script before voice synthesis. `STORY_REVIEW_ENDPOINT` can supply an additional model evaluation using the rubric and request shape in [`src/story/quality.ts`](../src/story/quality.ts). The model report includes scores from 1–5, findings, and required changes. Any required change or score below 3 blocks the render. The producer does not fetch citations or generate research.

### Narration

Kokoro-82M synthesizes sentence-aware chunks locally with a CPU ONNX export. Model-native token durations map each original script word to first and last speech phonemes, including words expanded into multiple tokens. The adapter checks that durations cover the exact synthesized phoneme sequence, validates signal energy per word, and verifies the final word sequence and bounds against the WAV. Short edge fades and punctuation pauses join the chunks. The measured narration controls the runtime. Production accepts 55–70 seconds, and `--voice-only` allows comparisons outside that range. Action cues land one frame before the nearest onset frame when the shot boundary allows. Effects land on the nearest onset frame.

`KOKORO_VOICE` selects `am_fenrir`, `am_michael`, or `bm_george`. The sample uses `am_fenrir` at a configurable `KOKORO_SPEED` of 1.07 within the allowed 0.92–1.10 range. It delivers the sample within the production window at the comparison speed. Edit [`config/pronunciations.json`](../config/pronunciations.json) to supply speakable aliases for difficult words. Integers, years, ordinals, decimals and common measurement suffixes can be expanded. Spell out ambiguous numeric expressions when authoring. Use `PYTHON` to override the default `.venv/bin/python` or `python3.12` executable.

The [model manifest](../config/voice-models.json) pins the release and SHA-256 digests. Downloads are verified before entering `.cache/voice-models` or `VOICE_MODEL_DIR`. Budget roughly 140 MiB for the two files and 1 GiB of disk for the Python environment and model. See [attribution](attribution.md) for redistribution information. GitHub Actions caches the two verified assets. A Kokoro error aborts production and leaves a diagnostic.

`TTS_PROVIDER=elevenlabs` uses its character timestamps and groups them into words. `TTS_PROVIDER=espeak` is an explicit developer fallback that uses synthesizer events. An external recording can use `TTS_PROVIDER=file` with `VOICE_FILE` and `WORDS_FILE`. Its timing JSON has `provider`, `duration`, and a `words` array of `{word, start, end}` objects in seconds.

Scene boundaries follow the first aligned word of each beat. The compiler schedules acting cues one frame early where the shot boundary permits. SFX use the nearest frame. On a dissolve, the outgoing pose holds for seven frames while the incoming scene animates. Camera movement uses a continuous push, smootherstep glide, or word-triggered whip. Impact cues add a seven-frame decaying roll.

## Scene vocabulary

| Field | Supported values |
| --- | --- |
| Environments | `rotunda`, `terrace`, `workshop`, `diagram`, `street`, `gallery` |
| Lighting | `day`, `golden` |
| Props | `pendulum`, `swing`, `turntable`, `globe`, `bench`, `crate`, `tree`, `lamp`, `plinth`, `arch`, `gear`, `cart`, `rail`, `barrel`, `worktable`, `telescope` |
| Wardrobe | `waistcoat`, `workcoat`, `dress`, with configurable colours and height |
| Actor actions | `walk`, `point`, `lean`, `react`, `shrug`, `inspect`, `flinch`, `nod` |
| Prop actions | `swing` for pendulum or swing, `trace` for pendulum, `spin` for globe, turntable or gear, `roll` for cart |
| Sounds | `step`, `step-wood`, `step-stone`, `step-earth`, `impact`, `wood-hit`, `metal-hit`, `stone-hit`, `whoosh`, `chime`, `scrape`, `door`, `machine`, `creak`, `snap`, `splash`, `wind`, `reaction` |

Positions are metres in a right-handed Three.js world. Y is up. Start at ground Y = 0 and compose most shots looking toward negative Z. Terrace flooring is raised by 0.19 m. Place actors and props on their supporting surfaces. `camera.from` and `camera.to` are lens positions. `camera.look` and optional `lookTo` are view targets. `focusTo` shifts lens focus independently. Keep actor feet out of the apparatus and inspect the start, middle, and end of a moving shot.

World assemblies and textures are procedural. The renderer uses camera-facing Canvas2D actors with lit cutout materials and ground contact shadows. The pass order is world render, normal/depth ink, two depth-aware lens passes, HDR bloom, Neutral tone map, then display grade. Character cards carry their own outlines and skip the world ink pass. Animation is a direct function of the frame index.

The library handles the catalog above. Descriptions explain staging to a human or verifier. Rendering consumes the structured placements and actions. Add a geometry builder and schema entry for a new unsupported prop or setting.

## Audio and QA

The mixer scores each narrative section with its own tempo, instrumentation and dynamic envelope. Impact cues leave space in the score. Walk cycles generate surface-specific footfalls. The mixer adds environment ambience, pans effects, and ducks music under speech with attack and release envelopes. It saves `voice-stem.wav`, `music.wav`, `effects.wav`, `mix.wav`, and `cues.json`. FFmpeg compresses narration and normalizes the mix to −14.5 LUFS with a −1.7 dBTP mix ceiling before AAC. The exported track must stay below −1 dBTP and within −16 to −13 LUFS. QA checks stream count, duration, frame count, black frames, flashes, freezes, exposure extremes, dissolves, silent spans, isolated narration clicks and loudness.

The reference reports target continuous movement, daylight median luminance around 0.57, plum character ink and world ink before lens blur. The eight reviewer roles cover camera, characters, geometry, materials, lighting, post-processing, narrative and continuity. `report.json` maps motion and luminance to representative frames. The technical checks and semantic reviewer each report their own results.

For a semantic verifier, configure `VISION_ENDPOINT` with a trusted HTTPS endpoint and optional bearer `VISION_API_KEY`. The adapter sends `{role, criteria, beat, visual, scene, shot, images}`. Images are three base64 JPEGs for each shot, with the previous shot's last sample added for continuity. Respond with `{severity, findings, repair, fix?}`. Severity is `pass`, `review`, or `block`. Repair is `none`, `manual`, or `soften-look`. Blocking lighting and post findings with a soften-look repair can trigger selective re-rendering at reduced grade strength and blur. The repaired ranges, including affected dissolves, replace only those shots in the timeline. QA evaluates the resulting MP4 and saves a before/after comparison. Set `QA_REPAIR_ATTEMPTS` from 0 to 2. An unconfigured service is reported as `unavailable`. A configured service error blocks approval and is recorded in `report.json`.

## Runner targets

The macOS GPU path uses installed Chrome with ANGLE. The GitHub Linux jobs default to software WebGL using SwiftShader. Temp bundles and encoder files live under a run-owned directory and are removed after normal exit and handled failure. Use a local disk with at least 8 GiB free for HD and 2K, or at least 2 GiB for previews. The renderer checks system memory, Linux available memory, and cgroup memory limits where present. Start with `RENDER_CONCURRENCY=2` for 2K, then tune with actual runner measurements.

If the Linux 2K job reaches its memory or time limit, retain the issue's diagnostics, set `FINAL_WIDTH=1080` or lower `RENDER_MSAA`, and retry the same issue before the upload barrier. To use a GPU-backed runner, register a runner for the repository, install FFmpeg and a compatible Chrome, replace the trusted production job's `runs-on` with its label, and set `RENDER_GL=egl` or `angle` as appropriate. Preserve the same queue, artifact and upload steps.
