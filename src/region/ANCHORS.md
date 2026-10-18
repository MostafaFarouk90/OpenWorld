# Brightwater anchors, triggers and structures

Generated from `brightwater.layout.ts` by `npx vite-node tools/gen-region-docs.ts`; a test fails when this file drifts.
Metres from the origin, +Z north, yaw 0 faces -Z, yaw 90 faces -X. Anchor `y` is absolute and computed from the terrain at runtime.

## Anchors

| id | x | z | dy | yaw | tags |
| --- | --- | --- | --- | --- | --- |
| brightwater.player-spawn | 0 | 0 | 0 | 180 | spawn |
| brightwater.loft-bed | 0 | 2 | 0 | 180 | poi |
| brightwater.gate | 0 | 25 | 0 | 180 | poi |
| brightwater.scarecrow | 3 | 27 | 0 | 180 | spawn, scarecrow |
| lane.start | 0 | 32 | 0 | 180 | poi |
| lane.cart | 0 | 66 | 0 | 180 | poi |
| lane.fence | 0 | 87 | 0 | 180 | poi |
| lane.end | 0 | 108 | 0 | 180 | poi |
| kettlewick.square | 3 | 127 | 0 | 180 | poi |
| kettlewick.gate | 0 | 165 | 0 | 180 | poi |
| kettlewick.bakery-door | 17 | 132 | 0 | 270 | poi |
| kettlewick.bakery-counter | 25 | 132 | 0 | 90 | poi |
| kettlewick.barrel | 27 | 135 | 0 | 180 | interact |
| kettlewick.bakery-hearth | 21.5 | 129 | 0 | 180 | interact |
| kettlewick.bakery-fire | 26 | 128 | 0 | 180 | fx |
| kettlewick.notice-board | -9 | 124 | 0 | 180 | interact |
| kettlewick.tavern-door | -16 | 132 | 0 | 90 | poi |
| yard.centre | -45 | 120 | 0 | 180 | poi |
| yard.board | -45 | 127 | 0 | 0 | poi |
| yard.dummy-1 | -40 | 117 | 0 | 180 | dummy |
| yard.dummy-2 | -50 | 117 | 0 | 180 | dummy |
| yard.blocker | -52 | 125 | 0 | 270 | replay |
| yard.dodge-lane | -36 | 125 | 0 | 180 | replay |
| yard.pole-1 | -53.5 | 111 | 0 | 270 | replay |
| yard.pole-2 | -53.5 | 121 | 0 | 270 | replay |
| chapel.yard-centre | 32 | 60 | 0 | 270 | poi |
| chapel.door | 46 | 60 | 0 | 270 | poi, door |
| chapel.kneel | 53 | 60 | 0 | 270 | poi |
| chapel.altar | 57 | 60 | 0 | 270 | poi |
| chapel.banner-1 | 45.6 | 54 | 5 | 90 | elevated, banner |
| chapel.banner-2 | 45.6 | 57 | 5 | 90 | elevated, banner |
| chapel.banner-3 | 45.6 | 63 | 5 | 90 | elevated, banner |
| waystone.chapel | 40 | 45 | 0 | 180 | waystone |
| waystone.kettlewick | 12 | 156 | 0 | 180 | waystone, waystone-lit |
| waystone.north | 10 | 310 | 0 | 180 | waystone |
| npc-post.gaut | -3 | 24 | 0 | 0 | npc-post |
| npc-post.edda | 25 | 131 | 0 | 90 | npc-post |
| npc-post.stane | -40 | 128 | 0 | 270 | npc-post |
| npc-post.aelfreda | 52 | 64 | 0 | 270 | npc-post |
| npc-post.hob | 42 | 47 | 0 | 180 | npc-post |
| npc-post.wynn | -9 | 44 | 0 | 270 | npc-post |
| beat.t01.start | 0 | 2 | 0 | 180 | beat |
| beat.t02.start | 3 | 26 | 0 | 180 | beat |
| beat.t03.start | 0 | 32 | 0 | 180 | beat |
| beat.t04.start | 40 | 60 | 0 | 270 | beat |
| beat.t05.start | 38 | 60 | 0 | 270 | beat |
| beat.t06.start | 40 | 60 | 0 | 90 | beat |
| beat.t07.start | 0 | 62 | 0 | 180 | beat |
| beat.t08.start | 0 | 95 | 0 | 180 | beat |
| beat.t09.start | 0 | 112 | 0 | 180 | beat |
| beat.t10.start | 0 | 114 | 0 | 180 | beat |
| beat.t11.start | 0 | 120 | 0 | 180 | beat |
| beat.t12.start | 14 | 132 | 0 | 270 | beat |
| beat.t13.start | 24 | 133 | 0 | 180 | beat |
| beat.t14.start | 38 | 48 | 0 | 180 | beat |
| beat.t15.start | 0 | 158 | 0 | 180 | beat |
| spawn.t05.wraith-1 | 30 | 52 | 0 | 270 | spawn |
| spawn.t05.wraith-2 | 30 | 68 | 0 | 270 | spawn |
| spawn.t05.wraith-3 | 36 | 60 | 0 | 270 | spawn |
| spawn.t08.wraith-1 | -3 | 104 | 0 | 0 | spawn |
| spawn.t08.wraith-2 | 3 | 106 | 0 | 0 | spawn |
| spawn.t08.wraith-3 | 0 | 110 | 0 | 0 | spawn |
| spawn.t09.soldier-1 | 0 | 120 | 0 | 0 | spawn |
| spawn.t10.wraith-1 | 0 | 124 | 0 | 0 | spawn |
| spawn.t11.wraith-1 | -8 | 138 | 0 | 0 | spawn |
| spawn.t11.wraith-2 | 8 | 138 | 0 | 0 | spawn |
| spawn.t11.wraith-3 | 0 | 142 | 0 | 0 | spawn |
| spawn.t15.wave-1 | -8 | 190 | 0 | 0 | spawn |
| spawn.t15.wave-2 | 8 | 190 | 0 | 0 | spawn |
| spawn.t15.wave-3 | -4 | 198 | 0 | 0 | spawn |
| spawn.t15.wave-4 | 4 | 198 | 0 | 0 | spawn |
| m01.villager-1 | -18 | 150 | 0 | 270 | villager |
| m01.villager-2 | 22 | 110 | 0 | 90 | villager |
| m01.villager-3 | -10 | 56 | 0 | 270 | villager |
| spawn.m01.wraith-1 | 0 | 45 | 0 | 180 | spawn |
| spawn.m01.wraith-2 | 0 | 80 | 0 | 180 | spawn |
| spawn.m01.wraith-3 | -4 | 128 | 0 | 180 | spawn |
| spawn.m01.wraith-4 | 4 | 150 | 0 | 180 | spawn |
| spawn.m01.wraith-5 | -6 | 112 | 0 | 180 | spawn |
| patrol.north.1 | 20 | 400 | 0 | 180 | patrol |
| patrol.north.2 | 0 | 420 | 0 | 180 | patrol |
| patrol.north.3 | -20 | 400 | 0 | 180 | patrol |
| patrol.north.4 | 0 | 380 | 0 | 180 | patrol |
| spawn.patrol.wraith-1 | 0 | 400 | 0 | 180 | spawn |
| waystone.hollin-ford | -398 | -140 | 0 | 180 | waystone |
| ford.toll-post | -412 | -150 | 0 | 90 | spawn, toll-post |
| ford.carters.cart | -441 | -139.5 | 0 | 180 | poi |
| ford.carters.walk-off | -472 | -166 | 0 | 90 | poi |
| spawn.ford.pair-1 | -395 | -158 | 0 | 90 | spawn |
| spawn.ford.pair-2 | -395 | -142 | 0 | 90 | spawn |
| npc-post.gaut.ford | -405 | -156 | 0 | 90 | npc-post |
| npc-post.carter-1 | -445 | -142 | 0 | 270 | npc-post |
| npc-post.carter-2 | -438 | -139.5 | 0 | 90 | npc-post |
| npc-post.tobb | -13 | 134 | 0 | 270 | npc-post |
| poi.leap.chapel-ledge | 72 | 90 | 2 | 0 | poi, leap-gated |
| poi.leap.chapel-ledge.launch | 72 | 84.5 | 0 | 180 | poi |
| chapel.shard-study | 54.5 | 63 | 0 | 180 | interact |
| vault.door | 55.5 | 64.5 | 0 | 0 | poi, door |
| npc-post.aelfreda.vault | 53 | 65.5 | 0 | 270 | npc-post |
| r01.brazier.1 | -16 | 14 | 0 | 180 | fx |
| r01.brazier.2 | -30 | 44 | 0 | 180 | fx |
| r01.scarecrow.1 | -38 | 12 | 0 | 180 | spawn, r01-scarecrow |
| r01.scarecrow.2 | -38 | 28 | 0 | 180 | spawn, r01-scarecrow |
| r01.scarecrow.3 | -38 | 46 | 0 | 180 | spawn, r01-scarecrow |
| r01.scarecrow.4 | -10 | 12 | 0 | 180 | spawn, r01-scarecrow |
| r01.scarecrow.5 | -10 | 24 | 0 | 180 | spawn, r01-scarecrow |
| r01.scarecrow.6 | -24 | 28 | 0 | 180 | spawn, r01-scarecrow |
| poi.leap.reed-island | 55 | -300 | 2 | 0 | poi, leap-gated |
| poi.leap.reed-island.launch | 55 | -305.5 | 0 | 180 | poi |
| wardstone.1 | 300 | -146 | 0 | 180 | wardstone |
| wardstone.2 | 420 | -146 | 0 | 180 | wardstone |
| wardstone.3 | 540 | -146 | 0 | 180 | wardstone |
| wardstone.4 | 660 | -146 | 0 | 180 | wardstone |
| wardstone.5 | 780 | -146 | 0 | 180 | wardstone |
| shrine.quenchstone.basin | 965 | -165 | 0 | 180 | poi |
| waystone.quenchstone | 965 | -162 | 0 | 180 | waystone |
| fog.harrowmark | 1100 | -150 | 0 | 270 | poi |
| spawn.deadroad.patrol-1 | 240 | -150 | 0 | 270 | spawn |
| spawn.deadroad.patrol-2 | 620 | -150 | 0 | 270 | spawn |
| patrol.deadroad.1.1 | 220 | -150 | 0 | 270 | patrol |
| patrol.deadroad.1.2 | 240 | -150 | 0 | 270 | patrol |
| patrol.deadroad.1.3 | 260 | -150 | 0 | 270 | patrol |
| patrol.deadroad.1.4 | 240 | -138 | 0 | 270 | patrol |
| patrol.deadroad.2.1 | 600 | -150 | 0 | 270 | patrol |
| patrol.deadroad.2.2 | 620 | -150 | 0 | 270 | patrol |
| patrol.deadroad.2.3 | 640 | -150 | 0 | 270 | patrol |
| patrol.deadroad.2.4 | 620 | -138 | 0 | 270 | patrol |
| pile.churchyard.1 | 28 | 54 | 0 | 180 | pile |
| pile.churchyard.2 | 34 | 58 | 0 | 180 | pile |
| pile.churchyard.3 | 30 | 64 | 0 | 180 | pile |
| pile.churchyard.4 | 36 | 66 | 0 | 180 | pile |
| pile.deadroad.1 | 150 | -154 | 0 | 180 | pile |
| pile.deadroad.2 | 330 | -154 | 0 | 180 | pile |
| pile.deadroad.3 | 450 | -154 | 0 | 180 | pile |
| pile.deadroad.4 | 570 | -154 | 0 | 180 | pile |
| pile.deadroad.5 | 690 | -154 | 0 | 180 | pile |
| pile.deadroad.6 | 840 | -154 | 0 | 180 | pile |

