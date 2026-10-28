// H2 builder pass: run AFTER build-tile-rows.ts has written src/env/h2.placements.json.
//   npx vite-node tools/env-pass/h2/round2.ts
// 1. Removes the grass and fern rows standing on the fountain's stone apron (flower rows stay: the flower ring is planting beds set in the paving).
// 2. Writes src/env/h2.dressing.json: the middle ground the eye cameras need (10 to 40 m), deterministic, each row checked against the
//    Harrowmark footprints, anchors, crowd lanes, the M10 chase line, the market centre and coin trail, the alley patrol and the existing rows.
import { readFileSync, writeFileSync } from 'node:fs';
import { CHASE_M10, CROWD_LANES, HARROWMARK_LAYOUT as L } from '../../../src/harrowmark/harrowmark.layout';
import { pointInFootprint } from '../../../src/region/geometry';
import { H2_SPLAT_ZONES } from '../../../src/terrain/shape/splatZones.h2';
import type { PlacementRow } from '../../../src/env/PlacementField';

const rows = JSON.parse(readFileSync('src/env/h2.placements.json', 'utf8')) as PlacementRow[];
const courts = H2_SPLAT_ZONES.filter((z) => z.kind === 'court');
const onCourt = (x: number, z: number): boolean => courts.some((c) => c.kind === 'court' && x >= c.x0 - 1 && x <= c.x1 + 1 && z >= c.z0 - 1 && z <= c.z1 + 1);
const kept = rows.filter((r) => !(/^(grass|fern)/.test(r.id) && onCourt(r.x, r.z)));
console.log(`removed ${rows.length - kept.length} ground rows from the apron`);
writeFileSync('src/env/h2.placements.json', JSON.stringify(kept));

// ---- dressing
let seed = 8702;
const rnd = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const solids = L.structures.filter((s) => s.mode !== 'open');
const anchors = L.anchors;
const segDist = (a: readonly [number, number], b: readonly [number, number], x: number, z: number): number => {
  const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
  const t = l2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2)) : 0;
  return Math.hypot(x - (a[0] + t * dx), z - (a[1] + t * dz));
};
const chasePts = CHASE_M10.filter((n) => !n.roof).map((n) => [n.x, n.z] as const);
const polyDist = (pts: ReadonlyArray<readonly [number, number]>, loop: boolean, x: number, z: number): number => {
  let best = Infinity;
  const n = loop ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) best = Math.min(best, segDist(pts[i]!, pts[(i + 1) % pts.length]!, x, z));
  return best;
};
const lanes = CROWD_LANES.map((l) => ({ hw: l.halfWidth + 0.8, loop: l.loop, pts: l.points.map((id) => anchors.find((a) => a.id === id)!).map((a) => [a.x, a.z] as const) }));
const onLane = (x: number, z: number): boolean => lanes.some((l) => polyDist(l.pts, l.loop, x, z) < l.hw);
const isGroundCover = (id: string): boolean => /^(grass|flower|fern)/.test(id);
const existing = kept.filter((r) => !isGroundCover(r.id));
const out: PlacementRow[] = [];
// The sheet's corridors (gen_h.py CORRIDORS): player routes kept free of everything the dressing adds (full half width).
const CORRIDORS: Array<[readonly [number, number], readonly [number, number], number]> = [
  [[8498, 1520], [8750, 1520], 9],
  [[8858, 1626], [8498, 1640], 8],
  [[8545, 1365], [8752, 1505], 7],
];
const inCorridor = (x: number, z: number): boolean => CORRIDORS.some(([a, b, w]) => segDist(a, b, x, z) < w);
const free = (x: number, z: number, clear: number): boolean =>
  x > 8444 && x < 9236 && z > 1444 && z < 1956 &&
  !solids.some((s) => pointInFootprint(s, x, z, 1.2)) &&
  !anchors.some((a) => Math.hypot(a.x - x, a.z - z) < 2.2) &&
  !(x > 8748 && x < 8816 && z > 1486 && z < 1554) && // market centre + 4
  !(x > 8806 && x < 8940 && z > 1510 && z < 1536) && // coin trail
  !(x > 8930 && x < 9050 && Math.abs(z - 1523.5) < 3) && // alley patrol
  !onLane(x, z) &&
  !(x > 8480 && x < 8500 && z > 1722 && z < 1780) && // the connector from the fountain circuit to the keep road (a street zone, no lane)
  !(Math.abs(x - 8500) < 7 && z > 1664 && z < 1714) && // the fountain's view cone from the south
  !inCorridor(x, z) &&
  polyDist(chasePts, false, x, z) > 3.8 &&
  !existing.some((r) => Math.hypot(r.x - x, r.z - z) < clear) &&
  !out.some((r) => Math.hypot(r.x - x, r.z - z) < clear);
