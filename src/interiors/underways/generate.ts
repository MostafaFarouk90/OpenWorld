import { HARROWMARK_SITES } from '../harrowmark/sites';
import type { InteriorDef, LocalRect, RoomDef } from '../types';

export const UNDERWAYS_ID = 'underways';
export const UNDERWAYS_ARENA_GATE = 'underways.arena.gate';
/** The shipped layout. Changing it (or the algorithm) moves every corridor: update the pinned hash in generate.test.ts. */
export const UNDERWAYS_SEED = 0x0d02;

/** Lattice spacing, columns (+X) and rows (+Z) in local metres; the stair room sits on cell (0, 0) at the local origin. */
export const LATTICE = { cell: 8, cols: 12, rows: 8 } as const;
/** The arena's 3 x 3 cell block in the far corner of the lattice. */
const ARENA_BLOCK = { c0: 9, r0: 5, size: 3 } as const;
const ARENA_HALF = 12;
const ARENA_HEIGHT = 6;
const CORRIDOR_HALF = 1.5;
const CORRIDOR_HEIGHT = 4;
const CHAMBER_HALF = 2;
const KENNEL_HALF = 3.5;
const KENNEL_HEIGHT = 4.5;
/** Side branches off the main path are cut back to this many cells, so the tunnels stay a dungeon rather than a maze. */
const MAX_BRANCH = 3;
/** Share of the remaining lattice links opened as loops (only where they keep both kennels on every way to the arena). */
const LOOP_SHARE = 0.1;
const TORCH_Y = 2.2;

type Cell = number;
const cellOf = (c: number, r: number): Cell => r * LATTICE.cols + c;
const colOf = (i: Cell) => i % LATTICE.cols;
const rowOf = (i: Cell) => Math.floor(i / LATTICE.cols);
const centre = (i: Cell) => ({ x: colOf(i) * LATTICE.cell, z: rowOf(i) * LATTICE.cell });
const inArenaBlock = (c: number, r: number) =>
  c >= ARENA_BLOCK.c0 && c < ARENA_BLOCK.c0 + ARENA_BLOCK.size && r >= ARENA_BLOCK.r0 && r < ARENA_BLOCK.r0 + ARENA_BLOCK.size;
const edgeKey = (a: Cell, b: Cell) => (a < b ? `${a}-${b}` : `${b}-${a}`);

/** Small, fast and seedable (mulberry32). */
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

function neighbours(i: Cell): Cell[] {
  const c = colOf(i);
  const r = rowOf(i);
  const out: Cell[] = [];
  for (const [dc, dr] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    const nc = c + dc;
    const nr = r + dr;
    if (nc < 0 || nr < 0 || nc >= LATTICE.cols || nr >= LATTICE.rows || inArenaBlock(nc, nr)) continue;
    out.push(cellOf(nc, nr));
  }
  return out;
}

/** BFS over `links`; returns depth per cell (-1 unreachable), skipping `without`. */
function depths(links: Map<Cell, Set<Cell>>, from: Cell, without: ReadonlySet<Cell> = new Set()): Int32Array {
  const d = new Int32Array(LATTICE.cols * LATTICE.rows).fill(-1);
  if (without.has(from)) return d;
  d[from] = 0;
  const queue = [from];
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q]!;
    for (const n of links.get(i) ?? []) {
      if (d[n] >= 0 || without.has(n)) continue;
      d[n] = d[i] + 1;
      queue.push(n);
    }
  }
  return d;
}

/** The abstract maze: which lattice cells are kept and linked, the main path, the kennels and the arena hook. */
export interface UnderwaysPlan {
  links: Map<Cell, Set<Cell>>;
  kept: Set<Cell>;
  mainPath: Cell[];
  kennels: [Cell, Cell];
  /** The last main-path cell, next to the arena block. */
  arenaHook: Cell;
  loops: number;
}

function link(links: Map<Cell, Set<Cell>>, a: Cell, b: Cell): void {
  if (!links.has(a)) links.set(a, new Set());
  if (!links.has(b)) links.set(b, new Set());
  links.get(a)!.add(b);
  links.get(b)!.add(a);
}

function unlink(links: Map<Cell, Set<Cell>>, a: Cell, b: Cell): void {
  links.get(a)?.delete(b);
  links.get(b)?.delete(a);
}

