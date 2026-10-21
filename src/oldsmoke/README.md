# Oldsmoke places (thread A4)

Plugin `oldsmoke` (depends on core, region, npcs). PR 1 builds Deepgate's surface on A1's `DEEPGATE_PLATEAU`; PR 2 (the mines)
lands later. Nothing here is a literal map coordinate: `sites.ts` derives every place from A1's plateau box, pass road and
`OLDSMOKE_STACKS`.

- **Places**: curtain walls and a gate on the pass road's end, the market square, the miners' rows and hall, the stewards' barracks
  and office, the paymaster's office, Grisel Hall's shell and forecourt (M16's braziers), the shaft head (collar closed by a hatch
  plate until PR 2, headframe, winch house, rope catwalks, Bellows waystone), spoil heaps, and three furnace houses at the feet of
  A1's smoke stacks. **A1 owns the stacks and their smoke at every distance; nothing here draws one** (a test enforces it).
- **Interior**: `grisel-hall` (`griselHall.ts`), registered through `src/interiors/act2/index.ts`; the door opens on
  `story.m16.started` (A13 writes it). It carries the M21 spy section's anchors (`oldsmoke.stealth.m21.*`, `oldsmoke.hide.m21.n`,
  bare `spawn.m21.watch-n` and `patrol.m21.hall.n`); A13 owns the section data and the guards.
- **Waystones**: `waystone.deepgate` and `waystone.weeping-bellows` (the shaft head). The Bellows stone stays locked until
  `world.bellows.solved` (A9 adds the lock). The M16 brazier is **not** a waystone: A13 lights it with its own interactable.
- **Anchors and triggers**: every id is in [ANCHORS.md](./ANCHORS.md) (generated: `npx vite-node tools/gen-region-docs.ts`).
- **Flags** (`flags.ts`): A4 derives `world.oldsmoke.market.*` from `story.r10.choice` (stewards guard until R10 settles, miners if
  they won, both after a compromise) and `world.oldsmoke.hall.hostile` from `story.m21.choice` = `confront` and not
  `story.m21.persuaded`. A13 writes `world.oldsmoke.lift.restored` (read by PR 2's lift). A9 owns `world.bellows.*`.
- **Hall guards**: A4 publishes `oldsmoke.hall.guard.1..4` and the hostile flag; the one quest-scoped spawner is A13's. The
  `steward-guard` enemy kind (`src/enemies/defs.ts`) serves both Deepgate's hall guards and M20's stewards.
- **NPCs**: Aldous (a separate NPC from Act 1's `grisel`), Wenna, Slagg, Pike, gate/market/hall stewards, miners. Dialogue trees are
  A13's. `postRules.ts` moves the hall's cast onto the interior's own posts and Slagg to the market for R09/R10.
