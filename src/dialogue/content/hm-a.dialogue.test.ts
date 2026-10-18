import { describe, it, expect } from 'vitest';
import { npcRook } from './npc-rook.dialogue';
import { npcAldith } from './npc-aldith.dialogue';
import { npcWystan } from './npc-wystan.dialogue';
import { npcEdric } from './npc-edric.dialogue';
import { dialogueStringsHmA } from '../strings.hm-a.en';
import { dialogueStrings, npcNameFallbackStrings } from '../strings.en';
import { questStrings } from '../../quests/strings.en';
import { questDefs } from '../../quests/content';
import { D02_PREREQUISITES } from '../../quests/content/d02.quest';
import { M06_BRIBE_GOLD, M06_TIP_GOLD, R03_COIN_GOLD } from '../../quests/content/gold';
import { validateDialogue } from '../validate';
import { DialogueRunner } from '../DialogueRunner';
import { createEffectRunner } from '../../quests/effects';
import { makeWorld } from '../../quests/testKit';
import type { InventoryPort, StatePort, StringsPort } from '../../quests/ports';
import type { FavourBand, FavourTrack } from '../../quests/types';

const defs = [npcRook, npcAldith, npcWystan, npcEdric];
const all: Record<string, string> = { ...questStrings, ...dialogueStrings, ...npcNameFallbackStrings, ...dialogueStringsHmA };
const hasKey = (k: string) => k in all;

describe('Harrowmark A dialogue content', () => {
  it.each(defs.map((d) => [d.id, d] as const))('%s validates clean', (_id, def) => {
    const r = validateDialogue(def, hasKey);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]); // warnings include unreachable nodes
  });

  it('every dialogue ends its start array with the idle fallback and has at most 4 choices per node', () => {
    for (const d of defs) {
      const last = (d.start as { when: unknown; node: string }[]).at(-1)!;
      expect(last).toEqual({ when: { all: [] }, node: 'idle' });
      for (const n of d.nodes) expect((n.choices ?? []).length, `${d.id}:${n.id}`).toBeLessThanOrEqual(4);
    }
  });

  it('every text key used exists and strings have no dashes or literal player name', () => {
    for (const d of defs) for (const n of d.nodes) {
      expect(hasKey(n.textKey), n.textKey).toBe(true);
      for (const c of n.choices ?? []) expect(hasKey(c.textKey), c.textKey).toBe(true);
    }
    for (const [k, v] of Object.entries(dialogueStringsHmA)) {
      expect(v, k).not.toMatch(/[–—]/);
      expect(v, k).not.toMatch(/Cael/);
      expect(k, k).toMatch(/^dialogue\.npc-(rook|aldith|wystan|edric)\./);
    }
  });

  it('no string key is unused', () => {
    const used = new Set<string>();
    for (const d of defs) for (const n of d.nodes) {
      used.add(n.textKey);
      for (const c of n.choices ?? []) used.add(c.textKey);
    }
    for (const k of Object.keys(dialogueStringsHmA)) expect(used.has(k), k).toBe(true);
  });

  it('choice texts that state an amount match the constants', () => {
    expect(dialogueStringsHmA['dialogue.npc-rook.m06-choose.bribe']).toContain(String(M06_BRIBE_GOLD));
    expect(dialogueStringsHmA['dialogue.npc-rook.m06-choose.argue-tip']).toContain(String(M06_TIP_GOLD));
    expect(dialogueStringsHmA['dialogue.npc-aldith.r03-settle.collect']).toContain(String(R03_COIN_GOLD));
  });

  it('only the intended nodes carry mercy and give effects', () => {
    const carriers: string[] = [];
    for (const d of defs) for (const n of d.nodes) {
      const effs = [...(n.effects ?? []), ...(n.choices ?? []).flatMap((c) => c.effects ?? [])];
      const walk = (e: any): void => { if ('unlockMercy' in e || 'give' in e) carriers.push(`${d.id}:${n.id}`); if ('if' in e) [...e.then, ...(e.else ?? [])].forEach(walk); };
      effs.forEach(walk);
    }
    expect(carriers).toEqual(['npc-rook:d02-calm', 'npc-rook:d02-calm']);
  });
});

