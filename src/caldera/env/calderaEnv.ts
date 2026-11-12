// Act 5 N1 PR 2 (the Caldera's environment pass): the dressing rows of tile `c1`, generated deterministically from N1's master
// positions (calderaSites.ts) and the shaped ground. One eager tile (src/env/tiles.ts), so walls, boulders, tents, the gong frame
// and the skull get colliders through the env pass's keep-walkable rule like every other tile.
//
// The rulings it keeps: dressing at eye level along the ways the player walks (the rim stairs, the camp, the Lava Stair, the
// Inner Gate's head, the terraces' shelves), never in a trigger, on an anchor, on a structure or in the siege court (the M52
// court x 10970..11030, z 6470..6640 stays empty), never in the lava or within 7 m of it, never on the island (N6's arena);
// the Rim Gate and the Inner Gate get walls on both sides; every lit piece is a brazier or a lantern, so the 3/2/0 light pool
// (src/env/glow.ts POOL_SIZE) picks the nearest. Ids and sizes are calderaEnvIds.ts's (and targets.json's for the reused ids).
//
// A row is refused rather than moved, except the hand-placed ones (walls, portals, the gong, the camp and the warhost camp),
// which calderaEnv.test.ts pins against the same rules.
import type { PlacementRow } from '../../env/PlacementField';
import type { LayoutData } from '../../region/layoutTypes';
import { ACT4_WORLD_LAYOUT } from '../../region/act4/act4World.layout';
import { heightAt } from '../../terrain/heightfield';
import { CALDERA_ROADS, LAVA_STAIR_POINTS, RIM_STAIRS_POINTS, TERRACES_ROAD } from '../../terrain/shape/caldera';
import { WASTE_LAYOUT } from '../../waste/waste.layout';
import { CALDERA_LAYOUT } from '../caldera.layout';
import {
  ANVIL_ISLAND,
  CALDERA_DOOR_APPROACH,
  CALDERA_DOORS,
  CALDERA_FAUNA_SITES,
  INNER_GATE,
  LAKE_INNER_R,
  LAKE_OUTER_R,
  RIM_GATE_SITE,
  STOKERS,
  WYRM_TERRACES,
  headingTo,
  polarFrom,
  radiusOf,
  type XZ,
} from '../calderaSites';
import { CALDERA_ENV_IDS } from './calderaEnvIds';

export const CALDERA_ENV_TILE = 'c1';

/** Clearances (m). */
export const CALDERA_ENV_CLEAR = {
  /** From an anchor. */
  anchor: 3,
  /** Beyond a trigger's radius. */
  trigger: 2,
  /** Beyond a structure's half diagonal. */
  structure: 1.5,
  /** From an N5 fauna site. */
  fauna: 8,
  /** Past the lava's edge (the lake's ring of r 95..255). */
  lava: 7,
  /** A post (lantern, banner) beyond a road's half width; anything else beyond the half width plus its own radius. */
  postRoad: 1.5,
  road: 4,
} as const;

/** The siege court (N4's M52 ground behind the Rim Gate): nothing stands in it. */
export const SIEGE_COURT = { x0: 10970, x1: 11030, z0: 6470, z1: 6640 } as const;

/** N10's Lava Stair channels (metres of arc from the head; plans/act5-N10.md): lanterns keep this far off each. */
export const LAVA_STAIR_CHANNELS = [86, 172, 258, 345, 431, 517] as const;
export const LAVA_STAIR_CHANNEL_CLEAR = 12;

/** Largest ground rise across a row's footprint (m): rocks sit on slopes, walls step a little, the rest stands level. */
export const SLOPE_TOLERANCE = { rock: 2.5, wall: 2.2, prop: 1.2 } as const;

