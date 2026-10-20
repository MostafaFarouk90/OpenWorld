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
| R02 | 200 | 0.7 | 16 | 5.3 | 6.5 | 12.6 | 30 | -58 | **>25% off** |
| D01 | 266 | 1.0 | 20 | 6.7 | 14.7 | 22.3 | 55 | -59 | **>25% off** |
| **total** | | | | | | **105.7** | **245** | **-57** | **>25% off** |

Beats since batch 1: M03 2 interacts (shard study, candle), 1 leap, 4 kill units, 4 notes (font, Ember, record,
Wulfric's grave); M04 5 kill units (four Footmen and the Toll Sergeant), 1 structure, 3 interacts (wagons), 1 note
(the toll ledger); R01 1 interact, 8 scarecrows, 3 kill units (the root), 2 carries (the stubble fire), 1 note (the
shawl). Since batch 2: M05 1 note (the pilgrim's journal), 4 more kill units (the shrine push); D01 4 more interacts
(three braziers, the altar), 4 more kill units (the antechamber walls), 5 notes (four tablets, the censer). Since batch
3: R02 3 bouts (one yard veteran, then two), with two of Stane's stories and his last word; the chain plays it in the
Practice Yard before Harrowmark (from M06 on it runs in the Bastion yard, same beats).

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

Batch 2 also adds three Dead Road points of interest outside any quest (two waymarker stones and a barrow with two
wraiths); they are exploration and not counted.

### Batch 3 against the target

| quest | before | after | design | after % |
| --- | ---: | ---: | ---: | ---: |
| M06 | 7.2 | 18.1 | 45 | 40 |
| M07 | 17.1 | 19.1 | 40 | 48 |
| R02 | 4.2 | 12.6 | 30 | 42 |
| R03 | 9.4 | 16.3 | 40 | 41 |
| R04 | 13.4 | 18.3 | 40 | 46 |

M07 and R04 lose some travel: M07's giver leg now starts at the Tilted Anvil's sign (where M06 ends) instead of the
South Gate, and R04's pages no longer cross the city three times.

Every batch 1 to 3 quest clears the 40% floor. The act stands at about 262 of 695 (38%): batch 4 (M08 to M10, D02)
carries the rest of the way to the act target, and Mostafa's timed play after batch 1 sets the real-time factor that
decides whether 50% stands.

## Phase B (Harrowmark)

Computed by `estimateTimingFor(h, PHASE_B_PLAN, trails)` inside the Act 1 run A test (src/integration/chapter.e2e.test.ts,
"run A"), same formula and constants, plus four Harrowmark beats:

| constant | value |
| --- | --- |
| stealthSection | 240 s per stealth section (sneaking, waiting out patrols, hiding) |
| chase | 150 s (the M10 courier chase, one attempt) |
| classChoice | 60 s (the trainer desk) |
| drill | 240 s (the class drill, counted as played) |

Beat counts per quest (batch 3 in brackets): M06 1 stealth section (the stealth route; the bribe and the argument skip
it) [1 interact, the gate brazier]; M07 3 kill units (cutpurses), 1 interact (satchel) [3 more, the coins], 1 class
choice, 1 drill; R03 3 kill units (guildhall thugs) [2 more, the snatchers], 1 interact (copper); R04 [4 interacts:
the stacks lock, the page behind it, the archive door in and out; the sexton, the fence and Crabbe are dialogue]; M08 2 interacts (doors; the audience is dialogue); M09 1 stealth section, 5 interacts
(3 invoices, 2 doors); M10 1 chase (the chase line counts as the beat, not as travel); D02 2 interacts, 4 kill units
(kennel hounds), 1 boss (Grimtooth). Route points are the giver posts, the objective anchors and the interior doors;
travel inside an interior counts 0.

| quest | travel m | travel min | nodes | talk min | beats min | estimate min | design min | delta % | |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| M06 | 796 | 2.9 | 33 | 11.0 | 4.2 | 18.1 | 45 | -60 | **>25% off** |
| M07 | 1682 | 6.2 | 15 | 5.0 | 7.9 | 19.1 | 40 | -52 | **>25% off** |
| R03 | 1463 | 5.4 | 21 | 7.0 | 3.9 | 16.3 | 40 | -59 | **>25% off** |
| R04 | 2424 | 9.0 | 26 | 8.7 | 0.7 | 18.3 | 40 | -54 | **>25% off** |
| M08 | 2421 | 9.0 | 14 | 4.7 | 0.3 | 14.0 | 50 | -72 | **>25% off** |
| M09 | 645 | 2.4 | 5 | 1.7 | 4.8 | 8.9 | 55 | -84 | **>25% off** |
| M10 | 1642 | 6.1 | 7 | 2.3 | 2.5 | 10.9 | 45 | -76 | **>25% off** |
| D02 | 1407 | 5.2 | 6 | 2.0 | 9.3 | 16.5 | 60 | -72 | **>25% off** |
| **total** | | | | | | **122.2** | **375** | **-67** | **>25% off** |

Re-measured after batch 3 (M06, M07, R03, R04); M08 to M10 and D02 are unchanged until batch 4.

Harrowmark has the same shape as Phase A: the city legs (R04's three pages cross 2.3 km) are the largest share, and
M09 is almost all interior. Dialogue is short everywhere except the M08 audience (14 nodes).

## Whole act

| part | estimate min | design min |
| --- | ---: | ---: |
| Opening (M01, M02) | 34.4 | 75 |
| Phase A (M03 to M05, R01, R02, D01) | 105.7 | 245 |
| Phase B (M06 to M10, R03, R04, D02) | 122.2 | 375 |
| **Act 1** | **262.3** | **695** |

The tutorial itself (Knighting Day) sits outside these tables; it has its own smoke timing in
plans/knighting-day-smoke.md. Before the density pass the act measured 136 formula minutes without the opening.
