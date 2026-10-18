import { beforeAll, describe, expect, it } from 'vitest';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { heightAt } from '../terrain/heightfield';
import { FOG_OPEN_FLAGS, fogOpen, fogColliderExtent, FOG_TRIGGER_ID, FOG_WALL_HALF_LENGTH, PUSH_BACK_PAST, PUSH_BACK_TO, buildFogWall, needsPushBack } from './fogWall';
import { createFakeCore } from './testing/fakeCore';

let physics: PhysicsWorld;
beforeAll(async () => {
  physics = new PhysicsWorld();
  await physics.init();
});

const WALL = { x: 1100, y: 46, z: -150 };
function setup(flags: Record<string, boolean> = {}, openFlags?: readonly string[]) {
  const fc = createFakeCore();
  fc.useRapier(physics.rapier);
  for (const [k, v] of Object.entries(flags)) fc.flags.set(k, v);
  const fog = buildFogWall({ ...fc.ctx, rapier: physics.rapier }, WALL, openFlags);
  return { fc, fog };
}
const wallObjects = (fc: ReturnType<typeof createFakeCore>) => fc.scene.children.filter((c) => c.name === 'fog-wall');

describe('the slice fog wall', () => {
  it('stands while story.m05.complete is unset: mesh, ash, collider, trigger and push-back system', () => {
    const { fc, fog } = setup();
    expect(fog.standing).toBe(true);
    expect(wallObjects(fc)).toHaveLength(1);
    expect(wallObjects(fc)[0].getObjectByName('ash')).toBeDefined();
    expect(fc.colliders.size).toBe(1);
    expect(fc.triggers.has(FOG_TRIGGER_ID)).toBe(true);
    expect(fc.systems.has('fog-wall')).toBe(true);
  });

  it('puts the trigger just in front of the wall on the road side, and the collider across the valley', () => {
    const { fc } = setup();
    const t = fc.triggers.get(FOG_TRIGGER_ID)!.shape as { type: 'sphere'; center: { x: number; z: number } };
    expect(t.center.x).toBeLessThan(WALL.x);
    expect(t.center.z).toBe(WALL.z);
    const desc = [...fc.colliders][0] as { desc: { halfExtents?: unknown } };
    expect(desc).toBeDefined();
    expect(FOG_WALL_HALF_LENGTH).toBeGreaterThanOrEqual(500);
  });

  it('opens when the flag turns true, removing every part, and the trigger with it', () => {
    const { fc, fog } = setup();
    fc.ctx.state.setFlag('story.m05.complete', true);
    expect(fog.standing).toBe(false);
    expect(wallObjects(fc)).toHaveLength(0);
    expect(fc.colliders.size).toBe(0);
    expect(fc.triggers.has(FOG_TRIGGER_ID)).toBe(false);
    expect(fc.systems.has('fog-wall')).toBe(false);
  });

  it('is never built on a load with the flag already true, and stands again when a later load clears it', () => {
    const { fc, fog } = setup({ 'story.m05.complete': true });
    expect(fog.standing).toBe(false);
    expect(fc.colliders.size).toBe(0);
    fc.flags.delete('story.m05.complete');
    fc.fire('save.loaded');
    expect(fog.standing).toBe(true);
    expect(fc.colliders.size).toBe(1);
  });

  it('is down for a save that finished M05, and the retired Phase A flag no longer opens it', () => {
    expect(setup({ 'story.m05.complete': true }).fog.standing).toBe(false);
    expect(setup({ 'story.slice.harrowmarkOpen': true }).fog.standing).toBe(true);
  });

  it('opens when story.m05.complete is set during play', () => {
    const { fc, fog } = setup();
    expect(fog.standing).toBe(true);
    fc.ctx.state.setFlag('story.m05.complete', true);
    expect(fog.standing).toBe(false);
  });

  it('rises again when an earlier save is loaded, and the push-back is idle while the wall is down', () => {
    const { fc, fog } = setup({ 'story.m05.complete': true });
    expect(fog.standing).toBe(false);
    expect(fc.systems.has('fog-wall')).toBe(false);
    fc.flags.delete('story.m05.complete');
    fc.fire('save.loaded');
    expect(fog.standing).toBe(true);
    expect(fc.systems.has('fog-wall')).toBe(true);
    fc.flags.set('story.m05.complete', true);
    fc.fire('save.loaded');
    expect(fog.standing).toBe(false);
  });

  it('fogOpen reads the same flags as the wall', () => {
    const flags = new Map<string, unknown>();
    const state = { getFlag: (k: string) => flags.get(k) };
    expect(fogOpen(state)).toBe(false);
    flags.set('story.slice.harrowmarkOpen', true);
    expect(fogOpen(state)).toBe(false);
    flags.set('story.m05.complete', true);
    expect(fogOpen(state)).toBe(true);
    for (const k of FOG_OPEN_FLAGS) expect(FOG_OPEN_FLAGS).toContain(k);
  });

  it('does not rebuild when an unrelated flag changes or the same flag is set twice', () => {
    const { fc, fog } = setup();
    fc.ctx.state.setFlag('story.m04.complete', true);
    expect(fc.colliders.size).toBe(1);
    fc.ctx.state.setFlag('story.m05.complete', true);
    fc.ctx.state.setFlag('story.m05.complete', true);
    expect(fog.standing).toBe(false);
    expect(fc.colliders.size).toBe(0);
  });

  it('pushes back a player found past the wall, and leaves one in front alone', () => {
    const { fc } = setup();
    fc.playerFeet.x = 1090;
    fc.tick('intent');
    expect(fc.teleports).toHaveLength(0);
    fc.playerFeet.x = 1100 + PUSH_BACK_PAST + 5;
    fc.playerFeet.z = -120;
    fc.tick('intent');
    expect(fc.teleports).toHaveLength(1);
    expect(fc.teleports[0].feet.x).toBe(1100 - PUSH_BACK_TO);
    expect(fc.teleports[0].feet.z).toBe(-120);
  });

  it('does not push back once it is open', () => {
    const { fc } = setup({ 'story.m05.complete': true });
    fc.playerFeet.x = 1300;
    fc.tick('intent');
    expect(fc.teleports).toHaveLength(0);
  });

  it('animates the ash without leaving the wall column', () => {
    const { fc } = setup();
    for (let i = 0; i < 600; i++) fc.tick('intent', 1 / 60);
    const ash = wallObjects(fc)[0].getObjectByName('ash') as import('three').Points;
    const p = ash.geometry.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      expect(p.getY(i)).toBeGreaterThanOrEqual(0);
      expect(p.getY(i)).toBeLessThanOrEqual(30.01);
    }
  });

  it('dispose removes everything, and a flag change afterwards builds nothing', () => {
    const { fc, fog } = setup();
    fog.dispose();
    fog.dispose();
    expect(fc.scene.children).toHaveLength(0);
    expect(fc.colliders.size).toBe(0);
    expect(fc.triggers.size).toBe(0);
    fc.flags.delete('story.m05.complete');
    fc.fire('save.loaded');
    expect(fc.colliders.size).toBe(0);
  });
});

