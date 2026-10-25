// Harrowmark ground colour (environment pass, rulings 2026-10-24): trodden earth on the city's streets and packed earth in its yards.
// Pure functions of (x, z) like laneAmount and the ash tint in detailGround.ts, so they run in terrain workers and on the main thread
// with the same result; they follow no `?env=off` switch (terrain colour). The zones are data in one file per tile (splatZones.<tile>.ts);
// a tile adds its zones to SPLAT_ZONES below and nothing else changes. The meadow blades stay off where a zone is strong (SPLAT_CLEAR).
import { createNoise2D } from '../noise';
import { TERRAIN } from '../../config/constants';
import { H1_SPLAT_ZONES } from './splatZones.h1';
import { H3_SPLAT_ZONES } from './splatZones.h3';

/** A trodden street: a polyline with a half width and a soft outer edge (rounded ends). */
export interface SplatStreet {
  kind: 'street';
  id: string;
  pts: ReadonlyArray<readonly [number, number]>;
  halfWidth: number;
  edge: number;
}
/** A packed-earth yard: an axis-aligned rectangle with a soft edge centred on its sides. */
export interface SplatYard {
  kind: 'yard';
  id: string;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  edge: number;
  /** Colour strength 0..1 at full coverage (default 1): a camp's ground is only partly trodden. */
  strength?: number;
  /** The meadow blades keep growing here (a trampled camp, not a packed floor). */
  keepBlades?: boolean;
}
/** A stone court (H3: the keep court, the counting yard, the Archive steps, the ward square): a paved rectangle, grey, no meadow blades. */
export interface SplatCourt {
  kind: 'court';
  id: string;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  edge: number;
}
/** Sooted ground (Forge Row, the old smelter yard, the charcoal yard): an ellipse that darkens the ground to a grey; the blades stay and take the grey. */
export interface SplatSoot {
  kind: 'soot';
  id: string;
  cx: number;
  cz: number;
  /** Semi-axes (m): full strength inside `inner` x the axis, fading out to the axis. */
  rx: number;
  rz: number;
  inner: number;
  /** Colour strength 0..1 at the centre. */
  strength: number;
}
export type SplatZone = SplatStreet | SplatYard | SplatCourt | SplatSoot;

/** Every tile's zones. H2, H3 and H4 append their tables here. */
export const SPLAT_ZONES: readonly SplatZone[] = [...H1_SPLAT_ZONES, ...H3_SPLAT_ZONES];

/** Trodden earth: a pale, dry brown (linear-ish vertex colour, like detailGround's DIRT). */
const STREET_COLOUR = [0.3, 0.245, 0.165] as const;
/** Packed earth in a yard: a touch warmer and darker than the street. */
const YARD_COLOUR = [0.32, 0.25, 0.15] as const;
/** Share of the way to the splat colour at full strength: a little of the ground's own variation shows through. */
const STRENGTH = 0.9;
/** Paving: a pale, cool grey (linear-ish, like the yard colours). */
const COURT_COLOUR = [0.31, 0.3, 0.285] as const;
/** Soot: a dark warm grey. */
const SOOT_COLOUR = [0.15, 0.145, 0.14] as const;
/** No meadow blades where a street or yard is at least this strong (the blades would grow across a packed floor). */
export const SPLAT_CLEAR = 0.15;

const mottle = createNoise2D(TERRAIN.seed + 31);

function smoothstep(t: number): number {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}

interface Bounds {
  zone: SplatZone;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

function boundsOf(zone: SplatZone): Bounds {
  if (zone.kind === 'soot') return { zone, minX: zone.cx - zone.rx, maxX: zone.cx + zone.rx, minZ: zone.cz - zone.rz, maxZ: zone.cz + zone.rz };
  if (zone.kind === 'yard' || zone.kind === 'court') {
    const m = zone.edge / 2;
    return { zone, minX: zone.x0 - m, maxX: zone.x1 + m, minZ: zone.z0 - m, maxZ: zone.z1 + m };
  }
  const m = zone.halfWidth + zone.edge;
  const xs = zone.pts.map((p) => p[0]);
  const zs = zone.pts.map((p) => p[1]);
  return { zone, minX: Math.min(...xs) - m, maxX: Math.max(...xs) + m, minZ: Math.min(...zs) - m, maxZ: Math.max(...zs) + m };
}

/** Distance from (x, z) to the nearest point of a polyline. */
function distToPolyline(pts: ReadonlyArray<readonly [number, number]>, x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) {
    const ax = pts[i]![0];
    const az = pts[i]![1];
    const dx = pts[i + 1]![0] - ax;
    const dz = pts[i + 1]![1] - az;
    const len2 = dx * dx + dz * dz;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2)) : 0;
    best = Math.min(best, Math.hypot(x - (ax + t * dx), z - (az + t * dz)));
  }
  return best;
}