// ---- stage harness: real QuestManager and effect runner, own state port with settable favour ----

function stageWorld(opts: { band?: Partial<Record<FavourTrack, FavourBand>>; gold?: number } = {}) {
  const w = makeWorld(questDefs);
  w.gold.n = opts.gold ?? 0;
  const bands: Record<string, FavourBand> = { halvard: 'banked', ...opts.band };
  const favourTotals: Record<string, number> = {};
  const state: StatePort = {
    getFlag: (k) => w.flags.get(k),
    setFlag: (k, v) => { w.flags.set(k, v); },
    clearFlag: (k) => { w.flags.delete(k); },
    favourBand: (t) => bands[t] ?? 'banked',
    favour: (t) => favourTotals[t] ?? 0,
    addFavour: (t, d) => { favourTotals[t] = (favourTotals[t] ?? 0) + d; return favourTotals[t]; },
  };
  const removed: string[] = [];
  const given: string[] = [];
  const inventory: InventoryPort & { realGold: number | undefined } = {
    realGold: undefined,
    remove: (id, n) => { removed.push(`${id}x${n}`); return true; },
    addGold: (n) => { w.gold.n += n; },
    get gold() { return this.realGold ?? w.gold.n; },
    takeGold: (n, reason) => { const t = Math.min(inventory.gold!, n); w.gold.n -= t; w.spent.push({ amount: t, reason }); return t; },
  };
  const effects = createEffectRunner({
    state, quests: w.manager as any, bus: w.bus, sourceId: 'test', inventory: () => inventory,
    enemies: () => w.enemies,
    progression: () => ({ grantXp: () => {}, grantAbility: () => {} }),
  } as any);
  // give effects land in the inventory log through the loot.granted event
  w.bus.on('loot.granted', (p) => { given.push(JSON.stringify(p)); });
  // rig: gold the conditions see (defaults to the real purse)
  const seen = { gold: undefined as number | undefined };
  const strings: StringsPort = { t: (k) => all[k] ?? `[[${k}]]`, has: hasKey };
  const dr = new DialogueRunner({ bus: w.bus, state, quests: w.manager, effects, strings, gold: () => seen.gold ?? w.gold.n });
  for (const d of defs) dr.register(d);
  const favourOf = (t: string) => favourTotals[t] ?? 0;
  /** Put a quest in a stage: active with the listed objectives done. */
  const stage = (q: string, ...objs: string[]) => { w.manager.start(q); for (const o of objs) w.manager.completeObjective(q, o); };
  const finish = (...qs: string[]) => { for (const q of qs) w.manager.complete(q); };
  return { ...w, dr, stage, finish, bands, favourOf, removed, given, seen, inventory };
}
type SW = ReturnType<typeof stageWorld>;

function play(w: SW, id: string, npc: string, pickArg: number | string | ((node: string) => number | string) = 1): string[] {
  const pick = typeof pickArg === 'function' ? pickArg : () => pickArg;
  expect(w.dr.start(id, npc)).toBe(true);
  const seen: string[] = [];
  for (let i = 0; i < 60 && w.dr.isOpen; i++) {
    const v = w.dr.view()!;
    seen.push(v.nodeId);
    if (v.choices.length) {
      const p = pick(v.nodeId);
      const idx = typeof p === 'number' ? p : v.choices.findIndex((c) => c.id === p) + 1;
      expect(idx, `choice ${String(p)} at ${v.nodeId}`).toBeGreaterThan(0);
      w.dr.choose(idx);
    } else w.dr.advance();
  }
  expect(w.dr.isOpen).toBe(false);
  return seen;
}
const first = (w: SW, d: string, npc: string) => play(w, d, npc)[0];
const choicesAt = (w: SW, d: string, npc: string, node: string): string[] => {
  expect(w.dr.start(d, npc)).toBe(true);
  for (let i = 0; i < 20 && w.dr.view()!.nodeId !== node; i++) {
    const v = w.dr.view()!;
    if (v.choices.length) w.dr.choose(1); else w.dr.advance();
  }
  const ids = w.dr.view()!.choices.map((c) => c.id);
  w.dr.close('script');
  return ids;
};

