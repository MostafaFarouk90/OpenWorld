import { describe, it, expect } from 'vitest';
import { makeWorld } from './testKit';
import { creditFor, eventNames } from './objectives';
import { validateQuest } from './validate';
import type { ObjectiveDef, QuestDef } from './types';

const ev = (extra: Partial<ObjectiveDef> & { target: string | string[] }): ObjectiveDef => ({ id: 'o1', type: 'event', textKey: 'k', ...extra });
const quest = (objs: ObjectiveDef[], extra: Partial<QuestDef> = {}): QuestDef => ({ id: 'q', titleKey: 't', summaryKey: 's', objectives: objs, ...extra });
const ctx = { playerId: 'p' };

describe('creditFor event objectives', () => {
  it('matches the name and every match key strictly', () => {
    const d = ev({ target: 'a.b', match: { id: 'x', n: 1 } });
    expect(creditFor(d, 'a.b', { id: 'x', n: 1, more: true }, ctx)).toEqual({ amount: 1 });
    expect(creditFor(d, 'a.b', { id: 'x', n: '1' }, ctx)).toBeNull();
    expect(creditFor(d, 'a.b', { id: 'y', n: 1 }, ctx)).toBeNull();
    expect(creditFor(d, 'a.c', { id: 'x', n: 1 }, ctx)).toBeNull();
  });
  it('a missing, null or primitive payload fails a match but passes without one', () => {
    expect(creditFor(ev({ target: 'a', match: { id: 'x' } }), 'a', undefined, ctx)).toBeNull();
    expect(creditFor(ev({ target: 'a', match: { id: 'x' } }), 'a', 'x', ctx)).toBeNull();
    expect(creditFor(ev({ target: 'a' }), 'a', undefined, ctx)).toEqual({ amount: 1 });
    expect(creditFor(ev({ target: 'a' }), 'a', null, ctx)).toEqual({ amount: 1 });
  });
  it('an array target means any of the names', () => {
    const d = ev({ target: ['x', 'y'] });
    expect(creditFor(d, 'x', {}, ctx)).toEqual({ amount: 1 });
    expect(creditFor(d, 'y', {}, ctx)).toEqual({ amount: 1 });
    expect(creditFor(d, 'z', {}, ctx)).toBeNull();
    expect(eventNames(d)).toEqual(['x', 'y']);
  });
  it('dedupeBy needs a string payload key', () => {
    const d = ev({ target: 'a', dedupeBy: 'sid' });
    expect(creditFor(d, 'a', { sid: 's1' }, ctx)).toEqual({ amount: 1, dedupeKey: 's1' });
    expect(creditFor(d, 'a', { sid: 3 }, ctx)).toBeNull();
    expect(creditFor(d, 'a', {}, ctx)).toBeNull();
  });
});

describe('event objectives in the manager', () => {
  it('counts matching events up to required and completes the quest', () => {
    const w = makeWorld([quest([ev({ target: 'dummy.parried', required: 3 })])]);
    w.manager.start('q');
    w.bus.emit('dummy.parried', {});
    w.bus.emit('dummy.parried', {});
    expect(w.manager.state('q')).toBe('active');
    w.bus.emit('dummy.parried', {});
    w.bus.emit('dummy.parried', {}); // beyond required, quest already completed
    expect(w.manager.state('q')).toBe('completed');
  });
  it('ignores events before the quest starts and while another objective is current', () => {
    const w = makeWorld([quest([
      { id: 'o0', type: 'goTo', target: 't', textKey: 'k' },
      ev({ id: 'o1', target: 'boom' }),
    ], { sequential: true })]);
    w.bus.emit('boom', {});
    w.manager.start('q');
    w.bus.emit('boom', {});
    expect(w.manager.objectiveDone('q', 'o1')).toBe(false);
    w.bus.emit('trigger.enter', { triggerId: 't', actorId: 'p' });
    w.bus.emit('boom', {});
    expect(w.manager.state('q')).toBe('completed');
  });
  it('dedupeBy credits each distinct id once', () => {
    const w = makeWorld([quest([ev({ target: 'scarecrow.cleared', required: 3, dedupeBy: 'scarecrowId' })])]);
    w.manager.start('q');
    for (const id of ['a', 'a', 'b', 'a', 'b']) w.bus.emit('scarecrow.cleared', { scarecrowId: id });
    expect(w.manager.objectives('q')[0].progress).toBe(2);
    w.bus.emit('scarecrow.cleared', { scarecrowId: 'c' });
    expect(w.manager.state('q')).toBe('completed');
  });
  it('both boss events in one tick credit once', () => {
    const w = makeWorld([quest([
      ev({ target: ['boss.defeated', 'boss.released'], match: { bossId: 'ashen-prior' } }),
      { id: 'o2', type: 'talk', target: 'aelfreda', textKey: 'k' },
    ], { sequential: true })]);
    w.manager.start('q');
    w.bus.emit('boss.released', { bossId: 'ashen-prior' });
    w.bus.emit('boss.defeated', { bossId: 'ashen-prior' });
    expect(w.manager.objectives('q')[0].progress).toBe(1);
    expect(w.manager.state('q')).toBe('active');
  });
  it('a wrong boss id does not credit', () => {
    const w = makeWorld([quest([ev({ target: ['boss.defeated', 'boss.released'], match: { bossId: 'ashen-prior' } })])]);
    w.manager.start('q');
    w.bus.emit('boss.defeated', { bossId: 'grimtooth' });
    expect(w.manager.state('q')).toBe('active');
  });
  it('subscribes once per event name, also when it is in OBJECTIVE_EVENTS', () => {
    const w = makeWorld([
      quest([ev({ target: 'mercy' })]),
      { ...quest([ev({ target: 'custom.thing' })]), id: 'q2' },
      { ...quest([ev({ target: 'custom.thing' })]), id: 'q3' },
    ]);
    expect(w.bus.listeners('mercy')).toBe(1);
    expect(w.bus.listeners('custom.thing')).toBe(1);
    w.manager.dispose();
    expect(w.bus.listeners('custom.thing')).toBe(0);
  });
  it('survives a payload that throws in match access', () => {
    const w = makeWorld([quest([ev({ target: 'a', match: { x: 1 } })])]);
    w.manager.start('q');
    const bad = new Proxy({}, { get() { throw new Error('boom'); } });
    expect(() => w.bus.emit('a', bad)).not.toThrow();
    expect(w.manager.state('q')).toBe('active');
  });
});