describe('fogColliderExtent and the push-back on real terrain', () => {
  it('sinks the collider below the lowest ground along its whole length, so no dip lets anyone walk under it', () => {
    const e = fogColliderExtent(heightAt, { x: 1100, z: -150 });
    for (let dz = -500; dz <= 500; dz += 5) {
      expect(heightAt(1100, -150 + dz), `z ${-150 + dz}`).toBeGreaterThan(e.bottom);
      expect(heightAt(1100, -150 + dz)).toBeLessThan(e.top);
    }
  });

  it('puts a pushed-back player above the ground at the destination, even where it rises', () => {
    const { fc } = setup();
    for (const z of [-95, 70, -150]) {
      fc.teleports.length = 0;
      fc.playerFeet.x = 1200;
      fc.playerFeet.z = z;
      fc.playerFeet.y = heightAt(1200, z);
      fc.tick('intent');
      expect(fc.teleports[0].feet.y, `z ${z}`).toBeGreaterThan(heightAt(1096, z));
    }
  });

  it('leaves a player alone who is past the wall but beyond its length', () => {
    const { fc } = setup();
    fc.playerFeet.x = 1200;
    fc.playerFeet.z = 2000;
    fc.tick('intent');
    expect(fc.teleports).toHaveLength(0);
  });
});

describe('needsPushBack', () => {
  it.each([
    [1090, false],
    [1100, false],
    [1101.9, false],
    [1102.1, true],
    [5000, true],
    [Number.NaN, false],
    [-Infinity, false],
  ])('x %s -> %s', (x, want) => {
    expect(needsPushBack(x, 1100)).toBe(want);
  });
});
