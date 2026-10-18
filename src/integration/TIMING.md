# Phase A play-time estimate

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