/** The route idles show once D02 is done (until then Rook talks about the sewers). */
const afterD02 = (w: SW) => { w.finish(...D02_PREREQUISITES); w.finish('d02'); };

describe('Rook: M06 Gates of Harrowmark', () => {
  it('offers after M05 (cold and banked variants), accept starts and credits o1, later does not', () => {
    for (const [band, node] of [['cold', 'm06-intro-cold'], ['banked', 'm06-intro']] as const) {
      const w = stageWorld({ band: { halvard: band } }); w.finish('m05');
      expect(play(w, 'npc-rook', 'rook', 2).slice(0, 4)).toEqual([node, 'm06-intro-2', 'm06-offer', 'm06-later']);
      expect(w.manager.state('m06')).toBe('inactive');
      play(w, 'npc-rook', 'rook', (n) => (n === 'm06-offer' ? 'accept' : 'sneak'));
      expect(w.manager.state('m06')).toBe('active');
      expect(w.manager.objectiveDone('m06', 'o1')).toBe(true);
    }
  });

  it('sneaking leaves the quest at o2, and he asks again next time', () => {
    const w = stageWorld({ gold: 500 }); w.stage('m06', 'o1');
    expect(play(w, 'npc-rook', 'rook', 'sneak')).toEqual(['m06-choose-again', 'm06-choose', 'm06-sneak']);
    expect(w.manager.objectiveDone('m06', 'o2')).toBe(false);
    expect(w.flags.get('story.m06.route')).toBeUndefined();
    expect(w.gold.n).toBe(500);
  });

  it('bribe needs the full fee: hidden at 49, charged at 50, walks into the proof and completes M06', () => {
    const poor = stageWorld({ gold: M06_BRIBE_GOLD - 1 }); poor.stage('m06', 'o1');
    expect(choicesAt(poor, 'npc-rook', 'rook', 'm06-choose')).toEqual(['sneak', 'argue-tip']);
    const w = stageWorld({ gold: M06_BRIBE_GOLD }); w.stage('m06', 'o1');
    expect(choicesAt(w, 'npc-rook', 'rook', 'm06-choose')).toEqual(['sneak', 'bribe', 'argue-tip']);
    const seen = play(w, 'npc-rook', 'rook', 'bribe');
    expect(seen).toEqual(['m06-choose-again', 'm06-choose', 'm06-bribe-ok', 'm06-proof', 'm06-proof-2', 'm06-proof-3']);
    expect(w.gold.n).toBe(0);
    expect(w.spent).toEqual([{ amount: M06_BRIBE_GOLD, reason: 'bribe' }]);
    expect(w.flags.get('story.m06.route')).toBe('bribe');
    expect(w.flags.get('story.m06.gateOpen')).toBe(true);
    expect(w.manager.state('m06')).toBe('completed');
    afterD02(w);
    expect(first(w, 'npc-rook', 'rook')).toBe('idle-bribe');
  });

  it('a bribe that the purse cannot cover halts: no flags, no objective, same node', () => {
    const w = stageWorld({ gold: 10 }); w.stage('m06', 'o1');
    w.seen.gold = M06_BRIBE_GOLD; // the condition believes there is enough, the purse disagrees
    expect(w.dr.start('npc-rook', 'rook')).toBe(true);
    w.dr.advance(); // choose-again -> choose
    expect(w.dr.view()!.nodeId).toBe('m06-choose');
    const n = w.dr.view()!.choices.findIndex((c) => c.id === 'bribe') + 1;
    expect(n).toBeGreaterThan(0);
    w.dr.choose(n);
    expect(w.dr.view()!.nodeId).toBe('m06-choose');
    expect(w.flags.get('story.m06.route')).toBeUndefined();
    expect(w.flags.get('story.m06.gateOpen')).toBeUndefined();
    expect(w.manager.objectiveDone('m06', 'o2')).toBe(false);
    expect(w.gold.n).toBe(10);
    w.dr.close('script');
  });

  it('argument is free at Stoked and Hearthbound and never charges', () => {
    for (const band of ['stoked', 'hearthbound'] as const) {
      const w = stageWorld({ band: { halvard: band }, gold: 0 }); w.stage('m06', 'o1');
      expect(choicesAt(w, 'npc-rook', 'rook', 'm06-choose')).toEqual(['sneak', 'argue-free']);
      const seen = play(w, 'npc-rook', 'rook', 'argue-free');
      expect(seen.slice(-4)).toEqual(['m06-argue-ok', 'm06-proof', 'm06-proof-2', 'm06-proof-3']);
      expect(w.flags.get('story.m06.route')).toBe('persuasion');
      expect(w.flags.get('story.m06.gateOpen')).toBe(true);
      expect(w.spent).toEqual([]);
      expect(w.manager.state('m06')).toBe('completed');
      afterD02(w);
      expect(first(w, 'npc-rook', 'rook')).toBe('idle-persuasion');
    }
  });

  it('at Banked the argument costs the tip (25), hidden at 24', () => {
    const poor = stageWorld({ band: { halvard: 'banked' }, gold: M06_TIP_GOLD - 1 }); poor.stage('m06', 'o1');
    expect(choicesAt(poor, 'npc-rook', 'rook', 'm06-choose')).toEqual(['sneak']);
    const w = stageWorld({ band: { halvard: 'banked' }, gold: M06_TIP_GOLD }); w.stage('m06', 'o1');
    expect(choicesAt(w, 'npc-rook', 'rook', 'm06-choose')).toEqual(['sneak', 'argue-tip']);
    const seen = play(w, 'npc-rook', 'rook', 'argue-tip');
    expect(seen).toContain('m06-argue-tip-ok');
    expect(w.gold.n).toBe(0);
    expect(w.flags.get('story.m06.route')).toBe('persuasion');
    expect(w.manager.state('m06')).toBe('completed');
  });

  it('Cold favour gets only sneak and bribe', () => {
    const w = stageWorld({ band: { halvard: 'cold' }, gold: 1000 }); w.stage('m06', 'o1');
    expect(choicesAt(w, 'npc-rook', 'rook', 'm06-choose')).toEqual(['sneak', 'bribe']);
  });

  it('after a stealth pass the proof scene runs, flags come from the quest, and the idle is the stealth line', () => {
    const w = stageWorld(); w.stage('m06', 'o1', 'o2');
    expect(play(w, 'npc-rook', 'rook')).toEqual(['m06-proof', 'm06-proof-2', 'm06-proof-3']);
    expect(w.manager.state('m06')).toBe('completed');
    expect(w.flags.get('story.m06.route')).toBe('stealth');
    afterD02(w);
    expect(first(w, 'npc-rook', 'rook')).toBe('idle-stealth');
  });
});

