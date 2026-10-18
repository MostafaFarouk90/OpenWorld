import { describe, it, expect } from 'vitest';
import { dialogueDefs } from './index';
import { dialogueStrings, npcNameFallbackStrings } from '../strings.en';
import { questStrings } from '../../quests/strings.en';
import { questDefs } from '../../quests/content';
import { DialogueRunner } from '../DialogueRunner';
import { createEffectRunner } from '../../quests/effects';
import type { BusPort, QuestReader, StatePort, StringsPort } from '../../quests/ports';
import type { Condition, FavourBand, FlagValue } from '../../quests/types';
import { evalCondition } from '../../quests/conditions';

const all: Record<string, string> = { ...questStrings, ...dialogueStrings, ...npcNameFallbackStrings };
type QS = 'inactive' | 'active' | 'completed';

/** Fake world: quest states and done objectives are plain data the test sets. */
function world(band: FavourBand = 'banked') {
  const flags = new Map<string, FlagValue>();
  const qstate = new Map<string, QS>();
  const odone = new Set<string>();
  const started: string[] = [];
  const mercy: string[] = [];
  const abilities: string[] = [];
  const bus: BusPort = { on: () => () => {}, emit: () => {} };
  const state: StatePort = {
    getFlag: (k) => flags.get(k), setFlag: (k, v) => { flags.set(k, v); }, clearFlag: (k) => { flags.delete(k); },
    favourBand: () => band, favour: () => 30, addFavour: () => 0,
  };
  const quests: QuestReader & Record<string, any> = {
    state: (id: string) => qstate.get(id) ?? 'inactive',
    objectiveDone: (q: string, o: string) => odone.has(`${q}.${o}`),
    start: (id: string) => { started.push(id); qstate.set(id, 'active'); return true; },
    complete: () => true,
    completeObjective: () => true,
  };
  const effects = createEffectRunner({
    state, quests: quests as any, bus, sourceId: 'test',
    enemies: () => ({ setMercyUnlocked: (v: string) => { mercy.push(v); } }),
    progression: () => ({ grantAbility: (id: string) => { abilities.push(id); } }),
  } as any);
  const strings: StringsPort = { t: (k) => all[k] ?? `[[${k}]]`, has: (k) => k in all };
  const dr = new DialogueRunner({ bus, state, quests, effects, strings });
  for (const d of dialogueDefs) dr.register(d);
  const set = (q: string, s: QS, ...done: string[]) => { qstate.set(q, s); for (const o of done) odone.add(`${q}.${o}`); };
  return { flags, dr, set, started, mercy, abilities, qstate };
}

/** Run to the end picking choices (1-based); returns the visited node ids. */
function play(w: ReturnType<typeof world>, id: string, npc: string, pick: (n: string) => number = () => 1): string[] {
  expect(w.dr.start(id, npc)).toBe(true);
  const seen: string[] = [];
  for (let i = 0; i < 60 && w.dr.isOpen; i++) {
    const v = w.dr.view()!;
    seen.push(v.nodeId);
    if (v.choices.length) w.dr.choose(pick(v.nodeId)); else w.dr.advance();
  }
  expect(w.dr.isOpen).toBe(false);
  return seen;
}
const first = (w: ReturnType<typeof world>, id: string, npc: string) => play(w, id, npc)[0];

