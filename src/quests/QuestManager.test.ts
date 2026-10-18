import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Effect, QuestDef, ObjectiveDef } from './types';
import type { BusPort, StatePort } from './ports';

const calls: string[] = [];
const condState = { value: true };
vi.mock('./effects', () => ({
  createEffectRunner: (env: any) => ({
    run: (effects: Effect[] | undefined) => {
      for (const e of effects ?? []) {
        calls.push(JSON.stringify(e));
        const h = (globalThis as any).__onEffect;
        if (h) h(e, env);
      }
      return [];
    },
  }),
}));
vi.mock('./conditions', () => ({
  evalCondition: (c: any) => (c && 'flag' in c ? condState.value : true),
}));

import { QuestManager } from './QuestManager';

class FakeBus implements BusPort {
  handlers = new Map<string, ((p: any) => void)[]>();
  log: { type: string; payload: any }[] = [];
  on(type: string, l: (p: any) => void) {
    const a = this.handlers.get(type) ?? [];
    a.push(l);
    this.handlers.set(type, a);
    return () => { const b = this.handlers.get(type)!; b.splice(b.indexOf(l), 1); };
  }
  emit(type: string, payload?: unknown) {
    this.log.push({ type, payload });
    for (const l of [...(this.handlers.get(type) ?? [])]) l(payload);
  }
  of(type: string) { return this.log.filter((e) => e.type === type).map((e) => e.payload); }
}

const fakeState = {} as StatePort;

function obj(id: string, type: ObjectiveDef['type'], target: string, extra: Partial<ObjectiveDef> = {}): ObjectiveDef {
  return { id, type, target, textKey: id, ...extra };
}
function quest(id: string, objectives: ObjectiveDef[], extra: Partial<QuestDef> = {}): QuestDef {
  return { id, titleKey: id, summaryKey: id, objectives, ...extra };
}

let bus: FakeBus;
let warns: string[];
let inside: Set<string>;
let tags: Record<string, string>;
function make(extra: Partial<ConstructorParameters<typeof QuestManager>[0]> = {}) {
  return new QuestManager({
    bus, state: fakeState, playerId: () => 'p', warn: (m) => warns.push(m),
    actorMeta: (id) => (tags[id] ? { spawnTag: tags[id] } : undefined),
    triggers: { isInside: (t, a) => a === 'p' && inside.has(t) },
    ...extra,
  });
}
const enter = (triggerId: string, actorId = 'p') => bus.emit('trigger.enter', { triggerId, actorId });
const died = (actorId: string, kind = 'wraith', killerId = 'p') => bus.emit('actor.died', { actorId, killerId, kind });

beforeEach(() => {
  bus = new FakeBus();
  warns = [];
  inside = new Set();
  tags = {};
  calls.length = 0;
  condState.value = true;
  (globalThis as any).__onEffect = undefined;
});

describe('registration', () => {
  it('rejects duplicate quest ids and duplicate objective ids', () => {
    const m = make();
    m.register(quest('a', [obj('o', 'talk', 'x')]));
    expect(() => m.register(quest('a', []))).toThrow();
    expect(() => m.register(quest('b', [obj('o', 'talk', 'x'), obj('o', 'talk', 'y')]))).toThrow();
    expect(m.get('b')).toBeUndefined();
  });
  it('stores a deep copy', () => {
    const m = make();
    const def = quest('a', [obj('o', 'talk', 'x')]);
    m.register(def);
    def.objectives[0].target = 'changed';
    expect(m.get('a')!.objectives[0].target).toBe('x');
  });
  it('unknown quest reads inactive and warns once', () => {
    const m = make();
    expect(m.state('zz')).toBe('inactive');
    expect(m.state('zz')).toBe('inactive');
    expect(warns.filter((w) => w.includes('zz'))).toHaveLength(1);
    expect(m.objectives('zz')).toEqual([]);
    expect(m.start('zz')).toBe(false);
  });
});

