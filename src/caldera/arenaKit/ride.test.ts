// N3, the coordinator's first-named test: the kit's TurningPlatforms carry the player at 30 fps headless steps, with the
// real rapier character controller and the real core Platforms service (v0.9 item 7b): two fixed ticks a frame, the
// meshes drawn at the render pose for alpha 0 and 0.5. Idle and walk-and-jump for 30 s at 8 and 14 m from the pivot;
// the drawn floor stays within 1 cm of the drawn player; 'still' holds the angle; reset returns to angle 0;
// pauseWhileStood (the fallback) only when asked.
import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import { FIXED_TIMESTEP } from '../../config/constants';
import { CharacterController, type MoveIntent } from '../../physics/CharacterController';
import { PhysicsWorld, type Vec3 } from '../../physics/PhysicsWorld';
import { Platforms } from '../../physics/platforms';
import { TurningPlatforms } from './TurningPlatforms';

const DT = FIXED_TIMESTEP;
const IDLE: MoveIntent = { moveX: 0, moveZ: 0, sprint: false, jump: false };
const Y = 140;
const PIVOT = { x: 11000, y: Y, z: 8000 }; // the Anvil, far from the origin
const DEG = 10;

let physics: PhysicsWorld;
let platforms: Platforms;

beforeEach(async () => {
  physics = new PhysicsWorld();
  await physics.init();
  platforms = new Platforms();
});

/** One ring segment: a 6 x 8 m slab `radius` m east of the pivot, its body at the pivot (so it turns about it). */
function ring(radius: number, opts: { start?: 'still' | 'turning'; pauseWhileStood?: boolean } = {}) {
  const body = physics.world.createRigidBody(physics.rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(PIVOT.x, PIVOT.y, PIVOT.z));
  physics.world.createCollider(physics.rapier.ColliderDesc.cuboid(3, 0.25, 4).setTranslation(radius, 0, 0), body);
  const mesh = new THREE.Object3D();
  const kit = new TurningPlatforms({ platforms, pivot: PIVOT, degPerS: DEG, items: [{ id: 'caldera.anvil.ring.1', body, mesh }], start: opts.start ?? 'turning', pauseWhileStood: opts.pauseWhileStood });
  const c = new CharacterController(physics, { x: PIVOT.x + radius, y: Y + 0.25, z: PIVOT.z });
  c.setPlatformSource((col, feet) => platforms.carryAt(col, feet) ?? { x: 0, y: 0, z: 0, yaw: 0 });
  return { kit, mesh, c };
}

function tick(c: CharacterController, i: MoveIntent = IDLE): void {
  platforms.fixedUpdate(DT);
  c.fixedUpdate(i);
  physics.step();
}

/** World point -> the mesh's own frame (position and yaw). */
function toLocal(mesh: THREE.Object3D, p: Vec3): Vec3 {
  const a = -mesh.rotation.y;
  const dx = p.x - mesh.position.x;
  const dz = p.z - mesh.position.z;
  return { x: dx * Math.cos(a) + dz * Math.sin(a), y: p.y - mesh.position.y, z: -dx * Math.sin(a) + dz * Math.cos(a) };
}

