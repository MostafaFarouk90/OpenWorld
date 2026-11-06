// The deep run (Act 4, L2; plans/act4-L2.md section 5.4): M40's flight through the old smelter tunnels, a new seeded interior
// from the foot of the Keep stairs to an exit outside the north wall. It is not D02's Underways: that lattice and its hash are
// pinned (underways/generate.ts) and nothing here touches them. Deterministic: the layout is a pure function of the seed.
//
// A lattice of 8 m cells, COLS x ROWS. The main path is a serpentine: row 0 runs east from the stair room, each row turns at a
// seeded column and the next runs back, ROWS rows in all, ending in the exit room. Features sit at fixed shares of the path:
// two hound dens, three junctions (Edric's courage beats, each with a collapsed side passage), a sluice gate, a flooded stretch
// (wading depth, walkable), the patrol hall (a loop with two hide alcoves), a cart in a side passage, and the exit's ladder room.
import { DEEP_RUN_EXIT, DEEP_RUN_ID, LINK_ONLY_EXIT } from '../../harrowmark/act4/sites';
import type { InteriorDef, LocalRect, RoomDef, SunkenDef } from '../types';

export { DEEP_RUN_ID };
export const DEEP_RUN_SEED = 0x0d40;
export const DEEP_RUN_LATTICE = { cell: 8, cols: 14, rows: 8 } as const;
/** The world exit (first door: a stale-load rescue lands outside the walls) and the link target from the stairs. */
export const DEEP_RUN_EXIT_DOOR_ID = 'deep-run-exit';
export const DEEP_RUN_DOOR_ID = 'deep-run';
/** Opens the sluice gate (L10 writes it at the wheel). */
export const DEEP_RUN_SLUICE = 'deeprun.sluice';
export const DEEP_RUN_SLUICE_FLAG = 'story.m40.sluice';
/** L0's link back up to the Keep stairs stands here, in the stair room. */
export const DEEP_RUN_STAIRS_LINK_ANCHOR = 'harrowmark.a4.deeprun.stairs';

const P = 'harrowmark.a4.deeprun';
const CORRIDOR_HALF = 1.5;
const CORRIDOR_HEIGHT = 4;
const FLOOD_DEPTH = 0.35;
const TORCH_Y = 2.2;

/** Shares of the path where each feature sits (index = round(share x (length - 1))). */
export const DEEP_RUN_FEATURES = {
  den1: 0.12,
  junction1: 0.22,
  den2: 0.33,
  sluice: 0.42,
  floodFrom: 0.45,
  floodTo: 0.55,
  patrol: 0.65,
  junction2: 0.5,
  junction3: 0.78,
  cart: 0.86,
} as const;

/** mulberry32: a small, fast seeded PRNG. */
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

export interface DeepRunPath {
  /** Lattice cells (column, row) from the stair room to the exit room. */
  cells: { c: number; r: number }[];
  /** Local centre of each cell (x = c x cell, z = -r x cell). */
  points: { x: number; z: number }[];
  /** Metres along the path, centre to centre. */
  length: number;
}

/** The serpentine main path for a seed. */
export function deepRunPath(seed = DEEP_RUN_SEED): DeepRunPath {
  const next = rng(seed);
  const { cols, rows, cell } = DEEP_RUN_LATTICE;
  const cells: { c: number; r: number }[] = [];
  let col = 0;
  for (let r = 0; r < rows; r++) {
    const east = r % 2 === 0;
    // East turns land in the last four columns, west turns in the first three (row 0 starts at the stair room, column 0).
    const turn = east ? cols - 1 - Math.floor(next() * 4) : Math.floor(next() * 3);
    const step = east ? 1 : -1;
    for (let c = col; east ? c <= turn : c >= turn; c += step) cells.push({ c, r });
    col = turn;
  }
  const points = cells.map(({ c, r }) => ({ x: c * cell, z: -r * cell }));
  let length = 0;
  for (let i = 1; i < points.length; i++) length += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
  return { cells, points, length };
}

const rectAround = (x: number, z: number, half: number): LocalRect => ({ x0: x - half, z0: z - half, x1: x + half, z1: z + half });
const round = (n: number) => Math.round(n * 100) / 100;

