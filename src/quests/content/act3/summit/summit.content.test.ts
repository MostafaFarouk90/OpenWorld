// What the five summit quests are made of: strings, items, anchors, spawners, props, flags and the unlock graph, checked against the shipped
// registries (K4's layout and flags, K8's outcome flag, the item table, the Act 3 jump table) rather than against themselves.
import { describe, expect, it } from 'vitest';
import { questDefs } from '../../index';
import { ACT3_DIRECT } from '../../../act3Jump';
import { SUMMIT, SUMMIT_QUEST_IDS } from './summit.content';
import { SUMMIT_ARMS } from './arms';
import { SUMMIT_GROUP_OBJECTIVES } from './groups';
import { SUMMIT_POST_RULES } from './postRules';
import { SUMMIT_NPCS, SUMMIT_NPC_DEFS, SUMMIT_NPC_STRINGS_EN } from './npcs';
import { ITEMS } from '../../../../inventory/items';
import { questStrings } from '../../../strings.en';
import { dialogueStrings } from '../../../../dialogue/strings.en';
import { dialogueDefs } from '../../../../dialogue/content';
import { dragonspineBuild } from '../../../../dragonspine/layout';
import { DRAGONSPINE_INTERIORS } from '../../../../dragonspine/interiors';
import { DRAGONSPINE_NPC_DEFS } from '../../../../dragonspine/npcDefs';
import * as K4 from '../../../../dragonspine/flags';
import { WYRMS_HEARTH } from '../../../../shrine/act3/tuning';
import { validateQuest } from '../../../validate';
import { M33_ANCHOR_FLAGS } from './m33.quest';
import { M32_COMPLETE } from './m32.quest';
import { M34_LIT_FLAG } from './m34.quest';
import { D06_COMPLETE, D06_GATE_OPEN, D06_STARTED, D06_SKARL_OUTCOME } from './d06.quest';
import { SUMMIT_QUEST_STRINGS } from './strings';
import type { Condition, Effect } from '../../../types';

const DEFS = SUMMIT.quests;
const strings: Record<string, string> = { ...questStrings, ...dialogueStrings, ...SUMMIT.itemStrings, ...SUMMIT_NPC_STRINGS_EN };
const has = (k: string): boolean => k in strings;
const build = dragonspineBuild();
const anchorIds = new Set([...build.layout.anchors.map((a: { id: string }) => a.id), ...DRAGONSPINE_INTERIORS.flatMap((d) => d.anchors.map((a) => a.id))]);

function questRefs(c: Condition | undefined, out = new Set<string>()): Set<string> {
  if (!c) return out;
  const x = c as Record<string, unknown>;
  if (typeof x.quest === 'string') out.add(x.quest);
  for (const k of ['all', 'any']) if (Array.isArray(x[k])) for (const s of x[k] as Condition[]) questRefs(s, out);
  if (x.not) questRefs(x.not as Condition, out);
  return out;
}