## Triggers

| id | shape | x | z | size |
| --- | --- | --- | --- | --- |
| trg.t01.gate | sphere | 0 | 25 | r 3 |
| trg.t03.stane | sphere | -38 | 122 | r 5 |
| trg.t03.edda | sphere | 22 | 131 | r 4 |
| trg.t04.chapel | sphere | 50 | 60 | r 5 |
| trg.t06.start | sphere | 40 | 60 | r 3 |
| trg.t06.end | sphere | 0 | 60 | r 3 |
| trg.t07.cart | sphere | 0 | 74 | r 2.5 |
| trg.t07.fence | sphere | 0 | 94 | r 2.5 |
| trg.t11.square | box | 0 | 130 | half 12 x 30 x 12 |
| trg.t12.bakery | box | 24 | 132 | half 4.5 x 30 x 4.5 |
| trg.t14.chapel | sphere | 40 | 45 | r 4 |
| trg.t14.kettlewick | sphere | 12 | 156 | r 4 |
| trg.t15.gate | sphere | 0 | 165 | r 8 |
| trg.yard.board | sphere | -45 | 127 | r 6 |
| trg.region.brightwater-north | box | 0 | 240 | half 80 x 400 x 4 |
| m01.chapel-door | sphere | 43 | 60 | r 3 |
| m02.bakery | box | 24 | 132 | half 4.5 x 30 x 4.5 |
| trg.ford.toll-post | sphere | -410 | -150 | r 9 |
| trg.leap.chapel-ledge | sphere | 72 | 90 | r 2.5 |
| trg.vault.door | sphere | 55.5 | 64.5 | r 2 |
| trg.wardstones.road | box | 540 | -146 | half 260 x 40 x 20 |
| trg.shrine.basin | sphere | 965 | -165 | r 10 |

