// The Greyfen structure kinds, registered through `registerStructureKind` (v0.6 item 17), prefixed `greyfen-`. Greybox until
// Mostafa's models (assets/environment-needs-prompts.md, section G). Refcounted like the Cinderreach kinds, so a double setup
// (or a test beside the real plugin) cannot throw. Jetties and the M23 bridges use the built-in `bridge` kind (a plank deck
// over water, exempt from the flat-site rule); the Greywatch ladders are built-in `stair-step` runs.
import { isBuiltInStructureKind, registerStructureKind, structureRecipe, type StructureRecipe } from '../region/structureKinds';

export const GREYFEN_KINDS: Readonly<Record<string, StructureRecipe>> = {
  /** A reed-thatched house on short stilts (Reedgate). */
  'greyfen-stilt-house': { height: 6, collider: 'solid' },
  /** Plank walkways and decks laid on the ground: decoration, no collider. */
  'greyfen-plank-walk': { height: 0.15, collider: 'open' },
  /** A boathouse at a ferry landing. */
  'greyfen-boathouse': { height: 4, collider: 'solid' },
  /** A ranger post platform on stilt legs, 4 m up (Greywatch). */
  'greyfen-ranger-platform': { height: 4, collider: 'solid' },
  /** A reed bed, lush or charred (R12): decoration over wading water. */
  'greyfen-reed-bed': { height: 2.2, collider: 'open' },
  'greyfen-reed-bed-charred': { height: 0.6, collider: 'open' },
  /** The R14 stocks by the Greywatch waystone. */
  'greyfen-stocks': { height: 1.4, collider: 'solid' },
  /** Gytha's stilted hut (M25) and its herb beds. */
  'greyfen-stilt-hut': { height: 5, collider: 'solid' },
  'greyfen-herb-bed': { height: 0.5, collider: 'open' },
  /** Ruined fronts of the drowned chapel and the drowned monastery, and the chapel's bell tower stump. */
  'greyfen-chapel-ruin': { height: 7, collider: 'solid' },
  'greyfen-bell-tower': { height: 9, collider: 'solid' },
  'greyfen-monastery-ruin': { height: 6, collider: 'solid' },
  /** A causeway way-marker post and a mooring post. */
  'greyfen-marker': { height: 1.6, collider: 'solid' },
};

let refs = 0;
let undo: Array<() => void> = [];

/** Registers every Greyfen kind (once, however many callers) and returns this caller's release. */
export function registerGreyfenKinds(): () => void {
  if (refs === 0) {
    const done: Array<() => void> = [];
    try {
      for (const [kind, recipe] of Object.entries(GREYFEN_KINDS)) done.push(registerStructureKind(kind, recipe));
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

export const greyfenKindsRegistered = (): boolean => Object.keys(GREYFEN_KINDS).every((k) => !isBuiltInStructureKind(k) && structureRecipe(k) !== undefined);
