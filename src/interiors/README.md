# src/interiors

Interior scenes (slice 2 thread 3a; plan in plans/slice-2-interiors-nav.md, contract `contracts/interiors-and-nav.md` section 1).
Plugged in only through `interiors.plugin.ts`; no shared core file is edited.

| File | What it does |
| --- | --- |
| `interiors.plugin.ts` | Builds every interior at setup (colliders kept), defines its anchors and triggers, adds its nav grid, registers the door interactables (the outside anchor may appear late), the `interior` persistable (v1), the `interiors` service, `interiors.tick` (rules 400) and `interiors.render` (world 400). |
| `InteriorController.ts` | Pure lifecycle over ports: enter and exit transitions, refusals, aborts, the bounds rule, saves and the event rule (entered and exited strictly alternate per id). |
| `layout.ts` | Pure: a def to world-space solid boxes (0.5 m raster, merged), anchors, triggers, bounds and the nav grid def. Interiors float 150 m above the highest terrain under them. |
| `build.ts` | Greybox meshes (no shadows, hidden until entered), emissive torches, Rapier cuboids, blockers. |
| `environment.ts` | The outdoor/indoor look swap: background, fog, sun, hemisphere light, terrain visibility, the follow light. |
| `vaultDef.ts`, `types.ts` | The chapel vault and the def types. |

Why 150 m up: the save loader lifts a saved position onto the terrain and rejects one more than 200 m above it, so a buried
interior would load on the surface. At 150 m saves load unchanged, the region stays the same and outdoor enemies stay dormant.

## Chapel vault anchors (`chapel-vault`, defined at runtime, so they are not in src/region/ANCHORS.md)

Local metres from the stair foot (world site (52, 66), floor about 150 m up); the corridor runs along -Z. Yaw 0 faces -Z.

| id | local x | local z | facing |
| --- | --- | --- | --- |
| vault.entry | 0 | -1 | yaw 0 (into the corridor) |
| vault.exit | 0 | 2 | yaw 180 (exit interactable) |
| vault.arena.door | 0 | -28 | yaw 0 (into the arena), 3.5 m outside `trg.vault.arena` |
| vault.arena.centre | 0 | -43 | yaw 180 |
| vault.pillar.1..4 | 1.5 m from each pillar's corner toward the centre | | the centre |
| vault.summon.1..4 | (-9, -34), (9, -34), (-9, -52), (9, -52) | | the centre |
| vault.spawn.wraith-1..3 | (0, -8), (0, -19), (6.5, -14) | | 180, 180, 90 |
| vault.bloom | 9.5 | -14 | 90 |
| vault.pile.1..3 | (4.5, -11.5), (4.5, -16.5), (10, -17) | | 90 |

Trigger `trg.vault.arena`: box centre (0, 2, -33) local, 6 x 4 x 3 m. Blocker `vault.arena.gate` across the arena doorway, open by
default. Outside (thread 4): `vault.door` (its yaw faces away from the stair; the exit arrives 1.6 m in front of it),
`npc-post.aelfreda.vault`, `trg.vault.door`.