/** The deep run as an `InteriorDef`, floating over its own exit outside the north wall. */
export function generateDeepRun(seed = DEEP_RUN_SEED): InteriorDef {
  const path = deepRunPath(seed);
  const pts = path.points;
  const n = pts.length;
  const at = (share: number) => Math.round(share * (n - 1));
  const F = DEEP_RUN_FEATURES;
  const rooms: RoomDef[] = [];
  const sunken: SunkenDef[] = [];
  const anchors: InteriorDef['anchors'] = [];
  const torches: InteriorDef['torches'] = [];
  const props: NonNullable<InteriorDef['props']> = [];
  const blockers: InteriorDef['blockers'] = [];

  // Corridors between consecutive cells; the flooded stretch is sunk to wading depth over the same rects.
  for (let i = 1; i < n; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const r: LocalRect = {
      x0: Math.min(a.x, b.x) - CORRIDOR_HALF,
      z0: Math.min(a.z, b.z) - CORRIDOR_HALF,
      x1: Math.max(a.x, b.x) + CORRIDOR_HALF,
      z1: Math.max(a.z, b.z) + CORRIDOR_HALF,
    };
    rooms.push({ id: `run.${i}`, ...r, height: CORRIDOR_HEIGHT });
    if (i > at(F.floodFrom) && i <= at(F.floodTo)) sunken.push({ id: `flood.${i}`, rect: r, depth: FLOOD_DEPTH });
    if (i % 3 === 0) {
      const horizontal = a.z === b.z;
      torches.push(horizontal ? { x: (a.x + b.x) / 2, y: TORCH_Y, z: a.z - CORRIDOR_HALF + 0.1 } : { x: a.x + CORRIDOR_HALF - 0.1, y: TORCH_Y, z: (a.z + b.z) / 2 });
    }
  }

  // The direction of travel at path index i (unit, along x or z), for side stubs and gates.
  const dirAt = (i: number) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i === 0 ? 1 : i)];
    return { dx: Math.sign(b.x - a.x), dz: Math.sign(b.z - a.z) };
  };
  // A side stub of `len` m off the corridor at path index i (to the left of travel), for collapsed passages and alcoves.
  const stub = (id: string, i: number, len: number, half = 1.25, side = 1): LocalRect => {
    const p = pts[i];
    const { dx, dz } = dirAt(i);
    // Left of travel: (dz, -dx) rotated a quarter; `side` -1 gives the right.
    const sx = dz * side;
    const sz = -dx * side;
    const from = CORRIDOR_HALF;
    const to = CORRIDOR_HALF + len;
    const r: LocalRect = sx !== 0
      ? { x0: p.x + Math.min(sx * from, sx * to), z0: p.z - half, x1: p.x + Math.max(sx * from, sx * to), z1: p.z + half }
      : { x0: p.x - half, z0: p.z + Math.min(sz * from, sz * to), x1: p.x + half, z1: p.z + Math.max(sz * from, sz * to) };
    rooms.push({ id, ...r, height: 3 });
    return r;
  };

  // The stair room (the link from the Keep stairs lands here) and the exit's ladder room.
  const start = pts[0];
  const end = pts[n - 1];
  rooms.push({ id: 'stair-room', ...rectAround(start.x, start.z, 3), height: 5 });
  rooms.push({ id: 'exit-room', ...rectAround(end.x, end.z, 3), height: 6 });
  anchors.push(
    { id: `${P}.entry`, x: start.x, z: start.z - 1, yaw: 0 },
    { id: DEEP_RUN_STAIRS_LINK_ANCHOR, x: start.x, z: start.z + 2.5, yaw: 180 },
    { id: `${P}.arrive`, x: end.x, z: end.z, yaw: 0 },
    { id: `${P}.ladder`, x: end.x, z: end.z - 2.6, yaw: 0 },
  );
  torches.push({ x: start.x - 2.9, y: TORCH_Y, z: start.z }, { x: end.x + 2.9, y: TORCH_Y, z: end.z });

  // Hound dens: a wider chamber and three spawn points each.
  for (const [k, share] of [[1, F.den1], [2, F.den2]] as const) {
    const p = pts[at(share)];
    rooms.push({ id: `den.${k}`, ...rectAround(p.x, p.z, 3.5), height: 4.5 });
    for (let m = 1; m <= 3; m++) anchors.push({ id: `${P}.spawn.den-${k}.${m}`, x: p.x - 2 + (m - 1) * 2, z: p.z + (m === 2 ? 1.5 : -1.5), yaw: 0 });
  }

  // Junctions (Edric stops at each until Cael speaks to him), each with a collapsed side passage.
  for (const [k, share] of [[1, F.junction1], [2, F.junction2], [3, F.junction3]] as const) {
    const i = at(share);
    const p = pts[i];
    rooms.push({ id: `junction.${k}`, ...rectAround(p.x, p.z, 3), height: 4.5 });
    const r = stub(`junction.${k}.side`, i, 2.5, 1.25);
    props.push({ id: `rubble.${k}`, rect: { x0: r.x0 + 0.2, z0: r.z0 + 0.2, x1: r.x1 - 0.2, z1: r.z1 - 0.2 }, height: 1.6 });
    anchors.push({ id: `${P}.junction.${k}`, x: p.x, z: p.z, yaw: 0 });
  }

  // The sluice gate across the corridor at its cell, built closed; the wheel stands just before it.
  {
    const i = at(F.sluice);
    const p = pts[i];
    const { dx, dz } = dirAt(i);
    const r: LocalRect = dx !== 0
      ? { x0: p.x - 0.25, z0: p.z - CORRIDOR_HALF, x1: p.x + 0.25, z1: p.z + CORRIDOR_HALF }
      : { x0: p.x - CORRIDOR_HALF, z0: p.z - 0.25, x1: p.x + CORRIDOR_HALF, z1: p.z + 0.25 };
    blockers.push({ id: DEEP_RUN_SLUICE, rect: r, height: CORRIDOR_HEIGHT, startClosed: true });
    anchors.push({ id: `${P}.sluice-wheel`, x: round(p.x - dx * 2), z: round(p.z - dz * 2), yaw: 0 });
  }

  // The patrol hall: a 10 x 10 loop round a central pier, two hide alcoves, four patrol points and the patrol's members.
  {
    const p = pts[at(F.patrol)];
    rooms.push({ id: 'patrol-hall', ...rectAround(p.x, p.z, 5), height: 5 });
    anchors.push(
      ...[[-3.5, -3.5], [3.5, -3.5], [3.5, 3.5], [-3.5, 3.5]].map(([ox, oz], k) => ({ id: `${P}.patrol.${k + 1}`, x: p.x + ox, z: p.z + oz, yaw: 0 })),
      ...[1, 2, 3, 4].map((m) => ({ id: `${P}.spawn.patrol.${m}`, x: p.x - 3.5 + ((m - 1) % 2) * 7, z: p.z - 3.5 + Math.floor((m - 1) / 2) * 7, yaw: 0 })),
    );
    const i = at(F.patrol);
    for (const [k, side] of [[1, 1], [2, -1]] as const) {
      const r = stub(`alcove.${k}`, Math.min(n - 1, i + (k === 1 ? -1 : 1)), 1.5, 1, side);
      anchors.push({ id: `${P}.hide.${k}`, x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2, yaw: 0 });
    }
  }

  // The cart in a side passage (an interact beat; it blocks the passage for good).
  {
    const i = at(F.cart);
    const r = stub('cart-passage', i, 4, 1.25);
    props.push({ id: 'cart', rect: { x0: r.x0 + 0.3, z0: r.z0 + 0.3, x1: r.x1 - 0.3, z1: r.z1 - 0.3 }, height: 1.4 });
    anchors.push({ id: `${P}.cart`, x: pts[i].x, z: pts[i].z, yaw: 0 });
  }

  // Escort route nodes every second cell (L4), and three checkpoints for L0's respawn port (L10 sets them).
  for (let i = 0, k = 1; i < n; i += 2, k++) anchors.push({ id: `${P}.route.${k}`, x: pts[i].x, z: pts[i].z, yaw: 0 });
  if ((n - 1) % 2 !== 0) anchors.push({ id: `${P}.route.${Math.floor((n - 1) / 2) + 2}`, x: end.x, z: end.z, yaw: 0 });
  for (const [k, share] of [[1, 0.02], [2, 0.4], [3, 0.75]] as const) {
    const p = pts[at(share)];
    anchors.push({ id: `${P}.checkpoint.${k}`, x: p.x, z: p.z, yaw: 0 });
  }

  // The patrol hall's pier stands 3 m to the left of the path line, so the way through stays straight and the loop goes round it.
  function patrolPier(): LocalRect {
    const i = at(F.patrol);
    const { dx, dz } = dirAt(i);
    return rectAround(pts[i].x + dz * 3, pts[i].z - dx * 3, 1);
  }

  // Float over the exit: the exit room sits right above the world exit outside the north wall.
  const site = { x: round(DEEP_RUN_EXIT.x - end.x), z: round(DEEP_RUN_EXIT.z - end.z) };

  return {
    id: DEEP_RUN_ID,
    site,
    rooms,
    pillars: [patrolPier()],
    props,
    blockers,
    sunken,
    torches,
    anchors,
    triggers: [
      { id: 'trg.harrowmark.a4.deeprun.patrol', center: { x: pts[at(F.patrol)].x, y: 2, z: pts[at(F.patrol)].z }, half: { x: 5, y: 2, z: 5 } },
      { id: 'trg.harrowmark.a4.deeprun.exit', center: { x: end.x, y: 2, z: end.z }, half: { x: 3, y: 2, z: 3 } },
    ],
    doors: [
      { doorId: DEEP_RUN_EXIT_DOOR_ID, outside: DEEP_RUN_EXIT.anchor, inside: `${P}.arrive`, exit: `${P}.ladder`, outsideInteractable: false },
      { doorId: DEEP_RUN_DOOR_ID, outside: DEEP_RUN_EXIT.anchor, inside: `${P}.entry`, exit: LINK_ONLY_EXIT, outsideInteractable: false },
    ],
    environment: {
      fogColor: 0x07090b,
      fogNear: 6,
      fogFar: 32,
      skyColor: 0x55606a,
      groundColor: 0x0c0e10,
      ambientIntensity: 0.35,
      lightColor: 0xffb070,
      lightIntensity: 11,
      lightDistance: 14,
    },
  };
}

export const DEEP_RUN_DEF: InteriorDef = generateDeepRun();
