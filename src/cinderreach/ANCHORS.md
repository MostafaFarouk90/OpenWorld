# Cinderreach anchors, triggers and structures

Generated from `cinderreach.layout.ts` by `npx vite-node tools/gen-region-docs.ts`; a test fails when this file drifts.
Metres from the origin, +Z north, yaw 0 faces -Z, yaw 90 faces -X. Anchor `y` is absolute and computed from the terrain at runtime.

## Anchors

| id | x | z | dy | yaw | tags |
| --- | --- | --- | --- | --- | --- |
| waystone.cinder-road | 13670 | 2306.2 | 0 | 180 | waystone |
| cinderreach.m11.bloom.1 | 13664 | 2309 | 0 | 180 | objective |
| cinderreach.m11.bloom.2 | 13673 | 2300 | 0 | 180 | objective |
| cinderreach.m11.bloom.3 | 13658 | 2309 | 0 | 180 | objective |
| cinderreach.m11.search.1 | 13145.44 | 2738.96 | 0 | 180 | objective |
| cinderreach.m11.search.2 | 13465.6 | 2525.27 | 0 | 180 | objective |
| cinderreach.m11.search.3 | 14029.35 | 2242.85 | 0 | 180 | objective |
| cinderreach.m11.search.4 | 14393.07 | 2409.61 | 0 | 180 | objective |
| cinderreach.m11.ambush.1 | 13609.89 | 2359.12 | 0 | 270 | spawn |
| cinderreach.m11.ambush.2 | 13724.24 | 2233.33 | 0 | 270 | spawn |
| cinderreach.spawn.road.1 | 11834.83 | 2369.09 | 0 | 270 | spawn |
| cinderreach.spawn.road.2 | 11830.3 | 2375.69 | 0 | 270 | spawn |
| cinderreach.spawn.road.3 | 12576.47 | 2878.97 | 0 | 270 | spawn |
| cinderreach.spawn.road.4 | 12571.94 | 2885.56 | 0 | 270 | spawn |
| cinderreach.m11.wraith.1 | 13674.45 | 2320.22 | 0 | 180 | spawn |
| cinderreach.m11.wraith.2 | 13682.99 | 2307.55 | 0 | 180 | spawn |
| cinderreach.m11.wraith.3 | 13673.58 | 2295.5 | 0 | 180 | spawn |
| cinderreach.m11.wraith.4 | 13659.22 | 2300.73 | 0 | 180 | spawn |
| cinderreach.m11.wraith.5 | 13659.76 | 2316 | 0 | 180 | spawn |
| npc-post.gaut.cinder-road | 13659.26 | 2295.89 | 0 | 270 | npc-post |
| waystone.cinderford | 21030 | 2438.2 | 0 | 180 | waystone |
| cinderreach.cinderford.lane.1 | 21007.99 | 2837.46 | 0 | 0 | spawn |
| cinderreach.cinderford.lane.2 | 21007.43 | 2897.99 | 0 | 0 | spawn |
| cinderreach.cinderford.lane.3 | 21003.24 | 2960.45 | 0 | 0 | spawn |
| cinderreach.cinderford.barricade.1 | 21008.7 | 2675 | 0 | 180 | objective |
| cinderreach.cinderford.barricade.2 | 21026.7 | 2675 | 0 | 180 | objective |
| cinderreach.cinderford.barricade.3 | 21044.7 | 2675 | 0 | 180 | objective |
| cinderreach.cinderford.barricade.4 | 21062.7 | 2675 | 0 | 180 | objective |
| cinderreach.cinderford.raid.origin | 21370 | 2400 | 0 | 90 | spawn |
| cinderreach.cinderford.raid.barricade | 21035.7 | 2675 | 0 | 180 | objective |
| cinderreach.cinderford.wyrm.approach | 20951.64 | 3115.24 | 30 | 0 | spawn, elevated |
| cinderreach.m12.militia.1 | 21005.7 | 2669 | 0 | 180 | spawn |
| cinderreach.m12.militia.2 | 21017.7 | 2669 | 0 | 180 | spawn |
| cinderreach.m12.militia.3 | 21029.7 | 2669 | 0 | 180 | spawn |
| cinderreach.m12.militia.4 | 21041.7 | 2669 | 0 | 180 | spawn |
| cinderreach.m12.militia.5 | 21053.7 | 2669 | 0 | 180 | spawn |
| cinderreach.m12.militia.6 | 21065.7 | 2669 | 0 | 180 | spawn |
| cinderreach.m12.prep.1 | 21015.7 | 2653 | 0 | 180 | objective |
| cinderreach.m12.prep.2 | 21035.7 | 2653 | 0 | 180 | objective |
| cinderreach.m12.prep.3 | 21055.7 | 2653 | 0 | 180 | objective |
| cinderreach.m12.wounded.1 | 21020 | 2630 | 0 | 180 | objective |
| cinderreach.m12.wounded.2 | 21080 | 2630 | 0 | 180 | objective |
| cinderreach.m12.wounded.3 | 21005 | 2600 | 0 | 180 | objective |
| cinderreach.m12.wounded.4 | 21095 | 2600 | 0 | 180 | objective |
| cinderreach.m12.refuge.dropoff | 20939 | 2544 | 0 | 180 | objective |
| npc-post.osgar.barricade | 21021.7 | 2645 | 0 | 180 | npc-post |
| npc-post.gaut.cinderford | 21049.7 | 2645 | 0 | 180 | npc-post |
| npc-post.maud.refuge | 20930 | 2543 | 0 | 180 | npc-post |
| npc-post.pennard.cinderford | 20934 | 2542 | 0 | 180 | npc-post |
| npc-post.beornwyn.tavern | 21050 | 2299 | 0 | 0 | npc-post |
| npc-post.household-1 | 20998 | 2460 | 0 | 270 | npc-post |
| npc-post.household-2 | 20998 | 2420 | 0 | 270 | npc-post |
| npc-post.household-3 | 20998 | 2380 | 0 | 270 | npc-post |
| npc-post.household-4 | 20998 | 2340 | 0 | 270 | npc-post |
| cinderreach.post.cinderford.1 | 21036 | 2445 | 0 | 180 | npc-post |
| cinderreach.post.cinderford.2 | 21064 | 2445 | 0 | 180 | npc-post |
| cinderreach.r06.sample.1 | 21062.12 | 2417 | 0 | 180 | objective |
| cinderreach.r06.sample.2 | 21050 | 2396 | 0 | 180 | objective |
| cinderreach.r06.sample.3 | 21037.88 | 2417 | 0 | 180 | objective |
| cinderreach.r06.wellhouse.1 | 21084 | 2396 | 0 | 180 | objective |
| cinderreach.r06.wellhouse.2 | 21072 | 2396 | 0 | 180 | objective |
| cinderreach.r06.wellhouse.3 | 21078 | 2402 | 0 | 180 | objective |
| cinderreach.r06.wellhouse.4 | 21078 | 2390 | 0 | 180 | objective |
| cinderreach.r06.household.1 | 20998 | 2463 | 0 | 270 | objective |
| cinderreach.r06.household.2 | 20998 | 2423 | 0 | 270 | objective |
| cinderreach.r06.household.3 | 20998 | 2383 | 0 | 270 | objective |
| cinderreach.r06.household.4 | 20998 | 2343 | 0 | 270 | objective |
| cinderreach.r06.cart | 21020 | 2410 | 0 | 270 | objective |
| cinderreach.r06.well | 21053 | 2410 | 0 | 90 | objective |
| cinderreach.r06.pennard.rite | 21050 | 2417 | 0 | 0 | objective |
| cinderreach.r06.wraith.1 | 21065.56 | 2425.56 | 0 | 180 | spawn |
| cinderreach.r06.wraith.2 | 21065.56 | 2394.44 | 0 | 180 | spawn |
| cinderreach.r06.wraith.3 | 21034.44 | 2394.44 | 0 | 180 | spawn |
| cinderreach.r06.wraith.4 | 21034.44 | 2425.56 | 0 | 180 | spawn |
| cinderreach.spawn.cinderford.1 | 21350 | 2500 | 0 | 90 | spawn |
| cinderreach.spawn.cinderford.2 | 21350 | 2400 | 0 | 90 | spawn |
| cinderreach.spawn.cinderford.3 | 21350 | 2300 | 0 | 90 | spawn |
| waystone.stonefold | 16868 | 4123.2 | 0 | 180 | waystone |
| cinderreach.stonefold.ring.centre | 16850 | 4200 | 0 | 180 | objective |
| cinderreach.stonefold.ring.player | 16850 | 4194 | 0 | 180 | objective |
| cinderreach.stonefold.ring.hrolf | 16850 | 4206 | 0 | 0 | objective |
| cinderreach.m13.log.1 | 16820 | 4170 | 0 | 180 | objective |
| cinderreach.m13.log.2 | 16880 | 4170 | 0 | 180 | objective |
| cinderreach.m13.log.3 | 16880 | 4210 | 0 | 180 | objective |
| cinderreach.m13.boulder | 16805 | 4180 | 0 | 180 | objective |
| cinderreach.m13.boulder.goal | 16805 | 4225 | 0 | 180 | objective |
| cinderreach.m13.hall.1 | 16836 | 4225 | 0 | 180 | objective |
| cinderreach.m13.hall.2 | 16850 | 4226 | 0 | 180 | objective |
| cinderreach.m13.hall.3 | 16864 | 4225 | 0 | 180 | objective |
| npc-post.hrolf | 16860 | 4200 | 0 | 90 | npc-post |
| npc-post.ketta.stonefold | 16840 | 4198 | 0 | 270 | npc-post |
| cinderreach.post.stonefold.1 | 16830 | 4212 | 0 | 180 | npc-post |
| cinderreach.post.stonefold.2 | 16870 | 4212 | 0 | 180 | npc-post |
| cinderreach.spawn.stonefold.1 | 16730 | 4080 | 0 | 180 | spawn |
| cinderreach.spawn.stonefold.2 | 16750 | 4060 | 0 | 180 | spawn |
| cinderreach.spawn.stonefold.3 | 16970 | 4070 | 0 | 180 | spawn |
| cinderreach.spawn.houndden.1 | 16995.66 | 4345.66 | 0 | 180 | spawn |
| cinderreach.spawn.houndden.2 | 16995.66 | 4334.34 | 0 | 180 | spawn |
| cinderreach.spawn.houndden.3 | 16984.34 | 4334.34 | 0 | 180 | spawn |
| cinderreach.spawn.houndden.4 | 16984.34 | 4345.66 | 0 | 180 | spawn |
| cinderreach.r07.sign.1 | 16990 | 4354 | 0 | 180 | objective |
| cinderreach.r07.sign.2 | 17003.31 | 4344.33 | 0 | 180 | objective |
| cinderreach.r07.sign.3 | 16998.23 | 4328.67 | 0 | 180 | objective |
| cinderreach.r07.sign.4 | 16981.77 | 4328.67 | 0 | 180 | objective |
| cinderreach.r07.sign.5 | 16976.69 | 4344.33 | 0 | 180 | objective |
| cinderreach.r07.pup.1 | 16988 | 4341 | 0 | 180 | objective |
| cinderreach.r07.pup.2 | 16992 | 4339 | 0 | 180 | objective |
| cinderreach.den.wyrm.rest | 16150 | 4250 | 0 | 270 | spawn |
| cinderreach.r11.camp.1 | 16132 | 4240 | 0 | 180 | objective |
| cinderreach.r11.camp.2 | 16132 | 4260 | 0 | 180 | objective |
| cinderreach.r11.camp.3 | 16126 | 4250 | 0 | 180 | objective |
| cinderreach.r11.axe | 16128 | 4262 | 0 | 270 | objective |
| cinderreach.den.ledge.1 | 16180 | 4240 | 2 | 0 | poi, leap-gated |
| cinderreach.den.ledge.1.launch | 16180 | 4233.5 | 0 | 180 | poi |
| cinderreach.den.ledge.2 | 16180 | 4270 | 2 | 0 | poi, leap-gated |
| cinderreach.den.ledge.2.launch | 16180 | 4263.5 | 0 | 180 | poi |
| npc-post.ketta.pasture | 17242 | 2966 | 0 | 180 | npc-post |
| cinderreach.post.pasture.1 | 17252 | 2966 | 0 | 180 | npc-post |
| cinderreach.pasture.flock.1 | 17248.84 | 2992.79 | 0 | 180 | spawn |
| cinderreach.pasture.flock.2 | 17260.79 | 2967.16 | 0 | 180 | spawn |
| cinderreach.pasture.flock.3 | 17235.16 | 2955.21 | 0 | 180 | spawn |
| cinderreach.pasture.flock.4 | 17223.21 | 2980.84 | 0 | 180 | spawn |
| cinderreach.pasture.flock.5 | 17268.28 | 2986.26 | 0 | 180 | spawn |
| cinderreach.pasture.flock.6 | 17254.26 | 2947.72 | 0 | 180 | spawn |
| cinderreach.pasture.flock.7 | 17215.72 | 2961.74 | 0 | 180 | spawn |
| cinderreach.pasture.flock.8 | 17229.74 | 3000.28 | 0 | 180 | spawn |
| cinderreach.pasture.hollow.1 | 16990 | 2900 | 0 | 180 | objective |
| cinderreach.pasture.hollow.2 | 17320 | 2680 | 0 | 180 | objective |
| cinderreach.pasture.hollow.3 | 17120 | 2720 | 0 | 180 | objective |
| cinderreach.r05.track.1 | 17065.6 | 2922.2 | 0 | 180 | objective |
| cinderreach.r05.track.2 | 17296.6 | 2768.2 | 0 | 180 | objective |
| cinderreach.r05.track.3 | 17156.6 | 2796.2 | 0 | 180 | objective |
| cinderreach.r05.road.1 | 17103.96 | 3170.03 | 0 | 180 | objective |
| cinderreach.r05.road.2 | 17080.44 | 3114.84 | 0 | 180 | objective |
| cinderreach.r05.road.3 | 17090.22 | 3065.64 | 0 | 180 | objective |
| cinderreach.r05.road.4 | 17131.53 | 3022.13 | 0 | 180 | objective |
| cinderreach.r05.road.5 | 17172.84 | 2978.61 | 0 | 180 | objective |
| cinderreach.r05.road.6 | 17200 | 2950 | 0 | 180 | objective |
| cinderreach.r05.fox.1 | 17184 | 2928 | 0 | 180 | objective |
| cinderreach.r05.fox.2 | 17126 | 2882 | 0 | 180 | objective |
| cinderreach.r05.fox.3 | 17068 | 2836 | 0 | 180 | objective |
| cinderreach.r05.fox.4 | 17033.2 | 2808.4 | 0 | 180 | objective |
| cinderreach.r05.fox | 17218.8 | 2955.6 | 0 | 0 | spawn |
| cinderreach.r05.home | 17242 | 2982 | 0 | 0 | objective |
| cinderreach.dell.entrance | 17037.84 | 2812.08 | 0 | 180 | poi |
| cinderreach.dell.bed | 17010 | 2790 | 0 | 180 | poi |
| cinderreach.spawn.pasture.1 | 17169.22 | 2815.43 | 0 | 180 | spawn |
| cinderreach.spawn.pasture.2 | 17122.06 | 2855 | 0 | 180 | spawn |
| cinderreach.spawn.pasture.3 | 17111.37 | 2915.63 | 0 | 180 | spawn |
| cinderreach.spawn.hollow.1 | 16996 | 2906 | 0 | 180 | spawn |
| cinderreach.spawn.hollow.2 | 17326 | 2686 | 0 | 180 | spawn |
| cinderreach.spawn.hollow.3 | 17126 | 2726 | 0 | 180 | spawn |
| cinderreach.spawn.fox.1 | 17040 | 2800 | 0 | 180 | spawn |
| cinderreach.hushed-anvil.site | 19900 | 2700 | 0 | 0 | poi, shrine-site |
| npc-post.aelfreda.anvil | 19914 | 2712 | 0 | 45 | npc-post |
| npc-post.lantern-keeper.anvil | 19886 | 2712 | 0 | 315 | npc-post |
| cinderreach.spawn.anvil.1 | 19865 | 2670 | 0 | 180 | spawn |
| cinderreach.spawn.anvil.2 | 19935 | 2670 | 0 | 180 | spawn |
| cinderreach.m14.golem.1 | 19865 | 2670 | 0 | 180 | spawn |
| cinderreach.m14.golem.2 | 19935 | 2670 | 0 | 180 | spawn |
| cinderreach.hushed-anvil.ledge.1 | 19749 | 3320 | 2 | 0 | poi, leap-gated |
| cinderreach.hushed-anvil.ledge.1.launch | 19749 | 3313.5 | 0 | 180 | poi |
| cinderreach.hushed-anvil.ledge.2 | 19758 | 3118 | 2 | 0 | poi, leap-gated |
| cinderreach.hushed-anvil.ledge.2.launch | 19758 | 3111.5 | 0 | 180 | poi |
| cinderreach.hushed-anvil.ledge.3 | 19787 | 2979 | 2 | 0 | poi, leap-gated |
| cinderreach.hushed-anvil.ledge.3.launch | 19787 | 2972.5 | 0 | 180 | poi |
| cinderreach.m15.search.1 | 20367 | 4753.5 | 0 | 180 | objective |
| cinderreach.m15.search.2 | 20363 | 4741.5 | 0 | 180 | objective |
| cinderreach.m15.search.3 | 20365 | 4770 | 0 | 180 | objective |
| cinderreach.m15.search.4 | 20365 | 4730 | 0 | 180 | objective |
| cinderreach.m15.cage | 20374 | 4756 | 0 | 180 | objective |
| cinderreach.m15.carter | 20368 | 4740 | 0 | 180 | objective |
| npc-post.carter-bound | 20368 | 4740 | 0 | 180 | npc-post |
| cinderreach.spawn.huntercamp.1 | 20376.63 | 4781.95 | 0 | 180 | spawn |
| cinderreach.spawn.huntercamp.2 | 20395.81 | 4764.37 | 0 | 180 | spawn |
| cinderreach.spawn.huntercamp.3 | 20396.95 | 4738.37 | 0 | 180 | spawn |
| cinderreach.spawn.huntercamp.4 | 20379.37 | 4719.19 | 0 | 180 | spawn |
| cinderreach.spawn.huntercamp.5 | 20353.37 | 4718.05 | 0 | 180 | spawn |
| cinderreach.spawn.huntercamp.6 | 20334.19 | 4735.63 | 0 | 180 | spawn |
| cinderreach.spawn.huntercamp.7 | 20333.05 | 4761.63 | 0 | 180 | spawn |
| cinderreach.spawn.huntercamp.8 | 20350.63 | 4780.81 | 0 | 180 | spawn |
| cinderreach.stealth.m15.start | 20365 | 4710 | 0 | 180 | stealth |
| cinderreach.stealth.m15.cp.inside | 20365 | 4738 | 0 | 180 | stealth |
| cinderreach.stealth.m15.end | 20374 | 4756 | 0 | 180 | stealth |
| cinderreach.stealth.m15.centre | 20365 | 4750 | 0 | 180 | stealth |
| cinderreach.hide.m15.1 | 20381.51 | 4761.29 | 0 | 180 | hide |
| cinderreach.hide.m15.2 | 20353.71 | 4766.51 | 0 | 180 | hide |
| cinderreach.hide.m15.3 | 20348.49 | 4738.71 | 0 | 180 | hide |
| cinderreach.hide.m15.4 | 20376.29 | 4733.49 | 0 | 180 | hide |
| cinderreach.spawn.m15.watch.1 | 20381.71 | 4769.92 | 0 | 180 | spawn |
| cinderreach.spawn.m15.watch.2 | 20373.89 | 4725.57 | 0 | 180 | spawn |
| cinderreach.spawn.m15.watch.3 | 20339.39 | 4754.51 | 0 | 180 | spawn |
| cinderreach.patrol.m15.camp.1 | 20377.31 | 4783.83 | 0 | 180 | patrol |
| cinderreach.patrol.m15.camp.2 | 20398.83 | 4737.69 | 0 | 180 | patrol |
| cinderreach.patrol.m15.camp.3 | 20352.69 | 4716.17 | 0 | 180 | patrol |
| cinderreach.patrol.m15.camp.4 | 20331.17 | 4762.31 | 0 | 180 | patrol |
| npc-post.osgar.camp | 20365 | 4704 | 0 | 180 | npc-post |
| cinderreach.post.camp.1 | 20359 | 4704 | 0 | 180 | npc-post |
| cinderreach.post.camp.2 | 20371 | 4704 | 0 | 180 | npc-post |
| cinderreach.d03.gate | 19964.3 | 4815 | 0 | 180 | objective |
| cinderreach.d03.gate.1 | 19960.3 | 4812 | 0 | 180 | objective |
| cinderreach.d03.gate.2 | 19964.3 | 4812 | 0 | 180 | objective |
| cinderreach.d03.gate.3 | 19968.3 | 4812 | 0 | 180 | objective |
| cinderreach.scorchhold.keep.door | 19950 | 4932 | 0 | 180 | poi, door |
| cinderreach.spawn.scorchhold.1 | 19900 | 4860 | 0 | 180 | spawn |
| cinderreach.spawn.scorchhold.2 | 19925 | 4845 | 0 | 180 | spawn |
| cinderreach.spawn.scorchhold.3 | 19970 | 4850 | 0 | 180 | spawn |
| cinderreach.spawn.scorchhold.4 | 20000 | 4865 | 0 | 180 | spawn |
| cinderreach.spawn.scorchhold.5 | 19910 | 4890 | 0 | 180 | spawn |
| cinderreach.spawn.scorchhold.6 | 19995 | 4890 | 0 | 180 | spawn |
| cinderreach.spawn.scorchhold.7 | 19835 | 4880 | 0 | 180 | spawn |
| cinderreach.spawn.scorchhold.8 | 19835 | 4920 | 0 | 180 | spawn |
| cinderreach.spawn.scorchhold.perch.1 | 19890 | 4985 | 8 | 0 | spawn, elevated |
| cinderreach.spawn.scorchhold.perch.2 | 20010 | 4985 | 8 | 0 | spawn, elevated |
| cinderreach.spawn.scorchhold.perch.3 | 20050 | 4900 | 8 | 0 | spawn, elevated |
| npc-post.osgar.scorchhold | 19930 | 4835 | 0 | 180 | npc-post |
| cinderreach.post.scorchhold.1 | 19920 | 4835 | 0 | 180 | npc-post |

