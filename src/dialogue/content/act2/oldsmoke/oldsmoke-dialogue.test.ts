// The Oldsmoke surface trees through the real DialogueRunner: which state opens which segment, what each choice writes
// and in what order, that a favour moves exactly once, and that the extended Act 1 trees open as before when Phase D is
// nowhere near.
import { describe, expect, it } from 'vitest';
import { dialogueDefs } from '../../index';
import { dialogueStrings, npcNameFallbackStrings } from '../../../strings.en';
import { questStrings } from '../../../../quests/strings.en';
import { DialogueRunner } from '../../../DialogueRunner';
import { createEffectRunner } from '../../../../quests/effects';
import { evalCondition } from '../../../../quests/conditions';
import type { BusPort, QuestReader, StatePort, StringsPort } from '../../../../quests/ports';
import type { FlagValue } from '../../../../quests/types';
import { DERIVED_FLAGS, HALL_HOSTILE_FLAG, MARKET_COMPROMISE_FLAG, MARKET_MINER_GUARD_FLAG, MARKET_MINERS_FLAG, MARKET_STEWARD_GUARD_FLAG } from '../../../../oldsmoke/flags';
import { npcEdric } from '../../npc-edric.dialogue';
import { npcWystan } from '../../npc-wystan.dialogue';

const all: Record<string, string> = { ...questStrings, ...dialogueStrings, ...npcNameFallbackStrings };
type QS = 'inactive' | 'active' | 'completed';

function world(gold = 100, standing = 30) {
  const flags = new Map<string, FlagValue>();
  const qstate = new Map<string, QS>();
  const odone = new Set<string>();
  const log: string[] = [];
  const emitted: { type: string; payload?: unknown }[] = [];
  let purse = gold;
  const bus = { on: () => () => {}, emit: (type: string, payload?: unknown) => void emitted.push({ type, payload }) } as unknown as BusPort;
  const state: StatePort = {
    getFlag: (k) => flags.get(k),
    setFlag: (k, v) => { flags.set(k, v); log.push(`set ${k}=${String(v)}`); },
    clearFlag: (k) => { flags.delete(k); },
    favourBand: () => 'banked',
    favour: () => standing,
    addFavour: (t: string, d: number) => { log.push(`favour ${t} ${d}`); return 0; },
  } as StatePort;
  const quests: QuestReader & Record<string, any> = {
    state: (id: string) => qstate.get(id) ?? 'inactive',
    objectiveDone: (q: string, o: string) => odone.has(`${q}.${o}`),
    start: (id: string) => { log.push(`start ${id}`); qstate.set(id, 'active'); return true; },
    complete: () => true,
    completeObjective: () => true,
  };
  const inventory = () => ({ get gold() { return purse; }, takeGold: (n: number) => { purse -= n; return n; }, add: (id: string, n: number) => { log.push(`give ${id} ${n}`); return n; } });
  const effects = createEffectRunner({ state, quests: quests as any, bus, sourceId: 'test', inventory } as any);
  const strings: StringsPort = { t: (k) => all[k] ?? `[[${k}]]`, has: (k) => k in all };
  const dr = new DialogueRunner({ bus, state, quests, effects, strings, evalCondition, gold: () => purse } as any);
  for (const d of dialogueDefs) dr.register(d);
  const set = (q: string, s: QS, ...done: string[]) => { qstate.set(q, s); for (const o of done) odone.add(`${q}.${o}`); };
  return { flags, dr, set, log, emitted, purse: () => purse };
}
type Wd = ReturnType<typeof world>;

