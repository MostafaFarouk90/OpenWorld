import { describe, it, expect } from 'vitest';
import { questDefs } from './index';
import { questStrings } from '../strings.en';
import { dialogueStrings, npcNameFallbackStrings } from '../../dialogue/strings.en';
import { dialogueDefs } from '../../dialogue/content';
import { validateQuest } from '../validate';
import { QuestManager } from '../QuestManager';
import { createEffectRunner } from '../effects';
import { DialogueRunner } from '../../dialogue/DialogueRunner';
import type { BusPort, StatePort, StringsPort } from '../ports';
import type { FavourBand, FlagValue } from '../types';

const all: Record<string, string> = { ...questStrings, ...dialogueStrings, ...npcNameFallbackStrings };
const hasKey = (k: string) => k in all;

describe('quest content', () => {
  it('has the expected quest ids, unique', () => {
    const ids = questDefs.map((q) => q.id);
    expect(ids).toEqual(['t03', 't12', 'm01', 'm02', 'm03', 'm04', 'm05', 'd01', 'r01', 'r02']);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(questDefs.map((d) => [d.id, d] as const))('quest %s validates', (_id, def) => {
    expect(validateQuest(def, hasKey)).toEqual([]);
  });

  it('journal strings exist', () => {
    for (const k of ['empty', 'title', 'active', 'completed', 'failed']) expect(hasKey(`quest.journal.${k}`)).toBe(true);
  });

  it('no literal player name in strings; names use {name}', () => {
    for (const [k, v] of Object.entries({ ...questStrings, ...dialogueStrings })) expect(v, k).not.toMatch(/Cael/);
    for (const [k, v] of Object.entries({ ...questStrings, ...dialogueStrings })) expect(v, k).not.toMatch(/—|–/);
  });
});

class Bus implements BusPort {
  private h = new Map<string, ((p: any) => void)[]>();
  log: { type: string; payload: any }[] = [];
  on(type: string, l: (p: any) => void) {
    const a = this.h.get(type) ?? [];
    a.push(l);
    this.h.set(type, a);
    return () => { a.splice(a.indexOf(l), 1); };
  }
  emit(type: string, payload?: unknown) {
    this.log.push({ type, payload });
    for (const l of [...(this.h.get(type) ?? [])]) l(payload);
  }
}

function world(band: FavourBand = 'banked') {
  const bus = new Bus();
  const flags = new Map<string, FlagValue>();
  const state: StatePort = {
    getFlag: (k) => flags.get(k),
    setFlag: (k, v) => { flags.set(k, v); },
    clearFlag: (k) => { flags.delete(k); },
    favourBand: () => band,
    favour: () => 30,
    addFavour: () => 0,
  };
  const tags: Record<string, string> = {};
  const given: { itemId: string; count: number }[] = [];
  let xp = 0;
  const qm = new QuestManager({
    bus, state, playerId: () => 'p', actorMeta: (id) => (tags[id] ? { spawnTag: tags[id] } : undefined),
    progression: () => ({ grantXp: (n: number) => { xp += n; } }),
  });
  for (const d of questDefs) qm.register(d);
  const effects = createEffectRunner({ state, quests: qm, bus, sourceId: 'test' });
  const strings: StringsPort = {
    t: (k, p) => (all[k] ?? `[[${k}]]`).replace('{name}', String(p?.name ?? 'Cael')),
    has: hasKey,
  };
  const dr = new DialogueRunner({ bus, state, quests: qm, effects, strings });
  for (const d of dialogueDefs) dr.register(d);
  bus.on('loot.granted', (p) => { for (const i of p.items ?? []) given.push(i); });
  return { bus, flags, qm, dr, tags, given, xp: () => xp };
}

/** Run a dialogue to its end, taking choice `pick(nodeId)` (1-based) when asked. */
function play(w: ReturnType<typeof world>, id: string, npc: string, pick: (node: string) => number = () => 1) {
  expect(w.dr.start(id, npc)).toBe(true);
  const texts: string[] = [];
  for (let i = 0; i < 100 && w.dr.isOpen; i++) {
    const v = w.dr.view()!;
    texts.push(v.nodeId);
    if (v.choices.length) w.dr.choose(pick(v.nodeId)); else w.dr.advance();
  }
  expect(w.dr.isOpen).toBe(false);
  return texts;
}

describe('t12 journal objective', () => {
  it('opening the journal credits only once the director sets tutorial.t12.kit', () => {
    const w = world('banked');
    expect(w.qm.start('t12')).toBe(true);
    w.bus.emit('interact', { interactableId: 'use:t12-journal-open' });
    expect(w.qm.state('t12')).toBe('active');
    w.flags.set('tutorial.t12.kit', true);
    w.bus.emit('flag.changed', { key: 'tutorial.t12.kit', value: true, previous: undefined });
    w.bus.emit('interact', { interactableId: 'use:t12-journal-open' });
    expect(w.qm.state('t12')).toBe('completed');
    expect(w.qm.state('m01')).toBe('active');
  });
});

describe('M01 and M02 walk-through with the real QuestManager', () => {
  it('t03 -> t12 -> m01 -> m02', () => {
    const w = world('banked');
    expect(w.qm.start('t03')).toBe(true);
    // Stane, Edda (gift), board
    play(w, 'npc-stane', 'stane');
    w.bus.emit('interact', { interactableId: 'npc:stane' });
    play(w, 'npc-edda', 'edda');
    w.bus.emit('interact', { interactableId: 'npc:edda' });
    expect(w.flags.get('quest.t03.eddaGift')).toBe(true);
    expect(w.given.map((g) => g.itemId).sort()).toEqual(['hearth-bread', 'hearth-token']);
    w.bus.emit('interact', { interactableId: 'use:notice-board' });
    // t03 completes by objectives (non-sequential)
    expect(w.qm.state('t03')).toBe('completed');
    // second visit gives no second gift
    const before = w.given.length;
    play(w, 'npc-edda', 'edda');
    expect(w.given.length).toBe(before);

    // t12: director completes it, which starts m01
    w.qm.start('t12');
    expect(play(w, 'npc-edda', 'edda')[0]).toBe('bakery');
    expect(w.qm.complete('t12')).toBe(true);
    expect(w.qm.state('m01')).toBe('active');

    // Gaut briefs, then reminds
    expect(play(w, 'npc-gaut', 'gaut')[0]).toBe('brief-banked');
    expect(w.flags.get('quest.m01.briefed')).toBe(true);
    expect(play(w, 'npc-gaut', 'gaut')[0]).toBe('remind');

    // o3 is gated until o1 and o2 are done
    w.bus.emit('dialogue.ended', { dialogueId: 'x', npcId: 'gaut' });
    expect(w.qm.objectiveDone('m01', 'o3')).toBe(false);
    for (let i = 0; i < 5; i++) {
      w.tags[`w${i}`] = 'm01';
      w.bus.emit('actor.died', { actorId: `w${i}`, killerId: 'p', kind: 'ash-wraith' });
    }
    expect(w.qm.objectiveDone('m01', 'o1')).toBe(true);
    // Edda now offers m02; not now keeps it offered
    expect(play(w, 'npc-edda', 'edda', () => 2)[0]).toBe('offer');
    expect(w.qm.state('m02')).toBe('inactive');
    play(w, 'npc-edda', 'edda', () => 1);
    expect(w.qm.state('m02')).toBe('active');

    for (let i = 0; i < 3; i++) w.bus.emit('carry.delivered', { destinationId: 'm01.chapel-door', carryId: `v${i}` });
    expect(play(w, 'npc-gaut', 'gaut')[0]).toBe('report');
    expect(w.qm.state('m01')).toBe('completed');
    expect(w.given.some((g) => g.itemId === 'gauts-spare-blade')).toBe(true);
    expect(w.xp()).toBe(300);

    // m02
    expect(play(w, 'npc-edda', 'edda')[0]).toBe('fetch-reminder');
    w.bus.emit('trigger.enter', { triggerId: 'm02.bakery', actorId: 'p' });
    w.bus.emit('interact', { interactableId: 'pickup:hearth-stone' });
    expect(w.qm.objectiveDone('m02', 'o2')).toBe(true);
    // choose topics 1, 2, 3 then leave (4)
    const picks = [1, 2, 3, 4];
    const nodes = play(w, 'npc-edda', 'edda', (n) => (n === 'hub' ? picks.shift()! : 1));
    expect(nodes[0]).toBe('disgrace');
    expect(nodes.filter((n) => n === 'hub').length).toBe(4);
    expect(w.flags.get('quest.m02.learnedDisgrace')).toBe(true);
    expect(w.qm.state('m02')).toBe('completed');
    expect(w.given.some((g) => g.itemId === 'hearth-stone-charm')).toBe(true);
    expect(w.xp()).toBe(550);
    expect(play(w, 'npc-edda', 'edda')[0]).toBe('idle');
  });

  it('m02 hands in the hearth-stone on completion', () => {
    const m = questDefs.find((q) => q.id === 'm02')!;
    expect(m.onComplete).toEqual([{ take: 'hearth-stone' }]);
  });

  it('edda offers m02 once m01 is completed even if o1 is not flagged done', () => {
    const w = world();
    w.qm.start('m01');
    w.qm.complete('m01');
    expect(w.qm.state('m01')).toBe('completed');
    expect(play(w, 'npc-edda', 'edda')[0]).toBe('offer');
  });

  it('cold favour gets the cold greeting', () => {
    const w = world('cold');
    w.qm.start('m01');
    expect(play(w, 'npc-gaut', 'gaut')[0]).toBe('brief-cold');
  });

  it('every root dialogue falls through to idle with no quests', () => {
    const w = world('banked');
    expect(play(w, 'npc-stane', 'stane')[0]).toBe('idle');
    expect(play(w, 'npc-edda', 'edda')[0]).toBe('idle');
    expect(play(w, 'npc-aelfreda', 'aelfreda')[0]).toBe('idle');
    expect(play(w, 'npc-gaut', 'gaut')[0]).toBe('idle-banked');
  });

  it('aelfreda mentions the Heartshard while m01 is active', () => {
    const w = world();
    w.qm.start('m01');
    expect(play(w, 'npc-aelfreda', 'aelfreda')[0]).toBe('shard');
  });

  it('edda tone variants follow tutorial.t04.tone', () => {
    for (const t of ['earnest', 'wry', 'humble']) {
      const w = world();
      w.flags.set('tutorial.t04.tone', t);
      w.qm.start('m02');
      w.qm.completeObjective('m02', 'o2');
      const picks = [1, 4];
      const nodes = play(w, 'npc-edda', 'edda', (n) => (n === 'hub' ? picks.shift()! : 1));
      expect(nodes.filter((n) => n.startsWith('why-cael-'))).toEqual([`why-cael-${t}`]);
    }
  });
});
