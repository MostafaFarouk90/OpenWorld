import { registerStructureKind } from '../../region/structureKinds';
import { POI_STRUCTURE_KINDS } from './templates';

const HEIGHTS: Record<(typeof POI_STRUCTURE_KINDS)[number], number> = { 'poi-cave-mouth': 4, 'poi-ruin-wall': 3, 'poi-lookout': 1.8 };
let refs = 0;
let undos: Array<() => void> = [];

/** Registers the `poi-` structure kinds. Refcounted: the kinds go away when the last holder releases. */
export function registerPoiKinds(): () => void {
  if (refs++ === 0) undos = POI_STRUCTURE_KINDS.map((k) => registerStructureKind(k, { height: HEIGHTS[k] }));
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--refs === 0) {
      for (const u of undos.splice(0)) u();
    }
  };
}
