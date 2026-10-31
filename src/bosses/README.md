# src/bosses

Story bosses on the core boss registry (`ctx.bosses`, actors-and-damage.md section 7), which alone emits `boss.*`.
Slice 2 thread 3b; plans in plans/slice-2-ashen-prior.md and plans/slice-2-grimtooth.md (review changes in sections 10 and 11).

| File | What it does |
| --- | --- |
| `prior/prior.plugin.ts` | Plugin `ashen-prior`: strings, the `bosses.prior` system (intent, -140), the Mage model on demand. |
| `arena/BossArena.ts` | Shared arena lifecycle: the trigger (with optional arming re-checked while the player stands in it), model-state gating, the intro, register after it, 3a's gate blocker with a veil (clearance and offset per arena), and the resets (player death, a load inside the arena rectangle, teardown, an outside outcome). |
| `prior/PriorDirector.ts` | The D01 arena config: `trg.vault.arena`, the intro (camera override, frozen player, cutscene context), register after it, 3a's `vault.arena.gate` blocker and the ash veil, the resets (player death, load inside the vault, teardown, an outside outcome). |
| `prior/PriorEncounter.ts` | One Prior: actor and model, registration, the brain's hooks (telegraphs, censer and chain script hits, teleports, summons through thread 5's groups, the opening shields), the 8% health floor (order 99), poise regen, the release and death presentation. |
| `prior/PriorBrain.ts` | Pure state machine: glide, censer, chain, teleport, summon waves (two shielded openings, one unshielded re-summon per phase), break stagger, release-window kneel. |
| `prior/PriorModel.ts`, `prior/priorFx.ts` | KayKit Mage at 1.3 with a white robe and a primitive censer; the `censer-telegraph` ring, `boss-shield` shell and the veil. |
| `prior/geometry.ts`, `prior/tuning.ts` | Pure helpers and every number (readings marked). |
| `grimtooth/grimtooth.plugin.ts` | Plugin `gaffer-grimtooth` (depends on `interiors` and `enemies`): strings, the `bosses.grimtooth` system. |
| `grimtooth/GrimtoothDirector.ts` | The D02 arena config: `trg.underways.arena`, armed once D02's `o3` is done, 5 m gate clearance, soot veil, reload rule inside the arena rectangle only. |
| `grimtooth/GrimtoothEncounter.ts` | One Grimtooth: registration (three phases, one break each), the pounce leap with its per-tick hit, the bite and its burn, howls into `grimtooth-summons` (2 then 3), the tail weak spot (order 98) and 8% floor (99), the calm walk-off (the pack left to thread 1's scatter) and the death. |
| `grimtooth/GrimtoothBrain.ts` | Pure state machine: circle, close, crouch and leap, bite, backstep, howls, break, the mercy window. |
| `grimtooth/GrimtoothModel.ts`, `grimtooth/grimtoothFx.ts`, `grimtooth/tuning.ts` | Thread 5's hound rig at 1.8x with collar spikes; the pounce decal and calm shell; every number. |
| `redmane/redmane.plugin.ts` | Plugin `thrandil-redmane` (Act 2, A8; depends on `interiors` and `enemies`): strings, the `bosses.redmane` system (intent, -139), the Barbarian model on demand. |
| `redmane/RedmaneDirector.ts` | The D03 arena config on A3's Scorchhold keep: `trg.scorchhold.keep.arena`, armed by `story.d03.started`, the intro and horn, the gate (3.5 m clearance plus the rect test `gateClear`) and its veil, reload rule inside the arena rectangle only. |
| `redmane/RedmaneEncounter.ts` | One Redmane: registration (two phases, three breaks each, `mercyVerb` from `BOSS_MERCY`), the brain's hooks (lance charge sweep, thrust, the net on A6b's `EnemyProjectiles`, harpoon traps), the dodge counter (x2, 1 s) and the 8% floor, the Spare (unhittable, lance dropped, kneel, fade) and the death. |
| `redmane/RedmaneBrain.ts` | Pure state machine: approach, thrust, couch and charge (phase 2 may chain a second charge after a feint), net, trap, break stagger, the Spare-window lie-low. |
| `redmane/RedmaneModel.ts`, `redmane/redmaneFx.ts`, `redmane/tuning.ts` | KayKit Barbarian at 1.15 with a red tabard and a procedural lance; the charge lane and the trap field; every number. |
| `slagmaw/slagmaw.plugin.ts` | Plugin `the-slagmaw` (Act 2, A8; depends on `interiors` and `enemies`): strings, the `bosses.slagmaw` system (intent, -138), the procedural model. |
| `slagmaw/SlagmawDirector.ts` | The D04 arena config on A4's Deepdelve: `trg.deepdelve.slagmaw.arena`, armed by `story.d04.started`, the intro and rumble, the gate and veil, reload rule inside the arena rectangle only; does not start (warns once) until A4's anchors exist. |
| `slagmaw/SlagmawEncounter.ts` | One Slagmaw: registration (three phases, one break each, no mercy and no `BOSS_MERCY` row), the tremor (cracks, 0.1 m shake) before every dodge-only eruption, the lava spit on A6b's `EnemyProjectiles`, the hot crust (poise damage zeroed until a valve cools him), the three `valve:slagmaw-N` wheels and their spray, the 8% floor and the death. |
| `slagmaw/SlagmawBrain.ts` | Pure state machine: burrowed, tremor, eruption, surfaced and spitting, submerge; phase 3 chains a second tremor; break stagger. |
| `slagmaw/SlagmawModel.ts`, `slagmaw/slagmawFx.ts`, `slagmaw/tuning.ts` | Procedural segmented worm with a scrolling lava shader; the tremor cracks, douse disc and eruption burst; every number. |
| `murkjaw/murkjaw.plugin.ts` | Plugin `murkjaw` (Act 3, K8; depends on `interiors` and `enemies`): strings, the bestiary entry (unlocked by the outcome flag), the `bosses.murkjaw` system (intent, -137). |
| `murkjaw/MurkjawDirector.ts` | The D05 arena config on K3's Mirewater Deeps: `trg.greyfen.d05.arena`, armed by `story.d05.started`, the intro and gurgle, the gate and veil on K3's gate rect, reload rule inside the hall only, `save.loaded` re-derives the drop and the gate; his level from the Greyfen block (`blockTopLevel`, L + 5). |
| `murkjaw/MurkjawEncounter.ts` | One Murkjaw: registration (three phases, one break each, no mercy, a break counts only while he is up), the bulge telegraph, the whip bite, the water wave and its walkway-safe push, the lunge and the beaching, the x1.5 jaw, the four spear racks (carry one, throw with F), phase 2's crossing drop (waits for the player to step off, stands again after every end), the floor and the death. |
| `murkjaw/MurkjawBrain.ts`, `murkjaw/SpearRacks.ts`, `murkjaw/arenaGeometry.ts` | Pure: the state machine (submerged, bulge, bite, wave or lunge, surfaced or beached, sink; a lunge at least every third attack; phase 3 chains a bite after a wave); the racks; walkable test, wave push room, surfacing picks. |
| `murkjaw/MurkjawModel.ts`, `murkjaw/murkjawFx.ts`, `murkjaw/tuning.ts` | Procedural eel (chain of spheres, travelling gait, instanced teeth); the bulge, wave ring, splash, crumble dust and spears; every number (readings for K16). |

Not here, by ruling: the hold-T Release and Calm on the bosses and the pack scatter (thread 1 calls `ctx.bosses.release`, charges Burn and favour), the boss
music (thread 9 follows `boss.*`), the D01 quest and reward (thread 6), the boss bar (thread 8).
