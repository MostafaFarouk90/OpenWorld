// H1 builder dressing, round 2 (shot review 2026-10-25): the rims, the drill yard, the paddock and the camps, placed where the eye cameras
// look (10 to 40 m), not scattered over the whole yard. Hand-placed clusters from a seeded RNG; every row passes the same keep-outs the tests
// check (footprints, anchors 1 m, strays 2.5 m, trigger spheres, crowd lanes, patrol routes 1.8 m, the M06 box plus the gate passage, the
// corridors, the Dead Road) and a spacing rule against every designer row. Run after build-tile-rows:
//   npx vite-node tools/env-pass/h1/gen-dressing.ts src/env/h1.placements.json src/env/h1.dressing.json
import { readFileSync, writeFileSync } from 'node:fs';
import { CROWD_LANES, HARROWMARK_LAYOUT } from '../../../src/harrowmark/harrowmark.layout';
import { DEADROAD_LAYOUT } from '../../../src/region/deadroad.layout';
import { pointInFootprint } from '../../../src/region/geometry';
import { DEAD_ROAD } from '../../../src/terrain/shape/deadRoad';

const [inPath, outPath] = process.argv.slice(2);
if (!inPath || !outPath) throw new Error('usage: gen-dressing.ts <h1.placements.json> <out.json>');
type Row = { id: string; x: number; z: number; yaw: number; scale: number };
const existing = JSON.parse(readFileSync(inPath, 'utf8')) as Array<{ id: string; x: number; z: number }>;
const isGround = (id: string): boolean => /^(grass|flower)/.test(id);
const solids = [...HARROWMARK_LAYOUT.structures, ...DEADROAD_LAYOUT.structures].filter((s) => s.mode !== 'open');
const anchors = [...HARROWMARK_LAYOUT.anchors, ...DEADROAD_LAYOUT.anchors];
const at = (id: string): readonly [number, number] => {
  const a = anchors.find((q) => q.id === id)!;
  return [a.x, a.z];
};
const lanes = CROWD_LANES.map((l) => ({ hw: l.halfWidth, loop: l.loop, pts: l.points.map(at) }));
const patrols = HARROWMARK_LAYOUT.patrols.map((p) => ({ loop: p.loop, pts: p.points.map(at) }));
const road = DEAD_ROAD.points.map((p) => [p.x, p.z] as const);
const corridors: Array<[readonly [number, number], readonly [number, number], number]> = [[[8545, 1365], [8752, 1505], 7], [[8640, 1311], [8552, 1300], 4]];
const strays = [[8345, 1390], [8352, 1394]];

function segDist(px: number, pz: number, a: readonly [number, number], b: readonly [number, number]): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const t = dx || dz ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / (dx * dx + dz * dz))) : 0;
  return Math.hypot(px - (a[0] + t * dx), pz - (a[1] + t * dz));
}
function polyDist(px: number, pz: number, pts: ReadonlyArray<readonly [number, number]>, loop = false): number {
  let d = Infinity;
  const n = loop ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) d = Math.min(d, segDist(px, pz, pts[i]!, pts[(i + 1) % pts.length]!));
  return d;
}

