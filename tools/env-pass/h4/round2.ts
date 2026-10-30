// H4 builder pass: run AFTER build-tile-rows.ts has written src/env/h4.placements.json.
//   npx vite-node tools/env-pass/build-tile-rows.ts <designer h4.placements.json> src/env/h4.placements.json --layout harrowmark
//   DESIGNER=<designer h4.placements.json> npx vite-node tools/env-pass/h4/round2.ts
// 1. Gathers the loose goods of the commons (handcarts, wheelbarrows, hay bales, wood piles, troughs: the designer's `commons-clutter` set)
//    into yard groups of 4 to 6 pieces, so nothing reads as litter (H2 review).
// 2. Closes the garden, allotment and churchyard enclosures: every side that is open up to a gate gets its modules, so no gate stands without
//    a wall or fence on both sides (H2 review fix 4).
// 3. Writes src/env/h4.dressing.json: the middle ground the eye cameras need (groups of bush, bench, planter, cart, crate and tree at 10 to
//    36 m, outside the Bastion trigger box + 4 m and the Anvil sign trigger + 1 m), verge strips and bushes at the house feet. Deterministic;
//    each row is checked against the Harrowmark footprints, anchors, crowd lanes (half width + 0.8), the sheet's corridors (full width),
//    the door spheres and the existing rows.
import { readFileSync, writeFileSync } from 'node:fs';
import { CROWD_LANES, HARROWMARK_LAYOUT as L } from '../../../src/harrowmark/harrowmark.layout';
import { pointInFootprint } from '../../../src/region/geometry';
import type { PlacementRow } from '../../../src/env/PlacementField';

type Row = PlacementRow;
const rows0 = JSON.parse(readFileSync('src/env/h4.placements.json', 'utf8')) as Row[];
const designer = process.env.DESIGNER
  ? (JSON.parse(readFileSync(process.env.DESIGNER, 'utf8')).placements as Array<Row & { set?: string; band?: boolean }>)
  : [];
const setOf = new Map<string, string>(designer.filter((r) => !r.band).map((r) => [`${r.id}|${r.x}|${r.z}`, r.set ?? '']));

let seed = 8741;
const rnd = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const solids = L.structures.filter((s) => s.mode !== 'open');
const anchors = L.anchors;
const segDist = (a: readonly [number, number], b: readonly [number, number], x: number, z: number): number => {
  const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
  const t = l2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2)) : 0;
  return Math.hypot(x - (a[0] + t * dx), z - (a[1] + t * dz));
};
const polyDist = (pts: ReadonlyArray<readonly [number, number]>, loop: boolean, x: number, z: number): number => {
  let best = Infinity;
  const n = loop ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) best = Math.min(best, segDist(pts[i]!, pts[(i + 1) % pts.length]!, x, z));
  return best;
};
const lanes = CROWD_LANES.map((l) => ({ hw: l.halfWidth + 0.8, loop: l.loop, pts: l.points.map((id) => anchors.find((a) => a.id === id)!).map((a) => [a.x, a.z] as const) }));
const onLane = (x: number, z: number): boolean => lanes.some((l) => polyDist(l.pts, l.loop, x, z) < l.hw);
const isGroundCover = (id: string): boolean => /^(grass|flower|fern)/.test(id);
const FENCE = /^(hedge-straight|wattle-fence|picket-fence|stonewall-low|scorched-fence)$/;

