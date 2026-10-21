// The furnace houses at the feet of A1's three smoke stacks (OLDSMOKE_STACKS). A1 draws the stacks and their smoke at every
// distance; nothing here draws a stack, stack smoke or a stack LOD.
import type { LayoutData } from '../region/layoutTypes';
import { a, solid } from './helpers';
import { STACKS } from './sites';

export const FURNACE_SIZE = { w: 12, d: 10 } as const;
/** A furnace stands this far south of its stack. */
export const FURNACE_OFFSET = 18;

export const furnaceCentre = (i: number) => ({ x: STACKS[i].x, z: STACKS[i].z - FURNACE_OFFSET });

export function furnacesLayout(): Pick<LayoutData, 'anchors' | 'triggers' | 'structures'> {
  return {
    anchors: STACKS.map((_, i) => a(`oldsmoke.furnace.${i + 1}`, furnaceCentre(i).x, furnaceCentre(i).z - FURNACE_SIZE.d / 2 - 3, 180, ['poi'])),
    triggers: [],
    structures: STACKS.map((_, i) => solid(`oldsmoke-furnace-${i + 1}`, 'deepgate-furnace', furnaceCentre(i).x, furnaceCentre(i).z, FURNACE_SIZE.w, FURNACE_SIZE.d, 7)),
  };
}
