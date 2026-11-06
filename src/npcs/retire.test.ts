// v0.8 item 8: absentWhen any-of and retirement, on the real NpcManager over the Brightwater layout.
import { describe, expect, it, vi } from 'vitest';
import { BRIGHTWATER_LAYOUT } from '../region/brightwater.layout';
import { createFakeCore } from '../region/testing/fakeCore';
import type { NpcSpec } from '../region/layoutTypes';
import { NPC_DEFS } from './npcDefs';
import { NpcManager } from './NpcManager';
import { NPC_STRINGS_EN } from './strings.en';
import { RETIRED_NPCS, absentFlags, absentFlagsFor, type RetiredNpc } from './retire';

function setup(npcs: NpcSpec[], retired: RetiredNpc[], flags: Record<string, boolean> = {}) {
  const fc = createFakeCore();
  for (const [k, v] of Object.entries({ 'story.m01.tavernDoused': true, ...flags })) fc.flags.set(k, v);
  fc.ctx.strings.register('en', NPC_STRINGS_EN);
  for (const a of BRIGHTWATER_LAYOUT.anchors) {
    if (a.tags?.includes('npc-post')) fc.ctx.anchors.define({ id: a.id, position: { x: a.x, y: 2, z: a.z }, yaw: 0 });
  }
  const m = new NpcManager(fc.ctx, { layoutNpcs: npcs, defs: NPC_DEFS, playerPosition: () => ({ x: 0, z: 0 }), warn: vi.fn(), retired });
  m.spawnAll();
  return { fc, m };
}

describe('absentFlags and absentFlagsFor', () => {
  it('reads one flag, a list, or nothing; adds a retirement once', () => {
    expect(absentFlags(undefined)).toEqual([]);
    expect(absentFlags('a')).toEqual(['a']);
    expect(absentFlags(['a', 'b'])).toEqual(['a', 'b']);
    expect(absentFlagsFor('x', 'a', [{ id: 'x', whenFlag: 'r' }])).toEqual(['a', 'r']);
    expect(absentFlagsFor('x', 'r', [{ id: 'x', whenFlag: 'r' }])).toEqual(['r']);
    expect(absentFlagsFor('y', undefined, [{ id: 'x', whenFlag: 'r' }])).toEqual([]);
  });
  it('retires Aldous when the Council falls and Gaut when he falls (L10)', () => {
    expect(RETIRED_NPCS).toEqual([{ id: 'aldous', whenFlag: 'story.m38.complete' }, { id: 'gaut', whenFlag: 'story.m39.fallen' }]);
  });
});

describe('NpcManager with absentWhen lists and retirement', () => {
  const wynn = BRIGHTWATER_LAYOUT.npcs.find((n) => n.id === 'wynn')!;
  const others = BRIGHTWATER_LAYOUT.npcs.filter((n) => n.id !== 'wynn');

  it('a single-string absentWhen reads as before', () => {
    const { fc, m } = setup([...others, { ...wynn, absentWhen: 'k.a' }], []);
    expect(m.get('wynn')).toBeDefined();
    fc.ctx.state.setFlag('k.a', true);
    expect(m.get('wynn')).toBeUndefined();
    fc.ctx.state.setFlag('k.a', false);
    expect(m.get('wynn')).toBeDefined();
  });

  it('a list is absent while any flag holds', () => {
    const { fc, m } = setup([...others, { ...wynn, absentWhen: ['k.a', 'k.b'] }], []);
    fc.ctx.state.setFlag('k.b', true);
    expect(m.get('wynn')).toBeUndefined();
    fc.ctx.state.setFlag('k.a', true);
    fc.ctx.state.setFlag('k.b', false);
    expect(m.get('wynn')).toBeUndefined();
    fc.ctx.state.setFlag('k.a', false);
    expect(m.get('wynn')).toBeDefined();
  });

  it('a retired NPC goes at its flag, stays gone, cannot be placed back, and still answers position', () => {
    const { fc, m } = setup(BRIGHTWATER_LAYOUT.npcs, [{ id: 'wynn', whenFlag: 'story.test.retired' }]);
    expect(m.get('wynn')).toBeDefined();
    fc.ctx.state.setFlag('story.test.retired', true);
    expect(m.get('wynn')).toBeUndefined();
    expect(fc.interactables.has('npc:wynn')).toBe(false);
    expect(m.place('wynn', wynn.post)).toBe(false);
    expect(m.position('wynn')).toBeDefined();
  });

  it('a save loaded after the flag never spawns the retired NPC', () => {
    const { m } = setup(BRIGHTWATER_LAYOUT.npcs, [{ id: 'wynn', whenFlag: 'story.test.retired' }], { 'story.test.retired': true });
    expect(m.get('wynn')).toBeUndefined();
    expect(m.get('tobb')).toBeDefined();
  });
});