/** Every size the generator needs: the Caldera ids plus the reused ones (targets.json). */
const SIZE: Readonly<Record<string, readonly [number, number, number]>> = {
  ...Object.fromEntries(CALDERA_ENV_IDS.map((e) => [e.id, [e.w, e.d, e.h] as const])),
  'basalt-columns-a': [3, 3, 4],
  'slag-heap': [5, 5, 2.5],
  'ore-pile': [2, 2, 1],
  'mine-cart': [1.8, 1, 1],
  'smelter-chimney': [2, 2, 9],
  'coal-heap-a': [2, 2, 0.8],
  'brazier-standing-a': [0.7, 0.7, 1.4],
  barrel: [0.9, 0.9, 1.1],
  crate_A_big: [1.2, 1.2, 1.2],
};
export const calderaEnvSize = (id: string): readonly [number, number, number] => SIZE[id] ?? [1, 1, 1];

type Kind = 'rock' | 'wall' | 'post' | 'portal' | 'prop';
const KIND: Readonly<Record<string, Kind>> = {
  'basalt-boulder-a': 'rock',
  'basalt-columns-a': 'rock',
  'lava-glass-shard-a': 'rock',
  'slag-heap': 'rock',
  'rim-wall-a': 'wall',
  'foundry-wall-a': 'wall',
  'caldera-lantern-post-a': 'post',
  'rim-banner-a': 'post',
  'warhost-banner-a': 'post',
  'cooling-hall-portal-a': 'portal',
  'tunnel-portal-a': 'portal',
  'foundry-stairhead-a': 'portal',
};
export const calderaEnvKind = (id: string): Kind => KIND[id] ?? 'prop';

// ---------------------------------------------------------------- the keep-clear tests (shared with the test file)

/** mulberry32. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const segDist = (x: number, z: number, pts: readonly XZ[]): number => {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1]!;
    const [bx, bz] = pts[i]!;
    const dx = bx - ax;
    const dz = bz - az;
    const l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
};

const ROADS = CALDERA_ROADS.map((r) => ({ id: r.id, hw: r.halfWidth, pts: r.points.map((p) => [p.x, p.z] as XZ) }));

/** The layouts every row keeps clear of: the Caldera's, and the Waste's round the rim stairs' foot. */
export const CALDERA_ENV_LAYOUTS: readonly LayoutData[] = [CALDERA_LAYOUT, WASTE_LAYOUT, ACT4_WORLD_LAYOUT];

interface Disc {
  x: number;
  z: number;
  r: number;
  why: string;
}
const FIXED: readonly Disc[] = [
  ...CALDERA_ENV_LAYOUTS.flatMap((l) => [
    ...l.anchors.filter((a) => !a.tags?.includes('air')).map((a) => ({ x: a.x, z: a.z, r: CALDERA_ENV_CLEAR.anchor, why: `anchor ${a.id}` })),
    ...l.triggers.map((t) => ({ x: t.x, z: t.z, r: (t.shape === 'sphere' ? t.radius : Math.hypot(t.half[0], t.half[2])) + CALDERA_ENV_CLEAR.trigger, why: `trigger ${t.id}` })),
    ...l.structures.map((s) => ({ x: s.x, z: s.z, r: Math.hypot(s.footprint[0], s.footprint[1]) / 2 + CALDERA_ENV_CLEAR.structure, why: `structure ${s.id}` })),
  ]),
  ...CALDERA_FAUNA_SITES.map((f) => ({ x: f.at[0], z: f.at[1], r: CALDERA_ENV_CLEAR.fauna, why: `fauna ${f.id}` })),
];

/** A row's footprint radius (half its diagonal at its scale). */
export const rowRadius = (row: PlacementRow): number => {
  const [w, d] = calderaEnvSize(row.id);
  return (Math.hypot(w, d) / 2) * (row.scale ?? 1);
};

