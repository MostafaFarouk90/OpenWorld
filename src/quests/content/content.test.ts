import { describe, it, expect } from 'vitest';
import { questDefs } from './index';
import { t12 } from './t12.quest';
import { M02_RUBBLE } from './m02.quest';
import { BEATS } from '../../tutorial/beats';
import { stepRequired } from '../../tutorial/goals';
import { TUTORIAL_QUESTS } from '../../tutorial/quests';
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
    expect(ids).toEqual(['t03', 't12', 'm01', 'm02', 'm03', 'm04', 'm05', 'd01', 'r01', 'r02', 'm06', 'm07', 'm08', 'm09', 'm10', 'r03', 'r04', 'd02',
      // Act 2 (A12)
      'm11', 'm12', 'r06', 'r05', 'm13', 'r07', 'r11', 'm14', 'm15', 'd03',
      // Act 2 Oldsmoke surface (A13)
      'm16', 'r09', 'r10', 'm21', 'm22']);
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

describe('t12 kit and journal objectives', () => {
  const goal = (w: ReturnType<typeof world>, step = 0, beatId = 't12') => w.bus.emit('tutorial.goal', { beatId, step });
  const kitDef = t12.objectives[0];

  it('counts the kit step first (required equals the step), then the journal', () => {
    expect(t12.objectives.map((o) => o.id)).toEqual(['kit', 'o1']);
    expect(kitDef.required).toBe(stepRequired(BEATS.t12.steps[0]));
    expect(kitDef.required).toBe(3);
    expect(t12.sequential).toBe(true);
    const w = world('banked');
    expect(w.qm.start('t12')).toBe(true);
    // wrong beat or step earns nothing
    goal(w, 0, 't13');
    goal(w, 1);
    expect(w.qm.objectives('t12')[0].progress).toBe(0);
    goal(w);
    goal(w);
    expect(w.qm.objectives('t12')[0].progress).toBe(2);
    goal(w);
    expect(w.qm.objectives('t12')[0].done).toBe(true);
    expect(w.qm.state('t12')).toBe('active');
  });

  it('opening the journal credits only after the kit objective and once the director sets tutorial.t12.kit', () => {
    const w = world('banked');
    expect(w.qm.start('t12')).toBe(true);
    w.flags.set('tutorial.t12.kit', true);
    w.bus.emit('flag.changed', { key: 'tutorial.t12.kit', value: true, previous: undefined });
    w.bus.emit('interact', { interactableId: 'use:t12-journal-open' });
    expect(w.qm.state('t12')).toBe('active'); // kit not done yet
    goal(w); goal(w); goal(w);
    w.bus.emit('interact', { interactableId: 'use:t12-journal-open' });
    expect(w.qm.state('t12')).toBe('completed');
    expect(w.qm.state('m01')).toBe('active');
  });

  it('the journal gate still holds the press back until the flag is set', () => {
    const w = world('banked');
    w.qm.start('t12');
    goal(w); goal(w); goal(w);
    w.bus.emit('interact', { interactableId: 'use:t12-journal-open' });
    expect(w.qm.state('t12')).toBe('active');
    w.flags.set('tutorial.t12.kit', true);
    w.bus.emit('flag.changed', { key: 'tutorial.t12.kit', value: true, previous: undefined });
    w.bus.emit('interact', { interactableId: 'use:t12-journal-open' });
    expect(w.qm.state('t12')).toBe('completed');
  });

  it('a save made before the kit objective existed (journal only) loads without errors, and kitDone unblocks it', () => {
    const w = world('banked');
    w.qm.load({ quests: { t12: { state: 'active', objectives: { o1: 0 } } } });
    expect(w.qm.state('t12')).toBe('active');
    w.flags.set('tutorial.t12.kit', true);
    w.flags.set('tutorial.t12.kitDone', true);
    w.qm.recheck();
    expect(w.qm.objectives('t12')[0].done).toBe(true);
    w.bus.emit('interact', { interactableId: 'use:t12-journal-open' });
    expect(w.qm.state('t12')).toBe('completed');
  });
});

