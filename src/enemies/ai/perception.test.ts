import { beforeEach, describe, expect, it } from 'vitest';
import { PhysicsWorld } from '../../physics/PhysicsWorld';
import { AI } from '../tuning';
import { flatGround } from '../../physics/flatGround';
import { type PerceptionInput, canSeeChest, makeLineOfSight, perceive } from './perception';

const clear = () => true;
function input(patch: Partial<PerceptionInput>): PerceptionInput {
  return {
    selfFeet: { x: 0, y: 0, z: 0 },
    selfYaw: 0, // faces -Z
    targetFeet: { x: 0, y: 0, z: -10 },
    targetAlive: true,
    targetLoud: false,
    damagedBy: false,
    lineOfSight: clear,
    ...patch,
  };
}

describe('perceive', () => {
  it('sees a target in the cone and range', () => {
    const r = perceive(input({}));
    expect(r.sees).toBe(true);
    expect(r.notices).toBe(true);
    expect(r.distance).toBeCloseTo(10);
  });

  it('respects the cone edges', () => {
    const at = (deg: number) => {
      const a = (deg * Math.PI) / 180;
      return perceive(input({ targetFeet: { x: -Math.sin(a) * 10, y: 0, z: -Math.cos(a) * 10 } })).sees;
    };
    expect(at(55)).toBe(true);
    expect(at(-55)).toBe(true);
    expect(at(65)).toBe(false);
    expect(at(-65)).toBe(false);
  });

  it('does not see behind or beyond range', () => {
    expect(perceive(input({ targetFeet: { x: 0, y: 0, z: 10 } })).sees).toBe(false);
    expect(perceive(input({ targetFeet: { x: 0, y: 0, z: -(AI.sightRange + 1) } })).sees).toBe(false);
    expect(perceive(input({ targetFeet: { x: 0, y: 0, z: -(AI.sightRange - 1) } })).sees).toBe(true);
  });

  it('uses the yaw convention (yaw PI/2 faces -X)', () => {
    const t = { x: -10, y: 0, z: 0 };
    expect(perceive(input({ selfYaw: Math.PI / 2, targetFeet: t })).sees).toBe(true);
    expect(perceive(input({ selfYaw: 0, targetFeet: t })).sees).toBe(false);
  });

  it('asks line of sight eye to chest and honours a blocked answer', () => {
    let seen: unknown = null;
    perceive(
      input({
        selfFeet: { x: 1, y: 2, z: 3 },
        targetFeet: { x: 1, y: 2.5, z: -7 },
        lineOfSight: (from, to) => {
          seen = [from, to];
          return true;
        },
      }),
    );
    expect(seen).toEqual([
      { x: 1, y: 2 + AI.eyeHeight, z: 3 },
      { x: 1, y: 2.5 + AI.chestHeight, z: -7 },
    ]);
    const r = perceive(input({ lineOfSight: () => false }));
    expect(r.sees).toBe(false);
    expect(r.notices).toBe(false);
  });

  it('hears only while loud at 20 m, and 6 m always, without line of sight', () => {
    const behind = (d: number, loud: boolean) =>
      perceive(input({ targetFeet: { x: 0, y: 0, z: d }, targetLoud: loud, lineOfSight: () => false }));
    expect(behind(15, false).hears).toBe(false);
    expect(behind(15, true).hears).toBe(true);
    expect(behind(15, true).notices).toBe(true);
    expect(behind(21, true).hears).toBe(false);
    expect(behind(5.9, false).hears).toBe(true);
    expect(behind(6.1, false).hears).toBe(false);
  });

  it('notices damage from behind at any range', () => {
    const r = perceive(input({ targetFeet: { x: 0, y: 0, z: 50 }, damagedBy: true }));
    expect(r.sees).toBe(false);
    expect(r.hears).toBe(false);
    expect(r.notices).toBe(true);
  });

  it('ignores dead or missing targets, even when damaged', () => {
    const dead = perceive(input({ targetAlive: false, damagedBy: true, targetLoud: true }));
    expect(dead).toEqual({ sees: false, hears: false, notices: false, distance: Infinity });
    expect(perceive(input({ targetFeet: null, damagedBy: true })).notices).toBe(false);
  });

  it('copes with a target on the same spot', () => {
    const r = perceive(input({ targetFeet: { x: 0, y: 0, z: 0 } }));
    expect(r.sees).toBe(true);
    expect(r.distance).toBe(0);
  });
});

describe('makeLineOfSight with real Rapier', () => {
  let physics: PhysicsWorld;
  beforeEach(async () => {
    physics = new PhysicsWorld();
    await physics.init();
  });

  const targetAt = (z: number) => {
    const body = physics.world.createRigidBody(
      physics.rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 0.9, z),
    );
    return physics.world.createCollider(physics.rapier.ColliderDesc.capsule(0.55, 0.35), body);
  };

  it('sees the target when only the target is on the ray', () => {
    const target = targetAt(-10);
    physics.step();
    const los = makeLineOfSight(physics, target);
    const r = perceive(input({ lineOfSight: los }));
    expect(r.sees).toBe(true);
  });

  it('a wall blocks it, and removing the wall clears it', () => {
    const target = targetAt(-10);
    const wall = physics.addStaticCollider(physics.rapier.ColliderDesc.cuboid(3, 3, 0.2).setTranslation(0, 1.5, -5));
    physics.step();
    const los = makeLineOfSight(physics, target);
    expect(perceive(input({ lineOfSight: los })).sees).toBe(false);
    physics.removeCollider(wall);
    physics.step();
    expect(perceive(input({ lineOfSight: los })).sees).toBe(true);
  });

  it('excludes the enemy own collider', () => {
    const target = targetAt(-10);
    const self = physics.world.createCollider(physics.rapier.ColliderDesc.capsule(0.55, 0.35).setTranslation(0, 0.9, 0));
    physics.step();
    expect(perceive(input({ lineOfSight: makeLineOfSight(physics, target) })).sees).toBe(false);
    expect(perceive(input({ lineOfSight: makeLineOfSight(physics, target, self) })).sees).toBe(true);
  });

  it('canSeeChest aims eye to chest: a wall blocks, a clear ray over open ground reads visible, the target collider counts as seen', () => {
    physics.addHeightfield(flatGround(200));
    const target = targetAt(-10);
    physics.step();
    const los = makeLineOfSight(physics, target);
    expect(canSeeChest(los, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -10 })).toBe(true);
    const wall = physics.addStaticCollider(physics.rapier.ColliderDesc.cuboid(3, 3, 0.2).setTranslation(0, 1.5, -5));
    physics.step();
    expect(canSeeChest(los, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -10 })).toBe(false);
    physics.removeCollider(wall);
    physics.step();
    expect(canSeeChest(los, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -10 })).toBe(true);
  });
});
