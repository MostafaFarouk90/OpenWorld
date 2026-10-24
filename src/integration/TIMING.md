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

### Batch 4 against the target

| quest | before | after | design | after % |
| --- | ---: | ---: | ---: | ---: |
| M08 | 14.0 | 22.4 | 50 | 45 |
| M09 | 8.9 | 26.0 | 55 | 47 |
| M10 | 10.9 | 18.6 | 45 | 41 |
| D02 | 16.5 | 24.4 | 60 | 41 |

Every Act 1 quest now clears the 40% floor. The act stands at about 303 of 695 formula minutes (44%), short of the 50%
act target by about 45 minutes. The four batch 4 quests were the last ones in the pass; closing the gap means either
more Act 1 content outside the quest chain (Harrowmark and Dead Road side activities, which the formula does not count
today) or a real-time factor from a timed play that shows formula minutes undercount real play (Mostafa's timed run of
Brightwater was asked for after batch 1).

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
(kennel hounds), 1 boss (Grimtooth). Batch 4 adds: M08 1 note (the screen; the armourer, the warden, Merrin, Grisel
and the king's own question are dialogue); M09 1 note (the day-book), 4 interacts (the satchel key, the strongbox, the
door out to Simeon and back in to Merrin); M10 1 note (the orders), 2 kill units (Vey's men), and the ride from the
stables to the South Gate as travel; D02 1 note (the tally; the den's crates are read as dialogue nodes), 2 interacts
(the valves), 5 kill units (two strays, three sluice hounds). Route points are the giver posts, the objective anchors and the interior doors;
travel inside an interior counts 0.

| quest | travel m | travel min | nodes | talk min | beats min | estimate min | design min | delta % | |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| M06 | 796 | 2.9 | 33 | 11.0 | 4.2 | 18.1 | 45 | -60 | **>25% off** |
| M07 | 1682 | 6.2 | 15 | 5.0 | 7.9 | 19.1 | 40 | -52 | **>25% off** |
| R03 | 1463 | 5.4 | 21 | 7.0 | 3.9 | 16.3 | 40 | -59 | **>25% off** |
| R04 | 2424 | 9.0 | 26 | 8.7 | 0.7 | 18.3 | 40 | -54 | **>25% off** |
| M08 | 2456 | 9.1 | 38 | 12.7 | 0.7 | 22.4 | 50 | -55 | **>25% off** |
| M09 | 3383 | 12.5 | 23 | 7.7 | 5.8 | 26.0 | 55 | -53 | **>25% off** |
| M10 | 2137 | 7.9 | 19 | 6.3 | 4.3 | 18.6 | 45 | -59 | **>25% off** |
| D02 | 1248 | 4.6 | 17 | 5.7 | 14.1 | 24.4 | 60 | -59 | **>25% off** |
| **total** | | | | | | **163.3** | **375** | **-56** | **>25% off** |

Re-measured after batch 4 (M08 to M10, D02); M06, M07, R03 and R04 as after batch 3.

Harrowmark has the same shape as Phase A: the city legs (R04's three pages cross 2.3 km) are the largest share, and
M09 now has a real city leg (the key from the Tilted Anvil and back). The M08 audience and its court are the longest
dialogue (38 nodes).

## Whole act

| part | estimate min | design min |
| --- | ---: | ---: |
| Opening (M01, M02) | 34.4 | 75 |
| Phase A (M03 to M05, R01, R02, D01) | 105.7 | 245 |
| Phase B (M06 to M10, R03, R04, D02) | 163.3 | 375 |
| **Act 1** | **303.4** | **695** |

The tutorial itself (Knighting Day) sits outside these tables; it has its own smoke timing in
plans/knighting-day-smoke.md. Before the density pass the act measured 136 formula minutes without the opening.

# Act 2 play-time estimate (Phase C)

Act 2 uses the same formula with the extra constants below (`ACT2_BEAT_S`, `ROUTE_FOLLOW_MPS`, `ACT2_TRAVEL_CAP` in
src/integration/timing.ts), a **shorter-branch** rule for choice quests, and an **opt-in travel cap**. The cap makes
Act 2's figures stricter than Act 1's and not comparable with the 44% above: Act 1 counts all travel (R04 travels 9.0 of
18.3 min, M09 12.5 of 26.0), Act 2 counts travel up to 3/7 of the talk-and-beats time, so riding alone can never meet a
floor. Act 1's tables above do not move.

New constants: search 20 s, carry 15 s, wave enemy 45 s, herded animal 45 s, duel round 90 s, rhythm run 60 s, puzzle
attempt 120 s, lift ride 30 s, set piece 60 s, structure (cart, boulder) 65 s, route-follow 2 m/s, mounted 9 m/s.

The rule (plan Part 7, Q7): the act reaches 50% of its design minutes and every quest clears **40% of its own design
minutes** on its shorter branch. The floor fails the test (`src/integration/act2Timing.test.ts`,
`src/quests/content/act2/pacing.test.ts`); the 50% aggregate is reported only. The plan's Part 7 arithmetic is checked
exactly (Phase C: 460 design min, 236.3 min estimated, 51.4%); shipped content is checked one-sided (under the floor
fails, over is fine).

## Phase C as shipped (A12's rows on the real anchors, capped travel)

| quest | design min | floor 40% | estimate min | uncapped min | travel m |
| --- | ---: | ---: | ---: | ---: | ---: |
| M11 | 45 | 18 | 32.3 | 41.0 | 7160 |
| M12 | 50 | 20 | 39.9 | 44.5 | 8174 |
| R06 | 40 | 16 | 20.8 | 20.8 | 1216 |
| R05 | 35 | 14 | 22.5 | 23.5 | 2105 |
| M13 | 50 | 20 | 21.6 | 21.6 | 445 |
| R07 | 35 | 14 | 14.1 | 14.1 | 516 |
| R11 | 40 | 16 | 22.5 | 22.5 | 1641 |
| M14 | 55 | 22 | 27.1 | 27.1 | 1331 |
| M15 | 50 | 20 | 22.8 | 22.8 | 227 |
| D03 | 60 | 24 | 30.0 | 30.0 | 423 |
| **Phase C** | **460** | **184** | **253.6** | | |

Phase C reaches 55.1% of its design minutes as shipped (the plan figure is 51.4%). Thin margins: R07 (14.1 against a
floor of 14), R11 (17.1 against 16), M13 (21.6 against 20), M15 (22.8 against 20). Taking a beat out of R07 or R11 fails the test.

## Phase C on the nodes the headless run read (A16)

The estimator can also take the node count a driver actually read (`estimatePaceRow` with `trailNodes`), which catches
a row that assumes dialogue a player never reaches. Run A and run B of the Phase C chain now assert this: R07 holds its
floor of 14 (14.1 on the spare branch, 16.1 on the cull branch), every other quest holds 40% of its design minutes.

- R07: the choice talk with Ketta used to end the quest (its end completes the later `report` talk), so the report
  dialogue was never heard and the real run was 12.1 minutes. Ketta's two choice outcomes now carry the closing words
  (six more nodes each): 24 nodes read, 14.1 / 16.1.
- R11 (13.4 against a static floor of 16, 22 of 32 nodes) and M14 (20.8 against 22, 30 of 38) read fewer nodes than their
  rows. Polish pass P1 added closing beats in the existing voice: Wynne's widow talk (+5 nodes) and Hrolf's report (+5) for R11,
  the lantern-keeper (+3) and Aelfreda's brief and rite (+5) for M14. The played trail now reads 33 and 42 nodes and the runs
  measure R11 17.1 (floor 16) and M14 24.8 (floor 22), gated on the static floors in phaseC.runA and runB. The pace rows
  carry the new node counts (33, 42), so the shipped table above moved to 22.5 and 27.1. The authored beats add 10 and 8
  nodes (22 to 32, 30 to 38); the census reads 1 and 4 more than that. `trailNodes` sums every node of each talk the trail
  opens, so the extra nodes are connecting nodes of the existing talks the new beats sit in (a lengthened closing segment, the
  entry or hand-off node of a talk now reached), not further beats. They were not traced node by node; a re-measure that
  lands on 33 and 42 is therefore not drift.
- M12: the plan row (Part 7 estimate 27.6) is re-baselined to the shipped 39.9 (about 45% over plan, content kept, not
  trimmed); the plan row in act2Timing.test.ts and the pace row design figure now read 39.9.

## Phase D (Oldsmoke and Deepgate)

Estimator additions: `PHASE_D_DESIGN` (505 design minutes: M16 45, M17 45, R09 35, R08 40, M18 50, R10 45, M19 50, M20 45,
M21 40, D04 65, M22 45), `DOOR_LEG_M` (a route leg over 400 m is a lift or door hop and counts no travel), and
`estimatePaceRow` (rows with ride and follow legs, capped travel). The chain tests (phaseD.runA / runB) play the real
objectives from the Phase C complete saves and assert 40% of design on the branch each run took.

| quest | run A min | run B min | 40% floor |
| --- | ---: | ---: | ---: |
| M16 | 20.7 | 20.7 | 18 |
| M17 | 25.5 | 25.5 | 18 |
| R09 | 21.2 | 21.2 | 14 |
| R08 | 18.9 | 18.9 | 16 |
| M18 | 24.0 | 24.0 | 20 |
| R10 | 21.1 | 27.1 | 18 |
| M19 | 22.2 | 22.2 | 20 |
| M20 | 22.1 | 22.1 | 18 |
| M21 | 18.5 | 21.3 | 16 |
| D04 | 31.8 | 31.8 | 26 |
| M22 | 26.1 | 26.1 | 18 |
| **Phase D** | **252.2** | **261.0** | **202** |

About 50% of design on both runs. Two corrections came out of driving it honestly:

- M19: Wenna's six route barks play as she advances, so the driver walks the route (before the doors, then to the
  nursery); the real run is 22.2 against 20.
- M21: the offer talk ended the quest's first objective, so Wenna's counsel was never heard (39 of 46 nodes). The
  counsel now follows the offer in the same talk: 47 / 45 nodes, 18.5 / 21.3.
