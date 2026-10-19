# Medieval Open World RPG

Browser-based medieval open-world RPG built with Three.js, Rapier3D, three-mesh-bvh and Howler.js.

```sh
npm install
npm run dev      # dev server
npm run build    # typecheck + production build
npm run preview  # serve the production build
npm test         # unit tests (Vitest), src/**/*.test.ts
```

## Layout

| Path | Purpose |
| --- | --- |
| `src/core/GameLoop.ts` | Fixed 1/60 s timestep loop with interpolation accumulator |
| `src/config/constants.ts` | Reference constants from the technical spec |
| `src/rendering/` | Three.js renderer, scene, camera |
| `src/physics/` | Rapier world and kinematic character controller (stubs) |
| `src/terrain/` | Quadtree LOD terrain with worker pool and skirts, swappable height function, Rapier heightfield patches. Demo: `npm run dev`, open `/?scene=terrain` |
| `src/audio/` | Howler spatial audio (HRTF, exponential rolloff), camera listener, multi-stem music crossfades |
| `src/assets/` | Asset manifest, cached glTF loader (Draco/KTX2/Meshopt), InstancedMesh/BatchedMesh helpers |
| `src/demo/` | Audio and asset demo. Open `/?scene=audio` |
| `src/input/` | Keyboard and mouse input (stub) |
| `src/combat/` | BVH weapon hitbox tracing (stub) |
| `src/characters/` | Character rigs and animation (reserved) |
| `public/assets/` | CC0 asset packs; see `public/assets/README.md` for sources and install steps |
| `public/decoders/` | Draco and Basis (KTX2) decoders from three@0.168, fetched only when a model needs them |

## CI minutes

GitHub Actions has a fixed monthly budget. One CI run (install, build, full vitest suite) costs roughly 4 to 5 minutes, and the suite is the bulk of it. Working rule:

- Run `npm run build` and `npx vitest run` locally before pushing.
- Squash work locally and push once per review round, not once per commit.
- Never push an empty commit, or close and reopen a PR, to re-run CI.
- A new push cancels the stale run for the same branch (concurrency group); let it.
- Root-level Markdown and `public/assets/**/*.md` skip CI. Files under `src/` (including the `ANCHORS.md` drift-test inputs) always run it.
- CI timeout is 20 minutes; a run that hits it is a bug to fix, not to re-run.
