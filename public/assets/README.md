# Game assets

All packs are CC0 1.0 (public domain). Attribution is not required but appreciated.

| Pack | Author | License | Official URL | Local folder | Status |
| --- | --- | --- | --- | --- | --- |
| KayKit Adventurers | Kay Lousberg | CC0 1.0 | https://kaylousberg.itch.io/kaykit-adventurers (mirror: https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0) | `public/assets/kaykit-adventurers/` | subset committed: Knight.glb, Barbarian.glb, Mage.glb, Rogue.glb, Rogue_Hooded.glb, sword_1handed, shield_round |
| KayKit Medieval Builder Pack | Kay Lousberg | CC0 1.0 | https://kaylousberg.itch.io/kaykit-medieval-builder-pack | `public/assets/kaykit-medieval-builder/` | not committed — the official hosts (itch.io, quaternius.com) were unreachable from the build environment; download manually |
| Medieval Village MegaKit | Quaternius | CC0 1.0 | https://quaternius.com/packs/medievalvillagemegakit.html | `public/assets/quaternius-medieval-village/` | not committed — the official hosts (itch.io, quaternius.com) were unreachable from the build environment; download manually |
| Fantasy Props MegaKit | Quaternius | CC0 1.0 | https://quaternius.com/packs/fantasypropsmegakit.html | `public/assets/quaternius-fantasy-props/` | not committed — the official hosts (itch.io, quaternius.com) were unreachable from the build environment; download manually |

### Provenance: KayKit Adventurers

- Mirror repo: https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0
- Commit: `672074b73ba276876a19e8816ecdc5241817ab47` (branch `main`)
- Source path in mirror: `addons/kaykit_character_pack_adventures/Characters/gltf/<Name>.glb`
- Per-file SHA-256:
  - `Knight.glb`: `60428e3abc09ba83e595d256e3af8c5c976b46cdae599f0802fc82b4a3445168`
  - `Barbarian.glb`: `cefc311a0e10c7858b6141f5ada7e33268727564fb8ac1347aab97d000669cc6`
  - `Mage.glb`: `cf898585da33fab50c724d31605fb931eb2912e6d2280092141e98ca81ad507d`
  - `Rogue.glb`: `e825437cd4d2ee9c1960b517a74a69101e33eb409ae7fa8cedc7134a998fbb7d`
  - `Rogue_Hooded.glb`: `93e6e25213009952276d9cf34f5d96a243767334c66f280db0433ddfabb91545`

- Download budget: the four NPC GLBs total about 14.4 MB. They are loaded lazily, one per distinct model, once the player is within 100 m of an NPC's post; placeholders show until then.

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
