// The Rim quests' unlock graph is N0's ACT5_DIRECT, the real QuestManager refuses each quest until its prerequisite is done, every
// step's text key resolves, and the prefixes and rewards hold (plan 2.1; M47 opens on the Act 5 gate, not on a talk).
import { afterEach, describe, expect, it } from 'vitest';
import { ACT5_DIRECT } from '../../../act5Jump';
import type { Condition } from '../../../types';
import { questStrings } from '../../../strings.en';
import { RIM_A5_QUEST_DEFS } from './rim.content';
import { makeRig, type Rig } from './director/rig.testkit';

function prereqs(c: Condition | undefined, out: string[] = []): string[] {
  if (!c) return out;
  const x = c as { quest?: string; state?: string; all?: Condition[]; flag?: string };
  if (x.all) for (const y of x.all) prereqs(y, out);
  else if (x.quest && x.state === 'completed') out.push(x.quest);
  else if (!x.flag) throw new Error(`unexpected startWhen shape ${JSON.stringify(c)}`);
  return out;
}

let r: Rig | undefined;
afterEach(() => { r?.dispose(); r = undefined; });

describe('the Rim unlock graph', () => {
  it('each quest\'s startWhen names exactly its direct prerequisites; M47 waits on the Act 5 gate', () => {
    for (const q of RIM_A5_QUEST_DEFS) expect(prereqs(q.startWhen).sort(), q.id).toEqual([...ACT5_DIRECT[q.id]!].sort());
    expect(RIM_A5_QUEST_DEFS[0]!.startWhen).toEqual({ flag: 'story.gate.a5', equals: true });
  });

  it('each quest is refused until its prerequisites are done, then starts', () => {
    for (const q of RIM_A5_QUEST_DEFS.slice(1)) {
      r = makeRig({ flags: { 'story.gate.a5': true } });
      const chain = ['m47', 'm48', 'm49'].filter((id) => id !== q.id && (q.id !== 'm48' || id === 'm47') && (q.id !== 'm49' || id !== 'm49'));
      const need = ACT5_DIRECT[q.id]![0]!;
      r.complete(...chain.filter((id) => id !== need && chain.indexOf(id) < chain.indexOf(need)));
      expect(r.manager.start(q.id), `${q.id} before ${need}`).toBe(false);
      r.complete(need);
      expect(r.manager.start(q.id), q.id).toBe(true);
      r.dispose(); r = undefined;
    }
  });

  it('M47 is refused before the Act 5 gate', () => {
    r = makeRig();
    expect(r.manager.start('m47')).toBe(false);
  });
});

describe('the definitions', () => {
  it('every title, summary and step text resolves; objective ids are unique within a quest; every quest pays out', () => {
    for (const q of RIM_A5_QUEST_DEFS) {
      for (const k of [q.titleKey, q.summaryKey, ...q.objectives.map((o) => o.textKey)]) expect(k in questStrings, `${q.id} ${k}`).toBe(true);
      const ids = q.objectives.map((o) => o.id);
      expect(new Set(ids).size, q.id).toBe(ids.length);
      const xp = (q.rewards ?? []).map((e) => (e as { xp?: number }).xp ?? 0).reduce((a, b) => a + b, 0);
      expect(xp > 0, q.id).toBe(true);
      expect((q.rewards ?? []).some((e) => "give" in (e as object)), q.id).toBe(true);
    }
  });
});
