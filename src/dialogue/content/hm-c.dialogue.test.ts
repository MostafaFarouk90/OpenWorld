import { describe, it, expect } from 'vitest';
import { dialogueStrings, npcNameFallbackStrings } from '../strings.en';
import { dialogueStringsHmC } from '../strings.hm-c.en';
import { questStrings } from '../../quests/strings.en';
import { validateDialogue } from '../validate';
import { DialogueRunner } from '../DialogueRunner';
import { createEffectRunner } from '../../quests/effects';
import type { BusPort, QuestReader, StatePort, StringsPort } from '../../quests/ports';
import type { DialogueDef, FavourBand, FlagValue } from '../../quests/types';
import { sceneAct1Camp } from './scene-act1-camp.dialogue';
import { npcPennard } from './npc-pennard.dialogue';
import { npcAshdown } from './npc-ashdown.dialogue';
import { npcGaut } from './npc-gaut.dialogue';
import { npcStane } from './npc-stane.dialogue';

const all: Record<string, string> = { ...questStrings, ...dialogueStrings, ...npcNameFallbackStrings, ...dialogueStringsHmC };
const hasKey = (k: string) => k in all;
const defs: DialogueDef[] = [sceneAct1Camp, npcPennard, npcAshdown, npcGaut, npcStane];
type QS = 'inactive' | 'active' | 'completed';

function world(band: FavourBand = 'banked') {
  const flags = new Map<string, FlagValue>();
  const qstate = new Map<string, QS>();
  const events: string[] = [];
  const emitted: { type: string; payload: unknown }[] = [];
  const bus: BusPort = { on: () => () => {}, emit: (type, payload) => { events.push(type); emitted.push({ type, payload }); } };
  const state: StatePort = {
    getFlag: (k) => flags.get(k), setFlag: (k, v) => { flags.set(k, v); }, clearFlag: (k) => { flags.delete(k); },
    favourBand: () => band, favour: () => 30, addFavour: () => 0,
  };
  const quests: QuestReader & Record<string, any> = {
    state: (id: string) => qstate.get(id) ?? 'inactive',
    objectiveDone: () => false,
    start: () => true, complete: () => true, completeObjective: () => true,
  };
  const effects = createEffectRunner({ state, quests: quests as any, bus, sourceId: 'test' } as any);
  const strings: StringsPort = { t: (k) => all[k] ?? `[[${k}]]`, has: hasKey };
  const aborts: string[] = [];
  const dr = new DialogueRunner({ bus, state, quests, effects, strings });
  for (const d of defs) dr.register(d);
  return { flags, dr, qstate, events, emitted, aborts };
}
function play(w: ReturnType<typeof world>, id: string, npc: string): string[] {
  expect(w.dr.start(id, npc)).toBe(true);
  const seen: string[] = [];
  for (let i = 0; i < 80 && w.dr.isOpen; i++) {
    const v = w.dr.view()!;
    seen.push(v.nodeId);
    if (v.choices.length > 0) { w.dr.choose(v.choices.length); continue; } // the trainers' Train / Not now node: leave
    w.dr.advance();
  }
  expect(w.dr.isOpen).toBe(false);
  return seen;
}

