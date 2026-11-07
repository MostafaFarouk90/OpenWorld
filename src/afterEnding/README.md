# The world after the ending (Act 5 N13)

Plan: `plans/act5-N13.md` (project files). Contracts v0.9 item 10. Built on Q1 (a): if Q1 is (b) this folder and the rows
listed below are dropped.

**One rule:** nothing new is saved. Everything is derived from `world.afterEnding` (N12), `story.m56.choice` and
`story.m56.caelLives` (N11), so a load re-derives it and nothing changes before the ending.

## This folder

| File | What |
|---|---|
| `flags.ts` | `afterEnding`, `endingChoice`, `caelDied` (only an explicit `false`), `ashfallScale` |
| `wake.ts` | the `afterEnding` service: `wake(): Promise<void>` (N12's director awaits it after setting the flag, before releasing the autosave hold); Rim Camp rest point, tint, the waking and ballad lines; idempotent; a load never wakes |
| `posts.ts` | which vendor, trainer and talk posts go home (`rowHoldsAfterEnding`, `AFTER_KNIGHT_DESK`, `withAfterEndingPosts`) |
| `look.ts` | the tint's look on N0's `worldTint` (Rekindle grade; Let It Die's darker Waste fog and three dragon flights on N4's `SiegeDragon`) |
| `afterEnding.plugin.ts` | the plugin; dev `?afterEnding=rekindle|let-it-die[&caelDied]` |
| `testing.ts` | test-only: the after-ending save built from Act 4's M46 fixture |

## Rows in other owners' files (additive, each reads `world.afterEnding`)

- `harrowmark/gate.ts` (`GateHold.reopenWhen`, `watchNortheastGate(…, reopenWhen)`), `harrowmark/harrowmark.plugin.ts` (`HELD`)
- `harrowmark/act4/ashState.ts` (the checkpoints, posters and soot come down)
- `harrowmark/worldChange.ts` (the fountain runs, the stalls open)
- `harrowmark/act4/absent.ts` + `region/layoutTypes.ts` + `npcs/NpcManager.ts` (`NpcSpec.absentUnless`: the townsfolk come home)
- `interiors/harrowmark/act4/index.ts` + `interiors/interiors.plugin.ts` (exit lock `unlessFlag`: the Council Chamber's front door)
- `economy/stock.ts` (`vendorAnchor`), `classes/kits.ts` (`trainerPlacement`), `quests/posts.ts` (`withAfterEndingPosts`)
- `companions/act4/benchPosts.ts` (benched companions at the Tilted Anvil)
- `map/regionLayer.ts` + `map/strings.en.ts` ("Harrowmark (retaken)")
- `rendering/ashfall.ts` (gone under Rekindle, half under Let It Die)

Already done by N0 (item 10): the gate faces (`CITY_HELD_OPEN_WHEN`), `WAYSTONE_DARK`, the no-strand rule.
