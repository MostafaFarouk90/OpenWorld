// What the Dragonspine places derive from. Every position in this folder comes from these inputs (K1's plateaus, the Rime Pass
// polyline, the camp hearth and the interior pads) and every y from `heightAt`: move a plateau and the place moves with it.
import { ACT3_INTERIOR_PADS, WYRMWATCH_HEARTH, type InteriorPadRecord } from '../region/act3/act3Places';
import { ACT3_PLATEAUS } from '../terrain/shape/act3';
import { RIME_PASS, RIME_PASS_POINTS } from '../terrain/shape/dragonspine';
import type { PlateauDef } from '../terrain/shaping';
import { heightAt as worldHeightAt } from '../terrain/heightfield';

export type HeightFn = (x: number, z: number) => number;
export interface XZ {
  x: number;
  z: number;
}
export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Margin kept between an interior's rooms and its pad's edge (the ground range is read 1 m beyond the rooms). */
export const INTERIOR_EDGE = 2;
/** How far the entry rooms reach past the interior's origin toward +Z (the exit anchor stands 2 m inside them). */
export const INTERIOR_ENTRY = 2.5;

/** An interior's pad: K1's `{ x, z, w, d }` as a box, plus the interior's origin (`site`) derived from it. */
export interface InteriorPad {
  id: string;
  footprint: Rect;
  site: XZ;
}

/**
 * K1's pad record as the builders use it. The interior's origin is the middle of the pad's north edge, set in far enough that
 * the entry rooms (which reach `INTERIOR_ENTRY` past it) keep the edge margin; the rooms run south from there (yaw 0 faces -Z).
 * The builders throw when the rooms do not fit the box.
 */
export function padFromRecord(id: string, r: Pick<InteriorPadRecord, 'x' | 'z' | 'w' | 'd'>): InteriorPad {
  const footprint = { minX: r.x - r.w / 2, maxX: r.x + r.w / 2, minZ: r.z - r.d / 2, maxZ: r.z + r.d / 2 };
  return { id, footprint, site: { x: r.x, z: footprint.maxZ - INTERIOR_EDGE - INTERIOR_ENTRY } };
}

export const padsFromRecords = (records: Readonly<Record<string, Pick<InteriorPadRecord, 'x' | 'z' | 'w' | 'd'>>>): InteriorPad[] => Object.entries(records).map(([id, r]) => padFromRecord(id, r));

export interface DragonspineInputs {
  plateaus: readonly PlateauDef[];
  passPoints: readonly (readonly [number, number])[];
  /** Half width of the pass road's flat cross-section (K1's `RIME_PASS.halfWidth`). */
  roadHalfWidth: number;
  hearth: XZ;
  pads: readonly InteriorPad[];
  heightAt: HeightFn;
}

/** K1's exports and the shipped ground. Tests pass their own `heightAt` (and shifted plateaus). */
export function defaultInputs(heightAt: HeightFn = worldHeightAt): DragonspineInputs {
  return {
    plateaus: ACT3_PLATEAUS,
    passPoints: RIME_PASS_POINTS,
    roadHalfWidth: RIME_PASS.halfWidth,
    hearth: WYRMWATCH_HEARTH,
    pads: padsFromRecords(ACT3_INTERIOR_PADS),
    heightAt,
  };
}

export const PLATEAU_IDS = ['wyrmwatch-lodge', 'rime-pass-shelter', 'last-anvil', 'hawk-cliffs-foot', 'collapsed-cave', 'm28-crag'] as const;
export type PlateauId = (typeof PLATEAU_IDS)[number];

export function plateauById(inp: Pick<DragonspineInputs, 'plateaus'>, id: string): PlateauDef {
  const p = inp.plateaus.find((q) => q.id === id);
  if (!p) throw new Error(`dragonspine: plateau "${id}" is missing`);
  return p;
}

export function padById(inp: Pick<DragonspineInputs, 'pads'>, id: string): InteriorPad {
  const p = inp.pads.find((q) => q.id === id);
  if (!p) throw new Error(`dragonspine: interior pad "${id}" is missing`);
  return p;
}
