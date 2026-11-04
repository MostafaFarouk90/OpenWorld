# Environment pass tools (G0a)

No runtime change. Plan: plans/environment-pass.md in the project files.

- `cameras.json`: the one camera table (eye, drone, bird per tile). Bird shots put the camera 0.01 m south of the look point so north is up.
- `shoot-game.mjs <base-url> <tile> <before|after> [outDir]`: real-game shots at those cameras; HUD and minimap hidden, terrain streaming idle plus 30 stable frames before each shot.
- `shoot-mock.mjs <tile> [outDir]` with `design-mock.html` and `<tile>.spec.json`: the schematic design mock at the same cameras.
- `check-glb.mjs <dir|file>`: measures .glb/.gltf objects against `src/env/targets.json` (size, pivot at base centre).
- `src/env/scaleTable.ts`: pure audit of a measured size against the targets (vitest).

Rulings: fire-state shots use the ?tutorial= jump and the game's own quest event (no new flag; `states.fire` in cameras.json is a placeholder the B1 pilot removes); doorways need a clear opening of at least 2.2 m high and 1.1 m wide (`doorwayOk`). Time of day is the game default (no clock service to pin).

## Follow-up round 1: stand-in glbs and glow
- `standins/gen-standins.ts` (with `lib.ts`): seeded generator for the four Act 2 industry ids that still have no artist glb (slag-heap with glowing cracks, ore-pile, mine-cart, smelter-chimney). `npx vite-node tools/env-pass/standins/gen-standins.ts` writes `public/assets/env-standin/*.glb` (through ingest.mjs into a scratch folder, so sizes follow targets.json; the scratch manifest is dropped, the stand-ins stay out of `public/assets/env/manifest.json`). `standins/contact-sheet.mjs <out.png>` renders them offline next to a 1.8 m figure (needs `PLAYWRIGHT_RESOLVE` like the shot tools).
- `count-lights.mjs <base-url> <x> <z> [quality=medium]`: counts the lights in the live scene at a spot (step 0 of the glow work; baseline at Forge Row, medium: 10 point lights, 1 directional, 1 hemisphere).
- Camera tiles `h4-glow-*` and `h2-glow-keep` are the eye-level glow poses (`FLAGS=story.gate.a2` for the Keep road).
