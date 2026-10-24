// Shared test fixtures: stand-in inputs on the stub ground, and a shifted copy (a plateau and its pad moved) for the
// "everything moves with the plateau" tests.
import { ACT3_INTERIOR_PADS, WYRMWATCH_HEARTH } from '../../region/act3/act3Places';
import { ACT3_PLATEAUS } from '../../terrain/shape/act3';
import { RIME_PASS_POINTS } from '../../terrain/shape/dragonspine';
import type { PlateauDef } from '../../terrain/shaping';
import { defaultInputs, padsFromRecords, type DragonspineInputs, type InteriorPad } from '../inputs';
import { stubGround } from './stubGround';

/** K1's exports on the stub ground. */
export function stubInputs(): DragonspineInputs {
  return { ...defaultInputs(stubGround(ACT3_PLATEAUS)), plateaus: ACT3_PLATEAUS, passPoints: RIME_PASS_POINTS, hearth: WYRMWATCH_HEARTH, pads: padsFromRecords(ACT3_INTERIOR_PADS) };
}

const movePlateau = (p: PlateauDef, dx: number, dz: number): PlateauDef => ({ ...p, box: { minX: p.box.minX + dx, maxX: p.box.maxX + dx, minZ: p.box.minZ + dz, maxZ: p.box.maxZ + dz } });
const movePad = (p: InteriorPad, dx: number, dz: number): InteriorPad => ({
  ...p,
  site: { x: p.site.x + dx, z: p.site.z + dz },
  footprint: { minX: p.footprint.minX + dx, maxX: p.footprint.maxX + dx, minZ: p.footprint.minZ + dz, maxZ: p.footprint.maxZ + dz },
});

/** The same inputs with the named plateaus moved (and, for the lodge, the hearth and the hall pad). */
export function shiftedInputs(ids: readonly string[], dx: number, dz: number, base: DragonspineInputs = stubInputs()): DragonspineInputs {
  const plateaus = base.plateaus.map((p) => (ids.includes(p.id) ? movePlateau(p, dx, dz) : p));
  const lodge = ids.includes('wyrmwatch-lodge');
  return {
    ...base,
    plateaus,
    heightAt: stubGround(plateaus),
    hearth: lodge ? { x: base.hearth.x + dx, z: base.hearth.z + dz } : base.hearth,
    pads: base.pads.map((p) => (p.id === 'wyrmwatch-hall' && lodge ? movePad(p, dx, dz) : p)),
  };
}

/** The same inputs with the whole road moved. */
export function shiftedRoad(dx: number, dz: number, base: DragonspineInputs = stubInputs()): DragonspineInputs {
  return { ...base, passPoints: base.passPoints.map(([x, z]) => [x + dx, z + dz] as const) };
}
