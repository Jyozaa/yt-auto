# Phase 4 findings

Phase 3 at `a5800d3` already uses the source Pen, face library, pooled cards, two-tone materials, smootherstep cameras and outline/blur pipeline. The [Phase 3 checks](phase-3-verification.md) and [gap analysis](VISUAL_ENGINE_GAP_ANALYSIS.md) record that baseline.

| Area | Production gap | Phase 4 approach |
| --- | --- | --- |
| Face and hair | A single front hair cap covers most cast members. Action envelopes collapse to stern or shock. | Retain the source face construction and ink. Draw distinct caps, fringes and back silhouettes. Compile versioned facial cues to absolute frames and keep the old mood fallback for existing packages. |
| Motion | The source bridge samples deck flex, chains, actors and camera on a common clock. Production shots have independent prop loops and word-indexed sounds. | Sample a persistent frame-indexed event track. Drive drilling, vibration, drainage, submersion, mine flooding and canal reversal from that track. Use the same event frames for physical Foley. |
| Camera and light | Phase 3 has multiple keys and tracking, but the old fixture exercises little physical action. | Stage action with readable inserts, slow push-ins and 18–40-frame glides from the source motion study. Cut between incompatible perspectives and maintain coordinates through the lake cuts. |
| Voice | The synthesizer restarts at each sentence and adds pauses after trimming every chunk. Every mix runs the same high-pass and compressor. | Keep several sentences in context when model limits permit, use light punctuation-shaped pauses at chunk joins, check names and years, and compare the minimally processed and legacy mixes. |
| Sound | A generic cue can play on a word even if the pictured contact occurs later. The bridge audio plans separate layers and filters them by distance and setting. | Derive motor, bind, tear, impact and water layers from visible events. Mix by perspective and preserve dry, ambience, effects and music stems. |
| Historical uncertainty | The 1980 investigators could establish the inundation and evacuation, with uncertainty around how drilling contributed. | Keep the brief's cautious wording and stage the cross-section as an illustration of the proposed mechanism. |

The audit followed upstream `toon.ts`, `cast.ts`, `story.ts`, `world.ts`, `build.ts`, the character, motion, depth and lighting reports, and `SKILL.md`. Audio references are `timeline.py`, `sfx.py`, `sfx_gen.py`, `music.py`, `instruments.py`, `dsp.py` and `mix.py`. Direct visual ports are listed in [attribution](attribution.md). The new models and sounds are procedural work for YT-auto.