function opens(w: Wd, dialogueId: string, npc: string): string {
  expect(w.dr.start(dialogueId, npc), `${dialogueId} starts`).toBe(true);
  const id = w.dr.view()!.nodeId;
  w.dr.close('skip');
  return id;
}
/** Plays a talk to its end, picking the choice whose id is `pick` (or the first); returns the visited nodes. */
function play(w: Wd, dialogueId: string, npc: string, pick: string | ((nodeId: string) => string | undefined) = () => undefined): string[] {
  expect(w.dr.start(dialogueId, npc)).toBe(true);
  const seen: string[] = [];
  for (let i = 0; i < 80 && w.dr.isOpen; i++) {
    const v = w.dr.view()!;
    seen.push(v.nodeId);
    if (v.choices.length) {
      const want = typeof pick === 'string' ? pick : pick(v.nodeId);
      const idx = want ? v.choices.findIndex((c: any) => c.id === want) : 0;
      expect(idx, `${v.nodeId} offers ${want}`).toBeGreaterThanOrEqual(0);
      w.dr.choose(idx + 1);
    } else w.dr.advance();
  }
  expect(w.dr.isOpen).toBe(false);
  return seen;
}
const count = (w: Wd, entry: string) => w.log.filter((l) => l === entry).length;
const choiceIds = (w: Wd, dialogueId: string, npc: string, atNode: string): string[] => {
  expect(w.dr.start(dialogueId, npc)).toBe(true);
  for (let i = 0; i < 80 && w.dr.isOpen; i++) {
    const v = w.dr.view()!;
    if (v.nodeId === atNode) { const ids = v.choices.map((c: any) => c.id as string); w.dr.close('skip'); return ids; }
    if (v.choices.length) w.dr.choose(1); else w.dr.advance();
  }
  w.dr.close('skip');
  throw new Error(`${atNode} never reached`);
};

describe('Osgar hands over the invitation', () => {
  it('offers M16 once D03 is done and starts it', () => {
    const w = world();
    w.set('d03', 'completed');
    expect(opens(w, 'npc-osgar', 'osgar')).toBe('m16-offer');
    play(w, 'npc-osgar', 'osgar');
    expect(w.log).toContain('start m16');
  });
  it('waits while M16 is open and says nothing of it before D03', () => {
    const w = world();
    w.set('d03', 'completed');
    w.set('m16', 'active');
    expect(opens(w, 'npc-osgar', 'osgar')).toBe('m16-wait');
    const w2 = world();
    w2.set('d03', 'active');
    expect(opens(w2, 'npc-osgar', 'osgar')).not.toBe('m16-offer');
  });
});

describe('Aldous opens on the right segment', () => {
  const cases: Array<[string, (w: Wd) => void, string]> = [
    ['M16 gate passed', (w) => w.set('m16', 'active', 'gate'), 'm16-court'],
    ['M16 court heard, brazier open', (w) => w.set('m16', 'active', 'gate', 'court'), 'm16-wait-brazier'],
    ['M16 brazier lit', (w) => w.set('m16', 'active', 'gate', 'court', 'brazier'), 'm16-proof'],
    ['M16 Wenna heard', (w) => w.set('m16', 'active', 'gate', 'court', 'brazier', 'silence', 'wenna'), 'm16-report'],
    ['M16 earlier', (w) => w.set('m16', 'active'), 'm16-wait'],
    ['M21 evidence gathered', (w) => w.set('m21', 'active', 'counsel', 'escort', 'evidence'), 'm21-audience'],
    ['M21 earlier', (w) => w.set('m21', 'active', 'counsel'), 'm21-wait'],
    ['M16 done', (w) => w.set('m16', 'completed'), 'idle-after'],
    ['nothing', () => {}, 'idle'],
  ];
  it.each(cases)('%s', (_n, arrange, node) => {
    const w = world();
    arrange(w);
    expect(opens(w, 'npc-aldous', 'aldous')).toBe(node);
  });
  it('the aftermath follows the branch', () => {
    for (const [branch, node] of [['confront', 'm21-aftermath-confront'], ['spy', 'm21-aftermath-spy']] as const) {
      const w = world();
      w.set('m21', 'active', 'counsel', 'escort', 'evidence', 'audience', 'loyalists', 'stealth', 'letters');
      w.flags.set('story.m21.branch', branch);
      expect(opens(w, 'npc-aldous', 'aldous')).toBe(node);
    }
  });
  it('the spy aftermath waits for the stealth section: letters done alone is not enough', () => {
    const w = world();
    w.set('m21', 'active', 'counsel', 'escort', 'evidence', 'audience', 'loyalists', 'letters');
    w.flags.set('story.m21.branch', 'spy');
    expect(opens(w, 'npc-aldous', 'aldous')).toBe('m21-wait');
    w.set('m21', 'active', 'stealth');
    expect(opens(w, 'npc-aldous', 'aldous')).toBe('m21-aftermath-spy');
  });
  it('lighting the brazier is the proof node and raises the silence once', () => {
    const w = world();
    w.set('m16', 'active', 'gate', 'court', 'brazier');
    play(w, 'npc-aldous', 'aldous');
    expect(w.emitted.filter((e) => e.type === 'story.m16.silent')).toHaveLength(1);
  });
});

