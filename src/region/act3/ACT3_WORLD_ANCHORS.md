# Act 3 world anchors (roads, fog walls, camp hearth)

Generated from `act3/act3World.layout.ts` by `npx vite-node tools/gen-region-docs.ts`; a test fails when this file drifts.
Metres from the origin, +Z north, yaw 0 faces -Z, yaw 90 faces -X. Anchor `y` is absolute and computed from the terrain at runtime.

## Anchors

| id | x | z | dy | yaw | tags |
| --- | --- | --- | --- | --- | --- |
| fenroad.start | 8150 | 2735 | 0 | 0 | road |
| fenroad.end | 3285 | 10135 | 0 | 0 | road |
| fenroad.junction.fen-track | 4600 | 9821 | 0 | 0 | road, junction |
| greyfen.fen-track.end | 5610 | 12270 | 0 | 0 | road |
| spineroad.start | 5640 | 12320 | 0 | 0 | road |
| spineroad.end | 13530 | 11900 | 0 | 0 | road |
| dragonspine.track.start | 20660 | 8250 | 0 | 0 | road |
| dragonspine.track.end | 13670 | 11900 | 0 | 0 | road |
| dragonspine.pass.start | 13600 | 11955 | 0 | 0 | road |
| dragonspine.pass.end | 13600 | 15475 | 0 | 0 | road |
| dragonspine.spur.start | 13570 | 14750 | 0 | 0 | road, junction |
| dragonspine.spur.end | 12280 | 15200 | 0 | 0 | road |
| spineroad.fog.spine-road | 6470 | 12783.5 | 0 | 0 | fog-wall |
| dragonspine.fog.summit | 13600 | 14770 | 0 | 0 | fog-wall |
| dragonspine.fog.wyrmwatch-waste | 13250 | 11050 | 0 | 0 | fog-wall |
| fenroad.fog.fen-waste | 6990 | 4700 | 0 | 0 | fog-wall |
| dragonspine.wyrmwatch.hearth | 13620 | 11880 | 0 | 0 | camp |

## Triggers

| id | shape | x | z | size |
| --- | --- | --- | --- | --- |

## Structures

| id | kind | x | z | footprint | mode |
| --- | --- | --- | --- | --- | --- |
