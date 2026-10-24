// Environment pass G0c: Act 1 ground colour variation for the Brightwater tile B1 (plain TypeScript, runs in terrain workers).
// `buildChunkData` calls it after `surfaceColor`. It is the identity outside the B1 blend band; vertex colour is the only
// ground texture Act 1 has, so the lane dirt, dry verges and noise patches are painted into it. Chunk vertices are 1.56 m
// apart at best, so wheel ruts are left to props and decals rather than aliased into colour.
import { TERRAIN } from '../../config/constants';
import { createNoise2D } from '../noise';
import { ashGround } from '../../env/ashGradient';
import { tileWeight } from './detailRelief';

const patchNoise = createNoise2D(TERRAIN.seed + 21);
const dryNoise = createNoise2D(TERRAIN.seed + 22);

/** Packed-earth lane colour (linear-ish vertex colour, like the grass base in `surfaceColor`). */
const DIRT = [0.34, 0.26, 0.16] as const;
/** Ash-grey ground of the B4 reach (linear-ish vertex colour, a cool beige grey). */
const ASH_GROUND = [0.4, 0.38, 0.34] as const;
/** Sun-dried verge grass. */
const DRY = [0.34, 0.37, 0.15] as const;
/** The lane runs along x = 0 from just south of the first gate to Kettlewick's north gate. */
export const LANE = { halfWidth: 2.4, edge: 1.6, z0: -4, z1: 172 } as const;

function smoothstep(t: number): number {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}

/** Lane coverage 0..1 at (x, z): full on the packed centre, fading over `edge`, and rounded at both ends. */
export function laneAmount(x: number, z: number): number {
  const dz = Math.max(LANE.z0 - z, 0, z - LANE.z1);
  const d = Math.hypot(Math.abs(x) - LANE.halfWidth > 0 ? Math.abs(x) - LANE.halfWidth : 0, dz);
  return 1 - smoothstep(d / LANE.edge);
}

/** Blends `out[o..o+2]` (a ground colour) towards lane dirt, dry verge and a soft light/dark patching at (x, z). */
export function tintGround(x: number, z: number, out: Float32Array, o: number): void {
  tintB1(x, z, out, o);
  const ash = ashGround(x, z);
  if (ash > 0) for (let k = 0; k < 3; k++) out[o + k] = out[o + k]! + (ASH_GROUND[k]! - out[o + k]!) * ash * 0.92;
}

function tintB1(x: number, z: number, out: Float32Array, o: number): void {
  const w = tileWeight(x, z);
  if (w <= 0) return;
  // Soft light/dark patches about 40 m across, plus finer mottling.
  const patch = patchNoise(x / 38, z / 38) * 0.11 + patchNoise(x / 9 + 50, z / 9) * 0.05;
  // Drier ground where a second, broader noise is high; it sits on the verges and field edges, not the lane.
  const dry = smoothstep((dryNoise(x / 61, z / 61) - 0.1) / 0.5) * 0.65;
  const lane = laneAmount(x, z);
  const dryMix = dry * (1 - lane) * w;
  const laneMix = lane * w;
  const light = 1 + patch * w;
  for (let k = 0; k < 3; k++) {
    let c = out[o + k]!;
    c += (DRY[k]! - c) * dryMix;
    c += (DIRT[k]! - c) * laneMix;
    out[o + k] = c * light;
  }
}
