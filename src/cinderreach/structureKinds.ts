// The Cinderreach structure kinds, registered through A0's `registerStructureKind` (v0.6 item 17). Prefixed `cinder-` so A2's
// `poi-*` kinds and A4's kit never collide. Registration is refcounted: every plugin setup takes a reference and only the last
// release removes the kinds, so a double setup (or a test next to the real plugin) cannot throw.
import { isBuiltInStructureKind, registerStructureKind, structureRecipe, type StructureRecipe } from '../region/structureKinds';

export const CINDER_KINDS: Readonly<Record<string, StructureRecipe>> = {
  /** A hunters' tent; `hex/tent` stands over it once loaded. */
  'cinder-tent': { height: 3.2, model: 'hex/tent', collider: 'solid' },
  /** A procedural cage: cylinder bars on a plank floor. Its mode is solid (a closed cage blocks). */
  'cinder-cage': { height: 2.4, collider: 'solid' },
  /** The brothers' cairn in Stonefold's hall yard (M13 search). */
  'cinder-cairn': { height: 1.4, collider: 'solid' },
  'cinder-rune-stone': { height: 2.4, collider: 'solid' },
  /** The brothers' round shield on its stand (M13 search). */
  'cinder-shield': { height: 1.6, collider: 'solid' },
  /** The 16 m trial ring: a ground circle of laid stones, no collider. */
  'cinder-trial-ring': { height: 0.2, collider: 'open' },
  /** A hunters' ledger desk (M15 and D03 search). */
  'cinder-ledger-desk': { height: 1.1, collider: 'solid' },
  /** A blightbloom: glowing blighted flowers and a ground stain, no collider. */
  'cinder-blightbloom': { height: 0.8, collider: 'open' },
  /** Planks over Cinderford's well (R06 sealed). Not in the layout: the plugin toggles it. */
  'cinder-boarded-well': { height: 1.5, collider: 'solid' },
  /** The shut Scorchhold gate (D03 until the charges are set). Not in the layout: the plugin toggles it. */
  'cinder-fort-gate': { height: 8, collider: 'solid' },
  /** A small marker stone (the resting wyrm's den after R11 spared). Toggled by the plugin. */
  'cinder-marker': { height: 0.5, collider: 'open' },
};

let refs = 0;
let undo: Array<() => void> = [];

/** Registers every Cinderreach kind (once, however many callers) and returns this caller's release. */
export function registerCinderKinds(): () => void {
  if (refs === 0) {
    const done: Array<() => void> = [];
    try {
      for (const [kind, recipe] of Object.entries(CINDER_KINDS)) done.push(registerStructureKind(kind, recipe));
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

export const cinderKindsRegistered = (): boolean => Object.keys(CINDER_KINDS).every((k) => !isBuiltInStructureKind(k) && structureRecipe(k) !== undefined);