// ---- 1. gather the commons' loose goods
const GOODS = /^(handcart-a|wheelbarrow|haybale-a|woodpile-chop|trough-a)$/;
const loose = rows0.filter((r) => GOODS.test(r.id) && setOf.get(`${r.id}|${r.x}|${r.z}`) === 'commons-clutter');
const keep = rows0.filter((r) => !loose.includes(r));
// Corridors (the sheet's player routes, full width) and the frozen trigger areas the dressing keeps out of.
const CORRIDORS: Array<[readonly [number, number], readonly [number, number], number]> = [
  [[8205, 1527], [8205, 1640], 5], // Forge Row to the Anvil door
  [[8098, 1520], [7961, 1545], 4.5], // Forge Row to the Underways door (the D02 ore track)
  [[8222, 1788], [8292, 1788], 3], // Wystan's steps to the edge lane
  [[8349, 2150], [8392, 2150], 3], // the chapel door
  [[8200, 1652], [8200, 1684], 3], // the Anvil's front and back doors
];
const inCorridor = (x: number, z: number): boolean => CORRIDORS.some(([a, b, w]) => segDist(a, b, x, z) < w);
const BASTION = { x0: 8126, x1: 8274, z0: 1676, z1: 1794 }; // trigger box + 4 m
const inBastion = (x: number, z: number): boolean => x > BASTION.x0 && x < BASTION.x1 && z > BASTION.z0 && z < BASTION.z1;
const SPHERES: Array<[number, number, number]> = [[8204, 1645, 8], [8200, 1652, 4], [8200, 1683.5, 4], [7958, 1545, 4]]; // anvil sign r 7 + 1, door triggers r 2 + 2
const inSphere = (x: number, z: number): boolean => SPHERES.some(([cx, cz, r]) => Math.hypot(x - cx, z - cz) < r);

let existing: Row[] = keep.filter((r) => !isGroundCover(r.id));
const out: Row[] = [];
const free = (x: number, z: number, clear: number): boolean =>
  x > 7728 && x < 8436 && z > 1444 && z < 2236 &&
  !solids.some((s) => pointInFootprint(s, x, z, 1.2)) &&
  !anchors.some((a) => Math.hypot(a.x - x, a.z - z) < 2.2) &&
  !onLane(x, z) && !inCorridor(x, z) && !inBastion(x, z) && !inSphere(x, z) &&
  !existing.some((r) => Math.hypot(r.x - x, r.z - z) < clear) &&
  !out.some((r) => Math.hypot(r.x - x, r.z - z) < clear);
const put = (id: string, x: number, z: number, yaw: number, scale: number, clear = 1.6): boolean => {
  if (!free(x, z, clear)) return false;
  out.push({ id, x: +x.toFixed(2), z: +z.toFixed(2), yaw: Math.round(((yaw % 360) + 360) % 360), scale: +scale.toFixed(2) });
  return true;
};