describe('hm-c dialogues', () => {
  it.each(defs.map((d) => [d.id, d] as const))('%s validates clean', (_id, def) => {
    const r = validateDialogue(def, hasKey);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it('all text keys exist and every node is reachable', () => {
    for (const d of defs) {
      for (const n of d.nodes) {
        expect(hasKey(n.textKey), `${d.id}:${n.id}`).toBe(true);
        for (const c of n.choices ?? []) expect(hasKey(c.textKey), `${d.id}:${n.id}:${c.id}`).toBe(true);
      }
      const reach = new Set<string>();
      const stack: string[] = Array.isArray(d.start) ? d.start.map((e) => e.node) : [d.start];
      while (stack.length) {
        const id = stack.pop()!;
        if (reach.has(id)) continue;
        reach.add(id);
        const n = d.nodes.find((x) => x.id === id)!;
        expect(n, `${d.id}:${id}`).toBeDefined();
        if (n.next) stack.push(n.next);
        for (const c of n.choices ?? []) if (c.next) stack.push(c.next);
      }
      for (const n of d.nodes) expect(reach.has(n.id), `${d.id}:${n.id} unreachable`).toBe(true);
    }
  });

  it('strings have no dashes, no literal Cael and no unused keys', () => {
    for (const [k, v] of Object.entries(dialogueStringsHmC)) {
      expect(v, k).not.toMatch(/[‒-―−]| - | -- /);
      expect(v, k).not.toMatch(/Cael/);
    }
    const used = new Set<string>();
    for (const d of defs) for (const n of d.nodes) { used.add(n.textKey); for (const c of n.choices ?? []) used.add(c.textKey); }
    for (const k of Object.keys(dialogueStringsHmC)) expect(used.has(k), k).toBe(true);
  });

  it('the new npc files end with an idle entry', () => {
    for (const d of [npcPennard, npcAshdown]) {
      const last = (d.start as { when: unknown; node: string }[]).at(-1)!;
      expect(last).toEqual({ when: { all: [] }, node: 'idle' });
    }
    expect(npcAshdown.nodes.some((n) => n.textKey.endsWith('idle-2'))).toBe(true);
    expect(dialogueStringsHmC['dialogue.npc-ashdown.idle-2']).toMatch(/Bolts/);
  });
});

describe('camp scene', () => {
  const GROUPS: Record<string, string[]> = {
    gate: ['gate-stealth', 'gate-bribe', 'gate-persuasion'],
    prior: ['prior-released', 'prior-defeated', 'prior-rumour'],
    grim: ['grim-released', 'grim-defeated'],
    steward: ['steward-expose', 'steward-shield'],
    debt: ['debt-forgiven', 'debt-collected'],
  };
  it('has 14 to 20 nodes and no choices', () => {
    expect(sceneAct1Camp.nodes.length).toBeGreaterThanOrEqual(14);
    expect(sceneAct1Camp.nodes.length).toBeLessThanOrEqual(20);
    expect(sceneAct1Camp.nodes.every((n) => !n.choices)).toBe(true);
    expect(typeof sceneAct1Camp.start).toBe('string');
  });

  it('runs start to end under every combination, one line per group, sets campSeen', () => {
    let runs = 0;
    for (const gate of ['stealth', 'bribe', 'persuasion'])
      for (const prior of ['released', 'defeated', 'rumour'])
        for (const grim of ['released', 'defeated'])
          for (const steward of ['expose', 'shield'])
            for (const debt of ['forgiven', 'collected']) {
              const w = world();
              w.flags.set('story.m06.route', gate);
              if (prior === 'rumour') { w.qstate.set('d01', 'active'); w.flags.set('boss.ashen-prior.outcome', 'released'); }
              else { w.qstate.set('d01', 'completed'); w.flags.set('boss.ashen-prior.outcome', prior); }
              w.flags.set('boss.gaffer-grimtooth.outcome', grim);
              w.flags.set('story.r04.choice', steward);
              w.flags.set('world.harrowmark.inn.price', debt);
              const seen = play(w, 'scene-act1-camp', 'camp');
              for (const [g, ids] of Object.entries(GROUPS)) expect(seen.filter((id) => ids.includes(id)), `${g}`).toHaveLength(1);
              expect(seen.filter((id) => GROUPS.gate.includes(id))).toEqual([`gate-${gate}`]);
              expect(seen.filter((id) => GROUPS.prior.includes(id))).toEqual([`prior-${prior}`]);
              expect(seen[0]).toBe('c1');
              expect(seen.at(-1)).toBe('end');
              expect(w.flags.get('story.d02.campSeen')).toBe(true);
              expect(w.events).toContain('story.act1.camp.begin');
              expect(w.events).toContain('story.act1.camp.end');
              expect(w.dr.isOpen).toBe(false);
              runs++;
            }
    expect(runs).toBe(72);
  });
});

describe('trainers', () => {
  const trainers = [
    ['npc-gaut', 'gaut'], ['npc-stane', 'stane'], ['npc-pennard', 'pennard'], ['npc-ashdown', 'ashdown'],
  ] as const;
  it.each(trainers)('%s switches closed/open on story.m07.classOpen', (id, npc) => {
    const w = world(); w.qstate.set('m07', 'active'); w.qstate.set('r02', 'completed'); w.qstate.set('m04', 'completed');
    expect(play(w, id, npc)).toEqual(['trainer-closed']);
    w.flags.set('story.m07.classOpen', true);
    expect(play(w, id, npc)).toEqual(['trainer-open', 'trainer-open-2']);
    const v = world(); v.qstate.set('m07', 'completed');
    expect(play(v, id, npc)).toEqual(['trainer-closed']);
  });

  it.each(trainers)('%s: Train emits classes.trainer.open for its class', (id, npc) => {
    const w = world(); w.qstate.set('m07', 'active'); w.flags.set('story.m07.classOpen', true);
    expect(w.dr.start(id, npc)).toBe(true);
    w.dr.advance();
    const v = w.dr.view()!;
    expect(v.choices.map((c) => c.id)).toEqual(['train', 'leave']);
    w.dr.choose(1);
    const want = { gaut: 'knight', stane: 'warden', pennard: 'emberwright', ashdown: 'pathfinder' }[npc];
    expect(w.emitted.filter((e) => e.type === 'classes.trainer.open').map((e) => e.payload)).toEqual([{ classId: want }]);
  });

  it('idles before m07 for the new npcs', () => {
    expect(play(world(), 'npc-pennard', 'pennard')).toEqual(['idle']);
    expect(play(world(), 'npc-ashdown', 'ashdown')).toEqual(['idle', 'idle-2']);
  });

  it('Gaut waits at the gate during m06 and keeps older stages', () => {
    const w = world(); w.qstate.set('m06', 'active');
    expect(play(w, 'npc-gaut', 'gaut')).toEqual(['m06-gate-wait']);
    const x = world(); x.qstate.set('m04', 'active');
    expect(play(x, 'npc-gaut', 'gaut')).toEqual(['m04-ford']);
  });

  it('Stane keeps R02 offer, tips and idles', () => {
    const w = world();
    expect(play(w, 'npc-stane', 'stane')).toEqual(['idle']);
    w.qstate.set('r02', 'active');
    expect(play(w, 'npc-stane', 'stane')).toEqual(['r02-tip-open']);
    w.qstate.set('r02', 'completed');
    expect(play(w, 'npc-stane', 'stane')).toEqual(['idle-after']);
  });
});
