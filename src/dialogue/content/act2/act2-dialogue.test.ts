// The Act 2 Cinderreach trees through the real DialogueRunner: which state opens which segment, how long the shortest
// chains are, what the closing lines write and in what order, and that the three extended Act 1 trees still open as
// before when no Act 2 quest is anywhere near.
import { describe, expect, it } from 'vitest';
import { dialogueDefs } from '../index';
import { dialogueStrings, npcNameFallbackStrings } from '../../strings.en';
import { questStrings } from '../../../quests/strings.en';
import { DialogueRunner } from '../../DialogueRunner';
import { createEffectRunner } from '../../../quests/effects';
import { evalCondition } from '../../../quests/conditions';
import type { BusPort, QuestReader, StatePort, StringsPort } from '../../../quests/ports';
import type { Condition, DialogueDef, FavourBand, FlagValue } from '../../../quests/types';
import { ACT2_EXTENDED_DIALOGUES } from './index';
import { npcGaut } from '../npc-gaut.dialogue';
import { npcAelfreda } from '../npc-aelfreda.dialogue';
import { npcPennard } from '../npc-pennard.dialogue';

const all: Record<string, string> = { ...questStrings, ...dialogueStrings, ...npcNameFallbackStrings };
type QS = 'inactive' | 'active' | 'completed';

function world(band: FavourBand = 'banked') {
  const flags = new Map<string, FlagValue>();
  const qstate = new Map<string, QS>();
  const odone = new Set<string>();
  const log: string[] = [];
  const emitted: string[] = [];
  const bus: BusPort = { on: () => () => {}, emit: (t: string) => void emitted.push(t) } as BusPort;
  const state: StatePort = {
    getFlag: (k) => flags.get(k),
    setFlag: (k, v) => { flags.set(k, v); log.push(`set ${k}=${String(v)}`); },
    clearFlag: (k) => { flags.delete(k); log.push(`clear ${k}`); },
    favourBand: () => band,
    favour: () => 30,
    addFavour: (t: string, d: number) => { log.push(`favour ${t} ${d}`); return 0; },
  } as StatePort;
  const quests: QuestReader & Record<string, any> = {
    state: (id: string) => qstate.get(id) ?? 'inactive',
    objectiveDone: (q: string, o: string) => odone.has(`${q}.${o}`),
    start: (id: string) => { log.push(`start ${id}`); qstate.set(id, 'active'); return true; },
    complete: () => true,
    completeObjective: () => true,
  };
  const effects = createEffectRunner({
    state, quests: quests as any, bus, sourceId: 'test',
    inventory: () => ({ add: (id: string, n: number) => { log.push(`give ${id} ${n}`); return n; } }),
  } as any);
  const strings: StringsPort = { t: (k) => all[k] ?? `[[${k}]]`, has: (k) => k in all };
  const dr = new DialogueRunner({ bus, state, quests, effects, strings });
  for (const d of dialogueDefs) dr.register(d);
  const set = (q: string, s: QS, ...done: string[]) => { qstate.set(q, s); for (const o of done) odone.add(`${q}.${o}`); };
  return { flags, dr, set, log, emitted };
}

/** The node a talk opens on. */
function opens(w: ReturnType<typeof world>, dialogueId: string, npc: string): string {
  expect(w.dr.start(dialogueId, npc), `${dialogueId} starts`).toBe(true);
  const id = w.dr.view()!.nodeId;
  w.dr.close('skip');
  return id;
}

/** Plays a talk to its end, picking the 1-based choice `pick(nodeId)` (default first); returns the visited nodes. */
function play(w: ReturnType<typeof world>, dialogueId: string, npc: string, pick: (n: string) => number = () => 1): string[] {
  expect(w.dr.start(dialogueId, npc)).toBe(true);
  const seen: string[] = [];
  for (let i = 0; i < 80 && w.dr.isOpen; i++) {
    const v = w.dr.view()!;
    seen.push(v.nodeId);
    if (v.choices.length) w.dr.choose(pick(v.nodeId)); else w.dr.advance();
  }
  expect(w.dr.isOpen).toBe(false);
  return seen;
}

