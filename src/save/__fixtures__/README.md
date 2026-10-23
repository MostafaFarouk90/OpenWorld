# Save fixtures

Raw save files exactly as the real save plugin stores them (`slot-0`), used by load tests. Never hand-edit them; regenerate.

## Slice 1 (`slice1-*.json`)

Written at the slice 1 tip **5a09676** (the last commit before slice 2) by booting every real plugin with the fake
IndexedDB, driving the state through the real services and calling `save.saveNow('manual')`. Only `savedAt` is
normalised. The generator is kept as `slice1Fixtures.gen.reference.txt`; to regenerate:

```sh
git worktree add ../s1tip 5a09676 && cd ../s1tip && ln -s ../openworld/node_modules node_modules
mkdir -p src/gen && cp ../openworld/src/save/__fixtures__/slice1Fixtures.gen.reference.txt src/gen/slice1Fixtures.gen.test.ts
OUT_DIR=$PWD/out npx vitest run src/gen
```

| File | State |
| --- | --- |
| `slice1-tutorial-complete.json` | Tutorial complete (Kettlewick skip), Rally Cry learned, M01 active |
| `slice1-mid-m02.json` | M01 done, M02 active |
| `slice1-complete.json` | Tutorial, M01 and M02 completed |
| `slice1-mid-tutorial-t09.json` | Full run, beat t09 under way |

Load tests: `src/save/slice1Fixtures.test.ts`.

## Act 2 waves (`act2-waves-*.json`)

Hand-written minimal saves for the A7 `waves` persistable (stored shape `{ defId, index, phase, barricade?, done? }`), read by
`src/waves/persist.test.ts`. `pre-a7` has no `waves` entry and must load idle. They carry no inventory entry, so
`Inventory.test` skips them.

## Act 2 Phase C, Cinderreach (`act2-m11-start` to `act2-phase-c-complete-*`)

Written by the real save plugin from the headless Phase C runs (`src/integration/phaseC.ts`), like the Act 1 ones:
`GEN_FIXTURES=1 npx vitest run src/integration/fixtures.gen.test.ts -t "Act 2 Phase C"` (about two minutes). Both runs start from
`act1-complete`; run A takes the first branch of every choice, run B the second. They are also the Phase C to Phase D save input.

| File | State |
| --- | --- |
| `act2-m11-start.json` | Act 1 complete, M11 not yet offered |
| `act2-m12-start.json` | Run A: M11 done, M12 not yet offered |
| `act2-m12-mid-wave.json` | Run A: M12 active, the raid's first raiders standing (the A12 x A7 double-start seam) |
| `act2-m14-hushed-anvil.json` | Run A: M14 active, the Hushed Anvil rekindled |
| `act2-d03-scorchhold.json` | Run A: D03 active, the gate and courtyard done, the keep papers current |
| `act2-phase-c-complete-defeated.json` | Run A (R05 safe road, R06 cleansed, R07 spared, R11 slain, Redmane defeated): M11 to D03 completed |
| `act2-phase-c-complete-spared.json` | Run B (R05 fox, R06 sealed, R07 culled, R11 spared, Redmane spared): M11 to D03 completed |

Load tests: `src/integration/phaseC.fixtures.e2e.test.ts`, `src/integration/phaseC.containment.e2e.test.ts` and the
every-fixture audit in `src/save/act2Migration.test.ts`.

## Act 2 Phase D, Oldsmoke and the return (`act2-m17-start` to `act2-act-complete`)

Written by the real save plugin from the Phase C complete save (run A, `act2-phase-c-complete-defeated`) through the deterministic
generator (`src/integration/fixtures.genD.test.ts`, driver `src/integration/act2dFixtures.ts`: seeded random, fixed clock,
sorted keys, floats rounded). The quests are driven at service level (each started, its objectives and completion through the
same calls the effects use, so the Oldsmoke director, the posts and the act ending react as in play). Regenerate:
`GEN_FIXTURES=1 npx vitest run src/integration/fixtures.genD.test.ts -t writes` (about thirty seconds). The generator is run
twice by an always-on test that compares the bytes.

| File | State |
| --- | --- |
| `act2-m17-start.json` | M16 completed; M17 not yet offered (Slagg) |
| `act2-mines-mid.json` | M17, R08 to R10 completed; M18 active (brief, plaque and pipes done); the player at the shaft head |
| `act2-m22-active.json` | Every Phase D quest but M22 completed (D04 too); M22 active, the keep reached and the Council heard |
| `act2-d04-complete.json` | The same chain one quest short: D04 completed, M22 not yet offered; the act has not ended |
| `act2-act-complete.json` | M22 completed after D04: gate a3 set once, the card seen, the camp scene run, Wenna at the camp |

Load tests: the every-fixture audit and the Phase D checks in `src/save/act2Migration.test.ts` (every Act 1 and Phase C fixture
also loads into the Phase D build there) and the boot hygiene test `src/integration/bootWarnings.test.ts`.
