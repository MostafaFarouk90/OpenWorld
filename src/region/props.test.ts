import { describe, expect, it } from 'vitest';
import { buildProps } from './props';
import { createLocalChest } from './localDoor';
import { createFakeCore } from './testing/fakeCore';

function setup(fc = createFakeCore()) {
  fc.ctx.anchors.define({ id: 'kettlewick.barrel', position: { x: 27, y: 4, z: 135 }, yaw: 0 });
  fc.ctx.anchors.define({ id: 'kettlewick.bakery-hearth', position: { x: 21.5, y: 4, z: 129 }, yaw: 0 });
  fc.ctx.anchors.define({ id: 'kettlewick.notice-board', position: { x: -9, y: 3, z: 124 }, yaw: 0 });
  const handle = buildProps({ ...fc.ctx, createChest: (o) => createLocalChest(fc.ctx, o) }, fc.ctx.anchors);
  return { fc, handle };
}
const loots = (fc: ReturnType<typeof createFakeCore>) => fc.emitted.filter((e) => e.type === 'loot.granted');

describe('buildProps', () => {
  it('registers the three interactables with the right kinds', () => {
    const { fc } = setup();
    expect(fc.interactables.get('chest:bakery-barrel')!.kind).toBe('chest');
    expect(fc.interactables.get('pickup:hearth-stone')!.kind).toBe('pickup');
    expect(fc.interactables.get('use:notice-board')!.kind).toBe('use');
  });

  it('places the barrel at its anchor and grants one healing flask once', () => {
    const { fc } = setup();
    fc.interactables.get('chest:bakery-barrel')!.onInteract({} as never);
    fc.interactables.get('chest:bakery-barrel')!.onInteract({} as never);
    expect(loots(fc)).toEqual([
      { type: 'loot.granted', payload: { sourceId: 'chest:bakery-barrel', items: [{ itemId: 'healing-flask', count: 1 }] } },
    ]);
    expect(fc.scene.getObjectByName('barrel')!.position.toArray()).toEqual([27, 4, 135]);
  });

  it('hearth stone is taken once, persisted, disabled and hidden', () => {
    const { fc } = setup();
    const i = fc.interactables.get('pickup:hearth-stone')!;
    const stone = fc.scene.getObjectByName('hearth-stone')!;
    expect(stone.visible).toBe(true);
    i.onInteract({} as never);
    i.onInteract({} as never);
    expect(loots(fc)).toHaveLength(1);
    expect(loots(fc)[0].payload).toEqual({ sourceId: 'pickup:hearth-stone', items: [{ itemId: 'hearth-stone', count: 1 }] });
    expect(fc.flags.get('pickup.hearth-stone.taken')).toBe(true);
    expect(i.enabled!()).toBe(false);
    expect(stone.visible).toBe(false);
  });

  it('hearth stone resyncs from the save in both directions and starts hidden if taken', () => {
    const { fc } = setup();
    const i = fc.interactables.get('pickup:hearth-stone')!;
    const stone = fc.scene.getObjectByName('hearth-stone')!;
    fc.flags.set('pickup.hearth-stone.taken', true);
    fc.fire('save.loaded');
    expect(stone.visible).toBe(false);
    expect(i.enabled!()).toBe(false);
    fc.flags.set('pickup.hearth-stone.taken', false);
    fc.fire('save.loaded');
    expect(stone.visible).toBe(true);
    expect(i.enabled!()).toBe(true);
    const fc2 = createFakeCore();
    fc2.flags.set('pickup.hearth-stone.taken', true);
    setup(fc2);
    expect(fc2.scene.getObjectByName('hearth-stone')!.visible).toBe(false);
  });

  it('the notice board does nothing on interact', () => {
    const { fc } = setup();
    fc.interactables.get('use:notice-board')!.onInteract({} as never);
    expect(fc.emitted).toHaveLength(0);
    expect(fc.flags.size).toBe(0);
  });

  it('dispose unregisters everything and is idempotent', () => {
    const { fc, handle } = setup();
    handle.dispose();
    handle.dispose();
    expect(fc.interactables.size).toBe(0);
    expect(fc.scene.children).toHaveLength(0);
    fc.flags.set('pickup.hearth-stone.taken', true);
    fc.fire('save.loaded');
  });

  it('a missing anchor throws and leaves nothing registered', () => {
    const fc = createFakeCore();
    fc.ctx.anchors.define({ id: 'kettlewick.barrel', position: { x: 0, y: 0, z: 0 }, yaw: 0 });
    expect(() => buildProps({ ...fc.ctx, createChest: (o) => createLocalChest(fc.ctx, o) }, fc.ctx.anchors)).toThrow(/unknown anchor/);
    expect(fc.interactables.size).toBe(0);
    expect(fc.scene.children).toHaveLength(0);
  });

  it('a duplicate registration throws and cleans up what was registered', () => {
    const fc = createFakeCore();
    const { handle } = setup(fc);
    expect(() => buildProps({ ...fc.ctx, createChest: (o) => createLocalChest(fc.ctx, o) }, fc.ctx.anchors)).toThrow(/duplicate/);
    expect(fc.interactables.size).toBe(3);
    handle.dispose();
  });
});
