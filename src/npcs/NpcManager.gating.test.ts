// The two kinds of gated NPC: Tobb (absent once he joins, handed over to the companion) and the carters (walk away once freed).
import { describe, expect, it, vi } from 'vitest';
import { BRIGHTWATER_LAYOUT } from '../region/brightwater.layout';
import { createFakeCore } from '../region/testing/fakeCore';
import { NPC_DEFS } from './npcDefs';
import { NpcManager } from './NpcManager';
import { NPC_STRINGS_EN } from './strings.en';
import { NPC_TUNING } from './tuning';

const JOINED = 'story.m05.tobbJoined';
const FREED = 'story.m04.cartersFreed';
const DOUSED = 'story.m01.tavernDoused';

/** The Grey Goose door is out unless a test says otherwise (Tobb is inside until it is doused: the density pass). */
function setup(flags: Record<string, boolean> = {}) {
  const fc = createFakeCore();
  for (const [k, v] of Object.entries({ [DOUSED]: true, ...flags })) fc.flags.set(k, v);
  fc.ctx.strings.register('en', NPC_STRINGS_EN);
  for (const a of BRIGHTWATER_LAYOUT.anchors) {
    if (a.tags?.includes('npc-post') || a.id === 'ford.carters.walk-off') {
      fc.ctx.anchors.define({ id: a.id, position: { x: a.x, y: 2, z: a.z }, yaw: (a.yawDeg * Math.PI) / 180 });
    }
  }
  const warn = vi.fn();
  const pl = { player: { x: 0, z: 0 } as { x: number; z: number } | null };
  const m = new NpcManager(fc.ctx, { layoutNpcs: BRIGHTWATER_LAYOUT.npcs, defs: NPC_DEFS, playerPosition: () => pl.player, warn });
  m.spawnAll();
  return { fc, m, warn, pl };
}
const steps = (m: NpcManager, seconds: number) => {
  for (let t = 0; t < seconds; t += 1 / 60) m.fixedUpdateBehaviour(1 / 60);
};
const post = (id: string) => BRIGHTWATER_LAYOUT.anchors.find((a) => a.id === id)!;

describe('Tobb at the Grey Goose', () => {
  it('stands at his post with his cloak and lute until he joins', () => {
    const { fc, m } = setup();
    expect(m.get('tobb')).toBeDefined();
    const tobb = [...fc.actors.values()].find((a) => a.kind === 'npc:tobb')!;
    expect(tobb.root!.children.map((c) => c.name)).toContain('tobb-lute');
    expect(m.position('tobb')).toEqual({ x: post('npc-post.tobb').x, y: 2, z: post('npc-post.tobb').z });
    expect(fc.interactables.has('npc:tobb')).toBe(true);
  });

  it('is not there while the Grey Goose door burns, and steps out when it is doused (density pass)', () => {
    const { fc, m } = setup({ [DOUSED]: false });
    expect(m.get('tobb')).toBeUndefined();
    expect(fc.interactables.has('npc:tobb')).toBe(false);
    fc.ctx.state.setFlag(DOUSED, true);
    expect(m.get('tobb')).toBeDefined();
    expect(fc.interactables.has('npc:tobb')).toBe(true);
  });

  it('despawns the NPC, its actor and its talk interactable when story.m05.tobbJoined turns true', () => {
    const { fc, m } = setup();
    const before = fc.scene.children.length;
    fc.ctx.state.setFlag(JOINED, true);
    expect(m.get('tobb')).toBeUndefined();
    expect([...fc.actors.values()].some((a) => a.kind === 'npc:tobb')).toBe(false);
    expect(fc.interactables.has('npc:tobb')).toBe(false);
    expect(fc.scene.children.length).toBe(before - 1);
    expect(m.get('wynn')).toBeDefined();
  });

  it('keeps answering npcs.position for him after the handover, and refuses to place him', () => {
    const { fc, m } = setup();
    fc.ctx.state.setFlag(JOINED, true);
    expect(m.position('tobb')).toEqual({ x: post('npc-post.tobb').x, y: 2, z: post('npc-post.tobb').z });
    expect(m.place('tobb', 'npc-post.wynn')).toBe(false);
  });

  it('never spawns him on a load with the flag already set', () => {
    const { fc, m } = setup({ [JOINED]: true });
    expect(m.get('tobb')).toBeUndefined();
    expect([...fc.actors.values()].some((a) => a.kind === 'npc:tobb')).toBe(false);
    // npcs.position keeps answering with his post, which thread 4b's companion starts from.
    expect(m.position('tobb')).toEqual({ x: post('npc-post.tobb').x, y: 2, z: post('npc-post.tobb').z });
  });

  it('comes back when a save without the flag loads over a session that had it, and goes again for one with it', () => {
    const { fc, m } = setup({ [JOINED]: true });
    fc.flags.delete(JOINED);
    fc.fire('save.loaded');
    expect(m.get('tobb')).toBeDefined();
    fc.flags.set(JOINED, true);
    fc.fire('save.loaded');
    expect(m.get('tobb')).toBeUndefined();
  });

  it('survives a flag turning true twice, and dispose after a handover leaks nothing', () => {
    const { fc, m } = setup();
    fc.ctx.state.setFlag(JOINED, true);
    fc.ctx.state.setFlag(JOINED, true);
    m.dispose();
    expect(fc.scene.children.length).toBe(0);
    expect(fc.actors.size).toBe(0);
    expect(fc.interactables.size).toBe(0);
  });
});

