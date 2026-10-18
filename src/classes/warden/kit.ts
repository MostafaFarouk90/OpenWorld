import type { ClassKit, DrillStepDef } from '../types';
import { DEFAULT_KITS, DRILL_SPARS } from '../kits';

/** Stane's drill: the Warden's swings are slow, so each key needs fewer successes than the default drill asks. */
export const WARDEN_DRILL: readonly DrillStepDef[] = [
  { id: 'attack1', mechanic: 'attack1', action: 'attack1', count: 2 },
  { id: 'attack2', mechanic: 'attack2', action: 'attack2', count: 2 },
  { id: 'attack3', mechanic: 'attack3', action: 'attack3', count: 2 },
  { id: 'attack4', mechanic: 'attack4', action: 'attack4', count: 1 },
  { id: 'block', mechanic: 'block', action: 'block', count: 2, spar: DRILL_SPARS.blocker },
  { id: 'dodge', mechanic: 'dodge', action: 'dodge', count: 3, spar: DRILL_SPARS.dodge },
  { id: 'skills', mechanic: 'skills', action: 'skills', count: 1 },
  // A fresh Warden has no active to slot (the only tier 1 or 2 active costs two points), so the classes service skips this step.
  { id: 'ability', mechanic: 'ability', action: 'ability1', count: 1 },
];

/** Barbarian model, two-handed axe built into the glb, trainer Stane, thread 12's starter set; only the drill is the Warden's own. */
export const WARDEN_KIT: ClassKit = { ...DEFAULT_KITS.warden, drill: WARDEN_DRILL };