describe('M21 at the audience', () => {
  const audience = (w: Wd, pick: string, thenPick?: string) => {
    w.set('m21', 'active', 'counsel', 'escort', 'evidence');
    return play(w, 'npc-aldous', 'aldous', (n) => (n === 'm21-audience-16' ? pick : thenPick));
  };

  it('confront with the evidence: persuaded is written before the choice, no fight, favour once', () => {
    const w = world();
    w.flags.set('story.m21.ev.1', true);
    w.flags.set('story.m21.ev.3', true);
    const seen = audience(w, 'confront', 'proof');
    expect(seen).toContain('m21-pass');
    const sets = w.log.filter((l) => l.startsWith('set story.m21'));
    expect(sets.indexOf('set story.m21.persuaded=true')).toBeGreaterThanOrEqual(0);
    expect(sets.indexOf('set story.m21.persuaded=true')).toBeLessThan(sets.indexOf('set story.m21.choice=confront'));
    expect(w.flags.get('story.m21.loyalistsOut')).toBeUndefined();
    expect(count(w, 'favour halvard 3')).toBe(1);
    expect(count(w, 'favour grisel -5')).toBe(1);
    expect(w.emitted.filter((e) => e.type === 'story.m21.resolved')).toHaveLength(1);
  });

  it('the evidence case is offered with two proofs or with standing, not with one', () => {
    const arrange = (w: Wd, ...ev: number[]) => {
      w.set('m21', 'active', 'counsel', 'escort', 'evidence');
      for (const n of ev) w.flags.set(`story.m21.ev.${n}`, true);
      return choiceIds(w, 'npc-aldous', 'aldous', 'm21-confront-2');
    };
    expect(arrange(world(0, 0))).not.toContain('proof');
    expect(arrange(world(0, 0), 2)).not.toContain('proof');
    expect(arrange(world(0, 0), 1, 3)).toContain('proof');
    expect(arrange(world(0, 15))).toContain('proof'); // standing alone is enough at 15
    expect(arrange(world(0, 14))).not.toContain('proof');
  });

  it('confront and press without proof: the loyalists come out, persuaded stays unset', () => {
    const w = world();
    const seen = audience(w, 'confront', 'press');
    expect(seen).toContain('m21-fail');
    // the fight is not started from the dialogue: the director writes loyalistsOut when the audience talk is credited
    expect(w.flags.get('story.m21.loyalistsOut')).toBeUndefined();
    expect(w.flags.get('story.m21.persuaded')).toBeUndefined();
    expect(w.flags.get('story.m21.choice')).toBe('confront');
    expect(count(w, 'favour grisel -5')).toBe(1);
  });

  it('an audience aborted after the choice and talked again pays each favour once (press, tip, spy)', () => {
    for (const pick of ['press', 'tip'] as const) {
      const w = world(200);
      w.set('m21', 'active', 'counsel', 'escort', 'evidence');
      // first pass: choose, then abort before the dialogue ends
      expect(w.dr.start('npc-aldous', 'aldous')).toBe(true);
      for (let i = 0; i < 80; i++) {
        const v = w.dr.view()!;
        if (v.nodeId.startsWith('m21-confront')) { const idx = v.choices.findIndex((c: any) => c.id === pick); if (idx >= 0) { w.dr.choose(idx + 1); break; } }
        if (v.choices.length) { w.dr.choose(Math.max(0, v.choices.findIndex((c: any) => c.id === 'confront')) + 1); } else w.dr.advance();
      }
      w.dr.close('skip');
      expect(count(w, 'favour halvard 3')).toBe(1);
      // second talk: the same road
      w.set('m21', 'active', 'counsel', 'escort', 'evidence');
      play(w, 'npc-aldous', 'aldous', (n) => (n === 'm21-audience-16' ? 'confront' : 'press')); // the tip is no longer offered once paid
      expect(count(w, 'favour halvard 3'), pick).toBe(1);
      expect(count(w, 'favour grisel -5'), pick).toBe(1);
      expect(w.purse(), pick).toBe(pick === 'tip' ? 160 : 200);
    }
    const s = world();
    s.set('m21', 'active', 'counsel', 'escort', 'evidence');
    audience(s, 'spy');
    audience(s, 'spy');
    expect(count(s, 'favour grisel 2')).toBe(1);
    expect(count(s, 'favour oswin 3')).toBe(1);
  });

  it('pressing after a tip that was aborted clears the persuasion, so the fight is not skipped', () => {
    const w = world(200);
    w.flags.set('story.m21.persuaded', true);
    w.flags.set('story.m21.tipPaid', true);
    audience(w, 'confront', 'press');
    expect(w.flags.get('story.m21.persuaded')).toBeUndefined();
  });

  it('the forty gold tip is spent once and persuades', () => {
    const w = world(100);
    const seen = audience(w, 'confront', 'tip');
    expect(seen).toContain('m21-pass');
    expect(w.purse()).toBe(60);
    expect(w.flags.get('story.m21.persuaded')).toBe(true);
  });

  it('with too little gold the tip is not offered', () => {
    const w = world(10);
    w.set('m21', 'active', 'counsel', 'escort', 'evidence');
    expect(choiceIds(w, 'npc-aldous', 'aldous', 'm21-confront-2')).toEqual(expect.arrayContaining(['press']));
    expect(choiceIds(w, 'npc-aldous', 'aldous', 'm21-confront-2')).not.toContain('tip');
  });

  it('spying writes the branch and the choice together, with its own favour once', () => {
    const w = world();
    const seen = audience(w, 'spy');
    expect(seen).toContain('m21-spy');
    expect(w.flags.get('story.m21.branch')).toBe('spy');
    expect(w.flags.get('story.m21.choice')).toBe('spy');
    expect(count(w, 'favour grisel 2')).toBe(1);
    expect(count(w, 'favour oswin 3')).toBe(1);
    expect(w.flags.get('story.m21.persuaded')).toBeUndefined();
  });
});