// Groups: every cart or barrow takes the three nearest loose pieces (hay, wood, trough); the rest go into k-means sites of about 5.
const carts = loose.filter((r) => /^(handcart-a|wheelbarrow)$/.test(r.id));
const rest = loose.filter((r) => !carts.includes(r));
const cent: Array<{ x: number; z: number }> = [];
const members: Row[][] = [];
for (const cart of carts) {
  const near = rest.filter((r) => !members.some((m) => m.includes(r))).sort((p, q) => Math.hypot(p.x - cart.x, p.z - cart.z) - Math.hypot(q.x - cart.x, q.z - cart.z)).slice(0, 3);
  members.push([cart, ...near]);
  cent.push({ x: cart.x, z: cart.z });
}
{
  const left = rest.filter((r) => !members.some((m) => m.includes(r)));
  const K = left.length ? Math.max(1, Math.round(left.length / 5)) : 0;
  let c = Array.from({ length: K }, (_, k) => ({ x: left[Math.floor((k * left.length) / K)]!.x, z: left[Math.floor((k * left.length) / K)]!.z }));
  for (let it = 0; it < 12; it++) {
    const sums = c.map(() => ({ x: 0, z: 0, n: 0 }));
    for (const r of left) {
      let bi = 0, bd = Infinity;
      c.forEach((q, i) => { const d = Math.hypot(q.x - r.x, q.z - r.z); if (d < bd) { bd = d; bi = i; } });
      sums[bi]!.x += r.x; sums[bi]!.z += r.z; sums[bi]!.n++;
    }
    c = c.map((q, i) => (sums[i]!.n ? { x: sums[i]!.x / sums[i]!.n, z: sums[i]!.z / sums[i]!.n } : q));
  }
  const ms = c.map(() => [] as Row[]);
  for (const r of left) {
    let bi = 0, bd = Infinity;
    c.forEach((q, i) => { const d = Math.hypot(q.x - r.x, q.z - r.z); if (d < bd) { bd = d; bi = i; } });
    ms[bi]!.push(r);
  }
  c.forEach((q, i) => { if (ms[i]!.length) { cent.push(q); members.push(ms[i]!); } });
}
const gathered: Row[] = [];
const walkable = (x: number, z: number): boolean => free(x, z, 0.9) && !FENCE_NEAR(x, z, 1.4);
function FENCE_NEAR(x: number, z: number, d: number): boolean {
  return keep.some((r) => FENCE.test(r.id) && Math.hypot(r.x - x, r.z - z) < d);
}
cent.forEach((c, i) => {
  const ms = members[i]!;
  if (!ms.length) return;
  // snap the site to the nearest ground that holds a 3 m ring
  let site: { x: number; z: number } | null = null;
  for (let d = 0; d < 40 && !site; d += 1.5) for (let a = 0; a < 360 && !site; a += 30) {
    const x = c.x + Math.cos((a * Math.PI) / 180) * d, z = c.z + Math.sin((a * Math.PI) / 180) * d;
    if (walkable(x, z) && walkable(x + 2.4, z) && walkable(x - 2.4, z) && walkable(x, z + 2.4) && walkable(x, z - 2.4)) site = { x, z };
  }
  if (!site) return;
  // the cart first (it is the centre), then the rest on a ring 1.8..3.2 m out
  ms.sort((a, b) => Number(/cart|wheelbarrow/.test(b.id)) - Number(/cart|wheelbarrow/.test(a.id)));
  ms.forEach((r, k) => {
    const a = (k / ms.length) * Math.PI * 2 + rnd() * 0.6;
    const d = k === 0 ? 0 : 1.8 + rnd() * 1.4;
    const x = site!.x + Math.cos(a) * d, z = site!.z + Math.sin(a) * d;
    if (walkable(x, z)) {
      gathered.push({ ...r, x: +x.toFixed(2), z: +z.toFixed(2), yaw: Math.round(rnd() * 360) });
      out.push(gathered[gathered.length - 1]!);
    }
  });
});
console.log(`goods: ${loose.length} loose rows -> ${gathered.length} in ${members.length} groups`);
// the gathered rows are part of the core file; they are kept out of `out` below and merged into the core rows.
// Review round 2 (h4-shot-review.md): rows removed or swapped in the sheet's core.
//  (6) the grey posts the drone review saw east of the house rows are the game's own blacksmith-tile chimneys (they stayed when the five
//      smelter-chimney rows behind the north row were dropped in a test), so the forge stacks stay as the sheet has them;
//  (3) m07anvil eye (8207, 1530): ashen grass and the ashen elm within 6 m clip the frame corners, and the ashen bush at 12 m reads as a coal lump;
//  (4) r03anvil eye: a low dark stump at 16 m reads as debris.
const core: Row[] = [...keep, ...gathered]
  .filter((r) => !(/-ashen$/.test(r.id) && Math.hypot(r.x - 8207, r.z - 1530) < 6))
  .filter((r) => !(r.id === 'stump-a' && Math.hypot(r.x - 8156.73, r.z - 1601.82) < 0.5))
  .map((r) => (r.id === 'bush-round-a-ashen' && Math.hypot(r.x - 8213.38, r.z - 1540.62) < 0.5 ? { ...r, id: 'bush-round-a' } : r));
out.length = 0;
existing = core.filter((r) => !isGroundCover(r.id));