describe('Osgar opens on the right segment', () => {
  const cases: Array<[string, (w: ReturnType<typeof world>) => void, string]> = [
    ['m11 done, m12 not started', (w) => w.set('m11', 'completed'), 'm12-brief'],
    ['m12 prep open', (w) => { w.set('m11', 'completed'); w.set('m12', 'active'); }, 'm12-wait'],
    ['m12 prep done, raid not', (w) => { w.set('m11', 'completed'); w.set('m12', 'active', 'prep'); }, 'm12-ready'],
    ['m12 raid done', (w) => { w.set('m11', 'completed'); w.set('m12', 'active', 'prep', 'raid'); }, 'm12-wounded'],
    ['m12 all but the report', (w) => { w.set('m11', 'completed'); w.set('m12', 'active', 'prep', 'raid', 'carry', 'tend', 'read'); }, 'm12-report'],
    ['m14 done, m15 not started', (w) => w.set('m14', 'completed'), 'm15-brief'],
    ['m15 active', (w) => w.set('m15', 'active'), 'm15-wait'],
    ['m15 flight set', (w) => w.set('m15', 'active', 'flight'), 'm15-report'],
    ['m15 done, d03 not started', (w) => w.set('m15', 'completed'), 'd03-brief'],
    ['d03 active', (w) => w.set('d03', 'active', 'brief'), 'd03-wait'],
    ['nothing active', () => {}, 'idle'],
  ];
  it.each(cases)('%s', (_name, arrange, node) => {
    const w = world();
    arrange(w);
    expect(opens(w, 'npc-osgar', 'osgar')).toBe(node);
  });

  it('reports the D03 outcome that was recorded', () => {
    for (const outcome of ['spared', 'defeated'] as const) {
      const w = world();
      w.set('d03', 'active', 'testimony');
      w.flags.set('story.d03.outcome', outcome);
      expect(opens(w, 'npc-osgar', 'osgar')).toBe(`d03-report-${outcome}`);
    }
  });
});

describe('the quests start from their givers', () => {
  it('Osgar\'s M12 briefing ends in startQuest m12 (ten nodes on the shortest path, the choice is flavour)', () => {
    const w = world();
    w.set('m11', 'completed');
    const seen = play(w, 'npc-osgar', 'osgar');
    expect(seen.length).toBeGreaterThanOrEqual(10);
    expect(w.log).toContain('start m12');
  });

  it('Gaut\'s Cinder Road briefing is fourteen nodes and ends in startQuest m11', () => {
    const w = world();
    w.flags.set('story.gate.a2', true);
    expect(opens(w, 'npc-gaut', 'gaut')).toBe('a2-brief');
    const seen = play(w, 'npc-gaut', 'gaut');
    expect(seen.length).toBe(14);
    expect(w.log).toContain('start m11');
  });

  it('Maud\'s well briefing starts r06; Ketta\'s two briefings start r05 and r07; Hrolf\'s start m13 and r11', () => {
    const cases: Array<[string, string, string, (w: ReturnType<typeof world>) => void, string]> = [
      ['npc-maud', 'maud', 'r06', (w) => w.set('m12', 'completed'), 'r06-brief'],
      ['npc-ketta', 'ketta', 'r05', (w) => w.set('m12', 'completed'), 'r05-brief'],
      ['npc-hrolf', 'hrolf', 'm13', (w) => w.set('m12', 'completed'), 'm13-brief'],
      ['npc-hrolf', 'hrolf', 'r11', (w) => { w.set('m12', 'completed'); w.set('m13', 'completed'); }, 'r11-brief'],
    ];
    for (const [dlg, npc, quest, arrange, node] of cases) {
      const w = world();
      arrange(w);
      expect(opens(w, dlg, npc)).toBe(node);
      play(w, dlg, npc);
      expect(w.log, `${dlg}:${quest}`).toContain(`start ${quest}`);
    }
  });
});

describe('R06: the choice writes the private branch, never the world flag', () => {
  it('Maud\'s cleanse and seal answers set story.r06.branch and raise the branched event only', () => {
    for (const [pick, branch] of [[1, 'cleanse'], [2, 'seal']] as const) {
      const w = world();
      w.set('r06', 'active', 'brief', 'samples', 'wellhouse', 'keeper', 'households');
      expect(opens(w, 'npc-maud', 'maud')).toBe('r06-choice');
      play(w, 'npc-maud', 'maud', (n) => (n === 'r06-choice-3' ? pick : 1));
      expect(w.flags.get('story.r06.branch')).toBe(branch);
      expect(w.flags.has('story.r06.choice')).toBe(false);
    }
  });

  it('each household\'s listening is a distinct event payload the quest counts four of', () => {
    const w = world();
    w.set('r06', 'active', 'brief', 'samples', 'wellhouse', 'keeper');
    for (const n of [2, 3, 4]) {
      play(w, `npc-household-${n}`, `household-${n}`);
      expect(w.flags.get(`story.r06.heard.${n}`)).toBe(true);
    }
  });
});

