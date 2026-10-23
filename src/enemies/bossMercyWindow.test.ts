import { describe, expect, it } from 'vitest';
import { GRIMTOOTH_BOSS_DEF } from '../bosses/grimtooth/GrimtoothEncounter';
import { PRIOR_BOSS_DEF } from '../bosses/prior/PriorEncounter';
import { REDMANE_BOSS_DEF } from '../bosses/redmane/RedmaneEncounter';
import { BOSS_MERCY } from './tuning';

describe('BOSS_MERCY bosses', () => {
  it('every mercy boss def has a release window > 0 (0 = no window would make the mercy unreachable)', () => {
    const defs = [PRIOR_BOSS_DEF, GRIMTOOTH_BOSS_DEF, REDMANE_BOSS_DEF];
    for (const id of Object.keys(BOSS_MERCY)) {
      const def = defs.find((d) => d.bossId === id);
      expect(def, `a def for ${id}`).toBeDefined();
      expect(def!.releaseWindowSeconds ?? 4).toBeGreaterThan(0);
    }
  });
});
