import { registerStructureKind } from '../../../region/structureKinds';
import { A3_COLLIDER_KIND } from './templates';

let refs = 0;
let undo: (() => void) | null = null;

/** Registers `poi-a3-collider` (a solid with no visual of its own). Refcounted, as A2's kinds are. */
export function registerA3Kinds(): () => void {
  if (refs++ === 0) undo = registerStructureKind(A3_COLLIDER_KIND, { height: 2 });
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--refs === 0) {
      undo?.();
      undo = null;
    }
  };
}
