# Ranged and area attacks (A6b)

A thin adapter over `src/spells/Projectile.ts`: an enemy move with `ranged` fires a bolt when its window opens (after the telegraph),
a move with `area` hits a circle at the same moment.

- Damage goes through `damage.apply` as `kind: 'melee'` with `attackId = 'ranged:<moveId>'`; the `enemies.moves` modifier leaves those alone so the move's own numbers stand. A `dodge` telegraph is unblockable (the harpoon), anything else can be blocked (the net).
- Root is applied through the status service only on outcome `hit`; the harpoon's pull is a `pull` on the request and the damage core refuses it into a wall or a drop.
- `Shooter` is what a bolt remembers; `cancelFor(shooterId)` drops its bolts when it dies or despawns, `clear()` on `save.loaded`.
- A8's Redmane net throw uses the same module; A6a's wyrms do not.