let seed = 9021;
const rnd = (): number => {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const between = (a: number, b: number): number => a + rnd() * (b - a);
const r2 = (v: number): number => Math.round(v * 100) / 100;

const placed: Row[] = [];
const near = (list: ReadonlyArray<{ id: string; x: number; z: number }>, x: number, z: number, d: number, fence: boolean): boolean =>
  list.some((p) => !isGround(p.id) && Math.hypot(p.x - x, p.z - z) < (fence && /fence/.test(p.id) ? 2.6 : /fence/.test(p.id) || fence ? 0.5 : d));
const rejected: Record<string, number> = {};
function ok(id: string, x: number, z: number, gap: number): boolean {
  const why = (w: string): false => ((rejected[w] = (rejected[w] ?? 0) + 1), false);
  if (x < 7760 || x > 9240 || z < 1120 || z > 1440) return why('core');
  if (solids.some((s) => pointInFootprint(s, x, z, 0.6))) return why('footprint');
  if (isGround(id)) return true;
  const fence = /^(picket|wattle|hedge)/.test(id);
  if (solids.some((s) => pointInFootprint(s, x, z, 0.6))) return why('footprint');
  if (anchors.some((a) => Math.hypot(x - a.x, z - a.z) < 1.2)) return why('anchor');
  if (strays.some(([sx, sz]) => Math.hypot(x - sx!, z - sz!) < 2.6)) return why('stray');
  for (const t of HARROWMARK_LAYOUT.triggers) if (t.shape === 'sphere' && Math.hypot(x - t.x, z - t.z) <= t.radius + 0.3) return why('trigger');
  if (lanes.some((l) => polyDist(x, z, l.pts, l.loop) < l.hw + 0.3)) return why('lane');
  if (patrols.some((p) => polyDist(x, z, p.pts, p.loop) < 2.1)) return why('patrol');
  if (x >= 8462 && x <= 8538 && z >= 1262 && z <= 1328) return why('M06 box');
  if (x >= 8494 && x <= 8506 && z >= 1180 && z <= 1262) return why('gate passage');
  if (polyDist(x, z, road) < DEAD_ROAD.halfWidth + 0.8) return why('road');
  for (const [a, b, w] of corridors) if (segDist(x, z, a, b) < w) return why('corridor');
  if (near(existing, x, z, gap, fence) || near(placed, x, z, gap, fence)) return why('spacing');
  return true;
}
function add(id: string, x: number, z: number, yaw = between(0, 360), scale = 1, gap = 1.3): boolean {
  if (!ok(id, x, z, gap)) return false;
  placed.push({ id, x: r2(x), z: r2(z), yaw: r2(yaw), scale: r2(scale) });
  return true;
}
/** `n` tries to put one of `ids` within radius `r` of (cx, cz). */
function cluster(ids: readonly string[], cx: number, cz: number, r: number, n: number, scale: [number, number] = [1, 1], gap = 1.3): void {
  for (let i = 0, k = 0; i < n * 6 && k < n; i++) {
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd()) * r;
    if (add(ids[Math.floor(rnd() * ids.length)]!, cx + Math.cos(a) * d, cz + Math.sin(a) * d, between(0, 360), between(scale[0], scale[1]), gap)) k++;
  }
}
/** A fence line from (x0, z0) to (x1, z1) in modules of 3.4 m, skipping `gaps` (centres, m) and anything that fails a keep-out. */
function fenceLine(id: string, x0: number, z0: number, x1: number, z1: number, gaps: ReadonlyArray<readonly [number, number]> = []): void {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(1, Math.round(len / 3.4));
  const yaw = Math.abs(x1 - x0) >= Math.abs(z1 - z0) ? 0 : 270;
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    const z = z0 + ((z1 - z0) * i) / n;
    if (gaps.some(([gx, gz]) => Math.hypot(gx - x, gz - z) < 2.4)) continue;
    add(id, x, z, yaw, 1, 2.9);
  }
}
const SUPPLY = ['crate_A_big', 'crate_A_small', 'barrel', 'sack', 'sack', 'crate_long_A'] as const;
const TUFTS = ['grass-clump-a', 'grass-clump-b', 'grass-clump-c', 'fern-a', 'flower-patch-white', 'flower-patch-yellow'] as const;
const tuft = (cx: number, cz: number, r: number, n: number): void => cluster(TUFTS, cx, cz, r, n, [0.9, 1.4], 0.5);

