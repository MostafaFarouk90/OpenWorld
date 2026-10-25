// The Greyfen's water inside its interiors (plans/act3-K3.md section 4, revision 2 item 5), on K0's types for K7's service.
// Volumes are flat: D05's sluices swap sets by `activeWhen` on `story.d05.sluice1` and `story.d05.sluice2`; every set is
// registered once and never re-registered. Routes carry K7's stands (`entryStand`, a `stand` per pocket: the dry ledge where
// a save under water lands). Outdoor, K3 registers only its site volumes (the reed beds, the M24 flats, the causeway gaps);
// K7 registers the region-scale water from K1's outlines and M24's pit (agreed 2026-10-24 21:11 UTC).
import type { Vec3Like } from '../core/events';
import { layoutInterior, type InteriorLayout } from '../interiors/layout';
import type { InteriorDef } from '../interiors/types';
import { heightAt } from '../terrain/heightfield';
import type { AirPocketDef, DiveRouteDef, WaterArea, WaterVolumeDef } from '../water/types';
import { CHAPEL_DEF, CHAPEL_ROUTE_LOCAL, CHAPEL_WATER_LOCAL } from './chapelInterior';
import {
  ARENA,
  DEEPS_DEF,
  DEEPS_ROUTE_A_LOCAL,
  DEEPS_ROUTE_B_LOCAL,
  DEEPS_WATER_A_LOCAL,
  DEEPS_WATER_B_LOCAL,
  SLUICE_FLAGS,
} from './deepsInterior';
import { SURFACE_HIGH, SURFACE_LOW } from './interiorKit';
import { BRIDGE_WIDTH, BRIDGES, M24_SOUNDINGS, REED_BED_SIZE, REED_BEDS } from './places';
import { GREYFEN_WATER_TABLE } from './sites';

/** K7's route shape (src/traversal/dive/types.ts `DiveRouteStandsDef`): K0's route plus the dry stand points. */
export interface GreyfenDiveRoute extends DiveRouteDef {
  entryStand: Vec3Like;
  airPockets: readonly (AirPocketDef & { stand: Vec3Like })[];
}

/** A volume in an interior's local terms (y above its floor). */
export interface LocalVolume {
  id: string;
  kind: WaterVolumeDef['kind'];
  surface: number;
  box?: { x0: number; z0: number; x1: number; z1: number };
  polygon?: readonly (readonly [number, number])[];
  activeWhen?: WaterVolumeDef['activeWhen'];
}

const [S1, S2] = SLUICE_FLAGS;

export const CHAPEL_VOLUMES: readonly LocalVolume[] = [{ id: 'water.greyfen.chapel', kind: 'dive', surface: SURFACE_HIGH, box: CHAPEL_WATER_LOCAL }];

/** The three sluice states: no sluice (A and B flooded), sluice 1 (A wading), sluice 2 (both wading). */
export const DEEPS_VOLUMES: readonly LocalVolume[] = [
  { id: 'water.greyfen.d05.a.high', kind: 'dive', surface: SURFACE_HIGH, box: DEEPS_WATER_A_LOCAL, activeWhen: { none: [S1] } },
  { id: 'water.greyfen.d05.a.low', kind: 'wade', surface: SURFACE_LOW, box: DEEPS_WATER_A_LOCAL, activeWhen: { all: [S1] } },
  { id: 'water.greyfen.d05.b.high', kind: 'dive', surface: SURFACE_HIGH, polygon: DEEPS_WATER_B_LOCAL, activeWhen: { none: [S2] } },
  { id: 'water.greyfen.d05.b.low', kind: 'wade', surface: SURFACE_LOW, polygon: DEEPS_WATER_B_LOCAL, activeWhen: { all: [S2] } },
  ...ARENA.channels.map((box, i): LocalVolume => ({ id: `water.greyfen.d05.channel.${i + 1}`, kind: 'deep', surface: SURFACE_HIGH, box })),
  // The wading pools' surface is the walkway: 0.8 m in the basin, 0.4 m on the step ring.
  ...ARENA.pools.map((box, i): LocalVolume => ({ id: `water.greyfen.d05.pool.${i + 1}`, kind: 'wade', surface: 0, box })),
];

