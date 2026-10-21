# src/waves

Wave sets, brazier carts, the barricade and Osgar's militia (Act 2 thread A7; plans in `plans/act2-A7.md` with its review folds).
Provides the `waves` service (`WavesService` in `core/coreServices.ts`) and the `waves` persistable. Nothing in core is edited.

## Using it (A12)

```ts
services.get('waves').start('cinderford-raid'); // false: unknown id, a set already running, or a set already completed
```

- **Def id:** `cinderford-raid` (M12, `defs/cinderford.ts`).
- **`wave.cleared { defId, index }` is 0-based.** Wave 1 is index 0. The set is *completed* when `index === waves.length - 1`
  (for `cinderford-raid`, `index === 2`); no `wave.started` follows it and `current` becomes null.
- `wave.started { defId, index }` is emitted at every wave start, again after a restart, and when a loaded run resumes.
- `waves.failed { defId, index }`: the barricade fell or the player died. The *same* wave restarts after a 3 s beat:
  its enemies and carts are despawned, the barricade goes back to its wave-start health, the militia stand up. The restart
  waits until the player is alive, outdoors, not travelling and within `radius` (160 m) of the barricade.
- Wave enemies carry `spawnTag` `m12` (the def's `spawnTag`), so a kill objective can match it. Spared, calmed and released
  members that are walking off count as gone. Carts carry no tag and are not kills.
- A wave enemy that a player leaves *yielding* (a kneeling soldier) holds the wave open until it is spared or killed.
- Enemies spawn with `aggro: true` and from `leash: false` spawners: they come for the player and do not return to their lane.
  They never attack the militia or the barricade; only carts hurt the barricade. In a wave without a cart the only failure is
  the player's death.

## Structures (A15)

- `waves.structure(id) -> { kind: 'cart' | 'barricade', maxHealth } | undefined` (additive augmentation of `WavesService`).
- Stable ids: the def's `barricadeId` (`cinderford.barricade`, 400) and `<defId>.cart.<wave>.<n>` (`cinderford-raid.cart.1.1`,
  `cinderford-raid.cart.2.1`; `<wave>` is the 0-based index, `<n>` counts from 1; 600 each).
- `structure.damaged` is emitted at full health when a cart spawns and when the barricade is announced (each wave start) or restored.
  `structure.destroyed` is emitted once for a cart the player destroys and once when the barricade falls. A cart that rams the
  barricade emits only the barricade's `structure.damaged`; carts removed by a restart or `stop()` emit nothing, so clear bars on
  `wave.started`, `waves.failed` and when `current` becomes null.
- Cart hit values (`tuning.ts`): a heavy chop (`melee` with a `HEAVY_CHOP_CLIPS` clip) 10% of 600, a Surge (`spell`,
  `heartshard-surge`) 25%; everything else, fire and status ticks included, 0; no poise. A cart rolls at 1.2 m/s, rocks back 1.0 s
  and rams for 250. The barricade (400) survives one ram and falls to two.

## Def format (`types.ts`)

```ts
{
  id, barricadeId, barricadeHealth,
  barricadeAnchors: string[],            // the line; origin = centroid; carts ram the nearest one
  lanes: { '1': anchorId, ..., wyrm: anchorId },
  waves: [{ spawns: [{ lane, kind, count, delay, stagger }], carts: [{ lane, delay }] }],
  defenders: [{ anchor, dx?, dz? }],     // militia posts
  band, spawnTag, intermission?, restartBeat?, radius?
}
```

Times are seconds from the wave's start. Each (wave, lane, kind) becomes one ephemeral manual spawner (`spawners.ts`,
`WAVE_SPAWNERS`), spread into the list in `enemies/enemies.plugin.ts` because only that file can register spawners. Add a set
to `defs/index.ts` and its spawners follow.

## Saves

`{ defId, index, phase: 'running' | 'intermission' | 'done' | 'idle', barricade?, done? }`. A running save loads at the start of
that wave, an intermission save at the start of the next, a done set stays done, a save with no `waves` key loads idle. On load the
set is rebuilt only if the player is within `radius` of the barricade; otherwise it is parked and rebuilt on return.

## Dev

`?waves=<defId>` (DEV builds only, `waves.dev.plugin.ts`) starts a set and defines stand-in anchors around the player for any
the layout lacks.
