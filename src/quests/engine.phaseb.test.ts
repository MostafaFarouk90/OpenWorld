import { describe, it, expect } from 'vitest';
import { createEffectRunner } from './effects';
import { evalCondition } from './conditions';
import { creditFor } from './objectives';
import { makeWorld } from './testKit';
import { validateEffects, validateQuest } from './validate';
import { DialogueRunner } from '../dialogue/DialogueRunner';
import type { Effect, ObjectiveDef, QuestDef } from './types';

function runner(gold = 0, over: Record<string, unknown> = {}) {
  const w = makeWorld();
  w.gold.n = gold;
  const run = createEffectRunner({
    state: w.state, quests: w.manager, bus: w.bus, sourceId: 'quest:test', warn: (m) => w.warns.push(m),
    inventory: () => ({
      remove: () => true, addGold: (n) => { w.gold.n += n; }, get gold() { return w.gold.n; },
      takeGold: (n, reason) => { const t = Math.min(w.gold.n, Math.floor(n)); w.gold.n -= t; w.spent.push({ amount: t, reason }); return t; },
    }),
    ...over,
  });
  return { w, run };
}

describe('gold condition', () => {
  const env = (n: number | undefined) => { const w = makeWorld(); return { state: w.state, quests: w.manager, gold: () => n, warn: (m: string) => w.warns.push(m) }; };
  it.each([[24, false], [25, true], [26, true]])('atLeast 25 with %i gold is %s', (n, want) => {
    expect(evalCondition({ gold: { atLeast: 25 } }, env(n))).toBe(want);
  });
  it('is false (with a warning) when no inventory is readable', () => {
    const e = env(undefined);
    expect(evalCondition({ gold: { atLeast: 0 } }, e)).toBe(false);
    expect(evalCondition({ not: { gold: { atLeast: 0 } } }, e)).toBe(false); // an error stays an error under not
  });
  it('rejects a malformed amount', () => {
    expect(evalCondition({ gold: { atLeast: 'x' } } as any, env(5))).toBe(false);
  });
  it('reads gold inside an if effect', () => {
    const { w, run } = runner(30);
    run.run([{ if: { gold: { atLeast: 30 } }, then: [{ setFlag: 'a.hit', value: true }], else: [{ setFlag: 'a.miss', value: true }] }]);
    expect(w.flags.get('a.hit')).toBe(true);
    expect(w.flags.has('a.miss')).toBe(false);
  });
  it('reads gold through the quest manager for objective startWhen and quest startWhen', () => {
    const q: QuestDef = {
      id: 'q', titleKey: 't', summaryKey: 's', startWhen: { gold: { atLeast: 10 } },
      objectives: [{ id: 'o1', type: 'event', textKey: 'k', target: 'x.y', startWhen: { gold: { atLeast: 20 } } }],
    };
    const w = makeWorld([q]);
    expect(w.manager.start('q')).toBe(false);
    w.gold.n = 10;
    expect(w.manager.start('q')).toBe(true);
    w.bus.emit('x.y', {});
    expect(w.manager.objectiveDone('q', 'o1')).toBe(false); // startWhen not holding: ignored
    w.gold.n = 20;
    w.bus.emit('x.y', {});
    expect(w.manager.objectiveDone('q', 'o1')).toBe(true);
  });
});

describe('spendGold', () => {
  const spend = (amount: number): Effect => ({ spendGold: { amount, reason: 'bribe' } });
  it('spends exactly the balance and emits through the inventory', () => {
    const { w, run } = runner(50);
    const res = run.run([spend(50), { setFlag: 'a.after', value: true }]);
    expect(res.map((r) => r.ok)).toEqual([true, true]);
    expect(w.gold.n).toBe(0);
    expect(w.spent).toEqual([{ amount: 50, reason: 'bribe' }]);
  });
  it('at n-1 gold leaves the gold untouched and halts the whole list', () => {
    const { w, run } = runner(49);
    const res = run.run([spend(50), { setFlag: 'a.after', value: true }]);
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({ ok: false, halted: true });
    expect(w.gold.n).toBe(49);
    expect(w.spent).toEqual([]);
    expect(w.flags.has('a.after')).toBe(false);
  });
  it('a halt inside a nested if also stops the outer list', () => {
    const { w, run } = runner(0);
    const res = run.run([
      { if: { all: [] }, then: [spend(5), { setFlag: 'a.inner', value: true }] },
      { setFlag: 'a.outer', value: true },
    ]);
    expect(res).toHaveLength(1);
    expect(res[0].halted).toBe(true);
    expect(w.flags.size).toBe(0);
  });
  it('halts when the inventory service is absent', () => {
    const { w, run } = runner(10, { inventory: () => undefined });
    expect(run.run([spend(5), { setFlag: 'a.after', value: true }])[0].halted).toBe(true);
    expect(w.flags.size).toBe(0);
  });
  it('halts when the take comes back short', () => {
    const { w, run } = runner(10, { inventory: () => ({ remove: () => true, gold: 10, takeGold: () => 3 }) });
    expect(run.run([spend(5), { setFlag: 'a.after', value: true }])[0].halted).toBe(true);
    expect(w.flags.size).toBe(0);
  });
  it.each([0, -1, 2.5, NaN])('a malformed amount %s halts, so nothing after it runs unpaid', (n) => {
    const { w, run } = runner(100);
    const res = run.run([spend(n), { setFlag: 'a.after', value: true }]);
    expect(res[0]).toMatchObject({ ok: false, halted: true });
    expect(w.flags.has('a.after')).toBe(false);
    expect(w.gold.n).toBe(100);
  });
  it('validates the shape', () => {
    expect(validateEffects([spend(5)])).toEqual([]);
    expect(validateEffects([{ spendGold: { amount: 0, reason: 'bribe' } } as any, { spendGold: { amount: 5 } } as any])).toHaveLength(2);
  });
});