describe('M21 and M22 are offered by their givers', () => {
  it('Wenna offers M21 once M20 is done and starts it', () => {
    const w = world();
    w.set('m20', 'completed');
    expect(opens(w, 'npc-wenna', 'wenna')).toBe('m21-offer');
    play(w, 'npc-wenna', 'wenna');
    expect(w.log).toContain('start m21');
  });
  it('Wenna\'s offer runs on into her counsel, since its end credits M21\'s counsel talk', () => {
    const w = world();
    w.set('m20', 'completed');
    const seen = play(w, 'npc-wenna', 'wenna');
    expect(seen[0]).toBe('m21-offer');
    expect(seen).toContain('m21-counsel');
    expect(seen[seen.length - 1]).toMatch(/^m21-counsel/);
  });
  it('Wystan offers M22 only when all twenty prerequisites are done', () => {
    const ids = ['m11', 'm12', 'm13', 'm14', 'm15', 'm16', 'm17', 'm18', 'm19', 'm20', 'm21', 'r05', 'r06', 'r07', 'r08', 'r09', 'r10', 'r11', 'd03', 'd04'];
    for (const missing of ids) {
      const w = world();
      for (const q of ids) if (q !== missing) w.set(q, 'completed');
      expect(opens(w, 'npc-wystan', 'wystan'), missing).not.toBe('a2-m22-offer');
    }
    const w = world();
    for (const q of ids) w.set(q, 'completed');
    expect(opens(w, 'npc-wystan', 'wystan')).toBe('a2-m22-offer');
    play(w, 'npc-wystan', 'wystan');
    expect(w.log).toContain('start m22');
  });
});

