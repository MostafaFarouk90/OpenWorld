// What the seven lower Dragonspine quests are made of: strings, items, anchors, spawners, props and the unlock graph, checked against
// the shipped registries (K4's layout, the item table, the Act 3 jump table) rather than against themselves.
import { describe, expect, it } from 'vitest';
import { questDefs } from '../../index';
import { ACT3_DIRECT } from '../../../act3Jump';
import { DRAGONSPINE_LOWER } from './dragonspine.content';
import { DRAGONSPINE_ARMS } from './arms';
import { DRAGONSPINE_GROUP_OBJECTIVES } from './groups';
import { ITEMS } from '../../../../inventory/items';
import { questStrings } from '../../../strings.en';
import { dialogueStrings } from '../../../../dialogue/strings.en';
import { dialogueDefs } from '../../../../dialogue/content';
import { DRAGONSPINE_NPC_DEFS, DRAGONSPINE_NPC_STRINGS_EN } from '../../../../dragonspine/npcDefs';
import { dragonspineBuild } from '../../../../dragonspine/layout';
import { DRAGONSPINE_DOOR_LOCKS, DRAGONSPINE_FLAG_BLOCKERS, DRAGONSPINE_INTERIORS, COLLAPSED_CAVE_DOOR_ID, ROCKFALL_BLOCKER_ID } from '../../../../dragonspine/interiors';
import * as K4 from '../../../../dragonspine/flags';
import { WAYSIDE, LAST_ANVIL } from '../../../../shrine/act3/tuning';
import { buildCarryRoutes } from '../../../../dragonspine/carryRoutes';
import { heightAt } from '../../../../terrain/heightfield';
import { validateQuest } from '../../../validate';
import { R16_ROCKFALL_CLEARED_FLAG, R16_STARTED_FLAG } from './r16.quest';
import { R15_SLEDS } from './r15.quest';
import { R17_HAWK_FLAGS } from './r17.quest';
import { R18_PARENTS_TAG } from './r18.quest';
import type { Condition, Effect } from '../../../types';

const DEFS = DRAGONSPINE_LOWER.quests;
const ids = ['m28', 'r15', 'm29', 'r16', 'm30', 'r17', 'r18'];
const strings: Record<string, string> = { ...questStrings, ...dialogueStrings, ...DRAGONSPINE_LOWER.itemStrings, ...DRAGONSPINE_NPC_STRINGS_EN };
const has = (k: string) => k in strings;
const build = dragonspineBuild();
const anchorIds = new Set([...build.layout.anchors.map((a: { id: string }) => a.id), ...DRAGONSPINE_INTERIORS.flatMap((d) => d.anchors.map((a) => a.id))]);
const triggerIds = new Set(build.layout.triggers.map((t) => t.id));

function questRefs(c: Condition | undefined, out = new Set<string>()): Set<string> {
  if (!c) return out;
  const x = c as Record<string, unknown>;
  if (typeof x.quest === 'string') out.add(x.quest);
  for (const k of ['all', 'any']) if (Array.isArray(x[k])) for (const s of x[k] as Condition[]) questRefs(s, out);
  if (x.not) questRefs(x.not as Condition, out);
  return out;
}

