# Architecture

## Storyboard

The version 1 Zod schema is the input contract. [The Foucault package](../examples/foucault.json) is a complete example. Each beat has narration, claim IDs, an environment reference, a camera path, and word-indexed actions and sounds. The schema checks citation references and requires two distinct citation URLs for a claim marked high-risk. The story author supplies the evidence and checks that it supports the narration. Production asserts structural consistency without fetching citation URLs or authoring new research.

The voice provider generates a track and ordered word timings. ElevenLabs provides character timings, which are checked against the original script and grouped into words. The local eSpeak NG provider reads the synthesizer's own events. It approximates the onset of a few fused function words when adjacent measured words bound the gap. Beats and cues always need a measured onset. Word ends in local speech fall at the next onset. An external recording can use `TTS_PROVIDER=file` with `VOICE_FILE` and a pre-aligned `WORDS_FILE` whose top-level keys are `provider`, `duration`, and `words` (objects with `word`, `start`, and `end` in seconds). Synthesis is time-stretched to the story's target using FFmpeg atempo, with an allowed factor of 0.68 to 1.40.

Scene boundaries follow the first aligned word of each beat. The compiler schedules acting cues one frame early where the shot boundary permits. SFX use the nearest frame. On a dissolve, the outgoing pose holds for seven frames while the incoming scene animates. Camera movement uses a continuous push, smootherstep glide, or word-triggered whip. Impact cues add a seven-frame decaying roll.

## Scene vocabulary

| Field | Supported values |
| --- | --- |
| Environments | `rotunda`, `terrace`, `workshop`, `diagram` |
| Lighting | `day`, `golden` |
| Props | `pendulum`, `swing`, `turntable`, `globe`, `bench`, `crate`, `tree`, `lamp`, `plinth` |
| Wardrobe | `waistcoat`, `workcoat`, `dress`, with configurable colours and height |
| Actor actions | `walk`, `point`, `lean`, `react` |
| Prop actions | `swing` for pendulum or swing, `trace` for pendulum, `spin` for globe or turntable |
| Sounds | `step`, `impact`, `whoosh`, `chime`, `scrape` |

Positions are metres in a right-handed Three.js world. Y is up. Start at ground Y = 0 and compose most shots looking toward negative Z. Terrace flooring is raised by 0.19 m. Place actors and props on their supporting surfaces. `camera.from` and `camera.to` are lens positions. `camera.look` and optional `lookTo` are view targets. `focusTo` shifts lens focus independently. Keep actor feet out of the apparatus and inspect the start, middle, and end of a moving shot.

World assemblies and textures are procedural. The renderer uses camera-facing Canvas2D actors with lit cutout materials and ground contact shadows. The pass order is world render, normal/depth ink, two depth-aware lens passes, HDR bloom, Neutral tone map, then display grade. Character cards carry their own outlines and skip the world ink pass. Animation is a direct function of the frame index.

The library handles the catalog above. Descriptions explain staging to a human or verifier. Rendering consumes the structured placements and actions. Add a geometry builder and schema entry for a new unsupported prop or setting.

## Audio and QA

The mixer synthesizes an original plucked score, room tone, footfalls, and cues. Word spans duck the music. FFmpeg compresses narration and normalizes the mix to −14.5 LUFS with a −1.7 dBTP mix ceiling before AAC. The exported track must stay below −1 dBTP and within −16 to −13 LUFS. QA checks stream count, duration, frame count, black frames, flashes, freezes, exposure extremes, silent spans and loudness. Reports include per-frame measurements, per-shot statistics, and contact sheets.

The reference reports target continuous movement, daylight median luminance around 0.57, plum character ink and world ink before lens blur. The seven reviewer roles cover camera, characters, geometry, materials, lighting, post-processing and narrative. `report.json` maps measured properties such as motion and luminance to representative frames. A human can use the same seven criteria in `src/qa/review.ts`. The automated measurements establish technical acceptance. They leave visual interpretation and factual adequacy to the reviewer.

For an optional semantic verifier, configure `VISION_ENDPOINT` with a trusted HTTPS endpoint and optional bearer `VISION_API_KEY`. The adapter sends `{role, criteria, beat, scene, images}`, where `images` contains three base64 JPEGs. Respond with `{severity, findings, repair}`. Severity is `pass`, `review`, or `block`. Repair is `none`, `manual`, or `soften-look`. Blocking lighting and post findings with a soften-look repair can trigger selective re-rendering at reduced grade strength and blur. The repaired ranges, including affected dissolves, replace only those shots in the timeline. QA evaluates the resulting MP4 and saves a before/after comparison. Set `QA_REPAIR_ATTEMPTS` from 0 to 2. Other failures return diagnostics.

## Runner targets

The macOS GPU path uses installed Chrome with ANGLE. The GitHub Linux jobs default to software WebGL using SwiftShader. Temp bundles and encoder files live under a run-owned directory and are removed after normal exit and handled failure. Use a local disk with at least 8 GiB free for HD and 2K, or at least 2 GiB for previews. The renderer checks system memory, Linux available memory, and cgroup memory limits where present. Start with `RENDER_CONCURRENCY=2` for 2K, then tune with actual runner measurements.

If the Linux 2K job reaches its memory or time limit, retain the issue's diagnostics, set `FINAL_WIDTH=1080` or lower `RENDER_MSAA`, and retry the same issue before the upload barrier. To use a GPU-backed runner, register a runner for the repository, install FFmpeg and a compatible Chrome, replace the trusted production job's `runs-on` with its label, and set `RENDER_GL=egl` or `angle` as appropriate. Preserve the same queue, artifact and upload steps.