describe('Rook: D02', () => {
  it('names the first missing prerequisite in order, then the early line', () => {
    const order = ['r01', 'r02', 'm07', 'm08', 'm09', 'm10', 'r03', 'r04'];
    const w = stageWorld(); w.finish('m01', 'm02', 'm03', 'm04', 'm05', 'm06');
    for (const q of order) {
      expect(first(w, 'npc-rook', 'rook'), q).toBe(`d02-locked-${q}`);
      // finishing it moves the line on to the next missing quest
      w.finish(q);
    }
    expect(first(w, 'npc-rook', 'rook')).toBe('d02-offer');
    const early = stageWorld(); early.finish('m06', ...order);
    expect(first(early, 'npc-rook', 'rook')).toBe('d02-locked-early');
    // skipping from the back still reports the first in order
    const mixed = stageWorld(); mixed.finish('m01', 'm02', 'm03', 'm04', 'm05', 'm06', 'r03', 'm09');
    expect(first(mixed, 'npc-rook', 'rook')).toBe('d02-locked-r01');
  });

  it('locked lines name the unfinished work', () => {
    const t = (q: string) => dialogueStringsHmA[`dialogue.npc-rook.d02-locked-${q}`];
    expect(t('r01')).toMatch(/Wynn/); expect(t('r02')).toMatch(/Stane/); expect(t('m07')).toMatch(/Aldith/);
    expect(t('m08')).toMatch(/king/); expect(t('m09')).toMatch(/Merrin/); expect(t('m10')).toMatch(/Gerta/);
    expect(t('r03')).toMatch(/Aldith/); expect(t('r04')).toMatch(/Whitlock/);
  });

  it('later does not start; accept starts, credits o1, gives bread once, unlocks Calm and opens the Underways', () => {
    const w = stageWorld(); w.finish(...D02_PREREQUISITES);
    expect(play(w, 'npc-rook', 'rook', 2)).toEqual(['d02-offer', 'd02-offer-2']);
    expect(w.manager.state('d02')).toBe('inactive');
    expect(play(w, 'npc-rook', 'rook', 'accept')).toEqual(['d02-offer', 'd02-offer-2', 'd02-calm', 'd02-calm-2']);
    expect(w.manager.state('d02')).toBe('active');
    expect(w.manager.objectiveDone('d02', 'o1')).toBe(true);
    expect(w.flags.get('story.d02.breadGiven')).toBe(true);
    expect(w.flags.get('story.d02.underwaysOpen')).toBe(true);
    expect(w.enemies.unlocked).toEqual(['calm']);
    expect(w.bus.of('loot.granted').filter((p) => p?.itemId === 'hearth-bread' || JSON.stringify(p).includes('hearth-bread')).length).toBeLessThanOrEqual(1);
  });

  it('bread is not given twice when the calm node runs with the flag set', () => {
    const w = stageWorld(); w.finish(...D02_PREREQUISITES);
    w.flags.set('story.d02.breadGiven', true);
    const before = w.bus.log.length;
    play(w, 'npc-rook', 'rook', 'accept');
    expect(w.bus.log.slice(before).some((e) => JSON.stringify(e.payload ?? {}).includes('hearth-bread'))).toBe(false);
  });

  it('reminders follow the objectives and the report follows the Grimtooth outcome', () => {
    const w = stageWorld(); w.finish(...D02_PREREQUISITES.filter((q) => q !== 'd02')); w.stage('d02', 'o1');
    expect(first(w, 'npc-rook', 'rook')).toBe('d02-descend-remind');
    w.manager.completeObjective('d02', 'o2');
    expect(first(w, 'npc-rook', 'rook')).toBe('d02-hounds-remind');
    w.manager.completeObjective('d02', 'o3');
    expect(first(w, 'npc-rook', 'rook')).toBe('d02-grimtooth-remind');
    w.manager.completeObjective('d02', 'o4');
    w.flags.set('boss.gaffer-grimtooth.outcome', 'released');
    expect(play(w, 'npc-rook', 'rook')).toEqual(['d02-report-released', 'd02-report-released-2']);
    expect(w.manager.state('d02')).toBe('completed');
  });

  it('defeated outcome gets its own report', () => {
    const w = stageWorld(); w.finish(...D02_PREREQUISITES.filter((q) => q !== 'd02')); w.stage('d02', 'o1', 'o2', 'o3', 'o4');
    w.flags.set('boss.gaffer-grimtooth.outcome', 'defeated');
    expect(play(w, 'npc-rook', 'rook')).toEqual(['d02-report-defeated', 'd02-report-defeated-2']);
  });
});

