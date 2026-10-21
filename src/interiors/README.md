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
| `vaultDef.ts`, `types.ts` | The chapel vault and the def types (rooms, pillars, `props` for low furniture, blockers, torches, anchors, triggers, doors). |
| `harrowmark/` | The Tilted Anvil (two doors), the Keep audience hall, the Counting-House (M09 stealth) and the Archive; their sites (copied from thread 17, drift-tested); door locks. |
| `underways/generate.ts` | The seeded Underways: an 8 m lattice maze, two kennels on the main path, the 24 x 24 m arena. Pinned by hash. |
| `occupants.ts` | Hides every actor standing in an interior the player is not in, re-asserted each render (world 400, after the companion's order 60). |

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

## Phase B (plans/slice-2-interiors-nav-phase-b.md and its review)

**Doors** (`door:<doorId>` outside, `door:<doorId>-exit` inside; outside anchors are thread 17's, inside ones `harrowmark.<doorId>.entry`
and `.exit`): `tilted-anvil`, `tilted-anvil-back` (onto the Bastion yard), `keep-hall`, `counting-house`, `archive`, `underways`.

**Locks** (entering only; exits never lock). Locked while the flag is unset, read through `ctx.gates`:
`tilted-anvil-back` and the blocker `tilted-anvil.backroom.gate` on `world.harrowmark.inn.room` (thread 19), `keep-hall` on
`story.m08.keepOpen`, `counting-house` on `story.m09.houseOpen`, `underways` on `story.d02.underwaysOpen` (thread 6).

**Anchors and triggers defined here** (local coordinates in each def file):
- Tilted Anvil: `inn.aldith`, `inn.room`, `npc-post.aldith.inside`, `npc-post.tobb.tilted-anvil`, `npc-post.hrolf.tilted-anvil` and
  `npc-post.aelfreda.tilted-anvil` (the party posts, A5); blocker `tilted-anvil.backroom.gate`.
- Keep hall: `npc-post.edric.hall`, `npc-post.vey.hall` (both on the 0.4 m dais), `m08.keep-hall`; trigger `trg.harrowmark.keep-hall`.
- Counting-House (thread 18's names): `stealth.m09.entry`, `stealth.m09.cp.hall`, `stealth.m09.cp.office`, `stealth.m09.exit`,
  `hide.m09.1..4`, `patrol.m09.hall.1..n`, `patrol.m09.stacks.1..n` (closed loops), `spawn.m09.watch-1..4`, `m09.invoice-1..3`
  (interactables `use:m09-invoice-<n>`, off once `story.m09.invoice.<n>` is set), `npc-post.merrin.inside`. The section bounds
  are `interiorAt(feet) === 'counting-house'`; `COUNTING_HOUSE_DEF` is exported for thread 18's route test.
- Archive: `npc-post.whitlock.inside`.
- Underways: `underways.spawn.hound-1..3` (kennel 1) and `-4..6` (kennel 2), both kennels on every way to the arena;
  `underways.arena.door`, `underways.arena.centre`, `underways.summon.1..4`; trigger `trg.underways.arena`; blocker
  `underways.arena.gate` (open by default).

**Loads.** `current` is set before `save.loaded`. A load keeps the saved door (a back-door entrant leaves by it). When the saved
spot is no longer floor (a layout changed, or a stuck loader teleport left the player in the sky), the controller fades to black,
freezes and moves the player to the interior's first entry, waits for ground and fades back in. Standing on furniture (a bed, a
shelf top) still counts as floor. A plugin whose own `save.loaded` teleport must win over a rescue (3b, 18, 20) should depend on
`interiors`, so it subscribes later; without that dependency the order is the plugin loader's tie-break.

**Spacing.** Every pair of interiors is at least 130 m apart (3D), beyond the enemies' 120 m wake range, so guards in one never wake
while the player is in another. For that the Archive floats 150 m north of its door (`harrowmark/sites.ts`).

**Floating occupants.** NPCs, guards and Tobb posted indoors would stand 150 m up in the sky; `OccupantHider` hides any actor whose
root is inside an interior that is not `current`, every frame, and shows only those it hid.
