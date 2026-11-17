# YT-auto

Turn a researched story package into a 55–70-second animated YouTube Short. The renderer stages Canvas2D characters on lit billboards inside a procedural Three.js world. Remotion renders a frame-indexed storyboard. The mix and QA pipeline produce a 9:16 H.264 MP4 with one AAC track.

The sample follows Foucault's demonstration of Earth's rotation. Its seven shots use original characters and geometry, with the historical apparatus and analogy staged at illustrative scale.

## Run locally

Install Node.js 22 or newer, Python 3, FFmpeg with FFprobe, and eSpeak NG. The local voice needs no account or key. On macOS use Homebrew. On Ubuntu use the same packages as the [preview workflow](.github/workflows/preview.yml).

```sh
brew install ffmpeg espeak-ng
npm ci
npm run validate -- examples/foucault.json
npm run preview -- examples/foucault.json
npm run render -- examples/foucault.json
```

The preview is the first 15 seconds at 360 × 640. A full render defaults to 1440 × 2560. Both run at 30 fps. Use `FINAL_WIDTH=1080` for 1080 × 1920. The commands write into `out/foucault-floor/preview` and `out/foucault-floor/full`. Each run leaves the MP4, narration WAV, word timings, compiled storyboard, and QA reports. For a repaired render, `result.json` points at the approved file.

```sh
FINAL_WIDTH=360 npm run render -- examples/foucault.json --stills --output out/stills
npm run audio -- examples/foucault.json
npm run qa -- out/foucault-floor/full/short.mp4
npm run typecheck
npm test
actionlint
```

The audio command generates a reusable voice and timing fixture without opening Chromium. For stills, choose a low `FINAL_WIDTH` and review the representative frame from each shot. The default QA run also extracts three frames per shot and builds a contact sheet.

`CHROME_PATH` overrides the browser executable. The renderer uses installed Google Chrome at its standard path when available. Otherwise Remotion manages Chrome Headless Shell. On macOS, use installed Chrome if the bundled headless shell stalls loading the composition. `RENDER_GL` selects `angle`, `swangle`, or `egl`. `RENDER_CONCURRENCY`, `RENDER_MSAA`, `REMOTION_TMP`, and the width settings control resource use. `.env.example` lists settings. Export variables or use Node's environment-file support in your shell.

## Run on GitHub

- **Checks** runs the credential-free test suite on pushes to `main` and pull requests.
- **Preview render** renders the sample and saves the preview, storyboard, word timings, and QA.
- **Story production** consumes one trusted GitHub Issue on a label event, a manual run, or a three-hour poll. It saves approved video and diagnostic artifacts, then optionally uploads the approved file.

Story research and writing happen outside GitHub Actions. See [story intake](docs/story-intake.md) for the scheduled-task handoff and manual submission. See [YouTube setup](docs/youtube.md) for OAuth and private uploads. Uploading and public release each have an explicit opt-in.

See [architecture](docs/architecture.md) for the asset vocabulary, timing, reviewers, repair behavior, and runner settings. Adapted rendering code comes from [Mr omi's MIT-licensed reference](https://github.com/mromidev/claude-animated-shorts). The [attribution](docs/attribution.md) identifies the reused files.
