# Attribution

YT-auto adapts rendering utilities from [mromidev/claude-animated-shorts](https://github.com/mromidev/claude-animated-shorts/tree/e3b817b6afc6cd413466d43f11ba31209e034bbf/templates/bridge) at commit `e3b817b6afc6cd413466d43f11ba31209e034bbf`. Copyright © 2026 Mr omi. The [MIT license](LICENSE-MR-OMI) accompanies the reused source.

- `src/engine/effects/ink.ts`, `lensblur.ts`, and `grade.ts` provide the normal/depth ink pass, two-stage lens blur, and grading.
- `src/engine/world/paint.ts`, `shade.ts`, and `lights.ts` provide procedural paint, two-tone lighting, and light palettes. YT-auto adjusts the golden-hour preset for its staging.
- `src/engine/characters/cardshade.ts` provides directional shading and shadow response for the illustrated cards.

The camera compiler, Foucault storyboard, characters, world assemblies, procedural score and effects, automation, and QA are original to this application.