describe('the lower Dragonspine quests as data', () => {
  it('are the seven, in play order (plan Part 7.1), registered with the shipped quests', () => {
    expect(DEFS.map((q) => q.id)).toEqual(ids);
    for (const q of DEFS) expect(questDefs).toContain(q);
  });

  it("unlock exactly as the plan's graph (ACT3_DIRECT) and the quest-unlock phase hold", () => {
    for (const q of DEFS) {
      const need = [...questRefs(q.startWhen)].sort();
      expect(need, q.id).toEqual([...ACT3_DIRECT[q.id]!].sort());
    }
    // M28 opens on the Act 3 gate alone, and so does nothing else of this block
    expect(DEFS.find((q) => q.id === 'm28')!.startWhen).toEqual({ flag: 'story.gate.a3', equals: true });
    for (const q of DEFS.filter((x) => x.id !== 'm28')) expect(JSON.stringify(q.startWhen), q.id).not.toContain('story.gate.a3');
    // the side quests wait for their main-line parent, never for a sibling side quest
    for (const [side, main] of [['r15', 'm28'], ['r18', 'm28'], ['r16', 'm29'], ['r17', 'm30']] as const) expect([...questRefs(DEFS.find((q) => q.id === side)!.startWhen)]).toEqual([main]);
  });

  it.each(ids)('%s validates and every text key resolves', (id) => {
    const q = DEFS.find((x) => x.id === id)!;
    expect(validateQuest(q, has)).toEqual([]);
    for (const o of q.objectives) expect(has(o.textKey), o.textKey).toBe(true);
    expect(has(q.titleKey)).toBe(true);
    expect(has(q.summaryKey)).toBe(true);
  });

  it('every prop prompt, note line, item name and description, and the director toasts resolve', () => {
    for (const p of DRAGONSPINE_LOWER.props) expect(has(p.promptKey), p.promptKey).toBe(true);
    for (const n of DRAGONSPINE_LOWER.notes) n.lines.forEach((_, i) => expect(has(`dialogue.${n.id}.${i + 1}`), n.id).toBe(true));
    for (const it of DRAGONSPINE_LOWER.items) {
      expect(has(it.nameKey), it.nameKey).toBe(true);
      expect(has(it.descKey ?? ''), it.descKey).toBe(true);
      expect(ITEMS[it.id], it.id).toBeDefined();
    }
    for (const key of ['bundleLying']) expect(has(`quest.prompt.${key}`), key).toBe(true);
    for (const k of ['failed', 'back', 'set1', 'set2', 'set3'].map((s) => `dragonspine.q.r18.${s}`)) expect(has(k), k).toBe(true);
    expect(strings['dragonspine.q.r18.failed']).toBe('The parents took the eggs back to the camp.');
    for (const k of ['r15.delivered', 'r17.switch', 'r17.lost', 'm28.ledge', 'm29.fire', 'r16.rockfall']) expect(has(`dragonspine.q.${k}`), k).toBe(true);
  });

  it('every item the quests give or take exists (the five new ones and the gear)', () => {
    const items = new Set<string>();
    const walk = (e: Effect[] | undefined): void => {
      for (const x of e ?? []) for (const s of (x as { give?: Array<{ itemId: string }> }).give ?? []) items.add(s.itemId);
    };
    for (const q of DEFS) {
      walk(q.rewards);
      for (const o of q.objectives) if (o.type === 'collect') items.add(o.target as string);
    }
    for (const p of DRAGONSPINE_LOWER.props) if (p.give) items.add(p.give.itemId);
    for (const id of items) expect(ITEMS[id], id).toBeDefined();
    for (const id of ['rime-cloak', 'ashmare-saddlebags', 'frostbrows-hunting-knife', 'rimewood-haft', 'frostbrows-axe', 'ansgars-blessing', 'hawk-feather-charm']) expect(items.has(id), id).toBe(true);
    expect(DRAGONSPINE_LOWER.items.map((i) => i.id).sort()).toEqual(['ansgars-blessing', 'forge-candle-bundle', 'frostbrows-axe', 'hawk-feather-charm', 'rime-hawk-egg']);
  });

  it("every prop, note, spawner and trigger the director reads stands on an anchor or trigger K4 defines", () => {
    for (const p of DRAGONSPINE_LOWER.props) expect(anchorIds.has(p.anchorId), `${p.interactableId} -> ${p.anchorId}`).toBe(true);
    for (const n of DRAGONSPINE_LOWER.notes) expect(anchorIds.has(n.anchorId), n.anchorId).toBe(true);
    for (const s of DRAGONSPINE_LOWER.spawners) for (const a of [s.anchor, ...(s.memberAnchors ?? [])]) expect(anchorIds.has(a), `${s.id} -> ${a}`).toBe(true);
    for (const a of ['dragonspine.m28.trailhead', 'dragonspine.m28.leap.1', 'dragonspine.m28.leap.2', 'dragonspine.m28.crag', 'dragonspine.m28.crag.view', 'dragonspine.cave.mouth',
      'dragonspine.hawk.companion-hold', ...Array.from({ length: 6 }, (_, i) => WAYSIDE.anchor(i + 1)), LAST_ANVIL.siteAnchor]) expect(anchorIds.has(a), a).toBe(true);
    for (const t of ['trg.dragonspine.hawkcliffs.nest', 'trg.dragonspine.m28.trailhead', 'trg.dragonspine.cave.mouth']) expect(triggerIds.has(t), t).toBe(true);
  });

  it('every spawner sits on the lower block, never respawns and is switched by a flag some arm, prop or rule writes', () => {
    const writers = new Set<string>([
      ...DRAGONSPINE_ARMS.map((a) => a.flag), ...DRAGONSPINE_LOWER.props.flatMap((p) => (p.usedFlag ? [p.usedFlag] : [])),
      'story.r15.hauling', // the sled rule
    ]);
    for (const s of DRAGONSPINE_LOWER.spawners) {
      expect(s.block, s.id).toBe('dragonspine-lower');
      expect(s.respawn, s.id).toBe('never');
      if (s.activation === 'manual') { expect(s.tag, s.id).toBe(R18_PARENTS_TAG); continue; }
      const flag = (s.activation as { flag?: string } | undefined)?.flag;
      expect(flag, s.id).toBeTruthy();
      expect(writers.has(flag!), `${s.id}: ${flag}`).toBe(true);
    }
    expect(R17_HAWK_FLAGS.every((f) => writers.has(f))).toBe(true);
  });

  it('every dialogue a talk objective names exists, and every NPC target has a tree', () => {
    const trees = new Set(dialogueDefs.map((d) => d.id));
    const npcs = new Set(DRAGONSPINE_NPC_DEFS.map((n) => n.id));
    for (const q of DEFS) {
      for (const o of q.objectives) {
        if (o.type !== 'talk') continue;
        const t = o.target as string;
        if (t.startsWith('scene.')) continue;
        expect(npcs.has(t), `${q.id}.${o.id} -> ${t}`).toBe(true);
        expect(trees.has(`npc-${t}`), `npc-${t}`).toBe(true);
      }
    }
  });

  it("writes only its own flags: story.<id>.* of the seven, plus the gate and the world's shrine and rubbing flags", () => {
    const own = new RegExp(`^story\\.(${ids.join('|')})\\.`);
    const json = JSON.stringify(DEFS);
    const keys = [...json.matchAll(/"(story\.[a-z0-9.]+)"/gi)].map((m) => m[1]!);
    for (const k of keys) if (k !== 'story.gate.a3') expect(k, k).toMatch(own);
  });

  it('every kill objective names a tag some spawner carries; every group row names real spawner ids', () => {
    const tags = new Set(DRAGONSPINE_LOWER.spawners.map((s) => s.tag));
    for (const q of DEFS) for (const o of q.objectives) if (o.type === 'kill') expect(tags.has(o.spawnTag!), `${q.id}.${o.id}`).toBe(true);
    const spawnerIds = new Set(DRAGONSPINE_LOWER.spawners.map((s) => s.id));
    for (const g of DRAGONSPINE_GROUP_OBJECTIVES) for (const id of g.groups) expect(spawnerIds.has(id), id).toBe(true);
  });

  it("pins K4's flag strings, K4's carry route ids and the sled ids it adds", () => {
    expect(R16_STARTED_FLAG).toBe(K4.R16_STARTED_FLAG);
    expect(R16_ROCKFALL_CLEARED_FLAG).toBe(K4.R16_ROCKFALL_CLEARED_FLAG);
    expect(DRAGONSPINE_DOOR_LOCKS[COLLAPSED_CAVE_DOOR_ID]).toBe(R16_STARTED_FLAG);
    expect(DRAGONSPINE_FLAG_BLOCKERS[ROCKFALL_BLOCKER_ID]).toBe(R16_ROCKFALL_CLEARED_FLAG);
    expect(K4.R16_CHOICE_FLAG).toBe('story.r16.choice');
    const routes = buildCarryRoutes(heightAt, build).map((r) => r.id);
    for (const id of [...R15_SLEDS, 'egg.r18.1', 'egg.r18.2', 'egg.r18.3', 'candle.r17.down', 'candle.r17.up']) expect(routes, id).toContain(id);
  });
});
