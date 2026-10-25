// Shared shapes of the Greyfen dive interiors (plans/act3-K3.md section 4 and revision 2 item 5). Local metres from the door,
// yaw 0 faces -Z, y above the room floor. Dry stone ledges at y 0; each air pocket is a pool sunk POOL_DEPTH into the floor
// with a STEP stair out; pools are joined by sealed tunnels (floor -POOL_DEPTH, roof TUNNEL_ROOF) under the water line
// (SURFACE_HIGH), so there is no air between pockets. A sluice drops a section to SURFACE_LOW: 0.8 m of wading in the tunnels.
import type { LocalRect, SunkenDef } from '../interiors/types';

export const POOL_DEPTH = 4;
export const TUNNEL_ROOF = -0.5;
export const TUNNEL_WIDTH = 2.5;
/** Flooded: 0.3 m under the ledges, above every tunnel roof. */
export const SURFACE_HIGH = -0.3;
/** After a sluice: 0.8 m over the pool and tunnel floors. */
export const SURFACE_LOW = -POOL_DEPTH + 0.8;
/** The controller's auto-step (config/constants.ts); every stair step is exactly this. */
export const STEP = 0.4;
const STEP_LENGTH = 0.5;
/** Mid-height of a tunnel, where a dive route runs. */
export const SWIM_Y = (-POOL_DEPTH + TUNNEL_ROOF) / 2;

export const rect = (x0: number, z0: number, x1: number, z1: number): LocalRect => ({ x0, z0, x1, z1 });

/** A pool: sunk POOL_DEPTH, open above. */
export const pool = (id: string, r: LocalRect): SunkenDef => ({ id, rect: r, depth: POOL_DEPTH });

/** A sealed tunnel along x (z centre `z`) or along z (x centre `x`), TUNNEL_WIDTH wide. */
export const tunnelX = (id: string, x0: number, x1: number, z: number): SunkenDef => ({
  id,
  rect: rect(x0, z - TUNNEL_WIDTH / 2, x1, z + TUNNEL_WIDTH / 2),
  depth: POOL_DEPTH,
  roof: TUNNEL_ROOF,
});
export const tunnelZ = (id: string, z0: number, z1: number, x: number): SunkenDef => ({
  id,
  rect: rect(x - TUNNEL_WIDTH / 2, z0, x + TUNNEL_WIDTH / 2, z1),
  depth: POOL_DEPTH,
  roof: TUNNEL_ROOF,
});

export type StairDir = '+x' | '-x' | '+z' | '-z';

/**
 * A stair down into a pool: steps of STEP, STEP_LENGTH long, from the ledge edge at `edge` (the coordinate where the ledge
 * meets the pool) going `dir` into it, across `[from, to]` on the other axis. Its first step is STEP deep and its last is
 * one step above the pool floor. Listed before the pool so the steps win the cell lookup.
 */
export function stair(id: string, edge: number, dir: StairDir, from: number, to: number): SunkenDef[] {
  const n = Math.round(POOL_DEPTH / STEP) - 1;
  const sign = dir[0] === '+' ? 1 : -1;
  const out: SunkenDef[] = [];
  for (let i = 0; i < n; i++) {
    const a = edge + sign * i * STEP_LENGTH;
    const b = edge + sign * (i + 1) * STEP_LENGTH;
    const [lo, hi] = a < b ? [a, b] : [b, a];
    const r = dir[1] === 'x' ? rect(lo, from, hi, to) : rect(from, lo, to, hi);
    out.push({ id: `${id}.${i + 1}`, rect: r, depth: Math.round((i + 1) * STEP * 100) / 100 });
  }
  return out;
}

/** A wading pool: a STEP ring round an inner basin two steps deep (0.8 m of water with the surface at the floor). */
export function wadingPool(id: string, r: LocalRect): SunkenDef[] {
  const inner = rect(r.x0 + STEP_LENGTH, r.z0 + STEP_LENGTH, r.x1 - STEP_LENGTH, r.z1 - STEP_LENGTH);
  return [
    { id: `${id}.basin`, rect: inner, depth: 2 * STEP },
    { id: `${id}.step`, rect: r, depth: STEP },
  ];
}

/** Local point helpers for routes and stands. */
export const at = (x: number, y: number, z: number) => ({ x, y, z });