const put = (id: string, x: number, z: number, yaw: number, scale: number, clear = 1.6): boolean => {
  if (!free(x, z, clear)) {
    if (process.env.DBG2) console.log('reject', id, x.toFixed(1), z.toFixed(1), 'solid', solids.find((s) => pointInFootprint(s, x, z, 1.2))?.id, 'anchor', anchors.find((a) => Math.hypot(a.x - x, a.z - z) < 2.2)?.id, 'lane', onLane(x, z), 'corr', inCorridor(x, z), 'near', [...existing, ...out].find((r) => Math.hypot(r.x - x, r.z - z) < clear)?.id);
    return false;
  }
  out.push({ id, x: +x.toFixed(2), z: +z.toFixed(2), yaw: Math.round(yaw), scale: +scale.toFixed(2) });
  return true;
};
/** `n` rows of `ids` in the view cone of an eye camera: forward distance d0..d1, lateral up to `lat` x forward. */
function cone(cam: readonly [number, number], look: readonly [number, number], d0: number, d1: number, lat: number, ids: Array<[string, number]>, n: number, clear = 1.8): void {
  const fx = look[0] - cam[0], fz = look[1] - cam[1], fl = Math.hypot(fx, fz);
  const ux = fx / fl, uz = fz / fl, nx = -uz, nz = ux;
  let placed = 0;
  for (let t = 0; t < 4000 && placed < n; t++) {
    const d = d0 + rnd() * (d1 - d0), s = (rnd() * 2 - 1) * lat * d;
    const [id, sc] = ids[Math.floor(rnd() * ids.length)]!;
    if (put(id, cam[0] + ux * d + nx * s, cam[1] + uz * d + nz * s, rnd() * 360, sc * (0.9 + rnd() * 0.2), clear)) placed++;
  }
  console.log(`cone ${cam}: ${placed}/${n}`);
}

