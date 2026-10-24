# Greyfen anchors, triggers and structures

Generated from `greyfen.layout.ts` by `npx vite-node tools/gen-region-docs.ts`; a test fails when this file drifts.
Metres from the origin, +Z north, yaw 0 faces -Z, yaw 90 faces -X. Anchor `y` is absolute and computed from the terrain at runtime.

## Anchors

| id | x | z | dy | yaw | tags |
| --- | --- | --- | --- | --- | --- |
| waystone.reedgate | 3200 | 10198.2 | 0 | 180 | waystone |
| npc-post.leofa.reedgate | 3204 | 10174 | 0 | 180 | npc-post |
| greyfen.reedgate.folk.1 | 3190 | 10184 | 0 | 180 | npc-post |
| greyfen.reedgate.folk.2 | 3210 | 10184 | 0 | 180 | npc-post |
| greyfen.reedgate.folk.3 | 3196 | 10170 | 0 | 180 | npc-post |
| greyfen.reedgate.centre | 3200 | 10180 | 0 | 180 | flood-seed |
| greyfen.ferry.reedgate | 3594.02 | 10129.91 | 2.66 | 348.69 |  |
| greyfen.ferry.reedgate.shore | 3595.98 | 10120.1 | 0 | 348.69 |  |
| npc-post.dudda.ferry | 3594 | 10094 | 0 | 270 | npc-post |
| npc-post.hild.ferry | 3591 | 10097 | 0 | 270 | npc-post |
| greyfen.ferry.hand.1 | 3602 | 10088 | 0 | 180 | npc-post |
| greyfen.ferry.hand.2 | 3596 | 10086 | 0 | 180 | npc-post |
| npc-post.widow.ferry | 3584 | 10088 | 0 | 225 | npc-post |
| greyfen.m24.sound.1 | 3704 | 10211 | 0 | 180 | objective |
| greyfen.m24.sound.2 | 3702 | 10223 | 0 | 180 | objective |
| greyfen.m24.sound.3 | 3714 | 10218 | 0 | 180 | objective |
| greyfen.m24.sound.4 | 3715 | 10228 | 0 | 180 | objective |
| greyfen.m24.sound.5 | 3706 | 10236 | 0 | 180 | objective |
| greyfen.m24.pool | 3630 | 10093 | 0 | 180 | objective |
| greyfen.m24.pool.entry | 3623 | 10100 | 0 | 270 | objective |
| greyfen.m24.pool.horn | 3630 | 10100 | 0 | 180 | objective |
| greyfen.m24.horn.blow | 3594.8 | 10125.99 | 1.05 | 168.69 | objective |
| greyfen.spawn.m24.wreck.1 | 3707.54 | 10214.54 | 0 | 180 | spawn |
| greyfen.spawn.m24.wreck.2 | 3707.54 | 10207.46 | 0 | 180 | spawn |
| greyfen.spawn.m24.wreck.3 | 3700.46 | 10207.46 | 0 | 180 | spawn |
| greyfen.spawn.m24.wreck.4 | 3700.46 | 10214.54 | 0 | 180 | spawn |
| npc-post.ranger.causeway | 3158.44 | 10249.95 | 0 | 177.95 | npc-post |
| greyfen.m23.search.1 | 3148.09 | 10539.77 | 0 | 180 | objective |
| greyfen.m23.search.2 | 3143.35 | 10739.72 | 0 | 180 | objective |
| greyfen.m23.search.3 | 3109.54 | 11037.7 | 0 | 180 | objective |
| greyfen.spawn.m23.knot.1.1 | 3145.08 | 10685.75 | 0 | 180 | spawn |
| greyfen.spawn.m23.knot.1.2 | 3142.94 | 10689.68 | 0 | 180 | spawn |
| greyfen.spawn.m23.knot.1.3 | 3143.8 | 10693.71 | 0 | 180 | spawn |
| greyfen.spawn.m23.knot.2.1 | 3093.88 | 11182.88 | 0 | 180 | spawn |
| greyfen.spawn.m23.knot.2.2 | 3091.41 | 11186.6 | 0 | 180 | spawn |
| greyfen.spawn.m23.knot.2.3 | 3091.91 | 11190.69 | 0 | 180 | spawn |
| greyfen.spawn.m23.knot.3.1 | 3037.25 | 11679.62 | 0 | 180 | spawn |
| greyfen.spawn.m23.knot.3.2 | 3034.85 | 11683.39 | 0 | 180 | spawn |
| greyfen.spawn.m23.knot.3.3 | 3035.43 | 11687.47 | 0 | 180 | spawn |
| greyfen.m23.bridge.1 | 3133.14 | 10855.72 | 0 | 172.98 | objective |
| greyfen.m23.bridge.1.far | 3130.58 | 10876.57 | 0 | 352.98 | objective |
| greyfen.m23.bridge.2 | 3056.37 | 11485.05 | 0 | 174.09 | objective |
| greyfen.m23.bridge.2.far | 3054.16 | 11506.44 | 0 | 354.09 | objective |
| greyfen.r12.bed.1 | 3020 | 10620 | 0 | 180 | objective |
| greyfen.r12.bed.1.torch | 3034 | 10620 | 0 | 90 | objective |
| greyfen.r12.bed.1.cut.1 | 3020 | 10612 | 0 | 180 | objective |
| greyfen.r12.bed.1.cut.2 | 3020 | 10628 | 0 | 180 | objective |
| greyfen.spawn.r12.bed.1.1 | 3024.5 | 10627.79 | 0 | 180 | spawn |
| greyfen.spawn.r12.bed.1.2 | 3024.5 | 10612.21 | 0 | 180 | spawn |
| greyfen.spawn.r12.bed.1.3 | 3011 | 10620 | 0 | 180 | spawn |
| greyfen.r12.bed.2 | 3020 | 10850 | 0 | 180 | objective |
| greyfen.r12.bed.2.torch | 3034 | 10850 | 0 | 90 | objective |
| greyfen.r12.bed.2.cut.1 | 3020 | 10842 | 0 | 180 | objective |
| greyfen.r12.bed.2.cut.2 | 3020 | 10858 | 0 | 180 | objective |
| greyfen.spawn.r12.bed.2.1 | 3024.5 | 10857.79 | 0 | 180 | spawn |
| greyfen.spawn.r12.bed.2.2 | 3024.5 | 10842.21 | 0 | 180 | spawn |
| greyfen.spawn.r12.bed.2.3 | 3011 | 10850 | 0 | 180 | spawn |
| greyfen.r12.bed.3 | 3020 | 11080 | 0 | 180 | objective |
| greyfen.r12.bed.3.torch | 3034 | 11080 | 0 | 90 | objective |
| greyfen.r12.bed.3.cut.1 | 3020 | 11072 | 0 | 180 | objective |
| greyfen.r12.bed.3.cut.2 | 3020 | 11088 | 0 | 180 | objective |
| greyfen.spawn.r12.bed.3.1 | 3024.5 | 11087.79 | 0 | 180 | spawn |
| greyfen.spawn.r12.bed.3.2 | 3024.5 | 11072.21 | 0 | 180 | spawn |
| greyfen.spawn.r12.bed.3.3 | 3011 | 11080 | 0 | 180 | spawn |
| greyfen.r12.bed.4 | 3260 | 10735 | 0 | 180 | objective |
| greyfen.r12.bed.4.torch | 3246 | 10735 | 0 | 270 | objective |
| greyfen.r12.bed.4.cut.1 | 3260 | 10727 | 0 | 180 | objective |
| greyfen.r12.bed.4.cut.2 | 3260 | 10743 | 0 | 180 | objective |
| greyfen.spawn.r12.bed.4.1 | 3264.5 | 10742.79 | 0 | 180 | spawn |
| greyfen.spawn.r12.bed.4.2 | 3264.5 | 10727.21 | 0 | 180 | spawn |
| greyfen.spawn.r12.bed.4.3 | 3251 | 10735 | 0 | 180 | spawn |
| greyfen.r12.bed.5 | 3260 | 10965 | 0 | 180 | objective |
| greyfen.r12.bed.5.torch | 3246 | 10965 | 0 | 270 | objective |
| greyfen.r12.bed.5.cut.1 | 3260 | 10957 | 0 | 180 | objective |
| greyfen.r12.bed.5.cut.2 | 3260 | 10973 | 0 | 180 | objective |
| greyfen.spawn.r12.bed.5.1 | 3264.5 | 10972.79 | 0 | 180 | spawn |
| greyfen.spawn.r12.bed.5.2 | 3264.5 | 10957.21 | 0 | 180 | spawn |
| greyfen.spawn.r12.bed.5.3 | 3251 | 10965 | 0 | 180 | spawn |
| greyfen.r12.search.1 | 3026 | 10632 | 0 | 180 | objective |
| greyfen.r12.search.2 | 3026 | 11092 | 0 | 180 | objective |
| greyfen.r12.search.3 | 3266 | 10977 | 0 | 180 | objective |
| greyfen.r12.cutter.1 | 3064 | 10620 | 0 | 180 | npc-post |
| greyfen.r12.cutter.2 | 3216 | 10735 | 0 | 180 | npc-post |
| greyfen.mere.shrine | 3000 | 12045 | 0 | 180 | objective |
| waystone.hathrens-mere | 2986 | 12043.2 | 0 | 180 | waystone |
| npc-post.leofa.mere | 3012 | 12036 | 0 | 180 | npc-post |
| greyfen.mere.shore | 3000 | 12099 | 0 | 180 | objective |
| greyfen.m23.search.4 | 2994 | 12098 | 0 | 180 | objective |
| greyfen.m23.ripples | 3000 | 12117.2 | 0 | 180 | objective |
| greyfen.ferry.mere | 3158.21 | 11903.19 | 2.81 | 248.75 |  |
| greyfen.mere.net.1 | 3002 | 12102 | 0 | 180 | objective |
| greyfen.mere.net.2 | 2989 | 12105 | 0 | 180 | objective |
| greyfen.mere.net.3 | 3014 | 12107 | 0 | 180 | objective |
| greyfen.mere.net.4 | 3001 | 12115 | 0 | 180 | objective |
| greyfen.m26.scale-bed | 3013 | 12119 | 0 | 180 | objective |
| greyfen.spawn.m26.nets.1 | 2999 | 12102 | 0 | 180 | spawn |
| greyfen.spawn.m26.nets.2 | 3005 | 12102 | 0 | 180 | spawn |
| greyfen.spawn.m26.nets.3 | 2986 | 12105 | 0 | 180 | spawn |
| greyfen.spawn.m26.nets.4 | 2992 | 12105 | 0 | 180 | spawn |
| greyfen.spawn.m26.nets.5 | 3011 | 12107 | 0 | 180 | spawn |
| greyfen.spawn.m26.nets.6 | 3017 | 12107 | 0 | 180 | spawn |
| greyfen.spawn.m26.nets.7 | 2998 | 12115 | 0 | 180 | spawn |
| greyfen.spawn.m26.nets.8 | 3004 | 12115 | 0 | 180 | spawn |
| greyfen.m27.blind.1 | 2990 | 12121 | 0 | 180 | objective |
| greyfen.m27.blind.2 | 2977 | 12107 | 0 | 180 | objective |
| greyfen.m27.blind.3 | 3024 | 12114 | 0 | 180 | objective |
| greyfen.m27.blind.4 | 3004 | 12127 | 0 | 180 | objective |
| greyfen.m27.blind.5 | 2977 | 12121 | 0 | 180 | objective |
| greyfen.m27.blind.6 | 3023 | 12127 | 0 | 180 | objective |
| greyfen.m27.brood.1 | 2993 | 12134 | 0 | 180 | objective |
| greyfen.m27.brood.2 | 3038 | 12111 | 0 | 180 | objective |
| greyfen.m27.brood.3 | 3015 | 12136 | 0 | 180 | objective |
| greyfen.m27.search.1 | 2980 | 12134 | 0 | 180 | objective |
| greyfen.m27.search.2 | 2964 | 12116 | 0 | 180 | objective |
| greyfen.m27.search.3 | 3035 | 12125 | 0 | 180 | objective |
| greyfen.m27.search.4 | 3005 | 12143 | 0 | 180 | objective |
| greyfen.spawn.m27.pack.1.1 | 2989 | 12144 | 0 | 180 | spawn |
| greyfen.spawn.m27.pack.1.2 | 2993 | 12144 | 0 | 180 | spawn |
| greyfen.spawn.m27.pack.1.3 | 2989 | 12148 | 0 | 180 | spawn |
| greyfen.spawn.m27.pack.1.4 | 2993 | 12148 | 0 | 180 | spawn |
| greyfen.spawn.m27.pack.2.1 | 2964 | 12131 | 0 | 180 | spawn |
| greyfen.spawn.m27.pack.2.2 | 2968 | 12131 | 0 | 180 | spawn |
| greyfen.spawn.m27.pack.2.3 | 2964 | 12135 | 0 | 180 | spawn |
| greyfen.spawn.m27.pack.2.4 | 2968 | 12135 | 0 | 180 | spawn |
| waystone.greywatch | 2700 | 14458.2 | 0 | 180 | waystone |
| npc-post.leofa.greywatch | 2694 | 14463 | 0 | 270 | npc-post |
| npc-post.deserter.stocks | 2706 | 14463.6 | 0 | 180 | npc-post |
| greyfen.ferry.greywatch | 2795.36 | 14253.32 | 2.85 | 125.54 |  |
| greyfen.greywatch.post.1 | 1195.5 | 13900 | 4 | 180 | objective |
| greyfen.greywatch.post.1.fire | 1194 | 13901.5 | 4 | 180 | objective |
| greyfen.greywatch.post.1.ladder | 1208.5 | 13900 | 0 | 90 | objective |
| greyfen.r14.sign.1.1 | 1210.5 | 13903 | 0 | 180 | objective |
| greyfen.r14.sign.1.2 | 1210.5 | 13897 | 0 | 180 | objective |
| greyfen.greywatch.post.2 | 2291.5 | 14300 | 4 | 180 | objective |
| greyfen.greywatch.post.2.fire | 2290 | 14301.5 | 4 | 180 | objective |
| greyfen.greywatch.post.2.ladder | 2304.5 | 14300 | 0 | 90 | objective |
| greyfen.r14.sign.2.1 | 2306.5 | 14303 | 0 | 180 | objective |
| greyfen.r14.sign.2.2 | 2306.5 | 14297 | 0 | 180 | objective |
| greyfen.greywatch.post.3 | 3495.5 | 14500 | 4 | 180 | objective |
| greyfen.greywatch.post.3.fire | 3494 | 14501.5 | 4 | 180 | objective |
| greyfen.greywatch.post.3.ladder | 3508.5 | 14500 | 0 | 90 | objective |
| greyfen.r14.sign.3.1 | 3510.5 | 14503 | 0 | 180 | objective |
| greyfen.r14.sign.3.2 | 3510.5 | 14497 | 0 | 180 | objective |
| greyfen.greywatch.post.4 | 4395.5 | 14100 | 4 | 180 | objective |
| greyfen.greywatch.post.4.fire | 4394 | 14101.5 | 4 | 180 | objective |
| greyfen.greywatch.post.4.ladder | 4408.5 | 14100 | 0 | 90 | objective |
| greyfen.r14.sign.4.1 | 4410.5 | 14103 | 0 | 180 | objective |
| greyfen.r14.sign.4.2 | 4410.5 | 14097 | 0 | 180 | objective |
| greyfen.r14.ranger.1 | 1195.5 | 13906 | 0 | 0 | npc-post |
| greyfen.r14.ranger.2 | 2291.5 | 14306 | 0 | 0 | npc-post |
| greyfen.r14.ranger.3 | 3495.5 | 14506 | 0 | 0 | npc-post |
| greyfen.r14.tied | 3495.5 | 14494 | 0 | 180 | objective |
| npc-post.deserter.camp | 4388.5 | 14100 | 0 | 270 | npc-post |
| greyfen.spawn.r14.post4.1 | 4402.57 | 14107.07 | 0 | 180 | spawn |
| greyfen.spawn.r14.post4.2 | 4402.57 | 14092.93 | 0 | 180 | spawn |
| greyfen.spawn.r14.post4.3 | 4388.43 | 14092.93 | 0 | 180 | spawn |
| greyfen.spawn.r14.post4.4 | 4388.43 | 14107.07 | 0 | 180 | spawn |
| greyfen.spawn.r14.leech.1 | 4392 | 14109 | 0 | 180 | spawn |
| greyfen.spawn.r14.leech.2 | 4388 | 14102 | 0 | 180 | spawn |
| greyfen.spawn.r14.leech.3 | 4389 | 14094 | 0 | 180 | spawn |
| greyfen.chapel.door | 2584 | 14704 | 0 | 180 | poi |
| greyfen.chapel.tower-exit | 2596 | 14703.5 | 0 | 180 | poi |
| npc-post.bell-keeper.door | 2580 | 14707 | 0 | 180 | npc-post |
| waystone.mireweather-hut | 5572 | 12280.2 | 0 | 180 | waystone |
| greyfen.hut.door | 5600 | 12303 | 0 | 180 | poi |
| npc-post.gytha.hut | 5603 | 12306 | 0 | 0 | npc-post |
| greyfen.ferry.mireweather | 5507.1 | 12347.34 | 2.84 | 290.56 |  |
| greyfen.m25.herb.1 | 5580 | 12316 | 0 | 180 | objective |
| greyfen.m25.herb.2 | 5574 | 12300 | 0 | 180 | objective |
| greyfen.m25.herb.3 | 5622 | 12298 | 0 | 180 | objective |
| greyfen.m25.cutter | 5584 | 12317 | 0 | 180 | npc-post |
| greyfen.spawn.m25.herbs.1 | 5587 | 12313 | 0 | 180 | spawn |
| greyfen.spawn.m25.herbs.2 | 5573 | 12313 | 0 | 180 | spawn |
| greyfen.spawn.m25.herbs.3 | 5581 | 12297 | 0 | 180 | spawn |
| greyfen.spawn.m25.herbs.4 | 5567 | 12297 | 0 | 180 | spawn |
| greyfen.spawn.m25.herbs.5 | 5629 | 12295 | 0 | 180 | spawn |
| greyfen.spawn.m25.herbs.6 | 5615 | 12295 | 0 | 180 | spawn |
| greyfen.deeps.door | 2303 | 12037.25 | 0 | 180 | poi |
| greyfen.deeps.arena-exit | 2318 | 12037.25 | 0 | 270 | poi |

