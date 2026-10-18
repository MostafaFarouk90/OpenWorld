# src/enemies

Enemy AI and the slice's first enemies (thread 2, plan in plans/enemy-ai.md). Plugged in only through
`enemies.plugin.ts`; no shared core file is edited.

| File | What it does |
| --- | --- |
| `enemies.plugin.ts` | Registers the `enemies` service, the `enemies` persistable (v1), strings and four systems: `enemies.think` (intent, -150), `enemies.animate` (animation, 50), `enemies.react` (afterCombat, 50), `enemies.render` (world render, 50). Auto spawners start once the Knight model has loaded. |
| `host.ts`, `ports.ts` | `ports.ts` is the narrow slice of the core the enemy code uses; `host.ts` adapts the real `GameContext` to it, and `testing/fakeHost.ts` fakes it for unit tests. |
| `events.ts` | Module augmentation: `enemies.groupCleared`, `enemies.state`, `enemies.yield` events and the `enemies` service type. |
| `ai/Brain.ts` | Pure state machine: spawn, idle, patrol, notice, chase, telegraph, attack, recover, stagger, flee, return, yield, released, spared, dead. |
| `ai/perception.ts`, `ai/moveSelect.ts` | Sight cone, hearing and line of sight; weighted move choice with cooldowns. |
| `steering/` | Local steering over the heightfield (feelers, separation, cliff probe, stuck side-step) and the kinematic or heightfield movers. |
| `EnemyModel.ts`, `EnemyAnimator.ts` | Knight rig with per-instance grey ash materials, claw or sword weapons and tracers on the damage bus; mixer stepped only in the fixed tick. |
| `Enemy.ts`, `EnemyManager.ts` | One enemy (think, animate, react, death and mercy flows) and the manager (spawning, damage modifier `enemies.moves` at -150, pack attack tokens, dormancy past 120 m or 24 awake). |
| `spawners.ts`, `spawnerDefs.ts`, `level.ts` | Spawners on named anchors (manual, auto, or on `quest.started`), respawn on `rest`, `spawnTag` from the spawner's tag; `enemyLevel(band, ctx)` with the Warmth Tier hook. |
| `mercy.ts` | Hold T (0.5 s) Release and Spare interactables, the 4 m Release pulse with a shared `pulseId`, locked by `enemies.mercy.release` / `enemies.mercy.spare`. |
| `defs.ts`, `clips.ts`, `tuning.ts` | Enemy definitions, measured attack windows and tuning numbers. |

Service (`ctx.services.get('enemies')`): `spawnGroup(spawnerId, opts?)`, `despawnGroup`, `alive`, `view`,
`setMercyUnlocked(verb, on)`, `mercyUnlocked`, `setWarmthTier`, `lockBlockLevel`.

The player becomes hittable once thread 1 adds `world.combat.playerHurtboxes` as a combat target
(contracts/actors-and-damage.md section 5); until then enemies swing and telegraph but cannot hurt the player.
