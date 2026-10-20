# Act 1 play-time estimate

Computed by `estimateTiming` (src/integration/timing.ts) inside the chain test (src/integration/chapter.e2e.test.ts,
"Prior released, field saved"), which prints the table below. Positions are the real anchors and trigger volumes of
the booted game; dialogue node counts are what the chain actually read.

## Formula

```
estimate_min = ( travel_m / WALK  +  TALK_NODE x nodes_read  +  sum(beat_count x BEAT) ) / 60
```

- `travel_m`: sum of straight horizontal (x, z) distances between consecutive route points: the giver's post anchor,
  each objective's anchor or trigger centre in play order, back to where the giver stands for the hand-in. Crossing
  the vault door is a load, so that leg counts 0. Since the density pass (batch 1) the in-area leg from where the
  previous quest ended to this quest's giver counts too (`from` in the plan; none across regions, e.g. M05's
  Quenchstone to Wynn). A leg marked `ride` is mounted (RIDE, 9 m/s).
- `nodes_read`: dialogue nodes visited in the chain run (one key press each), offers included. Since batch 1 the chain
  asks every question a hub offers once, as a first-time player would, and a readable note counts as one `note` beat
  instead of its nodes.

## Constants (assumptions, fixed before comparing)

| constant | value |
| --- | --- |
| WALK | 4.5 m/s |
| RIDE | 9 m/s (mounted legs) |
| TALK_NODE | 20 s per dialogue node read |
| killUnit | 45 s per enemy in a kill objective or the fight around it |
| interact | 10 s (shard study, brazier, door, rekindle) |
| leap | 15 s (lining up and making the Surge Leap) |
| structure | 20 s (the toll post) |
| wardstone | 30 s per stone (walk-up, listen, three beats) |
| scarecrow | 30 s each |
| drillEvent | 15 s per counted drill event on the blocking dummies |
| boss | 360 s (the Ashen Prior, intro to outcome) |
| carry | 15 s per carry (pick up and set down; the walk with it is in the route) |
| note | 20 s per readable note (found and read; replaces its nodes) |
| bout | 90 s per sparring opponent (Replay board, batch 3) |
| pole | 30 s per pass of the lock-on pole drill (batch 3) |

Beat counts per quest: M03 1 interact, 1 leap, 4 kill units (the four churchyard wraiths rise together); M04 4 kill
units (both Footman pairs), 1 structure; M05 5 wardstones, 1 interact, 6 kill units (two Dead Road patrols of 3);
R01 1 interact, 6 scarecrows; R02 8 drill events (3 open hits, 3 parries, 2 guard breaks); D01 2 interacts, 4 kill
units (3 vault wraiths and the Blightbloom), 1 boss.

## Result

Re-measured after the density pass, batch 1 (Brightwater: M01, M02, M03, M04, R01). "Before" is the slice 2
measurement (no giver legs, shortest dialogue path, M01 and M02 not played); the rows not touched by batch 1 (M05, R02,
D01) moved only by the new giver legs.

### The opening (M01, M02), played headless since batch 1

| quest | travel m | travel min | nodes | talk min | beats min | estimate min | design min | delta % | |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| M01 | 727 | 2.7 | 29 | 9.7 | 8.0 | 20.4 | 40 | -49 | **>25% off** |
| M02 | 263 | 1.0 | 28 | 9.3 | 3.8 | 14.1 | 35 | -60 | **>25% off** |
| **total** | | | | | | **34.4** | **75** | **-54** | **>25% off** |

Beats: M01 9 kill units (five lane wraiths, four at the mill), 5 carries (three villagers, two buckets); M02 2 carries,
4 interacts (two thatch heaps, the stone, the common hearth), 3 kill units (the oven yard), 1 note (the badge).

### Phase A

| quest | travel m | travel min | nodes | talk min | beats min | estimate min | design min | delta % | |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| M03 | 293 | 1.1 | 31 | 10.3 | 4.9 | 16.3 | 40 | -59 | **>25% off** |
| M04 | 732 | 2.7 | 35 | 11.7 | 4.9 | 19.3 | 45 | -57 | **>25% off** |
| M05 | 1582 | 5.9 | 14 | 4.7 | 10.5 | 21.0 | 40 | -47 | **>25% off** |
| R01 | 430 | 1.6 | 16 | 5.3 | 7.3 | 14.2 | 35 | -59 | **>25% off** |
| R02 | 139 | 0.5 | 5 | 1.7 | 2.0 | 4.2 | 30 | -86 | **>25% off** |
| D01 | 260 | 1.0 | 20 | 6.7 | 14.7 | 22.3 | 55 | -59 | **>25% off** |
| **total** | | | | | | **97.3** | **245** | **-60** | **>25% off** |

