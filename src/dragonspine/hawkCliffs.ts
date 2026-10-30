// The Hawk Cliffs (R18): the egg thief's camp on K1's cliff-foot plateau (sack, straw, tracks, a broken shell, three egg
// pick-ups), a companion hold point, the climb along K1's `hawk-cliffs-path` (a carved road, about 296 m with three switchbacks) to K1's
// level nest shelf, three nests (one is R18's), the parents' circling anchors and the rime-hawk spawn anchors.
import { findFlat } from '../cinderreach/siteFit';
import type { StructureSpec } from '../region/layoutTypes';
import { a, emptyPart, numbered, open, polar, solid, sphere, type Part } from './helpers';
import type { XZ } from './inputs';
import { Placer } from './placer';
import type { Sites } from './sites';

/** The parents circle this far over the shelf. */
export const ORBIT_ABOVE = 30;
const ORBIT_RADIUS = 22;

export interface HawkInfo {
  camp: XZ;
  eggs: XZ[];
  climbStart: XZ;
  climb: XZ[];
  climbLength: number;
  shelf: XZ;
  nests: XZ[];
  companionHold: XZ;
  specs: StructureSpec[];
}

const fail = (msg: string): never => {
  throw new Error(`dragonspine: ${msg}`);
};

/** A stone of the parapet: 0.6 m high, 3.4 m long along the path, 0.7 m through. */
export const PARAPET_HEIGHT = 0.6;
export const PARAPET_LENGTH = 3.4;
export const PARAPET_THICKNESS = 0.7;
/** The stones' inner edge keeps this far off the path's flat half-width. */
export const PARAPET_GAP = 0.6;
/** Only the long runs of the path (its legs) get a parapet; the hairpin turns between them are 14 m. */
const LEG_MIN = 30;

/**
 * A low rock line (greybox stones with colliders) along the downhill edge of each leg of K1's path, kept out of its flat
 * half-width. The downhill side is read from the ground; a stone that would stand near another stretch of the path (at a
 * hairpin) is left out, so the turns stay open.
 */
export function parapetStones(s: Sites): StructureSpec[] {
  const pts = s.inp.hawkPathPoints;
  const hw = s.inp.hawkPathHalfWidth;
  const off = hw + PARAPET_GAP + PARAPET_THICKNESS / 2;
  const out: StructureSpec[] = [];
  let n = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1]!;
    const [bx, bz] = pts[i]!;
    const len = Math.hypot(bx - ax, bz - az);
    if (len < LEG_MIN) continue;
    const dx = (bx - ax) / len;
    const dz = (bz - az) / len;
    const nx = -dz;
    const nz = dx;
    // Which side is downhill, from the ground at the middle of the leg.
    const mx = (ax + bx) / 2;
    const mz = (az + bz) / 2;
    const side = s.h(mx + nx * off, mz + nz * off) <= s.h(mx - nx * off, mz - nz * off) ? 1 : -1;
    const count = Math.floor(len / (PARAPET_LENGTH + 0.2));
    for (let k = 0; k < count; k++) {
      const t = ((k + 0.5) / count) * len;
      const x = ax + dx * t + side * nx * off;
      const z = az + dz * t + side * nz * off;
      // Both ends and the middle of the stone stay clear of every stretch of the path.
      const clear = [-1, 0, 1].every((e) => {
        const p = s.hawkPath.nearest(x + dx * e * (PARAPET_LENGTH / 2), z + dz * e * (PARAPET_LENGTH / 2));
        return p.d >= hw + PARAPET_GAP - 0.05;
      });
      if (!clear) continue;
      const yaw = (Math.atan2(-dz, dx) * 180) / Math.PI;
      out.push(solid(`dragonspine-hawk-parapet-${++n}`, 'rock', x, z, PARAPET_LENGTH, PARAPET_THICKNESS, PARAPET_HEIGHT, yaw));
    }
  }
  return out;
}

/** The path's vertices (its hairpins) plus a point at least every `step` m, in order. */
function pathVertexAndSamples(points: readonly (readonly [number, number])[], length: number, step: number): XZ[] {
  const out: XZ[] = [{ x: points[0]![0], z: points[0]![1] }];
  for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1]!;
    const [bx, bz] = points[i]!;
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step));
    for (let k = 1; k <= n; k++) out.push({ x: ax + ((bx - ax) * k) / n, z: az + ((bz - az) * k) / n });
  }
  return length > 0 ? out : out.slice(0, 1);
}

