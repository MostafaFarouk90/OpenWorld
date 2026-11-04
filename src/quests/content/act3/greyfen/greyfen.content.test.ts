// What the nine Greyfen quests are made of: strings, items, anchors, spawners, props and the unlock graph, checked against the
// shipped registries (K3's layout and interiors, K7's ferry, the Act 3 jump table) rather than against themselves.
import { describe, expect, it } from 'vitest';
import { questDefs } from '../../index';
import { ACT3_DIRECT } from '../../../act3Jump';
import { ACT3_QUEST_DEFS, ACT3_PROPS, ACT3_QUEST_NOTES, ACT3_NOTE_LIST, ACT3_SPAWNERS, ACT3_QUEST_ITEMS, ACT3_QUEST_ITEM_STRINGS, ACT3_NOTE_CODEX } from '../../act3';
import { GREYFEN_QUEST_LAYOUT, EXTRA_ANCHORS } from './extraAnchors';
import { GREYFEN_ARMS } from './arms';
import { GREYFEN_Q_NPCS, GREYFEN_Q_NPC_DEFS, GREYFEN_Q_NPC_STRINGS } from './npcs';
import { GREYFEN_TRIGGERS } from './triggers';
import { ITEMS } from '../../../../inventory/items';
import { questStrings } from '../../../strings.en';
import { dialogueStrings } from '../../../../dialogue/strings.en';
import { dialogueDefs } from '../../../../dialogue/content';
import { CHAPEL_DEF } from '../../../../greyfen/chapelInterior';
import { DEEPS_DEF } from '../../../../greyfen/deepsInterior';
import { HUT_DEF } from '../../../../greyfen/hutInterior';
import { GREYFEN_NPCS, GREYFEN_NPC_STRINGS_EN } from '../../../../greyfen/npcDefs';
import { validateQuest } from '../../../validate';
import type { Condition, Effect, QuestDef } from '../../../types';

const strings: Record<string, string> = { ...questStrings, ...dialogueStrings, ...ACT3_QUEST_ITEM_STRINGS, ...GREYFEN_Q_NPC_STRINGS, ...GREYFEN_NPC_STRINGS_EN };
const has = (k: string) => k in strings;
const anchorIds = new Set([...GREYFEN_QUEST_LAYOUT.anchors, ...CHAPEL_DEF.anchors, ...DEEPS_DEF.anchors, ...HUT_DEF.anchors].map((a) => a.id));
const ids = ['m23', 'm24', 'r12', 'm25', 'r14', 'r13', 'm26', 'm27', 'd05'];

/** Every quest id a start condition names. */
function questRefs(c: Condition | undefined, out = new Set<string>()): Set<string> {
  if (!c) return out;
  const x = c as Record<string, unknown>;
  if (typeof x.quest === 'string') out.add(x.quest);
  for (const k of ['all', 'any']) if (Array.isArray(x[k])) for (const s of x[k] as Condition[]) questRefs(s, out);
  if (x.not) questRefs(x.not as Condition, out);
  return out;
}

