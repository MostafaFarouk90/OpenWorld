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

City block grids are open-edged (`NavGridDef.openEdges`): when the goal is in no grid or in another grid, `nav.path` ends
with the goal itself after the edge cell, so every follower (thread 5's `PathFollower`, Tobb's steer, `NavAgent`) walks off
the block instead of parking on its edge. Interior grids are not open-edged: beyond their edge is a wall, so a path still
ends at the nearest reachable cell. A goal inside the same grid that the path cannot reach (behind a closed gate, inside a
building) also ends at the nearest reachable cell. `NavAgent` additionally steers at the raw goal once a path toward a goal
outside its grid (`gridId(goal) !== gridId(self)`) is used up.

## Harrowmark blocks (`city/blocks.ts`)

| Block | Rect (x, z) | Cells (1 m) | Build (warm) | A*: across the block / to a goal outside, median and worst / 20 m |
| --- | --- | --- | --- | --- |
| `guild-quarter` (market, stalls, thieves' alley, guildhall front) | 8705..9065, 1465..1590 | 45,000 | 9 ms | 6.5 ms / 1.5 and 13 ms / 0.02 ms |
| `forge-row` | 8080..8300, 1460..1590 | 28,600 | 5 ms | 2.2 ms / 1.3 and 5.3 ms / 0.01 ms |
| `bastion-yard` | 8120..8290, 1686..1795 | 18,530 | 3 ms | 2.2 ms / 0.4 and 0.7 ms / 0.01 ms |
| `south-gate` (inside the wall; the portcullis is outside the grid) | 8410..8590, 1256..1400 | 25,920 | 5 ms | 2.3 ms / 0.4 and 1.1 ms / 0.01 ms |

Measured in vitest on the build container. The first grid built in a fresh process costs up to about 40 ms (JIT warm-up);
in the game the interiors build theirs at setup first. Each block is built once per session, on approach at 150 m, at most
one per tick, and then kept. Valid cells are cached per radius and grid revision, so a short query does no full-grid pass.
Every block stays under `MAX_BLOCK_CELLS` (120k) and the blocks are at least 50 m apart. Cells beyond the ring wall's inner
face are blocked (`CITY_RING`). The floor is the highest ground in the block (the plateau is flat at 20 m); a block whose
ground varies more than 0.6 m is skipped with a warning. The 2.5 m band keeps the Rooftop Ward and the interiors (150 m up)
out. Grids have no blockers. Crowds, guards and the M10 chase never call `nav.path`. There is no per-tick cap on repaths
across enemies (each follower repaths at most every 0.5 s).