describe('lifecycle', () => {
  it('start moves inactive to active once, runs onStart, emits quest.started', () => {
    const m = make();
    m.register(quest('a', [obj('o', 'talk', 'x')], { onStart: [{ setFlag: 'f', value: true }] }));
    expect(m.start('a')).toBe(true);
    expect(m.state('a')).toBe('active');
    expect(m.start('a')).toBe(false);
    expect(bus.of('quest.started')).toEqual([{ questId: 'a' }]);
    expect(calls).toHaveLength(1);
    expect(m.active()).toEqual(['a']);
  });
  it('start on completed or failed is a no-op', () => {
    const m = make();
    m.register(quest('a', [obj('o', 'talk', 'x')]));
    m.register(quest('b', [obj('o', 'talk', 'x')]));
    m.start('a'); m.complete('a'); m.start('b'); m.fail('b');
    expect(m.start('a')).toBe(false);
    expect(m.start('b')).toBe(false);
    expect(m.state('a')).toBe('completed');
    expect(m.state('b')).toBe('failed');
  });
  it('active() is in start order and drops finished quests', () => {
    const m = make();
    for (const id of ['a', 'b', 'c']) m.register(quest(id, [obj('o', 'talk', 'x')]));
    m.start('c'); m.start('a'); m.start('b');
    expect(m.active()).toEqual(['c', 'a', 'b']);
    m.fail('a');
    expect(m.active()).toEqual(['c', 'b']);
  });
  it('complete runs onComplete then rewards once and emits once, even when called twice', () => {
    const m = make();
    const on: Effect = { setFlag: 'a', value: 1 };
    const rw: Effect = { xp: 5 };
    m.register(quest('a', [obj('o', 'talk', 'x')], { onComplete: [on], rewards: [rw] }));
    m.start('a');
    expect(m.complete('a')).toBe(true);
    expect(m.complete('a')).toBe(false);
    expect(calls).toEqual([JSON.stringify(on), JSON.stringify(rw)]);
    expect(bus.of('quest.completed')).toEqual([{ questId: 'a' }]);
  });
  it('re-entrant complete from inside onComplete is a no-op', () => {
    const m = make();
    m.register(quest('a', [obj('o', 'talk', 'x')], { onComplete: [{ completeQuest: 'a' }], rewards: [{ xp: 1 }] }));
    (globalThis as any).__onEffect = (e: Effect) => {
      if ('completeQuest' in e) expect(m.complete(e.completeQuest)).toBe(false);
    };
    m.start('a');
    m.complete('a');
    expect(calls).toHaveLength(2);
    expect(bus.of('quest.completed')).toHaveLength(1);
  });
  it('complete on inactive quest does nothing', () => {
    const m = make();
    m.register(quest('a', [obj('o', 'talk', 'x')], { rewards: [{ xp: 1 }] }));
    expect(m.complete('a')).toBe(false);
    expect(calls).toHaveLength(0);
  });
  it('fail emits, stops crediting, and is a no-op after complete', () => {
    const m = make();
    m.register(quest('a', [obj('o', 'talk', 'x')]));
    m.register(quest('b', [obj('o', 'talk', 'x')]));
    m.start('a'); m.start('b');
    expect(m.fail('a')).toBe(true);
    expect(bus.of('quest.failed')).toEqual([{ questId: 'a' }]);
    bus.emit('dialogue.ended', { npcId: 'x' });
    expect(m.objectiveDone('a', 'o')).toBe(false);
    m.complete('b');
    expect(m.fail('b')).toBe(false);
    expect(m.fail('a')).toBe(false);
    expect(bus.of('quest.failed')).toHaveLength(1);
  });
});

