// v0.9 item 7b (plans/act5-N0-spike.md): turning platforms. The spike's cases as unit tests: a player idle on a platform
// turning at 10 deg/s stays on its spot at 3, 8 and 14 m from the pivot (within 1 cm over 30 s); walking and jumping on it
// for 30 s never falls off (the 1.5 s air carry); `pauseWhileStood`; the render pose; the translating platforms unchanged.
import { beforeEach, describe, expect, it } from 'vitest';
import { FIXED_TIMESTEP } from '../config/constants';
import { CharacterController, type MoveIntent } from './CharacterController';
import { PhysicsWorld, type Vec3 } from './PhysicsWorld';
import { PLATFORM_AIR_CARRY_S, Platforms, type PlatformPath } from './platforms';

const DT = FIXED_TIMESTEP;
const IDLE: MoveIntent = { moveX: 0, moveZ: 0, sprint: false, jump: false };
const Y = 100;
const DEG = 10;
const OMEGA = (DEG * Math.PI) / 180;

let physics: PhysicsWorld;
let platforms: Platforms;

beforeEach(async () => {
  physics = new PhysicsWorld();
  await physics.init();
  platforms = new Platforms();
});

/** A slab 6 m (radial) by 8 m at `radius` from a pivot at the body's origin (0, Y, 0); nothing below it (a lava gap). */
function spinner(radius: number, extra: Partial<PlatformPath['spin']> = {}) {
  const body = physics.world.createRigidBody(physics.rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(0, Y, 0));
  physics.world.createCollider(physics.rapier.ColliderDesc.cuboid(3, 0.25, 4).setTranslation(radius, 0, 0), body);
  platforms.register('anvil.ring', body, { stops: [{ x: 0, y: Y, z: 0 }], speed: 1, wait: 0, spin: { pivot: { x: 0, y: Y, z: 0 }, degPerS: DEG, ...extra } });
  const c = new CharacterController(physics, { x: radius, y: Y + 0.25, z: 0 });
  c.setPlatformSource((col, feet) => platforms.carryAt(col, feet) ?? { x: 0, y: 0, z: 0, yaw: 0 });
  return { body, c };
}

function tick(c: CharacterController, i: MoveIntent = IDLE): void {
  platforms.fixedUpdate(DT);
  c.fixedUpdate(i);
  physics.step();
}

const feet = (c: CharacterController): Vec3 => c.interpolatedFeet(1, { x: 0, y: 0, z: 0 });
/** The feet in the platform's own frame (turned back by its angle). */
function local(c: CharacterController): Vec3 {
  const a = -(platforms.angle('anvil.ring') ?? 0);
  const p = feet(c);
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return { x: p.x * cos + p.z * sin, y: p.y - Y, z: -p.x * sin + p.z * cos };
}