## Triggers

| id | shape | x | z | size |
| --- | --- | --- | --- | --- |
| trg.greyfen.mere.first-sight | sphere | 3008.23 | 11950.42 | r 20 |
| trg.greyfen.m27.blinds | sphere | 2990 | 12121 | r 15 |

## Structures

| id | kind | x | z | footprint | mode |
| --- | --- | --- | --- | --- | --- |
| greyfen-waystone-reedgate | waystone | 3200 | 10200 | 1.6 x 1.6 | solid |
| greyfen-reedgate-deck | greyfen-plank-walk | 3200 | 10180 | 16 x 16 | open |
| greyfen-reedgate-house-1 | greyfen-stilt-house | 3144 | 10150 | 7 x 7 | solid |
| greyfen-reedgate-house-2 | greyfen-stilt-house | 3144 | 10180 | 7 x 7 | solid |
| greyfen-reedgate-house-3 | greyfen-stilt-house | 3144 | 10210 | 7 x 7 | solid |
| greyfen-reedgate-house-4 | greyfen-stilt-house | 3168 | 10150 | 7 x 7 | solid |
| greyfen-reedgate-house-5 | greyfen-stilt-house | 3168 | 10210 | 7 x 7 | solid |
| greyfen-reedgate-house-6 | greyfen-stilt-house | 3232 | 10150 | 7 x 7 | solid |
| greyfen-reedgate-house-7 | greyfen-stilt-house | 3232 | 10210 | 7 x 7 | solid |
| greyfen-reedgate-house-8 | greyfen-stilt-house | 3256 | 10150 | 7 x 7 | solid |
| greyfen-reedgate-house-9 | greyfen-stilt-house | 3256 | 10180 | 7 x 7 | solid |
| greyfen-reedgate-house-10 | greyfen-stilt-house | 3256 | 10210 | 7 x 7 | solid |
| greyfen-reedgate-walk-1 | greyfen-plank-walk | 3170.02 | 10163.94 | 52.03 x 1.6 | open |
| greyfen-reedgate-walk-2 | greyfen-plank-walk | 3169.75 | 10180 | 44.5 x 1.6 | open |
| greyfen-reedgate-walk-3 | greyfen-plank-walk | 3170.02 | 10196.06 | 52.03 x 1.6 | open |
| greyfen-reedgate-walk-4 | greyfen-plank-walk | 3182.36 | 10163.46 | 32.36 x 1.6 | open |
| greyfen-reedgate-walk-5 | greyfen-plank-walk | 3182.36 | 10196.54 | 32.36 x 1.6 | open |
| greyfen-reedgate-walk-6 | greyfen-plank-walk | 3217.64 | 10163.46 | 32.36 x 1.6 | open |
| greyfen-reedgate-walk-7 | greyfen-plank-walk | 3217.64 | 10196.54 | 32.36 x 1.6 | open |
| greyfen-reedgate-walk-8 | greyfen-plank-walk | 3229.98 | 10163.94 | 52.03 x 1.6 | open |
| greyfen-reedgate-walk-9 | greyfen-plank-walk | 3230.25 | 10180 | 44.5 x 1.6 | open |
| greyfen-reedgate-walk-10 | greyfen-plank-walk | 3229.98 | 10196.06 | 52.03 x 1.6 | open |
| greyfen-jetty-reedgate | bridge | 3594.66 | 10126.72 | 8.5 x 3 | solid |
| greyfen-ferry-boathouse | greyfen-boathouse | 3588 | 10110 | 8 x 6 | solid |
| greyfen-m24-fence-n | fence | 3630 | 10106 | 14 x 0.3 | solid |
| greyfen-m24-fence-s | fence | 3630 | 10094 | 14 x 0.3 | solid |
| greyfen-m24-fence-e | fence | 3637 | 10100 | 0.3 x 10 | solid |
| greyfen-marker-reedgate-mere-1 | greyfen-marker | 3152.05 | 10389.81 | 0.4 x 0.4 | solid |
| greyfen-marker-reedgate-mere-2 | greyfen-marker | 3146.69 | 10539.72 | 0.4 x 0.4 | solid |
| greyfen-marker-reedgate-mere-3 | greyfen-marker | 3141.34 | 10689.62 | 0.4 x 0.4 | solid |
| greyfen-marker-reedgate-mere-4 | greyfen-marker | 3132.58 | 10839.03 | 0.4 x 0.4 | solid |
| greyfen-marker-reedgate-mere-5 | greyfen-marker | 3114.25 | 10987.91 | 0.4 x 0.4 | solid |
| greyfen-marker-reedgate-mere-6 | greyfen-marker | 3095.93 | 11136.78 | 0.4 x 0.4 | solid |
| greyfen-marker-reedgate-mere-7 | greyfen-marker | 3077.61 | 11285.66 | 0.4 x 0.4 | solid |
| greyfen-marker-reedgate-mere-8 | greyfen-marker | 3059.28 | 11434.54 | 0.4 x 0.4 | solid |
| greyfen-marker-reedgate-mere-9 | greyfen-marker | 3043.55 | 11583.76 | 0.4 x 0.4 | solid |
| greyfen-marker-reedgate-mere-10 | greyfen-marker | 3028.11 | 11732.96 | 0.4 x 0.4 | solid |
| greyfen-marker-mere-greywatch-1 | greyfen-marker | 2849.8 | 13106.95 | 0.4 x 0.4 | solid |
| greyfen-marker-mere-greywatch-2 | greyfen-marker | 2822.16 | 13254.38 | 0.4 x 0.4 | solid |
| greyfen-marker-mere-greywatch-3 | greyfen-marker | 2794.51 | 13401.81 | 0.4 x 0.4 | solid |
| greyfen-marker-mere-greywatch-4 | greyfen-marker | 2766.87 | 13549.24 | 0.4 x 0.4 | solid |
| greyfen-marker-mere-greywatch-5 | greyfen-marker | 2750.36 | 13698.41 | 0.4 x 0.4 | solid |
| greyfen-marker-mere-greywatch-6 | greyfen-marker | 2739.68 | 13848.03 | 0.4 x 0.4 | solid |
| greyfen-marker-mere-greywatch-7 | greyfen-marker | 2728.99 | 13997.65 | 0.4 x 0.4 | solid |
| greyfen-marker-mere-greywatch-8 | greyfen-marker | 2718.3 | 14147.27 | 0.4 x 0.4 | solid |
| greyfen-marker-mere-mireweather-1 | greyfen-marker | 3619.75 | 12389.04 | 0.4 x 0.4 | solid |
| greyfen-marker-mere-mireweather-2 | greyfen-marker | 3769.61 | 12395.49 | 0.4 x 0.4 | solid |
| greyfen-marker-mere-mireweather-3 | greyfen-marker | 3919.47 | 12401.93 | 0.4 x 0.4 | solid |
| greyfen-marker-mere-mireweather-4 | greyfen-marker | 4069.33 | 12408.38 | 0.4 x 0.4 | solid |
| greyfen-marker-mere-mireweather-5 | greyfen-marker | 4219.2 | 12414.83 | 0.4 x 0.4 | solid |
| greyfen-marker-mere-mireweather-6 | greyfen-marker | 4369.06 | 12421.27 | 0.4 x 0.4 | solid |
| greyfen-marker-mere-mireweather-7 | greyfen-marker | 4518.86 | 12411.39 | 0.4 x 0.4 | solid |
| greyfen-marker-mere-mireweather-8 | greyfen-marker | 4668.19 | 12397.29 | 0.4 x 0.4 | solid |
| greyfen-marker-mere-mireweather-9 | greyfen-marker | 4817.53 | 12383.19 | 0.4 x 0.4 | solid |
| greyfen-marker-mere-mireweather-10 | greyfen-marker | 4966.86 | 12369.09 | 0.4 x 0.4 | solid |
| greyfen-marker-mere-mireweather-11 | greyfen-marker | 5116.2 | 12354.99 | 0.4 x 0.4 | solid |
| greyfen-marker-mere-mireweather-12 | greyfen-marker | 5265.54 | 12340.89 | 0.4 x 0.4 | solid |
| greyfen-marker-mere-mireweather-13 | greyfen-marker | 5414.87 | 12326.79 | 0.4 x 0.4 | solid |
| greyfen-waystone-hathrens-mere | waystone | 2986 | 12045 | 1.6 x 1.6 | solid |
| greyfen-jetty-mere | bridge | 3161.01 | 11904.28 | 8 x 3 | solid |
| greyfen-waystone-greywatch | waystone | 2700 | 14460 | 1.6 x 1.6 | solid |
| greyfen-greywatch-stocks | greyfen-stocks | 2706 | 14465 | 2 x 0.8 | solid |
| greyfen-jetty-greywatch | bridge | 2792.71 | 14255.2 | 8.5 x 3 | solid |
| greyfen-greywatch-post-1 | greyfen-ranger-platform | 1195.5 | 13900 | 6 x 6 | solid |
| greyfen-greywatch-post-1-step-1 | stair-step | 1199 | 13900 | 1 x 1.6 | solid |
| greyfen-greywatch-post-1-step-2 | stair-step | 1200 | 13900 | 1 x 1.6 | solid |
| greyfen-greywatch-post-1-step-3 | stair-step | 1201 | 13900 | 1 x 1.6 | solid |
| greyfen-greywatch-post-1-step-4 | stair-step | 1202 | 13900 | 1 x 1.6 | solid |
| greyfen-greywatch-post-1-step-5 | stair-step | 1203 | 13900 | 1 x 1.6 | solid |
| greyfen-greywatch-post-1-step-6 | stair-step | 1204 | 13900 | 1 x 1.6 | solid |
| greyfen-greywatch-post-1-step-7 | stair-step | 1205 | 13900 | 1 x 1.6 | solid |
| greyfen-greywatch-post-1-step-8 | stair-step | 1206 | 13900 | 1 x 1.6 | solid |
| greyfen-greywatch-post-1-step-9 | stair-step | 1207 | 13900 | 1 x 1.6 | solid |
| greyfen-greywatch-post-2 | greyfen-ranger-platform | 2291.5 | 14300 | 6 x 6 | solid |
| greyfen-greywatch-post-2-step-1 | stair-step | 2295 | 14300 | 1 x 1.6 | solid |
| greyfen-greywatch-post-2-step-2 | stair-step | 2296 | 14300 | 1 x 1.6 | solid |
| greyfen-greywatch-post-2-step-3 | stair-step | 2297 | 14300 | 1 x 1.6 | solid |
| greyfen-greywatch-post-2-step-4 | stair-step | 2298 | 14300 | 1 x 1.6 | solid |
| greyfen-greywatch-post-2-step-5 | stair-step | 2299 | 14300 | 1 x 1.6 | solid |
| greyfen-greywatch-post-2-step-6 | stair-step | 2300 | 14300 | 1 x 1.6 | solid |
| greyfen-greywatch-post-2-step-7 | stair-step | 2301 | 14300 | 1 x 1.6 | solid |
| greyfen-greywatch-post-2-step-8 | stair-step | 2302 | 14300 | 1 x 1.6 | solid |
| greyfen-greywatch-post-2-step-9 | stair-step | 2303 | 14300 | 1 x 1.6 | solid |
| greyfen-greywatch-post-3 | greyfen-ranger-platform | 3495.5 | 14500 | 6 x 6 | solid |
| greyfen-greywatch-post-3-step-1 | stair-step | 3499 | 14500 | 1 x 1.6 | solid |
| greyfen-greywatch-post-3-step-2 | stair-step | 3500 | 14500 | 1 x 1.6 | solid |
| greyfen-greywatch-post-3-step-3 | stair-step | 3501 | 14500 | 1 x 1.6 | solid |
| greyfen-greywatch-post-3-step-4 | stair-step | 3502 | 14500 | 1 x 1.6 | solid |
| greyfen-greywatch-post-3-step-5 | stair-step | 3503 | 14500 | 1 x 1.6 | solid |
| greyfen-greywatch-post-3-step-6 | stair-step | 3504 | 14500 | 1 x 1.6 | solid |
| greyfen-greywatch-post-3-step-7 | stair-step | 3505 | 14500 | 1 x 1.6 | solid |
| greyfen-greywatch-post-3-step-8 | stair-step | 3506 | 14500 | 1 x 1.6 | solid |
| greyfen-greywatch-post-3-step-9 | stair-step | 3507 | 14500 | 1 x 1.6 | solid |
| greyfen-greywatch-post-4 | greyfen-ranger-platform | 4395.5 | 14100 | 6 x 6 | solid |
| greyfen-greywatch-post-4-step-1 | stair-step | 4399 | 14100 | 1 x 1.6 | solid |
| greyfen-greywatch-post-4-step-2 | stair-step | 4400 | 14100 | 1 x 1.6 | solid |
| greyfen-greywatch-post-4-step-3 | stair-step | 4401 | 14100 | 1 x 1.6 | solid |
| greyfen-greywatch-post-4-step-4 | stair-step | 4402 | 14100 | 1 x 1.6 | solid |
| greyfen-greywatch-post-4-step-5 | stair-step | 4403 | 14100 | 1 x 1.6 | solid |
| greyfen-greywatch-post-4-step-6 | stair-step | 4404 | 14100 | 1 x 1.6 | solid |
| greyfen-greywatch-post-4-step-7 | stair-step | 4405 | 14100 | 1 x 1.6 | solid |
| greyfen-greywatch-post-4-step-8 | stair-step | 4406 | 14100 | 1 x 1.6 | solid |
| greyfen-greywatch-post-4-step-9 | stair-step | 4407 | 14100 | 1 x 1.6 | solid |
| greyfen-chapel-front | greyfen-chapel-ruin | 2584 | 14698 | 16 x 10 | solid |
| greyfen-chapel-tower | greyfen-bell-tower | 2596 | 14700 | 4 x 4 | solid |
| greyfen-waystone-mireweather-hut | waystone | 5572 | 12282 | 1.6 x 1.6 | solid |
| greyfen-hut | greyfen-stilt-hut | 5600 | 12297.5 | 12 x 9 | solid |
| greyfen-herb-bed-1 | greyfen-herb-bed | 5580 | 12313 | 6 x 4 | open |
| greyfen-herb-bed-2 | greyfen-herb-bed | 5574 | 12297 | 6 x 4 | open |
| greyfen-herb-bed-3 | greyfen-herb-bed | 5622 | 12295 | 6 x 4 | open |
| greyfen-jetty-mireweather | bridge | 5509.91 | 12346.28 | 8 x 3 | solid |
| greyfen-deeps-front | greyfen-monastery-ruin | 2303 | 12030.25 | 20 x 12 | solid |