// ---- 1. M06 gate square rim (west strip x 8420..8453, east strip x 8548..8580, north corners), seen from the new eye at (8468, 1300).
cluster(SUPPLY, 8444, 1292, 3.2, 9); // supply pile by the gate wall shadow
cluster(SUPPLY, 8440, 1318, 3.2, 9);
cluster(SUPPLY, 8433, 1342, 3.0, 8);
add('cart-goods-a', 8436, 1308, 85, 1, 2);
add('trough-a', 8450, 1308, 90, 1, 1.5);
add('trough-a', 8449, 1333, 90, 1, 1.5);
add('elm-or-ash-a', 8437, 1355, 20, 0.78, 3);
add('elm-or-ash-a', 8431, 1281, 140, 0.7, 3);
add('bench', 8450, 1322, 90, 1, 1.5);
add('bench', 8450, 1342, 90, 1, 1.5);
add('bench', 8450, 1296, 90, 1, 1.5);
add('handcart-a', 8447, 1352, 10, 1, 2);
add('handcart-a', 8446, 1315, 100, 1, 2);
cluster(['sack', 'sack', 'basket-goods-a', 'bucket_empty'], 8445, 1354, 2.4, 6);
cluster(['sack', 'basket-goods-a', 'bucket_empty'], 8446, 1328, 2.4, 6);
cluster(['sack', 'bucket_empty'], 8447, 1303, 2.2, 4);
for (const z of [1286, 1312, 1336, 1352]) add('post_lantern', 8452, z, 90, 1, 2);
tuft(8440, 1300, 9, 22);
tuft(8440, 1332, 9, 22);
tuft(8440, 1262, 12, 22); // the wall foot
// east rim
cluster(SUPPLY, 8560, 1300, 3.2, 8);
cluster(SUPPLY, 8556, 1338, 3.0, 7);
add('elm-or-ash-a', 8559, 1352, 200, 0.75, 3);
add('bench', 8551, 1318, 270, 1, 1.5);
add('bench', 8553, 1346, 270, 1, 1.5);
add('handcart-a', 8556, 1322, 80, 1, 2);
tuft(8556, 1310, 9, 18);

// ---- 2. D02 barracks: the drill yard's props pulled into the camera's 15 to 35 m, a half-fenced stray pen, the hall verge.
for (const x of [8366, 8374, 8382]) for (const z of [1384, 1392, 1400]) if (rnd() < 0.85) add('target', x + between(-1, 1), z + between(-1, 1), 270, 1.6, 2.2);
cluster(['weaponrack'], 8372, 1394, 7, 6, [1, 1], 2.5);
cluster(['barrel', 'crate_A_big', 'crate_A_small', 'bucket_water', 'sack'], 8388, 1385, 4, 9);
cluster(['barrel', 'crate_A_big', 'bucket_water', 'haybale-a'], 8368, 1376, 3.5, 7);
add('woodpile-chop', 8376, 1409, 0, 1, 2);
add('trough-a', 8388, 1404, 0, 1, 1.5);
add('haystack-round', 8350, 1410, 0, 0.9, 3);
fenceLine('wattle-fence', 8338, 1385, 8338, 1407); // the stray pen: west and south sides only (half fenced)
fenceLine('wattle-fence', 8338, 1385, 8358, 1385);
cluster(['haybale-a'], 8344, 1403, 3, 5, [1, 1], 1.4);
// verge strip round the hall (1.5 to 3.5 m off the walls)
for (const [x0, z0, x1, z1] of [[8335, 1348, 8385, 1348], [8335, 1312, 8335, 1348], [8385, 1312, 8385, 1348]] as const) {
  const n = Math.round(Math.hypot(x1 - x0, z1 - z0) / 2.6);
  for (let i = 0; i <= n; i++) tuft(x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * i) / n, 1.6, 2);
}

