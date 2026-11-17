# Replacement visual/audio test story — Lake Peigneur (1980)

**Status:** source-checked production brief, NOT yet a renderable Story v2 JSON fixture. The renderer still lacks a lake/whirlpool, drilling rig, underground mine and canal. Do not fake these with unrelated props; implement the required reusable scene builders and validate a complete new JSON fixture before switching the preview workflow. Retain `examples/foucault.json` as a regression fixture.

**Working title:** The Lake That Went Down the Drain  
**Test ID (reserve for new Story JSON):** `lake-peigneur-1980-test`  
**Target:** 62 seconds, ~228 narrated words at ~3.7 words/sec, 9:16.

## Narration: beat-by-beat (new original test script)

**HOOK** — One morning, an entire Louisiana lake disappeared down a hole in its own floor.

**SETTING** — It's November 1980 at Lake Peigneur. A crew is drilling for oil from a platform. Far below, people are working inside a salt mine.

**ESCALATION 1** — First, the drill gets stuck. Then the platform shakes and tilts. The workers scramble off, and the lake starts spinning where their rig stood.

**ESCALATION 2** — The whirlpool grows. It pulls in the drilling platform. Barges slide toward the centre. Trees and pieces of shore follow them into the water.

**ESCALATION 3** — Meanwhile, underground, miners race for the exit as water floods the tunnels. They escape, but the lake above is still vanishing.

**TURN** — The strangest part? A lake is going down a drain that nobody knew was open. Where can all that water possibly go?

**ANALOGY / “YOU SEE” REVEAL** — You see, beneath the lake is a network of salt-mine passages. Drilling appears to have opened a route between the water and the mine. As water rushed in, the ground collapsed and widened the opening. Imagine pulling a bathtub plug, except the bathtub is a lake and the drain is a mine.

**CONSEQUENCE** — Then a canal connecting the lake to the coast begins flowing backward. Water pours into the empty basin instead of out. Eventually the lake fills again, deeper and saltier than before.

**PAYOFF** — The drillers went looking for oil. The lake found a way to change its entire plumbing.

Do not invent dialogue, deaths, precise worker counts, or confident claims about the unproven exact cause of the borehole mislocation. Keep narrated claims tied to source IDs in the final JSON. Preserve the overall hook → setting → three escalating visual actions → mystery → explanation → consequence → payoff progression.

## Sources for fact checking

- **Primary investigation:** *Jefferson Island Mine Inundation* (archived mining investigation): https://usminedisasters.miningquiz.com/saxsewell/1980_jefferson_island.pdf
- **Institutional archive:** University of Louisiana at Lafayette, *Lake Peigneur Disaster* retrospective: https://library.louisiana.edu/news-events/news/20221118/fun-fact-friday-special-collections
- **Contemporary reporting:** *Washington Post*, November 21–22, 1980: https://www.washingtonpost.com/archive/politics/1980/11/22/an-end-of-the-world-scene-earth-swallows-lake-oil-rig/2ad5eddb-fbe0-46d3-b8b3-db18bd3266ac/

The exact mechanism and drilling-location error deserve cautious wording. Primary findings take precedence over retrospective summaries.

## Test requirements — important precisely because Foucault didn't exercise them

1. **New environment:** coastal Louisiana lake, lush shore, industrial drilling platform, moving vessels, underground mine tunnels, connected canal.
2. **World animation:** rotating/straining drill; progressive water vortex and changing water level; rig tilt and collapse; drifting barges; falling embankment; flooding mine; reversing canal. Physical causality must be readable across multiple shots.
3. **Acting:** workers notice trouble → look toward rig → urgent escape; miners notice water → run for exit; genuine hair silhouettes for different workers; facial expressions change with the event, not just static `look` values.
4. **Audio cue sheet:** lake breeze and water bed, motor/drilling machinery, drill bind, metal creak, rumble, suction/water surge, wood/metal impacts, panic footsteps, mining alarm, flowing canal, resolution. Every cue attached to an actual visible event, with proximity, panning and dynamic volume.
5. **Narrator:** compare Kokoro voice candidates at natural pace; minimise unnatural chunk gaps; avoid highpass/compression artifacts; save voice-only and mixed previews.
6. **Camera:** medium character/rig framing, sweeping overhead vortex, moving vessel POV, mine interior and schematic cross-section for “You see,” then reverse canal wide shot. Use multiple keys per shot and keep foreground objects clear of faces.
7. **Visual QA:** side-by-side frames with the upstream source-inspired illustration system; inspect hairstyles, expression changes, silhouettes, motion continuity, density of environmental detail and sound synchronisation.
8. **No misleading substitutions:** never render this as a pendulum, generic cart, inert water plane, repeated street or static diagrams.
9. **Publishing:** test-only; keep uploads disabled or private. This example is not a public-ready historical claim until narrative and visual review passes.
10. **Workflow:** once the new `examples/lake-peigneur-1980.json` passes schema, script QA and full render QA, make it the **default preview fixture** in `.github/workflows/preview.yml`; leave Foucault available for regression.

## Required artifacts

- New validated Story v2 JSON with source-linked factual claims and detailed scene/actions/effects.
- 15-second and 60–70-second rendered previews.
- Dry voice, music, ambience, SFX and final-mix stems.
- Per-event cue report with word/frame timestamps and matched visual action.
- Character expression and hair contact sheets, action keyframe grids and world-animation clips.
- Honest before/after report of visually supported improvements.
