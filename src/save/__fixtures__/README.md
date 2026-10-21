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
