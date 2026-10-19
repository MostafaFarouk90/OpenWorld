import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { buildProps } from './props';
import { coreFactories } from './StructureBuilder';
import { createFakeCore } from './testing/fakeCore';
import { REGION_STRINGS_EN } from './strings.en';

function setup(fc = createFakeCore()) {
  fc.ctx.strings.register('en', REGION_STRINGS_EN);
  fc.ctx.anchors.define({ id: 'kettlewick.barrel', position: { x: 27, y: 4, z: 135 }, yaw: 0 });
  fc.ctx.anchors.define({ id: 'kettlewick.bakery-hearth', position: { x: 21.5, y: 4, z: 129 }, yaw: 0 });
  fc.ctx.anchors.define({ id: 'kettlewick.notice-board', position: { x: -9, y: 3, z: 124 }, yaw: 0 });
  fc.ctx.anchors.define({ id: 'chapel.banner-1', position: { x: 40, y: 5, z: 60 }, yaw: 1.5, tags: ['banner'] });
  fc.ctx.anchors.define({ id: 'chapel.banner-2', position: { x: 40, y: 5, z: 64 }, yaw: 1.5, tags: ['banner'] });
  const handle = buildProps({ ...fc.ctx, ...coreFactories(fc.ctx) }, fc.ctx.anchors);
  return { fc, handle };
}
/** Provides a quests service whose m02/o2 objective is current while `state.current` is true. */
function withQuests(fc: ReturnType<typeof createFakeCore>, current = true) {
  const state = { current };
  fc.services.set('quests', { isObjectiveCurrent: (q: string, o: string) => state.current && q === 'm02' && o === 'o2' });
  return state;
}
const loots = (fc: ReturnType<typeof createFakeCore>) => fc.emitted.filter((e) => e.type === 'loot.granted');

describe('buildProps', () => {
  it('registers the three interactables with the right kinds', () => {
    const { fc } = setup();
    expect(fc.interactables.get('chest:bakery-barrel')!.kind).toBe('chest');
    expect(fc.interactables.get('pickup:hearth-stone')!.kind).toBe('pickup');
    expect(fc.interactables.get('use:notice-board')!.kind).toBe('use');
  });

  it('the notice board has a display name and shows the pre-crack notices when read', () => {
    const { fc } = setup();
    const board = fc.interactables.get('use:notice-board')!;
    expect(board.name).toBe('Notice board');
    board.onInteract({} as never);
    const toasts = fc.emitted.filter((e) => e.type === 'hud.toast').map((e) => (e.payload as { textKey: string }).textKey);
    expect(toasts).toEqual(['notice.board.knighting', 'notice.board.yard', 'notice.board.road']);
    const text = toasts.map((k) => REGION_STRINGS_EN[k]).join(' ');
    expect(text).toMatch(/knights/);
    expect(text).toMatch(/Practice Yard is open/);
    expect(text).toMatch(/Dead Road runs east to Harrowmark/);
    expect(text).not.toMatch(/north|M01|wraith|ash/i);
  });

  it('the notice board does not stack toasts on repeat presses, and swaps the knighting notice after the crack', () => {
    const { fc } = setup();
    const board = fc.interactables.get('use:notice-board')!;
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const toasts = () => fc.emitted.filter((e) => e.type === 'hud.toast').map((e) => (e.payload as { textKey: string }).textKey);
    board.onInteract({} as never);
    board.onInteract({} as never);
    expect(toasts()).toHaveLength(3);
    fc.ctx.state.setFlag('tutorial.heartshard-awakened', true);
    now.mockReturnValue(1_010_000);
    board.onInteract({} as never);
    expect(toasts().slice(3)).toEqual(['notice.board.after', 'notice.board.yard', 'notice.board.road']);
    now.mockRestore();
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

  it('hearth stone is gated: off without a quests service, off when o2 is not current, on when it is', () => {
    const { fc } = setup();
    const i = fc.interactables.get('pickup:hearth-stone')!;
    expect(i.enabled!()).toBe(false);
    const q = withQuests(fc, false);
    expect(i.enabled!()).toBe(false);
    q.current = true;
    expect(i.enabled!()).toBe(true);
    fc.services.set('quests', { isObjectiveCurrent: () => { throw new Error('x'); } });
    expect(i.enabled!()).toBe(false);
  });

  it('hearth stone is taken once, persisted, disabled and hidden', () => {
    const { fc } = setup();
    withQuests(fc);
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
    withQuests(fc);
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

  it('builds the brazier only when its anchor exists', () => {
    expect(setup().fc.scene.getObjectByName('brazier')).toBeUndefined();
    const fc = createFakeCore();
    fc.ctx.anchors.define({ id: 'chapel.brazier', position: { x: 57, y: 1.1, z: 61 }, yaw: 0 });
    const { handle } = setup(fc);
    const b = fc.scene.getObjectByName('brazier')!;
    expect(b.position.toArray()).toEqual([57, 1.1, 61]);
    handle.dispose();
    expect(fc.scene.getObjectByName('brazier')).toBeUndefined();
  });

  it('puts a banner mesh at each banner anchor and disposes them', () => {
    const { fc, handle } = setup();
    const b1 = fc.scene.getObjectByName('banner:chapel.banner-1') as THREE.Mesh;
    const b2 = fc.scene.getObjectByName('banner:chapel.banner-2') as THREE.Mesh;
    expect(b1.position.toArray()).toEqual([40, 5, 60]);
    expect(b2.position.toArray()).toEqual([40, 5, 64]);
    expect(b1.rotation.y).toBeCloseTo(1.5);
    const p = (b1.geometry as THREE.PlaneGeometry).parameters;
    expect([p.width, p.height]).toEqual([2, 4.8]);
    const geoDispose = vi.spyOn(b1.geometry, 'dispose');
    handle.dispose();
    expect(geoDispose).toHaveBeenCalled();
    expect(fc.scene.getObjectByName('banner:chapel.banner-1')).toBeUndefined();
  });

  it('the notice board only posts toasts on interact (no loot, no flags)', () => {
    const { fc } = setup();
    fc.interactables.get('use:notice-board')!.onInteract({} as never);
    expect(fc.emitted.every((e) => e.type === 'hud.toast')).toBe(true);
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
    expect(() => buildProps({ ...fc.ctx, ...coreFactories(fc.ctx) }, fc.ctx.anchors)).toThrow(/unknown anchor/);
    expect(fc.interactables.size).toBe(0);
    expect(fc.scene.children).toHaveLength(0);
  });

  it('a duplicate registration throws and cleans up what was registered', () => {
    const fc = createFakeCore();
    const { handle } = setup(fc);
    expect(() => buildProps({ ...fc.ctx, ...coreFactories(fc.ctx) }, fc.ctx.anchors)).toThrow(/duplicate/);
    expect(fc.interactables.size).toBe(3);
    handle.dispose();
  });
});
