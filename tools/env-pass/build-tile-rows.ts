// Turns a designer's placement file into the runtime rows of a tile: `npx vite-node tools/env-pass/build-tile-rows.ts <in.json> <out.json>`.
// Only rows inside the file's own `core` ([x0, x1] by [z0, z1]) are kept: band rows are for the blend preview and belong to the neighbour tile.
// Keeps id, x, z, yaw, scale, and drops rows that sit inside a built structure's footprint (with a margin) or on top of an
// anchor, using the real layout geometry; ground cover (grass, flowers) may sit under anchors. Prints what it dropped.
import { readFileSync, writeFileSync } from 'node:fs';
import { BRIGHTWATER_LAYOUT as L } from '../../src/region/brightwater.layout';
import { pointInFootprint } from '../../src/region/geometry';

// Optional extra rectangles the tile owns outside its core (a seam ruled to this tile): `--also x0,x1,z0,z1` (repeatable).
const args = process.argv.slice(2);
const also: Array<[number, number, number, number]> = [];
for (let i = args.length - 1; i >= 0; i--) {
  if (args[i] === '--also') {
    also.push(args[i + 1]!.split(',').map(Number) as [number, number, number, number]);
    args.splice(i, 2);
  }
}
const [inPath, outPath] = args;
if (!inPath || !outPath) throw new Error('usage: build-tile-rows.ts <in.json> <out.json> [--also x0,x1,z0,z1]');
const MARGIN = 0.4;
const ANCHOR_CLEAR = 1.0;
const file = JSON.parse(readFileSync(inPath, 'utf8')) as { core: { x: [number, number]; z: [number, number] }; placements: Array<{ id: string; x: number; z: number; yaw?: number; scale?: number }> };
const { core } = file;
const owns = (r: { x: number; z: number }): boolean =>
  (r.x >= core.x[0] && r.x <= core.x[1] && r.z >= core.z[0] && r.z <= core.z[1]) || also.some(([x0, x1, z0, z1]) => r.x >= x0 && r.x < x1 && r.z > z0 && r.z <= z1);
const placements = file.placements.filter(owns);
const ground = (id: string): boolean => /^(grass|flower)/.test(id);
const solids = L.structures.filter((s) => s.mode !== 'open');
const dropped: Record<string, number> = {};
const rows = placements
  .filter((r) => {
    const s = solids.find((st) => pointInFootprint(st, r.x, r.z, MARGIN));
    if (s) return void (dropped[`in ${s.id}`] = (dropped[`in ${s.id}`] ?? 0) + 1);
    const a = ground(r.id) ? undefined : L.anchors.find((an) => Math.hypot(r.x - an.x, r.z - an.z) < ANCHOR_CLEAR);
    if (a) return void (dropped[`near ${a.id}`] = (dropped[`near ${a.id}`] ?? 0) + 1);
    return true;
  })
  .map(({ id, x, z, yaw, scale }) => ({ id, x, z, yaw, scale }));
writeFileSync(outPath, JSON.stringify(rows));
console.log(`${rows.length} of ${file.placements.length} rows kept (${placements.length} in the core)`, dropped);
