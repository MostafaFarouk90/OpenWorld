// Turns a designer's placement file into the runtime rows of a tile: `npx vite-node tools/env-pass/build-tile-rows.ts <in.json> <out.json>`.
// Keeps id, x, z, yaw, scale, and drops rows that sit inside a built structure's footprint (with a margin) or on top of an
// anchor, using the real layout geometry; ground cover (grass, flowers) may sit under anchors. Prints what it dropped.
import { readFileSync, writeFileSync } from 'node:fs';
import { BRIGHTWATER_LAYOUT as L } from '../../src/region/brightwater.layout';
import { pointInFootprint } from '../../src/region/geometry';

const [inPath, outPath] = process.argv.slice(2);
if (!inPath || !outPath) throw new Error('usage: build-tile-rows.ts <in.json> <out.json>');
const MARGIN = 0.4;
const ANCHOR_CLEAR = 1.0;
const placements: Array<{ id: string; x: number; z: number; yaw?: number; scale?: number }> = JSON.parse(readFileSync(inPath, 'utf8')).placements;
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
console.log(`${rows.length} of ${placements.length} rows kept`, dropped);
