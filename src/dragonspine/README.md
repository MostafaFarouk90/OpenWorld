# Dragonspine places (thread K4: the lower slopes and the summit)

Plugin `dragonspine` (depends on core, region, npcs). PR 1 builds the places south of the summit hole; PR 2 builds the summit
(below). **Nothing here is a literal map coordinate or a height.** `inputs.ts` collects K1's exports (the plateaus in
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

## PR 2: the summit

All of it derives from K1's summit plateaus (`SUMMIT_PLATEAU_IDS`), `ACT3_GLIDE_LEDGES` and `LIP_RUN`, `FROSTFANG_WAYSTONE`, the
`frostfang-keep` pad, the troughs `FROSTFANG_CHASM` and `FROSTFANG_MOAT`, the summit fog face and the Skyhold spur. `summitSites.ts`
frames them and throws on anything missing (a plateau, a glide ledge, the troughs, the keep pad) or on a roost pad under 60 by 60
m (there is no built-platform fallback). Every structure keeps out of K1's 60 m launch runs (`clearOfRuns`).

- **Places**: `summitGate.ts` (the arch on the open side of K1's fog face: dressing only, the face is the blocker; Eadgyth's post),
  `wyrmsHearth.ts` (the shrine, `waystone.wyrms-hearth`, the keeper-stone, the hoard and its searches, the black-glass tiers,
  four carvings, two glide markers, Ysmeryth's perch and the M32 cast posts), `roost.ts` (M31: a climb of about 800 m down from
  the Hearth's north rim to K1's roost pad, three Leap ledges fitted at built size, the arena centre, four hawk spawns),
  `skyhold.ts` (Thorgar's rig camp, six net anchors on the cliff edge, two hunter packs, the escape flight point),
  `aerie.ts` (D06: walls, towers, the west gate, the winch, the landing shelf, the keep shell on K1's pad, arena anchors, eight
  courtyard hunters, four harpooners on the walls), `glideLedges.ts` (a rock deck, a wind banner and a landing marker at each of
  K1's six ledges; `dragonspine.glide.<ledgeId>.launch` and `.landing`).
- **Keep interior** (`frostfangKeep.ts`): `frostfang-keep` on K1's pad, area `dragonspine-summit` (`KEEP_AREA`); the door
  (`dragonspine.aerie.keep.door`) opens on `story.d06.started`.
- **Walker catch** (`chasmCatch.ts`, agreed with K7): one box trigger per stretch of each trough (`trg.dragonspine.catch.<trough>.<n>`).
  A walker held in one for `CATCH_HOLD` s is faded out and returned to `dragonspine.glide.summit-aerie.launch`, or to
  `dragonspine.aerie.landing` when last grounded on the Aerie. It stands down while `movementMode` is `glide` or K7's `glide`
  service has `catchArmed` (a missing service reads false). `trg.dragonspine.aerie.arrival` attunes `waystone.frostfang-aerie`
  (`rekindle('frostfang-aerie', 'script')`) on entering, every tick there and on `save.loaded`.
- **Readers** (`worldChanges.ts`): toggles (never in the layout) driven through `ctx.gates`, so they re-derive on every flag change
  and on `save.loaded`, both ways: the Aerie gate (closed until `story.d06.gateOpen`), net section n (until `story.m33.anchorN`),
  the R16 axe on the hoard (`story.r16.choice = give` and `story.m32.complete`), the lodge fire lit (`story.m34.complete`), Skarl's
  banner burned (`boss.corvin-skarl.outcome = defeated` only) and the drake's roost on the Aerie's north-east tower
  (`story.d06.complete`). After M34 the six lodge hunters stand on `npc-post.lodge-hunter-N.out` (`postRules.ts`). The plugin's
  `dragonspine` service reports the shown toggles and the catch's state.
- **Waystones**: `waystone.wyrms-hearth`, `waystone.frostfang-aerie`. Spawn anchors for the summit are `dragonspine.spawn.roost.*`,
  `dragonspine.spawn.skyhold.*` and `dragonspine.spawn.aerie.*` (area `dragonspine-summit`).

