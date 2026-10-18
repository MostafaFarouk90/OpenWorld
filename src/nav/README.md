# src/nav

Walking navigation over flat-floored grids (interiors, yards). Plugged in only through `nav.plugin.ts`;
no shared core file is edited. Outside every grid, callers keep steering straight at their target.

| File | What it does |
| --- | --- |
| `nav.plugin.ts` | Registers the `nav` service backed by one `NavRegistry`. |
| `service.ts` | `NavService` type and the `GameServices.nav` augmentation. |
| `NavGrid.ts` | Pure cell grid: walkable rects minus blocked rects minus closed named blockers; exact clearance transform; 8-connected components (no corner cutting). |
| `pathfind.ts` | `findPath(grid, from, to, radius)`: A* (octile, binary heap, per-grid scratch buffers) plus string-pull smoothing with supercover line of sight. |
| `NavRegistry.ts` | Grids by id; routes a query to the grid containing the start point. |
| `NavAgent.ts` | Steering hook for enemy AI and companions: next waypoint inside a grid, raw target elsewhere; rate-limited repathing. |

Clearance of a walkable cell is the distance from its centre to the nearest non-walkable cell centre (cells
outside the grid count as non-walkable) minus half a cell: 0.25 m against a wall at 0.5 m cells. A cell is
valid for an agent when it is walkable and its clearance is at least the agent radius.

Service (`ctx.services.get('nav')`): `path(from, to, { radius? })` (waypoints at floor height excluding the
start; null when `from` is in no grid; default radius 0.4), `hasGrid(at)`, `floorAt(at)`, `addGrid(grid)`
(returns the undo) and `setBlocker(blockerId, closed)`. When the target is blocked, outside the grid or
unreachable the path ends at the nearest reachable cell centre.
