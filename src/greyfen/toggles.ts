// The flag-driven pieces: R12's reed beds (lush unless burned, charred once burned) and M23's plank bridges (down once
// lowered). Specs are validated on their own (toggles.test.ts) but are not in the layout: a toggle is not a permanent structure.
import type { StructureSpec } from '../region/layoutTypes';
import { heightAt } from '../terrain/heightfield';
import { bridgeFlag, REEDS_BURNED_FLAG } from './flags';
import { open, solid, yawAlong } from './helpers';
import { BRIDGE_WIDTH, BRIDGES, REED_BED_SIZE, REED_BEDS } from './places';

export interface ToggleDef {
  id: string;
  spec: StructureSpec;
  /** The flag the toggle reads, and whether the structure shows while it is set (`show: true`) or while it is clear. */
  flag: string;
  show: boolean;
}

export { BRIDGE_WIDTH };

/** A bridge deck as a plank `bridge` structure over its gap, its top at the causeway height of the two gap ends. */
export function bridgeSpec(b: (typeof BRIDGES)[number], h: (x: number, z: number) => number = heightAt): StructureSpec {
  const ground = h(b.centre.x, b.centre.z);
  return solid(`greyfen-m23-bridge-${b.n}`, 'bridge', b.centre.x, b.centre.z, b.length, BRIDGE_WIDTH, Math.max(0.3, b.deckY - ground), yawAlong(b.centre.dirX, b.centre.dirZ));
}

export const GREYFEN_TOGGLES: readonly ToggleDef[] = [
  ...REED_BEDS.flatMap((b, i): ToggleDef[] => [
    { id: `reed-bed-${i + 1}`, spec: open(`greyfen-r12-bed-${i + 1}`, 'greyfen-reed-bed', b.x, b.z, REED_BED_SIZE, REED_BED_SIZE), flag: REEDS_BURNED_FLAG, show: false },
    { id: `reed-bed-${i + 1}-charred`, spec: open(`greyfen-r12-bed-${i + 1}-charred`, 'greyfen-reed-bed-charred', b.x, b.z, REED_BED_SIZE, REED_BED_SIZE), flag: REEDS_BURNED_FLAG, show: true },
  ]),
  ...BRIDGES.map((b): ToggleDef => ({ id: `bridge-${b.n}`, spec: bridgeSpec(b), flag: bridgeFlag(b.n), show: true })),
];