describe('the spy letter', () => {
  it('Aldous hands it over once on the spy aftermath, and not on the confront one', () => {
    const w = world();
    w.set('m21', 'active', 'counsel', 'escort', 'evidence', 'audience', 'loyalists', 'stealth', 'letters');
    w.flags.set('story.m21.branch', 'spy');
    play(w, 'npc-aldous', 'aldous');
    play(w, 'npc-aldous', 'aldous');
    expect(w.emitted.filter((e) => e.type === 'loot.granted')).toHaveLength(1);
    const c = world();
    c.set('m21', 'active', 'counsel', 'escort', 'evidence', 'audience', 'loyalists', 'stealth', 'letters');
    c.flags.set('story.m21.branch', 'confront');
    play(c, 'npc-aldous', 'aldous');
    expect(c.emitted.filter((e) => e.type === 'loot.granted')).toHaveLength(0);
  });
});

describe('Slagg', () => {
  it('only says "two jobs" while both R09 and R10 are open', () => {
    const text = (w: Wd): string => { w.dr.start('npc-slagg', 'slagg'); const t = (w.dr.view() as any).text as string; w.dr.close('skip'); return t; };
    const both = world(); both.set('m16', 'completed'); both.set('m17', 'completed');
    expect(opens(both, 'npc-slagg', 'slagg')).toBe('offers');
    expect(text(both)).toMatch(/two jobs/);
    const r10Only = world(); r10Only.set('m16', 'completed'); r10Only.set('m17', 'completed'); r10Only.set('r09', 'completed');
    expect(opens(r10Only, 'npc-slagg', 'slagg')).toBe('offer-r10');
    expect(text(r10Only)).not.toMatch(/two jobs/);
    expect(choiceIds(r10Only, 'npc-slagg', 'slagg', 'offer-r10')).toEqual(['strike']);
    play(r10Only, 'npc-slagg', 'slagg', 'strike');
    expect(r10Only.log).toContain('start r10');
  });

  it('offers R09 after M16 and R10 after M17, and starts what is chosen', () => {
    const w = world();
    w.set('m16', 'completed');
    // with M16 done and M17 not yet started, Slagg's first word is M17's brief (the mines extension, tested in mines/m17r08.dialogue.test.ts)
    expect(opens(w, 'npc-slagg', 'slagg')).toBe('a2-m17-brief');
    // once M17 is under way the older offer applies again
    w.set('m17', 'active');
    expect(opens(w, 'npc-slagg', 'slagg')).toBe('offer-r09');
    expect(choiceIds(w, 'npc-slagg', 'slagg', 'offer-r09').sort()).toEqual(['coin']);
    play(w, 'npc-slagg', 'slagg', 'coin');
    expect(w.log).toContain('start r09');
    const w2 = world();
    w2.set('m16', 'completed');
    w2.set('m17', 'completed');
    expect(choiceIds(w2, 'npc-slagg', 'slagg', 'offers').sort()).toEqual(['coin', 'strike']);
    play(w2, 'npc-slagg', 'slagg', 'strike');
    expect(w2.log).toContain('start r10');
  });

  it.each([['stewards', 5], ['miners', -3]] as const)('R09 %s moves Grisel by %i once and writes the side', (side, delta) => {
    const w = world();
    w.set('r09', 'active', 'brief', 'nests', 'chests', 'office', 'clerk', 'miners');
    play(w, 'npc-slagg', 'slagg', side);
    expect(w.flags.get('story.r09.choice')).toBe(side);
    expect(count(w, `favour grisel ${delta}`)).toBe(1);
    expect(w.emitted.filter((e) => e.type === 'story.r09.chosen')).toHaveLength(1);
    // the choice talk does not report: the report is its own scene, which raises the report event once at its end
    expect(w.emitted.filter((e) => e.type === 'story.r09.reported')).toHaveLength(0);
    w.set('r09', 'active', 'brief', 'nests', 'chests', 'office', 'clerk', 'miners', 'choice');
    expect(opens(w, 'npc-slagg', 'slagg')).toBe('r09-report');
    play(w, 'npc-slagg', 'slagg');
    expect(w.emitted.filter((e) => e.type === 'story.r09.reported')).toHaveLength(1);
  });

  it.each([['miners', -5, 0], ['stewards', 5, 0], ['compromise', 2, 2]] as const)('R10 %s: the branch first, the choice and the favour only at the report', (side, grisel, oswin) => {
    const w = world();
    w.set('r10', 'active', 'brief', 'miners', 'stewards', 'read');
    play(w, 'npc-slagg', 'slagg', side);
    expect(w.flags.get('story.r10.branch')).toBe(side);
    expect(w.flags.get('story.r10.choice')).toBeUndefined();
    expect(w.log.some((l) => l.startsWith('favour'))).toBe(false);
    w.set('r10', 'active', 'brief', 'miners', 'stewards', 'read', 'choice', 'ruling', 'keys', 'talks');
    play(w, 'npc-slagg', 'slagg');
    expect(w.flags.get('story.r10.choice')).toBe(side);
    expect(count(w, `favour grisel ${grisel}`)).toBe(1);
    expect(count(w, 'favour oswin 2')).toBe(oswin ? 1 : 0);
    expect(w.log.filter((l) => l.startsWith('favour'))).toHaveLength(oswin ? 2 : 1);
  });
});

