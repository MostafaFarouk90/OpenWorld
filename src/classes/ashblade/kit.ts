import { DEFAULT_KITS } from '../kits';
import type { ClassKit, DrillStepDef } from '../types';
import { DEFAULT_DRILL } from '../kits';

/** Gerta's drill: the default eight steps with the Ashblade's own lines (`classes.drill.ashblade.<step>`). */
export const ASHBLADE_DRILL: readonly DrillStepDef[] = DEFAULT_DRILL.map((s) => ({ ...s, textKey: `classes.drill.ashblade.${s.id}` }));

/**
 * The default Ashblade kit of thread 12 (Rogue model, `Knife` main hand, `Knife_Offhand` visual, Gerta, the alley knives)
 * plus the drill. Starter items stay thread 12's.
 */
export const ASHBLADE_KIT: ClassKit = { ...DEFAULT_KITS.ashblade, drill: ASHBLADE_DRILL };