describe('Knighting Day dialogue roots', () => {
  const gautBeats = ['t01', 't02', 't03', 't04', 't05', 't06', 't07', 't08', 't09', 't10', 't11', 't12', 't13', 't14', 't15', 't-skirmish'];

  it('Gaut repeats the goal of whichever beat is active, ahead of the M01 briefing', () => {
    for (const q of gautBeats) {
      const w = world('banked');
      for (const d of TUTORIAL_QUESTS) w.qm.register(d);
      w.qm.start(q);
      if (q === 't15') w.qm.start('m01'); // M01 is already active during T13 to T15
      expect(play(w, 'npc-gaut', 'gaut'), q).toEqual([`tut-${q}`]);
    }
  });

  it('Gaut falls back to his usual lines when no beat is active', () => {
    const w = world('banked');
    for (const d of TUTORIAL_QUESTS) w.qm.register(d);
    expect(play(w, 'npc-gaut', 'gaut')).toEqual(['idle-banked']);
  });

  it('Hob teaches fast travel in three lines during T14, then reminds', () => {
    const w = world('banked');
    for (const d of TUTORIAL_QUESTS) w.qm.register(d);
    w.qm.start('t14');
    expect(play(w, 'npc-hob', 'hob')).toEqual(['travel', 'travel2', 'travel3']);
    w.qm.complete('t14');
    expect(play(w, 'npc-hob', 'hob')).toEqual(['idle']);
    const text = ['travel', 'travel2', 'travel3'].map((n) => all[`dialogue.npc-hob.${n}`]).join(' ');
    expect(text).toMatch(/rekindle/);
    expect(text).toMatch(/map/);
    expect(text).toMatch(/waystone|stone/);
    // Keys are remappable, so dialogue never names one (review M5).
    const gaut = Object.entries(all).filter(([k]) => k.startsWith('dialogue.npc-gaut.tut-') || k.startsWith('dialogue.npc-hob.'));
    for (const [k, v] of gaut) expect(v, k).not.toMatch(/\b(Press|Hold [A-Z]\b|Shift|Space|Tab|Ctrl|right mouse|with [A-Z0-9]\b)/);
  });

  it('a marker quest left active after the run ended does not hold Gaut on tutorial lines (review m6)', () => {
    const w = world('banked');
    for (const d of TUTORIAL_QUESTS) w.qm.register(d);
    w.qm.start('t14');
    w.flags.set('tutorial.complete', true);
    expect(play(w, 'npc-gaut', 'gaut')).not.toEqual(['tut-t14']);
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
    // the density pass: the Grey Goose door, Tobb inside, the mill and its miller, Aelfreda at the chapel gate
    expect(play(w, 'npc-gaut', 'gaut')[0]).toBe('remind');
    for (let i = 1; i <= 2; i++) w.bus.emit('carry.delivered', { destinationId: 'm01.tavern-door', carryId: `bucket-m01-${i}` });
    expect(w.qm.objectiveDone('m01', 'tavern')).toBe(true);
    expect(play(w, 'npc-tobb', 'tobb')[0]).toBe('m01-meet');
    expect(w.qm.objectiveDone('m01', 'tobb')).toBe(true);
    for (let i = 0; i < 4; i++) {
      w.tags[`mw${i}`] = 'm01.mill';
      w.bus.emit('actor.died', { actorId: `mw${i}`, killerId: 'p', kind: 'ash-wraith' });
    }
    expect(w.qm.objectiveDone('m01', 'mill')).toBe(true);
    expect(play(w, 'npc-aldwin', 'aldwin')[0]).toBe('m01-safe');
    expect(w.flags.get('story.m01.millerSafe')).toBe(true);
    expect(play(w, 'npc-aelfreda', 'aelfreda')[0]).toBe('m01-rescued');
    expect(w.qm.objectiveDone('m01', 'rescued')).toBe(true);
    expect(play(w, 'npc-gaut', 'gaut')[0]).toBe('report');
    expect(w.qm.state('m01')).toBe('completed');
    expect(w.given.some((g) => g.itemId === 'gauts-spare-blade')).toBe(true);
    expect(w.xp()).toBe(300);

    // m02
    expect(play(w, 'npc-edda', 'edda')[0]).toBe('fetch-reminder');
    for (let i = 1; i <= 2; i++) w.bus.emit('carry.delivered', { destinationId: 'm02.bakery-door', carryId: `bucket-m02-${i}` });
    w.bus.emit('trigger.enter', { triggerId: 'm02.bakery', actorId: 'p' });
    for (const id of M02_RUBBLE) w.bus.emit('interact', { interactableId: id });
    for (let i = 0; i < 3; i++) {
      w.tags[`ov${i}`] = 'm02.oven-yard';
      w.bus.emit('actor.died', { actorId: `ov${i}`, killerId: 'p', kind: 'ash-wraith' });
    }
    w.bus.emit('interact', { interactableId: 'pickup:hearth-stone' });
    expect(w.qm.objectiveDone('m02', 'o2')).toBe(true);
    expect(play(w, 'npc-edda', 'edda')[0]).toBe('granary-wait');
    expect(play(w, 'note-m02-badge', 'note-m02-badge')).toHaveLength(3);
    expect(w.qm.objectiveDone('m02', 'badge')).toBe(true);
    w.bus.emit('trigger.enter', { triggerId: 'm02.granary', actorId: 'p' });
    expect(play(w, 'npc-garrick', 'garrick', () => 3)[0]).toBe('m02-door');
    expect(w.flags.get('story.m02.garrick')).toBe('silent');
    // at the granary: choose topics 1, 2, 3 then leave (4)
    const picks = [1, 2, 3, 4];
    const nodes = play(w, 'npc-edda', 'edda', (n) => (n === 'hub' ? picks.shift()! : 1));
    expect(nodes[0]).toBe('granary');
    expect(nodes).toContain('disgrace');
    expect(nodes.filter((n) => n === 'hub').length).toBe(4);
    expect(nodes.at(-1)).toBe('hearth-ask-2');
    expect(w.flags.get('quest.m02.learnedDisgrace')).toBe(true);
    expect(w.qm.state('m02')).toBe('active');
    expect(play(w, 'npc-edda', 'edda')[0]).toBe('hearth-remind');
    w.bus.emit('interact', { interactableId: 'use:m02-common-hearth' });
    expect(w.qm.state('m02')).toBe('completed');
    expect(w.given.some((g) => g.itemId === 'hearth-stone-charm')).toBe(true);
    expect(w.xp()).toBe(550);
    expect(play(w, 'npc-edda', 'edda')[0]).toBe('farewell');
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
      for (const o of ['door', 'o1', 'rubble', 'oven', 'o2', 'badge', 'granary', 'garrick']) w.qm.completeObjective('m02', o);
      const picks = [1, 4];
      const nodes = play(w, 'npc-edda', 'edda', (n) => (n === 'hub' ? picks.shift()! : 1));
      expect(nodes.filter((n) => n.startsWith('why-cael-'))).toEqual([`why-cael-${t}`]);
    }
  });
});