describe('objective crediting', () => {
  it('events before start are ignored and not credited later', () => {
    const m = make();
    m.register(quest('a', [obj('o', 'talk', 'x', { required: 2 })]));
    bus.emit('dialogue.ended', { npcId: 'x' });
    m.start('a');
    expect(m.objectives('a')[0].progress).toBe(0);
    bus.emit('dialogue.ended', { npcId: 'x' });
    expect(m.objectives('a')[0].progress).toBe(1);
  });
  it('emits quest.objective payload only when progress changes', () => {
    const m = make();
    m.register(quest('a', [obj('o', 'talk', 'x', { required: 2 }), obj('p2', 'talk', 'y')]));
    m.start('a');
    bus.emit('dialogue.ended', { npcId: 'x' });
    bus.emit('dialogue.ended', { npcId: 'zzz' });
    expect(bus.of('quest.objective')).toEqual([{ questId: 'a', objectiveId: 'o', progress: 1, required: 2, done: false }]);
    bus.emit('dialogue.ended', { npcId: 'x' });
    expect(bus.of('quest.objective')[1]).toMatchObject({ progress: 2, done: true });
    bus.emit('dialogue.ended', { npcId: 'x' });
    expect(bus.of('quest.objective')).toHaveLength(2);
  });
  it('non-sequential objectives can be done in any order; quest completes when all are done', () => {
    const m = make();
    m.register(quest('a', [obj('o1', 'talk', 'x'), obj('o2', 'interact', 'y')]));
    m.start('a');
    bus.emit('interact', { interactableId: 'y' });
    expect(m.state('a')).toBe('active');
    bus.emit('dialogue.ended', { npcId: 'x' });
    expect(m.state('a')).toBe('completed');
  });
  it('sequential only credits the first undone non-optional objective, no retroactive credit', () => {
    const m = make();
    m.register(quest('a', [obj('o1', 'talk', 'x'), obj('o2', 'interact', 'y')], { sequential: true }));
    m.start('a');
    bus.emit('interact', { interactableId: 'y' });
    expect(m.objectiveDone('a', 'o2')).toBe(false);
    expect(m.isObjectiveCurrent('a', 'o2')).toBe(false);
    expect(m.isObjectiveCurrent('a', 'o1')).toBe(true);
    bus.emit('dialogue.ended', { npcId: 'x' });
    expect(m.isObjectiveCurrent('a', 'o2')).toBe(true);
    bus.emit('interact', { interactableId: 'y' });
    expect(m.state('a')).toBe('completed');
  });
  it('one event does not credit two sequential objectives', () => {
    const m = make();
    m.register(quest('a', [obj('o1', 'talk', 'x'), obj('o2', 'talk', 'x')], { sequential: true }));
    m.start('a');
    bus.emit('dialogue.ended', { npcId: 'x' });
    expect(m.objectiveDone('a', 'o1')).toBe(true);
    expect(m.objectiveDone('a', 'o2')).toBe(false);
  });
  it('optional objectives never block completion but are still credited when non-sequential', () => {
    const m = make();
    m.register(quest('a', [obj('o1', 'talk', 'x'), obj('opt', 'interact', 'y', { optional: true })]));
    m.start('a');
    bus.emit('interact', { interactableId: 'y' });
    expect(m.state('a')).toBe('active');
    expect(m.objectiveDone('a', 'opt')).toBe(true);
    m.register(quest('b', [obj('o1', 'talk', 'x'), obj('opt', 'interact', 'y', { optional: true })]));
    m.start('b');
    bus.emit('dialogue.ended', { npcId: 'x' });
    expect(m.state('b')).toBe('completed');
  });
  it('when gates crediting at event time', () => {
    const m = make();
    m.register(quest('a', [obj('o', 'talk', 'x', { when: { flag: 'f' } })]));
    m.start('a');
    condState.value = false;
    bus.emit('dialogue.ended', { npcId: 'x' });
    expect(m.objectiveDone('a', 'o')).toBe(false);
    expect(m.isObjectiveCurrent('a', 'o')).toBe(false);
    condState.value = true;
    expect(m.isObjectiveCurrent('a', 'o')).toBe(true);
    bus.emit('dialogue.ended', { npcId: 'x' });
    expect(m.objectiveDone('a', 'o')).toBe(true);
  });
  it('interact with the wrong id is ignored', () => {
    const m = make();
    m.register(quest('a', [obj('o', 'interact', 'y')]));
    m.start('a');
    bus.emit('interact', { interactableId: 'other' });
    expect(m.objectiveDone('a', 'o')).toBe(false);
  });
  it('goTo ignores non-player actors and other triggers', () => {
    const m = make();
    m.register(quest('a', [obj('o', 'goTo', 'T')]));
    m.start('a');
    enter('T', 'npc');
    enter('U');
    expect(m.objectiveDone('a', 'o')).toBe(false);
    enter('T');
    expect(m.state('a')).toBe('completed');
  });
  it('goTo is credited immediately when the player is already inside on becoming current', () => {
    const m = make();
    inside.add('T2');
    m.register(quest('a', [obj('o1', 'talk', 'x'), obj('o2', 'goTo', 'T2')], { sequential: true }));
    m.start('a');
    expect(m.objectiveDone('a', 'o2')).toBe(false);
    bus.emit('dialogue.ended', { npcId: 'x' });
    expect(m.state('a')).toBe('completed');
  });
  it('goTo already inside at quest start is credited immediately', () => {
    const m = make();
    inside.add('T');
    m.register(quest('a', [obj('o', 'goTo', 'T'), obj('o2', 'talk', 'x')]));
    m.start('a');
    expect(m.objectiveDone('a', 'o')).toBe(true);
  });
  it('collect adds counts across grants and clamps', () => {
    const m = make();
    m.register(quest('a', [obj('o', 'collect', 'bread', { required: 3 })]));
    m.start('a');
    bus.emit('loot.granted', { items: [{ itemId: 'bread', count: 2 }, { itemId: 'rock', count: 5 }] });
    expect(m.objectives('a')[0].progress).toBe(2);
    bus.emit('loot.granted', { items: [{ itemId: 'bread', count: 5 }] });
    expect(m.objectives('a')[0].progress).toBe(3);
    expect(m.state('a')).toBe('completed');
  });
  it('carry counts distinct carry ids only', () => {
    const m = make();
    m.register(quest('a', [obj('o', 'carry', 'D', { required: 2 })]));
    m.start('a');
    const del = (carryId: string, destinationId = 'D') => bus.emit('carry.delivered', { carryId, destinationId });
    del('v1'); del('v1'); del('v2', 'wrong');
    expect(m.objectives('a')[0].progress).toBe(1);
    del('v2');
    expect(m.state('a')).toBe('completed');
  });
  it('completeObjective sets to required, needs an active quest, may complete quest', () => {
    const m = make();
    m.register(quest('a', [obj('o', 'collect', 'x', { required: 4 })]));
    expect(m.completeObjective('a', 'o')).toBe(false);
    m.start('a');
    expect(m.completeObjective('a', 'nope')).toBe(false);
    expect(m.completeObjective('a', 'o')).toBe(true);
    expect(bus.of('quest.objective')[0]).toMatchObject({ progress: 4, required: 4, done: true });
    expect(m.state('a')).toBe('completed');
    expect(m.completeObjective('a', 'o')).toBe(false);
  });
});