/** The footprint's ground rise: the four corners (at 90% so a sunk edge is not counted twice) and the centre. */
export function groundRise(row: PlacementRow, at: (x: number, z: number) => number = heightAt): number {
  const [w, d] = calderaEnvSize(row.id);
  const a = ((row.yaw ?? 0) * Math.PI) / 180;
  // Local x runs along (cos yaw, -sin yaw), local z along (sin yaw, cos yaw): the compass yaw the env pass uses.
  const ux = Math.cos(a);
  const uz = -Math.sin(a);
  const vx = Math.sin(a);
  const vz = Math.cos(a);
  const hw = ((w * (row.scale ?? 1)) / 2) * 0.9;
  const hd = ((d * (row.scale ?? 1)) / 2) * 0.9;
  const ys = [at(row.x, row.z)];
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) ys.push(at(row.x + ux * hw * sx + vx * hd * sz, row.z + uz * hw * sx + vz * hd * sz));
  return Math.max(...ys) - Math.min(...ys);
}

/** The terraces' pieces may stand on the shelves' outer edges (1 m off the centreline plus their radius: the shelf is 14 m wide). */
export const TERRACE_IDS: ReadonlySet<string> = new Set(['scorched-nest-a', 'wyrm-skull-a', 'wyrm-rib-a']);
/** A piece made to be used from an anchor stands this close to it (centre distance), not the usual clearance. */
export const BESIDE: Readonly<Record<string, { anchor: string; r: number }>> = { 'forge-gong-frame-a': { anchor: 'caldera.stokers.gong', r: 2.2 } };

/**
 * Why a row may not stand where it is (null when it may). Portals stand at their own door (the door anchor 1.5 m in front),
 * so they skip the anchor, trigger and road tests; `terrace` rows may stand on the terraces' shelves' outer edges.
 */
export function calderaEnvRefusal(row: PlacementRow, at: (x: number, z: number) => number = heightAt): string | null {
  const { x, z } = row;
  const kind = calderaEnvKind(row.id);
  const terrace = TERRACE_IDS.has(row.id);
  const beside = BESIDE[row.id];
  const rad = rowRadius(row);
  if (x >= SIEGE_COURT.x0 - rad && x <= SIEGE_COURT.x1 + rad && z >= SIEGE_COURT.z0 - rad && z <= SIEGE_COURT.z1 + rad) return 'siege court';
  const r = radiusOf([x, z]);
  if (r > LAKE_INNER_R - CALDERA_ENV_CLEAR.lava - rad && r < LAKE_OUTER_R + CALDERA_ENV_CLEAR.lava + rad) return 'lava';
  if (r < LAKE_INNER_R) return 'island';
  if (kind !== 'portal') {
    for (const f of FIXED) {
      const d = Math.hypot(x - f.x, z - f.z);
      if (beside && f.why === `anchor ${beside.anchor}` ? d < beside.r : d < f.r + (kind === 'post' ? 0 : rad)) return f.why;
    }
    for (const road of ROADS) {
      const d = segDist(x, z, road.pts);
      const need = terrace && road.id === TERRACES_ROAD.id ? 1 + rad : road.hw + (kind === 'post' ? CALDERA_ENV_CLEAR.postRoad : CALDERA_ENV_CLEAR.road + rad);
      if (d < need) return `road ${road.id}`;
    }
  }
  const tol = kind === 'rock' ? SLOPE_TOLERANCE.rock : kind === 'wall' ? SLOPE_TOLERANCE.wall : SLOPE_TOLERANCE.prop;
  if (kind !== 'post' && groundRise(row, at) > tol) return 'slope';
  return null;
}

// ---------------------------------------------------------------- the rows

const r1 = (n: number): number => Math.round(n * 10) / 10;
const row = (id: string, p: XZ, yaw = 0, scale = 1): PlacementRow => ({ id, x: r1(p[0]), z: r1(p[1]), yaw: Math.round(((yaw % 360) + 360) % 360), scale: Math.round(scale * 100) / 100 });