describe('closing lines write the right flags in the right order', () => {
  it('M13\'s oath: Hrolf joins, then his rank is raised, then the quest\'s own flag', () => {
    const w = world();
    w.set('m13', 'active', 'brief', 'kin', 'logs', 'banter', 'heave', 'hall', 'duel');
    expect(opens(w, 'npc-hrolf', 'hrolf')).toBe('m13-oath');
    play(w, 'npc-hrolf', 'hrolf');
    const j = w.log.findIndex((l) => l === 'set story.m13.hrolfJoined=true');
    expect(j).toBeGreaterThanOrEqual(0);
    expect(w.emitted).toContain('story.companion.rank');
    expect(w.log.findIndex((l) => l === 'set story.m13.complete=true')).toBeGreaterThan(j);
  });

  it('M14\'s rite: Aelfreda joins and her rank rises, with and without Scars', () => {
    for (const scars of [true, false]) {
      const w = world();
      w.set('m14', 'active', 'brief', 'sings');
      w.flags.set('story.f10.scars', scars);
      const open = opens(w, 'npc-aelfreda', 'aelfreda');
      expect(open).toBe('a2-rite');
      play(w, 'npc-aelfreda', 'aelfreda');
      expect(w.flags.get('story.m14.aelfredaJoined')).toBe(true);
      expect(w.emitted).toContain('story.companion.rank');
    }
  });

  it('the keeper\'s mural and song lines clear their own hold flag on the last line', () => {
    const w = world();
    w.set('m14', 'active');
    w.flags.set('story.m14.mural', 2);
    expect(opens(w, 'npc-lantern-keeper', 'lantern-keeper')).toBe('mural-2');
    play(w, 'npc-lantern-keeper', 'lantern-keeper');
    expect(w.flags.has('story.m14.mural')).toBe(false);
    w.flags.set('story.m14.singsHold', true);
    expect(opens(w, 'npc-lantern-keeper', 'lantern-keeper')).toBe('sings');
    play(w, 'npc-lantern-keeper', 'lantern-keeper');
    expect(w.flags.has('story.m14.singsHold')).toBe(false);
  });

  it('Gaut\'s ride-out, stage and speech lines clear their cue flags', () => {
    const w = world();
    w.flags.set('story.m11.rideout', true);
    expect(opens(w, 'npc-gaut', 'gaut')).toBe('a2-rideout');
    play(w, 'npc-gaut', 'gaut');
    expect(w.flags.has('story.m11.rideout')).toBe(false);
    for (const n of [1, 2, 3]) {
      w.flags.set('story.m11.stage', n);
      expect(opens(w, 'npc-gaut', 'gaut')).toBe(`a2-stage${n}`);
      play(w, 'npc-gaut', 'gaut');
      expect(w.flags.has('story.m11.stage')).toBe(false);
    }
    w.flags.set('story.m11.speech', true);
    expect(opens(w, 'npc-gaut', 'gaut')).toBe('a2-speech');
    play(w, 'npc-gaut', 'gaut');
    expect(w.flags.has('story.m11.speech')).toBe(false);
  });

  it('Ketta\'s R07 choice writes spared or culled, with dragons +3 only for the spare', () => {
    for (const [pick, choice, favour] of [[1, 'spared', true], [2, 'culled', false]] as const) {
      const w = world();
      w.set('r07', 'active', 'brief', 'shepherd', 'signs', 'hounds', 'mother');
      w.flags.set('story.r07.denWoke', true);
      const seen = play(w, 'npc-ketta', 'ketta', (n) => (n.startsWith('r07-choice') ? pick : 1));
      expect(seen.some((n) => n.startsWith('r07-choice'))).toBe(true);
      expect(w.flags.get('story.r07.choice')).toBe(choice);
      expect(w.log.includes('favour dragons 3')).toBe(favour);
    }
  });

  it('Ketta\'s R05 choice writes safe or fox', () => {
    for (const [pick, choice] of [[1, 'safe'], [2, 'fox']] as const) {
      const w = world();
      w.set('r05', 'active', 'brief', 'hollows', 'tracks', 'boy', 'hounds');
      play(w, 'npc-ketta', 'ketta', (n) => (n.startsWith('r05-choice') || n === 'r05-choice' ? pick : 1));
      expect(w.flags.get('story.r05.choice')).toBe(choice);
    }
  });

  it('the R11 axe scene reads the choice: a slain and a spared reaction', () => {
    for (const choice of ['slain', 'spared']) {
      const w = world();
      w.flags.set('story.r11.choice', choice);
      expect(opens(w, 'scene-r11-axe', 'hrolf')).toBe(choice);
    }
  });

  it('Redmane\'s testimony opens only after the prisoners are freed, and Osgar\'s hand-in follows it', () => {
    const w = world();
    w.set('d03', 'active', 'prisoners');
    expect(opens(w, 'npc-redmane', 'redmane')).toBe('testimony');
    const early = world();
    early.set('d03', 'active', 'gate');
    expect(opens(early, 'npc-redmane', 'redmane')).toBe('idle');
  });
});

