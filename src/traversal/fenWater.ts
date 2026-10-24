// K1's Greyfen exports read through globs, so this branch builds before K1's lands and picks them up once it does:
// - `ACT3_WATER_SURFACES` (src/region/act3/act3Water.ts): the Mere (deep circle), its wading shelf (a ring), the three
//   ferry channels (deep polygons) and the fen pool sheet (wade), all at the 6 m water table;
// - `ACT3_FERRY` (src/region/act3/act3Places.ts): the stops and the channel centrelines the ride follows.
import type { WaterVolumeDef } from '../water/types';
import { ACT3_FERRY, type FerryNetworkData } from './sites';

type XZ = readonly [number, number];

/** K1's `WaterSurface`. */
export interface FenSurface {
  id: string;
  kind: 'wade' | 'deep';
  surfaceY: number;
  outline: { kind: 'polygon'; points: readonly XZ[] } | { kind: 'circle'; x: number; z: number; radius: number; innerRadius?: number };
}

interface K1Ferry {
  surfaceY: number;
  stops: readonly { id: string; x: number; z: number }[];
  paths: readonly { from: string; to: string; points: readonly XZ[] }[];
}

const k1Water = import.meta.glob<{ ACT3_WATER_SURFACES?: readonly FenSurface[] }>('../region/act3/act3Water.ts', { eager: true });
const k1Places = import.meta.glob<{ ACT3_FERRY?: K1Ferry }>('../region/act3/act3Places.ts', { eager: true });

/** Segments for a circle outline (about 3 m per side on the Mere). */
export const CIRCLE_SEGMENTS = 48;

/**
 * K1's surfaces as K0's volume type. A circle becomes a polygon; a ring (the Mere's shelf) becomes its full disc, which
 * is right because the deep disc inside it wins the overlap (dive over deep over wade). An entry this cannot read is
 * reported and skipped (never a throw at boot).
 */
export function fenVolumes(surfaces: readonly FenSurface[], warn: (m: string) => void): WaterVolumeDef[] {
  const out: WaterVolumeDef[] = [];
  for (const s of surfaces) {
    const o = s.outline;
    let polygon: [number, number][] = [];
    if (o?.kind === 'polygon') polygon = o.points.map((p) => [p[0], p[1]]);
    else if (o?.kind === 'circle' && o.radius > 0) {
      for (let i = 0; i < CIRCLE_SEGMENTS; i++) {
        const a = (i / CIRCLE_SEGMENTS) * Math.PI * 2;
        polygon.push([o.x + Math.cos(a) * o.radius, o.z + Math.sin(a) * o.radius]);
      }
    }
    if ((s.kind !== 'wade' && s.kind !== 'deep') || !Number.isFinite(s.surfaceY) || polygon.length < 3) {
      warn(`traversal: K1 water surface "${s.id}" is not a readable wade or deep outline; skipped`);
      continue;
    }
    out.push({ id: s.id.startsWith('water.') ? s.id : `water.greyfen.${s.id}`, kind: s.kind, surfaceY: s.surfaceY, area: { polygon } });
  }
  return out;
}

/** K1's surfaces when K1's module is in the build, else none. */
export function k1FenSurfaces(): readonly FenSurface[] {
  return Object.values(k1Water)[0]?.ACT3_WATER_SURFACES ?? [];
}

/** The ferry network: K1's (the carved channels) when it is in the build and has paths, else K7's provisional copy. */
export function ferryNetwork(k1: K1Ferry | undefined = Object.values(k1Places)[0]?.ACT3_FERRY): FerryNetworkData {
  if (!k1 || k1.paths.length === 0) return ACT3_FERRY;
  return {
    surfaceY: k1.surfaceY,
    stops: k1.stops.map((s) => ({ id: s.id, x: s.x, z: s.z })),
    paths: k1.paths.map((p) => ({ from: p.from, to: p.to, points: p.points.map((q) => ({ x: q[0], z: q[1] })) })),
  };
}
