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
| `src/terrain/` | Quadtree LOD terrain, heightfield math, worker pool (stubs) |
| `src/audio/` | Howler spatial audio (HRTF, exponential rolloff), camera listener, multi-stem music crossfades |
| `src/assets/` | Asset manifest, cached glTF loader (Draco/KTX2/Meshopt), InstancedMesh/BatchedMesh helpers |
| `src/demo/` | Showcase scenes, selected with `?scene=` (`?scene=audio` for audio and assets) |
| `src/input/` | Keyboard and mouse input (stub) |
| `src/combat/` | BVH weapon hitbox tracing (stub) |
| `src/characters/` | Character rigs and animation (reserved) |
| `public/assets/` | CC0 asset packs; see `public/assets/README.md` for sources and install steps |
| `public/decoders/` | Draco and Basis (KTX2) decoders from three@0.168, fetched only when a model needs them |
