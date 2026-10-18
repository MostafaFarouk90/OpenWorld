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

Not here, by ruling: the hold-T Release and Calm on the bosses and the pack scatter (thread 1 calls `ctx.bosses.release`, charges Burn and favour), the boss
music (thread 9 follows `boss.*`), the D01 quest and reward (thread 6), the boss bar (thread 8).