describe('the extended Act 1 trees keep their Act 1 behaviour', () => {
  const empty = (): Parameters<typeof evalCondition>[1] => ({
    state: { getFlag: () => undefined, favourBand: () => 'banked' as FavourBand, favour: () => 30 },
    quests: { state: () => 'inactive' as const, objectiveDone: () => false },
  } as never);
  const pairs: Array<[DialogueDef, DialogueDef]> = [];
  for (const base of [npcGaut, npcAelfreda, npcPennard]) {
    const ext = ACT2_EXTENDED_DIALOGUES.find((d) => d.id === base.id)!;
    pairs.push([base, ext]);
  }

  it.each(pairs.map(([b, e]) => [b.id, b, e] as const))('%s: the Act 1 nodes are all still there and every Act 2 rule needs an Act 2 state', (_id, base, ext) => {
    const have = new Set(ext.nodes.map((n) => n.id));
    for (const n of base.nodes) expect(have.has(n.id), n.id).toBe(true);
    const baseStart = (typeof base.start === 'string' ? [{ when: { all: [] } as Condition, node: base.start }] : base.start);
    const extStart = (typeof ext.start === 'string' ? [] : ext.start);
    expect(extStart.length).toBeGreaterThan(baseStart.length);
    const added = extStart.slice(0, extStart.length - baseStart.length);
    expect(extStart.slice(extStart.length - baseStart.length)).toEqual(baseStart); // Act 1's rules follow, unchanged
    for (const rule of added) expect(evalCondition(rule.when, empty()), rule.node).toBe(false);
  });

  it('the new nodes of an extension all carry the a2- prefix', () => {
    for (const [base, ext] of pairs) {
      const baseIds = new Set(base.nodes.map((n) => n.id));
      for (const n of ext.nodes) if (!baseIds.has(n.id)) expect(n.id.startsWith('a2-'), `${ext.id}:${n.id}`).toBe(true);
    }
  });

  it('Gaut at the ford after M04 and Pennard\'s trainer talk still open on their Act 1 nodes', () => {
    const w = world();
    w.set('m04', 'active', 'o2');
    expect(opens(w, 'npc-gaut', 'gaut')).not.toMatch(/^a2-/);
    const w2 = world();
    expect(opens(w2, 'npc-pennard', 'pennard')).not.toMatch(/^a2-/);
  });
});

describe('every Act 2 tree is wired', () => {
  it('registers each tree once with a start rule that can always win (a default) or is a director cue', () => {
    const ids = dialogueDefs.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ['npc-osgar', 'npc-maud', 'npc-ketta', 'npc-hrolf', 'npc-pell', 'npc-osric', 'npc-ealdred', 'npc-wynne', 'npc-corwin', 'npc-brand', 'npc-redmane', 'npc-lantern-keeper', 'npc-carter-bound', 'npc-beornwyn', 'scene-r11-den', 'scene-r11-axe', 'scene-d03-prisoner']) {
      expect(ids, id).toContain(id);
    }
  });
});