describe('Aldith: M07 and R03', () => {
  it('offers M07 after M06 and starts it on accept only', () => {
    const w = stageWorld(); w.finish('m06');
    expect(play(w, 'npc-aldith', 'aldith', 2)).toEqual(['m07-offer', 'm07-offer-2']);
    expect(w.manager.state('m07')).toBe('inactive');
    expect(play(w, 'npc-aldith', 'aldith', 'accept')).toEqual(['m07-offer', 'm07-offer-2', 'm07-brief']);
    expect(w.manager.state('m07')).toBe('active');
    expect(w.manager.objectiveDone('m07', 'o1')).toBe(true);
  });

  it('reminders, then the return sets classOpen once and takes the satchel once', () => {
    const w = stageWorld(); w.finish('m06'); w.stage('m07', 'o1');
    expect(first(w, 'npc-aldith', 'aldith')).toBe('m07-remind-thieves');
    w.manager.completeObjective('m07', 'o2');
    expect(first(w, 'npc-aldith', 'aldith')).toBe('m07-remind-satchel');
    w.manager.completeObjective('m07', 'o3');
    expect(w.flags.get('story.m07.classOpen')).toBeUndefined();
    expect(play(w, 'npc-aldith', 'aldith')).toEqual(['m07-return', 'm07-return-2']);
    expect(w.flags.get('story.m07.classOpen')).toBe(true);
    expect(w.removed).toEqual(['stolen-satchelx1']);
    expect(w.manager.objectiveDone('m07', 'o4')).toBe(true);
    expect(first(w, 'npc-aldith', 'aldith')).toBe('m07-bastion-remind');
    expect(w.removed).toEqual(['stolen-satchelx1']);
  });

  it('a second run of the return node (flag already set) takes nothing', () => {
    const w = stageWorld(); w.finish('m06'); w.stage('m07', 'o1', 'o2', 'o3');
    w.flags.set('story.m07.classOpen', true);
    play(w, 'npc-aldith', 'aldith');
    expect(w.removed).toEqual([]);
  });

  it('offers R03 after M07, with reminders per stage', () => {
    const w = stageWorld(); w.finish('m06', 'm07');
    expect(play(w, 'npc-aldith', 'aldith', 2)).toEqual(['r03-offer', 'r03-offer-2']);
    expect(w.manager.state('r03')).toBe('inactive');
    expect(play(w, 'npc-aldith', 'aldith', 'accept').at(-1)).toBe('r03-brief');
    expect(w.manager.objectiveDone('r03', 'o1')).toBe(true);
    expect(first(w, 'npc-aldith', 'aldith')).toBe('r03-remind-thugs');
    w.manager.completeObjective('r03', 'o2');
    expect(first(w, 'npc-aldith', 'aldith')).toBe('r03-remind-copper');
  });

  it('forgiving the debt pays nothing and marks the inn price forgiven', () => {
    const w = stageWorld({ gold: 7 }); w.finish('m06', 'm07'); w.stage('r03', 'o1', 'o2', 'o3');
    expect(choicesAt(w, 'npc-aldith', 'aldith', 'r03-settle')).toEqual(['forgive', 'collect']);
    expect(play(w, 'npc-aldith', 'aldith', 'forgive')).toEqual(['r03-settle', 'r03-forgive-end']);
    expect(w.gold.n).toBe(7);
    expect(w.flags.get('world.harrowmark.inn.price')).toBe('forgiven');
    expect(w.removed).toEqual(['brewing-copperx1']);
    expect(w.manager.state('r03')).toBe('completed');
    expect(first(w, 'npc-aldith', 'aldith')).toBe('idle-forgiven');
    expect(dialogueStringsHmA['dialogue.npc-aldith.r03-forgive-end']).toMatch(/cheaper/);
  });

  it('collecting pays R03_COIN_GOLD and marks the price collected', () => {
    const w = stageWorld({ gold: 7 }); w.finish('m06', 'm07'); w.stage('r03', 'o1', 'o2', 'o3');
    expect(play(w, 'npc-aldith', 'aldith', 'collect')).toEqual(['r03-settle', 'r03-collect-end']);
    expect(w.gold.n).toBe(7 + R03_COIN_GOLD);
    expect(w.flags.get('world.harrowmark.inn.price')).toBe('collected');
    expect(w.manager.state('r03')).toBe('completed');
    expect(first(w, 'npc-aldith', 'aldith')).toBe('idle-collected');
  });

  it('plain idle before any of it', () => {
    expect(first(stageWorld(), 'npc-aldith', 'aldith')).toBe('idle');
  });
});

