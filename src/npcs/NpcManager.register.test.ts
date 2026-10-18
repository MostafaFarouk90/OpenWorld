// NpcManager.register: a later region's cast joins without touching the first set, and a failure leaves nothing behind.
import { describe, expect, it, vi } from 'vitest';
import { BRIGHTWATER_LAYOUT } from '../region/brightwater.layout';
import type { NpcSpec } from '../region/layoutTypes';
import { createFakeCore } from '../region/testing/fakeCore';
import { NPC_DEFS } from './npcDefs';
import { NpcManager } from './NpcManager';
import { NPC_STRINGS_EN } from './strings.en';
import type { NpcDef } from './types';

const def = (id: string): NpcDef => ({ id, nameKey: `npc.${id}.name`, model: 'knight', scale: 1, tint: null, dialogueId: `npc-${id}`, idleClip: 'Idle' });

function setup() {
  const fc = createFakeCore();
  fc.ctx.strings.register('en', { ...NPC_STRINGS_EN, 'npc.extra.name': 'Extra', 'npc.late.name': 'Late' });
  for (const a of BRIGHTWATER_LAYOUT.anchors) {
    if (a.tags?.includes('npc-post') || a.id === 'ford.carters.walk-off') fc.ctx.anchors.define({ id: a.id, position: { x: a.x, y: 2, z: a.z }, yaw: 0 });
  }
  fc.ctx.anchors.define({ id: 'npc-post.extra', position: { x: 50, y: 2, z: 50 }, yaw: 0 });
  fc.ctx.anchors.define({ id: 'npc-post.late', position: { x: 60, y: 2, z: 60 }, yaw: 0 });
  const m = new NpcManager(fc.ctx, { layoutNpcs: BRIGHTWATER_LAYOUT.npcs, defs: NPC_DEFS, playerPosition: () => null, warn: vi.fn() });
  m.spawnAll();
  return { fc, m };
}

describe('NpcManager.register', () => {
  it('spawns the new set, leaves the first set alone and removes exactly its own on dispose', () => {
    const { fc, m } = setup();
    const before = [...fc.interactables.keys()];
    const off = m.register([{ id: 'extra', post: 'npc-post.extra' }], [def('extra')]);
    expect(m.get('extra')).toBeDefined();
    expect(fc.interactables.has('npc:extra')).toBe(true);
    for (const id of before) expect(fc.interactables.has(id)).toBe(true);
    off();
    expect(m.get('extra')).toBeUndefined();
    expect(fc.interactables.has('npc:extra')).toBe(false);
    expect(m.get('gaut')).toBeDefined();
    off(); // idempotent
  });

  it('rejects a bad set without spawning anything or touching the first set', () => {
    const { fc, m } = setup();
    const n = fc.actors.size;
    expect(() => m.register([{ id: 'extra', post: 'npc-post.nowhere' }], [def('extra')])).toThrow(/does not exist/);
    expect(() => m.register([{ id: 'extra', post: 'npc-post.extra' }], [])).toThrow(/no NpcDef/);
    expect(() => m.register([], [def('extra')])).toThrow(/no entry in the layout/);
    expect(() => m.register([{ id: 'gaut', post: 'npc-post.extra' }], [def('gaut')])).toThrow(/already registered/);
    expect(fc.actors.size).toBe(n);
    expect(m.get('gaut')).toBeDefined();
  });

  it('rolls back a set that fails halfway (a duplicate interactable id)', () => {
    const { fc, m } = setup();
    fc.ctx.interaction.register({ id: 'npc:late', kind: 'talk', position: (o) => o, onInteract() {} });
    const n = fc.actors.size;
    const specs: NpcSpec[] = [{ id: 'extra', post: 'npc-post.extra' }, { id: 'late', post: 'npc-post.late' }];
    expect(() => m.register(specs, [def('extra'), def('late')])).toThrow();
    expect(m.get('extra')).toBeUndefined();
    expect(fc.actors.size).toBe(n);
  });

  it('honours presentWhen: absent until the flag is true, again after a load clears it', () => {
    const { fc, m } = setup();
    m.register([{ id: 'late', post: 'npc-post.late', presentWhen: 'story.late.started' }], [def('late')]);
    expect(m.get('late')).toBeUndefined();
    fc.ctx.state.setFlag('story.late.started', true);
    expect(m.get('late')).toBeDefined();
    fc.flags.set('story.late.started', false);
    fc.fire('save.loaded');
    expect(m.get('late')).toBeUndefined();
  });

  it('combines presentWhen and absentWhen', () => {
    const { fc, m } = setup();
    m.register([{ id: 'late', post: 'npc-post.late', presentWhen: 'a', absentWhen: 'b' }], [def('late')]);
    fc.ctx.state.setFlag('a', true);
    expect(m.get('late')).toBeDefined();
    fc.ctx.state.setFlag('b', true);
    expect(m.get('late')).toBeUndefined();
  });

  it('refuses before spawnAll and after dispose', () => {
    const fc = createFakeCore();
    const m = new NpcManager(fc.ctx, { layoutNpcs: [], defs: [], playerPosition: () => null, warn: vi.fn() });
    expect(() => m.register([], [])).toThrow(/before spawnAll/);
    m.spawnAll();
    m.dispose();
    expect(() => m.register([], [])).toThrow(/after dispose/);
  });
});
