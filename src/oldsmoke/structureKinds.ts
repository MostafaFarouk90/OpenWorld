// The Deepgate structure kinds, registered through A0's `registerStructureKind` (v0.6 item 17). Prefixed `deepgate-` so A3's
// `cinder-*`, A2's `poi-*` and the mine kit never collide. Registration is refcounted: every plugin setup takes a reference and only
// the last release removes the kinds, so a double setup (or a test next to the real plugin) cannot throw.
import { isBuiltInStructureKind, registerStructureKind, structureRecipe, type StructureRecipe } from '../region/structureKinds';

export const DEEPGATE_KINDS: Readonly<Record<string, StructureRecipe>> = {
  /** The stewards' barracks; `hex/building_barracks_red` stands over it. */
  'deepgate-barracks': { height: 8, model: 'hex/building_barracks_red', collider: 'solid' },
  /** Grisel Hall's shell (the interior is a separate floating room); `hex/building_castle_red`, green. */
  'deepgate-hall': { height: 14, model: 'hex/building_castle_red', collider: 'solid' },
  /** A furnace house at a smoke stack's foot; `hex/building_blacksmith_red`, sooted. */
  'deepgate-furnace': { height: 7, model: 'hex/building_blacksmith_red', collider: 'solid' },
  /** A brazier on a stand (M16's forecourt). Procedural. */
  'deepgate-brazier': { height: 1.4, collider: 'open' },
  /** The shaft headframe: two A-frames, a sheave wheel and rope. Procedural; no collider. */
  'deepgate-headframe': { height: 14, collider: 'open' },
  /** The shaft collar: a stone ring closed by a hatch plate until the lift is built (PR 2). */
  'deepgate-collar': { height: 0.8, collider: 'solid' },
  /** A rope-and-plank catwalk raised above the ground. Decoration, no collider. */
  'deepgate-rope-bridge': { height: 3, collider: 'open' },
  /** A spoil heap. Decoration, no collider. */
  'deepgate-spoil': { height: 5, collider: 'open' },
};

let refs = 0;
let undo: Array<() => void> = [];

/** Registers every Deepgate kind (once, however many callers) and returns this caller's release. */
export function registerOldsmokeKinds(): () => void {
  if (refs === 0) {
    const done: Array<() => void> = [];
    try {
      for (const [kind, recipe] of Object.entries(DEEPGATE_KINDS)) done.push(registerStructureKind(kind, recipe));
    } catch (err) {
      for (const u of done.reverse()) u();
      throw err;
    }
    undo = done;
  }
  refs++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    refs--;
    if (refs === 0) for (const u of undo.splice(0).reverse()) u();
  };
}

export const oldsmokeKindsRegistered = (): boolean => Object.keys(DEEPGATE_KINDS).every((k) => !isBuiltInStructureKind(k) && structureRecipe(k) !== undefined);