// ---- 3. M10 stables: horses, hay, troughs and the cart 8 to 25 m from the new eye at (8620, 1378); the paddock fence closed.
for (const [x, z, yaw] of [[8631, 1390, 40], [8642, 1388, 300], [8649, 1397, 110], [8637, 1402, 200], [8624, 1399, 70]] as const) add('horse-standing', x, z, yaw, 1, 2.6);
add('haystack-round', 8657, 1394, 0, 1, 3);
add('haystack-round', 8618, 1412, 0, 0.95, 3);
cluster(['haybale-a'], 8643, 1409, 3, 6, [1, 1], 1.3);
add('trough-a', 8632, 1382, 0, 1, 1.5);
add('trough-a', 8648, 1384, 90, 1, 1.5);
add('haycart-a', 8627, 1411, 20, 1, 3);
cluster(['sack', 'bucket_water', 'barrel'], 8655, 1405, 2.5, 5);
// close the picket fence: all four sides, one gate (3.4 m) on the west side and one on the south
fenceLine('picket-fence', 8606, 1360, 8690, 1360, [[8630, 1360]]);
fenceLine('picket-fence', 8606, 1424, 8690, 1424, [[8632, 1424]]);
fenceLine('picket-fence', 8606, 1360, 8606, 1424, [[8606, 1404]]);
fenceLine('picket-fence', 8690, 1360, 8690, 1424);
tuft(8616, 1396, 8, 14);
tuft(8680, 1380, 8, 14);

// ---- 4. Camps. Camp-out (tile eye from the lane's east end at (8484, 1216)): fires, washing, bundles and tufts between the two rows.
add('washing-line', 8417, 1214, 0, 1, 2.5);
add('washing-line', 8458, 1216, 90, 1, 2.5);
add('washing-line', 8392, 1218, 0, 1, 2.5);
cluster(['sack', 'bucket_empty', 'basket-goods-a', 'crate_A_small', 'barrel'], 8440, 1214, 8, 14, [1, 1], 1.4);
cluster(['sack', 'bucket_empty'], 8470, 1214, 5, 8, [1, 1], 1.4);
tuft(8440, 1214, 12, 26);
tuft(8468, 1214, 8, 14);
// Camp-in (outer-west eye at (8322, 1440)): between the two tent rows, round the well and the fires.
add('washing-line', 8245, 1397, 0, 1, 2.5);
add('washing-line', 8268, 1397, 0, 1, 2.5);
cluster(['sack', 'bucket_empty', 'basket-goods-a', 'crate_A_small', 'barrel'], 8246, 1392, 9, 16, [1, 1], 1.4);
cluster(['sack', 'bucket_empty', 'barrel'], 8274, 1392, 6, 8, [1, 1], 1.4);
tuft(8250, 1392, 14, 28);
tuft(8280, 1394, 8, 14);

// ---- 5. Review 2: the camps' fires and the tent lanes at the camera's 10 to 25 m. Camp-out (tile eye at (8384, 1216) looking east): two fire
// rings with log seats and a handcart on the lane. Camp-in (outer-west eye at (8300, 1395) looking west): a washing line and a fire ring
// between the two tent rows.
add('campfire-ring', 8402, 1207, 0, 2.2, 2.5);
add('campfire-ring', 8412, 1227, 0, 2.2, 2.5);
for (const [x, z] of [[8399, 1205], [8405, 1209], [8409, 1225], [8415, 1229]] as const) add('log-fallen-a', x, z, between(0, 360), 0.7, 1.2);
add('handcart-a', 8395, 1226, 95, 1, 2);
add('washing-line', 8287, 1401, 0, 1, 2.5);
add('washing-line', 8281, 1388, 0, 1, 2.5);
add('campfire-ring', 8291, 1396, 0, 1.7, 2.5);
add('campfire-ring', 8284, 1388, 0, 1.5, 2.5);
for (const [x, z] of [[8289, 1399], [8293, 1392], [8286, 1385]] as const) add('log-fallen-a', x, z, between(0, 360), 0.7, 1.2);
cluster(['sack', 'bucket_empty', 'basket-goods-a', 'barrel'], 8292, 1392, 3, 8, [1, 1], 1.2);
tuft(8290, 1395, 6, 14);

writeFileSync(outPath, JSON.stringify(placed));
const by: Record<string, number> = {};
for (const r of placed) by[r.id] = (by[r.id] ?? 0) + 1;
console.log(placed.length, 'dressing rows', by, 'rejected', rejected);