describe('dialogue with a halted spend', () => {
  it('stays on the node instead of following next, and the choice disappears once the gold condition fails', () => {
    const w = makeWorld();
    w.gold.n = 60; // enough for the condition, then the take is rigged short
    const effects = createEffectRunner({
      state: w.state, quests: w.manager, bus: w.bus, sourceId: 'dialogue',
      inventory: () => ({ remove: () => true, get gold() { return w.gold.n; }, takeGold: () => 0 }),
    });
    const strings = { t: (k: string) => k, has: () => true };
    const d = new DialogueRunner({ bus: w.bus, state: w.state, quests: w.manager, effects, strings, gold: () => w.gold.n });
    d.register({
      id: 'd', start: 'a',
      nodes: [
        { id: 'a', speaker: 'rook', textKey: 'k', choices: [
          { id: 'pay', textKey: 'k', when: { gold: { atLeast: 50 } }, effects: [{ spendGold: { amount: 50, reason: 'bribe' } }], next: 'paid' },
          { id: 'leave', textKey: 'k', next: null },
        ] },
        { id: 'paid', speaker: 'rook', textKey: 'k', next: null },
      ],
    });
    d.start('d', 'rook');
    expect(d.view()!.choices).toHaveLength(2);
    d.choose(1);
    expect(d.view()!.nodeId).toBe('a'); // did not advance to "paid"
    w.gold.n = 10; // now the condition fails and the choice is gone
    d.choose(2);
    expect(d.isOpen).toBe(false);
  });
});

describe('array match values', () => {
  const def = (match: ObjectiveDef['match']): ObjectiveDef => ({ id: 'o', type: 'event', textKey: 'k', target: 'interact', match });
  const ctx = { playerId: 'p' };
  it('accepts any listed value', () => {
    const d = def({ interactableId: ['use:a', 'use:b'] });
    expect(creditFor(d, 'interact', { interactableId: 'use:b' }, ctx)).toEqual({ amount: 1 });
    expect(creditFor(d, 'interact', { interactableId: 'use:c' }, ctx)).toBeNull();
  });
  it('an empty list matches nothing, and mixes with scalar keys', () => {
    expect(creditFor(def({ interactableId: [] }), 'interact', { interactableId: 'use:a' }, ctx)).toBeNull();
    const d = def({ interactableId: ['use:a'], action: 'use' });
    expect(creditFor(d, 'interact', { interactableId: 'use:a', action: 'use' }, ctx)).toEqual({ amount: 1 });
    expect(creditFor(d, 'interact', { interactableId: 'use:a', action: 'look' }, ctx)).toBeNull();
  });
  it('three invoices out of order, a repeat and a stranger count to exactly three', () => {
    const q: QuestDef = { id: 'q', titleKey: 't', summaryKey: 's', objectives: [
      { id: 'o1', type: 'event', textKey: 'k', target: 'interact', required: 3, dedupeBy: 'interactableId', match: { interactableId: ['use:i1', 'use:i2', 'use:i3'] } },
    ] };
    const w = makeWorld([q]);
    w.manager.start('q');
    for (const id of ['use:i3', 'use:i3', 'use:zz', 'use:i1']) w.bus.emit('interact', { interactableId: id });
    expect(w.manager.objectiveDone('q', 'o1')).toBe(false);
    w.bus.emit('interact', { interactableId: 'use:i2' });
    expect(w.manager.state('q')).toBe('completed');
  });
  it('validator accepts lists, rejects empty or non-primitive ones', () => {
    const base = { id: 'q', titleKey: 't', summaryKey: 's' };
    const mk = (match: any): QuestDef => ({ ...base, objectives: [{ id: 'o', type: 'event', textKey: 't', target: 'a.b', match }] });
    expect(validateQuest(mk({ k: ['a', 'b'] }), () => true)).toEqual([]);
    expect(validateQuest(mk({ k: [] }), () => true)).toHaveLength(1);
    expect(validateQuest(mk({ k: [{}] }), () => true)).toHaveLength(1);
  });
});
