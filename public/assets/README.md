# Game assets

All packs are CC0 1.0 (public domain). Attribution is not required but appreciated.

| Pack | Author | License | Official URL | Local folder | Status |
| --- | --- | --- | --- | --- | --- |
| KayKit Adventurers | Kay Lousberg | CC0 1.0 | https://kaylousberg.itch.io/kaykit-adventurers (mirror: https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0) | `public/assets/kaykit-adventurers/` | subset committed: Knight.glb, sword_1handed, shield_round |
| KayKit Medieval Builder Pack | Kay Lousberg | CC0 1.0 | https://kaylousberg.itch.io/kaykit-medieval-builder-pack | `public/assets/kaykit-medieval-builder/` | not committed — the official hosts (itch.io, quaternius.com) were unreachable from the build environment; download manually |
| Medieval Village MegaKit | Quaternius | CC0 1.0 | https://quaternius.com/packs/medievalvillagemegakit.html | `public/assets/quaternius-medieval-village/` | not committed — the official hosts (itch.io, quaternius.com) were unreachable from the build environment; download manually |
| Fantasy Props MegaKit | Quaternius | CC0 1.0 | https://quaternius.com/packs/fantasypropsmegakit.html | `public/assets/quaternius-fantasy-props/` | not committed — the official hosts (itch.io, quaternius.com) were unreachable from the build environment; download manually |

## Installing a pack

Download the pack from its official URL and unzip it into its folder, e.g.
`public/assets/kaykit-medieval-builder/`. Keep only the glTF/GLB files the game uses:
for KayKit Builder that is each `.gltf` together with its `.bin` and the shared texture
(e.g. `*_texture.png`), kept side by side so relative references resolve. Keep the pack's
license file next to the models.

## Registering assets

Add an entry to `ASSETS` in `src/assets/AssetManifest.ts`:

```ts
well: {
  id: 'well',
  url: `${BASE}assets/kaykit-medieval-builder/buildings/well.gltf`,
  pack: 'kaykit-medieval-builder',
  kind: 'structure',
},
```

Then load it with `AssetLoader` (`await assets.load('well')`, `assets.instantiate('well')`).
For many copies of a static model use `extractMeshParts` plus `InstancedModel` or
`buildBatchedMesh` from `src/assets/instancing.ts`.

## Compression

Draco, KTX2 (Basis) and Meshopt-compressed glTF files are supported. The decoders live under
`public/decoders/` (copied from `three@0.168` `examples/jsm/libs`) and are only fetched when a
loaded file actually uses the matching extension.

## Repository size

Keep large packs out of git: commit only the files the game actually references.
