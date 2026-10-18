# src/bosses

Story bosses on the core boss registry (`ctx.bosses`, actors-and-damage.md section 7), which alone emits `boss.*`.
Slice 2 thread 3b; plan in plans/slice-2-ashen-prior.md (section 10 holds the coordinator's review changes).

| File | What it does |
| --- | --- |
| `prior/prior.plugin.ts` | Plugin `ashen-prior`: strings, the `bosses.prior` system (intent, -140), the Mage model on demand. |
| `prior/PriorDirector.ts` | The D01 lifecycle: `trg.vault.arena`, the intro (camera override, frozen player, cutscene context), register after it, 3a's `vault.arena.gate` blocker and the ash veil, the resets (player death, load inside the vault, teardown, an outside outcome). |
| `prior/PriorEncounter.ts` | One Prior: actor and model, registration, the brain's hooks (telegraphs, censer and chain script hits, teleports, summons through thread 5's groups, the opening shields), the 8% health floor (order 99), poise regen, the release and death presentation. |
| `prior/PriorBrain.ts` | Pure state machine: glide, censer, chain, teleport, summon waves (two shielded openings, one unshielded re-summon per phase), break stagger, release-window kneel. |
| `prior/PriorModel.ts`, `prior/priorFx.ts` | KayKit Mage at 1.3 with a white robe and a primitive censer; the `censer-telegraph` ring, `boss-shield` shell and the veil. |
| `prior/geometry.ts`, `prior/tuning.ts` | Pure helpers and every number (readings marked). |

Not here, by ruling: the hold-T Release on the boss (thread 1 calls `ctx.bosses.release`, charges Burn and favour), the boss
music (thread 9 follows `boss.*`), the D01 quest and reward (thread 6), the boss bar (thread 8).