// ---- 2. close the enclosures
// Modules of one id join into one enclosure when 11 m or closer: a gate gap of up to 10 m between module centres does not split it.
const JOIN = 11;
{
  const fm = core.filter((r) => FENCE.test(r.id) && r.id !== 'scorched-fence');
  const par = fm.map((_, i) => i);
  const find = (i: number): number => { while (par[i] !== i) { par[i] = par[par[i]!]!; i = par[i]!; } return i; };
  for (let i = 0; i < fm.length; i++) for (let j = i + 1; j < fm.length; j++) {
    if (fm[i]!.id === fm[j]!.id && Math.hypot(fm[i]!.x - fm[j]!.x, fm[i]!.z - fm[j]!.z) <= JOIN) par[find(i)] = find(j);
  }
  const clusters = new Map<number, Row[]>();
  fm.forEach((r, i) => { const k = find(i); (clusters.get(k) ?? clusters.set(k, []).get(k)!).push(r); });
  let closed = 0, encl = 0;
  for (const c of clusters.values()) {
    if (c.length < 14) continue;
    const x0 = Math.min(...c.map((r) => r.x)), x1 = Math.max(...c.map((r) => r.x)), z0 = Math.min(...c.map((r) => r.z)), z1 = Math.max(...c.map((r) => r.z));
    if (x1 - x0 < 20 || x1 - x0 > 150 || z1 - z0 < 20 || z1 - z0 > 150) continue;
    encl++;
    const id = c[0]!.id;
    const sides = [
      { a: [x0, z0], b: [x1, z0], yaw: 0 }, { a: [x1, z0], b: [x1, z1], yaw: 90 },
      { a: [x0, z1], b: [x1, z1], yaw: 0 }, { a: [x0, z0], b: [x0, z1], yaw: 90 },
    ] as const;
    const missing = sides.map((sd) => {
      const len = Math.hypot(sd.b[0] - sd.a[0], sd.b[1] - sd.a[1]);
      const n = Math.max(1, Math.round(len / 3.37));
      const pts = Array.from({ length: n + 1 }, (_, k) => [sd.a[0] + ((sd.b[0] - sd.a[0]) * k) / n, sd.a[1] + ((sd.b[1] - sd.a[1]) * k) / n] as const);
      return pts.filter((p) => !c.some((r) => Math.hypot(r.x - p[0], r.z - p[1]) < 2.1));
    });
    // the gate side is the one with the most missing modules; its gap is refilled from both ends up to a 3.6 m opening at the middle
    const gate = missing.reduce((bi, m, i) => (m.length > missing[bi]!.length ? i : bi), 0);
    missing.forEach((m, si) => {
      if (si === gate) return;
      for (const p of m) if (put(id, p[0], p[1], sides[si]!.yaw, 1, 1.0)) closed++;
    });
    {
      const sd = sides[gate]!;
      const horiz = sd.a[1] === sd.b[1];
      const along = c.filter((r) => Math.abs(horiz ? r.z - sd.a[1] : r.x - sd.a[0]) < 1.5).map((r) => (horiz ? r.x : r.z)).sort((p, q) => p - q);
      const edge = horiz ? [sd.a[0], sd.b[0]] : [sd.a[1], sd.b[1]];
      const co = [Math.min(...edge), ...along, Math.max(...edge)];
      let g0 = co[0]!, g1 = co[1]!;
      for (let k = 0; k + 1 < co.length; k++) if (co[k + 1]! - co[k]! > g1 - g0) { g0 = co[k]!; g1 = co[k + 1]!; }
      const cg = (g0 + g1) / 2, half = (g1 - g0) / 2;
      for (let off = 3.5; off < half - 1.6; off += 3.37) for (const sg of [-1, 1]) {
        const [px, pz] = horiz ? [cg + sg * off, sd.a[1]] : [sd.a[0], cg + sg * off];
        if (put(id, px, pz, sd.yaw, 1, 1.0)) closed++;
      }
    }
  }
  console.log(`enclosures ${encl}, closing modules ${closed}`);
}