describe('kill objectives', () => {
  function killQuest(extra: Partial<ObjectiveDef> = {}) {
    const m = make();
    m.register(quest('k', [obj('o', 'kill', 'wraith', { required: 2, ...extra })]));
    return m;
  }
  it('death before start is ignored', () => {
    const m = killQuest();
    died('w1');
    m.start('k');
    expect(m.objectives('k')[0].progress).toBe(0);
    died('w1');
    expect(m.objectives('k')[0].progress).toBe(1);
  });
  it('duplicate actor.died counts once', () => {
    const m = killQuest();
    m.start('k');
    died('w1'); died('w1');
    expect(m.objectives('k')[0].progress).toBe(1);
    died('w2');
    expect(m.state('k')).toBe('completed');
  });
  it('non-player killer and wrong kind are ignored', () => {
    const m = killQuest();
    m.start('k');
    died('w1', 'wraith', 'someone');
    died('w2', 'rat');
    expect(m.objectives('k')[0].progress).toBe(0);
  });
  it('spawnTag mismatch ignored, match credited', () => {
    const m = killQuest({ spawnTag: 'm01' });
    tags = { w1: 'm01', w2: 'other' };
    m.start('k');
    died('w2'); died('w3');
    expect(m.objectives('k')[0].progress).toBe(0);
    died('w1');
    expect(m.objectives('k')[0].progress).toBe(1);
  });
  it('mercy credits, and a later death of the same actor does not double count', () => {
    const m = killQuest();
    m.start('k');
    bus.emit('mercy', { creature: 'wraith', actorId: 'w1' });
    expect(m.objectives('k')[0].progress).toBe(1);
    died('w1');
    expect(m.objectives('k')[0].progress).toBe(1);
    bus.emit('mercy', { creature: 'rat', actorId: 'w2' });
    expect(m.objectives('k')[0].progress).toBe(1);
    died('w2');
    expect(m.state('k')).toBe('completed');
  });
  it('mercy respects spawnTag', () => {
    const m = killQuest({ spawnTag: 'm01' });
    tags = { w1: 'm01' };
    m.start('k');
    bus.emit('mercy', { creature: 'wraith', actorId: 'zz' });
    bus.emit('mercy', { creature: 'wraith', actorId: 'w1' });
    expect(m.objectives('k')[0].progress).toBe(1);
  });
});