/** A polyline's length, and the point and unit direction at arc `s`. */
function along(pts: readonly XZ[]): { len: number; at(s: number): { p: XZ; dir: XZ } } {
  const segs = pts.slice(1).map((b, i) => {
    const a = pts[i]!;
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return { a, b, l };
  });
  const len = segs.reduce((s, g) => s + g.l, 0);
  return {
    len,
    at(s: number) {
      for (const [i, g] of segs.entries()) {
        if (s <= g.l || i === segs.length - 1) {
          const t = Math.max(0, Math.min(1, s / g.l));
          return { p: [g.a[0] + (g.b[0] - g.a[0]) * t, g.a[1] + (g.b[1] - g.a[1]) * t], dir: [(g.b[0] - g.a[0]) / g.l, (g.b[1] - g.a[1]) / g.l] };
        }
        s -= g.l;
      }
      return { p: pts[0]!, dir: [0, 1] };
    },
  };
}
/** The point `off` metres to the right (+) or left (-) of a direction. */
const side = (p: XZ, dir: XZ, off: number): XZ => [p[0] + dir[1] * off, p[1] - dir[0] * off];

/** Lanterns along a way: every `step` metres, `off` metres to the higher side (the wall side), skipping `skip` arcs. */
function lanterns(pts: readonly XZ[], step: number, first: number, off: number, skip: (s: number) => boolean): PlacementRow[] {
  const way = along(pts);
  const out: PlacementRow[] = [];
  for (let s = first; s < way.len - 10; s += step) {
    let at = s;
    while (skip(at) && at < s + step / 2) at += 3;
    if (skip(at)) continue;
    const { p, dir } = way.at(at);
    const sides = [side(p, dir, off), side(p, dir, -off)].sort((a, b) => heightAt(b[0], b[1]) - heightAt(a[0], a[1]));
    for (const q of sides) {
      const r = row('caldera-lantern-post-a', q, headingTo(q, p));
      if (!calderaEnvRefusal(r)) {
        out.push(r);
        break;
      }
    }
  }
  return out;
}

/** `count` rows scattered by `sample`, each refused or kept (deterministic). */
function scatter(r: () => number, id: string, count: number, sample: (r: () => number) => XZ, scale: [number, number]): PlacementRow[] {
  const out: PlacementRow[] = [];
  for (let tries = 0; out.length < count && tries < count * 30; tries++) {
    const p = sample(r);
    const cand = row(id, p, r() * 360, scale[0] + r() * (scale[1] - scale[0]));
    if (calderaEnvRefusal(cand)) continue;
    if (out.some((o) => Math.hypot(o.x - cand.x, o.z - cand.z) < rowRadius(o) + rowRadius(cand) + 1)) continue;
    out.push(cand);
  }
  return out;
}
/** A band `lo`..`hi` metres either side of a way. */
const beside = (pts: readonly XZ[], lo: number, hi: number) => {
  const way = along(pts);
  return (r: () => number): XZ => {
    const { p, dir } = way.at(r() * way.len);
    return side(p, dir, (r() < 0.5 ? -1 : 1) * (lo + r() * (hi - lo)));
  };
};
/** A ring `lo`..`hi` metres from the Anvil. */
const ring = (lo: number, hi: number) => (r: () => number): XZ => polarFrom(ANVIL_ISLAND.centre, r() * 360, lo + Math.sqrt(r()) * (hi - lo));

/** The first spot near `p` (rings of 2 m out to `reach`) where the row may stand, or null. */
function near(id: string, p: XZ, yaw: number | ((q: XZ) => number), reach = 12): PlacementRow | null {
  for (let d = 0; d <= reach; d += 2) {
    const n = d === 0 ? 1 : Math.round((d * Math.PI) / 2);
    for (let i = 0; i < n; i++) {
      const q = d === 0 ? p : polarFrom(p, (i * 360) / n, d);
      const cand = row(id, q, typeof yaw === 'number' ? yaw : yaw(q));
      if (!calderaEnvRefusal(cand)) return cand;
    }
  }
  return null;
}

// ---- the hand-placed pieces

/** The Rim Gate's walls: four rim-wall-a modules a side on the rim's top (x 10941..10965 west, 11035..11059 east), facing the Waste. */
export const RIM_GATE_WALL_X = { west: [10944, 10950, 10956, 10962], east: [11038, 11044, 11050, 11056] } as const;
export const RIM_GATE_WALL_Z = RIM_GATE_SITE.towers[0][1];
/** The Inner Gate's walls: foundry-wall-a modules on the floor wall's lip (r 520), 16 to 40 m either side of the face's centre. */
export const INNER_GATE_WALL_DX = [19, 25, 31, 37] as const;