/** Coverage 0..1 of one zone at (x, z). */
export function zoneAmount(zone: SplatZone, x: number, z: number): number {
  if (zone.kind === 'street') {
    const d = distToPolyline(zone.pts, x, z) - zone.halfWidth;
    return 1 - smoothstep(d / zone.edge);
  }
  if (zone.kind === 'soot') {
    const r = Math.hypot((x - zone.cx) / zone.rx, (z - zone.cz) / zone.rz);
    return (1 - smoothstep((r - zone.inner) / (1 - zone.inner))) * zone.strength;
  }
  // Signed distance outside the rectangle (negative inside), blended over `edge` centred on the side.
  const dx = Math.max(zone.x0 - x, 0, x - zone.x1);
  const dz = Math.max(zone.z0 - z, 0, z - zone.z1);
  const outside = Math.hypot(dx, dz);
  const inside = outside > 0 ? 0 : Math.min(x - zone.x0, zone.x1 - x, z - zone.z0, zone.z1 - z);
  const d = outside > 0 ? outside : -inside;
  return 1 - smoothstep((d + zone.edge / 2) / zone.edge);
}

export interface SplatField {
  /** Strongest trodden-street coverage at (x, z), 0..1. */
  street(x: number, z: number): number;
  /** Strongest packed-yard coverage at (x, z), 0..1. */
  yard(x: number, z: number): number;
  /** Strongest stone-court coverage at (x, z), 0..1. */
  court(x: number, z: number): number;
  /** Strongest soot coverage at (x, z), 0..1. */
  soot(x: number, z: number): number;
  /** Strongest of streets, yards and courts, 0..1. */
  amount(x: number, z: number): number;
  /** Strongest coverage 0..1 of the zones that keep the meadow blades off (every street, the yards that do not set `keepBlades`). */
  clear(x: number, z: number): number;
}

/** Builds the field for a zone table (tests build their own; the game uses `splat`). */
export function createSplatField(zones: readonly SplatZone[]): SplatField {
  const bounds = zones.map(boundsOf);
  const all = bounds.length
    ? { minX: Math.min(...bounds.map((b) => b.minX)), maxX: Math.max(...bounds.map((b) => b.maxX)), minZ: Math.min(...bounds.map((b) => b.minZ)), maxZ: Math.max(...bounds.map((b) => b.maxZ)) }
    : { minX: 1, maxX: 0, minZ: 1, maxZ: 0 };
  const strongest = (kind: SplatZone['kind'] | 'any', x: number, z: number, clearOnly = false): number => {
    if (x < all.minX || x > all.maxX || z < all.minZ || z > all.maxZ) return 0;
    let a = 0;
    for (const b of bounds) {
      if ((kind !== 'any' && b.zone.kind !== kind) || x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
      if (clearOnly && (b.zone.kind === 'soot' || (b.zone.kind === 'yard' && b.zone.keepBlades))) continue;
      if (kind === 'any' && b.zone.kind === 'soot') continue;
      const v = zoneAmount(b.zone, x, z) * (b.zone.kind === 'yard' ? (b.zone.strength ?? 1) : 1);
      if (v > a) a = v;
    }
    return a;
  };
  return {
    street: (x, z) => strongest('street', x, z),
    yard: (x, z) => strongest('yard', x, z),
    court: (x, z) => strongest('court', x, z),
    soot: (x, z) => strongest('soot', x, z),
    amount: (x, z) => strongest('any', x, z),
    clear: (x, z) => strongest('any', x, z, true),
  };
}

const splat = createSplatField(SPLAT_ZONES);
/** Trodden-street coverage 0..1 at (x, z) over every registered tile. */
export const streetAmount = splat.street;
/** Packed-yard coverage 0..1 at (x, z) over every registered tile. */
export const yardAmount = splat.yard;
/** Strongest street or yard coverage 0..1 at (x, z). */
export const splatAmount = splat.amount;
/** Coverage 0..1 of the zones that keep the meadow blades off: the blades stay off where it reaches SPLAT_CLEAR. */
export const splatClearAmount = splat.clear;

/** Blends `out[o..o+2]` (a ground colour) toward trodden or packed earth at (x, z), with a soft mottling; the identity outside every zone. */
export function tintSplat(x: number, z: number, out: Float32Array, o: number, field: SplatField = splat): void {
  const street = field.street(x, z);
  const yard = field.yard(x, z);
  const court = field.court(x, z);
  const soot = field.soot(x, z);
  if (street <= 0 && yard <= 0 && court <= 0 && soot <= 0) return;
  // Mottling at three scales (a patch of dust, damp dark earth, a pale worn track), so a yard is not one flat colour at eye height.
  const m = 1 + mottle(x / 2.3, z / 2.3) * 0.08 + mottle(x / 7.5 + 40, z / 7.5) * 0.1 + mottle(x / 31 + 90, z / 31) * 0.1;
  // The warm/cool drift: damp patches go darker and redder, dust paler and greyer.
  const warm = mottle(x / 11 + 200, z / 11 - 60) * 0.1;
  const w = Math.max(street, yard, court, soot);
  for (let k = 0; k < 3; k++) {
    let c = out[o + k]!;
    c += (SOOT_COLOUR[k]! - c) * soot * STRENGTH;
    c += (YARD_COLOUR[k]! - c) * yard * STRENGTH;
    c += (COURT_COLOUR[k]! - c) * court * STRENGTH;
    c += (STREET_COLOUR[k]! - c) * street * STRENGTH;
    const tone = k === 0 ? 1 + warm * 0.6 : k === 2 ? 1 - warm * 0.8 : 1;
    out[o + k] = c * (1 + (m * tone - 1) * w);
  }
}