/** Seeded and pure: the same seed always gives the same plan. */
export function planUnderways(seed: number): UnderwaysPlan {
  if (!Number.isInteger(seed)) throw new Error(`Underways: seed must be an integer (got ${seed})`);
  const rand = rng(seed);
  const start = cellOf(0, 0);

  // 1. A spanning tree over the lattice ("growing tree": half the time the newest cell, half a random one, so the main
  // path wanders without snaking through the whole lattice).
  const links = new Map<Cell, Set<Cell>>();
  const seen = new Set<Cell>([start]);
  const stack: Cell[] = [start];
  while (stack.length > 0) {
    const k = rand() < 0.5 ? stack.length - 1 : Math.floor(rand() * stack.length);
    const i = stack[k]!;
    const open = neighbours(i).filter((n) => !seen.has(n));
    if (open.length === 0) {
      stack.splice(k, 1);
      continue;
    }
    const n = open[Math.floor(rand() * open.length)]!;
    link(links, i, n);
    seen.add(n);
    stack.push(n);
  }

  // 2. The arena hangs off the deepest cell that touches its block; the main path runs from the stair to there.
  const tree = depths(links, start);
  let arenaHook = -1;
  for (let i = 0; i < tree.length; i++) {
    const c = colOf(i);
    const r = rowOf(i);
    if (inArenaBlock(c, r) || tree[i] < 0) continue;
    const touches = [
      [c + 1, r],
      [c, r + 1],
    ].some(([nc, nr]) => inArenaBlock(nc!, nr!));
    if (touches && (arenaHook < 0 || tree[i] > tree[arenaHook])) arenaHook = i;
  }
  if (arenaHook < 0) throw new Error('Underways: no cell reaches the arena block');
  const mainPath: Cell[] = [arenaHook];
  while (mainPath[mainPath.length - 1] !== start) {
    const i = mainPath[mainPath.length - 1]!;
    const back = [...links.get(i)!].find((n) => tree[n] === tree[i] - 1);
    if (back === undefined) throw new Error('Underways: broken tree');
    mainPath.push(back);
  }
  mainPath.reverse();
  if (mainPath.length < 6) throw new Error(`Underways: main path too short (${mainPath.length} cells)`);

  // 3. Cut side branches back to MAX_BRANCH cells from the main path (tree distance from it, by BFS).
  const fromMain = new Int32Array(tree.length).fill(-1);
  const queue = [...mainPath];
  for (const i of mainPath) fromMain[i] = 0;
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q]!;
    for (const n of links.get(i) ?? []) {
      if (fromMain[n] >= 0) continue;
      fromMain[n] = fromMain[i] + 1;
      queue.push(n);
    }
  }
  const kept = new Set<Cell>();
  for (let i = 0; i < fromMain.length; i++) if (fromMain[i] >= 0 && fromMain[i] <= MAX_BRANCH) kept.add(i);
  for (const [a, set] of links) {
    for (const b of [...set]) if (!kept.has(a) || !kept.has(b)) unlink(links, a, b);
  }
  for (const i of [...links.keys()]) if (!kept.has(i)) links.delete(i);

  // 4. Kennels at a third and two thirds of the way; both must stay on every way to the arena.
  const L = mainPath.length;
  const kennels: [Cell, Cell] = [mainPath[Math.max(1, Math.round(L / 3))]!, mainPath[Math.min(L - 2, Math.round((2 * L) / 3))]!];
  const gated = () =>
    kennels.every((k) => depths(links, start, new Set([k]))[arenaHook] < 0) &&
    depths(links, start, new Set([kennels[1]]))[kennels[0]] >= 0;

  // 5. A few loops among the kept cells, in a seeded order, each only if both kennels still gate the arena.
  const candidates: [Cell, Cell][] = [];
  for (const a of [...kept].sort((x, y) => x - y)) {
    for (const b of neighbours(a)) if (b > a && kept.has(b) && !links.get(a)?.has(b)) candidates.push([a, b]);
  }
  for (let k = candidates.length - 1; k > 0; k--) {
    const j = Math.floor(rand() * (k + 1));
    [candidates[k], candidates[j]] = [candidates[j]!, candidates[k]!];
  }
  const want = Math.round(candidates.length * LOOP_SHARE);
  let loops = 0;
  for (const [a, b] of candidates) {
    if (loops >= want) break;
    link(links, a, b);
    if (gated()) loops++;
    else unlink(links, a, b);
  }
  if (!gated()) throw new Error('Underways: the kennels do not gate the arena');
  return { links, kept, mainPath, kennels, arenaHook, loops };
}

