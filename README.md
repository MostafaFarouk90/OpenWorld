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
| `src/audio/` | Spatial audio and stem crossfades (stub) |
| `src/input/` | Keyboard and mouse input (stub) |
| `src/combat/` | BVH weapon hitbox tracing (stub) |
| `src/characters/` | Character rigs and animation (reserved) |
| `public/assets/` | CC0 asset packs (not yet added) |