// Middle ground at 8 to 40 m of each designer eye (the sheet's rule on the market centre, coin trail, alley patrol, corridors and chase line
// holds). Mix: bushes, ferns, benches, planters, beds, kegs and sacks, small fruit trees; flower and grass patches under them.
const lawn: Array<[string, number]> = [['bush-round-a', 1.1], ['bush-flowering-a', 1.1], ['bush-round-b', 1.1], ['bush-flowering-b', 1.1], ['fern-a', 1.2], ['garden-bed-a', 1], ['planter-box-a', 1], ['bench', 1]];
const yardy: Array<[string, number]> = [['barrel', 1], ['crate_A_small', 1], ['sack', 1], ['bucket_water', 1], ['bush-round-a', 1.1], ['bush-round-b', 1.1], ['bench', 1], ['planter-box-a', 1], ['planter-box-a', 1], ['bush-flowering-a', 1.1], ['bush-flowering-b', 1.1], ['garden-bed-a', 1], ['fern-a', 1.2]];
const trees: Array<[string, number]> = [['fruit-tree-a', 1], ['fruit-tree-b', 1], ['birch-a', 0.85], ['elm-or-ash-a', 0.8], ['oak-b', 0.7]];
const patches: Array<[string, number]> = [['flower-patch-white', 1], ['flower-patch-yellow', 1], ['flower-patch-purple', 1], ['flower-patch-red', 1], ['grass-clump-a', 1.1], ['grass-clump-b', 1.1], ['fern-a', 1.2]];
const EYES = {
  tile: { cam: [8485, 1452], look: [8494, 1600], lat: 0.75, n: 38, trees: 7, d: [8, 42] },
  market: { cam: [8741, 1533], look: [8790, 1516], lat: 0.55, n: 5, trees: 5, d: [9, 14] },
  alley: { cam: [8905, 1523.5], look: [8962, 1524], lat: 1.1, n: 26, trees: 3, d: [3, 30] },
  guildhall: { cam: [8862, 1553], look: [8872, 1590], lat: 0.8, n: 30, trees: 5, d: [6, 34] },
  chase: { cam: [8898, 1610], look: [8902, 1760], lat: 0.6, n: 34, trees: 4, d: [6, 46] },
  smoke: { cam: [8486, 1745], look: [8500, 1960], lat: 0.7, n: 32, trees: 6, d: [8, 44] },
  fountain: { cam: [8499, 1634], look: [8500, 1740], lat: 0.8, n: 26, trees: 5, d: [6, 40] },
} as const;
for (const [name, e] of Object.entries(EYES)) {
  const cam = e.cam as unknown as [number, number];
  const look = e.look as unknown as [number, number];
  console.log(name);
  cone(cam, look, e.d[0], e.d[1], e.lat, name === 'alley' || name === 'guildhall' ? yardy : lawn, e.n, 2.2);
  cone(cam, look, e.d[0] + 4, e.d[1] + 25, e.lat * 1.1, trees, e.trees, 6);
  cone(cam, look, e.d[0], e.d[1], e.lat, patches, Math.round(e.n * 1.4), 1.2);
}
/** `n` rows of `ids` at random inside a rectangle (the lawn flanking the alley mouth, which a cone from the eye mostly misses). */
function rect(x0: number, x1: number, z0: number, z1: number, ids: Array<[string, number]>, n: number, clear = 2): void {
  let placed = 0;
  for (let t = 0; t < 4000 && placed < n; t++) {
    const [id, sc] = ids[Math.floor(rnd() * ids.length)]!;
    if (put(id, x0 + rnd() * (x1 - x0), z0 + rnd() * (z1 - z0), rnd() * 360, sc * (0.9 + rnd() * 0.2), clear)) placed++;
  }
  console.log(`rect ${x0},${z0}: ${placed}/${n}`);
}
// Alley mouth (x 8906..8934, z 1490..1558; the coin trail z 1514..1532 and the patrol stay clear): kegs, benches, beds and bushes at the house feet.
for (const [z0, z1] of [[1490, 1512], [1535, 1558]] as const) {
  rect(8910, 8932, z0, z1, [['fruit-tree-a', 1.1], ['fruit-tree-b', 1.1], ['birch-a', 0.9], ['elm-or-ash-a', 0.8]], 4, 5);
  rect(8908, 8934, z0, z1, yardy, 16, 2);
  rect(8908, 8934, z0, z1, patches, 22, 1.2);
}
// The chase lane's mouth: the garden walls of the sheet start at z 1634; two more runs at the sheet's own spacing and offsets bring the lane
// up to the Guildhall's back wall so the eye at z 1610 looks into a lane, not out over a lawn (the walls keep 7 m off the 3.5 m chase line).
for (let z = 1618; z < 1634; z += 3.43) {
  put('stonewall-low', 8892.62, z, 270, 1, 1.2);
  put('stonewall-low', 8906.6, z + 1.5, 270, 1, 1.2);
}
// The fountain's rim (the sheet has benches r 10.5 and lanterns r 12.5): planters between the benches and lanterns at 16 to 17 m.
for (let k = 0; k < 8; k++) {
  const a = (k + 0.5) * (Math.PI / 4);
  put('planter-box-a', 8500 + Math.sin(a) * 15.5, 1700 + Math.cos(a) * 15.5, (a * 180) / Math.PI + 90, 1, 1.5);
}