// ---- 3. middle-ground groups
type Item = [string, number, number, number]; // id, dx, dz, scale
const GROUPS: Record<string, Item[]> = {
  garden: [['bush-round-a', 0, 0, 1.4], ['bush-flowering-a', 1.9, 0.6, 1.2], ['bench', -0.6, 2.4, 1], ['planter-box-a', 2.6, -1.6, 1], ['fern-a', -1.8, -0.8, 1.2], ['flower-patch-yellow', 0.8, -2.2, 1.1]],
  bushes: [['bush-round-b', 0, 0, 1.5], ['bush-flowering-b', 2, 0.8, 1.2], ['bush-round-a', -1.6, 1.8, 1.3], ['fern-a', 1.2, -1.8, 1.2], ['fern-a', -2.0, -0.6, 1.1]],
  cart: [['cart-goods-a', 0, 0, 1], ['barrel', 2.4, 0.4, 1], ['crate_A_small', 2.0, -1.6, 1], ['sack', -2.1, 1.4, 1], ['bucket_water', 0.4, 2.4, 1], ['crates-stacked-a', -2.6, -1.2, 1]],
  hand: [['handcart-a', 0, 0, 1], ['crate_A_small', 2.2, 0.6, 1], ['barrel', -2.2, 0.8, 1], ['sack', 1.0, -2.2, 1], ['woodpile-chop', -1.2, -2.4, 1]],
  smith: [['coal-heap-a', 0, 0, 1], ['iron-stock-a', 3.0, 0.6, 1], ['barrel', -2.4, 1.0, 1], ['crate_long_A', 1.2, -2.4, 1], ['bucket_water', -1.0, -2.0, 1]],
  tree: [['oak-b', 0, 0, 0.7], ['bush-round-a', 2.8, 1.8, 1.4], ['bush-flowering-a', -2.6, 2.0, 1.2], ['fern-a', 1.0, -2.8, 1.2]],
  fruit: [['fruit-tree-a', 0, 0, 1.1], ['bush-round-b', 2.6, 1.6, 1.4], ['bench', -2.4, 1.6, 1], ['fern-a', 1.4, -2.4, 1.2]],
  fruitb: [['fruit-tree-b', 0, 0, 1.1], ['bush-flowering-a', -2.4, 1.8, 1.3], ['bush-round-a', 2.6, 0.8, 1.3], ['flower-patch-red', 0.2, -2.2, 1.1]],
  birch: [['birch-a', 0, 0, 0.9], ['bush-round-b', 2.4, 1.4, 1.3], ['fern-a', -1.8, 1.6, 1.2], ['elm-or-ash-a', 6, -2.4, 0.8]],
  // the old smelter yard is the greyest ground in the city: ashen birches and bushes there
  'birch-ash': [['birch-a-ashen', 0, 0, 0.9], ['bush-round-a-ashen', 2.4, 1.4, 1.3], ['fern-a-ashen', -1.8, 1.6, 1.2], ['stump-a', 5, -2.4, 1]],
  forgeset: [['forge-hearth-a', 0, 0, 1], ['anvil-a', 2.6, 0.8, 1], ['trough-a', -2.8, 0.6, 1], ['coal-heap-a', 0.4, -3.2, 1], ['iron-stock-a', 3.4, -2.6, 1], ['barrel', -2.2, -2.4, 1]],
  rack: [['weaponrack', 0, 0, 1], ['target', 3.2, 0.4, 1], ['target', 5.6, 0.6, 1], ['flag_red', -2.2, 1.2, 1], ['bush-round-a', -1.4, -2.4, 1.4], ['barrel', 2.2, -2.2, 1]],
  yew: [['bush-round-a', 0, 0, 2.2], ['bench', 2.8, 0, 1], ['bush-round-a', -2.8, 0.6, 1.9], ['planter-box-a', 0.6, 2.4, 1], ['fern-a', -1.4, -2.2, 1.1]],
  waste: [['ore-pile', 0, 0, 1], ['barrel', 2.6, 0.6, 1], ['pallet', -2.2, 1.2, 1], ['rubble_half', 1.0, -2.8, 1], ['charred-stump', -3, -1.4, 1]],
};
/** Places a group at (cx, cz) when its centre and at least half of its items fit. Returns the number of rows placed. */
function group(kind: string, cx: number, cz: number, rot: number): number {
  const items = GROUPS[kind]!;
  if (!free(cx, cz, 2.2)) return 0;
  const c = Math.cos(rot), s = Math.sin(rot);
  const keepLen = out.length;
  let n = 0;
  for (const [id, dx, dz, sc] of items) {
    if (put(id, cx + dx * c - dz * s, cz + dx * s + dz * c, id === 'bench' || id === 'planter-box-a' ? (rot * 180) / Math.PI + 90 : rnd() * 360, sc * (0.92 + rnd() * 0.16), 0.9)) n++;
  }
  if (n < Math.ceil(items.length / 2)) { out.length = keepLen; return 0; }
  return n;
}
/** Groups of the given kinds in the view cone of an eye: forward distance d0..d1, lateral up to `lat` x forward, `n` groups. */
function cone(name: string, cam: readonly [number, number], look: readonly [number, number], d0: number, d1: number, lat: number, kinds: string[], n: number): void {
  const fx = look[0] - cam[0], fz = look[1] - cam[1], fl = Math.hypot(fx, fz);
  const ux = fx / fl, uz = fz / fl, nx = -uz, nz = ux;
  let placed = 0;
  for (let t = 0; t < 6000 && placed < n; t++) {
    const d = d0 + rnd() * (d1 - d0), sd = (rnd() * 2 - 1) * lat * d;
    if (group(kinds[placed % kinds.length]!, cam[0] + ux * d + nx * sd, cam[1] + uz * d + nz * sd, rnd() * Math.PI * 2) > 0) placed++;
  }
  console.log(`cone ${name}: ${placed}/${n} groups`);
}
/** Groups placed at fixed spots (the designer's yards: x, z, kind). */
function spots(name: string, list: ReadonlyArray<readonly [string, number, number]>): void {
  let ok = 0;
  for (const [kind, x, z] of list) if (group(kind, x, z, rnd() * Math.PI * 2) > 0) ok++;
  console.log(`spots ${name}: ${ok}/${list.length}`);
}

