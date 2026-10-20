# Harrowmark anchors, triggers and structures

Generated from `harrowmark.layout.ts` by `npx vite-node tools/gen-region-docs.ts`; a test fails when this file drifts.
Metres from the origin, +Z north, yaw 0 faces -Z, yaw 90 faces -X. Anchor `y` is absolute and computed from the terrain at runtime.

## Anchors

| id | x | z | dy | yaw | tags |
| --- | --- | --- | --- | --- | --- |
| harrowmark.gate.south | 8500 | 1244 | 0 | 0 | poi, gate |
| harrowmark.gate.south.inside | 8500 | 1262 | 0 | 180 | poi, gate |
| harrowmark.gate.smelter | 7908.94 | 1528.64 | 0 | 51.43 | poi, gate |
| harrowmark.gate.smelter.inside | 7923.01 | 1539.86 | 0 | 231.43 | poi, gate |
| harrowmark.gate.west | 7762.95 | 2168.23 | 0 | 102.86 | poi, gate |
| harrowmark.gate.west.inside | 7780.5 | 2164.22 | 0 | 282.86 | poi, gate |
| harrowmark.gate.northwest | 8171.98 | 2681.13 | 0 | 154.29 | poi, gate |
| harrowmark.gate.northwest.inside | 8179.79 | 2664.92 | 0 | 334.29 | poi, gate |
| harrowmark.gate.northeast | 8828.02 | 2681.13 | 0 | 205.71 | poi, gate |
| harrowmark.gate.northeast.inside | 8820.21 | 2664.92 | 0 | 25.71 | poi, gate |
| harrowmark.gate.river | 9237.05 | 2168.23 | 0 | 257.14 | poi, gate |
| harrowmark.gate.river.inside | 9219.5 | 2164.22 | 0 | 77.14 | poi, gate |
| harrowmark.gate.guild | 9091.06 | 1528.64 | 0 | 308.57 | poi, gate |
| harrowmark.gate.guild.inside | 9076.99 | 1539.86 | 0 | 128.57 | poi, gate |
| harrowmark.gate.south.threshold | 8500 | 1256 | 0 | 180 | poi, gate |
| harrowmark.gate.south.queue.1 | 8488 | 1226 | 0 | 180 | poi |
| harrowmark.gate.south.queue.2 | 8500 | 1214 | 0 | 180 | poi |
| harrowmark.gate.south.queue.3 | 8512 | 1202 | 0 | 180 | poi |
| harrowmark.square.gate | 8500 | 1330 | 0 | 180 | poi, flood-seed |
| harrowmark.square.fountain | 8500 | 1745 | 0 | 180 | poi |
| harrowmark.square.market | 8780 | 1520 | 0 | 180 | poi |
| harrowmark.keep-road.start | 8500 | 1760 | 0 | 180 | poi |
| harrowmark.keep-road.end | 8500 | 2550 | 0 | 180 | poi |
| harrowmark.barracks.yard | 8362 | 1380 | 0 | 180 | poi |
| harrowmark.barracks.door | 8360 | 1311 | 0 | 0 | poi |
| harrowmark.stables.yard | 8640 | 1375 | 0 | 180 | poi |
| harrowmark.stables.door | 8640 | 1311 | 0 | 0 | poi |
| harrowmark.forge-row.centre | 8180 | 1520 | 0 | 180 | poi |
| harrowmark.dunstan.forge | 8178 | 1496 | 0 | 180 | poi |
| harrowmark.guildhall.door | 8870 | 1583 | 0 | 0 | poi |
| harrowmark.chapel.court | 8365 | 2150 | 0 | 270 | poi |
| harrowmark.chapel.door | 8349 | 2150 | 0 | 270 | poi |
| harrowmark.bastion.yard | 8200 | 1735 | 0 | 0 | poi |
| harrowmark.bastion.steps | 8200 | 1787 | 0 | 0 | poi |
| harrowmark.bastion.drill.blocker | 8165 | 1712 | 0 | 180 | drill |
| harrowmark.bastion.drill.dodge-lane | 8240 | 1710 | 0 | 180 | drill |
| harrowmark.rooftop.centre | 8850 | 2220 | 0 | 180 | poi |
| harrowmark.keep.court | 8500 | 2575 | 0 | 0 | poi |
| harrowmark.smelter-gate | 7923.24 | 1539.58 | 0 | 231.4 | poi |
| harrowmark.tilted-anvil.door | 8200 | 1652 | 0 | 0 | poi, door |
| harrowmark.tilted-anvil-back.door | 8200 | 1683.5 | 0 | 180 | poi, door |
| harrowmark.keep-hall.door | 8500 | 2596 | 0 | 0 | poi, door |
| harrowmark.counting-house.door | 8786 | 1990 | 0 | 90 | poi, door |
| harrowmark.archive.door | 8806 | 2080 | 0 | 90 | poi, door |
| harrowmark.underways.door | 7958 | 1545 | 0 | 270 | poi, door |
| harrowmark.bastion.trainer.gaut | 8150 | 1742.5 | 0 | 0 | trainer |
| harrowmark.bastion.trainer.stane | 8175 | 1742.5 | 0 | 0 | trainer |
| harrowmark.bastion.trainer.pennard | 8200 | 1742.5 | 0 | 0 | trainer |
| harrowmark.bastion.trainer.gerta | 8225 | 1742.5 | 0 | 0 | trainer |
| harrowmark.bastion.trainer.ashdown | 8250 | 1742.5 | 0 | 0 | trainer |
| npc-post.rook | 8360 | 1306 | 0 | 0 | npc-post |
| npc-post.rook.gate | 8486 | 1238 | 0 | 0 | npc-post |
| npc-post.gaut.bastion | 8150 | 1745 | 0 | 0 | npc-post |
| npc-post.stane.bastion | 8175 | 1745 | 0 | 0 | npc-post |
| npc-post.pennard.bastion | 8200 | 1745 | 0 | 0 | npc-post |
| npc-post.gerta.bastion | 8225 | 1745 | 0 | 0 | npc-post |
| npc-post.ashdown.bastion | 8250 | 1745 | 0 | 0 | npc-post |
| npc-post.wystan | 8185 | 1787 | 0 | 0 | npc-post |
| npc-post.dunstan | 8178 | 1496 | 0 | 180 | npc-post |
| npc-post.wace | 8625 | 1356 | 0 | 270 | npc-post |
| npc-post.aldith | 8212 | 1648 | 0 | 0 | npc-post |
| npc-post.merrin | 8782 | 1995 | 0 | 90 | npc-post |
| npc-post.whitlock | 8800 | 2087 | 0 | 90 | npc-post |
| npc-post.pennard.archive | 8800 | 2073 | 0 | 90 | npc-post |
| npc-post.edric | 8488 | 2575 | 0 | 0 | npc-post |
| npc-post.vey.keep | 8512 | 2575 | 0 | 0 | npc-post |
| npc-post.aelfreda.chapel | 8362 | 2158 | 0 | 270 | npc-post |
| npc-post.tobb.south-gate | 8540 | 1275 | 0 | 0 | npc-post |
| npc-post.tobb.keep | 8520 | 2588 | 0 | 0 | npc-post |
| npc-post.gerta.guild | 8780 | 1520 | 0 | 0 | npc-post |
| shop.wystan | 8171 | 1787 | 0 | 0 | shop |
| shop.merrin | 8782 | 1978 | 0 | 90 | shop |
| shop.dunstan | 8183 | 1501 | 0 | 180 | shop |
| shop.gerta | 8791 | 1512 | 0 | 120 | shop, needs-attendant |
| shop.ashdown | 8262 | 1739 | 0 | 270 | shop |
| chest.harrowmark.1 | 8270 | 1520 | 0 | 90 | chest |
| chest.harrowmark.2 | 8925 | 1523 | 0 | 270 | chest |
| chest.harrowmark.3 | 8830 | 2115 | 0 | 0 | chest |
| chest.harrowmark.4 | 8540 | 2520 | 0 | 90 | chest |
| m06.gate-brazier | 8533.5 | 1284 | 0 | 270 | quest |
| spawn.m06.watch-1 | 8478 | 1270 | 0 | 0 | spawn |
| spawn.m06.watch-2 | 8522 | 1270 | 0 | 0 | spawn |
| spawn.m06.watch-3 | 8512 | 1300 | 0 | 0 | spawn |
| m07.bastion-yard | 8200 | 1715 | 0 | 0 | quest |
| m07.satchel | 8975 | 1523 | 0 | 270 | quest, pickup |
| m07.thieves.1 | 8990 | 1514 | 0 | 90 | spawn |
| m07.thieves.2 | 8995 | 1530 | 0 | 90 | spawn |
| m07.thieves.3 | 8984 | 1536 | 0 | 90 | spawn |
| r03.brewing-copper | 8870 | 1620 | 0 | 180 | quest, pickup |
| r03.guildhall.1 | 8850 | 1577 | 0 | 0 | spawn |
| r03.guildhall.2 | 8890 | 1577 | 0 | 0 | spawn |
| r03.guildhall.3 | 8870 | 1566 | 0 | 0 | spawn |
| m10.courier-orders | 8600 | 2475 | 0 | 0 | quest, pickup |
| r04.page-1 | 8700 | 1510 | 0 | 180 | quest, pickup |
| r04.page-2 | 8150 | 1530 | 0 | 180 | quest, pickup |
| r04.page-3 | 8330 | 2195 | 0 | 180 | quest, pickup |
| stealth.m06.start | 8500 | 1234 | 0 | 180 | stealth |
| stealth.m06.cp.inside | 8500 | 1275 | 0 | 180 | stealth |
| stealth.m06.end | 8500 | 1300 | 0 | 180 | stealth |
| hide.m06.1 | 8575 | 1296 | 0 | 270 | hide |
| hide.m06.2 | 8425 | 1296 | 0 | 90 | hide |
| hide.m06.3 | 8470 | 1262 | 0 | 0 | hide |
| hide.m06.4 | 8668 | 1356 | 0 | 180 | hide |
| harrowmark.hide.gate-cart | 8575 | 1296 | 0 | 270 | hide |
| harrowmark.hide.gate-barrels | 8425 | 1296 | 0 | 90 | hide |
| harrowmark.hide.gate-wall-shadow | 8470 | 1262 | 0 | 0 | hide |
| harrowmark.hide.stable-hay | 8668 | 1356 | 0 | 180 | hide |
| harrowmark.hide.barracks-woodpile | 8325 | 1382 | 0 | 270 | hide |
| harrowmark.hide.forge-coalbin | 8120 | 1500 | 0 | 180 | hide |
| harrowmark.hide.anvil-alley | 8180 | 1604 | 0 | 0 | hide |
| harrowmark.hide.guild-crates | 8720 | 1540 | 0 | 270 | hide |
| harrowmark.hide.guild-awning | 8830 | 1490 | 0 | 180 | hide |
| harrowmark.hide.thieves-barrel | 8950 | 1520 | 0 | 270 | hide |
| harrowmark.hide.fountain-arch | 8540 | 1740 | 0 | 90 | hide |
| harrowmark.hide.oswin-hedge | 8770 | 1960 | 0 | 180 | hide |
| harrowmark.hide.archive-columns | 8790 | 2112 | 0 | 0 | hide |
| harrowmark.hide.chapel-buttress | 8370 | 2120 | 0 | 90 | hide |
| harrowmark.hide.keep-road-urn-1 | 8470 | 2300 | 0 | 270 | hide |
| harrowmark.hide.keep-road-urn-2 | 8530 | 2400 | 0 | 90 | hide |
| harrowmark.hide.rooftop-chimney-1 | 8830 | 2300 | 6.5 | 0 | hide, elevated |
| harrowmark.hide.rooftop-chimney-2 | 8780 | 2470 | 7 | 270 | hide, elevated |
| harrowmark.hide.rooftop-skylight | 8930 | 2420 | 7.5 | 180 | hide, elevated |
| harrowmark.patrol.gate-square.1 | 8455 | 1285 | 0 | 180 | patrol |
| harrowmark.patrol.gate-square.2 | 8455 | 1345 | 0 | 180 | patrol |
| harrowmark.patrol.gate-square.3 | 8500 | 1365 | 0 | 180 | patrol |
| harrowmark.patrol.gate-square.4 | 8545 | 1345 | 0 | 180 | patrol |
| harrowmark.patrol.gate-square.5 | 8545 | 1285 | 0 | 180 | patrol |
| harrowmark.patrol.gate-square.6 | 8500 | 1272 | 0 | 180 | patrol |
| patrol.m06.gate-square.1 | 8470 | 1275 | 0 | 180 | patrol |
| patrol.m06.gate-square.2 | 8470 | 1320 | 0 | 180 | patrol |
| patrol.m06.gate-square.3 | 8530 | 1320 | 0 | 180 | patrol |
| patrol.m06.gate-square.4 | 8530 | 1275 | 0 | 180 | patrol |
| patrol.m06.gate-square.5 | 8500 | 1298 | 0 | 180 | patrol |
| harrowmark.patrol.gate-wall-walk.1 | 9063 | 1528 | 0 | 180 | patrol |
| harrowmark.patrol.gate-wall-walk.2 | 9020 | 1480 | 0 | 180 | patrol |
| harrowmark.patrol.gate-wall-walk.3 | 8972 | 1437 | 0 | 180 | patrol |
| harrowmark.patrol.gate-wall-walk.4 | 8922 | 1398 | 0 | 180 | patrol |
| harrowmark.patrol.gate-wall-walk.5 | 8868 | 1363 | 0 | 180 | patrol |
| harrowmark.patrol.gate-wall-walk.6 | 8811 | 1334 | 0 | 180 | patrol |
| harrowmark.patrol.gate-wall-walk.7 | 8751 | 1309 | 0 | 180 | patrol |
| harrowmark.patrol.gate-wall-walk.8 | 8690 | 1290 | 0 | 180 | patrol |
| harrowmark.patrol.gate-wall-walk.9 | 8628 | 1276 | 0 | 180 | patrol |
| harrowmark.patrol.keep-road.1 | 8478 | 1780 | 0 | 180 | patrol |
| harrowmark.patrol.keep-road.2 | 8478 | 2000 | 0 | 180 | patrol |
| harrowmark.patrol.keep-road.3 | 8478 | 2300 | 0 | 180 | patrol |
| harrowmark.patrol.keep-road.4 | 8478 | 2540 | 0 | 180 | patrol |
| harrowmark.patrol.keep-road.5 | 8522 | 2540 | 0 | 180 | patrol |
| harrowmark.patrol.keep-road.6 | 8522 | 2300 | 0 | 180 | patrol |
| harrowmark.patrol.keep-road.7 | 8522 | 2000 | 0 | 180 | patrol |
| harrowmark.patrol.keep-road.8 | 8522 | 1780 | 0 | 180 | patrol |
| harrowmark.patrol.guild-alley.1 | 8935 | 1523.5 | 0 | 180 | patrol |
| harrowmark.patrol.guild-alley.2 | 8975 | 1523.5 | 0 | 180 | patrol |
| harrowmark.patrol.guild-alley.3 | 9010 | 1523.5 | 0 | 180 | patrol |
| harrowmark.patrol.guild-alley.4 | 9045 | 1524 | 0 | 180 | patrol |
| harrowmark.patrol.counting-yard.1 | 8760 | 1975 | 0 | 180 | patrol |
| harrowmark.patrol.counting-yard.2 | 8760 | 2020 | 0 | 180 | patrol |
| harrowmark.patrol.counting-yard.3 | 8725 | 2020 | 0 | 180 | patrol |
| harrowmark.patrol.counting-yard.4 | 8725 | 1975 | 0 | 180 | patrol |
| harrowmark.patrol.barracks.1 | 8330 | 1295 | 0 | 180 | patrol |
| harrowmark.patrol.barracks.2 | 8395 | 1295 | 0 | 180 | patrol |
| harrowmark.patrol.barracks.3 | 8395 | 1365 | 0 | 180 | patrol |
| harrowmark.patrol.barracks.4 | 8330 | 1365 | 0 | 180 | patrol |
| harrowmark.patrol.keep-court.1 | 8470 | 2560 | 0 | 180 | patrol |
| harrowmark.patrol.keep-court.2 | 8470 | 2590 | 0 | 180 | patrol |
| harrowmark.patrol.keep-court.3 | 8530 | 2590 | 0 | 180 | patrol |
| harrowmark.patrol.keep-court.4 | 8530 | 2560 | 0 | 180 | patrol |
| harrowmark.patrol.keep-court.5 | 8500 | 2545 | 0 | 180 | patrol |
| harrowmark.patrol.keep-court.6 | 8500 | 2570 | 0 | 180 | patrol |
| chase.m10.0 | 8900 | 1620 | 0 | 180 | chase, run |
| chase.m10.1 | 8900 | 1760 | 0 | 180 | chase, run |
| chase.m10.2 | 8900 | 1900 | 0 | 180 | chase, run |
| chase.m10.3 | 8900 | 2040 | 0 | 180 | chase, vault |
| chase.m10.4 | 8900 | 2200 | 0 | 180 | chase, run |
| chase.m10.5 | 8850 | 2262 | 6.5 | 180 | chase, run, elevated |
| chase.m10.6 | 8850 | 2338 | 6.5 | 180 | chase, gap, elevated |
| chase.m10.7 | 8850 | 2400 | 7 | 180 | chase, run, elevated |
| chase.m10.8 | 8812 | 2390 | 7 | 180 | chase, gap, elevated |
| chase.m10.9 | 8750 | 2390 | 6.5 | 180 | chase, run, elevated |
| chase.m10.10 | 8756 | 2430 | 6.5 | 180 | chase, gap, elevated |
| chase.m10.11 | 8756 | 2490 | 7 | 180 | chase, run, elevated |
| chase.m10.12 | 8716 | 2490 | 7 | 180 | chase, drop, elevated |
| chase.m10.13 | 8690 | 2494 | 0 | 180 | chase, run |
| chase.m10.14 | 8600 | 2494 | 0 | 180 | chase, run |
| chase.m10.15 | 8510 | 2494 | 0 | 180 | chase, run |
| chase.m10.alt.1 | 8900 | 2100 | 0 | 180 | chase, run |
| chase.m10.alt.2 | 9010 | 2200 | 0 | 180 | chase, run |
| chase.m10.alt.3 | 9010 | 2400 | 0 | 180 | chase, run |
| chase.m10.alt.4 | 9000 | 2540 | 0 | 180 | chase, run |
| chase.m10.alt.5 | 8850 | 2548 | 0 | 180 | chase, run |
| chase.m10.alt.6 | 8690 | 2540 | 0 | 180 | chase, run |
| harrowmark.lane.main-street-south.1 | 8490 | 1290 | 0 | 180 | lane |
| harrowmark.lane.main-street-south.2 | 8490 | 1360 | 0 | 180 | lane |
| harrowmark.lane.main-street-south.3 | 8490 | 1440 | 0 | 180 | lane |
| harrowmark.lane.main-street-south.4 | 8490 | 1520 | 0 | 180 | lane |
| harrowmark.lane.main-street-south.5 | 8490 | 1590 | 0 | 180 | lane |
| harrowmark.lane.main-street-south.6 | 8490 | 1640 | 0 | 180 | lane |
| harrowmark.lane.main-street-south.7 | 8462 | 1670 | 0 | 180 | lane |
| harrowmark.lane.main-street-south.8 | 8460 | 1700 | 0 | 180 | lane |
| harrowmark.lane.main-street-north.1 | 8490 | 1770 | 0 | 180 | lane |
| harrowmark.lane.main-street-north.2 | 8490 | 1850 | 0 | 180 | lane |
| harrowmark.lane.main-street-north.3 | 8490 | 1930 | 0 | 180 | lane |
| harrowmark.lane.main-street-north.4 | 8490 | 2010 | 0 | 180 | lane |
| harrowmark.lane.main-street-north.5 | 8490 | 2090 | 0 | 180 | lane |
| harrowmark.lane.main-street-north.6 | 8490 | 2170 | 0 | 180 | lane |
| harrowmark.lane.main-street-north.7 | 8490 | 2250 | 0 | 180 | lane |
| harrowmark.lane.main-street-north.8 | 8490 | 2330 | 0 | 180 | lane |
| harrowmark.lane.main-street-north.9 | 8490 | 2375 | 0 | 180 | lane |
| harrowmark.lane.main-street-north.10 | 8490 | 2420 | 0 | 180 | lane |
| harrowmark.lane.main-street-north.11 | 8490 | 2470 | 0 | 180 | lane |
| harrowmark.lane.main-street-north.12 | 8490 | 2520 | 0 | 180 | lane |
| harrowmark.lane.market-ring.1 | 8780 | 1550 | 0 | 180 | lane |
| harrowmark.lane.market-ring.2 | 8801 | 1541 | 0 | 180 | lane |
| harrowmark.lane.market-ring.3 | 8810 | 1520 | 0 | 180 | lane |
| harrowmark.lane.market-ring.4 | 8801 | 1499 | 0 | 180 | lane |
| harrowmark.lane.market-ring.5 | 8780 | 1490 | 0 | 180 | lane |
| harrowmark.lane.market-ring.6 | 8759 | 1499 | 0 | 180 | lane |
| harrowmark.lane.market-ring.7 | 8750 | 1520 | 0 | 180 | lane |
| harrowmark.lane.market-ring.8 | 8759 | 1541 | 0 | 180 | lane |
| harrowmark.lane.forge-row.1 | 8100 | 1520 | 0 | 180 | lane |
| harrowmark.lane.forge-row.2 | 8140 | 1520 | 0 | 180 | lane |
| harrowmark.lane.forge-row.3 | 8180 | 1520 | 0 | 180 | lane |
| harrowmark.lane.forge-row.4 | 8230 | 1520 | 0 | 180 | lane |
| harrowmark.lane.forge-row.5 | 8290 | 1520 | 0 | 180 | lane |
| harrowmark.lane.guild-alley.1 | 8940 | 1525 | 0 | 180 | lane |
| harrowmark.lane.guild-alley.2 | 8958 | 1525 | 0 | 180 | lane |
| harrowmark.lane.guild-alley.3 | 8985 | 1525 | 0 | 180 | lane |
| harrowmark.lane.guild-alley.4 | 9015 | 1525 | 0 | 180 | lane |
| harrowmark.lane.guild-alley.5 | 9040 | 1532 | 0 | 180 | lane |
| harrowmark.lane.guild-alley.6 | 9060 | 1542 | 0 | 180 | lane |
| harrowmark.lane.gate-queue.1 | 8500 | 1262 | 0 | 180 | lane |
| harrowmark.lane.gate-queue.2 | 8500 | 1285 | 0 | 180 | lane |
| harrowmark.lane.gate-queue.3 | 8500 | 1312 | 0 | 180 | lane |
| harrowmark.lane.gate-queue.4 | 8495 | 1345 | 0 | 180 | lane |
| harrowmark.lane.fountain-circuit.1 | 8512 | 1730 | 0 | 180 | lane |
| harrowmark.lane.fountain-circuit.2 | 8530 | 1712 | 0 | 180 | lane |
| harrowmark.lane.fountain-circuit.3 | 8530 | 1688 | 0 | 180 | lane |
| harrowmark.lane.fountain-circuit.4 | 8512 | 1670 | 0 | 180 | lane |
| harrowmark.lane.fountain-circuit.5 | 8488 | 1670 | 0 | 180 | lane |
| harrowmark.lane.fountain-circuit.6 | 8470 | 1688 | 0 | 180 | lane |
| harrowmark.lane.fountain-circuit.7 | 8470 | 1712 | 0 | 180 | lane |
| harrowmark.lane.fountain-circuit.8 | 8488 | 1730 | 0 | 180 | lane |
| harrowmark.lane.chapel-approach.1 | 8480 | 2150 | 0 | 180 | lane |
| harrowmark.lane.chapel-approach.2 | 8430 | 2150 | 0 | 180 | lane |
| harrowmark.lane.chapel-approach.3 | 8392 | 2150 | 0 | 180 | lane |
| harrowmark.lane.chapel-approach.4 | 8358 | 2150 | 0 | 180 | lane |
| harrowmark.lane.bastion-edge.1 | 8292 | 1690 | 0 | 180 | lane |
| harrowmark.lane.bastion-edge.2 | 8292 | 1740 | 0 | 180 | lane |
| harrowmark.lane.bastion-edge.3 | 8292 | 1790 | 0 | 180 | lane |
| harrowmark.lane.bastion-edge.4 | 8292 | 1850 | 0 | 180 | lane |
| harrowmark.lane.rooftop-ward-streets.1 | 8897 | 2250 | 0 | 180 | lane |
| harrowmark.lane.rooftop-ward-streets.2 | 8897 | 2310 | 0 | 180 | lane |
| harrowmark.lane.rooftop-ward-streets.3 | 8897 | 2380 | 0 | 180 | lane |
| harrowmark.lane.rooftop-ward-streets.4 | 8897 | 2430 | 0 | 180 | lane |
| harrowmark.lane.rooftop-ward-streets.5 | 8897 | 2480 | 0 | 180 | lane |
| harrowmark.lane.rooftop-ward-streets.6 | 8897 | 2528 | 0 | 180 | lane |
| harrowmark.lane.rooftop-ward-streets.7 | 8897 | 2540 | 0 | 180 | lane |
| harrowmark.brazier.keep-road.01 | 8492 | 1760 | 0 | 180 | brazier |
| harrowmark.brazier.keep-road.02 | 8508 | 1799 | 0 | 180 | brazier |
| harrowmark.brazier.keep-road.03 | 8492 | 1838 | 0 | 180 | brazier |
| harrowmark.brazier.keep-road.04 | 8508 | 1877 | 0 | 180 | brazier |
| harrowmark.brazier.keep-road.05 | 8492 | 1916 | 0 | 180 | brazier |
| harrowmark.brazier.keep-road.06 | 8508 | 1955 | 0 | 180 | brazier |
| harrowmark.brazier.keep-road.07 | 8492 | 1994 | 0 | 180 | brazier |
| harrowmark.brazier.keep-road.08 | 8508 | 2033 | 0 | 180 | brazier |
| harrowmark.brazier.keep-road.09 | 8492 | 2072 | 0 | 180 | brazier |
| harrowmark.brazier.keep-road.10 | 8508 | 2111 | 0 | 180 | brazier |
| harrowmark.brazier.keep-road.11 | 8492 | 2150 | 0 | 180 | brazier |
| harrowmark.brazier.keep-road.12 | 8508 | 2189 | 0 | 180 | brazier |
| harrowmark.brazier.keep-road.13 | 8492 | 2228 | 0 | 180 | brazier |
| harrowmark.brazier.keep-road.14 | 8508 | 2267 | 0 | 180 | brazier |
| harrowmark.brazier.keep-road.15 | 8492 | 2306 | 0 | 180 | brazier |
| harrowmark.brazier.keep-road.16 | 8508 | 2345 | 0 | 180 | brazier |
| harrowmark.brazier.keep-road.17 | 8492 | 2384 | 0 | 180 | brazier |
| harrowmark.brazier.keep-road.18 | 8508 | 2423 | 0 | 180 | brazier |
| harrowmark.brazier.keep-road.19 | 8492 | 2462 | 0 | 180 | brazier |
| harrowmark.brazier.keep-road.20 | 8508 | 2501 | 0 | 180 | brazier |
| harrowmark.brazier.keep-road.21 | 8492 | 2540 | 0 | 180 | brazier |
| harrowmark.banner.bastion.1 | 8165 | 1794.2 | 8 | 0 | banner, elevated |
| harrowmark.banner.bastion.2 | 8185 | 1794.2 | 8 | 0 | banner, elevated |
| harrowmark.banner.bastion.3 | 8215 | 1794.2 | 8 | 0 | banner, elevated |
| harrowmark.banner.bastion.4 | 8235 | 1794.2 | 8 | 0 | banner, elevated |
| harrowmark.banner.keep.1 | 8458 | 2598.5 | 10 | 0 | banner, elevated |
| harrowmark.banner.keep.2 | 8474 | 2598.5 | 10 | 0 | banner, elevated |
| harrowmark.banner.keep.3 | 8490 | 2598.5 | 10 | 0 | banner, elevated |
| harrowmark.banner.keep.4 | 8510 | 2598.5 | 10 | 0 | banner, elevated |
| harrowmark.banner.keep.5 | 8526 | 2598.5 | 10 | 0 | banner, elevated |
| harrowmark.banner.keep.6 | 8542 | 2598.5 | 10 | 0 | banner, elevated |
| npc-post.rook.inner | 8530 | 1289 | 0 | 315 | npc-post |
| npc-post.refugee-1.inside | 8452 | 1338 | 0 | 270 | npc-post |
| npc-post.refugee-2.inside | 8455 | 1343 | 0 | 300 | npc-post |
| npc-post.stallholder-1 | 8763.8 | 1529.5 | 0 | 300 | npc-post |
| npc-post.stallholder-2 | 8789.5 | 1536.4 | 0 | 30 | npc-post |
| m07.coin-1 | 8830 | 1522 | 0 | 270 | quest, interact |
| m07.coin-2 | 8885 | 1524 | 0 | 270 | quest, interact |
| m07.coin-3 | 8928 | 1523 | 0 | 270 | quest, interact |
| bastion.r02.dummy-1 | 8170 | 1730 | 0 | 180 | dummy |
| bastion.r02.dummy-2 | 8175 | 1730 | 0 | 180 | dummy |
| bastion.r02.dummy-3 | 8180 | 1730 | 0 | 180 | dummy |
| spawn.r02.bastion-bout | 8195 | 1728 | 0 | 120 | spawn |
| spawn.r02.bastion-pair-1 | 8190 | 1722 | 0 | 150 | spawn |
| spawn.r02.bastion-pair-2 | 8200 | 1722 | 0 | 210 | spawn |
| npc-post.guild-doorman | 8858 | 1582 | 0 | 0 | npc-post |
| npc-post.pellam | 8858 | 1622 | 0 | 270 | npc-post |
| spawn.r03.snatch-1 | 8745 | 1626 | 0 | 270 | spawn |
| spawn.r03.snatch-2 | 8750 | 1632 | 0 | 270 | spawn |
| npc-post.sexton | 8372 | 2142 | 0 | 90 | npc-post |
| npc-post.fence | 8727 | 1545 | 0 | 270 | npc-post |
| npc-post.crabbe | 8774 | 1984 | 0 | 270 | npc-post |