describe('TurningPlatforms ride at 30 fps (real controller)', () => {
  it.each([8, 14])('idle 30 s at %i m: carried; the drawn floor and the drawn player agree within 1 cm at alpha 0 and 0.5', (r) => {
    const { kit, mesh, c } = ring(r);
    for (let i = 0; i < 30; i++) tick(c);
    kit.render(1);
    const start = toLocal(mesh, c.interpolatedFeet(1, { x: 0, y: 0, z: 0 }));
    let gap = 0;
    let drift = 0;
    for (let frame = 0; frame < 30 * 30; frame++) {
      tick(c);
      tick(c); // 30 fps: two ticks a frame
      kit.render(1);
      const end = toLocal(mesh, c.interpolatedFeet(1, { x: 0, y: 0, z: 0 }));
      drift = Math.max(drift, Math.hypot(end.x - start.x, end.z - start.z));
      for (const alpha of [0, 0.5]) {
        kit.render(alpha);
        const l = toLocal(mesh, c.interpolatedFeet(alpha, { x: 0, y: 0, z: 0 }));
        // the render gap: where the drawn player stands on the drawn floor, against the same at the tick
        gap = Math.max(gap, Math.hypot(l.x - end.x, l.z - end.z));
      }
    }
    expect(gap).toBeLessThan(0.01);
    // At the Anvil, 11 km from the origin, rapier's float32 rounds each tick's carry: the player creeps a few cm over
    // 30 s (none at the origin, N0's test). Measured 3 to 4 cm; the bound keeps it unnoticeable.
    expect(drift).toBeLessThan(0.08);
    expect(c.grounded).toBe(true);
    expect(c.interpolatedFeet(1, { x: 0, y: 0, z: 0 }).y).toBeGreaterThan(Y);
  });

  it.each([8, 14])('walking and jumping for 30 s at 30 fps, %i m out, never falls off', (r) => {
    const { kit, c } = ring(r);
    for (let i = 0; i < 30; i++) tick(c);
    let fell = false;
    let airborne = 0;
    for (let frame = 0; frame < 30 * 30; frame++) {
      const t = frame / 30;
      const d = [[0, -0.3], [0.3, 0], [0, 0.3], [-0.3, 0]][Math.floor(t) % 4]!;
      for (let k = 0; k < 2; k++) {
        tick(c, { moveX: d[0], moveZ: d[1], sprint: false, jump: frame % 90 === 0 && k === 0 });
        if (!c.grounded) airborne++;
      }
      kit.render(0.5);
      if (c.interpolatedFeet(1, { x: 0, y: 0, z: 0 }).y < Y - 2) fell = true;
    }
    expect(fell).toBe(false);
    expect(airborne).toBeGreaterThan(60);
  });

  it("'still' holds the angle and carries nothing; 'turning' resumes from it; a named rate; reset goes back to angle 0", () => {
    const { kit, mesh, c } = ring(8, { start: 'still' });
    for (let i = 0; i < 60; i++) tick(c);
    kit.render(1);
    expect(mesh.rotation.y).toBeCloseTo(0, 9);
    kit.apply('turning');
    for (let i = 0; i < 60; i++) tick(c);
    const a1 = platforms.angle('caldera.anvil.ring.1')!;
    expect(a1).toBeCloseTo((DEG * Math.PI) / 180, 2);
    kit.apply('still');
    for (let i = 0; i < 60; i++) tick(c);
    expect(platforms.angle('caldera.anvil.ring.1')).toBeCloseTo(a1, 9);
    kit.apply('turning:-20');
    expect(kit.degPerS).toBe(-20);
    for (let i = 0; i < 60; i++) tick(c);
    expect(platforms.angle('caldera.anvil.ring.1')).toBeCloseTo(a1 - (20 * Math.PI) / 180, 2);
    kit.reset();
    expect(kit.state).toBe('still');
    expect(platforms.angle('caldera.anvil.ring.1')).toBe(0);
    kit.apply('spinning');
    expect(kit.state).toBe('still');
  });

  it('pauseWhileStood is off by default and on only when asked', () => {
    const on = ring(8, { pauseWhileStood: true });
    for (let i = 0; i < 120; i++) tick(on.c);
    expect(platforms.angle('caldera.anvil.ring.1')!).toBeLessThanOrEqual(((DEG * Math.PI) / 180) * DT * 4); // a few ticks before the stand registers
    on.kit.dispose();
    const off = ring(8);
    for (let i = 0; i < 120; i++) tick(off.c);
    expect(platforms.angle('caldera.anvil.ring.1')!).toBeGreaterThan(((DEG * Math.PI) / 180) * 1.9);
  });
});
