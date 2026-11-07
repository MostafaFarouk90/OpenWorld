# Act 5 creatures (N5)

The Warhost and the Caldera skins. Plan: `plans/act5-N5.md`.

## Spawning a Warhost group (N4, N10, N11)

- Kinds `warhost-soldier` (poise 40, Halvard +1 on Spare) and `warhost-guard` (Vey's household guard, 1.1 scale, Halvard +2).
- `SpawnerDef.role`: `shield` | `pike` | `torch`. Shield members guard; pike and torch do not (the spawner passes `guard` by role).
- **A line is the spawner `tag`.** A mixed line over several spawners shares one `tag`. A line breaks when two shield members (a guard counts as one) are staggered within a second: every staggered member kneels with Spare open and `enemies.shieldLine.broken { lineId, members }` is emitted (readers: N4, N9). A broken line stays broken until a rest or a load.
- **Every line needs at least two shield members**, or it cannot break (`warhostLineLint` in `act5/lint.ts`).
- Name a `caldera-*` area on every def (`calderaAreaLint`). Levels are capped by `act5Level`; kill XP is x 3.0 by area (stored bases 40 and 100).
- Cleared checks use `groupStanding`: a spared member counts as gone.
- Skins: `footman-grisel` on `blighted-soldier`, `wraith-stoker` on `ash-wraith`, `golem-lava` on `cinder-golem`.
- Keep ambient and quest groups out of lava channels (N3's `lava.at(x, y, z)` answers a volume id).