// Eye cameras (tools/env-pass/cameras.json). Every cone starts at 10 m and stays inside 36 m, outside the trigger boxes (the free() test).
cone('tile', [8288, 1519], [8140, 1521], 9, 38, 0.85, ['cart', 'garden', 'smith', 'bushes', 'hand', 'fruit', 'garden', 'smith'], 16);
cone('m07anvil', [8207, 1530], [8202, 1660], 9, 38, 0.85, ['garden', 'smith', 'bushes', 'cart', 'fruitb', 'garden', 'hand', 'bushes'], 14);
cone('r03anvil', [8158, 1618], [8202, 1650], 9, 38, 0.9, ['cart', 'garden', 'bushes', 'hand', 'fruit', 'garden', 'smith'], 14);
cone('m09clerk', [8240, 1634], [8189, 1649], 9, 38, 0.9, ['garden', 'cart', 'bushes', 'fruitb', 'hand', 'garden'], 12);
cone('d02underways', [8094, 1522], [7955, 1546], 9, 40, 0.85, ['waste', 'smith', 'waste', 'birch-ash', 'waste', 'birch-ash', 'waste'], 16);
cone('m08bastion', [8292, 1780], [8200, 1800], 9, 38, 0.95, ['garden', 'yew', 'bushes', 'tree', 'garden', 'fruit', 'cart'], 14);
cone('smoke', [8200, 1694], [8200, 1812], 12, 44, 1.2, ['bushes', 'tree', 'garden', 'fruit', 'yew', 'bushes'], 14);
cone('r04chapel', [8424, 2151], [8345, 2154], 9, 38, 0.9, ['yew', 'bushes', 'tree', 'garden', 'fruitb', 'yew', 'birch'], 14);
cone('westward', [8128, 1900], [7960, 1940], 9, 40, 0.85, ['tree', 'fruit', 'bushes', 'birch', 'garden', 'cart', 'tree', 'hand'], 16);