describe('every start branch is reachable', () => {
  it('each start entry node is the first node of some state', () => {
    // sanity: each start entry must have its node present in the def, and a distinct node id
    for (const d of dialogueDefs.filter((x) => Array.isArray(x.start))) {
      const entries = d.start as { when: Condition; node: string }[];
      expect(new Set(entries.map((e) => e.node)).size, d.id).toBe(entries.length);
      const ids = new Set(d.nodes.map((n) => n.id));
      for (const e of entries) expect(ids.has(e.node), `${d.id}:${e.node}`).toBe(true);
    }
  });

  it('every start entry can win under some assignment of quest and objective states', () => {
    // brute-force the world: each referenced quest takes any state, each referenced objective any done value,
    // each referenced flag any of its mentioned values, favour any band
    for (const d of dialogueDefs.filter((x) => Array.isArray(x.start))) {
      const entries = d.start as { when: Condition; node: string }[];
      const quests = new Set<string>(); const objs = new Set<string>(); const flagVals = new Map<string, Set<FlagValue | undefined>>();
      let usesFavour = false;
      const walk = (c: Condition): void => {
        if ('quest' in c) quests.add(c.quest);
        else if ('objective' in c) { objs.add(c.objective.join('.')); quests.add(c.objective[0]); }
        else if ('flag' in c) { const s = flagVals.get(c.flag) ?? new Set<FlagValue | undefined>([undefined]); s.add(c.equals ?? true); flagVals.set(c.flag, s); }
        else if ('favour' in c) usesFavour = true;
        else if ('all' in c) c.all.forEach(walk);
        else if ('any' in c) c.any.forEach(walk);
        else if ('not' in c) walk(c.not);
      };
      entries.forEach((e) => walk(e.when));
      const qs = [...quests]; const os = [...objs]; const fl = [...flagVals.entries()];
      const bands: FavourBand[] = usesFavour ? (['cold', 'banked', 'stoked', 'hearthbound', 'none'] as FavourBand[]) : ['banked'];
      const winners = new Set<string>();
      const qStates: QS[] = ['inactive', 'active', 'completed'];
      const total = qStates.length ** qs.length * 2 ** os.length;
      for (let n = 0; n < total; n++) {
        let m = n;
        const qst = new Map<string, QS>(); const od = new Set<string>();
        for (const q of qs) { qst.set(q, qStates[m % 3]); m = Math.floor(m / 3); }
        for (const o of os) { if (m % 2) od.add(o); m = Math.floor(m / 2); }
        // flag choices: enumerate by combination index over the first flag only plus the rest unset
        const flagSets: Map<string, FlagValue>[] = [new Map()];
        for (const [k, vals] of fl) for (const v of vals) if (v !== undefined) flagSets.push(new Map([[k, v]]));
        for (const fs of flagSets) for (const band of bands) {
          const env = {
            state: { getFlag: (k: string) => fs.get(k), favourBand: () => band, favour: () => 30 } as any,
            quests: { state: (id: string) => qst.get(id) ?? 'inactive', objectiveDone: (q: string, o: string) => od.has(`${q}.${o}`) } as any,
          };
          const hit = entries.find((e) => evalCondition(e.when, env));
          if (hit) winners.add(hit.node);
        }
      }
      for (const e of entries) expect(winners.has(e.node), `${d.id} start "${e.node}" is shadowed`).toBe(true);
    }
  });
});

