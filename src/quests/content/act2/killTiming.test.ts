import { describe, expect, it } from 'vitest';
import { ACT2_QUEST_DEFS } from './index';
import { ACT2_OBJECTIVE_FLAGS } from './objectiveFlags';
import { ACT2_SPAWNERS_A12 } from './spawners';

// QuestManager credits a kill only while that objective is the current one, and these groups never respawn: a group that
// is live before its objective opens can lose kills for good.
describe('kill objectives open exactly when their group appears', () => {
  for (const q of ACT2_QUEST_DEFS) {
    q.objectives.forEach((o, i) => {
      if (o.type !== 'kill' || !o.spawnTag) return;
      const spawners = ACT2_SPAWNERS_A12.filter((s) => s.tag === o.spawnTag && s.enemy === o.target);
      const flagged = spawners.filter((s) => typeof s.activation === 'object' && s.activation !== null && 'flag' in s.activation);
      for (const s of flagged) {
        const flag = (s.activation as { flag: string }).flag;
        const rows = ACT2_OBJECTIVE_FLAGS.filter((r) => r.quest === q.id && r.flag === flag);
        // a flag the director raises (not an objective row) is checked by the director tests
        if (!rows.length) continue;
        it(`${q.id}.${o.id}: ${s.id} appears when the previous objective is done`, () => {
          const prev = q.objectives[i - 1];
          expect(rows.map((r) => r.objective)).toEqual([prev.id]);
        });
      }
    });
  }

  it('the M15 and D03 pools match their kill counts exactly, kind by kind', () => {
    const count = (tag: string, kind: string) =>
      ACT2_SPAWNERS_A12.filter((s) => s.tag === tag).reduce((n, s) => n + (s.enemy === kind ? s.count : 0), 0);
    expect(count('m15.pack', 'hunter-spearman')).toBe(6);
    expect(count('m15.pack', 'hunter-harpooner')).toBe(2);
    expect(count('d03.court', 'hunter-spearman')).toBe(6);
    expect(count('d03.court', 'hunter-harpooner')).toBe(2);
    expect(count('d03.perch', 'hunter-harpooner')).toBe(3);
  });
});
