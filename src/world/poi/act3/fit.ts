// The site checks (thread K2): what a placed Act 3 piece must satisfy on the real ground. The fit helper (tools/k2-fit.ts) and
// placement.test.ts both call `siteProblems`, so the frozen arcs and the test can never disagree. Pure: heights come in.
import type { LayoutData, StructureSpec } from '../../../region/layoutTypes';
import { footprintCorners, groundRange } from '../../../region/geometry';
import { engineBox } from '../../../region/regions';
import { ACT3_PLATEAUS, ACT3_ROADS } from '../../../terrain/shape/act3';
import { GREYFEN_TROUGHS, GREYFEN_WATER_TABLE, HATHRENS_MERE, WADE_FLOOR_MIN } from '../../../terrain/shape/greyfen';
import { A3_COLLIDER_KIND, LEDGE_HEIGHT } from './templates';
import type { PlacedA3 } from './place';

export type HeightFn = (x: number, z: number) => number;

/** A plain jump peaks at 1.056 m and auto-step adds 0.4 m (layoutTypes): a ledge top must be more than this above the launch. */
export const PLAIN_REACH = 1.5;
/** The Leap's apex (LEAP.apex 2.2) less a margin: a ledge top at most this above the launch ground. */
export const LEAP_REACH = 2.05;

interface Pt {
  x: number;
  z: number;
}

export function distToPolyline(pts: readonly Pt[], x: number, z: number): number {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1].x, az = pts[i - 1].z, bx = pts[i].x, bz = pts[i].z;
    const l2 = (bx - ax) ** 2 + (bz - az) ** 2;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / l2));
    best = Math.min(best, Math.hypot(x - (ax + (bx - ax) * t), z - (az + (bz - az) * t)));
  }
  return best;
}

/** Highest minus lowest ground on a disc (2 m grid). */
export function discRange(h: HeightFn, cx: number, cz: number, r: number): number {
  let mn = Infinity;
  let mx = -Infinity;
  for (let dx = -r; dx <= r; dx += 2) {
    for (let dz = -r; dz <= r; dz += 2) {
      if (dx * dx + dz * dz > r * r) continue;
      const v = h(cx + dx, cz + dz);
      mn = Math.min(mn, v);
      mx = Math.max(mx, v);
    }
  }
  return mx - mn;
}

/** The top of a Leap ledge as the structure builder makes it: the highest ground within 1 m plus the ledge height. */
export function ledgeTop(s: StructureSpec, h: HeightFn): number {
  return groundRange(s, h, 1).max + (s.height ?? LEDGE_HEIGHT);
}

const radiusOf = (s: StructureSpec) => Math.hypot(s.footprint[0], s.footprint[1]) / 2;

export interface Neighbours {
  /** Other threads' layouts (K1 world, K3 Greyfen, K4 Dragonspine, K6b fauna minus the groups that stand at K2's sites). */
  layouts: readonly LayoutData[];
  /** The other Act 3 POIs. */
  others: readonly PlacedA3[];
}