describe('turning platforms (item 7b)', () => {
  it.each([3, 8, 14])('an idle player %i m from the pivot stays on its spot within 1 cm over 30 s', (r) => {
    const { c } = spinner(r);
    for (let i = 0; i < 30; i++) tick(c);
    const start = local(c);
    let drift = 0;
    let yawSum = 0;
    for (let i = 0; i < 60 * 30; i++) {
      tick(c);
      yawSum += c.carryYaw;
      const l = local(c);
      drift = Math.max(drift, Math.hypot(l.x - start.x, l.z - start.z));
    }
    expect(drift).toBeLessThan(0.01);
    expect(feet(c).y).toBeGreaterThan(Y);
    expect(c.grounded).toBe(true);
    // the player (and the camera) turned with it: 30 s at 10 deg/s
    expect(yawSum).toBeCloseTo(OMEGA * 30, 2);
  });

  it.each([8, 14])('walking and jumping for 30 s at %i m never falls off (jumps keep the carry)', (r) => {
    const { c } = spinner(r);
    for (let i = 0; i < 30; i++) tick(c);
    let fell = false;
    let airborne = 0;
    for (let i = 0; i < 60 * 30; i++) {
      const t = i * DT;
      const phase = Math.floor(t) % 4;
      // A square in the platform's own frame (the camera turns with the player, so "forward" turns with the floor).
      const d = [[0, -0.3], [0.3, 0], [0, 0.3], [-0.3, 0]][phase]!;
      const a = platforms.angle('anvil.ring') ?? 0;
      const mx = d[0] * Math.cos(a) + d[1] * Math.sin(a);
      const mz = -d[0] * Math.sin(a) + d[1] * Math.cos(a);
      tick(c, { moveX: mx, moveZ: mz, sprint: false, jump: i % 180 < 2 });
      if (!c.grounded) airborne++;
      if (feet(c).y < Y - 2) fell = true;
    }
    expect(fell).toBe(false);
    expect(airborne).toBeGreaterThan(60); // it did jump
    // and it ends near where it started on the floor (the walk is a closed square in the floor's frame)
    expect(Math.hypot(local(c).x - r, local(c).z)).toBeLessThan(2.5);
  });

  it('the air carry ends after PLATFORM_AIR_CARRY_S, then the character flies free', () => {
    expect(PLATFORM_AIR_CARRY_S).toBe(1.5);
    const { c } = spinner(8);
    for (let i = 0; i < 30; i++) tick(c);
    c.teleport({ x: 8, y: Y + 40, z: 0 }); // high above: a long fall, no ground under the start
    let yawAfter = 0;
    for (let i = 0; i < 60 * 2; i++) {
      tick(c);
      if (i > 60 * PLATFORM_AIR_CARRY_S) yawAfter += Math.abs(c.carryYaw);
    }
    // a teleport clears the air carry: no carry at all after it
    expect(yawAfter).toBe(0);
  });

  it('pauseWhileStood stops the turn while the player stands on it, and turns again once they leave', () => {
    const { c } = spinner(8, { pauseWhileStood: true });
    for (let i = 0; i < 60; i++) tick(c);
    const a0 = platforms.angle('anvil.ring')!;
    for (let i = 0; i < 120; i++) tick(c);
    expect(platforms.angle('anvil.ring')! - a0).toBeLessThan(OMEGA * DT * 2); // at most a tick before the stand registers
    c.teleport({ x: 500, y: Y + 50, z: 500 });
    const a1 = platforms.angle('anvil.ring')!;
    for (let i = 0; i < 60; i++) tick(c);
    expect(platforms.angle('anvil.ring')! - a1).toBeGreaterThan(OMEGA * 0.9);
  });

  it('renderPose interpolates the pose between the last two ticks; a load sets it back to rest', () => {
    spinner(8);
    platforms.fixedUpdate(DT);
    platforms.fixedUpdate(DT);
    const a = platforms.angle('anvil.ring')!;
    expect(a).toBeCloseTo(OMEGA * DT * 2, 9);
    expect(platforms.renderPose('anvil.ring', 0)!.yaw).toBeCloseTo(OMEGA * DT, 9);
    expect(platforms.renderPose('anvil.ring', 0.5)!.yaw).toBeCloseTo(OMEGA * DT * 1.5, 9);
    expect(platforms.renderPose('anvil.ring', 1)!.yaw).toBeCloseTo(a, 9);
    expect(platforms.renderPose('nope', 1)).toBeNull();
    platforms.load({ 'anvil.ring': 0 });
    expect(platforms.angle('anvil.ring')).toBe(0);
    expect(platforms.standingPoint('anvil.ring')!.x).toBe(0);
  });

  it('a pivot away from the body origin carries the body round the pivot; the carry is exact for the feet', () => {
    const body = physics.world.createRigidBody(physics.rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(10, Y, 0));
    const col = physics.world.createCollider(physics.rapier.ColliderDesc.cuboid(2, 0.25, 2), body);
    platforms.register('orbit', body, { stops: [{ x: 10, y: Y, z: 0 }], speed: 1, wait: 0, spin: { pivot: { x: 0, y: Y, z: 0 }, degPerS: 90 } });
    for (let i = 0; i < 60; i++) platforms.fixedUpdate(DT);
    const t = body.translation();
    // 90 deg about +Y takes (10, 0) to (0, -10) (three's convention)
    expect(t.x).toBeCloseTo(0, 6);
    expect(t.z).toBeCloseTo(-10, 6);
    const carry = platforms.carryAt(col, { x: 0, y: Y, z: -10 })!;
    expect(carry.yaw).toBeCloseTo((90 * Math.PI) / 180 / 60, 9);
    expect(carry.air).toBe(true);
    expect(Math.hypot(carry.x, carry.z)).toBeCloseTo(10 * carry.yaw, 3);
  });

  it('refuses a spin without a finite pivot or rate; a translating platform still needs two stops', () => {
    const body = physics.world.createRigidBody(physics.rapier.RigidBodyDesc.kinematicPositionBased());
    physics.world.createCollider(physics.rapier.ColliderDesc.cuboid(1, 1, 1), body);
    expect(() => platforms.register('a', body, { stops: [{ x: 0, y: 0, z: 0 }], speed: 1, wait: 0, spin: { pivot: { x: NaN, y: 0, z: 0 }, degPerS: 5 } })).toThrow(/spin/);
    expect(() => platforms.register('b', body, { stops: [{ x: 0, y: 0, z: 0 }], speed: 1, wait: 0 })).toThrow(/two stops/);
    expect(() => platforms.register('c', body, { stops: [], speed: 1, wait: 0, spin: { pivot: { x: 0, y: 0, z: 0 }, degPerS: 5 } })).toThrow(/one stop/);
  });

  it('a translating platform answers its delta with no yaw and no air carry', () => {
    const body = physics.world.createRigidBody(physics.rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 1, 0));
    const col = physics.world.createCollider(physics.rapier.ColliderDesc.cuboid(1, 0.25, 1), body);
    platforms.register('lift', body, { stops: [{ x: 0, y: 1, z: 0 }, { x: 0, y: 5, z: 0 }], speed: 2, wait: 0 });
    platforms.fixedUpdate(DT);
    const carry = platforms.carryAt(col, { x: 0, y: 1.25, z: 0 })!;
    expect(carry).toEqual({ ...platforms.delta(col), yaw: 0 });
    expect(carry.air).toBeUndefined();
  });
});