describe('robustness and change notification', () => {
  it('a throwing bus listener does not stop other quests being credited', () => {
    const m = make();
    m.register(quest('a', [obj('o', 'talk', 'x')]));
    m.register(quest('b', [obj('o', 'talk', 'x')]));
    bus.on('quest.objective', () => { throw new Error('boom'); });
    m.start('a'); m.start('b');
    bus.emit('dialogue.ended', { npcId: 'x' });
    expect(m.state('a')).toBe('completed');
    expect(m.state('b')).toBe('completed');
    expect(warns.some((w) => w.includes('boom'))).toBe(true);
  });
  it('a throwing effect does not stop completion of other quests', () => {
    const m = make();
    m.register(quest('a', [obj('o', 'talk', 'x')], { onComplete: [{ xp: 1 }] }));
    m.register(quest('b', [obj('o', 'talk', 'x')]));
    (globalThis as any).__onEffect = () => { throw new Error('bad effect'); };
    m.start('a'); m.start('b');
    bus.emit('dialogue.ended', { npcId: 'x' });
    expect(m.state('b')).toBe('completed');
    expect(m.state('a')).toBe('completed');
  });
  it('onChange fires on state and progress changes and can be unsubscribed', () => {
    const m = make();
    m.register(quest('a', [obj('o', 'talk', 'x', { required: 2 })]));
    const fn = vi.fn();
    const off = m.onChange(fn);
    m.start('a');
    const afterStart = fn.mock.calls.length;
    expect(afterStart).toBeGreaterThan(0);
    bus.emit('dialogue.ended', { npcId: 'x' });
    expect(fn.mock.calls.length).toBeGreaterThan(afterStart);
    off();
    const n = fn.mock.calls.length;
    m.fail('a');
    expect(fn.mock.calls.length).toBe(n);
  });
  it('a throwing onChange listener is isolated', () => {
    const m = make();
    m.register(quest('a', [obj('o', 'talk', 'x')]));
    const ok = vi.fn();
    m.onChange(() => { throw new Error('x'); });
    m.onChange(ok);
    m.start('a');
    expect(ok).toHaveBeenCalled();
  });
  it('dispose stops crediting', () => {
    const m = make();
    m.register(quest('a', [obj('o', 'talk', 'x')]));
    m.start('a');
    m.dispose();
    bus.emit('dialogue.ended', { npcId: 'x' });
    expect(m.objectiveDone('a', 'o')).toBe(false);
  });
});