// ---- 4. house feet: fern and flower verge strips 1.8 m off the houses, the tavern and the chapel (the door anchors stay clear), a bush at
// each corner. The Forge Row houses' lane faces: the blacksmith tiles' door side is unknown (builder-notes risk 2), so the strip runs the
// whole face and a barrel or crate pair stands at each house's lane-side corner instead of at a guessed door.
for (const st of L.structures.filter((s) => /^(house|tavern|chapel)$/.test(s.kind) && s.x > 7728 && s.x < 8436 && s.z > 1444 && s.z < 2236)) {
  const hw = st.footprint[0] / 2 + 1.8, hd = st.footprint[1] / 2 + 1.8;
  const per: Array<[number, number]> = [];
  for (let t = -hw; t <= hw; t += 3.2) per.push([st.x + t, st.z - hd], [st.x + t, st.z + hd]);
  for (let t = -hd; t <= hd; t += 3.2) per.push([st.x - hw, st.z + t], [st.x + hw, st.z + t]);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) put('bush-round-a', st.x + sx * (hw + 0.5), st.z + sz * (hd + 0.5), rnd() * 360, 1.3, 1.5);
  for (const [x, z] of per) put(rnd() < 0.55 ? 'fern-a' : ['flower-patch-yellow', 'flower-patch-red', 'flower-patch-white'][Math.floor(rnd() * 3)]!, x, z, rnd() * 360, 1.1, 1.0);
  if (st.id.startsWith('forge.')) {
    const lane = st.z < 1520 ? 1 : -1;
    for (const sx of [-1, 1]) {
      put('barrel', st.x + sx * (hw - 1.2), st.z + lane * (hd - 0.2), rnd() * 360, 1, 0.9);
      put('crate_A_small', st.x + sx * (hw - 2.6), st.z + lane * (hd - 0.1), rnd() * 360, 1, 0.9);
    }
  }
}

// ---- 5. review round 2 additions (appended last: the rows above keep their random stream)
// (2) tile eye (8288, 1519 looking west): a smithy set on each lane edge at 12 to 25 m, outside the lane half width + 0.8 (free() checks it).
for (const [z0, z1] of [[1504, 1511], [1529, 1536]] as const) {
  let ok = false;
  for (let t = 0; t < 600 && !ok; t++) ok = group('forgeset', 8262 + rnd() * 12, z0 + rnd() * (z1 - z0), 0) > 0;
}
// (4) r03 eye (8158, 1618 looking ENE): a bush or tree group and a bench on the left (north) half at 12 to 25 m, off the door corridor.
{
  const ux = 0.81, uz = 0.59, nx = -uz, nz = ux;
  let placed = 0;
  const kinds = ['garden', 'fruit', 'bushes', 'tree'];
  for (let t = 0; t < 3000 && placed < 5; t++) {
    const d = 12 + rnd() * 13, sd = -(0.25 + rnd() * 0.65) * d; // the render's screen-left is the -n side
    if (group(kinds[placed % kinds.length]!, 8158 + ux * d + nx * sd, 1618 + uz * d + nz * sd, rnd() * Math.PI * 2) > 0) placed++;
  }
  console.log(`r03 screen-left flank: ${placed} groups`);
}
// (5) Bastion rim, outside the fence on the east side (x 8278..8284, the edge lane's clear strip starts at 8286) and north of the yard
// either side of the hall: racks, archery butts, a pennant and a bush every 25 to 35 m.
for (const z of [1696, 1726, 1756, 1778]) for (let t = 0; t < 40; t++) if (group('rack', 8279 + rnd() * 3, z + (rnd() - 0.5) * 6, Math.PI / 2) > 0) break;
for (const x of [8136, 8146, 8250, 8262]) for (let t = 0; t < 40; t++) if (group('rack', x + (rnd() - 0.5) * 6, 1799 + rnd() * 3, 0) > 0) break;
// dark flat goods at the r03 eye (coal heaps and iron racks at 13 to 30 m) read as debris there: the smithy sets stay at Forge Row.
for (let i = out.length - 1; i >= 0; i--) {
  const r = out[i]!;
  if (/^(coal-heap-a|iron-stock-a)$/.test(r.id) && Math.hypot(r.x - 8158, r.z - 1618) < 32 && r.z > 1600) out.splice(i, 1);
}

writeFileSync('src/env/h4.placements.json', JSON.stringify(core));
writeFileSync('src/env/h4.dressing.json', JSON.stringify(out));
const by: Record<string, number> = {};
for (const r of out) by[r.id] = (by[r.id] ?? 0) + 1;
console.log(`core ${core.length} rows, dressing ${out.length} rows`, by);