describe('the carters at Hollin Ford', () => {
  const walkOff = post('ford.carters.walk-off');

  it('stand at the cart until M04 frees them', () => {
    const { m } = setup();
    steps(m, 5);
    const p = post('npc-post.carter-1');
    expect(m.position('carter-1')).toEqual({ x: p.x, y: 2, z: p.z });
  });

  it('walk in a straight line at the walking speed once the flag turns true, and stop at the walk-off', () => {
    const { fc, m } = setup();
    const start = m.position('carter-1')!;
    const length = Math.hypot(walkOff.x - start.x, walkOff.z - start.z);
    fc.ctx.state.setFlag(FREED, true);
    steps(m, 1);
    const mid = m.position('carter-1')!;
    expect(Math.hypot(mid.x - start.x, mid.z - start.z)).toBeCloseTo(NPC_TUNING.walkSpeed, 1);
    // On the line from the post to the walk-off.
    const cross = (walkOff.x - start.x) * (mid.z - start.z) - (walkOff.z - start.z) * (mid.x - start.x);
    expect(Math.abs(cross) / length).toBeLessThan(0.01);
    steps(m, length / NPC_TUNING.walkSpeed + 2);
    expect(m.position('carter-1')).toEqual({ x: walkOff.x, y: 2, z: walkOff.z });
    steps(m, 2);
    expect(m.position('carter-1')).toEqual({ x: walkOff.x, y: 2, z: walkOff.z });
  });

  it('turns to face the way they walk', () => {
    const { fc, m } = setup();
    const start = m.position('carter-1')!;
    fc.ctx.state.setFlag(FREED, true);
    steps(m, 0.5);
    const yaw = m.get('carter-1')!.yaw;
    const dx = walkOff.x - start.x;
    const dz = walkOff.z - start.z;
    expect(yaw).toBeCloseTo(Math.atan2(-dx, -dz), 2);
  });

  it('stand at the walk-off on a load past M04 (no walking), and come back to the cart if a load clears the flag', () => {
    const { fc, m } = setup({ [FREED]: true });
    expect(m.position('carter-2')).toEqual({ x: walkOff.x, y: 2, z: walkOff.z });
    fc.flags.delete(FREED);
    fc.fire('save.loaded');
    const p = post('npc-post.carter-2');
    expect(m.position('carter-2')).toEqual({ x: p.x, y: 2, z: p.z });
  });

  it('wait for the end of a conversation before walking', () => {
    const { fc, m } = setup();
    fc.fire('dialogue.started', { npcId: 'carter-1' });
    fc.ctx.state.setFlag(FREED, true);
    const start = m.position('carter-1')!;
    steps(m, 2);
    expect(m.position('carter-1')).toEqual(start);
    fc.fire('dialogue.ended', { npcId: 'carter-1' });
    steps(m, 1);
    expect(m.position('carter-1')).not.toEqual(start);
  });

  it('warns once and stays put when the walk-off anchor is missing', () => {
    const fc = createFakeCore();
    fc.ctx.strings.register('en', NPC_STRINGS_EN);
    for (const a of BRIGHTWATER_LAYOUT.anchors) {
      if (a.tags?.includes('npc-post')) fc.ctx.anchors.define({ id: a.id, position: { x: a.x, y: 2, z: a.z }, yaw: 0 });
    }
    const warn = vi.fn();
    const m = new NpcManager(fc.ctx, { layoutNpcs: BRIGHTWATER_LAYOUT.npcs, defs: NPC_DEFS, playerPosition: () => null, warn });
    m.spawnAll();
    fc.ctx.state.setFlag(FREED, true);
    expect(warn).toHaveBeenCalled();
    steps(m, 1);
    const p = post('npc-post.carter-1');
    expect(m.position('carter-1')).toEqual({ x: p.x, y: 2, z: p.z });
  });

  it('place() cancels a walk in progress', () => {
    const { fc, m } = setup();
    fc.ctx.state.setFlag(FREED, true);
    steps(m, 1);
    expect(m.place('carter-1', 'npc-post.carter-1')).toBe(true);
    const at = m.position('carter-1');
    steps(m, 2);
    expect(m.position('carter-1')).toEqual(at);
  });
});

