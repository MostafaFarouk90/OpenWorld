import { describe, expect, it } from 'vitest';
import { ACT2_PREREQS } from '../../../actJump';
import { ACT2D_PREREQS } from './prereqs';
import { OLDSMOKE_QUEST_DEFS } from './index';

describe('Phase D jump prerequisites', () => {
  it('each row is transitive: everything the quest\'s own startWhen names is in its row, with its own prerequisites', () => {
    for (const [id, row] of Object.entries(ACT2D_PREREQS)) {
      const def = OLDSMOKE_QUEST_DEFS.find((q) => q.id === id)!;
      expect(def, id).toBeDefined();
      const sw = JSON.stringify(def.startWhen);
      for (const q of row) if (sw.includes(`"${q}"`)) expect(row.includes(q), `${id} lists ${q}`).toBe(true);
      expect(new Set(row).size, id).toBe(row.length);
      expect(row).not.toContain(id);
    }
  });
  it('lists every Phase C prerequisite of D03 before the Phase D quests, in play order', () => {
    for (const row of Object.values(ACT2D_PREREQS)) {
      for (const q of ACT2_PREREQS.d03) expect(row.indexOf(q)).toBeGreaterThanOrEqual(0);
      expect(row.indexOf('d03')).toBeGreaterThan(row.indexOf('m15'));
    }
    expect(ACT2D_PREREQS.r09.indexOf('m16')).toBeGreaterThan(ACT2D_PREREQS.r09.indexOf('d03'));
  });
  it('leaves the Phase C table alone', () => {
    expect(Object.keys(ACT2_PREREQS)).toEqual(['m11', 'm12', 'r06', 'r05', 'm13', 'r07', 'r11', 'm14', 'm15', 'd03']);
  });
});
