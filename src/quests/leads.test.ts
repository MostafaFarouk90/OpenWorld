import { describe, expect, it } from 'vitest';
import { dialogueDefs } from '../dialogue/content';
import { QUEST_LEADS, createLeadSource, m05ObjectiveLead } from './leads';
import { makeWorld } from './testKit';
import type { QuestDef } from './types';

const def = (id: string): QuestDef => ({ id, titleKey: 't', summaryKey: 's', objectives: [{ id: 'o1', textKey: 'x', kind: 'flag', flag: `f.${id}` } as never] });

function setup(npcs: Record<string, { x: number; z: number }> = { aelfreda: { x: 1, z: 2 }, gaut: { x: 3, z: 4 } }) {
  const w = makeWorld(['m02', 'm03', 'm04'].map(def));
  const warn: string[] = [];
  const src = createLeadSource({
    env: () => ({ state: w.state, quests: w.manager }),
    npcPosition: (id) => npcs[id],
    anchor: () => undefined,
    warn: (m) => warn.push(m),
  });
  const ids = () => src.markers().map((m) => m.id);
  return { w, src, warn, ids, npcs };
}

describe('quest leads', () => {
  it('every lead offerNode is a start entry of its dialogue', () => {
    for (const l of QUEST_LEADS) {
      const d = dialogueDefs.find((x) => x.id === l.dialogueId);
      expect(d, l.dialogueId).toBeDefined();
      expect(Array.isArray(d!.start) && d!.start.some((s) => s.node === l.offerNode), `${l.questId}`).toBe(true);
    }
  });

  it('M03 lead appears after M02 completes and clears when M03 starts', () => {
    const { w, ids } = setup();
    expect(ids()).toEqual([]);
    w.manager.start('m02'); w.manager.complete('m02');
    expect(ids()).toContain('lead.m03');
    w.manager.start('m03');
    expect(ids()).not.toContain('lead.m03');
  });

  it('M04 lead needs M03 completed and clears on start', () => {
    const { w, ids } = setup();
    w.manager.start('m02'); w.manager.complete('m02');
    w.manager.start('m03');
    expect(ids()).not.toContain('lead.m04');
    w.manager.complete('m03');
    expect(ids()).toContain('lead.m04');
    w.manager.start('m04');
    expect(ids()).not.toContain('lead.m04');
  });

  it('is re-derived from loaded quest state', () => {
    const a = setup();
    a.w.manager.start('m02'); a.w.manager.complete('m02');
    const saved = a.w.manager.serialize();
    const b = setup();
    expect(b.ids()).toEqual([]);
    b.w.manager.load(saved);
    expect(b.ids()).toContain('lead.m03');
  });

  it('skips a lead whose giver is missing, warning once, without throwing', () => {
    const { w, src, warn, ids } = setup({});
    w.manager.start('m02'); w.manager.complete('m02');
    expect(ids()).toEqual([]);
    expect(src.skipped).toBe(true);
    ids();
    expect(warn.filter((m) => m.includes('lead m03'))).toHaveLength(1);
  });
});

describe('M05 objective lead (Tobb)', () => {
  const anchors: Record<string, { x: number; z: number }> = {
    'wardstone.1': { x: 300, z: 10 }, 'wardstone.3': { x: 500, z: 20 }, 'shrine.quenchstone.basin': { x: 965, z: 0 },
  };
  const mk = (state: string, done: string[], next: number | null, npc: { x: number; z: number } | null = { x: 7, z: 8 }) =>
    m05ObjectiveLead({
      questState: () => state,
      objectiveDone: (_q, o) => done.includes(o),
      nextWardstone: () => next,
      anchor: (id) => anchors[id],
      npcPosition: () => npc ?? undefined,
    });

  it('points at the next wardstone, then the basin, then Tobb', () => {
    expect(mk('active', [], 3)).toEqual([{ id: 'lead.m05.objective', x: 500, z: 20, label: 'tobb' }]);
    expect(mk('active', [], null)[0]).toMatchObject({ x: 300, z: 10 });
    expect(mk('active', ['o1'], null)[0]).toMatchObject({ x: 965, z: 0 });
    expect(mk('active', ['o1', 'o2'], null)[0]).toMatchObject({ x: 7, z: 8 });
  });
  it('is empty when M05 is not active, finished, or the target is missing', () => {
    expect(mk('inactive', [], 1)).toEqual([]);
    expect(mk('completed', ['o1', 'o2', 'o3'], null)).toEqual([]);
    expect(mk('active', ['o1', 'o2'], null, null)).toEqual([]);
    expect(mk('active', [], 4)).toEqual([]); // wardstone.4 has no anchor here
    expect(mk('active', ['o1', 'o2'], null, { x: NaN, z: 0 })).toEqual([]);
  });
});
