# Dragonspine places (thread K4, PR 1: the lower slopes)

Plugin `dragonspine` (depends on core, region, npcs). PR 1 builds the places south of the summit hole; PR 2 (the summit) comes
later. **Nothing here is a literal map coordinate or a height.** `inputs.ts` collects K1's exports (the plateaus in
`src/terrain/shape/dragonspine.ts`, the Rime Pass polyline, `WYRMWATCH_HEARTH` and `ACT3_INTERIOR_PADS` in
`src/region/act3/act3Places.ts`) and the ground (`heightAt`); `sites.ts` frames them and each place file derives from the frames.
Anchors carry a `dy` over the terrain, structures are resolved by the structure builder, and carry-route checkpoints, Leap ledges
and wayside pads read `heightAt` when they are built (a source-scan test forbids a height literal). Move a plateau and the place
moves with it (shifted-plateau tests).

- **Places**: `lodge.ts` (Wyrmwatch Lodge: walls, two towers, south and pass gates, the long hall's shell at the hall pad's door,
  bunkhouse, stables, the R15 sled shed and depot, racks, the yard fire pit round K1's hearth, a waystone), `shelter.ts` (Eadgyth's
  hut, her trophy wall, the fire, the woodpile about 150 m off, the switchback bend dressing, a waystone), `hawkCliffs.ts` (the egg
  thief's camp, the climb, three nests, the parents' circling points), `caveMouth.ts` (the mouth, the collapsed ledge, the trailhead and a 200 m approach over the Leap), `anvil.ts`
  (the shrine pad and anchor, six carving stones, two keeper-marks, Ansgar's cell, the pilgrims' rest, a waystone),
  `wayside.ts` (R17's six stone platforms on the verge), `m28.ts` (M28's trailhead, climb, two Leap ledges, four cairns, the crag).
  `layout.ts` concatenates them (`buildDragonspine(inputs)`); `dragonspine.layout.ts` is the shipped constant.
- **Not built here**: the Last Anvil shrine, anvil and brazier (K9), the sleds (K7: only the shed and `dragonspine.r15.sled-start.n`),
  the camp hearth anchor `dragonspine.wyrmwatch.hearth` (K1: the yard's cold fire pit is built round the exported position, lit in
  PR 2). The hall's ridge line is kept clear for PR 2's resting wyrms. Posts face inward; PR 2 adds the midpoint rules.
- **Interiors** (`wyrmwatchHall.ts`, `collapsedCave.ts`, `interiors.ts`): `wyrmwatch-hall` and `collapsed-cave`, laid out over K1's
  pads and registered through `src/interiors/act3/index.ts` (`ACT3_INTERIORS`, `ACT3_DOOR_LOCKS`, `ACT3_FLAG_BLOCKERS`). The cave door
  opens on `story.r16.started`; the passage's rockfall blocker starts closed (`startClosed`) and opens on
  `story.r16.rockfallCleared` (K13 writes both), re-derived by the interiors plugin's gates after every load. `CAVE_AREA` is
  `dragonspine-lower`: K13's cave spawners pass it as `SpawnerDef.area`.
- **Carry routes** (`carryRoutes.ts`, for K7): `buildCarryRoutes(heightAt)` returns `sled.r15.1..3`, `egg.r18.1..3` (`resetAt [0]`) and
  `candle.r17.down` (Anvil, 3, 2, 1) and `candle.r17.up` (1, 4, 5, 6), so neither doubles back (`resetAt`: the start and each shrine). Checkpoints are the route's polyline, 10 to 25 m apart, corridor 30, max drop 10.
- **Leg lengths** (`legs.ts`): the plan's table computed from the layout; `legs.test.ts` prints it.
- **Waystones**: `waystone.wyrmwatch-lodge`, `waystone.rime-pass`, `waystone.last-anvil`.
- **NPCs** (`npcDefs.ts`): Thorgar, Eadgyth, Ansgar, six lodge hunters (two stand in the hall through `postRules.ts`), two sled-hands,
  the cave hunter, the egg thief, three pilgrims. Dialogue trees are K13's, vendor stock K10's.
- **Anchors and triggers**: every id is in [ANCHORS.md](./ANCHORS.md) (generated: `npx vite-node tools/gen-region-docs.ts`).
  Spawn anchors for K6b are `dragonspine.spawn.*` (area `dragonspine-lower`).
