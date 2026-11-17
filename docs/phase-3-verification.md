# Phase 3 visual verification

The source audit records the port and test targets. The [attribution](attribution.md) identifies the source files, CC0 prop packages and missing inputs.

## Evidence

- `out/phase3/before/preview-720.mp4` is the first 450 frames of the Phase 2 render at `f2f670e`, scaled to 720 × 1280. `out/phase3/after/preview-720.mp4` shows the Phase 3 cut at the same raster and carries the exact same AAC packets for the comparison. The regular Phase 3 preview and full render independently run through production audio.
- `out/phase3/visual-evidence/characters.jpg` and `face-crops.jpg` compare the same characters, positions and lens placement at front, profile and three-quarter settings. The frames are 40, 130, 220, 310, 400, 490, 580, 670 and 760. `gait.jpg` compares frames 817, 824 and 830 on the same profile walk. The older renderer uses its one default drawing angle for these placements.
- `out/phase3/visual-evidence/environments.jpg` compares the same storyboard at frames 232 (street), 478 (hall), and 1194 (workshop). `source-baseline.jpg` documents the authored bridge and `source-motion/visual-clip.mp4` shows its falling cast and deck over 57 frames.
- `out/phase3/delivery-1080/qa` and `delivery-preview-720/qa` contain frame measurements, shot stills, contact sheets and QA findings. A separate frame render reached the same hall frame from the opposite seek order and produced identical PNG bytes.

## Visual findings

| Frames | Finding and correction |
| --- | --- |
| Portrait frames 40–760 | The old cast reused similar smiling faces. The source port shows seeded contour and tilt, full and lidded eyes, distinct profile noses, period clothing, and visibly different stern, neutral, and shock faces. The design uses 3.5 head heights for adults, head axis ratios of 0.908–0.979 across the seven source seeds, and the source plum outline. |
| Profile walk 817, 824, 830 | The profile shows planted stance, articulated knees, an opposing arm swing and a separate airborne foot. The side dress uses the source shaded silhouette at profile width. The production adapter limits extreme stride extension. |
| Foucault hook 72–102 | The first camera revision let the cord cross the visitor’s eyes. The final track puts the camera behind the cord and widens the facial framing. At frame 90 the eyes remain readable and the rear arch softens. |
| Street 232 and hall 478 | Roof slope, raised trim and cobble spacing now convey real depth. Overlapping cylinders broke the hall’s column ink in the first pass. A single fluted surface per shaft removed those intersections. The hall retains repetitive architecture and a few visible trim seams. |
| Workshop 1194 | The rotating marker and its board were both in violet shadow. A higher side key warmed the work surface and the stripe now reads as a painted mark on the rotating disk. |
| Bridge 540, 1045, 1105, 1190, 1510 | The preserved camera table shows the marching column close-up, a bolt and its drawn burst, falling actors, water-level effects and warm/cool sunset separation. The baseline's frame table supplies timing. |

Matched street, hall and workshop median Rec. 709 picture luma changed from 0.572, 0.592 and 0.357 to 0.537, 0.484 and 0.379. Mean channel range changed from 0.280, 0.228 and 0.260 to 0.190, 0.179 and 0.263. The hall remains cooler and darker than the upstream daylight target of about 0.57. Ink uses the source 5.1/3.3 px near/far settings at the 1080-wide reference scaling. Faces and props were inspected in the stills. No automatic artistic acceptance was recorded because the semantic vision service was unconfigured.

## Rendering and sync

| Export | Runtime | Frames | End-to-end local wall time | Technical QA |
| --- | ---: | ---: | ---: | --- |
| 720 × 1280 preview | 15.00 s | 450 | 62.21 s | Pass |
| 1080 × 1920 production | 66.37 s | 1,991 | 174.60 s | Pass |
| 1440 × 2560 production | 66.37 s | 1,991 | 175.46 s | Pass |

The full export contained a matching pair of H.264 and AAC track durations. The mix reached −14.6 LUFS and −1.6 dBTP. Production kept all 210 word texts, onsets and ends identical to the Phase 2 reference run. Ten camera keys landed within half a frame of their word onset, two illustrated effects led by less than one frame, and 18 acting cues landed 0.55–1.40 frames before onset. The audio comparison preview copies the original audio track to isolate the changes in picture.

The resolution benchmark rendered the same 72 frames at four-sample MSAA on macOS with 16 GiB RAM and about 45.5 GiB free scratch space. Wall times include browser and render setup. Process-tree memory is sampled. The different worker counts and fixed setup overhead affect the time comparison.

| Raster | Clip runtime | Wall time | Peak RSS | MP4 |
| --- | ---: | ---: | ---: | ---: |
| 720 × 1280 | 2.40 s | 9.98 s | 2.08 GB | 0.98 MB |
| 1080 × 1920 | 2.40 s | 8.27 s | 2.36 GB | 2.37 MB |
| 1440 × 2560 | 2.40 s | 8.47 s | 2.61 GB | 3.56 MB |

Dependency installation, TypeScript, 14 tests, story validation and audit, asset checksums, workflow lint, and [GitHub Checks](https://github.com/Jyozaa/yt-auto/actions/runs/44199631917) passed. Existing issues #1 and #2 still hash to their reserved ledger entries under the extended schema. The render accepts the same narration, mix and publish contracts.

## Boundaries

Production exposes the common cast, environment builders and timed effects. The bridge's deck and chain physics, authored crowds and camera sight-line filtering live in `SourceStyleBaseline`. Story scenes use explicit placements for important props and foreground framing. The baseline is silent because the upstream narration and word track are absent. A licensed Kenney rowboat stands in for the unavailable exact canoe model. The source React Three Fiber debug switches and grain toggle are outside the development composition. Frame and raster selection are available from `visual:stills`.