describe('the Greyfen quests as data', () => {
  it('are the nine, in play order, registered with the shipped quests', () => {
    expect(ACT3_QUEST_DEFS.map((q) => q.id)).toEqual(['m23', 'm24', 'r12', 'm25', 'r14', 'r13', 'm26', 'm27', 'd05']);
    for (const q of ACT3_QUEST_DEFS) expect(questDefs).toContain(q);
  });

  it('unlock exactly as the plan\'s graph (ACT3_DIRECT): M27 waits on M26 and R14, D05 on M27', () => {
    for (const q of ACT3_QUEST_DEFS) {
      const need = [...questRefs(q.startWhen)].sort();
      expect(need, q.id).toEqual([...ACT3_DIRECT[q.id]!].sort());
    }
    const m27 = ACT3_QUEST_DEFS.find((q) => q.id === 'm27')!;
    expect(JSON.stringify(m27.startWhen)).toContain('"all"');
    const m23 = ACT3_QUEST_DEFS.find((q) => q.id === 'm23')!;
    expect(m23.startWhen).toEqual({ flag: 'story.gate.a3', equals: true });
  });

  it.each(ids)('%s validates and every text key resolves', (id) => {
    const q = ACT3_QUEST_DEFS.find((x) => x.id === id) as QuestDef;
    expect(validateQuest(q, has)).toEqual([]);
    for (const o of q.objectives) expect(has(o.textKey), o.textKey).toBe(true);
    expect(has(q.titleKey)).toBe(true);
    expect(has(q.summaryKey)).toBe(true);
  });

  it('every prop prompt, note line, codex entry, item name and NPC name resolves', () => {
    for (const p of ACT3_PROPS) expect(has(p.promptKey), p.promptKey).toBe(true);
    for (const n of ACT3_NOTE_LIST) n.lines.forEach((_, i) => expect(has(`dialogue.${n.id}.${i + 1}`), n.id).toBe(true));
    for (const c of ACT3_NOTE_CODEX) {
      const slug = c.replace(/^lore\./, '');
      expect(has(`codex.lore.${slug}.name`) || has(`codex.${c}.name`), c).toBe(true);
    }
    for (const it of ACT3_QUEST_ITEMS) {
      expect(has(it.nameKey), it.nameKey).toBe(true);
      expect(has(it.descKey ?? ''), it.descKey).toBe(true);
      expect(ITEMS[it.id], it.id).toBeDefined();
    }
    for (const d of GREYFEN_Q_NPC_DEFS) expect(has(d.nameKey), d.nameKey).toBe(true);
  });

  it('every item the quests give or take exists (the five new ones, K9\'s herbs and recipe, the gear)', () => {
    const items = new Set<string>();
    const walk = (e: Effect[] | undefined): void => {
      for (const x of e ?? []) {
        const g = (x as { give?: Array<{ itemId: string }> }).give;
        for (const s of g ?? []) items.add(s.itemId);
      }
    };
    for (const q of ACT3_QUEST_DEFS) {
      walk(q.rewards);
      for (const o of q.objectives) if (o.type === 'collect') items.add(o.target as string);
    }
    for (const p of ACT3_PROPS) if (p.give) items.add(p.give.itemId);
    for (const id of items) expect(ITEMS[id], id).toBeDefined();
    for (const id of ['m24-ferry-horn', 'lullaby-reed-pipe', 'marsh-bow-bolts', 'murkjaw-tooth', 'hathrens-scale']) expect(items.has(id) || ITEMS[id], id).toBeTruthy();
  });

  it('every prop, note, NPC post, spawner and trigger stands on an anchor that exists (K3\'s or the extras)', () => {
    for (const p of ACT3_PROPS) expect(anchorIds.has(p.anchorId), `${p.interactableId} -> ${p.anchorId}`).toBe(true);
    for (const n of ACT3_QUEST_NOTES) expect(anchorIds.has(n.anchorId), n.anchorId).toBe(true);
    for (const n of GREYFEN_Q_NPCS) expect(anchorIds.has(n.post), n.post).toBe(true);
    for (const s of ACT3_SPAWNERS) for (const a of [s.anchor, ...(s.memberAnchors ?? [])]) expect(anchorIds.has(a), `${s.id} -> ${a}`).toBe(true);
    for (const t of GREYFEN_TRIGGERS) expect(anchorIds.has(t.anchorId), t.anchorId).toBe(true);
    for (const e of EXTRA_ANCHORS) expect(anchorIds.has(e.near), `${e.id} near ${e.near}`).toBe(true);
  });

  it('every extra anchor is new (K3 does not define it) and in the Greyfen\'s reserved prefix', () => {
    const base = new Set(GREYFEN_QUEST_LAYOUT.anchors.slice(0, GREYFEN_QUEST_LAYOUT.anchors.length - EXTRA_ANCHORS.length).map((a) => a.id));
    for (const e of EXTRA_ANCHORS) {
      expect(base.has(e.id), e.id).toBe(false);
      expect(e.id.startsWith('greyfen.'), e.id).toBe(true);
    }
    expect(new Set(EXTRA_ANCHORS.map((e) => e.id)).size).toBe(EXTRA_ANCHORS.length);
  });

  it('every spawner sits on the Greyfen block, never respawns and is switched by a flag some arm, prop or rule writes', () => {
    const writers = new Set<string>([...GREYFEN_ARMS.map((a) => a.flag), ...ACT3_PROPS.flatMap((p) => (p.usedFlag ? [p.usedFlag] : []))]);
    for (const s of ACT3_SPAWNERS) {
      expect(s.block, s.id).toBe('greyfen');
      expect(s.respawn, s.id).toBe('never');
      const flag = (s.activation as { flag?: string } | undefined)?.flag;
      expect(flag, s.id).toBeTruthy();
      expect(writers.has(flag!), `${s.id}: ${flag}`).toBe(true);
    }
  });

  it('every dialogue a talk objective names exists, and every NPC target has a tree', () => {
    const trees = new Set(dialogueDefs.map((d) => d.id));
    const npcs = new Set([...GREYFEN_NPCS.map((n) => n.id), ...GREYFEN_Q_NPCS.map((n) => n.id)]);
    for (const q of ACT3_QUEST_DEFS) {
      for (const o of q.objectives) {
        if (o.type !== 'talk') continue;
        const t = o.target as string;
        if (t.startsWith('scene.')) continue;
        expect(npcs.has(t), `${q.id}.${o.id} -> ${t}`).toBe(true);
        expect(trees.has(`npc-${t}`), `npc-${t}`).toBe(true);
      }
    }
  });

  it('writes only its own flags: story.<id>.* of the nine, plus the favoured pick keys', () => {
    const own = new RegExp(`^story\\.(${ids.join('|')})\\.`);
    const json = JSON.stringify(ACT3_QUEST_DEFS);
    const keys = [...json.matchAll(/"(story\.[a-z0-9.]+)"/gi)].map((m) => m[1]!);
    for (const k of keys) if (!['story.gate.a3', 'story.r14.choice'].includes(k)) expect(k, k).toMatch(own);
  });

  it('every kill objective names a tag some spawner carries', () => {
    const tags = new Set(ACT3_SPAWNERS.map((s) => s.tag));
    for (const q of ACT3_QUEST_DEFS) for (const o of q.objectives) if (o.type === 'kill') expect(tags.has(o.spawnTag!), `${q.id}.${o.id}`).toBe(true);
  });
});
