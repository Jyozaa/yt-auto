# Phase 2 verification

The Foucault sample passed the version 2 structural audit with a 12-word hook, three escalation beats and a 210-word script. The 1851 demonstration and the physical explanation are linked to the [Panthéon account](https://www.paris-pantheon.fr/en/discover/foucault-s-pendulum) and [Foucault’s paper](https://zenodo.org/records/2429355).

## Narration and mix

| Narrator | Narration duration for the same script |
| --- | ---: |
| Kokoro `am_fenrir` | 66.37 s |
| Kokoro `am_michael` | 75.14 s |
| Kokoro `bm_george` | 81.09 s |
| eSpeak NG | 54.78 s |

Kokoro comparisons used 1.07× synthesis speed. `am_fenrir` fit the 55–70 s window at that speed. Its first model-aligned word begins at 15 ms. All 210 words had ordered timings and measurable waveform energy. The sample’s authored actions start within two frames of the target model onsets. Authored sound cues fall within half a frame. The full mix and three stems match the frame-aligned production duration. Comparative listening and independent phonetic timing measurements remain open.

## Rendering

The benchmark rendered the same 72 frames around the first dissolve on macOS with 16 GiB RAM and about 52 GiB free. It excludes audio synthesis. Wall time includes bundle and browser setup. RSS is sampled across the process tree. The test used MSAA 0 and concurrency 3 below HD or 2 at HD and above. SSIM compares the downscaled clips to the 360-wide output.

| Raster | Wall time | Peak RSS | MP4 | SSIM |
| --- | ---: | ---: | ---: | ---: |
| 360 × 640 | 15.8 s | 2.12 GB | 0.40 MB | Reference |
| 720 × 1280 | 9.1 s | 2.12 GB | 0.69 MB | 0.964 |
| 1080 × 1920 | 7.9 s | 1.85 GB | 1.63 MB | 0.959 |
| 1440 × 2560 | 8.3 s | 2.12 GB | 2.36 MB | 0.955 |

The full 1080 × 1920 and 1440 × 2560 exports both passed technical QA at 30 fps with 1,991 frames and a 66.37 s runtime. Both measured −14.6 LUFS, with true peaks of −1.7 dBTP at 1080 and −1.6 dBTP at 1440. A 15 s preview also passed. A synthetic black and static clip was rejected. A simulated blocking vision response exercised the selective re-render path, generated a before/after report, and passed after the affected shot was replaced.

The Codex still review spotted swing supports slanting away from their crossbar and a partially obscured turntable at the story’s reveal. The sample now joins the supports at the bar and tilts the camera toward a visible stripe rotating on the turntable. Contact sheets record the result. The external vision service remains optional and requires a configured endpoint.
