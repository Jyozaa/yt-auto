# Phase 4 verification

The new [Lake Peigneur story](../examples/lake-peigneur-1980.json) has nine beats and 189 words. It follows the sourced brief from the drilling platform through the flooded mine, canal reversal, and refilled lake. The characters are fictional composites. The mine cross-section depicts the proposed connection between the lake and the mine at illustrative scale. The basis for that interpretation is the [MSHA investigation](https://usminedisasters.miningquiz.com/saxsewell/1980_jefferson_island.pdf), the [University of Louisiana retrospective](https://library.louisiana.edu/news-events/news/20221118/fun-fact-friday-special-collections), and [contemporary coverage of the disputed drilling location](https://www.upi.com/Archives/1980/11/22/Texaco-says-its-oil-rig-was-in-right-place/2760343717200/).

## Character and world studies

| Evidence in `out/phase4/` | What to inspect |
| --- | --- |
| `evidence/hairstyles.jpg` | Six characters from the front and side. The strongest silhouette variations are the curls, long rear layer, and profile ponytail. |
| `evidence/expressions.jpg` | Twelve expressions on the same head. Brow asymmetry, different lids, and mouth shapes are visible at thumbnail size. |
| `evidence/reaction.mp4` | The same worker watches the drill, looks down, recoils, and retreats. The other worker has a separate acting lane. |
| `gait/visual-clip.mp4`, `evidence/gait.jpg` | Profile walk and run over the same distance. The run has a faster stance cadence, larger knee lift and arm swing, and eased acceleration. |
| `evidence/machinery-5s.mp4` | Five seconds in an uninterrupted shot with the shaft, rotary teeth and flywheel turning. |
| `evidence/vortex-and-vessels-5s.mp4` | Five seconds of a growing vortex. The barges move inward, the platform leans, and the derrick continues sinking across a cut. |
| `evidence/mine-evacuation.mp4` | Three miners run ahead of the advancing flood. The camera tracks the front runner to the raised exit. |
| `evidence/causal-sequence.mp4`, `evidence/causal-frames.jpg` | Jam, reaction, structural failure, persistent loss of the rig, and underground flooding. |
| `evidence/canal.mp4` | Foam reverses direction and accelerates down the canal into the basin. |

The first visual review found the basin floor showing through the deepest part of the vortex, shallow framing of the mine, and checkered deck shadows. The later pass deepened the basin, added a tunnel ceiling and advancing flood front, and relit the deck. Direct frame inspection confirmed the vortex stays visibly hollow, the rig remains submerged in the return shot, and the mine water reaches the front of the tunnel behind the crew. The cutaway and water use stylized shapes, the shoreline has a limited tree vocabulary, and the orbiting barges can visually crowd one another. The boats and debris follow authored paths, with limited collision geometry. Walk and run retain the source's flat cards and can still look light on contact at some angles.

## Voice and audio

The narration tests used the same final 189-word script. The connected preset groups short sentences across beats where possible, aligns the original text to model-native phoneme durations, and keeps the dry stem. The sentence-based Foucault regression still uses `am_fenrir` at 1.07× and measured 66.365 seconds.

| Voice | Phrasing | Speed | Dry duration |
| --- | --- | ---: | ---: |
| am_fenrir | Connected | 1.00× | 70.925 s |
| am_fenrir | Connected | 1.04× | 69.56 s |
| am_fenrir | Connected | 1.07× | 68.66 s |
| am_michael | Connected | 1.00× | 77.795 s |
| bm_george | Connected | 1.04× | 72.525 s |
| am_fenrir | Sentence | 1.07× | 64.28 s |

The 1.04× connected preset was the closest-to-natural-speed connected candidate that fit the production window. All 189 words have timings. The first word starts at about 15 ms. The name alias is an approximate pronunciation. The offline waveform and timing checks establish level, gaps and candidate runtime. An independent listening review and externally measured phonetic alignment remain open.

`final-1080/` contains dry narration, processed narration, music, effects, ambience, full mix, cue sheet and word alignment. `final-audio/event-stems/` has isolated event files. Each starts at its cue onset. `evidence/evidence.json` records candidate timings by narrative section, stem levels, and frame-motion summaries. The matched excerpts in `evidence/*jam-through-flood.wav` cover the previous single effects, the current layers with legacy narration processing, and the current mix. The previous-effects reconstruction feeds the old mixer generic hits, splashes, and a short machine sample at the same cue frames.

The drill bind is triggered at frame 417 (13.90 s), the deck collision lands at frame 721 (24.03 s), and the mine alarm begins at frame 887 (29.57 s). The cue report also includes origins, pan, distance and cutoff for world Foley. It records 68 entries, zero missing cues, and zero abrupt steps. There are no external sound samples. The isolated event spectrograms show sustained wide-band water, intermittent motor harmonics, and a pulsed mine alarm. The deck-impact onset hits the collision frame. The strongest composite sample follows roughly 64 ms later as the tail layers join. The credibility of the water and machinery still needs a listening review.

## Render checks

Run the following locally to reproduce the video and the individual cue stems.

```sh
npm run validate -- examples/lake-peigneur-1980.json
npm run audit -- examples/lake-peigneur-1980.json
npm run render -- examples/lake-peigneur-1980.json --output out/phase4/final-1080
npm run audio -- examples/lake-peigneur-1980.json out/phase4/final-audio --event-stems
npx tsx scripts/acting-study.ts examples/lake-peigneur-1980.json out/phase4/acting-study.json
```

The 1080 × 1920 master uses H.264 with AAC at 30 fps. The 1440 × 2560 render also completed and passed technical QA. Automated QA checks frame count, motion, exposure, flashes, silence, clicks, loudness and true peak. Use `final-1080/qa/contact-sheet.jpg` and `evidence/causal-frames.jpg` for visual inspection. No semantic vision endpoint was configured. The report records automated measurements. Frame inspection and audio evaluation have their own evidence above. GitHub preview runs save QA reports on the public repository. The video and frame images remain local. YouTube uploading remains opt-in.