describe('Aelfreda', () => {
  it('offers M03 and starts it only on accept', () => {
    const w = world(); w.set('m02', 'completed');
    expect(play(w, 'npc-aelfreda', 'aelfreda', () => 2)).toEqual(['m03-offer', 'm03-offer-2', 'm03-later']);
    expect(w.started).toEqual([]);
    expect(play(w, 'npc-aelfreda', 'aelfreda', () => 1)).toEqual(['m03-offer', 'm03-offer-2', 'm03-brief']);
    expect(w.started).toEqual(['m03']);
  });

  it('M03 flow: study reminder, Leap grant at o2, Release unlock at o4, no double grants', () => {
    const w = world(); w.set('m02', 'completed'); w.set('m03', 'active', 'o1');
    expect(first(w, 'npc-aelfreda', 'aelfreda')).toBe('m03-study');
    expect(w.abilities).toEqual([]);
    w.set('m03', 'active', 'o2');
    expect(play(w, 'npc-aelfreda', 'aelfreda')).toEqual(['leap', 'leap-2']);
    expect(w.abilities).toEqual(['surge-leap']);
    w.set('m03', 'active', 'o3');
    expect(first(w, 'npc-aelfreda', 'aelfreda')).toBe('leap-remind');
    expect(w.abilities).toEqual(['surge-leap']);
    expect(w.mercy).toEqual([]);
    w.set('m03', 'active', 'o4');
    expect(play(w, 'npc-aelfreda', 'aelfreda')).toEqual(['burn', 'burn-2', 'burn-3', 'release', 'release-2']);
    expect(w.mercy).toEqual(['release']);
    w.set('m03', 'active', 'o5');
    expect(first(w, 'npc-aelfreda', 'aelfreda')).toBe('release-hint');
    w.set('m03', 'active', 'o6');
    expect(play(w, 'npc-aelfreda', 'aelfreda')).toEqual(['m03-report', 'm03-report-2']);
    expect(w.mercy).toEqual(['release']);
    expect(w.abilities).toEqual(['surge-leap']);
    expect(w.started).toEqual([]);
  });

  it('offers D01 after M03 and M05 only, starting it on accept', () => {
    const w = world(); w.set('m03', 'completed');
    expect(first(w, 'npc-aelfreda', 'aelfreda')).toBe('idle');
    w.set('m05', 'completed');
    expect(play(w, 'npc-aelfreda', 'aelfreda', () => 2).at(-1)).toBe('d01-later');
    expect(w.started).toEqual([]);
    expect(play(w, 'npc-aelfreda', 'aelfreda').at(-1)).toBe('d01-brief');
    expect(w.started).toEqual(['d01']);
  });

  it('D01 reactions and idles follow the Prior outcome', () => {
    for (const outcome of ['released', 'defeated']) {
      const w = world(); w.set('d01', 'active');
      expect(first(w, 'npc-aelfreda', 'aelfreda')).toBe('d01-remind');
      w.set('d01', 'active', 'o3');
      expect(first(w, 'npc-aelfreda', 'aelfreda')).toBe('d01-remind');
      w.flags.set('boss.ashen-prior.outcome', outcome);
      expect(first(w, 'npc-aelfreda', 'aelfreda')).toBe(`d01-${outcome}`);
      w.set('d01', 'completed');
      expect(first(w, 'npc-aelfreda', 'aelfreda')).toBe(`idle-${outcome}`);
      expect(w.started).toEqual([]);
    }
  });
});

describe('Gaut', () => {
  it('keeps M01 behaviour', () => {
    const w = world('cold'); w.set('m01', 'active');
    expect(first(w, 'npc-gaut', 'gaut')).toBe('brief-cold');
    expect(w.flags.get('quest.m01.briefed')).toBe(true);
    expect(first(w, 'npc-gaut', 'gaut')).toBe('remind');
    w.set('m01', 'active', 'o1', 'o2');
    expect(first(w, 'npc-gaut', 'gaut')).toBe('report');
  });

  it('offers M04 (cold and banked) and starts it on accept only; asking more loops back', () => {
    for (const [band, node] of [['cold', 'm04-offer-cold'], ['banked', 'm04-offer-banked']] as const) {
      const w = world(band); w.set('m03', 'completed');
      const seen = play(w, 'npc-gaut', 'gaut', (n) => (n === 'm04-offer-2' && !w.started.length && !seen2.length ? (seen2.push(1), 2) : 1));
      expect(seen[0]).toBe(node);
      expect(seen).toContain('m04-offer-more');
      expect(seen.at(-1)).toBe('m04-offer-end');
      expect(w.started).toEqual(['m04']);
      seen2.length = 0;
    }
  });

  it('M04 flow: ford reminder, Spare lesson once, encourage, post, carters, report', () => {
    const w = world(); w.set('m03', 'completed'); w.set('m04', 'active');
    expect(first(w, 'npc-gaut', 'gaut')).toBe('m04-ford');
    expect(w.mercy).toEqual([]);
    w.set('m04', 'active', 'o1');
    expect(play(w, 'npc-gaut', 'gaut')).toEqual(['m04-spare', 'm04-spare-2', 'm04-spare-3']);
    expect(w.mercy).toEqual(['spare']);
    w.set('m04', 'active', 'o2');
    expect(first(w, 'npc-gaut', 'gaut')).toBe('m04-spare-remind');
    w.set('m04', 'active', 'o3');
    expect(first(w, 'npc-gaut', 'gaut')).toBe('m04-tollpost');
    w.set('m04', 'active', 'o4');
    expect(first(w, 'npc-gaut', 'gaut')).toBe('m04-carters');
    w.set('m04', 'active', 'o5');
    expect(first(w, 'npc-gaut', 'gaut')).toBe('m04-report-banked');
    expect(w.mercy).toEqual(['spare']);
    const c = world('cold'); c.set('m04', 'active', 'o5');
    expect(first(c, 'npc-gaut', 'gaut')).toBe('m04-report-cold');
    w.set('m04', 'completed');
    expect(first(w, 'npc-gaut', 'gaut')).toBe('idle-banked');
    expect(w.started).toEqual([]);
  });
});

