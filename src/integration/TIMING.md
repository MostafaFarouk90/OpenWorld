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
  the vault door is a load, so that leg counts 0. Travel between quests (giver to giver) is not counted.
- `nodes_read`: dialogue nodes visited in the chain run (one key press each), offers included.

## Constants (assumptions, fixed before comparing)

| constant | value |
| --- | --- |
| WALK | 4.5 m/s |
| TALK_NODE | 20 s per dialogue node read |
| killUnit | 45 s per enemy in a kill objective or the fight around it |
| interact | 10 s (shard study, brazier, door, rekindle) |
| leap | 15 s (lining up and making the Surge Leap) |
| structure | 20 s (the toll post) |
| wardstone | 30 s per stone (walk-up, listen, three beats) |
| scarecrow | 30 s each |
| drillEvent | 15 s per counted drill event on the blocking dummies |
| boss | 360 s (the Ashen Prior, intro to outcome) |

Beat counts per quest: M03 1 interact, 1 leap, 4 kill units (the four churchyard wraiths rise together); M04 4 kill
units (both Footman pairs), 1 structure; M05 5 wardstones, 1 interact, 6 kill units (two Dead Road patrols of 3);
R01 1 interact, 6 scarecrows; R02 8 drill events (3 open hits, 3 parries, 2 guard breaks); D01 2 interacts, 4 kill
units (3 vault wraiths and the Blightbloom), 1 boss.

## Result

| quest | travel m | travel min | nodes | talk min | beats min | estimate min | design min | delta % | |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| M03 | 124 | 0.5 | 12 | 4.0 | 3.4 | 7.9 | 40 | -80 | **>25% off** |
| M04 | 572 | 2.1 | 11 | 3.7 | 3.3 | 9.1 | 45 | -80 | **>25% off** |
| M05 | 1086 | 4.0 | 7 | 2.3 | 7.2 | 13.5 | 40 | -66 | **>25% off** |
| R01 | 168 | 0.6 | 7 | 2.3 | 3.2 | 6.1 | 35 | -83 | **>25% off** |
| R02 | 50 | 0.2 | 5 | 1.7 | 2.0 | 3.9 | 30 | -87 | **>25% off** |
| D01 | 93 | 0.3 | 5 | 1.7 | 9.3 | 11.3 | 55 | -79 | **>25% off** |
| **total** | | | | | | **51.8** | **245** | **-79** | **>25% off** |

Every quest is flagged: the content as built is about a fifth of the design minutes. The largest share is M05's
1.1 km road walk (4 min); no quest has enough dialogue (5 to 12 nodes) or fights to approach its budget. Even
doubling every beat constant and the dialogue time leaves the total near 100 minutes. Either the design minutes
assume content not built yet (side activities, exploration, deaths and retries), or the quests need more beats.

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
| M06 | 136 | 0.5 | 8 | 2.7 | 4.0 | 7.2 | 45 | -84 | **>25% off** |
| M07 | 1668 | 6.2 | 5 | 1.7 | 7.4 | 15.3 | 40 | -62 | **>25% off** |
| R03 | 1348 | 5.0 | 5 | 1.7 | 2.4 | 9.1 | 40 | -77 | **>25% off** |
| R04 | 2307 | 8.5 | 5 | 1.7 | 0.5 | 10.7 | 40 | -73 | **>25% off** |
| M08 | 1736 | 6.4 | 14 | 4.7 | 0.3 | 11.4 | 50 | -77 | **>25% off** |
| M09 | 13 | 0.0 | 5 | 1.7 | 4.8 | 6.5 | 55 | -88 | **>25% off** |
| M10 | 1167 | 4.3 | 7 | 2.3 | 2.5 | 9.2 | 45 | -80 | **>25% off** |
| D02 | 935 | 3.5 | 6 | 2.0 | 9.3 | 14.8 | 60 | -75 | **>25% off** |
| **total** | | | | | | **84.2** | **375** | **-78** | **>25% off** |

Harrowmark has the same shape as Phase A: the city legs (R04's three pages cross 2.3 km) are the largest share, and
M09 is almost all interior. Dialogue is short everywhere except the M08 audience (14 nodes).

## Whole act

| part | estimate min | design min |
| --- | ---: | ---: |
| Phase A (M03 to M05, R01, R02, D01) | 51.8 | 245 |
| Phase B (M06 to M10, R03, R04, D02) | 84.2 | 375 |
| **Phase A + B** | **136.0** | **620** |
| tutorial and Brightwater opening (M01, M02), not estimated here | n/a | 75 |
| **Act 1** | **136.0 + opening** | **695** |

The 75 design minutes of the opening sit outside both tables (slice 1 shipped them and has its own smoke timing in
plans/knighting-day-smoke.md). The review's ruling names D01 with M01 and M02; D01's 55 minutes are already in the
Phase A table, so they are not counted twice. Without the opening the built act runs at about 22% of its design
minutes; the conclusion above holds for the whole act.
