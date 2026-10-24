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
  /** The Hawk Cliffs path as a road (K1's `hawk-cliffs-path`). */
  hawkPath: Road;
  nestShelf: DragonspineInputs['nestShelf'];
  /** Half width of the road's flat cross-section, from the inputs (K1's RoadDef). */
  roadHalf: number;
  /** Structures keep this far from the centre line. */
  roadClear: number;
  lodge: Frame;
  shelter: Frame;
  anvil: Frame;
  hawkFoot: Frame;
  cave: Frame;
  crag: Frame;
  hearth: XZ;
  hallPad: InteriorPad;
  cavePad: InteriorPad;
  /** The doors, from the place layouts: the hall's on the lodge plateau, the cave's at the mouth plateau's centre. */
  hallDoor: XZ;
  caveDoor: XZ;
}

export function deriveSites(inp: DragonspineInputs): Sites {
  const lodge = frameOf(plateauById(inp, 'wyrmwatch-lodge'));
  const cave = frameOf(plateauById(inp, 'collapsed-cave'));
  return {
    inp,
    h: inp.heightAt,
    road: roadFromPoints(inp.passPoints),
    hawkPath: roadFromPoints(inp.hawkPathPoints),
    nestShelf: inp.nestShelf,
    roadHalf: inp.roadHalfWidth,
    roadClear: inp.roadHalfWidth + 2,
    lodge,
    shelter: frameOf(plateauById(inp, 'rime-pass-shelter')),
    anvil: frameOf(plateauById(inp, 'last-anvil')),
    hawkFoot: frameOf(plateauById(inp, 'hawk-cliffs-foot')),
    cave,
    crag: frameOf(plateauById(inp, 'm28-crag')),
    hearth: inp.hearth,
    hallPad: padById(inp, 'wyrmwatch-hall'),
    cavePad: padById(inp, 'collapsed-cave'),
    hallDoor: { x: lodge.cx - 30, z: lodge.cz + 1 },
    caveDoor: { x: cave.cx, z: cave.cz },
  };
}
