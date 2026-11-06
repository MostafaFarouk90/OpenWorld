// Act 4 thread L1 (plans/act4-L1.md section 9, playthrough L1): the containment toast spam at the Fen Road's corner by
// the Ashen Waste. The reproduction walks the real containment with a player leaning on the corridor's edge.
import { beforeAll, describe, expect, it } from 'vitest';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { buildFogWallDef, type FogWallDef } from './fogWall';
import type { Containment } from './containment';
import { CONTAINMENT_EPISODE_QUIET_SECONDS, CONTAINMENT_TOAST_KEY, installContainment } from './containmentSystem';
import { createFakeCore } from './testing/fakeCore';

const ACT3 = { 'story.gate.a2': true, 'story.d03.complete': true, 'story.gate.a3': true };

function rig(flags: Record<string, boolean> = ACT3) {
  const fc = createFakeCore();
  for (const [k, v] of Object.entries(flags)) fc.flags.set(k, v);
  installContainment(fc.ctx, () => 0);
  const c = fc.services.get('containment') as Containment;
  const toasts = () => fc.emitted.filter((e) => e.type === 'hud.toast' && (e.payload as { textKey: string }).textKey === CONTAINMENT_TOAST_KEY).length;
  /** One tick: the player moves by (dx, dz), containment runs, a push moves the feet. */
  const step = (dx: number, dz: number) => {
    fc.playerFeet.x += dx;
    fc.playerFeet.z += dz;
    const before = fc.teleports.length;
    fc.tick('intent');
    if (fc.teleports.length > before) Object.assign(fc.playerFeet, fc.teleports[fc.teleports.length - 1].feet);
    return fc.teleports.length > before;
  };
  return { fc, c, toasts, step };
}

describe('the containment toast (playthrough L1)', () => {
  it('reproduction: 90 s leaning north-east off the Fen Road at the Waste corner pushes hundreds of times, toasts once and ends open', () => {
    const { fc, c, toasts, step } = rig();
    Object.assign(fc.playerFeet, { x: 7000, y: 0, z: 4420 });
    expect(c.isOpen(7000, 4420)).toBe(true);
    const v = 4.5 / 60;
    let pushes = 0;
    for (let t = 0; t < 60 * 90; t++) if (step(v * Math.sin(Math.PI / 9), v * Math.cos(Math.PI / 9))) pushes++;
    // The old 8 s throttle let 11 toasts through this walk.
    expect(pushes).toBeGreaterThan(300);
    expect(toasts()).toBe(1);
    expect(c.isOpen(fc.playerFeet.x, fc.playerFeet.z)).toBe(true);
  });

  it('a new episode toasts again once the player has been open and unpushed for the quiet time, not before', () => {
    // Act 1: east of Harrowmark is closed.
    const { fc, toasts, step } = rig({});
    Object.assign(fc.playerFeet, { x: 20000, y: 0, z: 3000 });
    step(0, 0);
    expect(toasts()).toBe(1);
    // Open for just under the quiet time, then out again: the same episode.
    for (let t = 0; t < 60 * CONTAINMENT_EPISODE_QUIET_SECONDS - 2; t++) step(0, 0);
    Object.assign(fc.playerFeet, { x: 20000, y: 0, z: 3000 });
    step(0, 0);
    expect(toasts()).toBe(1);
    // Open for the whole quiet time: the next push starts a new episode.
    for (let t = 0; t < 60 * CONTAINMENT_EPISODE_QUIET_SECONDS + 1; t++) step(0, 0);
    Object.assign(fc.playerFeet, { x: 20000, y: 0, z: 3000 });
    step(0, 0);
    expect(toasts()).toBe(2);
  });
});

describe('a fog face never pushes to a closed point (plan section 9, fix 1)', () => {
  let physics: PhysicsWorld;
  beforeAll(async () => {
    physics = new PhysicsWorld();
    await physics.init();
  });
  const def: FogWallDef = { id: 'fog.test-face', openWhen: { any: ['region.never'] }, toastKey: 't', anchorId: 'a', axis: 'x', halfLength: 50, blockedSide: 1, pushBackTo: 1, pushDepth: 100 };

  function rig(containment: { isOpen(x: number, z: number): boolean; nearestOpen(x: number, z: number): { x: number; z: number } }) {
    const fc = createFakeCore();
    fc.useRapier(physics.rapier);
    fc.services.set('containment', containment);
    const wall = buildFogWallDef({ ...fc.ctx, rapier: physics.rapier }, def, { x: 100, y: 0, z: 0 }, () => 0);
    return { fc, wall };
  }

  it('clamps the push target into the open area', () => {
    // Open only south of z 10: the face's own target (99, 20) is closed.
    const { fc, wall } = rig({ isOpen: (_x, z) => z < 10, nearestOpen: (x, z) => ({ x, z: Math.min(z, 9) }) });
    Object.assign(fc.playerFeet, { x: 105, y: 0, z: 20 });
    fc.tick('intent');
    expect(fc.teleports).toHaveLength(1);
    expect(fc.teleports[0].feet.x).toBe(99);
    expect(fc.teleports[0].feet.z).toBe(9);
    wall.dispose();
  });

  it('leaves the push to containment when the nearest open point is behind the face', () => {
    const { fc, wall } = rig({ isOpen: (x) => x > 103, nearestOpen: (_x, z) => ({ x: 104, z }) });
    Object.assign(fc.playerFeet, { x: 105, y: 0, z: 20 });
    fc.tick('intent');
    expect(fc.teleports).toHaveLength(0);
    wall.dispose();
  });

  it('pushes as before where its target is open', () => {
    const { fc, wall } = rig({ isOpen: () => true, nearestOpen: (x, z) => ({ x, z }) });
    Object.assign(fc.playerFeet, { x: 105, y: 0, z: 20 });
    fc.tick('intent');
    expect(fc.teleports[0].feet).toMatchObject({ x: 99, z: 20 });
    wall.dispose();
  });
});
