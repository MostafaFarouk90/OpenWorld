# Environment pass tools (G0a)

No runtime change. Plan: plans/environment-pass.md in the project files.

- `cameras.json`: the one camera table (eye, drone, bird per tile). Bird shots put the camera 0.01 m south of the look point so north is up.
- `shoot-game.mjs <base-url> <tile> <before|after> [outDir]`: real-game shots at those cameras; HUD and minimap hidden, terrain streaming idle plus 30 stable frames before each shot.
- `shoot-mock.mjs <tile> [outDir]` with `design-mock.html` and `<tile>.spec.json`: the schematic design mock at the same cameras.
- `check-glb.mjs <dir|file>`: measures .glb/.gltf objects against `src/env/targets.json` (size, pivot at base centre).
- `src/env/scaleTable.ts`: pure audit of a measured size against the targets (vitest).

Rulings: fire-state shots use the ?tutorial= jump and the game's own quest event (no new flag; `states.fire` in cameras.json is a placeholder the B1 pilot removes); doorways need a clear opening of at least 2.2 m high and 1.1 m wide (`doorwayOk`). Time of day is the game default (no clock service to pin).
