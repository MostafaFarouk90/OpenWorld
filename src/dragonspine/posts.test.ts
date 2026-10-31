import { describe, expect, it } from 'vitest';
import { POST_RULES, resolvePosts } from '../quests/posts';
import type { ConditionEnv } from '../quests/ports';
import { buildDragonspine } from './layout';
import { buildDragonspineInteriors } from './interiors';
import { DRAGONSPINE_NPC_DEFS, DRAGONSPINE_NPC_STRINGS_EN, DRAGONSPINE_NPCS } from './npcDefs';
import { DRAGONSPINE_POST_RULES } from './postRules';
import { registerDragonspineKinds } from './structureKinds';
import { stubInputs } from './testing/fixture';

const env: ConditionEnv = { state: { getFlag: () => undefined } as never, quests: { state: () => 'inactive', objectiveDone: () => false } as never };
const inp = stubInputs();
const release = registerDragonspineKinds();
const layout = buildDragonspine(inp).layout;
release();
const hallAnchors = new Set(buildDragonspineInteriors(inp).flatMap((d) => d.anchors.map((a) => a.id)));
const layoutAnchors = new Set(layout.anchors.map((a) => a.id));

describe('Dragonspine NPC posts', () => {
  it('name anchors that exist: the layout\'s homes and the hall\'s own posts', () => {
    for (const r of DRAGONSPINE_POST_RULES) {
      expect(layoutAnchors.has(r.home), r.home).toBe(true);
      for (const p of r.posts) expect(hallAnchors.has(p.anchorId) || layoutAnchors.has(p.anchorId), p.anchorId).toBe(true);
    }
  });

  it('turns all six lodge hunters out after story.m34.complete, facing away from the yard, and back in on a state without it', () => {
    const m34: ConditionEnv = { ...env, state: { getFlag: (k: string) => (k === 'story.m34.complete' ? true : undefined), getBool: (k: string) => k === 'story.m34.complete' } as never };
    const at = resolvePosts(POST_RULES, m34);
    for (const n of [1, 2, 3, 4, 5, 6]) {
      expect(at[`lodge-hunter-${n}`]?.anchorId).toBe(`npc-post.lodge-hunter-${n}.out`);
      const out = layout.anchors.find((a) => a.id === `npc-post.lodge-hunter-${n}.out`)!;
      const home = layout.anchors.find((a) => a.id === `npc-post.lodge-hunter-${n}`)!;
      // The outward post faces away from the yard's centre (its forward vector points away from it).
      const yaw = (out.yawDeg * Math.PI) / 180;
      const fwd = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
      const L = inp.plateaus.find((p) => p.id === 'wyrmwatch-lodge')!.box;
      const away = { x: out.x - (L.minX + L.maxX) / 2, z: out.z - (L.minZ + L.maxZ) / 2 };
      expect(fwd.x * away.x + fwd.z * away.z, `hunter ${n}`).toBeGreaterThan(0);
      expect(home).toBeTruthy();
    }
    const before = resolvePosts(POST_RULES, env);
    for (const n of [1, 2, 3, 4]) expect(before[`lodge-hunter-${n}`]?.anchorId ?? `npc-post.lodge-hunter-${n}`).toBe(`npc-post.lodge-hunter-${n}`);
  });

  it('are in POST_RULES, move only the six lodge hunters, and no Act 1 or 2 row names a Dragonspine NPC', () => {
    expect(DRAGONSPINE_POST_RULES.map((r) => r.npcId)).toEqual([1, 2, 3, 4, 5, 6].map((n) => `lodge-hunter-${n}`));
    const ours = new Set(DRAGONSPINE_NPCS.map((n) => n.id));
    for (const r of POST_RULES.filter((x) => !DRAGONSPINE_POST_RULES.includes(x))) expect(ours.has(r.npcId), r.npcId).toBe(false);
    const at = resolvePosts(POST_RULES, env);
    expect(at['lodge-hunter-5']?.anchorId).toBe('dragonspine.hall.hunter.1');
    expect(at['lodge-hunter-6']?.anchorId).toBe('dragonspine.hall.hunter.2');
  });

  it('gives every spec a def, a name and a dialogue id, with no id twice', () => {
    const defs = new Map(DRAGONSPINE_NPC_DEFS.map((d) => [d.id, d]));
    expect(defs.size).toBe(DRAGONSPINE_NPC_DEFS.length);
    const ids = DRAGONSPINE_NPCS.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const n of DRAGONSPINE_NPCS) {
      const d = defs.get(n.id)!;
      expect(d, n.id).toBeTruthy();
      expect(d.dialogueId).toBe(`npc-${n.id}`);
      expect(DRAGONSPINE_NPC_STRINGS_EN[d.nameKey], n.id).toBeTruthy();
    }
    expect(ids).toEqual(expect.arrayContaining(['thorgar', 'eadgyth', 'ansgar', 'sled-hand-1', 'sled-hand-2', 'lodge-hunter-cave', 'egg-thief', 'pilgrim-1', 'pilgrim-2', 'pilgrim-3']));
  });
});