## Triggers

| id | shape | x | z | size |
| --- | --- | --- | --- | --- |
| trg.harrowmark.door.tilted-anvil | sphere | 8200 | 1652 | r 2 |
| trg.harrowmark.door.tilted-anvil-back | sphere | 8200 | 1683.5 | r 2 |
| trg.harrowmark.door.keep-hall | sphere | 8500 | 2596 | r 2 |
| trg.harrowmark.door.counting-house | sphere | 8786 | 1990 | r 2 |
| trg.harrowmark.door.archive | sphere | 8806 | 2080 | r 2 |
| trg.harrowmark.door.underways | sphere | 7958 | 1545 | r 2 |
| trg.harrowmark.gate-south | sphere | 8500 | 1256 | r 6 |
| trg.harrowmark.bastion-yard | box | 8200 | 1735 | half 70 x 6 x 55 |
| trg.harrowmark.anvil-sign | sphere | 8204 | 1645 | r 7 |

## Structures

| id | kind | x | z | footprint | mode |
| --- | --- | --- | --- | --- | --- |
| wall.0a | wall | 8528.06 | 1250 | 28.12 x 4 | solid |
| wall.0b | wall | 8471.94 | 1250 | 28.12 x 4 | solid |
| tower.south-l | tower | 8510 | 1250 | 8 x 7 | solid |
| tower.south-r | tower | 8490 | 1250 | 8 x 7 | solid |
| portcullis.south | gate | 8500 | 1250 | 12 x 2.4 | solid |
| wall.1 | wall | 8416.03 | 1254.72 | 84.24 x 4 | solid |
| wall.2 | wall | 8333.11 | 1268.8 | 84.24 x 4 | solid |
| wall.3 | wall | 8252.29 | 1292.09 | 84.24 x 4 | solid |
| wall.4 | wall | 8174.59 | 1324.27 | 84.24 x 4 | solid |
| wall.5 | wall | 8100.98 | 1364.96 | 84.24 x 4 | solid |
| wall.6 | wall | 8032.38 | 1413.63 | 84.24 x 4 | solid |
| wall.7 | wall | 7969.67 | 1469.67 | 84.24 x 4 | solid |
| wall.8a | wall | 7931.12 | 1510.44 | 28.12 x 4 | solid |
| wall.8b | wall | 7896.13 | 1554.32 | 28.12 x 4 | solid |
| tower.smelter-l | tower | 7919.86 | 1524.56 | 8 x 7 | solid |
| tower.smelter-r | tower | 7907.39 | 1540.2 | 8 x 7 | solid |
| plug.smelter | wall | 7913.63 | 1532.38 | 12 x 2.4 | solid |
| wall.9 | wall | 7864.96 | 1600.98 | 84.24 x 4 | solid |
| wall.10 | wall | 7824.27 | 1674.59 | 84.24 x 4 | solid |
| wall.11 | wall | 7792.09 | 1752.29 | 84.24 x 4 | solid |
| wall.12 | wall | 7768.8 | 1833.11 | 84.24 x 4 | solid |
| wall.13 | wall | 7754.72 | 1916.03 | 84.24 x 4 | solid |
| wall.14 | wall | 7750 | 2000 | 84.24 x 4 | solid |
| wall.15 | wall | 7754.72 | 2083.97 | 84.24 x 4 | solid |
| wall.16a | wall | 7762.56 | 2139.53 | 28.12 x 4 | solid |
| wall.16b | wall | 7775.05 | 2194.25 | 28.12 x 4 | solid |
| tower.west-l | tower | 7766.58 | 2157.14 | 8 x 7 | solid |
| tower.west-r | tower | 7771.03 | 2176.64 | 8 x 7 | solid |
| plug.west | wall | 7768.8 | 2166.89 | 12 x 2.4 | solid |
| wall.17 | wall | 7792.09 | 2247.71 | 84.24 x 4 | solid |
| wall.18 | wall | 7824.27 | 2325.41 | 84.24 x 4 | solid |
| wall.19 | wall | 7864.96 | 2399.02 | 84.24 x 4 | solid |
| wall.20 | wall | 7913.63 | 2467.62 | 84.24 x 4 | solid |
| wall.21 | wall | 7969.67 | 2530.33 | 84.24 x 4 | solid |
| wall.22 | wall | 8032.38 | 2586.37 | 84.24 x 4 | solid |
| wall.23 | wall | 8100.98 | 2635.04 | 84.24 x 4 | solid |
| wall.24a | wall | 8149.31 | 2663.55 | 28.12 x 4 | solid |
| wall.24b | wall | 8199.87 | 2687.9 | 28.12 x 4 | solid |
| tower.northwest-l | tower | 8165.58 | 2671.39 | 8 x 7 | solid |
| tower.northwest-r | tower | 8183.6 | 2680.07 | 8 x 7 | solid |
| plug.northwest | wall | 8174.59 | 2675.73 | 12 x 2.4 | solid |
| wall.25 | wall | 8252.29 | 2707.91 | 84.24 x 4 | solid |
| wall.26 | wall | 8333.11 | 2731.2 | 84.24 x 4 | solid |
| wall.27 | wall | 8416.03 | 2745.28 | 84.24 x 4 | solid |
| wall.28 | wall | 8500 | 2750 | 84.24 x 4 | solid |
| wall.29 | wall | 8583.97 | 2745.28 | 84.24 x 4 | solid |
| wall.30 | wall | 8666.89 | 2731.2 | 84.24 x 4 | solid |
| wall.31 | wall | 8747.71 | 2707.91 | 84.24 x 4 | solid |
| wall.32a | wall | 8800.13 | 2687.9 | 28.12 x 4 | solid |
| wall.32b | wall | 8850.69 | 2663.55 | 28.12 x 4 | solid |
| tower.northeast-l | tower | 8816.4 | 2680.07 | 8 x 7 | solid |
| tower.northeast-r | tower | 8834.42 | 2671.39 | 8 x 7 | solid |
| plug.northeast | wall | 8825.41 | 2675.73 | 12 x 2.4 | solid |
| wall.33 | wall | 8899.02 | 2635.04 | 84.24 x 4 | solid |
| wall.34 | wall | 8967.62 | 2586.37 | 84.24 x 4 | solid |
| wall.35 | wall | 9030.33 | 2530.33 | 84.24 x 4 | solid |
| wall.36 | wall | 9086.37 | 2467.62 | 84.24 x 4 | solid |
| wall.37 | wall | 9135.04 | 2399.02 | 84.24 x 4 | solid |
| wall.38 | wall | 9175.73 | 2325.41 | 84.24 x 4 | solid |
| wall.39 | wall | 9207.91 | 2247.71 | 84.24 x 4 | solid |
| wall.40a | wall | 9224.95 | 2194.25 | 28.12 x 4 | solid |
| wall.40b | wall | 9237.44 | 2139.53 | 28.12 x 4 | solid |
| tower.river-l | tower | 9228.97 | 2176.64 | 8 x 7 | solid |
| tower.river-r | tower | 9233.42 | 2157.14 | 8 x 7 | solid |
| plug.river | wall | 9231.2 | 2166.89 | 12 x 2.4 | solid |
| wall.41 | wall | 9245.28 | 2083.97 | 84.24 x 4 | solid |
| wall.42 | wall | 9250 | 2000 | 84.24 x 4 | solid |
| wall.43 | wall | 9245.28 | 1916.03 | 84.24 x 4 | solid |
| wall.44 | wall | 9231.2 | 1833.11 | 84.24 x 4 | solid |
| wall.45 | wall | 9207.91 | 1752.29 | 84.24 x 4 | solid |
| wall.46 | wall | 9175.73 | 1674.59 | 84.24 x 4 | solid |
| wall.47 | wall | 9135.04 | 1600.98 | 84.24 x 4 | solid |
| wall.48a | wall | 9103.87 | 1554.32 | 28.12 x 4 | solid |
| wall.48b | wall | 9068.88 | 1510.44 | 28.12 x 4 | solid |
| tower.guild-l | tower | 9092.61 | 1540.2 | 8 x 7 | solid |
| tower.guild-r | tower | 9080.14 | 1524.56 | 8 x 7 | solid |
| plug.guild | wall | 9086.37 | 1532.38 | 12 x 2.4 | solid |
| wall.49 | wall | 9030.33 | 1469.67 | 84.24 x 4 | solid |
| wall.50 | wall | 8967.62 | 1413.63 | 84.24 x 4 | solid |
| wall.51 | wall | 8899.02 | 1364.96 | 84.24 x 4 | solid |
| wall.52 | wall | 8825.41 | 1324.27 | 84.24 x 4 | solid |
| wall.53 | wall | 8747.71 | 1292.09 | 84.24 x 4 | solid |
| wall.54 | wall | 8666.89 | 1268.8 | 84.24 x 4 | solid |
| wall.55 | wall | 8583.97 | 1254.72 | 84.24 x 4 | solid |
| barracks.hall | house | 8360 | 1330 | 44 x 30 | solid |
| stables.hall | house | 8640 | 1330 | 40 x 30 | solid |
| gate.brazier-m06 | crate | 8537 | 1286 | 1.4 x 1.4 | solid |
| forge.a0 | house | 8110 | 1480 | 30 x 24 | solid |
| forge.a1 | house | 8144 | 1480 | 30 x 24 | solid |
| forge.dunstan | house | 8178 | 1480 | 30 x 24 | solid |
| forge.a3 | house | 8212 | 1480 | 30 x 24 | solid |
| forge.a4 | house | 8246 | 1480 | 30 x 24 | solid |
| forge.b0 | house | 8110 | 1560 | 30 x 24 | solid |
| forge.b1 | house | 8144 | 1560 | 30 x 24 | solid |
| forge.b2 | house | 8178 | 1560 | 30 x 24 | solid |
| forge.b3 | house | 8246 | 1560 | 30 x 24 | solid |
| tilted-anvil | tavern | 8200 | 1668 | 30 x 24 | solid |
| underways.gatehouse | house | 7948 | 1545 | 10 x 12 | solid |
| bastion.hall | house | 8200 | 1810 | 80 x 30 | solid |
| bastion.yard-fence | yard-fence | 8200 | 1735 | 140 x 110 | open |
| bastion.drill-blocker | block | 8165 | 1710 | 6 x 1.2 | solid |
| fountain | fountain | 8500 | 1700 | 12 x 12 | solid |
| guild.hall | house | 8870 | 1600 | 40 x 28 | solid |
| guild.house-w1 | house | 8690 | 1475 | 26 x 20 | solid |
| guild.house-w2 | house | 8690 | 1560 | 26 x 20 | solid |
| guild.house-e1 | house | 8870 | 1480 | 30 x 20 | solid |
| guild.alley-a | house | 8950 | 1508 | 30 x 20 | solid |
| guild.alley-b | house | 8950 | 1538 | 30 x 20 | solid |
| guild.stall-30 | stall | 8791 | 1539.05 | 4 x 3 | solid |
| guild.stall-60 | stall | 8799.05 | 1531 | 4 x 3 | solid |
| guild.stall-120 | stall | 8799.05 | 1509 | 4 x 3 | solid |
| guild.stall-150 | stall | 8791 | 1500.95 | 4 x 3 | solid |
| guild.stall-210 | stall | 8769 | 1500.95 | 4 x 3 | solid |
| guild.stall-240 | stall | 8760.95 | 1509 | 4 x 3 | solid |
| guild.stall-300 | stall | 8760.95 | 1531 | 4 x 3 | solid |
| guild.stall-330 | stall | 8769 | 1539.05 | 4 x 3 | solid |
| counting-house | house | 8820 | 1990 | 60 x 40 | solid |
| archive | house | 8830 | 2080 | 40 x 36 | solid |
| chapel | chapel | 8330 | 2150 | 30 x 40 | solid |
| keep.hall | house | 8500 | 2625 | 100 x 50 | solid |
| keep.tower-0 | tower | 8444 | 2604 | 12 x 12 | solid |
| keep.tower-1 | tower | 8556 | 2604 | 12 x 12 | solid |
| keep.tower-2 | tower | 8444 | 2646 | 12 x 12 | solid |
| keep.tower-3 | tower | 8556 | 2646 | 12 x 12 | solid |
| keep-road.w1850 | house | 8450 | 1850 | 24 x 40 | solid |
| keep-road.e1850 | house | 8550 | 1850 | 24 x 40 | solid |
| keep-road.w1930 | house | 8450 | 1930 | 24 x 40 | solid |
| keep-road.e1930 | house | 8550 | 1930 | 24 x 40 | solid |
| keep-road.w2010 | house | 8450 | 2010 | 24 x 40 | solid |
| keep-road.e2010 | house | 8550 | 2010 | 24 x 40 | solid |
| keep-road.w2090 | house | 8450 | 2090 | 24 x 40 | solid |
| keep-road.e2090 | house | 8550 | 2090 | 24 x 40 | solid |
| keep-road.w2230 | house | 8450 | 2230 | 24 x 40 | solid |
| keep-road.e2230 | house | 8550 | 2230 | 24 x 40 | solid |
| keep-road.w2310 | house | 8450 | 2310 | 24 x 40 | solid |
| keep-road.e2310 | house | 8550 | 2310 | 24 x 40 | solid |
| keep-road.w2470 | house | 8450 | 2470 | 24 x 40 | solid |
| keep-road.e2470 | house | 8550 | 2470 | 24 x 40 | solid |
| ward.b00 | block | 8756 | 2296 | 91 x 91 | solid |
| ward.b01 | block | 8756 | 2390 | 91 x 91 | solid |
| ward.b02 | block | 8756 | 2484 | 91 x 91 | solid |
| ward.b10 | block | 8850 | 2296 | 91 x 91 | solid |
| ward.b11 | block | 8850 | 2390 | 91 x 91 | solid |
| ward.b12 | block | 8850 | 2484 | 91 x 91 | solid |
| ward.b20 | block | 8944 | 2296 | 91 x 91 | solid |
| ward.b21 | block | 8944 | 2390 | 91 x 91 | solid |
| ward.b22 | block | 8944 | 2484 | 91 x 91 | solid |
| ward.stair.1 | stair-step | 8850 | 2232 | 4 x 1 | solid |
| ward.stair.2 | stair-step | 8850 | 2233 | 4 x 1 | solid |
| ward.stair.3 | stair-step | 8850 | 2234 | 4 x 1 | solid |
| ward.stair.4 | stair-step | 8850 | 2235 | 4 x 1 | solid |
| ward.stair.5 | stair-step | 8850 | 2236 | 4 x 1 | solid |
| ward.stair.6 | stair-step | 8850 | 2237 | 4 x 1 | solid |
| ward.stair.7 | stair-step | 8850 | 2238 | 4 x 1 | solid |
| ward.stair.8 | stair-step | 8850 | 2239 | 4 x 1 | solid |
| ward.stair.9 | stair-step | 8850 | 2240 | 4 x 1 | solid |
| ward.stair.10 | stair-step | 8850 | 2241 | 4 x 1 | solid |
| ward.stair.11 | stair-step | 8850 | 2242 | 4 x 1 | solid |
| ward.stair.12 | stair-step | 8850 | 2243 | 4 x 1 | solid |
| ward.stair.13 | stair-step | 8850 | 2244 | 4 x 1 | solid |
| ward.stair.14 | stair-step | 8850 | 2245 | 4 x 1 | solid |
| ward.stair.15 | stair-step | 8850 | 2246 | 4 x 1 | solid |
| ward.stair.16 | stair-step | 8850 | 2247 | 4 x 1 | solid |
| ward.stair.17 | stair-step | 8850 | 2248 | 4 x 1 | solid |
| ward.stair.18 | stair-step | 8850 | 2249 | 4 x 1 | solid |
| ward.stair.19 | stair-step | 8850 | 2250 | 4 x 1 | solid |
| chase.low-wall | crate | 8900 | 2060 | 6 x 1.2 | solid |
| hide-prop.gate-cart | crate | 8573 | 1296 | 3.2 x 1.6 | solid |
| hide-prop.gate-barrels | crate | 8427 | 1296 | 3.2 x 1.6 | solid |
| hide-prop.gate-wall-shadow | crate | 8470 | 1264 | 3.2 x 1.6 | solid |
| hide-prop.stable-hay | crate | 8668 | 1354 | 3.2 x 1.6 | solid |
| hide-prop.barracks-woodpile | crate | 8323 | 1382 | 3.2 x 1.6 | solid |
| hide-prop.forge-coalbin | crate | 8120 | 1498 | 3.2 x 1.6 | solid |
| hide-prop.anvil-alley | crate | 8180 | 1606 | 3.2 x 1.6 | solid |
| hide-prop.guild-crates | crate | 8718 | 1540 | 3.2 x 1.6 | solid |
| hide-prop.guild-awning | crate | 8830 | 1488 | 3.2 x 1.6 | solid |
| hide-prop.thieves-barrel | crate | 8948 | 1520 | 3.2 x 1.6 | solid |
| hide-prop.fountain-arch | crate | 8542 | 1740 | 3.2 x 1.6 | solid |
| hide-prop.oswin-hedge | crate | 8770 | 1958 | 3.2 x 1.6 | solid |
| hide-prop.archive-columns | crate | 8790 | 2114 | 3.2 x 1.6 | solid |
| hide-prop.chapel-buttress | crate | 8372 | 2120 | 3.2 x 1.6 | solid |
| hide-prop.keep-road-urn-1 | crate | 8468 | 2300 | 3.2 x 1.6 | solid |
| hide-prop.keep-road-urn-2 | crate | 8532 | 2400 | 3.2 x 1.6 | solid |
| hide-prop.rooftop-chimney-1 | crate | 8830 | 2302 | 3.2 x 1.6 | solid |
| hide-prop.rooftop-chimney-2 | crate | 8778 | 2470 | 3.2 x 1.6 | solid |
| hide-prop.rooftop-skylight | crate | 8930 | 2418 | 3.2 x 1.6 | solid |