## Structures

| id | kind | x | z | footprint | mode |
| --- | --- | --- | --- | --- | --- |
| loft | loft | 0 | 0 | 8 x 8 | open |
| gate-lane | gate | 0 | 25 | 8 x 1 | open |
| gate-kettlewick | gate | 0 | 165 | 10 x 1 | open |
| cart | cart | 0 | 70 | 4 x 1 | solid |
| fence-cart-w | fence | -9 | 70 | 14 x 0.6 | solid |
| fence-cart-e | fence | 9 | 70 | 14 x 0.6 | solid |
| fence-lane | fence | 0 | 90 | 32 x 0.6 | solid |
| bakery | bakery | 24 | 132 | 10 x 10 | enterable |
| tavern | tavern | -24 | 132 | 12 x 10 | solid |
| house-01 | house | -16 | 100 | 8 x 8 | solid |
| house-02 | house | 16 | 104 | 8 x 8 | solid |
| house-03 | house | -17 | 118 | 8 x 8 | solid |
| house-04 | house | -24 | 150 | 8 x 8 | solid |
| house-05 | house | 24 | 150 | 8 x 8 | solid |
| house-06 | house | -22 | 164 | 8 x 8 | solid |
| house-07 | house | 22 | 164 | 8 x 8 | solid |
| house-08 | house | -16 | 80 | 8 x 8 | solid |
| house-09 | house | 14 | 76 | 8 x 8 | solid |
| house-10 | house | -16 | 56 | 8 x 8 | solid |
| house-11 | house | -28 | 96 | 8 x 8 | solid |
| house-12 | house | 28 | 110 | 8 x 8 | solid |
| mill | mill | -45 | 165 | 10 x 10 | solid |
| well | well | 0 | 130 | 2 x 2 | solid |
| notice-board | board | -9 | 125 | 2 x 0.4 | solid |
| yard-fence | yard-fence | -45 | 120 | 24 x 24 | open |
| replay-board | board | -45 | 130 | 3 x 0.4 | solid |
| pole-1 | pole | -55 | 111 | 0.4 x 0.4 | solid |
| pole-2 | pole | -55 | 121 | 0.4 x 0.4 | solid |
| chapel | chapel | 52 | 60 | 12 x 18 | enterable |
| altar | altar | 57 | 60 | 1.6 x 3 | solid |
| waystone-chapel | waystone | 40 | 46.8 | 1.6 x 1.6 | solid |
| waystone-kettlewick | waystone | 12 | 157.8 | 1.6 x 1.6 | solid |
| waystone-north | waystone | 10 | 311.8 | 1.6 x 1.6 | solid |
| ford-bridge | bridge | -420 | -150 | 8 x 4 | open |
| ford-cart | cart | -441 | -142 | 2.6 x 1.2 | solid |
| crypt-stair | stair | 55.5 | 66.4 | 2.4 x 2.4 | open |
| chapel-ledge | rock | 72 | 90 | 6 x 5 | solid |
| chapel-wall-n | rock | 72 | 94 | 12 x 3 | solid |
| chapel-wall-w | rock | 67.5 | 90 | 3 x 5 | solid |
| chapel-wall-e | rock | 76.5 | 90 | 3 x 5 | solid |
| reed-island-ledge | rock | 55 | -300 | 6 x 5 | solid |
| reed-island-wall-n | rock | 55 | -296 | 12 x 3 | solid |
| reed-island-wall-w | rock | 50.5 | -300 | 3 x 5 | solid |
| reed-island-wall-e | rock | 59.5 | -300 | 3 x 5 | solid |
| waystone-hollin-ford | waystone | -398 | -138.2 | 1.6 x 1.6 | solid |
| waystone-quenchstone | waystone | 965 | -160.2 | 1.6 x 1.6 | solid |