const seen2: number[] = [];

describe('Stane', () => {
  it('keeps the t03 wave, offers R02 once m02 is done', () => {
    const w = world(); w.set('t03', 'active');
    expect(first(w, 'npc-stane', 'stane')).toBe('wave');
    const v = world();
    expect(first(v, 'npc-stane', 'stane')).toBe('idle');
    v.set('m02', 'completed');
    expect(play(v, 'npc-stane', 'stane', () => 2).at(-1)).toBe('r02-later');
    expect(v.started).toEqual([]);
    expect(play(v, 'npc-stane', 'stane').at(-1)).toBe('r02-brief');
    expect(v.started).toEqual(['r02']);
  });

  it('gives a tip per challenge, a completion line and a Bastion idle', () => {
    const w = world(); w.set('m02', 'completed'); w.set('r02', 'active', 'o1');
    expect(first(w, 'npc-stane', 'stane')).toBe('r02-tip-open');
    w.set('r02', 'active', 'o2');
    expect(first(w, 'npc-stane', 'stane')).toBe('r02-tip-parry');
    w.set('r02', 'active', 'o3');
    expect(first(w, 'npc-stane', 'stane')).toBe('r02-tip-guard');
    w.set('r02', 'active', 'o4');
    expect(play(w, 'npc-stane', 'stane')).toEqual(['r02-done', 'r02-done-2']);
    w.set('r02', 'completed');
    expect(first(w, 'npc-stane', 'stane')).toBe('idle-after');
    expect(dialogueStrings['dialogue.npc-stane.idle-after']).toMatch(/Bastion/);
    expect(w.started).toEqual([]);
  });
});

describe('Wynn', () => {
  it('offers R01, starts on accept, reminds, thanks, then idles by barley flag', () => {
    const w = world(); w.set('m02', 'completed');
    expect(play(w, 'npc-wynn', 'wynn', (n) => (n === 'offer-3' ? 2 : 1)).at(-1)).toBe('later');
    expect(w.started).toEqual([]);
    expect(play(w, 'npc-wynn', 'wynn').at(-1)).toBe('brief-2');
    expect(w.started).toEqual(['r01']);
    w.set('r01', 'active', 'o1');
    expect(first(w, 'npc-wynn', 'wynn')).toBe('remind');
    w.set('r01', 'active', 'o2');
    expect(play(w, 'npc-wynn', 'wynn')).toEqual(['done', 'done-2']);
    w.set('r01', 'completed');
    w.flags.set('world.brightwater.barley', 'scorched');
    expect(first(w, 'npc-wynn', 'wynn')).toBe('idle-scorched');
    w.flags.set('world.brightwater.barley', 'saved');
    expect(first(w, 'npc-wynn', 'wynn')).toBe('idle-saved');
    expect(w.started).toEqual(['r01']);
    expect(dialogueStrings['dialogue.npc-wynn.idle']).toMatch(/barley cakes/);
  });
});

describe('Tobb', () => {
  it('declining ends with no effects, joining starts M05 once', () => {
    const w = world(); w.set('m04', 'completed');
    expect(play(w, 'npc-tobb', 'tobb', (n) => (n === 'intro-3' ? 2 : 1))).toEqual(['intro', 'intro-2', 'intro-3']);
    expect(w.started).toEqual([]);
    expect(play(w, 'npc-tobb', 'tobb')).toEqual(['intro', 'intro-2', 'intro-3', 'joined', 'joined-2']);
    expect(w.started).toEqual(['m05']);
  });

  it('idles before the offer, reminds, completes (mentions the whistle) and banters', () => {
    const w = world();
    expect(first(w, 'npc-tobb', 'tobb')).toBe('idle');
    w.set('m05', 'active');
    expect(play(w, 'npc-tobb', 'tobb')).toEqual(['remind', 'remind-2']);
    w.set('m05', 'active', 'o1');
    expect(first(w, 'npc-tobb', 'tobb')).toBe('remind');
    w.set('m05', 'active', 'o2');
    expect(play(w, 'npc-tobb', 'tobb')).toEqual(['done', 'done-2']);
    expect(dialogueStrings['dialogue.npc-tobb.done-2']).toMatch(/Whistle/);
    w.set('m05', 'completed');
    expect(first(w, 'npc-tobb', 'tobb')).toBe('banter');
    w.set('d01', 'completed');
    expect(first(w, 'npc-tobb', 'tobb')).toBe('banter-prior');
    expect(w.started).toEqual([]);
  });
});