describe('Slagg with overlapping quests (the merged tree, mines included)', () => {
  const r10Ready = (w: Wd) => {
    w.flags.set('story.r10.branch', 'miners');
    w.set('r10', 'active', 'brief', 'miners', 'stewards', 'read', 'choice', 'ruling', 'keys', 'talks');
  };
  it('R10 awaiting its report while D04 is offered: the report plays, not the D04 offer', () => {
    const w = world();
    w.set('m16', 'completed'); w.set('m17', 'completed'); w.set('m20', 'completed');
    r10Ready(w);
    expect(opens(w, 'npc-slagg', 'slagg')).toBe('r10-report');
    play(w, 'npc-slagg', 'slagg');
    expect(w.flags.get('story.r10.choice')).toBe('miners');
    expect(count(w, 'favour grisel -5')).toBe(1);
  });
  it('R10 awaiting its report while D04 is active: the report still plays', () => {
    const w = world();
    w.set('d04', 'active');
    r10Ready(w);
    expect(opens(w, 'npc-slagg', 'slagg')).toBe('r10-report');
  });
  it('R10 choice and R09 report are not hidden by an active D04 either', () => {
    const w = world();
    w.set('d04', 'active');
    w.set('r10', 'active', 'brief', 'miners', 'stewards', 'read');
    expect(opens(w, 'npc-slagg', 'slagg')).toBe('r10-choice');
    const w2 = world();
    w2.set('d04', 'active');
    w2.set('r09', 'active', 'brief', 'nests', 'chests', 'office', 'clerk', 'miners', 'choice');
    expect(opens(w2, 'npc-slagg', 'slagg')).toBe('r09-report');
    const w3 = world();
    w3.set('m20', 'completed');
    w3.set('r09', 'active', 'brief', 'nests', 'chests', 'office', 'clerk', 'miners');
    expect(opens(w3, 'npc-slagg', 'slagg')).toBe('r09-choice');
  });
  it('R09 report while R10 is active (and not yet reporting): the R09 report shows ahead of the R10 wait', () => {
    const w = world();
    w.set('r10', 'active', 'brief');
    w.set('r09', 'active', 'brief', 'nests', 'chests', 'office', 'clerk', 'miners', 'choice');
    expect(opens(w, 'npc-slagg', 'slagg')).toBe('r09-report');
    const w2 = world();
    w2.set('r10', 'active', 'brief');
    expect(opens(w2, 'npc-slagg', 'slagg')).toBe('r10-wait');
  });
  it('both reports pending: R10 first, and the choice flag is written in that very talk', () => {
    const w = world();
    r10Ready(w);
    w.set('r09', 'active', 'brief', 'nests', 'chests', 'office', 'clerk', 'miners', 'choice');
    const seen = play(w, 'npc-slagg', 'slagg');
    expect(seen[0]).toBe('r10-report');
    expect(w.flags.get('story.r10.choice')).toBe('miners');
  });
  it('an aborted report followed by a re-talk pays the R10 favour once, and the choice stays written', () => {
    const w = world();
    r10Ready(w);
    expect(w.dr.start('npc-slagg', 'slagg')).toBe(true);
    w.dr.close('skip');
    expect(w.flags.get('story.r10.choice')).toBe('miners');
    play(w, 'npc-slagg', 'slagg');
    play(w, 'npc-slagg', 'slagg');
    expect(count(w, 'favour grisel -5')).toBe(1);
    expect(w.flags.get('story.r10.choice')).toBe('miners');
  });
});