describe('the summit quests as data', () => {
  it('are the five, in play order (plan Part 7.1), registered with the shipped quests', () => {
    expect(DEFS.map((q) => q.id)).toEqual(['m31', 'm32', 'm33', 'm34', 'd06']);
    expect(SUMMIT_QUEST_IDS).toEqual(['m31', 'm32', 'm33', 'm34', 'd06']);
    for (const q of DEFS) expect(questDefs).toContain(q);
  });

  it("unlock exactly as the plan's graph (ACT3_DIRECT): M31 waits for R16, M34 for the whole act", () => {
    for (const q of DEFS) expect([...questRefs(q.startWhen)].sort(), q.id).toEqual([...ACT3_DIRECT[q.id]!].sort());
    const m31 = [...questRefs(DEFS[0]!.startWhen)];
    expect(m31).toContain('r16');
    for (const need of ['m23', 'm24', 'm25', 'm26', 'm27', 'd05', 'm28', 'm29', 'm30']) expect(m31).toContain(need);
    for (const side of ['r12', 'r13', 'r14', 'r15', 'r17', 'r18']) expect(m31, side).not.toContain(side);
    const m34 = [...questRefs(DEFS[3]!.startWhen)];
    for (const need of ['m31', 'm32', 'm33', 'r12', 'r13', 'r14', 'r15', 'r16', 'r17', 'r18', 'm23', 'm27', 'd05', 'm28', 'm29', 'm30']) expect(m34, need).toContain(need);
    expect(DEFS[1]!.startWhen).toEqual({ quest: 'm31', state: 'completed' });
    expect(DEFS[2]!.startWhen).toEqual({ quest: 'm32', state: 'completed' });
    expect(DEFS[4]!.startWhen).toEqual({ quest: 'm34', state: 'completed' });
    for (const q of DEFS) expect(JSON.stringify(q.startWhen), q.id).not.toContain('story.gate.a3');
  });

  it.each(SUMMIT_QUEST_IDS)('%s validates and every text key resolves', (id) => {
    const q = DEFS.find((x) => x.id === id)!;
    expect(validateQuest(q, has)).toEqual([]);
    for (const o of q.objectives) expect(has(o.textKey), o.textKey).toBe(true);
    expect(has(q.titleKey)).toBe(true);
    expect(has(q.summaryKey)).toBe(true);
  });

  it('every prop prompt, note line, NPC name, item name and description and director toast resolves', () => {
    for (const p of SUMMIT.props) expect(has(p.promptKey), p.promptKey).toBe(true);
    expect(has('quest.prompt.ysmeryth')).toBe(true);
    for (const n of SUMMIT.notes) n.lines.forEach((_, i) => expect(has(`dialogue.${n.id}.${i + 1}`), n.id).toBe(true));
    for (const d of SUMMIT_NPC_DEFS) expect(has(d.nameKey), d.nameKey).toBe(true);
    for (const it of SUMMIT.items) {
      expect(has(it.nameKey), it.nameKey).toBe(true);
      expect(has(it.descKey ?? ''), it.descKey).toBe(true);
      expect(ITEMS[it.id], it.id).toBeDefined();
    }
    for (const k of Object.keys(SUMMIT_QUEST_STRINGS).filter((x) => x.startsWith('dragonspine.q.'))) expect(has(k), k).toBe(true);
  });

  it('every item the quests give or take exists (the Ember Scale is new)', () => {
    const items = new Set<string>();
    const walk = (e: Effect[] | undefined): void => {
      for (const x of e ?? []) for (const s of (x as { give?: Array<{ itemId: string }> }).give ?? []) items.add(s.itemId);
    };
    for (const q of DEFS) walk(q.rewards);
    for (const id of items) expect(ITEMS[id], id).toBeDefined();
    for (const id of ['ysmeryths-ember-scale', 'cliff-crampons', 'skarls-crossbow']) expect(items.has(id), id).toBe(true);
    expect(SUMMIT.items.map((i) => i.id)).toEqual(['ysmeryths-ember-scale']);
  });

  it('every prop, note and spawner stands on an anchor K4 defines; every post rule names real anchors or the director\'s two', () => {
    for (const p of SUMMIT.props) expect(anchorIds.has(p.anchorId), `${p.interactableId} -> ${p.anchorId}`).toBe(true);
    for (const n of SUMMIT.notes) expect(anchorIds.has(n.anchorId), n.anchorId).toBe(true);
    for (const s of SUMMIT.spawners) for (const a of [s.anchor, ...(s.memberAnchors ?? [])]) expect(anchorIds.has(a), `${s.id} -> ${a}`).toBe(true);
    const director = new Set(['dragonspine.d06.thorgar', 'dragonspine.m34.thorgar']);
    for (const r of SUMMIT_POST_RULES) {
      expect(anchorIds.has(r.home), r.home).toBe(true);
      for (const p of r.posts) expect(anchorIds.has(p.anchorId) || director.has(p.anchorId), p.anchorId).toBe(true);
    }
    for (const n of SUMMIT_NPCS) {
      expect(anchorIds.has(n.post), n.post).toBe(true);
      if (n.walkOff) expect(anchorIds.has(n.walkOff.to), n.walkOff.to).toBe(true);
    }
    for (const a of ['dragonspine.shelter.m31-offer', 'dragonspine.summit-gate', 'dragonspine.roost.arena.centre', 'dragonspine.hearth.eadgyth', 'dragonspine.hearth.keeper-stone',
      'dragonspine.hearth.ysmeryth.land', 'dragonspine.hearth.ysmeryth.reveal', 'dragonspine.skyhold.camp', 'dragonspine.skyhold.flight.escape', 'dragonspine.aerie.landing',
      'dragonspine.glide.summit-aerie.launch', 'dragonspine.glide.hearth-updraft.launch', 'dragonspine.roost.leap.1', 'dragonspine.roost.leap.2', 'dragonspine.roost.leap.3']) {
      expect(anchorIds.has(a), a).toBe(true);
    }
    expect(build.layout.triggers.map((t) => t.id)).toContain('trg.dragonspine.aerie.arrival');
  });

  it('every spawner is on the summit area, never respawns and is switched by a flag an arm writes', () => {
    const writers = new Set(SUMMIT_ARMS.map((a) => a.flag));
    for (const s of SUMMIT.spawners) {
      expect(s.area, s.id).toBe('dragonspine-summit');
      expect(s.respawn, s.id).toBe('never');
      const flag = (s.activation as { flag?: string } | undefined)?.flag;
      expect(flag, s.id).toBeTruthy();
      expect(writers.has(flag!), `${s.id}: ${flag}`).toBe(true);
    }
    const ids = new Set(SUMMIT.spawners.map((s) => s.id));
    for (const g of SUMMIT_GROUP_OBJECTIVES) for (const id of g.groups) expect(ids.has(id), id).toBe(true);
  });

  it('every talk objective names a tree (the NPCs the summit registers, the lodge cast or a scene)', () => {
    const trees = new Set(dialogueDefs.map((d) => d.id));
    const npcs = new Set([...DRAGONSPINE_NPC_DEFS, ...SUMMIT_NPC_DEFS].map((n) => n.id));
    for (const q of DEFS) {
      for (const o of q.objectives) {
        if (o.type !== 'talk') continue;
        const t = o.target as string;
        if (t.startsWith('scene.')) continue;
        if (t !== 'ysmeryth') expect(npcs.has(t), `${q.id}.${o.id} -> ${t}`).toBe(true);
        expect(trees.has(`npc-${t}`), `npc-${t}`).toBe(true);
      }
    }
  });

  it("writes only its own flags: story.<id>.* of the five, K8's outcome flag, K9's Hearth flag and the lower block's R16 choice", () => {
    const own = new RegExp(`^story\\.(${SUMMIT_QUEST_IDS.join('|')})\\.`);
    const keys = [...JSON.stringify(DEFS).matchAll(/"(story\.[a-z0-9.]+)"/gi)].map((m) => m[1]!);
    for (const k of keys) expect(k, k).toMatch(own);
  });

  it("pins K4's, K8's and K9's flag strings", () => {
    expect(M33_ANCHOR_FLAGS).toEqual([1, 2, 3, 4, 5, 6].map((n) => K4.m33AnchorFlag(n)));
    expect(D06_GATE_OPEN).toBe(K4.D06_GATE_OPEN_FLAG);
    expect(D06_STARTED).toBe(K4.D06_STARTED_FLAG);
    expect(D06_COMPLETE).toBe(K4.D06_COMPLETE_FLAG);
    expect(M32_COMPLETE).toBe(K4.M32_COMPLETE_FLAG);
    expect(D06_SKARL_OUTCOME).toBe(K4.SKARL_OUTCOME_FLAG);
    expect(M34_LIT_FLAG).toBe(`shrine.${WYRMS_HEARTH.id}.lit`);
  });
});
