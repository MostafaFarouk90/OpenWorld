// Where the summit's places stand (PR 2): frames of K1's summit plateaus, the keep pad, the glide ledges, the Skyhold spur, the
// summit fog face and the troughs. Nothing is a map coordinate: move a plateau and every summit place moves with it.
import type { Act3GlideLedge, Act3GlideLedgeId } from '../region/act3/act3Glide';
import { footprintCorners } from '../region/geometry';
import type { StructureSpec } from '../region/layoutTypes';
import type { TroughDef } from '../terrain/shaping';
import { padById, plateauById, type DragonspineInputs, type HeightFn, type InteriorPad, type XZ } from './inputs';
import { roadFromPoints, type Road } from './road';
import { frameOf, type Frame } from './sites';

/** The six glide ledges, exactly K1's `Act3GlideLedgeId` values (K7 PR 2 uses `dragonspine.glide.<id>.launch`). */
export const GLIDE_LEDGE_IDS: readonly Act3GlideLedgeId[] = ['summit-aerie', 'summit-skyhold', 'skyhold-hawk-cliffs', 'anvil-rime-pass', 'rime-pass-lodge', 'hearth-updraft'];

/** The roost must hold M31's trial: at least this wide and deep (the trial arena is 80 m round its centre, the pad its floor). */
export const ROOST_MIN_SIZE = 60;
/** Half width of a launch run kept clear of every structure here (a lane a player runs and jumps along). */
export const RUN_HALF_WIDTH = 4;

export interface LaunchRun {
  id: Act3GlideLedgeId;
  from: XZ;
  to: XZ;
}

export interface SummitSites {
  h: HeightFn;
  gate: Frame;
  hearth: Frame;
  skyhold: Frame;
  roost: Frame;
  aerie: Frame;
  keepPad: InteriorPad;
  ledges: Readonly<Record<Act3GlideLedgeId, Act3GlideLedge>>;
  runs: readonly LaunchRun[];
  spur: Road;
  spurHalf: number;
  face: XZ;
  waystone: XZ;
  troughs: readonly TroughDef[];
}

const fail = (msg: string): never => {
  throw new Error(`dragonspine: ${msg}`);
};

/** Unit vector a launch faces (K1's heading is an engine yaw: yaw 0 faces -Z). */
export const forwardOf = (l: Pick<Act3GlideLedge, 'heading'>): XZ => ({ x: -Math.sin(l.heading), z: -Math.cos(l.heading) });
/** The compass heading (0 north, 90 east) of K1's launch yaw, as the anchor helper takes it. */
export const compassOf = (l: Pick<Act3GlideLedge, 'heading'>): number => ((((l.heading * 180) / Math.PI - 180) % 360) + 360) % 360;

export function deriveSummit(inp: DragonspineInputs): SummitSites {
  const ledges = {} as Record<Act3GlideLedgeId, Act3GlideLedge>;
  for (const id of GLIDE_LEDGE_IDS) ledges[id] = inp.glideLedges[id] ?? fail(`glide ledge "${id}" is missing`);
  const roost = frameOf(plateauById(inp, 'dragon-roost'));
  if (roost.w < ROOST_MIN_SIZE || roost.d < ROOST_MIN_SIZE) fail(`the dragon-roost pad is too small for M31's trial (${roost.w} x ${roost.d} m; needs ${ROOST_MIN_SIZE} x ${ROOST_MIN_SIZE})`);
  if (inp.troughs.length === 0) fail('the Frostfang troughs are missing');
  const runs = GLIDE_LEDGE_IDS.map((id): LaunchRun => {
    const l = ledges[id];
    const f = forwardOf(l);
    return { id, from: { x: l.ledge.x, z: l.ledge.z }, to: { x: l.ledge.x + f.x * inp.launchRun, z: l.ledge.z + f.z * inp.launchRun } };
  });
  return {
    h: inp.heightAt,
    gate: frameOf(plateauById(inp, 'summit-gate')),
    hearth: frameOf(plateauById(inp, 'wyrms-hearth')),
    skyhold: frameOf(plateauById(inp, 'skyhold-top')),
    roost,
    aerie: frameOf(plateauById(inp, 'frostfang-aerie')),
    keepPad: padById(inp, 'frostfang-keep'),
    ledges,
    runs,
    spur: roadFromPoints(inp.spurPoints),
    spurHalf: inp.spurHalfWidth,
    face: inp.summitFace,
    waystone: inp.aerieWaystone,
    troughs: inp.troughs,
  };
}

/** Distance from a point to a segment. */
export function segDist(p: XZ, a: XZ, b: XZ): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const l2 = dx * dx + dz * dz;
  const t = l2 === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2));
  return Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t));
}

/** True when no corner, edge midpoint or the centre of the footprint comes within `RUN_HALF_WIDTH` of any launch run. */
export function clearOfRuns(spec: Pick<StructureSpec, 'x' | 'z' | 'footprint' | 'yawDeg'>, runs: readonly LaunchRun[]): boolean {
  const c = footprintCorners(spec as StructureSpec);
  const pts: XZ[] = [{ x: spec.x, z: spec.z }, ...c.map(([x, z]) => ({ x, z }))];
  for (let i = 0; i < c.length; i++) pts.push({ x: (c[i]![0] + c[(i + 1) % c.length]![0]) / 2, z: (c[i]![1] + c[(i + 1) % c.length]![1]) / 2 });
  return runs.every((r) => pts.every((p) => segDist(p, r.from, r.to) >= RUN_HALF_WIDTH));
}

/** The nearest point to `want` (searched on rings of 2 m, within `radius`) whose ground gradient is under `maxGrad`, inside `within` when given and clear of the solids. */
export function freeStand(h: HeightFn, want: XZ, o: { radius?: number; maxGrad?: number; within?: { minX: number; maxX: number; minZ: number; maxZ: number }; avoid?: readonly StructureSpec[]; clear?: number } = {}): XZ | null {
  const radius = o.radius ?? 40;
  const maxGrad = o.maxGrad ?? 0.3;
  const clear = o.clear ?? 1.5;
  const grad = (x: number, z: number): number => Math.hypot((h(x + 1, z) - h(x - 1, z)) / 2, (h(x, z + 1) - h(x, z - 1)) / 2);
  const ok = (x: number, z: number): boolean => {
    const w = o.within;
    if (w && (x < w.minX || x > w.maxX || z < w.minZ || z > w.maxZ)) return false;
    if (grad(x, z) > maxGrad) return false;
    for (const s of o.avoid ?? []) {
      if (s.mode === 'open') continue;
      const reach = Math.hypot(s.footprint[0], s.footprint[1]) / 2 + clear;
      if (Math.hypot(s.x - x, s.z - z) < reach) return false;
    }
    return true;
  };
  for (let r = 0; r <= radius; r += 2) {
    const n = Math.max(1, Math.ceil((2 * Math.PI * r) / 2));
    for (let k = 0; k < n; k++) {
      const ang = (k / n) * Math.PI * 2;
      const x = Math.round((want.x + Math.cos(ang) * r) * 100) / 100;
      const z = Math.round((want.z + Math.sin(ang) * r) * 100) / 100;
      if (ok(x, z)) return { x, z };
    }
  }
  return null;
}