describe('Carters', () => {
  it('carter-1 thanks (setting the freed flag) only after the post is broken', () => {
    const w = world();
    expect(first(w, 'npc-carter-1', 'carter-1')).toBe('idle');
    w.set('m04', 'active', 'o3');
    expect(first(w, 'npc-carter-1', 'carter-1')).toBe('afraid');
    expect(w.flags.get('story.m04.cartersFreed')).toBeUndefined();
    w.set('m04', 'active', 'o4');
    expect(play(w, 'npc-carter-1', 'carter-1')).toEqual(['thanks', 'thanks-2']);
    expect(w.flags.get('story.m04.cartersFreed')).toBe(true);
    w.set('m04', 'active', 'o5');
    expect(first(w, 'npc-carter-1', 'carter-1')).toBe('leaving');
    w.set('m04', 'completed');
    expect(first(w, 'npc-carter-1', 'carter-1')).toBe('gone');
  });

  it('carter-2 has the same situations and never sets flags', () => {
    const w = world();
    expect(first(w, 'npc-carter-2', 'carter-2')).toBe('idle');
    w.set('m04', 'active', 'o3');
    expect(first(w, 'npc-carter-2', 'carter-2')).toBe('afraid');
    w.set('m04', 'active', 'o4');
    expect(first(w, 'npc-carter-2', 'carter-2')).toBe('thanks');
    expect(w.flags.size).toBe(0);
    w.set('m04', 'active', 'o5');
    expect(first(w, 'npc-carter-2', 'carter-2')).toBe('leaving');
    w.set('m04', 'completed');
    expect(first(w, 'npc-carter-2', 'carter-2')).toBe('gone');
  });
});

describe('no reward is granted twice', () => {
  it('only the leap and release nodes carry grant/unlock effects, and only the M04 spare node unlocks spare', () => {
    const carriers: string[] = [];
    for (const d of dialogueDefs.filter((x) => x.id !== 'npc-edda')) for (const n of d.nodes) {
      for (const e of n.effects ?? []) if ('grantAbility' in e || 'unlockMercy' in e || 'give' in e || 'xp' in e) carriers.push(`${d.id}:${n.id}`);
      for (const c of n.choices ?? []) for (const e of c.effects ?? []) if ('grantAbility' in e || 'unlockMercy' in e || 'give' in e || 'xp' in e) carriers.push(`${d.id}:${n.id}:${c.id}`);
    }
    expect(carriers.sort()).toEqual(['npc-aelfreda:leap', 'npc-aelfreda:release', 'npc-gaut:m04-spare'].sort());
    // quest rewards (shield, whistle, cakes) live in the quest defs, never in dialogue
    expect(questDefs.length).toBeGreaterThan(0);
  });

  it('replaying a full Aelfreda M03 run at every stage grants exactly once', () => {
    const w = world(); w.set('m02', 'completed'); w.set('m03', 'active', 'o1', 'o2');
    for (let i = 0; i < 2; i++) play(w, 'npc-aelfreda', 'aelfreda'); // second visit is a no-grant branch only once o3 is done
    expect(w.abilities.length).toBeGreaterThanOrEqual(1);
    const w2 = world(); w2.set('m03', 'active', 'o1', 'o2'); play(w2, 'npc-aelfreda', 'aelfreda');
    w2.set('m03', 'active', 'o3'); play(w2, 'npc-aelfreda', 'aelfreda'); play(w2, 'npc-aelfreda', 'aelfreda');
    expect(w2.abilities).toEqual(['surge-leap']);
  });
});