const rect = (x0: number, z0: number, x1: number, z1: number): LocalRect => ({
  x0: Math.min(x0, x1),
  z0: Math.min(z0, z1),
  x1: Math.max(x0, x1),
  z1: Math.max(z0, z1),
});

/**
 * The Underways (design 5.2 "old smelter tunnels", D02) as an `InteriorDef`: a stair room under the entrance, 3 m brick
 * corridors on an 8 m lattice, two kennel rooms on the main path with three hound anchors each, and the 24 x 24 m sewer arena
 * for Gaffer Grimtooth at its end (flat, 6 m tall, no pillars; plans/slice-2-interiors-nav-phase-b-review.md). Local metres,
 * floating like every interior over its door site.
 */
export function generateUnderways(seed: number = UNDERWAYS_SEED): InteriorDef {
  const plan = planUnderways(seed);
  const rooms: RoomDef[] = [];
  const torches: InteriorDef['torches'] = [];
  const kennelSet = new Set<Cell>(plan.kennels);

  // The stair room under the entrance (the door is on its -Z wall).
  rooms.push({ id: 'stair', x0: -3, z0: -4, x1: 3, z1: 3, height: CORRIDOR_HEIGHT });
  torches.push({ x: -2.9, y: TORCH_Y, z: -2 }, { x: 2.9, y: TORCH_Y, z: -2 });

  for (const i of [...plan.kept].sort((a, b) => a - b)) {
    if (i === cellOf(0, 0)) continue;
    const p = centre(i);
    const kennel = kennelSet.has(i);
    const h = kennel ? KENNEL_HALF : CHAMBER_HALF;
    rooms.push({
      id: kennel ? `kennel-${plan.kennels.indexOf(i) + 1}` : `cell-${colOf(i)}-${rowOf(i)}`,
      ...rect(p.x - h, p.z - h, p.x + h, p.z + h),
      height: kennel ? KENNEL_HEIGHT : CORRIDOR_HEIGHT,
    });
    if (kennel) torches.push({ x: p.x - KENNEL_HALF + 0.1, y: TORCH_Y, z: p.z }, { x: p.x + KENNEL_HALF - 0.1, y: TORCH_Y, z: p.z });
  }

  // Corridors between linked cells, with a torch on one wall at the middle (sides alternate).
  let side = 1;
  const corridors = new Set<string>();
  for (const [a, set] of [...plan.links].sort((x, y) => x[0] - y[0])) {
    for (const b of [...set].sort((x, y) => x - y)) {
      const key = edgeKey(a, b);
      if (corridors.has(key)) continue;
      corridors.add(key);
      const pa = centre(a);
      const pb = centre(b);
      const horizontal = pa.z === pb.z;
      rooms.push({
        id: `corridor-${key}`,
        ...(horizontal
          ? rect(pa.x, pa.z - CORRIDOR_HALF, pb.x, pa.z + CORRIDOR_HALF)
          : rect(pa.x - CORRIDOR_HALF, pa.z, pa.x + CORRIDOR_HALF, pb.z)),
        height: CORRIDOR_HEIGHT,
      });
      const mx = (pa.x + pb.x) / 2;
      const mz = (pa.z + pb.z) / 2;
      const off = (CORRIDOR_HALF - 0.1) * side;
      torches.push(horizontal ? { x: mx, y: TORCH_Y, z: mz + off } : { x: mx + off, y: TORCH_Y, z: mz });
      side = -side;
    }
  }

  // The arena block and its approach from the hook cell.
  const bc = { x: (ARENA_BLOCK.c0 + 1) * LATTICE.cell, z: (ARENA_BLOCK.r0 + 1) * LATTICE.cell };
  const arena = rect(bc.x - ARENA_HALF, bc.z - ARENA_HALF, bc.x + ARENA_HALF, bc.z + ARENA_HALF);
  rooms.push({ id: 'arena', ...arena, height: ARENA_HEIGHT });
  const hook = centre(plan.arenaHook);
  const fromWest = hook.x < arena.x0;
  // Unit vector from the hook into the arena, and the point where the approach meets the arena wall.
  const dir = fromWest ? { x: 1, z: 0 } : { x: 0, z: 1 };
  const edge = fromWest ? { x: arena.x0, z: hook.z } : { x: hook.x, z: arena.z0 };
  rooms.push({
    id: 'arena-approach',
    ...(fromWest
      ? rect(hook.x, hook.z - CORRIDOR_HALF, edge.x, hook.z + CORRIDOR_HALF)
      : rect(hook.x - CORRIDOR_HALF, hook.z, hook.x + CORRIDOR_HALF, edge.z)),
    height: CORRIDOR_HEIGHT,
  });
  const gate: LocalRect = fromWest
    ? rect(edge.x - 1.5, edge.z - CORRIDOR_HALF, edge.x, edge.z + CORRIDOR_HALF)
    : rect(edge.x - CORRIDOR_HALF, edge.z - 1.5, edge.x + CORRIDOR_HALF, edge.z);
  for (const [dx, dz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    torches.push({ x: bc.x + dx! * (ARENA_HALF - 0.1), y: 3, z: bc.z + dz! * 6 }, { x: bc.x + dx! * 6, y: 3, z: bc.z + dz! * (ARENA_HALF - 0.1) });
  }

  const arenaCentre = { x: bc.x, z: bc.z };
  const kennelAnchors = plan.kennels.flatMap((k, n) => {
    const p = centre(k);
    const spots = [
      { x: p.x - 2, z: p.z - 1.5 },
      { x: p.x + 2, z: p.z - 1.5 },
      { x: p.x, z: p.z + 2 },
    ];
    // Hounds face back along the main path, toward where the player comes from.
    const prev = centre(plan.mainPath[plan.mainPath.indexOf(k) - 1]!);
    return spots.map((s, j) => ({ id: `underways.spawn.hound-${n * 3 + j + 1}`, ...s, facing: prev }));
  });

  return {
    id: UNDERWAYS_ID,
    site: { ...HARROWMARK_SITES.underways },
    rooms,
    pillars: [],
    blockers: [{ id: UNDERWAYS_ARENA_GATE, rect: gate, height: CORRIDOR_HEIGHT }],
    torches,
    anchors: [
      // The exit stands against the stair wall (-Z), the entry 3.5 m in, facing into the tunnels.
      { id: 'harrowmark.underways.entry', x: 0, z: 0.5, yaw: 180 },
      { id: 'harrowmark.underways.exit', x: 0, z: -3, yaw: 0 },
      ...kennelAnchors,
      // Act 1 density pass, batch 4 (quests thread; additive): the two sluice valves in the last cell before the arena,
      // a smelter hand's tally chalked on the same cell's wall, the hounds the drained tunnel lets through (one cell back),
      // and the Gaffer's crates in the arena's far corner.
      { id: 'd02.valve-1', x: hook.x - 1.4, z: hook.z - 1.4, facing: hook },
      { id: 'd02.valve-2', x: hook.x + 1.4, z: hook.z + 1.4, facing: hook },
      { id: 'd02.tally', x: hook.x + 1.4, z: hook.z - 1.4, facing: hook },
      ...[[-1, 0], [1, 0], [0, 1]].map(([dx, dz], j) => {
        const back = centre(plan.mainPath[plan.mainPath.length - 2]!);
        return { id: `underways.spawn.sluice-${j + 1}`, x: back.x + dx!, z: back.z + dz!, facing: hook };
      }),
      { id: 'd02.den-crates', x: bc.x + 9, z: bc.z + 9, facing: arenaCentre },
      { id: 'underways.arena.door', x: hook.x, z: hook.z, facing: arenaCentre },
      { id: 'underways.arena.centre', ...arenaCentre, facing: { x: edge.x, z: edge.z } },
      ...[
        [-7, -7],
        [7, -7],
        [-7, 7],
        [7, 7],
      ].map(([dx, dz], j) => ({ id: `underways.summon.${j + 1}`, x: bc.x + dx!, z: bc.z + dz!, facing: arenaCentre })),
    ],
    triggers: [
      {
        id: 'trg.underways.arena',
        center: { x: edge.x + dir.x * 1.5, y: 2, z: edge.z + dir.z * 1.5 },
        half: fromWest ? { x: 1.5, y: 2, z: 3 } : { x: 3, y: 2, z: 1.5 },
      },
    ],
    doors: [{ doorId: 'underways', outside: 'harrowmark.underways.door', inside: 'harrowmark.underways.entry', exit: 'harrowmark.underways.exit' }],
    environment: {
      fogColor: 0x0d0e0a,
      fogNear: 4,
      fogFar: 34,
      skyColor: 0x6e6a52,
      groundColor: 0x151610,
      ambientIntensity: 0.45,
      lightColor: 0xff9a52,
      lightIntensity: 12,
      lightDistance: 13,
    },
  };
}

/** The shipped Underways. */
export const UNDERWAYS_DEF: InteriorDef = generateUnderways();