// ---- review round 2 (appended after the original stream so the earlier dressing rows are unchanged) ----
// (4) Close the enclosures: the sheet leaves each garden or allotment with a 7 m gate gap and broken corners. Cluster the fence/hedge/wall
// modules of one id into rectangles and fill every side up to a 3.4 m gate opening on the side with the biggest gap, so no gate stands
// without a wall or fence on either side of it.
{
  const FENCE = /^(hedge-straight|wattle-fence|picket-fence|stonewall-low)$/;
  const fm = kept.filter((r) => FENCE.test(r.id));
  const par = fm.map((_, i) => i);
  const find = (i: number): number => { while (par[i] !== i) { par[i] = par[par[i]!]!; i = par[i]!; } return i; };
  for (let i = 0; i < fm.length; i++) for (let j = i + 1; j < fm.length; j++) {
    if (fm[i]!.id === fm[j]!.id && Math.hypot(fm[i]!.x - fm[j]!.x, fm[i]!.z - fm[j]!.z) <= 6.2) par[find(i)] = find(j);
  }
  const clusters = new Map<number, PlacementRow[]>();
  fm.forEach((r, i) => { const k = find(i); (clusters.get(k) ?? clusters.set(k, []).get(k)!).push(r); });
  let closed = 0, encl = 0;
  for (const c of clusters.values()) {
    if (c.length < 14) continue;
    const x0 = Math.min(...c.map((r) => r.x)), x1 = Math.max(...c.map((r) => r.x)), z0 = Math.min(...c.map((r) => r.z)), z1 = Math.max(...c.map((r) => r.z));
    if (x1 - x0 < 20 || x1 - x0 > 60 || z1 - z0 < 20 || z1 - z0 > 60) continue;
    encl++;
    const id = c[0]!.id;
    const sides = [
      { a: [x0, z0], b: [x1, z0], yaw: 180 }, { a: [x1, z0], b: [x1, z1], yaw: 270 },
      { a: [x0, z1], b: [x1, z1], yaw: 180 }, { a: [x0, z0], b: [x0, z1], yaw: 270 },
    ] as const;
    const missing = sides.map((sd) => {
      const len = Math.hypot(sd.b[0] - sd.a[0], sd.b[1] - sd.a[1]);
      const n = Math.max(1, Math.round(len / 3.4));
      const pts = Array.from({ length: n + 1 }, (_, k) => [sd.a[0] + ((sd.b[0] - sd.a[0]) * k) / n, sd.a[1] + ((sd.b[1] - sd.a[1]) * k) / n] as const);
      return pts.filter((p) => !c.some((r) => Math.hypot(r.x - p[0], r.z - p[1]) < 2.1));
    });
    // the gate side is the one with the most missing modules; its gap is refilled from both ends up to a 3.6 m opening at the middle
    const gate = missing.reduce((bi, m, i) => (m.length > missing[bi]!.length ? i : bi), 0);
    const gm = missing[gate]!;
    missing.forEach((m, si) => {
      if (si === gate) return;
      for (const p of m) if (put(id, p[0], p[1], sides[si]!.yaw, 1, 1.0)) closed++;
    });
    {
      const sd = sides[gate]!;
      const horiz = sd.a[1] === sd.b[1];
      const along = c.filter((r) => Math.abs((horiz ? r.z - sd.a[1] : r.x - sd.a[0])) < 1.5).map((r) => (horiz ? r.x : r.z)).sort((p, q) => p - q);
      const edge = horiz ? [sd.a[0], sd.b[0]] : [sd.a[1], sd.b[1]];
      const co = [Math.min(...edge), ...along, Math.max(...edge)];
      let g0 = co[0]!, g1 = co[1]!;
      for (let k = 0; k + 1 < co.length; k++) if (co[k + 1]! - co[k]! > g1 - g0) { g0 = co[k]!; g1 = co[k + 1]!; }
      const cg = (g0 + g1) / 2, half = (g1 - g0) / 2;
      for (let off = 3.5; off < half - 1.6; off += 3.4) for (const sg of [-1, 1]) {
        const [px, pz] = horiz ? [cg + sg * off, sd.a[1]] : [sd.a[0], cg + sg * off];
        if (put(id, px, pz, sd.yaw, 1, 1.0)) closed++;
      }
    }
  }
  console.log(`enclosures ${encl}, closing modules ${closed}`);
}

// (1) Alley: groups (bush, keg, crate, small tree) at 8 to 20 m from the eye on both sides, outside the patrol box plus 4 m (box z 1514..1532 -> z < 1510 and > 1536).
function group(cx: number, cz: number, items: Array<[string, number, number, number]>): void {
  for (const [id, dx, dz, sc] of items) put(id, cx + dx, cz + dz, rnd() * 360, sc, 0.9);
}
for (const [cx, cz] of [[8909, 1507], [8915, 1504], [8921, 1508], [8909, 1540], [8915, 1543], [8921, 1539]] as const) {
  group(cx, cz, [['bush-round-a', 0, 0, 1.4], ['barrel', 1.8, 0.6, 1], ['crate_A_small', 1.5, -1.4, 1], ['bush-flowering-a', -1.7, 1.0, 1.2], ['sack', 0.6, 2.0, 1]]);
}
rect(8910, 8928, 1496, 1509, [['fruit-tree-a', 1.1], ['fruit-tree-b', 1.1]], 1, 4);
rect(8910, 8928, 1537, 1550, [['fruit-tree-a', 1.1], ['fruit-tree-b', 1.1]], 1, 4);