describe('review fixes', () => {
  it('walking carters follow the ground, not a line between the two anchor heights', () => {
    const fc = createFakeCore();
    fc.ctx.strings.register('en', NPC_STRINGS_EN);
    for (const a of BRIGHTWATER_LAYOUT.anchors) {
      if (a.tags?.includes('npc-post') || a.id === 'ford.carters.walk-off') fc.ctx.anchors.define({ id: a.id, position: { x: a.x, y: 0, z: a.z }, yaw: 0 });
    }
    const bump = (x: number) => 3 - Math.abs(x + 460) * 0.2;
    const m = new NpcManager(fc.ctx, { layoutNpcs: BRIGHTWATER_LAYOUT.npcs, defs: NPC_DEFS, playerPosition: () => null, heightAt: (x) => bump(x) });
    m.spawnAll();
    fc.ctx.state.setFlag(FREED, true);
    steps(m, 2);
    const p = m.position('carter-1')!;
    expect(p.y).toBeCloseTo(bump(p.x), 5);
  });

  it('a Tobb respawned after the model loaded gets the model at once', async () => {
    const { fakeLoader } = await import('./npcTestKit');
    const fc = createFakeCore();
    fc.ctx.strings.register('en', NPC_STRINGS_EN);
    for (const a of BRIGHTWATER_LAYOUT.anchors) if (a.tags?.includes('npc-post')) fc.ctx.anchors.define({ id: a.id, position: { x: a.x, y: 2, z: a.z }, yaw: 0 });
    fc.flags.set(JOINED, true);
    fc.flags.set(DOUSED, true);
    const m = new NpcManager(fc.ctx, { layoutNpcs: BRIGHTWATER_LAYOUT.npcs, defs: NPC_DEFS, playerPosition: () => ({ x: -13, z: 134 }), loader: fakeLoader() });
    m.spawnAll();
    await m.loadModels();
    expect(m.get('edda')!.hasModel).toBe(true); // rogueHooded is loaded (Edda shares Tobb's model)
    fc.flags.delete(JOINED);
    fc.fire('save.loaded');
    expect(m.get('tobb')!.hasModel).toBe(true);
  });
});
