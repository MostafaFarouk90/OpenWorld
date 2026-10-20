import { describe, it, expect } from 'vitest';
import { npcMerrin } from './npc-merrin.dialogue';
import { npcGerta } from './npc-gerta.dialogue';
import { npcWhitlock } from './npc-whitlock.dialogue';
import { dialogueStringsHmB } from '../strings.hm-b.en';
import { dialogueStrings, npcNameFallbackStrings } from '../strings.en';
import { questStrings } from '../../quests/strings.en';
import { validateDialogue } from '../validate';
import { DialogueRunner } from '../DialogueRunner';
import { createEffectRunner } from '../../quests/effects';
import { makeWorld } from '../../quests/testKit';
import { m07 } from '../../quests/content/m07.quest';
import { m08 } from '../../quests/content/m08.quest';
import { m09 } from '../../quests/content/m09.quest';
import { m10 } from '../../quests/content/m10.quest';
import { r04 } from '../../quests/content/r04.quest';
import type { StatePort, StringsPort } from '../../quests/ports';
import type { DialogueDef, FavourTrack } from '../../quests/types';

const defs: DialogueDef[] = [npcMerrin, npcGerta, npcWhitlock];
const all: Record<string, string> = { ...questStrings, ...dialogueStrings, ...npcNameFallbackStrings, ...dialogueStringsHmB };
const hasKey = (k: string) => k in all;

