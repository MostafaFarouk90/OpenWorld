// Every Act 3 Leap spot against the real character controller on the real ground sampled under it: a Leap from the launch
// anchor lands on the ledge, a plain running jump does not, and walking off the ledge puts the Knight back on the ground.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Player } from '../../../characters/Player';
import type { InputSnapshot } from '../../../input/InputManager';
import { PhysicsWorld, type Vec3 } from '../../../physics/PhysicsWorld';
import { groundRange } from '../../../region/geometry';
import { LEAP } from '../../../spells/tuning';
import { heightAt } from '../../../terrain/heightfield';
import { buildPhysicsHeightfield } from '../../../terrain/physicsHeightfield';
import { ACT3_POI_PLACED, type PlacedA3 } from './place';
import { ledgeTop } from './fit';

const IDLE: InputSnapshot = { moveRight: 0, moveForward: 0, sprint: false, jump: false, attack: 0 };

async function run(p: PlacedA3, mode: 'leap' | 'jump' | 'walk-off'): Promise<{ y: number; top: number; ground: number }> {
  const world = new PhysicsWorld();
  await world.init();
  const ledge = p.layout.structures.find((s) => s.role === 'ledge')!;
  world.addHeightfield(buildPhysicsHeightfield(ledge.x, ledge.z, 64, 64));
  for (const s of p.layout.structures.filter((st) => st.kind === 'rock')) {
    // As StructureBuilder builds a foundation: from the lowest ground (less 0.3) to `height` above the highest within 1 m.
    const r = groundRange(s, heightAt, 1);
    const bottom = r.min - 0.3;
    const h = r.max + (s.height ?? 1) - bottom;
    const yaw = (s.yawDeg * Math.PI) / 180;
    world.addStaticCollider(
      world.rapier.ColliderDesc.cuboid(s.footprint[0] / 2, h / 2, s.footprint[1] / 2)
        .setTranslation(s.x, bottom + h / 2, s.z)
        .setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }),
    );
  }
  const top = ledgeTop(ledge, heightAt);
  const launch = p.layout.anchors.find((a) => a.id.endsWith('.ledge.launch'))!;
  const onTop = mode === 'walk-off';
  const start = onTop ? { x: ledge.x, y: top + 0.1, z: ledge.z } : { x: launch.x, y: heightAt(launch.x, launch.z) + 0.1, z: launch.z };
  const faceYaw = Math.atan2(-(ledge.x - launch.x), -(ledge.z - launch.z));
  const player = new Player(new THREE.Scene(), world, start, {});
  const tick = (mx: number, mz: number, input: InputSnapshot): void => {
    player.fixedUpdate(input, mx, mz);
    world.step();
    player.postStep();
  };
  for (let i = 0; i < 40; i++) tick(0, 0, IDLE);
  if (mode === 'leap') {
    const h = player.leap({ yaw: faceYaw, distance: LEAP.distance, apex: LEAP.apex })!;
    for (let i = 0; i < 200 && h.active; i++) tick(0, 0, IDLE);
    for (let i = 0; i < 30; i++) tick(0, 0, IDLE);
  } else if (mode === 'jump') {
    const dx = -Math.sin(faceYaw);
    const dz = -Math.cos(faceYaw);
    for (let i = 0; i < 120; i++) tick(dx, dz, { ...IDLE, moveForward: 1, jump: i === 5 });
  } else {
    // Walk back the way the launch lies (the open face) for 3 s.
    const dx = Math.sin(faceYaw);
    const dz = Math.cos(faceYaw);
    for (let i = 0; i < 180; i++) tick(dx, dz, { ...IDLE, moveForward: 1 });
  }
  const feet = player.controller.interpolatedFeet(1, { x: 0, y: 0, z: 0 }) as Vec3;
  return { y: feet.y, top, ground: heightAt(feet.x, feet.z) };
}

const LEAPS = ACT3_POI_PLACED.filter((p) => p.leap);

describe.each(LEAPS.map((p) => [p.id, p] as const))('the Leap spot at %s', (_id, p) => {
  it('is reached by a Leap from the launch anchor', async () => {
    const r = await run(p, 'leap');
    expect(r.y).toBeGreaterThan(r.top - 0.25);
  }, 30000);
  it('is not reached by a plain running jump', async () => {
    const r = await run(p, 'jump');
    expect(r.y).toBeLessThan(r.top - 0.8);
  }, 30000);
  it('can be left: walking off the open face lands on the ground', async () => {
    const r = await run(p, 'walk-off');
    expect(r.y).toBeLessThan(r.top - 1);
    expect(Math.abs(r.y - r.ground)).toBeLessThan(0.6);
  }, 30000);
});
