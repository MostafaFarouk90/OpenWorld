// H1 builder dressing (not in the designer's sheet): sparse weeds and dry tufts on the packed-earth yards, where the meadow blades are
// off, so a yard reads as worn ground with life in it at eye height instead of a flat tan floor. Deterministic; run with
//   npx vite-node tools/env-pass/h1/gen-yard-litter.ts src/env/h1.placements.json src/env/h1.litter.json
// Rows are ground cover (clumps, flower patches). They keep off structures, the gate passage, the trodden streets
// and the Dead Road, and stand 0.9 m or more from every designer prop. Ground cover may lie in the M06 patrol box (it is not an obstacle).
import { readFileSync, writeFileSync } from 'node:fs';
import { HARROWMARK_LAYOUT } from '../../../src/harrowmark/harrowmark.layout';
import { DEADROAD_LAYOUT } from '../../../src/region/deadroad.layout';
import { pointInFootprint } from '../../../src/region/geometry';
import { SPLAT_ZONES, streetAmount, yardAmount } from '../../../src/terrain/shape/groundSplat';

const [inPath, outPath] = process.argv.slice(2);
if (!inPath || !outPath) throw new Error('usage: gen-yard-litter.ts <h1.placements.json> <out.json>');
const existing = JSON.parse(readFileSync(inPath, 'utf8')) as Array<{ id: string; x: number; z: number }>;
const props = existing.filter((r) => !/^(grass|flower)/.test(r.id));
const solids = [...HARROWMARK_LAYOUT.structures, ...DEADROAD_LAYOUT.structures].filter((s) => s.mode !== 'open');

let seed = 8518;
const rnd = (): number => {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const CELL = 3.6;
const rows: Array<{ id: string; x: number; z: number; yaw: number; scale: number }> = [];
const keepClear = (x: number, z: number): boolean =>
  !solids.some((s) => pointInFootprint(s, x, z, 0.6)) &&
  !(x >= 8494 && x <= 8506 && z >= 1180 && z <= 1262) &&
  !props.some((p) => Math.hypot(p.x - x, p.z - z) < 0.9);

// Only the yards that keep their blades off (the camps keep growing blades and need no litter).
for (const zone of SPLAT_ZONES) {
  if (zone.kind !== 'yard' || zone.keepBlades) continue;
  for (let x = zone.x0; x < zone.x1; x += CELL) {
    for (let z = zone.z0; z < zone.z1; z += CELL) {
      const px = x + rnd() * CELL;
      const pz = z + rnd() * CELL;
      if (pz > 1439.5) continue; // the tile core ends at z 1440 (H2 owns the rest)
      const r = rnd();
      // About one cell in three has something; patches of tufts cluster by a slow drift so the yard has bare floor and weedy corners.
      const drift = 0.5 + 0.5 * Math.sin(px * 0.09 + Math.sin(pz * 0.07) * 2) * Math.cos(pz * 0.11);
      if (r > 0.2 + 0.45 * drift) continue;
      if (yardAmount(px, pz) < 0.75 || streetAmount(px, pz) > 0.1 || !keepClear(px, pz)) continue;
      const k = rnd();
      const yaw = Math.round(rnd() * 3600) / 10;
      // Ground cover only: it may lie on anchors and in the M06 patrol box without being an obstacle (pebbles would be props and need every keep-out).
      if (k < 0.6) rows.push({ id: 'grass-clump-straw', x: round(px), z: round(pz), yaw, scale: round(0.55 + rnd() * 0.5) });
      else if (k < 0.88) rows.push({ id: 'grass-clump-c', x: round(px), z: round(pz), yaw, scale: round(0.5 + rnd() * 0.4) });
      else rows.push({ id: 'flower-patch-white', x: round(px), z: round(pz), yaw, scale: round(0.5 + rnd() * 0.3) });
    }
  }
}
function round(v: number): number {
  return Math.round(v * 100) / 100;
}
writeFileSync(outPath, JSON.stringify(rows));
const by: Record<string, number> = {};
for (const r of rows) by[r.id] = (by[r.id] ?? 0) + 1;
console.log(rows.length, 'litter rows', by);