describe('Wystan: M08', () => {
  it('offers after M07, accept starts and credits o1, later does not', () => {
    const w = stageWorld(); w.finish('m07');
    expect(play(w, 'npc-wystan', 'wystan', 2)).toEqual(['m08-offer', 'm08-offer-2']);
    expect(w.manager.state('m08')).toBe('inactive');
    expect(play(w, 'npc-wystan', 'wystan', 'accept')).toEqual(['m08-offer', 'm08-offer-2', 'm08-brief']);
    expect(w.manager.objectiveDone('m08', 'o1')).toBe(true);
  });

  it('reminds by stage and reports by stance', () => {
    const w = stageWorld(); w.finish('m07'); w.stage('m08', 'o1');
    expect(first(w, 'npc-wystan', 'wystan')).toBe('m08-go-remind');
    w.manager.completeObjective('m08', 'o2');
    expect(first(w, 'npc-wystan', 'wystan')).toBe('m08-hall-remind');
    w.manager.completeObjective('m08', 'o3');
    expect(w.dr.start('npc-wystan', 'wystan')).toBe(true); w.dr.close('script');
    for (const [stance, node] of [['meek', 'm08-report-meek'], ['bold', 'm08-report-bold'], ['steady', 'm08-report-steady'], [undefined, 'm08-report-steady']] as const) {
      if (stance) w.flags.set('story.m08.stance', stance); else w.flags.delete('story.m08.stance');
      expect(w.dr.start('npc-wystan', 'wystan')).toBe(true);
      expect(w.dr.view()!.nodeId).toBe(node);
      w.dr.close('script');
    }
    w.flags.set('story.m08.stance', 'bold');
    expect(play(w, 'npc-wystan', 'wystan')).toEqual(['m08-report-bold']);
    expect(w.manager.objectiveDone('m08', 'o4')).toBe(true); // the report credits the last talk objective
    expect(w.manager.state('m08')).toBe('completed');
  });

  it('idles by Halvard band and mentions the signet after M08', () => {
    for (const [band, node] of [['cold', 'idle-cold'], ['banked', 'idle-banked'], ['stoked', 'idle'], ['hearthbound', 'idle']] as const) {
      const w = stageWorld({ band: { halvard: band } });
      const seen = play(w, 'npc-wystan', 'wystan');
      expect(seen).toEqual([node]);
      w.finish('m08');
      expect(play(w, 'npc-wystan', 'wystan')).toEqual([node, 'idle-signet']);
    }
    expect(dialogueStringsHmA['dialogue.npc-wystan.idle-signet']).toMatch(/signet/);
  });
});

