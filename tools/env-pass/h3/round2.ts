// H3 round 2 (coordinator shot review): run AFTER build-tile-rows.ts has written src/env/h3.placements.json.
//   npx vite-node tools/env-pass/h3/round2.ts
// 1. Removes the ground-cover rows (grass, flowers, ferns) standing on the stone courts: the sheet keeps the courts bare.
// 2. Writes src/env/h3.dressing.json: the rim dressing the trimmed courts need (the counting yard's yews, bench, monument, lanterns; the
//    ward market's stalls and goods round the stair foot; middle-ground groups at the R04 and tile eyes), deterministic, each row checked
//    against the Harrowmark footprints, anchors, patrol boxes, the three M10 ground lines and the existing rows.
import { readFileSync, writeFileSync } from 'node:fs';
import { CHASE_M10, CROWD_LANES, HARROWMARK_LAYOUT as L } from '../../../src/harrowmark/harrowmark.layout';
import { pointInFootprint } from '../../../src/region/geometry';
import { H3_SPLAT_ZONES } from '../../../src/terrain/shape/splatZones.h3';
import type { PlacementRow } from '../../../src/env/PlacementField';

const rows = JSON.parse(readFileSync('src/env/h3.placements.json', 'utf8')) as PlacementRow[];
const courts = H3_SPLAT_ZONES.filter((z) => z.kind === 'court');
const onCourt = (x: number, z: number): boolean => courts.some((c) => c.kind === 'court' && x >= c.x0 - 1 && x <= c.x1 + 1 && z >= c.z0 - 1 && z <= c.z1 + 1);
const isGroundCover = (id: string): boolean => /^(grass|flower|fern)/.test(id);
const kept = rows.filter((r) => r.dy !== undefined || !(isGroundCover(r.id) && onCourt(r.x, r.z)));
console.log(`removed ${rows.length - kept.length} ground rows from the courts`);
writeFileSync('src/env/h3.placements.json', JSON.stringify(kept));

// ---- dressing
let seed = 8631;
const rnd = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const solids = L.structures.filter((s) => s.mode !== 'open');
const anchors = L.anchors;
const BOXES = [
  [8466 - 4, 8534 + 4, 2541 - 4, 2594 + 4], // keep court + 4
  [8722 - 3, 8763 + 3, 1972 - 3, 2023 + 3], // counting yard + 3
  [8794 - 1, 8810 + 1, 2066 - 1, 2094 + 1], // archive steps
] as const;
const chasePts = CHASE_M10.filter((n) => !n.roof).map((n) => [n.x, n.z] as const);
const lines: Array<ReadonlyArray<readonly [number, number]>> = [chasePts, [[8900, 2100], [9010, 2200], [9010, 2400], [9000, 2540], [8850, 2548], [8690, 2540]], [[8850, 2262], [8850, 2232]]];
const segDist = (a: readonly [number, number], b: readonly [number, number], x: number, z: number): number => {
  const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
  const t = l2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2)) : 0;
  return Math.hypot(x - (a[0] + t * dx), z - (a[1] + t * dz));
};
const lineDist = (x: number, z: number): number => Math.min(...lines.map((l) => Math.min(...l.slice(0, -1).map((p, i) => segDist(p, l[i + 1]!, x, z)))));
const laneSegs = CROWD_LANES.flatMap((l) => {
  const pts = l.points.map((id) => anchors.find((a) => a.id === id)!).map((a) => [a.x, a.z] as const);
  return pts.slice(0, l.loop ? undefined : -1).map((p, i) => ({ a: p, b: pts[(i + 1) % pts.length]!, hw: l.halfWidth + 0.8 }));
});
const onLane = (x: number, z: number): boolean => laneSegs.some((l) => segDist(l.a, l.b, x, z) < l.hw);
const existing = kept.filter((r) => !isGroundCover(r.id) && r.dy === undefined);
const out: PlacementRow[] = [];
const free = (x: number, z: number, clear: number, line = 3.8): boolean =>
  !solids.some((s) => pointInFootprint(s, x, z, 1.2)) &&
  !anchors.some((a) => Math.hypot(a.x - x, a.z - z) < 2.2) &&
  !BOXES.some((b) => x > b[0] && x < b[1] && z > b[2] && z < b[3]) &&
  !onLane(x, z) &&
  lineDist(x, z) > line &&
  !existing.some((r) => Math.hypot(r.x - x, r.z - z) < clear) &&
  !out.some((r) => Math.hypot(r.x - x, r.z - z) < clear);