describe('doneWhen', () => {
  const def = quest([
    { id: 'o0', type: 'talk', target: 'npc', textKey: 'k' },
    ev({ id: 'o1', target: 'late.event', doneWhen: { flag: 'world.done' } }),
    { id: 'o2', type: 'talk', target: 'npc', textKey: 'k' },
  ], { sequential: true });

  it('credits when the objective becomes current and the world already holds', () => {
    const w = makeWorld([def]);
    w.manager.start('q');
    w.flags.set('world.done', true); // the event fired before the objective was current and was missed
    w.bus.emit('dialogue.ended', { npcId: 'npc', reason: 'completed' });
    expect(w.manager.objectiveDone('q', 'o1')).toBe(true);
    expect(w.manager.isObjectiveCurrent('q', 'o2')).toBe(true);
  });
  it('does not credit while the condition is false, and the event still works', () => {
    const w = makeWorld([def]);
    w.manager.start('q');
    w.bus.emit('dialogue.ended', { npcId: 'npc', reason: 'completed' });
    expect(w.manager.objectiveDone('q', 'o1')).toBe(false);
    w.bus.emit('late.event', {});
    expect(w.manager.objectiveDone('q', 'o1')).toBe(true);
  });
  it('credits at start when it is the first objective, and again after a load', () => {
    const first = quest([ev({ target: 'x', doneWhen: { flag: 'k.on' } }), { id: 'o2', type: 'talk', target: 'n', textKey: 'k' }], { sequential: true });
    const w = makeWorld([first]);
    w.flags.set('k.on', true);
    w.manager.start('q');
    expect(w.manager.objectiveDone('q', 'o1')).toBe(true);
    const saved = JSON.parse(JSON.stringify({ quests: { q: { state: 'active', objectives: {} } } }));
    w.manager.load(saved);
    w.manager.recheck(); // the plugin calls this on save.loaded, after the world state loaded
    expect(w.manager.objectiveDone('q', 'o1')).toBe(true);
  });
  it('a condition that errors counts as not done', () => {
    const w = makeWorld([quest([ev({ target: 'x', doneWhen: { bogus: 1 } as any })])]);
    w.manager.start('q');
    expect(w.manager.state('q')).toBe('active');
  });
});

describe('startWhen', () => {
  const gated = quest([{ id: 'o1', type: 'talk', target: 'n', textKey: 'k' }], { startWhen: { flag: 'open' } });
  it('refuses start() and a skip-complete until the condition holds', () => {
    const w = makeWorld([gated]);
    expect(w.manager.start('q')).toBe(false);
    expect(w.manager.complete('q')).toBe(false);
    expect(w.manager.state('q')).toBe('inactive');
    w.flags.set('open', true);
    expect(w.manager.start('q')).toBe(true);
  });
  it('does not block completing an active quest', () => {
    const w = makeWorld([gated]);
    w.flags.set('open', true);
    w.manager.start('q');
    w.flags.delete('open');
    expect(w.manager.complete('q')).toBe(true);
  });
});

describe('validation of the new shapes', () => {
  const has = () => true;
  it('accepts event objectives with a target list', () => {
    expect(validateQuest(quest([ev({ target: ['a', 'b'], match: { x: 1 } })]), has)).toEqual([]);
  });
  it('rejects an empty or non-string target list and a list on other types', () => {
    expect(validateQuest(quest([ev({ target: [] })]), has).length).toBeGreaterThan(0);
    expect(validateQuest(quest([ev({ target: [1 as any] })]), has).length).toBeGreaterThan(0);
    expect(validateQuest(quest([{ id: 'o1', type: 'talk', target: ['a'], textKey: 'k' }]), has).join()).toMatch(/only event/);
  });
  it('rejects event-only fields on other types', () => {
    expect(validateQuest(quest([{ id: 'o1', type: 'talk', target: 'a', textKey: 'k', doneWhen: { flag: 'x.y' } }]), has).join()).toMatch(/event-only/);
  });
});