## Triggers

| id | shape | x | z | size |
| --- | --- | --- | --- | --- |
| trg.cinderreach.m11.ring | sphere | 13670 | 2308 | r 18 |
| trg.cinderreach.m11.stage.1 | sphere | 10361.07 | 2502.75 | r 30 |
| trg.cinderreach.m11.stage.2 | sphere | 11641.7 | 2323.62 | r 30 |
| trg.cinderreach.m11.stage.3 | sphere | 12762.2 | 2853.66 | r 30 |
| trg.cinderreach.cinderford.well | sphere | 21050 | 2410 | r 8 |
| trg.cinderreach.den | sphere | 16150 | 4250 | r 40 |
| trg.cinderreach.r07.den | sphere | 16990 | 4340 | r 20 |
| trg.cinderreach.pasture.hollow.1 | sphere | 16990 | 2900 | r 24 |
| trg.cinderreach.pasture.hollow.2 | sphere | 17320 | 2680 | r 24 |
| trg.cinderreach.pasture.hollow.3 | sphere | 17120 | 2720 | r 24 |
| trg.cinderreach.dell | sphere | 17010 | 2790 | r 16 |
| trg.cinderreach.m15.camp | box | 20365 | 4750 | half 45 x 10 x 45 |

## Structures

| id | kind | x | z | footprint | mode |
| --- | --- | --- | --- | --- | --- |
| cinderreach-waystone-cinder-road | waystone | 13670 | 2308 | 1.6 x 1.6 | solid |
| cinderreach-m11-bloom-1 | cinder-blightbloom | 13664 | 2309 | 3 x 3 | open |
| cinderreach-m11-bloom-2 | cinder-blightbloom | 13673 | 2300 | 3 x 3 | open |
| cinderreach-m11-bloom-3 | cinder-blightbloom | 13658 | 2309 | 3 x 3 | open |
| cinderreach-cinderford-house-1 | house | 20990 | 2460 | 8 x 8 | solid |
| cinderreach-cinderford-house-5 | house | 21110 | 2460 | 8 x 8 | solid |
| cinderreach-cinderford-house-2 | house | 20990 | 2420 | 8 x 8 | solid |
| cinderreach-cinderford-house-6 | house | 21110 | 2420 | 8 x 8 | solid |
| cinderreach-cinderford-house-3 | house | 20990 | 2380 | 8 x 8 | solid |
| cinderreach-cinderford-house-7 | house | 21110 | 2380 | 8 x 8 | solid |
| cinderreach-cinderford-house-4 | house | 20990 | 2340 | 8 x 8 | solid |
| cinderreach-cinderford-house-8 | house | 21110 | 2340 | 8 x 8 | solid |
| cinderreach-cinderford-well | well | 21050 | 2410 | 2 x 2 | solid |
| cinderreach-cinderford-wellhouse | house | 21078 | 2396 | 6 x 6 | solid |
| cinderreach-cinderford-refuge | house | 20930 | 2550 | 10 x 8 | solid |
| cinderreach-cinderford-tavern | tavern | 21050 | 2290 | 12 x 10 | solid |
| cinderreach-cinderford-mill | mill | 21021.5 | 2130 | 10 x 10 | solid |
| cinderreach-cinderford-bridge-1 | bridge | 21010 | 2060 | 10 x 4 | open |
| cinderreach-cinderford-bridge-2 | bridge | 21098 | 2060 | 10 x 4 | open |
| cinderreach-waystone-cinderford | waystone | 21030 | 2440 | 1.6 x 1.6 | solid |
| cinderreach-stonefold-wall-n | wall | 16850 | 4260 | 112.4 x 2.4 | solid |
| cinderreach-stonefold-wall-s1 | wall | 16818.4 | 4140 | 49.2 x 2.4 | solid |
| cinderreach-stonefold-wall-s2 | wall | 16881.6 | 4140 | 49.2 x 2.4 | solid |
| cinderreach-stonefold-wall-w | wall | 16790 | 4200 | 2.4 x 112.4 | solid |
| cinderreach-stonefold-wall-e | wall | 16910 | 4200 | 2.4 x 112.4 | solid |
| cinderreach-stonefold-tower-1 | tower | 16790 | 4140 | 7 x 7 | solid |
| cinderreach-stonefold-tower-2 | tower | 16910 | 4140 | 7 x 7 | solid |
| cinderreach-stonefold-tower-3 | tower | 16790 | 4260 | 7 x 7 | solid |
| cinderreach-stonefold-tower-4 | tower | 16910 | 4260 | 7 x 7 | solid |
| cinderreach-stonefold-hall | house | 16850 | 4240 | 16 x 10 | solid |
| cinderreach-stonefold-house-1 | house | 16812 | 4170 | 8 x 8 | solid |
| cinderreach-stonefold-house-2 | house | 16888 | 4170 | 8 x 8 | solid |
| cinderreach-stonefold-ring | cinder-trial-ring | 16850 | 4200 | 16 x 16 | open |
| cinderreach-stonefold-cairn | cinder-cairn | 16836 | 4229 | 2.4 x 2.4 | solid |
| cinderreach-stonefold-shield | cinder-shield | 16850 | 4229 | 1.2 x 0.4 | solid |
| cinderreach-stonefold-rune-stone | cinder-rune-stone | 16864 | 4229 | 1.4 x 0.8 | solid |
| cinderreach-waystone-stonefold | waystone | 16868 | 4125 | 1.6 x 1.6 | solid |
| cinderreach-den-ledge-1-ledge | rock | 16180 | 4239 | 6 x 5 | solid |
| cinderreach-den-ledge-1-wall-n | rock | 16180 | 4243 | 12 x 3 | solid |
| cinderreach-den-ledge-1-wall-w | rock | 16175.5 | 4239 | 3 x 5 | solid |
| cinderreach-den-ledge-1-wall-e | rock | 16184.5 | 4239 | 3 x 5 | solid |
| cinderreach-den-ledge-2-ledge | rock | 16180 | 4269 | 6 x 5 | solid |
| cinderreach-den-ledge-2-wall-n | rock | 16180 | 4273 | 12 x 3 | solid |
| cinderreach-den-ledge-2-wall-w | rock | 16175.5 | 4269 | 3 x 5 | solid |
| cinderreach-den-ledge-2-wall-e | rock | 16184.5 | 4269 | 3 x 5 | solid |
| cinderreach-pasture-fold | yard-fence | 17242 | 2974 | 10 x 10 | open |
| cinderreach-anvil-ledge-1-ledge | rock | 19749 | 3319 | 6 x 5 | solid |
| cinderreach-anvil-ledge-1-wall-n | rock | 19749 | 3323 | 12 x 3 | solid |
| cinderreach-anvil-ledge-1-wall-w | rock | 19744.5 | 3319 | 3 x 5 | solid |
| cinderreach-anvil-ledge-1-wall-e | rock | 19753.5 | 3319 | 3 x 5 | solid |
| cinderreach-anvil-ledge-2-ledge | rock | 19758 | 3117 | 6 x 5 | solid |
| cinderreach-anvil-ledge-2-wall-n | rock | 19758 | 3121 | 12 x 3 | solid |
| cinderreach-anvil-ledge-2-wall-w | rock | 19753.5 | 3117 | 3 x 5 | solid |
| cinderreach-anvil-ledge-2-wall-e | rock | 19762.5 | 3117 | 3 x 5 | solid |
| cinderreach-anvil-ledge-3-ledge | rock | 19787 | 2978 | 6 x 5 | solid |
| cinderreach-anvil-ledge-3-wall-n | rock | 19787 | 2982 | 12 x 3 | solid |
| cinderreach-anvil-ledge-3-wall-w | rock | 19782.5 | 2978 | 3 x 5 | solid |
| cinderreach-anvil-ledge-3-wall-e | rock | 19791.5 | 2978 | 3 x 5 | solid |
| cinderreach-camp-tent-1 | cinder-tent | 20365 | 4774 | 5 x 5 | solid |
| cinderreach-camp-tent-2 | cinder-tent | 20392 | 4747 | 5 x 5 | solid |
| cinderreach-camp-tent-3 | cinder-tent | 20365 | 4726 | 5 x 5 | solid |
| cinderreach-camp-tent-4 | cinder-tent | 20341 | 4750 | 5 x 5 | solid |
| cinderreach-camp-cage-1 | cinder-cage | 20374 | 4759 | 3 x 3 | solid |
| cinderreach-camp-cage-2 | cinder-cage | 20368 | 4737 | 3 x 3 | solid |
| cinderreach-camp-cage-3 | cinder-cage | 20352 | 4753 | 3 x 3 | solid |
| cinderreach-camp-desk-1 | cinder-ledger-desk | 20367 | 4756 | 2.2 x 1.2 | solid |
| cinderreach-camp-desk-2 | cinder-ledger-desk | 20363 | 4744 | 2.2 x 1.2 | solid |
| cinderreach-camp-crate-1 | crate | 20383 | 4747 | 1.4 x 1.4 | solid |
| cinderreach-camp-crate-2 | crate | 20353 | 4736 | 1.4 x 1.4 | solid |
| cinderreach-camp-crate-3 | crate | 20359 | 4767 | 1.4 x 1.4 | solid |
| cinderreach-scorchhold-wall-n | wall | 19950 | 4985 | 192.4 x 3 | solid |
| cinderreach-scorchhold-wall-s1 | wall | 19905.55 | 4815 | 103.5 x 3 | solid |
| cinderreach-scorchhold-wall-s2 | wall | 20008.75 | 4815 | 74.9 x 3 | solid |
| cinderreach-scorchhold-wall-w | wall | 19850 | 4900 | 3 x 162.4 | solid |
| cinderreach-scorchhold-wall-e | wall | 20050 | 4900 | 3 x 162.4 | solid |
| cinderreach-scorchhold-tower-1 | tower | 19850 | 4815 | 7 x 7 | solid |
| cinderreach-scorchhold-tower-2 | tower | 20050 | 4815 | 7 x 7 | solid |
| cinderreach-scorchhold-tower-3 | tower | 19850 | 4985 | 7 x 7 | solid |
| cinderreach-scorchhold-tower-4 | tower | 20050 | 4985 | 7 x 7 | solid |
| cinderreach-scorchhold-gate | gate | 19964.3 | 4815 | 14 x 1.5 | open |
| cinderreach-scorchhold-keep | tower | 19950 | 4945 | 26 x 20 | solid |