/** Everything wrong with a placed site, as short readable strings (empty when the site passes). */
export function siteProblems(p: PlacedA3, h: HeightFn, n: Neighbours): string[] {
  const out: string[] = [];
  const { x, z } = p.pose;
  const ground = h(x, z);

  // ---- region and water
  if (p.region === 'greyfen' || p.region === 'dragonspine') {
    const b = engineBox(p.region);
    if (x - p.radius < b.x0 || x + p.radius > b.x1 || z - p.radius < b.z0 || z + p.radius > b.z1) out.push(`outside the ${p.region} box`);
  }
  const fromMere = Math.hypot(x - HATHRENS_MERE.x, z - HATHRENS_MERE.z);
  if (p.template === 'reed-island') {
    // On the wading shelf: never in deep water, never on dry land, the whole islet on the shelf.
    if (fromMere - p.radius < HATHRENS_MERE.radius + 2 || fromMere + p.radius > HATHRENS_MERE.radius + HATHRENS_MERE.shelfWidth - 2) out.push(`islet off the shelf (${fromMere.toFixed(0)} m)`);
    if (ground > GREYFEN_WATER_TABLE - 0.3 || ground < WADE_FLOOR_MIN - 0.1) out.push(`islet floor ${ground.toFixed(2)} not wading`);
  } else if (p.template !== 'drowned-church') {
    if (ground < GREYFEN_WATER_TABLE + 0.5) out.push(`wet ground ${ground.toFixed(2)}`);
    if (fromMere < HATHRENS_MERE.radius + HATHRENS_MERE.shelfWidth + p.radius) out.push('on the Mere');
  }
  if (p.template === 'drowned-church') {
    // Half drowned: the nave's centre at the water's edge or in it (the model sits 1.2 m sunk), the chest and the ledge dry.
    if (ground > GREYFEN_WATER_TABLE + 0.5) out.push(`nave dry ${ground.toFixed(2)}`);
    for (const a of p.layout.anchors) {
      if (!/\.(chest|ledge|ledge\.launch|main)$/.test(a.id) || a.id.endsWith('.main')) continue;
      if (h(a.x, a.z) < GREYFEN_WATER_TABLE + 0.2) out.push(`${a.id} wet`);
    }
  }

  // ---- shape of the ground
  const disc = discRange(h, x, z, Math.min(p.radius, 12));
  if (disc > 6) out.push(`disc range ${disc.toFixed(1)}`);
  for (const s of p.layout.structures) {
    if (s.kind === 'rock') continue;
    const r = groundRange(s, h);
    if (r.max - r.min > 1.6) out.push(`${s.id} range ${(r.max - r.min).toFixed(1)}`);
    // A drawn, non-foundation structure stands at its centre's ground: the validator's flatness (corners and centre, 0.5 m)
    // keeps one end from floating. K2's own colliders draw nothing (the model is the visual), so they only need the range above.
    if (s.kind === A3_COLLIDER_KIND) continue;
    const hs = [...footprintCorners(s), [s.x, s.z] as [number, number]].map(([cx, cz]) => h(cx, cz));
    if (Math.max(...hs) - Math.min(...hs) > 0.5) out.push(`${s.id} not flat (${(Math.max(...hs) - Math.min(...hs)).toFixed(2)})`);
  }
  for (const s of p.layout.structures.filter((st) => st.role === 'ledge')) {
    const r = groundRange(s, h);
    if (r.max - r.min > 1) out.push(`${s.id} ledge range ${(r.max - r.min).toFixed(2)}`);
    const launch = p.layout.anchors.find((a) => a.id.endsWith('.ledge.launch'));
    if (!launch) {
      out.push(`${s.id} without launch`);
      continue;
    }
    const lift = ledgeTop(s, h) - h(launch.x, launch.z);
    if (lift < PLAIN_REACH || lift > LEAP_REACH) out.push(`${s.id} lift ${lift.toFixed(2)}`);
  }

  // ---- keep-outs: plateaus, roads, ferry channels, other threads' ids and structures, other POIs
  for (const pl of ACT3_PLATEAUS) {
    const m = p.radius + pl.blend;
    if (!(x < pl.box.minX - m || x > pl.box.maxX + m || z < pl.box.minZ - m || z > pl.box.maxZ + m)) out.push(`on plateau ${pl.id}`);
  }
  for (const r of ACT3_ROADS) {
    const d = distToPolyline(r.points, x, z) - p.radius;
    if (d < r.halfWidth + 3) out.push(`on road ${r.id} (${d.toFixed(0)})`);
  }
  for (const t of GREYFEN_TROUGHS) {
    // The drowned church may stand in a causeway bog (its nave is meant to be wet); never in a ferry channel.
    if (p.template === 'drowned-church' && !t.id.startsWith('ferry-')) continue;
    if (distToPolyline(t.points, x, z) - p.radius < t.halfWidth + t.blend + 3) out.push(`on trough ${t.id}`);
  }
  for (const l of n.layouts) {
    for (const t of l.triggers) {
      const r = t.shape === 'sphere' ? t.radius : Math.hypot(t.half[0], t.half[2]);
      if (Math.hypot(t.x - x, t.z - z) < p.radius + r + 6) out.push(`near trigger ${t.id}`);
    }
    for (const a of l.anchors) {
      if (Math.hypot(a.x - x, a.z - z) < p.radius + 8) out.push(`near anchor ${a.id}`);
    }
    for (const s of l.structures) {
      if (Math.hypot(s.x - x, s.z - z) < p.radius + radiusOf(s) + 4) out.push(`near structure ${s.id}`);
    }
  }
  for (const o of n.others) {
    if (o.id === p.id) continue;
    if (Math.hypot(o.pose.x - x, o.pose.z - z) < p.radius + o.radius + 20) out.push(`near poi ${o.id}`);
  }
  return out;
}