describe('Harrowmark B dialogue content', () => {
  it.each(defs.map((d) => [d.id, d] as const))('%s validates clean', (_id, def) => {
    const r = validateDialogue(def, hasKey);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it('every text key exists and every string key belongs to a node or choice', () => {
    const used = new Set<string>();
    for (const d of defs) for (const n of d.nodes) {
      expect(hasKey(n.textKey), n.textKey).toBe(true);
      used.add(n.textKey);
      for (const c of n.choices ?? []) { expect(hasKey(c.textKey), c.textKey).toBe(true); used.add(c.textKey); }
    }
    expect(Object.keys(dialogueStringsHmB).filter((k) => !used.has(k))).toEqual([]);
  });

  it('start arrays end with an always-true idle entry and every node is reachable', () => {
    for (const d of defs) {
      const last = (d.start as { when: unknown; node: string }[]).at(-1)!;
      expect(last.when).toEqual({ all: [] });
      expect(last.node).toBe('idle');
    }
  });

  it('no dashes and no literal player name', () => {
    for (const [k, v] of Object.entries(dialogueStringsHmB)) {
      expect(v, k).not.toMatch(/[‒-―]/);
      expect(v, k).not.toMatch(/ - /);
      expect(v, k).not.toMatch(/Cael/);
    }
  });
});

/** A dialogue runner over a real QuestManager with a state port that records favour changes. */
function setup() {
  const w = makeWorld([m07, m08, m09, m10, r04]);
  const favourCalls: { track: FavourTrack; delta: number }[] = [];
  const state: StatePort = {
    ...w.state,
    addFavour: (track, delta, source) => { favourCalls.push({ track, delta }); return w.state.addFavour(track, delta, source); },
  };
  const quests = w.manager;
  const effects = createEffectRunner({ state, quests, bus: w.bus, sourceId: 'test' } as any);
  const strings: StringsPort = { t: (k) => all[k] ?? `[[${k}]]`, has: hasKey };
  const dr = new DialogueRunner({ bus: w.bus, state, quests, effects, strings });
  for (const d of defs) dr.register(d);
  const play = (dialogueId: string, npc: string, pick: (node: string) => number = () => 1): string[] => {
    expect(dr.start(dialogueId, npc)).toBe(true);
    const seen: string[] = [];
    for (let i = 0; i < 40 && dr.isOpen; i++) {
      const v = dr.view()!;
      seen.push(v.nodeId);
      if (v.choices.length) dr.choose(pick(v.nodeId)); else dr.advance();
    }
    expect(dr.isOpen).toBe(false);
    return seen;
  };
  const first = (id: string, npc: string) => play(id, npc)[0];
  /** Put a quest in progress with the given objectives credited (sequential order). */
  const progress = (q: string, ...objs: string[]) => {
    w.manager.start(q);
    for (const o of objs) w.manager.completeObjective(q, o);
  };
  return { w, dr, play, first, progress, favourCalls };
}

describe('Merrin and M09', () => {
  it('offers M09 only after M08 and sets houseOpen on accept, not before', () => {
    const s = setup();
    expect(s.first('npc-merrin', 'merrin')).toBe('idle');
    s.w.manager.complete('m08');
    expect(s.play('npc-merrin', 'merrin', (n) => (n === 'm09-offer-2' ? 2 : 1))).toEqual(['m09-offer', 'm09-offer-2']);
    expect(s.w.manager.state('m09')).toBe('inactive');
    expect(s.w.flags.get('story.m09.houseOpen')).toBeUndefined();
    s.dr.start('npc-merrin', 'merrin');
    s.dr.advance();
    expect(s.dr.view()!.nodeId).toBe('m09-offer-2');
    expect(s.w.flags.get('story.m09.houseOpen')).toBeUndefined();
    s.dr.choose(1);
    expect(s.dr.view()!.nodeId).toBe('m09-brief');
    expect(s.w.flags.get('story.m09.houseOpen')).toBe(true);
    s.dr.advance();
    expect(s.w.manager.state('m09')).toBe('active');
    expect(s.w.manager.objectiveDone('m09', 'o1')).toBe(true);
  });

  it('shows the right node for each M09 stage and completes on the report', () => {
    const s = setup();
    s.progress('m09');
    expect(s.first('npc-merrin', 'merrin')).toBe('m09-brief');
    s.w.manager.completeObjective('m09', 'o1');
    expect(s.first('npc-merrin', 'merrin')).toBe('m09-remind-enter');
    s.w.manager.completeObjective('m09', 'o2');
    expect(s.first('npc-merrin', 'merrin')).toBe('m09-remind-invoices');
    s.w.manager.completeObjective('m09', 'o3');
    expect(s.first('npc-merrin', 'merrin')).toBe('m09-remind-exit');
    s.w.manager.completeObjective('m09', 'o4');
    expect(s.play('npc-merrin', 'merrin')).toEqual(['m09-report', 'm09-report-2']);
    expect(s.w.manager.state('m09')).toBe('completed');
    expect(s.first('npc-merrin', 'merrin')).toBe('idle-after');
    expect(all['dialogue.npc-merrin.idle-after']).toMatch(/lockpicks/);
  });

  it('uses the cold line for a cold Halvard favour', () => {
    const s = setup();
    const cold = { ...s.w.state, favourBand: () => 'cold' as const };
    const effects = createEffectRunner({ state: cold, quests: s.w.manager, bus: s.w.bus, sourceId: 'test' } as any);
    const dr = new DialogueRunner({ bus: s.w.bus, state: cold, quests: s.w.manager, effects, strings: { t: (k) => all[k], has: hasKey } });
    dr.register(npcMerrin);
    dr.start('npc-merrin', 'merrin');
    expect(dr.view()!.nodeId).toBe('idle-cold');
  });
});

describe('Gerta and M10', () => {
  it('accepting starts M10 and leaves o1 done and o2 current', () => {
    const s = setup();
    s.w.manager.complete('m09');
    expect(s.play('npc-gerta', 'gerta')).toEqual(['m10-offer', 'm10-offer-2', 'm10-brief', 'm10-go']);
    expect(s.w.manager.state('m10')).toBe('active');
    expect(s.w.manager.objectiveDone('m10', 'o1')).toBe(true);
    expect(s.w.manager.isObjectiveCurrent('m10', 'o2')).toBe(true);
    expect(s.w.manager.objectiveDone('m10', 'o2')).toBe(false);
  });

  it('declining leaves M10 inactive', () => {
    const s = setup();
    s.w.manager.complete('m09');
    expect(s.play('npc-gerta', 'gerta', (n) => (n === 'm10-offer-2' ? 2 : 1)).at(-1)).toBe('m10-later');
    expect(s.w.manager.state('m10')).toBe('inactive');
  });

  it('each M10 stage shows the right node and the report completes the quest', () => {
    const s = setup();
    s.progress('m10', 'o1');
    expect(s.first('npc-gerta', 'gerta')).toBe('m10-go-again');
    s.w.manager.completeObjective('m10', 'o2');
    expect(s.first('npc-gerta', 'gerta')).toBe('m10-retry');
    s.w.manager.completeObjective('m10', 'o3');
    expect(s.play('npc-gerta', 'gerta')).toEqual(['m10-report', 'm10-report-2', 'm10-report-3']);
    expect(s.w.manager.state('m10')).toBe('completed');
    expect(all['dialogue.npc-gerta.idle-courier']).toMatch(/courier/);
  });

  it('trainer-closed until story.m07.classOpen, then trainer-open', () => {
    const s = setup();
    expect(s.first('npc-gerta', 'gerta')).toBe('idle');
    s.progress('m07');
    expect(s.first('npc-gerta', 'gerta')).toBe('trainer-closed');
    s.w.flags.set('story.m07.classOpen', true);
    expect(s.play('npc-gerta', 'gerta')).toEqual(['trainer-open', 'trainer-open-2']);
    const c = setup();
    c.w.manager.complete('m07');
    expect(c.first('npc-gerta', 'gerta')).toBe('trainer-closed');
  });
});

/** R04 (density pass): every objective before Whitlock reads the pages, and the reading itself. */
const R04_TO_CRABBE = ['o1', 'stacks', 'page1', 'page2', 'page3', 'o2', 'crabbe'];
const R04_READ = ['r04-read-1', 'r04-read-1b', 'r04-read-2', 'r04-read-2b', 'r04-read-3', 'r04-read-3b'];

describe('Whitlock and R04', () => {
  it('density pass: reminds about the pages, then Crabbe, then reads them', () => {
    const s = setup();
    s.progress('r04', 'o1', 'stacks', 'page1', 'page2', 'page3');
    expect(s.w.manager.objectiveDone('r04', 'o2')).toBe(true); // o2 follows the three pages (kept for old saves)
    expect(s.first('npc-whitlock', 'whitlock')).toBe('r04-crabbe-remind');
    s.w.manager.completeObjective('r04', 'crabbe');
    expect(s.first('npc-whitlock', 'whitlock')).toBe('r04-read-1');
  });

  it('offers R04 after M07 and starts it on accept only', () => {
    const s = setup();
    expect(s.first('npc-whitlock', 'whitlock')).toBe('idle');
    s.w.manager.complete('m07');
    expect(s.play('npc-whitlock', 'whitlock', (n) => (n === 'r04-offer-2' ? 2 : 1)).at(-1)).toBe('r04-later');
    expect(s.w.manager.state('r04')).toBe('inactive');
    expect(s.play('npc-whitlock', 'whitlock').at(-1)).toBe('r04-brief-3');
    expect(s.w.manager.state('r04')).toBe('active');
    expect(s.w.manager.objectiveDone('r04', 'o1')).toBe(true);
    expect(s.first('npc-whitlock', 'whitlock')).toBe('r04-remind');
  });

  it('expose gives halvard +5, oswin -5 and the flag, then completes R04', () => {
    const s = setup();
    s.progress('r04', ...R04_TO_CRABBE);
    expect(s.play('npc-whitlock', 'whitlock', () => 1)).toEqual([...R04_READ, 'r04-pages', 'r04-expose-end']);
    expect(s.favourCalls).toEqual([{ track: 'halvard', delta: 5 }, { track: 'oswin', delta: -5 }]);
    expect(s.w.flags.get('story.r04.choice')).toBe('expose');
    expect(s.w.manager.state('r04')).toBe('completed');
    expect(s.first('npc-whitlock', 'whitlock')).toBe('idle-expose');
  });

  it('shield gives halvard -3, oswin +5 and the flag, then completes R04', () => {
    const s = setup();
    s.progress('r04', ...R04_TO_CRABBE);
    expect(s.play('npc-whitlock', 'whitlock', () => 2)).toEqual([...R04_READ, 'r04-pages', 'r04-shield-end']);
    expect(s.favourCalls).toEqual([{ track: 'halvard', delta: -3 }, { track: 'oswin', delta: 5 }]);
    expect(s.w.flags.get('story.r04.choice')).toBe('shield');
    expect(s.w.manager.state('r04')).toBe('completed');
    expect(s.first('npc-whitlock', 'whitlock')).toBe('idle-shield');
  });

  it('asking loops back to the decision without effects', () => {
    const s = setup();
    s.progress('r04', ...R04_TO_CRABBE);
    let asked = 0;
    const seen = s.play('npc-whitlock', 'whitlock', (n) => (n === 'r04-pages' && asked++ < 2 ? 3 : 1));
    expect(seen).toEqual([...R04_READ, 'r04-pages', 'r04-ask', 'r04-pages', 'r04-ask', 'r04-pages', 'r04-expose-end']);
    expect(s.favourCalls).toEqual([{ track: 'halvard', delta: 5 }, { track: 'oswin', delta: -5 }]);
  });

  it('no choice in r04-pages merely leaves, and exactly three choices exist', () => {
    const node = npcWhitlock.nodes.find((n) => n.id === 'r04-pages')!;
    expect(node.choices!.map((c) => c.id)).toEqual(['expose', 'shield', 'ask']);
    for (const c of node.choices!) expect(c.next, c.id).not.toBeNull();
    expect(node.choices!.find((c) => c.id === 'ask')!.effects).toBeUndefined();
    expect(node.choices!.find((c) => c.id === 'ask')!.next).toBe('r04-ask');
    expect(npcWhitlock.nodes.find((n) => n.id === 'r04-ask')!.next).toBe('r04-pages');
  });
});
