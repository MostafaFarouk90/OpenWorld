// The Waste quests' unlock graph is plan 2.5's (ACT4_DIRECT), and the real QuestManager refuses each quest until every direct
// prerequisite is done: M46 waits on all seven (Q12), however far the others have got.
import { afterEach, describe, expect, it } from 'vitest';
import { ACT4_DIRECT } from '../../../act4Jump';
import type { Condition } from '../../../types';
import { HARROWMARK_A4_QUEST_IDS } from '../harrowmark/harrowmark.content';
import { WASTE_A4_QUEST_DEFS } from './waste.content';
import { makeRig, type Rig } from './director/rig.testkit';

function prereqs(c: Condition | undefined, out: string[] = []): string[] {
  if (!c) return out;
  const x = c as { quest?: string; state?: string; all?: Condition[] };
  if (x.all) for (const y of x.all) prereqs(y, out);
  else if (x.quest && x.state === 'completed') out.push(x.quest);
  else throw new Error(`unexpected startWhen shape ${JSON.stringify(c)}`);
  return out;
}

let r: Rig | undefined;
afterEach(() => { r?.dispose(); r = undefined; });

describe('the Waste unlock graph', () => {
  it('each quest\'s startWhen names exactly its direct prerequisites in ACT4_DIRECT', () => {
    for (const q of WASTE_A4_QUEST_DEFS) expect(prereqs(q.startWhen).sort(), q.id).toEqual([...ACT4_DIRECT[q.id]!].sort());
  });

  it('each quest is refused until its last prerequisite is done, then starts', () => {
    for (const q of WASTE_A4_QUEST_DEFS) {
      r = makeRig();
      r.complete(...HARROWMARK_A4_QUEST_IDS);
      const needs = ACT4_DIRECT[q.id]!;
      // every other Waste prerequisite, in graph order, short of the last direct one
      const order = ['m42', 'm43', 'm44', 'r24', 'd08', 'r25', 'm45'];
      const closure = (id: string, s = new Set<string>()): Set<string> => { for (const d of ACT4_DIRECT[id] ?? []) { s.add(d); closure(d, s); } return s; };
      const all = order.filter((id) => closure(q.id).has(id));
      const last = needs[needs.length - 1]!;
      if (all.length) {
        r.complete(...all.filter((id) => id !== last));
        expect(r.manager.start(q.id), `${q.id} before ${last}`).toBe(false);
        r.complete(last);
      }
      expect(r.manager.start(q.id), q.id).toBe(true);
      r.dispose(); r = undefined;
    }
  });

  it('M46 is refused with six of its seven done, whichever one is missing', () => {
    const seven = ACT4_DIRECT.m46!;
    for (const missing of seven) {
      r = makeRig();
      r.complete(...HARROWMARK_A4_QUEST_IDS);
      const rest = ['m42', 'm43', 'm44', 'r24', 'd08', 'r25', 'm45'].filter((id) => id !== missing);
      // a quest whose own prerequisite is the missing one cannot be completed either; that only makes M46 more refused
      for (const id of rest) { r.manager.start(id); r.manager.complete(id); }
      expect(r.manager.start('m46'), `without ${missing}`).toBe(false);
      r.dispose(); r = undefined;
    }
  });
});
