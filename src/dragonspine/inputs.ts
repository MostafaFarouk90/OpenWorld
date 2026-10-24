// What the Dragonspine places derive from. Every position in this folder comes from these inputs (K1's plateaus, the Rime Pass
// polyline, the camp hearth and the interior pads) and every y from `heightAt`: move a plateau and the place moves with it.
import { ACT3_INTERIOR_PADS, WYRMWATCH_HEARTH } from '../region/act3/act3Places';
import { DRAGONSPINE_PLATEAUS, RIME_PASS_POINTS } from '../terrain/shape/dragonspine';
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

/** An interior's pad: where its rooms float over (site = the def's origin, footprint = flat world box) and the outside door. */
export interface InteriorPad {
  id: string;
  site: XZ;
  footprint: Rect;
  door: XZ;
}

export interface DragonspineInputs {
  plateaus: readonly PlateauDef[];
  passPoints: readonly (readonly [number, number])[];
  hearth: XZ;
  pads: readonly InteriorPad[];
  heightAt: HeightFn;
}

/** K1's exports and the shipped ground. Tests pass their own `heightAt` (and shifted plateaus). */
export function defaultInputs(heightAt: HeightFn = worldHeightAt): DragonspineInputs {
  return {
    plateaus: DRAGONSPINE_PLATEAUS,
    passPoints: RIME_PASS_POINTS,
    hearth: WYRMWATCH_HEARTH,
    pads: ACT3_INTERIOR_PADS,
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