function gates(): PlacementRow[] {
  const out: PlacementRow[] = [];
  for (const x of [...RIM_GATE_WALL_X.west, ...RIM_GATE_WALL_X.east]) out.push(row('rim-wall-a', [x, RIM_GATE_WALL_Z], 180));
  for (const s of [-1, 1]) {
    for (const dx of INNER_GATE_WALL_DX) {
      const x = INNER_GATE.face[0] + s * dx;
      const z = ANVIL_ISLAND.centre[1] - Math.sqrt(520 * 520 - dx * dx);
      out.push(row('foundry-wall-a', [x, z], headingTo(ANVIL_ISLAND.centre, [x, z])));
    }
  }
  return out;
}

/** Each door's portal stands behind its anchor (the anchor 1.5 m out in front), its opening toward the way in. */
export const PORTAL_FOR = { coolingHall: 'cooling-hall-portal-a', foundry: 'foundry-stairhead-a', tunnel: 'tunnel-portal-a' } as const satisfies Record<keyof typeof CALDERA_DOORS, string>;
function portals(): PlacementRow[] {
  return (Object.keys(PORTAL_FOR) as (keyof typeof CALDERA_DOORS)[]).map((k) => {
    const d = CALDERA_DOORS[k];
    const a = CALDERA_DOOR_APPROACH[k];
    const yaw = headingTo(d, a);
    const back = 1.5 + calderaEnvSize(PORTAL_FOR[k])[1] / 2;
    return row(PORTAL_FOR[k], polarFrom(d, yaw + 180, back), yaw);
  });
}

function camp(): PlacementRow[] {
  const out: (PlacementRow | null)[] = [
    // The camp's way in from the gate cut, and the Lava Stair's head.
    row('rim-banner-a', [10982, 6688], 180),
    row('rim-banner-a', [11018, 6688], 180),
    row('rim-banner-a', [10988, 6806], 0),
    row('rim-banner-a', [11012, 6806], 0),
    // Behind the vendors' row (x 10895, the stalls at 10892.6): stores and two braziers.
    row('crate_A_big', [10880, 6712], 90),
    row('barrel', [10881, 6716], 0),
    row('brazier-standing-a', [10880, 6730], 0),
    row('barrel', [10880, 6750], 0),
    row('crate_A_big', [10881, 6754], 20),
    row('brazier-standing-a', [10880, 6770], 0),
    row('crate_A_big', [10880, 6790], 90),
    // The trainers' row (x 11105): racks behind and between the desks, facing the fire.
    ...[6711, 6733, 6755, 6777].map((z) => row('weapon-rack-a', [11114, z], 270)),
    // The stokers' post: the gong's frame behind the gong point (the player strikes from the anchor), coal and slag by the hut.
    row('forge-gong-frame-a', polarFrom(STOKERS.gong, headingTo(STOKERS.post, STOKERS.gong), 2.5), headingTo(STOKERS.gong, STOKERS.post)),
    near('coal-heap-a', [11205, 6765], 30),
    near('slag-heap', [11255, 6732], 70),
    // The Inner Gate's head: Rim banners and braziers either side of the apron (the Marshal's host holds it from M53).
    row('rim-banner-a', [10972, 7440], 180),
    row('rim-banner-a', [11028, 7440], 180),
    row('brazier-standing-a', [10978, 7432], 0),
    row('brazier-standing-a', [11022, 7432], 0),
  ];
  return out.filter((r): r is PlacementRow => !!r);
}

