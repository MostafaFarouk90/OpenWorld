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
  it('has a row for every Phase D quest', () => {
    expect(Object.keys(ACT2D_PREREQS).sort()).toEqual([...OLDSMOKE_QUEST_DEFS.map((q) => q.id)].sort());
  });
  it('is transitive: every listed quest\'s own row is inside the row, and rows follow play order', () => {
    const order = OLDSMOKE_QUEST_DEFS.map((q) => q.id);
    for (const [id, row] of Object.entries(ACT2D_PREREQS)) {
      for (const q of row) {
        const sub = ACT2D_PREREQS[q];
        if (sub) for (const p of sub) expect(row.includes(p), `${id} lists ${q} but not ${p}`).toBe(true);
        expect(row.indexOf(q), `${id}: ${q}`).toBeGreaterThanOrEqual(0);
      }
      const dRow = row.filter((q) => order.includes(q));
      expect(dRow, id).toEqual([...dRow].sort((a, b) => order.indexOf(a) - order.indexOf(b)));
    }
  });
  it('the mines chain: each quest waits on its predecessor, siblings are not required', () => {
    const d = (id: string) => ACT2D_PREREQS[id].filter((q) => OLDSMOKE_QUEST_DEFS.some((x) => x.id === q));
    expect(d('m17')).toEqual(['m16']);
    expect(d('r08')).toEqual(['m16', 'm17']);
    expect(d('m18')).toEqual(['m16', 'm17']);
    expect(d('r10')).toEqual(['m16', 'm17']);
    expect(d('m19')).toEqual(['m16', 'm17', 'm18']);
    expect(d('m20')).toEqual(['m16', 'm17', 'm18', 'm19']);
    expect(d('m21')).toEqual(['m16', 'm17', 'm18', 'm19', 'm20']);
    expect(d('d04')).toEqual(['m16', 'm17', 'm18', 'm19', 'm20']);
    for (const id of ['r08', 'm18', 'r10', 'm19', 'm20', 'm21', 'd04']) expect(d(id)).not.toContain('r09');
  });
  it('M22 lists all of Phase C, d03 and every other Phase D quest, in play order', () => {
    const row = ACT2D_PREREQS.m22;
    for (const q of [...ACT2_PREREQS.d03, 'd03', ...OLDSMOKE_QUEST_DEFS.map((x) => x.id).filter((x) => x !== 'm22')]) expect(row, q).toContain(q);
    expect(row.slice(-10)).toEqual(['m16', 'm17', 'r09', 'r08', 'm18', 'r10', 'm19', 'm20', 'm21', 'd04']);
  });
});