const put = (id: string, x: number, z: number, yaw: number, scale: number, clear = 1.6, line = 3.8): boolean => {
  if (!free(x, z, clear, line)) return false;
  out.push({ id, x: +x.toFixed(2), z: +z.toFixed(2), yaw: Math.round(yaw), scale: +scale.toFixed(2) });
  return true;
};
/** Tries `n` rows of `ids` in the view cone of an eye camera: forward distance d0..d1 along the look, lateral up to `lat` x forward. */
function cone(cam: readonly [number, number], look: readonly [number, number], d0: number, d1: number, lat: number, ids: Array<[string, number]>, n: number, clear = 1.8, line = 3.8): void {
  const fx = look[0] - cam[0], fz = look[1] - cam[1], fl = Math.hypot(fx, fz);
  const ux = fx / fl, uz = fz / fl, nx = -uz, nz = ux;
  let placed = 0;
  for (let t = 0; t < 4000 && placed < n; t++) {
    const d = d0 + rnd() * (d1 - d0), s = (rnd() * 2 - 1) * lat * d;
    const [id, sc] = ids[Math.floor(rnd() * ids.length)]!;
    if (put(id, cam[0] + ux * d + nx * s, cam[1] + uz * d + nz * s, rnd() * 360, sc * (0.9 + rnd() * 0.2), clear, line)) placed++;
  }
  console.log(`cone ${cam}: ${placed}/${n}`);
}

// Counting yard floor: patch rows (grass, ferns, flowers) over the open box; the yard is trodden lawn, not paving (splatZones.h3.ts).
for (let x = 8718; x < 8764; x += 4.6) {
  for (let z = 1968; z < 2028; z += 4.6) {
    const px = x + (rnd() - 0.5) * 3.4, pz = z + (rnd() - 0.5) * 3.4;
    if (solids.some((st) => pointInFootprint(st, px, pz, 0.4)) || anchors.some((a) => Math.hypot(a.x - px, a.z - pz) < 0.8)) continue;
    out.push({ id: 'grass-patch-meadow', x: +px.toFixed(2), z: +pz.toFixed(2), yaw: 0, scale: +(0.55 + rnd() * 0.3).toFixed(2) });
  }
}
// Counting yard (M09 eye 8724,1988 looking +x): the yard box stays open, so the rim north (z < 1969) and south (z > 2026) is dressed
// as an Oswin court: clipped yews, a bench, the founder's monument (a shrine), lanterns, planters.
// Readable at the eye (15 to 40 m, just outside the patrol box + 3 m on the south rim z < 1969): a bench, a planter and the founder's monument.
put('bench', 8752, 1967.5, 0, 1.1, 1.2, 0);
put('planter-box-a', 8758, 1967.5, 0, 1.2, 1.2, 0);
put('shrine', 8764, 1967, 0, 1.3, 1.2, 0);
put('post_lantern', 8746, 1967.5, 0, 1, 1.2, 0);
for (const side of [-1, 1]) {
  const z0 = side < 0 ? 1963 : 2030;
  for (let x = 8732; x < 8768; x += 7 + rnd() * 3) {
    put('bush-round-a', x, z0 + side * rnd() * 3, rnd() * 360, 1.9 + rnd() * 0.5, 2.5);
    if (rnd() < 0.5) put('post_lantern', x + 3.5, z0 + side * (1 + rnd()), 0, 1, 2.5);
  }
  put('bench', 8745 + rnd() * 6, z0 - side * 0.5 + side * 1, side < 0 ? 0 : 180, 1, 2);
  put('planter-box-a', 8752 + rnd() * 6, z0 + side * 2, 0, 1, 2);
}
put('shrine', 8772, 1998, 270, 1.3, 3);
put('post_lantern', 8770, 1978, 0, 1, 2.5);
put('post_lantern', 8770, 2017, 0, 1, 2.5);