/** Vey's warhost on its plateau below the rim (x 11450..11750, z 5700..5900): two rows of tents across a fire lane. */
function warhost(): PlacementRow[] {
  return [
    ...[11530, 11570, 11630, 11670].map((x) => row('warhost-tent-a', [x, 5760], 0)),
    ...[11530, 11570, 11630, 11670].map((x) => row('warhost-tent-a', [x, 5840], 180)),
    row('brazier-standing-a', [11550, 5800], 0),
    row('brazier-standing-a', [11650, 5800], 0),
    row('brazier-standing-a', [11600, 5785], 0),
    row('brazier-standing-a', [11600, 5815], 0),
    row('warhost-banner-a', [11600, 5730], 0),
    row('warhost-banner-a', [11600, 5870], 180),
    row('warhost-banner-a', [11505, 5800], 90),
    row('warhost-banner-a', [11695, 5800], 270),
    row('weapon-rack-a', [11520, 5800], 90),
    row('weapon-rack-a', [11680, 5800], 270),
  ];
}

/** The Wyrm Terraces: a nest on each ledge, the skull on the middle one, ribs along the shelves. */
function terraces(r: () => number): PlacementRow[] {
  const out: PlacementRow[] = [];
  const ledges = WYRM_TERRACES.ledges.map((l) => l.at);
  for (const [i, p] of ledges.entries()) {
    const nest = near('scorched-nest-a', [p[0] + 5, p[1] + (i === 1 ? 22 : -22)], (q) => r1(headingTo(q, p)), 14);
    if (nest) out.push(nest);
  }
  const skull = near('wyrm-skull-a', [ledges[1]![0] + 4, ledges[1]![1] - 26], 180, 14);
  if (skull) out.push(skull);
  out.push(...scatter(r, 'wyrm-rib-a', 12, beside(WYRM_TERRACES.shelves, 4, 9), [0.8, 1.2]));
  return out;
}

let cache: PlacementRow[] | null = null;

/** The tile's rows (fixed, about 330). */
export function calderaEnvRows(): PlacementRow[] {
  if (cache) return cache;
  const r = rng(0xca1de4a);
  const rows: PlacementRow[] = [
    ...gates(),
    ...portals(),
    ...camp(),
    ...warhost(),
    // Lanterns: the rim stairs every 45 m, the Lava Stair every 60 m clear of N10's channels.
    ...lanterns(RIM_STAIRS_POINTS, 45, 20, 6, () => false),
    ...lanterns(LAVA_STAIR_POINTS, 60, 25, 5, (s) => LAVA_STAIR_CHANNELS.some((c) => Math.abs(c - s) < LAVA_STAIR_CHANNEL_CLEAR)),
    // The rim stairs' banks, the Lava Stair's columns.
    ...scatter(r, 'basalt-boulder-a', 25, beside(RIM_STAIRS_POINTS, 10, 35), [0.7, 1.4]),
    ...scatter(r, 'basalt-columns-a', 8, beside(LAVA_STAIR_POINTS, 9, 22), [0.8, 1.3]),
    // The bowl floor (r 270..455): chimneys round the far wall, the slag and ore of the old workings, carts, boulders.
    ...[40, 100, 140, 220, 260, 320].map((deg) => near('smelter-chimney', polarFrom(ANVIL_ISLAND.centre, deg, 430), 0, 16)).filter((x): x is PlacementRow => !!x),
    ...scatter(r, 'slag-heap', 8, ring(275, 450), [0.8, 1.3]),
    ...scatter(r, 'ore-pile', 10, ring(275, 450), [0.8, 1.2]),
    ...scatter(r, 'mine-cart', 4, ring(290, 440), [1, 1]),
    ...scatter(r, 'coal-heap-a', 6, ring(275, 450), [0.9, 1.3]),
    ...scatter(r, 'basalt-boulder-a', 25, ring(275, 455), [0.8, 1.6]),
    // The lava's outer shore: glass shards 7 to 35 m past the edge.
    ...scatter(r, 'lava-glass-shard-a', 40, ring(LAKE_OUTER_R + 8, LAKE_OUTER_R + 35), [0.8, 1.5]),
    ...terraces(r),
  ];
  cache = rows;
  return rows;
}
