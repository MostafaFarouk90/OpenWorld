# src/nav

Walking navigation over flat-floored grids (interiors and Harrowmark's street blocks). Plugged in only through `nav.plugin.ts`;
no shared core file is edited. Outside every grid, callers keep steering straight at their target.

| File | What it does |
| --- | --- |
| `nav.plugin.ts` | Registers the `nav` service backed by one `NavRegistry`. |
| `service.ts` | `NavService` type and the `GameServices.nav` augmentation. |
| `NavGrid.ts` | Pure cell grid: walkable rects minus blocked rects minus closed named blockers; exact clearance transform; 8-connected components (no corner cutting). |
| `pathfind.ts` | `findPath(grid, from, to, radius)`: A* (octile, binary heap, per-grid scratch buffers) plus string-pull smoothing with supercover line of sight. |
| `NavRegistry.ts` | Grids by id; routes a query to the grid containing the start point. |
| `NavAgent.ts` | Steering hook for enemy AI and companions: next waypoint inside a grid, raw target elsewhere; rate-limited repathing. |
| `city/blocks.ts` | `CITY_NAV_BLOCKS` and `blockGridDef`: one 1 m grid per street block, minus every footprint that has a collider (rotated, padded half a cell). |
| `city/CityNavStreamer.ts` | Adds a block's grid within 150 m of it (one build per tick, nearest first), removes it beyond 250 m; built grids are kept. |
| `city/cityNav.plugin.ts` | Plugin `city-nav` (`dependsOn: core, nav, harrowmark`): runs the streamer at rules order 410; service `cityNav.active()`. |

Clearance of a walkable cell is the distance from its centre to the nearest non-walkable cell centre (cells
outside the grid count as non-walkable) minus half a cell: 0.25 m against a wall at 0.5 m cells. A cell is
valid for an agent when it is walkable and its clearance is at least the agent radius.

Service (`ctx.services.get('nav')`): `path(from, to, { radius? })` (waypoints at floor height excluding the
start; null when `from` is in no grid; default radius 0.4), `hasGrid(at)`, `floorAt(at)`, `addGrid(grid)`
(returns the undo), `setBlocker(blockerId, closed)` and `gridId(at)`. When the target is blocked, outside the grid or
unreachable the path ends at the nearest reachable cell centre.

`NavGridDef.blockedOriented` takes rotated rects `{ cx, cz, hx, hz, yaw }` (yaw in radians about +Y, the Three and Rapier
convention); a cell is blocked when its centre is inside one.

## Leaving a grid (contract section 2, Phase B review)

A path toward a goal outside the start's grid ends at the nearest edge cell. Once that last waypoint is reached `NavAgent`
steers straight at the goal, so a chaser or a fleeing cutpurse walks off the block instead of parking on its edge. "Outside"
is `gridId(goal) !== gridId(self)` (a goal in no grid, or in another one). A goal inside the same grid that the path cannot
reach (behind a closed gate) still holds at the path's end. Other followers (thread 5's `PathFollower`) should use the same
test.

## Harrowmark blocks (`city/blocks.ts`)

| Block | Rect (x, z) | Cells (1 m) | Build | A* worst / typical |
| --- | --- | --- | --- | --- |
| `guild-quarter` (market, stalls, thieves' alley, guildhall front) | 8705..9065, 1465..1590 | 45,000 | about 8 ms | 9.4 ms / 0.4 ms |
| `forge-row` | 8080..8300, 1460..1590 | 28,600 | about 6 ms | 2.5 ms / 0.1 ms |
| `bastion-yard` | 8120..8290, 1686..1795 | 18,530 | about 3 ms | 1.7 ms / 0.1 ms |
| `south-gate` (inside the wall; the portcullis is outside the grid) | 8410..8590, 1256..1400 | 25,920 | about 4 ms | 2.2 ms / 0.2 ms |

Measured in vitest on the build container (worst = corner to corner, to a blocked goal, or to a goal outside; typical = 20 m).
Every block stays under `MAX_BLOCK_CELLS` (120k) and the blocks are at least 50 m apart. The floor is the highest ground in
the block (the plateau is flat at 20 m); a block whose ground varies more than 0.6 m is skipped with a warning. The 2.5 m
band keeps the Rooftop Ward and the interiors (150 m up) out. Grids have no blockers. Crowds, guards and the M10 chase never
call `nav.path`.