function toWorld(layout: InteriorLayout, v: LocalVolume): WaterVolumeDef {
  const { x: ox, y: oy, z: oz } = layout.origin;
  const area: WaterArea = v.box
    ? { box: { x0: ox + v.box.x0, z0: oz + v.box.z0, x1: ox + v.box.x1, z1: oz + v.box.z1 } }
    : { polygon: (v.polygon ?? []).map(([x, z]) => [ox + x, oz + z] as const) };
  return { id: v.id, kind: v.kind, surfaceY: oy + v.surface, area, ...(v.activeWhen ? { activeWhen: v.activeWhen } : {}) };
}

const move = (layout: InteriorLayout, p: Vec3Like): Vec3Like => ({ x: layout.origin.x + p.x, y: layout.origin.y + p.y, z: layout.origin.z + p.z });

function routeToWorld(
  layout: InteriorLayout,
  volumeId: string,
  r: { id: string; entryStand: Vec3Like; points: readonly Vec3Like[]; airPockets: readonly { id: string; at: Vec3Like; stand: Vec3Like }[] },
): GreyfenDiveRoute {
  return {
    id: r.id,
    volumeId,
    entryStand: move(layout, r.entryStand),
    points: r.points.map((p) => move(layout, p)),
    airPockets: r.airPockets.map((p) => ({ id: p.id, at: move(layout, p.at), stand: move(layout, p.stand) })),
  };
}

const M24_FLAT = 8;

/** The outdoor site volumes, all wading at the fen's water table. */
export function siteVolumes(): WaterVolumeDef[] {
  const box = (cx: number, cz: number, size: number): WaterArea => ({ box: { x0: cx - size / 2, z0: cz - size / 2, x1: cx + size / 2, z1: cz + size / 2 } });
  const wade = (id: string, area: WaterArea): WaterVolumeDef => ({ id, kind: 'wade', surfaceY: GREYFEN_WATER_TABLE, area });
  // A causeway gap: the cut across the line, as a rectangle along it (the bridge's length) and across it (the cut's width).
  const gap = (b: (typeof BRIDGES)[number]): WaterArea => {
    const { x, z, dirX, dirZ } = b.centre;
    const hl = b.length / 2;
    const hw = BRIDGE_WIDTH * 2;
    const c = (s: number, t: number) => [x + dirX * s - dirZ * t, z + dirZ * s + dirX * t] as const;
    return { polygon: [c(-hl, -hw), c(hl, -hw), c(hl, hw), c(-hl, hw)] };
  };
  return [
    ...REED_BEDS.map((b, i) => wade(`water.greyfen.reedbed.${i + 1}`, box(b.x, b.z, REED_BED_SIZE))),
    ...M24_SOUNDINGS.map((p, i) => wade(`water.greyfen.m24.flat.${i + 1}`, box(p.x, p.z, M24_FLAT))),
    ...BRIDGES.map((b) => wade(`water.greyfen.causeway.gap.${b.n}`, gap(b))),
  ];
}

export interface GreyfenWater {
  volumes: WaterVolumeDef[];
  routes: GreyfenDiveRoute[];
}

/** Everything the water service needs, in world space, for interiors laid out on `height` (the shaped ground). */
export function greyfenWater(layoutOf: (def: InteriorDef) => InteriorLayout = (d) => layoutInterior(d, heightAt)): GreyfenWater {
  const chapel = layoutOf(CHAPEL_DEF);
  const deeps = layoutOf(DEEPS_DEF);
  return {
    volumes: [...CHAPEL_VOLUMES.map((v) => toWorld(chapel, v)), ...DEEPS_VOLUMES.map((v) => toWorld(deeps, v)), ...siteVolumes()],
    routes: [
      routeToWorld(chapel, 'water.greyfen.chapel', CHAPEL_ROUTE_LOCAL),
      routeToWorld(deeps, 'water.greyfen.d05.a.high', DEEPS_ROUTE_A_LOCAL),
      routeToWorld(deeps, 'water.greyfen.d05.b.high', DEEPS_ROUTE_B_LOCAL),
    ],
  };
}

/** For the 40 m air-pocket lint (`src/water/routes.ts`), which sees every route without booting the game. */
export const GREYFEN_DIVE_ROUTES: readonly DiveRouteDef[] = greyfenWater().routes;