describe('the R10 compromise rounds', () => {
  const rounds: Array<[string, string, string, 1 | 2 | 3]> = [['npc-miner-1', 'miner-1', 'Oda', 1], ['npc-steward-market-1', 'steward-market-1', 'Halse', 2], ['npc-steward-market-2', 'steward-market-2', 'the clerk', 3]];
  const arrange = (w: Wd, readDone = true) => {
    w.flags.set('story.r10.branch', 'compromise');
    w.set('r10', 'active', 'brief', 'miners', 'stewards', ...(readDone ? ['read'] : []), 'choice', 'ruling', 'keys');
  };

  it.each(rounds)('%s: the evidence wins the round and raises the persuasion once', (dlg, npc, _who, n) => {
    const w = world();
    arrange(w);
    expect(opens(w, dlg, npc)).toBe(`r10-round-${n}`);
    play(w, dlg, npc, 'evidence');
    expect(w.flags.get(`story.r10.p.${n}`)).toBe(true);
    expect(w.emitted.filter((e) => e.type === 'story.r10.persuaded')).toEqual([{ type: 'story.r10.persuaded', payload: { n: String(n) } }]);
  });

  it.each(rounds)('%s: a bluff fails with a hint and the round opens again', (dlg, npc, _who, n) => {
    const w = world();
    arrange(w);
    const seen = play(w, dlg, npc, 'bluff');
    expect(seen).toContain(`r10-round-${n}-hint`);
    expect(w.flags.get(`story.r10.p.${n}`)).toBeUndefined();
    expect(w.emitted.some((e) => e.type === 'story.r10.persuaded')).toBe(false);
    expect(opens(w, dlg, npc)).toBe(`r10-round-${n}`);
  });

  it.each(rounds)('%s: standing with Grisel carries the round without the evidence', (dlg, npc, _who, n) => {
    const w = world();
    arrange(w, false);
    play(w, dlg, npc, 'standing');
    expect(w.flags.get(`story.r10.p.${n}`)).toBe(true);
  });

  it.each(rounds)('%s: a won round does not open again', (dlg, npc, _who, n) => {
    const w = world();
    arrange(w);
    w.flags.set(`story.r10.p.${n}`, true);
    expect(opens(w, dlg, npc)).not.toBe(`r10-round-${n}`);
  });
});

