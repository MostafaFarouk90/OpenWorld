// The seven lower Dragonspine quests through the real quest manager and the director's installers (rig.testkit.ts): a happy path
// each, every event objective fired early and late, a save and a load at each step.
import { afterEach, describe, expect, it } from 'vitest';
import { makeRig, type Rig } from './director/rig.testkit';
import { autoplay, autoplayAll, playObjective } from './director/autoplay.testkit';
import { DRAGONSPINE_QUEST_DEFS, DRAGONSPINE_QUEST_IDS } from './dragonspine.content';
import { DRAGONSPINE_PROPS } from './props';

let rig: Rig | null = null;
afterEach(() => { rig?.dispose(); rig = null; });
const fresh = (o: Parameters<typeof makeRig>[0] = {}): Rig => (rig = makeRig({ flags: { 'story.gate.a3': true }, ...o }));
const ORDER = ['m28', 'r15', 'm29', 'r16', 'm30', 'r17', 'r18'];

describe('happy paths', () => {
  it.each(ORDER)('%s plays through to completion and writes story.%s.complete', (q) => {
    const r = fresh();
    autoplayAll(r, ORDER.slice(0, ORDER.indexOf(q) + 1));
    expect(r.qs(q)).toBe('completed');
    expect(r.flag(`story.${q}.complete`)).toBe(true);
    expect(r.flag(`story.${q}.started`)).toBe(true);
  });

  it('all seven in a row; the definitions list matches the ids', () => {
    const r = fresh();
    autoplayAll(r, ORDER);
    expect(DRAGONSPINE_QUEST_IDS).toEqual(ORDER);
    expect(DRAGONSPINE_QUEST_DEFS.every((d) => r.qs(d.id) === 'completed')).toBe(true);
  });
});

describe('event objectives fired early and late', () => {
  it.each(ORDER)('%s: nothing later is credited by an early event, and the quest still finishes', (q) => {
    const r = fresh();
    autoplayAll(r, ORDER.slice(0, ORDER.indexOf(q)));
    const def = DRAGONSPINE_QUEST_DEFS.find((d) => d.id === q)!;
    r.manager.start(q);
    let first = true;
    autoplay(r, q, {
      hook: (rr, qid, o) => {
        if (!first) return;
        first = false;
        // every later event, kill and interact objective's driver fires now (a talk would just credit the chain), while only the first is current
        for (const later of def.objectives.slice(1).filter((x) => x.type !== 'talk')) {
          try { playObjective(rr, qid, later, {}); } catch { /* a refused early action (a locked gate, a missing prop) is the right answer */ }
        }
        rr.step(40);
        rr.manager.recheck();
        for (const later of def.objectives.slice(1)) expect(rr.done(qid, later.id), `${qid}.${later.id} credited early`).toBe(false);
        expect(o.id).toBe(def.objectives[0]!.id);
      },
    });
    expect(r.qs(q)).toBe('completed');
  });
});

describe('save and load at every step', () => {
  const stepsOf = (q: string): string[] => DRAGONSPINE_QUEST_DEFS.find((d) => d.id === q)!.objectives.map((o) => o.id);
  const cases = ORDER.flatMap((q) => stepsOf(q).map((o) => [q, o] as const));

  it.each(cases)('%s at %s: a fresh world loaded from the save finishes the quest', (q, o) => {
    const a = fresh();
    autoplayAll(a, ORDER.slice(0, ORDER.indexOf(q)));
    a.manager.start(q);
    autoplay(a, q, { stopAt: [q, o] });
    expect(a.current(q, o)).toBe(true);
    const snap = a.snapshot();
    const b = makeRig();
    b.restore(snap);
    expect(b.current(q, o)).toBe(true);
    autoplay(b, q);
    expect(b.qs(q)).toBe('completed');
    expect(b.flag(`story.${q}.complete`)).toBe(true);
    b.dispose();
  });

  it.each(cases)('%s at %s: a save and load in place keeps the step and finishes', (q, o) => {
    const a = fresh();
    autoplayAll(a, ORDER.slice(0, ORDER.indexOf(q)));
    a.manager.start(q);
    autoplay(a, q, { stopAt: [q, o] });
    a.saveLoad();
    expect(a.current(q, o)).toBe(true);
    autoplay(a, q);
    expect(a.qs(q)).toBe('completed');
  });
});

describe('prop steps are also read from their used flag (a recheck after a load credits them)', () => {
  const CASES = [['m29', 'wood'], ['m29', 'fire'], ['r15', 'unload'], ['r16', 'rockfall'], ['r16', 'axe']] as const;

  it.each(CASES)('%s.%s: the prop\'s used flag is the objective\'s doneWhen', (q, o) => {
    const def = DRAGONSPINE_QUEST_DEFS.find((d) => d.id === q)!.objectives.find((x) => x.id === o)!;
    const prop = DRAGONSPINE_PROPS.find((p) => p.objective?.[0] === q && p.objective?.[1] === o)!;
    expect(prop.usedFlag).toBeTruthy();
    expect(def.doneWhen).toEqual({ flag: prop.usedFlag, equals: true });
  });

  it.each(CASES)('%s.%s: with the flag set and no interact event heard, a recheck finishes the step', (q, o) => {
    const r = fresh();
    autoplayAll(r, ORDER.slice(0, ORDER.indexOf(q)));
    r.manager.start(q);
    autoplay(r, q, { stopAt: [q, o] });
    expect(r.current(q, o)).toBe(true);
    const prop = DRAGONSPINE_PROPS.find((p) => p.objective?.[0] === q && p.objective?.[1] === o)!;
    r.state.setFlag(prop.usedFlag!, true);
    r.manager.recheck();
    expect(r.done(q, o)).toBe(true);
    autoplay(r, q);
    expect(r.qs(q)).toBe('completed');
  });
});
