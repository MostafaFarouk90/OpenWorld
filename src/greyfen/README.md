# Greyfen places (thread K3)

Plugin `greyfen` (depends on core, region, npcs). Builds Act 3's first region from K1's exports (`src/region/act3/act3Places.ts`,
`src/terrain/shape/greyfen.ts`); positions live only in `sites.ts` (K1's names) and `places.ts` (sub-sites fitted once on the
shaped ground by `fit.ts`, so they follow K1's fit). Plan: `plans/act3-K3.md` (revision 2 rules).

- **Places**: Reedgate on K1's dry pad (ten stilt houses, plank walks, the landing deck), the Reedgate Ferry landing (jetty,
  boathouse, Dudda and Hild, M24's mud soundings and the fenced pit from `M24_POOL`), the three causeways (way-markers every
  150 m, M23's searches and leech knots), the two M23 plank bridges, R12's five reed beds on K1's reed-bed flats, Hathren's Mere
  shore (K9 builds the shrine at `greyfen.mere.shrine`; nothing of K3's within 10 m), the four Greywatch posts (platform 4 m up,
  stairs of 0.4 m steps), the Greywatch waystone with R14's stocks, Mireweather Hut with three herb beds, and the ruined fronts of
  the Sunken Chapel (with its bell tower exit) and the Mirewater Deeps (with the arena exit). A jetty at each of K7's four ferry
  stops, its stop anchor `greyfen.ferry.<stop>` on the deck.
- **Interiors** (`chapelInterior.ts`, `deepsInterior.ts`, `hutInterior.ts`, through `src/interiors/act3`): R13's chapel and D05's
  Deeps are dive interiors on the v0.7 `sunken` floors (pools 4 m deep with 0.4 m step stairs, sealed tunnels), locked until
  `story.r13.started` / `story.d05.started`, each with an exit-only far door. Murkjaw's arena geometry and frozen names are in
  `plans/act3-briefs/K8.md`. The hut (M25) is never locked.
- **Waystones**: `waystone.reedgate`, `waystone.hathrens-mere` (14 m west of the shrine; K9 locks it until M26), `waystone.greywatch`,
  `waystone.mireweather-hut`.
- **Anchors and triggers**: every id is in [ANCHORS.md](./ANCHORS.md) (generated: `npx vite-node tools/gen-region-docs.ts`); the
  interiors' own anchors are in their defs. K6b owns `greyfen.fauna.*`; no K3 id uses it.
- **Water** (`water.ts`): the site volumes (reed beds, M24 flats, causeway gaps; all wading) and the interiors' sets and dive
  routes, registered once on K7's `water` service when it appears. D05's sluices swap sets by `activeWhen` on `story.d05.sluice1`
  and `story.d05.sluice2`. Without the service the arena's channel catch (`channelCatch.ts`) puts a fallen player back on a walkway.
- **Flags K3 owns** (`flags.ts`, `readers.ts`): `world.greyfen.bridge.<n>.down` (written by the bridge levers), and from the choice
  flags `story.r12.choice` (`burned` / `cut` -> `world.greyfen.reeds.burned` / `.cut`) and `story.r14.choice` (`returned` /
  `released` -> `world.greyfen.deserter.stocks` / `.gone`). Re-derived on change and on `save.loaded`; any other value derives nothing.
- **NPCs** (`npcDefs.ts`): Leofa Hartley, Dudda and Hild Reedly, two ferry-hands, the ferryman's widow, Gytha Mireweather, the
  causeway ranger, three Greywatch rangers, the deserter Wybert Fenn, three reed-cutters, the ghost bell keeper. Movers are rows in
  `postRules.ts`, spread into `src/quests/posts.ts`. Dialogue trees are K12's.
- **Toggles**: lush or charred reed beds (R12), the two bridge decks (M23).
- **Art**: greybox until Mostafa's models (section N of `assets/environment-needs-prompts.md`).