describe('persistence', () => {
  it('round trips state and progress', () => {
    const m = make();
    m.register(quest('a', [obj('o', 'collect', 'x', { required: 3 })]));
    m.register(quest('b', [obj('o', 'talk', 'y')]));
    m.register(quest('c', [obj('o', 'talk', 'y')]));
    m.start('a'); m.start('b'); m.complete('b');
    bus.emit('loot.granted', { items: [{ itemId: 'x', count: 2 }] });
    const data = m.serialize();
    expect(data).toEqual({
      quests: { a: { state: 'active', objectives: { o: 2 } }, b: { state: 'completed', objectives: {} } },
    });
    expect(JSON.stringify(data)).not.toContain('version');
    const m2 = make({ bus: new FakeBus() });
    m2.register(quest('a', [obj('o', 'collect', 'x', { required: 3 })]));
    m2.register(quest('b', [obj('o', 'talk', 'y')]));
    m2.register(quest('c', [obj('o', 'talk', 'y')]));
    m2.load(JSON.parse(JSON.stringify(data)));
    expect(m2.serialize()).toEqual(data);
    expect(m2.state('a')).toBe('active');
    expect(m2.state('c')).toBe('inactive');
    expect(m2.active()).toEqual(['a']);
    expect(m2.objectives('a')[0].progress).toBe(2);
  });
  it('keeps unknown quest ids verbatim, and adopts them when registered later', () => {
    const m = make();
    const save = { quests: { ghost: { state: 'active', objectives: { z: 4 } } } };
    m.load(save);
    expect(m.serialize()).toEqual(save);
    m.register(quest('ghost', [obj('z', 'collect', 'x', { required: 9 })]));
    expect(m.state('ghost')).toBe('active');
    expect(m.objectives('ghost')[0].progress).toBe(4);
    expect(m.active()).toEqual(['ghost']);
  });
  it('drops bad states and non-finite progress with warnings, clamps to required', () => {
    const m = make();
    m.register(quest('a', [obj('o', 'collect', 'x', { required: 3 }), obj('o2', 'talk', 'y')]));
    m.register(quest('b', [obj('o', 'talk', 'y')]));
    m.load({
      quests: {
        a: { state: 'active', objectives: { o: 99, o2: NaN } },
        b: { state: 'bogus', objectives: {} },
        c: 7,
      },
    });
    expect(m.state('b')).toBe('inactive');
    expect(m.objectives('a')[0].progress).toBe(3);
    expect(m.objectives('a')[1].progress).toBe(0);
    expect(m.serialize()).toEqual({ quests: { a: { state: 'active', objectives: { o: 3 } } } });
    expect(warns.length).toBeGreaterThanOrEqual(3);
  });
  it('tolerates null, garbage and wrong types, resetting runtime', () => {
    const m = make();
    m.register(quest('a', [obj('o', 'talk', 'x')]));
    m.start('a');
    for (const bad of [null, undefined, 5, 'x', [], { quests: null }, { quests: [] }, { quests: 'z' }]) {
      expect(() => m.load(bad)).not.toThrow();
      expect(m.state('a')).toBe('inactive');
      expect(m.serialize()).toEqual({ quests: {} });
    }
  });
  it('emits no per-quest events on load', () => {
    const m = make();
    m.register(quest('a', [obj('o', 'talk', 'x')]));
    bus.log.length = 0;
    m.load({ quests: { a: { state: 'completed', objectives: { o: 1 } }, ghost: { state: 'active', objectives: {} } } });
    expect(bus.log).toEqual([]);
    expect(calls).toEqual([]);
    expect(m.state('a')).toBe('completed');
  });
  it('load replaces earlier state and rebuilds with empty dedupe sets', () => {
    const m = make();
    m.register(quest('k', [obj('o', 'kill', 'wraith', { required: 3 })]));
    m.start('k');
    died('w1');
    m.load(m.serialize());
    died('w1'); // acceptable: dedupe set is empty after load
    expect(m.objectives('k')[0].progress).toBe(2);
  });
});