// Ward market (M10 ward eye 8876,2192 looking (8846,2256)): stalls and goods round the stair foot, off the chase lines and anchors.
const stalls: Array<[string, number]> = [['market-stall-a', 1], ['market-stall-b', 1]];
const goods: Array<[string, number]> = [['barrel', 1], ['crates-stacked-a', 1], ['sack', 1], ['crate_A_big', 1], ['basket-goods-a', 1], ['bucket_empty', 1]];
cone([8876, 2192], [8846, 2256], 9, 30, 0.85, stalls, 6, 5.5, 4.5);
// Goods in groups beside each stall (review 2): two or three pieces within 2.2 to 3.2 m of every stall, not scattered over the square.
for (const st of out.filter((r) => r.id.startsWith('market-stall'))) {
  let k = 0;
  for (let t = 0; t < 60 && k < 3; t++) {
    const a = rnd() * Math.PI * 2, d = 2.2 + rnd() * 1.0;
    const [id] = goods[Math.floor(rnd() * goods.length)]!;
    if (put(id, st.x + Math.cos(a) * d, st.z + Math.sin(a) * d, rnd() * 360, 0.95 + rnd() * 0.1, 0.9, 4)) k++;
  }
}
cone([8876, 2192], [8846, 2256], 9, 32, 0.85, [['post_lantern', 1]], 3, 5, 4);

// Middle ground at 15 to 35 m: R04 (8770,2072 looking 8812,2084) and the tile eye (8485,2028 looking 8497,2200): bush and bench groups.
cone([8770, 2072], [8812, 2084], 14, 36, 0.7, [['bush-round-a', 1.2], ['bush-flowering-a', 1.1], ['bush-round-b', 1.2], ['fern-a', 1], ['bench', 1]], 12, 3);
cone([8485, 2028], [8497, 2200], 14, 36, 0.55, [['bush-round-a', 1.2], ['bush-flowering-b', 1.1], ['bush-round-b', 1.1], ['fern-a', 1], ['bench', 1]], 12, 3, 9);
// Tile eye, left flank (the camera looks north, so screen left is +x: lane edge x 8499): a tree and bush group at 15 to 35 m ahead of the camera.
for (const [id, x, z, sc] of [['oak-b', 8514, 2048, 0.7], ['birch-a', 8510, 2062, 0.85], ['elm-or-ash-a', 8516, 2074, 0.8], ['bush-round-a', 8506, 2054, 1.2], ['bush-flowering-a', 8511, 2056, 1.2], ['bush-round-b', 8506, 2068, 1.2], ['bush-flowering-b', 8512, 2066, 1.1]] as const) put(id, x, z, rnd() * 360, sc, 1.8, 3);
// River gate eye (inside 9205,2163 looking out): lantern posts and bushes either side of the throat, clear of the extra-open gate throat.
cone([9205, 2163], [9240, 2168], 8, 28, 0.6, [['bush-round-a', 1.1], ['post_lantern', 1], ['fern-a', 1], ['bench', 1]], 8, 3, 6);

writeFileSync('src/env/h3.dressing.json', JSON.stringify(out));
const by: Record<string, number> = {};
for (const r of out) by[r.id] = (by[r.id] ?? 0) + 1;
console.log(`dressing ${out.length} rows`, by);
