# Cinderreach places (thread A3)

Plugin `cinderreach` (depends on core, region, npcs). Builds Act 2's first region from A1's plateau boxes and road
polylines (`src/terrain/shape/cinderRoad.ts`); nothing here is a literal map coordinate except `sitesFit.ts`.

- **Places**: the Cinder Road stone (M11), Cinderford (well, refuge, tavern, barricade anchors, river fork), Stonefold with the
  hound den (R07) and the wyrm den shelf (R11), Fellwalker Pasture (fold, three fog hollows, Kindling Dell anchors),
  the Hushed Anvil ridge (site anchor, three Leap ledges), the hunters' camp (M15), Scorchhold Fort (open arch,
  `cinderreach.d03.gate`) and its keep interior (`src/interiors/act2`, door `scorchhold-keep`, unlocked by `story.d03.started`).
- **Waystones**: `waystone.cinder-road`, `waystone.cinderford`, `waystone.stonefold`.
- **Anchors and triggers**: every id is in [ANCHORS.md](./ANCHORS.md) (generated: `npx vite-node tools/gen-region-docs.ts`).
- **Structure kinds** (`structureKinds.ts`, refcounted): `cinder-tent`, `cinder-cage`, `cinder-cairn`, `cinder-rune-stone`,
  `cinder-shield`, `cinder-trial-ring`, `cinder-ledger-desk`, `cinder-blightbloom`, `cinder-boarded-well`, `cinder-marker`.
- **Flags A3 derives** (`flags.ts`, `readers.ts`; quest threads never write them, only read): from the string choice flags
  `story.r05.choice` (`fox` -> `world.cinderreach.pasture.reduced`), `story.r06.choice` (`sealed` / `cleansed` ->
  `world.cinderreach.cinderford.sealed` / `.cleansed`), `story.r11.choice` (`spared` / `slain` -> `world.cinderreach.den.spared` / `.slain`).
  Re-derived on change and on `save.loaded`; any other value derives nothing.
- **NPCs**: Osgar, Ketta, Maud, Beornwyn, Hrolf (A5's def), a lantern-keeper, four Cinderford households, the bound carter.
  Quest posts are rows in `src/quests/posts.ts`. Ketta moves to Stonefold only for R07 (or after R05 and M13).
- **Toggles**: boarded well (sealed), blight stain (until cleansed), den marker (spared).
- **Regenerating the camp, den, fold, Dell and hollows**: `npx vite-node tools/fit-cinderreach-sites.ts` after A1 moves a plateau.
