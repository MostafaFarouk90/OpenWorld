# src/caldera/interiors

The four Caldera interiors (Act 5 N2; plan `plans/act5-N2.md`). Interior anchors are defined at runtime by the interiors plugin, so they are
not in the generated `src/region/ANCHORS.md`. Anchors are `caldera.int.<place>.<name>`, triggers `trg.caldera.int.<place>.<name>`.
Local metres from the door, rooms run +Z, yaw 0 faces -Z. All four float on the north crest pad (x 9700..12300, z 9250..9450), see `sites.ts`.

| Interior | Door (outside anchor, N1's) | Lock flag | Notes |
| --- | --- | --- | --- |
| `cooling-hall` | `caldera.door.cooling-hall` | `story.m49.complete` | standalone; 3 channels (`wheel.<c>.<1..3>`, `gauge.<c>`, `chart.<c>`, `checkpoint.<c>`, trigger `chan.<c>`); gates `cooling.gate.2/.3` on `story.m50.channel.1/.2`, `cooling.forge.gate` on `story.m50.complete`; golems `golem.<2..4>.<k>`; `forge`, `reward` |
| `stokers-tunnel` | `caldera.door.tunnel` | `story.r27.started` | `prop.1..3`, `lamp.1..4`, `charge.1..3` (near side of the seal), `post.1..8`, `line.1/.2`, `spawn.1..6`, `far.spawn.1..4`, `checkpoint`; seal `tunnel.far.seal` follows `story.r27.farOpen` (the plugin never seals the player in the far gallery) |
| `foundry-descent` | `caldera.door.foundry` | `story.d09.started` | floor 1 (`patrol.1..8`, `sluice.1..3`, `basin`, `checkpoint.1`), lift gate `foundry.lift.gate` on `story.d09.slag`, floor 2 (`ledger.1..3`, `map`, `guard.1..4`, `vat.patrol.1..6`, `wenna`, `chest` for N7's `chest:foundry-cache`, `checkpoint.2`), floor 3 (`arena.entry/.vey/.crowd.1..4/.cache.1..6/.light.1..2`, `checkpoint.3`, gates `foundry.arena.gate` (boss arena drives it) and `foundry.arena.exit` on `boss.vey.outcome`), `link.hammer`, `from-hammer` |
| `hammer-hall` | link from the Foundry (`foundry-to-hammer`); back by `hammer-to-foundry` | `story.d09.complete` | approach (`mural.1..4`, `thrall.1..4`, `alric`, `checkpoint.1`), gate `hammer.hall.gate` on `story.m54.complete`, hall (`mouth`, `parley`, `ulthred`, `slam.1..8`, `checkpoint.2`, triggers `hall`, `pit`), floor blocker `hammer.floor` (closed = flat; N3's BreakingFloor opens it; reset on leaving, on a load and when Ulthred's fight ends) |

Exports for other threads (`sites.ts`): `FOUNDRY_ARENA`, `FOUNDRY_RUNNELS`, `HAMMER_HALL_FLOOR`, `HAMMER_PIT`, `HAMMER_MURALS`, `COOLING_CHANNELS`,
`HAMMER_HALL_DROP_ANCHOR` (`caldera.anvil.arena.drop`, N1 PR 2 defines it), `CALDERA_INTERIOR_FLAGS` (the flags the quest threads write), `BLOCKERS`.
N7's chest: this thread places the anchor `caldera.int.foundry.chest` and the crate prop; the chest interactable `chest:foundry-cache` is N7's to register on it.