describe('spin rate and reset (v0.9, for N3)', () => {
  it('a rate of 0 holds the angle and carries nothing; a new rate turns on from there; reset goes back to 0', () => {
    const { c } = spinner(8);
    for (let i = 0; i < 60; i++) tick(c);
    expect(platforms.setSpinRate('anvil.ring', 0)).toBe(true);
    tick(c);
    const held = platforms.angle('anvil.ring')!;
    for (let i = 0; i < 60; i++) tick(c);
    expect(platforms.angle('anvil.ring')).toBe(held);
    expect(c.carryYaw).toBe(0);
    expect(platforms.setSpinRate('anvil.ring', -DEG)).toBe(true);
    for (let i = 0; i < 60; i++) tick(c);
    expect(platforms.angle('anvil.ring')!).toBeCloseTo(held - OMEGA, 6);
    expect(platforms.resetSpin('anvil.ring')).toBe(true);
    expect(platforms.angle('anvil.ring')).toBe(0);
    expect(platforms.renderPose('anvil.ring', 1)!.yaw).toBe(0);
  });
  it('refuses unknown ids, non-spinning platforms and bad rates', () => {
    spinner(3);
    expect(platforms.setSpinRate('nope', 5)).toBe(false);
    expect(platforms.setSpinRate('anvil.ring', NaN)).toBe(false);
    expect(platforms.resetSpin('nope')).toBe(false);
    const body = physics.world.createRigidBody(physics.rapier.RigidBodyDesc.kinematicPositionBased());
    physics.world.createCollider(physics.rapier.ColliderDesc.cuboid(1, 0.25, 1), body);
    platforms.register('lift', body, { stops: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 5, z: 0 }], speed: 1, wait: 0 });
    expect(platforms.setSpinRate('lift', 5)).toBe(false);
    expect(platforms.resetSpin('lift')).toBe(false);
  });
});
