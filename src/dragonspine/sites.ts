// Where the Dragonspine places stand: frames of K1's plateaus, the road and the interior pads. Nothing is a map coordinate.
// Move a plateau and every place built on `deriveSites(inputs)` moves with it.
import { padById, plateauById, type DragonspineInputs, type HeightFn, type InteriorPad, type Rect, type XZ } from './inputs';
import type { PlateauDef } from '../terrain/shaping';
import { roadFromPoints, type Road } from './road';

export interface Frame extends Rect {
  id: string;
  cx: number;
  cz: number;
  w: number;
  d: number;
}

export function frameOf(p: PlateauDef): Frame {
  const b = p.box;
  return { ...b, id: p.id, cx: (b.minX + b.maxX) / 2, cz: (b.minZ + b.maxZ) / 2, w: b.maxX - b.minX, d: b.maxZ - b.minZ };
}

export interface Sites {
  inp: DragonspineInputs;
  h: HeightFn;
  road: Road;
  lodge: Frame;
  shelter: Frame;
  anvil: Frame;
  hawkFoot: Frame;
  cave: Frame;
  crag: Frame;
  hearth: XZ;
  hallPad: InteriorPad;
  cavePad: InteriorPad;
}

/** Half width of the pass road's flat cross-section; structures keep this plus a margin clear of its centre line. */
export const ROAD_HALF_WIDTH = 6;
export const ROAD_CLEAR = ROAD_HALF_WIDTH + 2;

export function deriveSites(inp: DragonspineInputs): Sites {
  return {
    inp,
    h: inp.heightAt,
    road: roadFromPoints(inp.passPoints),
    lodge: frameOf(plateauById(inp, 'wyrmwatch-lodge')),
    shelter: frameOf(plateauById(inp, 'rime-pass-shelter')),
    anvil: frameOf(plateauById(inp, 'last-anvil')),
    hawkFoot: frameOf(plateauById(inp, 'hawk-cliffs-foot')),
    cave: frameOf(plateauById(inp, 'collapsed-cave')),
    crag: frameOf(plateauById(inp, 'm28-crag')),
    hearth: inp.hearth,
    hallPad: padById(inp, 'wyrmwatch-hall'),
    cavePad: padById(inp, 'collapsed-cave'),
  };
}

/** Circles other layouts keep clear of (the Act 3 POI placement): centre and radius per site. */
export function keepOut(s: Sites): ReadonlyArray<{ id: string; x: number; z: number; r: number }> {
  return [
    { id: 'wyrmwatch-lodge', x: s.lodge.cx, z: s.lodge.cz, r: Math.hypot(s.lodge.w, s.lodge.d) / 2 },
    { id: 'rime-pass-shelter', x: s.shelter.cx, z: s.shelter.cz, r: 60 },
    { id: 'last-anvil', x: s.anvil.cx, z: s.anvil.cz, r: Math.hypot(s.anvil.w, s.anvil.d) / 2 },
  ];
}