// (2) Market: carts, crate stacks and trees just outside the stall ring (the centre box + 4 m is x 8748..8816, z 1486..1554) in the far arc of the
// m07 eye (east and north-east), and the loose goods gathered into yard groups beside every goods cart.
for (const [id, x, z, yaw, sc] of [['cart-goods-a', 8838, 1478, 20, 1], ['cart-goods-a', 8826, 1560, 340, 1], ['crates-stacked-a', 8846, 1481, 0, 1], ['crates-stacked-a', 8830, 1563, 0, 1], ['haycart-a', 8842, 1549, 90, 1]] as const) put(id, x, z, yaw, sc, 1.5);
for (const [id, x, z, sc] of [['fruit-tree-a', 8840, 1490, 1.1], ['oak-b', 8846, 1470, 0.8], ['fruit-tree-b', 8838, 1566, 1.1], ['birch-a', 8852, 1558, 0.9], ['bush-round-a', 8827, 1494, 1.3], ['bush-flowering-a', 8826, 1556, 1.2]] as const) put(id, x, z, rnd() * 360, sc, 2.5);
const goodsIds: Array<[string, number]> = [['barrel', 1], ['sack', 1], ['crate_A_small', 1], ['crate_long_A', 1], ['bucket_water', 1]];
for (const cart of [...rows, ...out].filter((r) => /^(cart-goods-a|haycart-a)$/.test(r.id) && r.x > 8700 && r.x < 8860 && r.z > 1440 && r.z < 1600)) {
  let k = 0;
  for (let t = 0; t < 80 && k < 4; t++) {
    const a = rnd() * Math.PI * 2, d = 2.4 + rnd() * 1.4;
    const [gid, sc] = goodsIds[Math.floor(rnd() * goodsIds.length)]!;
    if (put(gid, cart.x + Math.cos(a) * d, cart.z + Math.sin(a) * d, rnd() * 360, sc, 0.9)) k++;
  }
}

// (3) Fountain eye (8499, 1672): bench and planter pairs and a bush group at 6 to 12 m either side, outside the fountain circuit.
for (const sd of [-1, 1]) {
  const [xa, xb] = sd < 0 ? [8486, 8492.5] : [8507.5, 8514];
  rect(xa - 3, xb + 3, 1677, 1686, [['bench', 1.1]], 1, 2);
  rect(xa, xb, 1677, 1686, [['planter-box-a', 1]], 2, 2);
  rect(xa - 3, xb + 3, 1677, 1686, [['bush-round-a', 1.3], ['bush-flowering-b', 1.2]], 2, 2);
}

// (5) Main street tile eye (8485, 1452): a bush and tree group on the left (east) flank at 10 to 25 m.
for (const [id, x, z, sc] of [['fruit-tree-a', 8509, 1471, 1.1], ['oak-b', 8512, 1482, 0.75], ['bush-round-a', 8504, 1466, 1.3], ['bush-flowering-a', 8505, 1476, 1.2], ['bush-round-b', 8503, 1486, 1.2], ['bench', 8503.5, 1472, 1], ['fruit-tree-b', 8508, 1496, 1.1], ['bush-flowering-b', 8504, 1493, 1.2], ['planter-box-a', 8503, 1481, 1]] as const) {
  put(id, x, z, id === 'bench' || id === 'planter-box-a' ? 90 : rnd() * 360, sc, 1.8);
}

// (6) House feet: fern and flower verge strips 1.8 m off the guild and keep-road houses (the doors' anchors stay clear) and a bush at each corner.
for (const st of L.structures.filter((s) => s.kind === 'house' && s.x > 8440 && s.x < 9240 && s.z > 1440 && s.z < 1960)) {
  const hw = st.footprint[0] / 2 + 1.8, hd = st.footprint[1] / 2 + 1.8;
  const per: Array<[number, number]> = [];
  for (let t = -hw; t <= hw; t += 3.2) { per.push([st.x + t, st.z - hd], [st.x + t, st.z + hd]); }
  for (let t = -hd; t <= hd; t += 3.2) { per.push([st.x - hw, st.z + t], [st.x + hw, st.z + t]); }
  for (const [x, z] of per) put(rnd() < 0.55 ? 'fern-a' : ['flower-patch-yellow', 'flower-patch-red', 'flower-patch-white'][Math.floor(rnd() * 3)]!, x, z, rnd() * 360, 1.1, 1.0);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) put('bush-round-a', st.x + sx * (hw + 0.5), st.z + sz * (hd + 0.5), rnd() * 360, 1.3, 1.5);
}

writeFileSync('src/env/h2.dressing.json', JSON.stringify(out));
const by: Record<string, number> = {};
for (const r of out) by[r.id] = (by[r.id] ?? 0) + 1;
console.log(`dressing ${out.length} rows`, by);