describe('Wenna', () => {
  it('counsels at the start of M21 and reports at its end', () => {
    const w = world();
    w.set('m21', 'active');
    expect(opens(w, 'npc-wenna', 'wenna')).toBe('m21-counsel');
    const w2 = world();
    w2.set('m21', 'active', 'counsel', 'escort', 'evidence', 'audience', 'loyalists', 'stealth', 'letters', 'aftermath');
    expect(opens(w2, 'npc-wenna', 'wenna')).toBe('m21-report');
  });
});

describe('the M22 scenes', () => {
  it('the council is a long scene that ends without setting the A3 gate', () => {
    const w = world();
    const seen = play(w, 'scene-m22-council', 'wystan');
    expect(seen.length).toBeGreaterThanOrEqual(30);
    expect([...w.flags.keys()]).not.toContain('story.gate.a3');
  });
  it('the council differs with the earlier choices but keeps its length', () => {
    const lengths = new Set<number>();
    for (const [r09, r10, m21] of [['stewards', 'stewards', 'spy'], ['miners', 'miners', 'confront'], ['miners', 'compromise', 'confront']]) {
      const w = world();
      w.flags.set('story.r09.choice', r09);
      w.flags.set('story.r10.choice', r10);
      w.flags.set('story.m21.choice', m21);
      lengths.add(play(w, 'scene-m22-council', 'wystan').length);
    }
    expect(lengths.size).toBe(1);
  });
  it('the steward reads the refusal in six nodes', () => {
    const w = world();
    w.set('m22', 'active', 'keep', 'council');
    expect(opens(w, 'npc-grisel-steward', 'grisel-steward')).toBe('m22-refusal');
    expect(play(w, 'npc-grisel-steward', 'grisel-steward')).toHaveLength(6);
  });
});

describe('the extended Act 1 trees open as before', () => {
  it('Edric and Wystan, with no Phase D quest anywhere near, begin on their Act 1 starts', () => {
    for (const [def, npc] of [[npcEdric, 'edric'], [npcWystan, 'wystan']] as const) {
      const w = world();
      const node = opens(w, def.id, npc);
      expect(node, def.id).not.toMatch(/^a2-m22/);
    }
  });
});

describe('what A4 derives from the flags these trees write', () => {
  const derive = (w: Wd, flag: string) => DERIVED_FLAGS.find((d) => d.derived === flag)!.want((k) => w.flags.get(k));

  it('the hall is hostile after a pressed confrontation only', () => {
    const run = (pick: string, then?: string) => {
      const w = world();
      w.set('m21', 'active', 'counsel', 'escort', 'evidence');
      play(w, 'npc-aldous', 'aldous', (n) => (n === 'm21-audience-16' ? pick : then));
      return derive(w, HALL_HOSTILE_FLAG);
    };
    expect(run('confront', 'press')).toBe(true);
    expect(run('confront', 'tip')).toBe(false);
    expect(run('spy')).toBe(false);
  });

  it('the market guards follow the R10 report and not the branch chosen before it', () => {
    for (const [side, miners, compromise, minerGuard, stewardGuard] of [['miners', true, false, true, false], ['stewards', false, false, false, true], ['compromise', false, true, true, true]] as const) {
      const w = world();
      w.set('r10', 'active', 'brief', 'miners', 'stewards', 'read');
      play(w, 'npc-slagg', 'slagg', side);
      expect(derive(w, MARKET_MINER_GUARD_FLAG), `${side} before the report`).toBe(false);
      w.set('r10', 'active', 'brief', 'miners', 'stewards', 'read', 'choice', 'ruling', 'keys', 'talks');
      play(w, 'npc-slagg', 'slagg');
      expect([derive(w, MARKET_MINERS_FLAG), derive(w, MARKET_COMPROMISE_FLAG), derive(w, MARKET_MINER_GUARD_FLAG), derive(w, MARKET_STEWARD_GUARD_FLAG)], side).toEqual([miners, compromise, minerGuard, stewardGuard]);
    }
  });
});
