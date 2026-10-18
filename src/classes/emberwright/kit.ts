import { DEFAULT_DRILL, DEFAULT_KITS } from '../kits';
import type { ClassKit, DrillStepDef } from '../types';

const COUNTS: Record<string, number> = { attack1: 4, attack2: 3, attack3: 2, attack4: 2 };

/** The default drill with the Emberwright's own counts and prompts; the runner skips the skill and ability steps when nothing can be bought or is on the bar. */
export const EMBERWRIGHT_DRILL: readonly DrillStepDef[] = DEFAULT_DRILL.map((s) => {
  const own = COUNTS[s.id];
  return own === undefined ? s : { ...s, count: own, textKey: `classes.drill.emberwright.${s.id}` };
});

/** Mage model, the staff in the main hand and the closed spellbook as the off-hand visual; the trainer and starter gear stay thread 12's. */
export const EMBERWRIGHT_KIT: ClassKit = {
  ...DEFAULT_KITS.emberwright,
  offhandVisual: { embedded: 'Spellbook' },
  drill: EMBERWRIGHT_DRILL,
};