export function hawkCliffsLayout(s: Sites): { part: Part; info: HawkInfo } {
  const F = s.hawkFoot;
  const placer = new Placer({ minX: F.minX + 3, maxX: F.maxX - 3, minZ: F.minZ + 3, maxZ: F.maxZ - 3 }, null, 0);
  const camp = { x: F.cx - 16, z: F.cz - 8 };
  const straw = placer.place('dragonspine-thief-straw', 'dragonspine-straw', camp, 3, 2.4, { mode: 'open', margin: 0.3 });
  const sack = placer.place('dragonspine-thief-sack', 'dragonspine-sack', { x: camp.x + 4, z: camp.z + 1 }, 1.6, 1.2, { mode: 'open', margin: 0.3 });
  const tracks = placer.place('dragonspine-thief-tracks', 'dragonspine-tracks', { x: camp.x + 3, z: camp.z + 7 }, 5, 1.2, { mode: 'open', margin: 0.3 });
  const shell = placer.place('dragonspine-broken-shell', 'dragonspine-shell', { x: camp.x - 4, z: camp.z + 3 }, 0.8, 0.8, { mode: 'open', margin: 0.3 });

  const eggs = [-2.4, 0, 2.4].map((dx) => ({ x: camp.x + dx, z: camp.z - 4 }));
  // The climb is K1's `hawk-cliffs-path` (a carved road with switchbacks up the scarp): points along it every ~20 m.
  const path = s.hawkPath;
  const climbStart = { x: path.point(0).x, z: path.point(0).z };
  const climbLength = path.length;
  const climb: XZ[] = pathVertexAndSamples(path.points, climbLength, 12).map((q) => ({ x: q.x, z: q.z }));
  const steps = Math.max(2, Math.ceil(climbLength / 20));
  const climbPts = Array.from({ length: steps }, (_, i) => path.point((climbLength * (i + 1)) / (steps + 1)));

  // The nest shelf is K1's level bench at the path's top; the nests sit on it.
  const shelf = { x: s.nestShelf.x, z: s.nestShelf.z };
  const sh = { w: s.nestShelf.w, d: s.nestShelf.d };
  const within = { minX: shelf.x - sh.w / 2 + 1.5, maxX: shelf.x + sh.w / 2 - 1.5, minZ: shelf.z - sh.d / 2 + 1.5, maxZ: shelf.z + sh.d / 2 - 1.5 };
  const nestWant = [shelf, { x: shelf.x - 8, z: shelf.z + 2 }, { x: shelf.x + 8, z: shelf.z + 2 }];
  const nests = nestWant.map((w) => findFlat(s.h, { prefer: w, radius: 10, size: [2.2, 2.2], maxSpread: 0.45, step: 1, within }) ?? findFlat(s.h, { prefer: w, radius: 40, size: [2.2, 2.2], maxSpread: 0.45, step: 2 }) ?? fail(`no level spot for a nest near ${w.x.toFixed(0)},${w.z.toFixed(0)} on the nest shelf`));
  const nestSpecs = nests.map((p, i) => open(`dragonspine-nest-${i + 1}`, 'dragonspine-nest', p.x, p.z, 2.2, 2.2));
  const parapet = parapetStones(s);
  const hold = { x: F.maxX - 12, z: F.cz - 8 };

  const part: Part = {
    ...emptyPart(),
    anchors: [
      a('dragonspine.hawk.camp', camp.x, camp.z - 2, 0, ['objective']),
      ...[[-3, -1], [4, -2], [5, 5], [-5, 5]].map(([dx, dz], i) => a(`dragonspine.hawk.camp.search.${i + 1}`, camp.x + dx!, camp.z + dz!, 0, ['objective'])),
      ...numbered('dragonspine.hawk.egg', eggs.map((p) => [p.x, p.z] as const), ['objective'], 0),
      a('dragonspine.hawk.companion-hold', hold.x, hold.z, 270, ['poi']),
      // On K1's path up the scarp (grade up to 0.25); `elevated` keeps the stand-on-a-slope check off the switchbacks' edges.
      ...numbered('dragonspine.hawk.climb', climbPts.map((p) => [p.x, p.z] as const), ['objective', 'elevated'], 0),
      a('dragonspine.hawk.nest.r18', nests[0]!.x, nests[0]!.z - 3, 0, ['objective']),
      a('dragonspine.hawk.nest.2', nests[1]!.x, nests[1]!.z - 3, 0, ['poi']),
      a('dragonspine.hawk.nest.3', nests[2]!.x, nests[2]!.z - 3, 0, ['poi']),
      ...[0, 90, 180, 270].map((b, i) => {
        const [x, z] = polar(shelf.x, shelf.z, b, ORBIT_RADIUS);
        return a(`dragonspine.hawk.circle.${i + 1}`, x, z, (b + 90) % 360, ['poi', 'elevated'], { dy: ORBIT_ABOVE });
      }),
      a('dragonspine.spawn.hawk-cliffs.parent-1', shelf.x - 5, shelf.z - 3, 0, ['spawn']),
      a('dragonspine.spawn.hawk-cliffs.parent-2', shelf.x + 5, shelf.z - 3, 0, ['spawn']),
      a('npc-post.egg-thief', camp.x + 2, camp.z - 2, 90, ['npc-post']),
    ],
    triggers: [sphere('trg.dragonspine.hawkcliffs.camp', camp.x, camp.z, 22), sphere('trg.dragonspine.hawkcliffs.nest', shelf.x, shelf.z, 16)],
    structures: [straw, sack, tracks, shell, ...nestSpecs, ...parapet],
  };
  return { part, info: { camp, eggs, climbStart, climb, climbLength, shelf, nests, companionHold: hold, specs: part.structures } };
}