describe('Edric and the Regent', () => {
  const ready = () => { const w = stageWorld({ gold: 0 }); w.finish('m07'); w.stage('m08', 'o1', 'o2'); return w; };
  const answers = (a: string, b: string, c: string) => (n: string) => (n === 'q1' ? a : n === 'q2' ? b : n === 'q3' ? c : 1);

  it('is a polite child outside the audience', () => {
    expect(first(stageWorld(), 'npc-edric', 'edric')).toBe('idle-child');
    const w = stageWorld(); w.finish('m08');
    expect(first(w, 'npc-edric', 'edric')).toBe('idle-child');
    const early = stageWorld(); early.stage('m08', 'o1');
    expect(first(early, 'npc-edric', 'edric')).toBe('idle'); // active but not yet in the hall
  });

  it('runs 3 questions of 3 choices each, speakers by node, and ends the talk', () => {
    const w = ready();
    const events: string[] = [];
    w.bus.on('story.m08.audience.begin', () => events.push('begin'));
    w.bus.on('story.m08.audience.end', () => events.push('end'));
    const seen = play(w, 'npc-edric', 'edric', answers('honest', 'honest', 'honest'));
    expect(seen).toEqual(['aud-1', 'aud-2', 'q1', 'q1-honest', 'q2', 'q2-honest', 'q3', 'q3-honest', 'aud-end', 'aud-end-2']);
    expect(events).toEqual(['begin', 'end']);
    expect(w.manager.objectiveDone('m08', 'o3')).toBe(true);
    for (const q of ['q1', 'q2', 'q3']) {
      const n = npcEdric.nodes.find((x) => x.id === q)!;
      expect(n.speaker).toBe('vey');
      expect(n.choices!.map((c) => c.id)).toEqual(['meek', 'honest', 'bold']);
    }
    for (const id of ['aud-end', 'aud-end-2']) expect(npcEdric.nodes.find((x) => x.id === id)!.speaker).toBe('edric');
    expect(npcEdric.nodes.length).toBeLessThanOrEqual(20);
  });

  it('all answers are reachable and nothing can fail', () => {
    const kinds = ['meek', 'honest', 'bold'];
    const visited = new Set<string>();
    for (const a of kinds) for (const b of kinds) for (const c of kinds) {
      const w = ready();
      const seen = play(w, 'npc-edric', 'edric', answers(a, b, c));
      seen.forEach((s) => visited.add(s));
      expect(seen.at(-1)).toBe('aud-end-2');
      expect(w.manager.objectiveDone('m08', 'o3')).toBe(true);
    }
    for (const n of npcEdric.nodes.filter((x) => x.id !== 'idle' && x.id !== 'idle-child')) expect(visited.has(n.id), n.id).toBe(true);
  });

  it('favour and stance follow each answer', () => {
    const w = ready();
    play(w, 'npc-edric', 'edric', answers('meek', 'honest', 'honest'));
    expect(w.favourOf('halvard')).toBe(2);
    expect(w.favourOf('oswin')).toBe(0);
    expect(w.flags.get('story.m08.stance')).toBe('steady');

    const m = ready();
    play(m, 'npc-edric', 'edric', answers('meek', 'meek', 'meek'));
    expect(m.favourOf('halvard')).toBe(6);
    expect(m.favourOf('oswin')).toBe(0);
    expect(m.flags.get('story.m08.stance')).toBe('meek');

    const b = ready();
    play(b, 'npc-edric', 'edric', answers('bold', 'bold', 'bold'));
    expect(b.favourOf('oswin')).toBe(6);
    expect(b.favourOf('halvard')).toBe(-3);
    expect(b.flags.get('story.m08.stance')).toBe('bold');

    const h = ready();
    play(h, 'npc-edric', 'edric', answers('honest', 'honest', 'honest'));
    expect(h.favourOf('halvard')).toBe(0);
    expect(h.favourOf('oswin')).toBe(0);
  });

  it('only Q3 sets the stance flag', () => {
    for (const q of ['q1', 'q2']) {
      const n = npcEdric.nodes.find((x) => x.id === q)!;
      for (const c of n.choices!) expect(JSON.stringify(c.effects ?? [])).not.toContain('stance');
    }
    const q3 = npcEdric.nodes.find((x) => x.id === 'q3')!;
    expect(q3.choices!.map((c) => (c.effects as any[]).find((e) => 'setFlag' in e).value)).toEqual(['meek', 'steady', 'bold']);
  });
});
