# Attribution

YT-auto adapts rendering utilities from [mromidev/claude-animated-shorts](https://github.com/mromidev/claude-animated-shorts/tree/e3b817b6afc6cd413466d43f11ba31209e034bbf/templates/bridge) at commit `e3b817b6afc6cd413466d43f11ba31209e034bbf`. Copyright © 2026 Mr omi. The [MIT license](LICENSE-MR-OMI) accompanies the reused source.

- `src/engine/effects/ink.ts`, `lensblur.ts`, and `grade.ts` provide the normal/depth ink pass, two-stage lens blur, and grading.
- `src/engine/world/paint.ts`, `shade.ts`, and `lights.ts` provide procedural paint, two-tone lighting, and light palettes. YT-auto adjusts the golden-hour preset for its staging.
- `src/engine/characters/cardshade.ts` provides directional shading and shadow response for the illustrated cards.

The Phase 3 port adds the following MIT-licensed source code from the same revision.

- `src/engine/characters/toon.ts` starts from the full upstream `toon.ts`, including the `Pen`, seeded bean contours, garment construction, all 14 expressions, front/profile pose math and illustrated effects. YT-auto adds a design-height adapter and profile gesturing and dress support.
- `src/engine/characters/sprite-cast.ts` extracts the pool, card meshes, contact shadows, view selection and blink functions from upstream `cast.ts`. `src/engine/reference/cast.ts` keeps the bridge choreography. `story-cast.ts` maps original story characters and word cues to those primitives.
- `src/engine/world/build.ts` extracts the original batched building, strand, vegetation, paint and kit-prop builders. `src/engine/reference/town.ts` retains the source town layout. `src/engine/world/sky.ts` shares the five-stop sky shader with production.
- `src/engine/reference/story.ts`, `world.ts` and `lights.ts` retain the authored bridge camera, deforming deck, river and presets. `src/engine/camera/easing.ts` extracts its smootherstep. `src/render/baseline.tsx` adapts the authored scene and transitions from `Bridge.tsx` to YT-auto’s imperative host. `src/render/look.ts` retains the source post order and tuning.

The structured story adapter, Foucault storyboard and apparatus, score, audio pipeline, queue and technical QA are original to YT-auto. The upstream bridge story and cast appear only in the development composition. The upstream narration WAV, timing files and third-party reference frames are outside the port.

## Kenney CC0 models

The source template names 26 GLBs and does not include its public assets. The baseline loads the small subset it uses from `public/bridge/kenney`. The directory includes the authors’ licence notices. These are verified filename matches or an explicitly listed substitute. Individual digests are in [visual-assets.sha256](visual-assets.sha256).

| Kenney release | Files used | Archive SHA-256 |
| --- | --- | --- |
| [Fantasy Town Kit 2.0](https://opengameart.org/content/fantasy-town-kit) | `cart`, `lantern`, `stall-red`, `stall-green`, `stall-bench`, `windmill` | `1a7530c09f4d2fa2cdee259876f089334f8b1f27fa86a0c4f54ef86cdd8676ef` |
| [Nature Kit 2.1](https://opengameart.org/content/nature-kit) | `flower_redA`, `flower_yellowA`, `flower_purpleA`, `lily_large` | `fa7974a0d342bfe63c38664ba9f8ec1a4aab8ea25f099bdc56870e33588c4d9d` |
| [Pirate Kit 2.1](https://opengameart.org/content/pirate-kit) | `boat-row-small`, a substitute for the unavailable `canoe` | `667ed2caf92954ddb98f7b7cede831fe99ab75063c26b25e23d32715bee9c943` |

The source draws its trees, bushes, hedges and banners procedurally. The source lists `grass` and `grass_large` but omits the GLBs from its final placements, using painted turf instead. YT-auto retains those choices.

The [audio provenance manifest](../config/audio-provenance.json) records the soundtrack method reference and sound sources.

The [Kokoro-82M model and bundled voice packs](https://huggingface.co/hexgrad/Kokoro-82M) are distributed by Hexgrad under Apache 2.0. The model card lists attribution for Creative Commons training material. YT-auto downloads the CPU export and voices from the [Kokoro ONNX release](https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.1), using the [MIT-licensed runtime wrapper](https://github.com/thewh1teagle/kokoro-onnx). See the [voice model manifest](../config/voice-models.json) for exact asset URLs and digests.