Beats since batch 1: M03 2 interacts (shard study, candle), 1 leap, 4 kill units, 4 notes (font, Ember, record,
Wulfric's grave); M04 5 kill units (four Footmen and the Toll Sergeant), 1 structure, 3 interacts (wagons), 1 note
(the toll ledger); R01 1 interact, 8 scarecrows, 3 kill units (the root), 2 carries (the stubble fire), 1 note (the
shawl). Since batch 2: M05 1 note (the pilgrim's journal), 4 more kill units (the shrine push); D01 4 more interacts
(three braziers, the altar), 4 more kill units (the antechamber walls), 5 notes (four tablets, the censer). R02 as
before.

### Batch 1 against the target (50% for the act, 40% floor per quest)

| quest | before | after | design | after % |
| --- | ---: | ---: | ---: | ---: |
| M01 | about 7 | 20.4 | 40 | 51 |
| M02 | about 4 | 14.1 | 35 | 40 |
| M03 | 7.9 | 16.3 | 40 | 41 |
| M04 | 9.1 | 19.3 | 45 | 43 |
| R01 | 6.1 | 14.2 | 35 | 41 |

### Batch 2 against the target

| quest | before | after | design | after % |
| --- | ---: | ---: | ---: | ---: |
| M05 | 15.3 | 21.0 | 40 | 52 |
| D01 | 11.8 | 22.3 | 55 | 41 |

Batch 2 also adds four Dead Road points of interest outside any quest (two waymarker stones, a stone on the Leap-gated
reed-island ledge, and a barrow with two wraiths); they are exploration and not counted.

Every batch 1 and batch 2 quest clears the 40% floor. The act stands at about 229 of 695 (33%): batches 3 and 4
(Harrowmark) carry the rest of the way to the act target, and Mostafa's timed play after batch 1 sets the real-time
factor that decides whether 50% stands.

## Phase B (Harrowmark)

Computed by `estimateTimingFor(h, PHASE_B_PLAN, trails)` inside the Act 1 run A test (src/integration/chapter.e2e.test.ts,
"run A"), same formula and constants, plus four Harrowmark beats:

| constant | value |
| --- | --- |
| stealthSection | 240 s per stealth section (sneaking, waiting out patrols, hiding) |
| chase | 150 s (the M10 courier chase, one attempt) |
| classChoice | 60 s (the trainer desk) |
| drill | 240 s (the class drill, counted as played) |

Beat counts per quest: M06 1 stealth section (the stealth route; the bribe and the argument skip it); M07 3 kill units
(cutpurses), 1 interact (satchel), 1 class choice, 1 drill; R03 3 kill units (guildhall thugs), 1 interact (copper);
R04 3 interacts (pages); M08 2 interacts (doors; the audience is dialogue); M09 1 stealth section, 5 interacts
(3 invoices, 2 doors); M10 1 chase (the chase line counts as the beat, not as travel); D02 2 interacts, 4 kill units
(kennel hounds), 1 boss (Grimtooth). Route points are the giver posts, the objective anchors and the interior doors;
travel inside an interior counts 0.

| quest | travel m | travel min | nodes | talk min | beats min | estimate min | design min | delta % | |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| M06 | 144 | 0.5 | 8 | 2.7 | 4.0 | 7.2 | 45 | -84 | **>25% off** |
| M07 | 2161 | 8.0 | 5 | 1.7 | 7.4 | 17.1 | 40 | -57 | **>25% off** |
| R03 | 1436 | 5.3 | 5 | 1.7 | 2.4 | 9.4 | 40 | -76 | **>25% off** |
| R04 | 3041 | 11.3 | 5 | 1.7 | 0.5 | 13.4 | 40 | -66 | **>25% off** |
| M08 | 2421 | 9.0 | 14 | 4.7 | 0.3 | 14.0 | 50 | -72 | **>25% off** |
| M09 | 645 | 2.4 | 5 | 1.7 | 4.8 | 8.9 | 55 | -84 | **>25% off** |
| M10 | 1642 | 6.1 | 7 | 2.3 | 2.5 | 10.9 | 45 | -76 | **>25% off** |
| D02 | 1407 | 5.2 | 6 | 2.0 | 9.3 | 16.5 | 60 | -72 | **>25% off** |
| **total** | | | | | | **97.4** | **375** | **-74** | **>25% off** |

Re-measured with the giver legs (batch 1); the Harrowmark content is unchanged until batches 3 and 4, so the change
from 84.2 is the legs alone.

Harrowmark has the same shape as Phase A: the city legs (R04's three pages cross 2.3 km) are the largest share, and
M09 is almost all interior. Dialogue is short everywhere except the M08 audience (14 nodes).

## Whole act

| part | estimate min | design min |
| --- | ---: | ---: |
| Opening (M01, M02) | 34.4 | 75 |
| Phase A (M03 to M05, R01, R02, D01) | 97.3 | 245 |
| Phase B (M06 to M10, R03, R04, D02) | 97.4 | 375 |
| **Act 1** | **229.1** | **695** |

The tutorial itself (Knighting Day) sits outside these tables; it has its own smoke timing in
plans/knighting-day-smoke.md. Before the density pass the act measured 136 formula minutes without the opening.
