// The placed Leap ledges against the real character controller, at several pose yaws (the review's per-variant run): a plain
// jump cannot reach the 1.8 m top, a Leap from the launch anchor lands on it. Also pins the rotated footprint corners.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Player } from '../../characters/Player';
import type { InputSnapshot } from '../../input/InputManager';
import { PhysicsWorld, type Vec3 } from '../../physics/PhysicsWorld';
import { flatGround } from '../../physics/flatGround';
import { footprintCorners } from '../../region/geometry';
import { LEAP } from '../../spells/tuning';
import { ITEMS } from '../../inventory/items';
import { POI_LOOT } from './loot';
import { anchorId, placePiece } from './place';
import { buildPiece } from './templates';

const IDLE: InputSnapshot = { moveRight: 0, moveForward: 0, sprint: false, jump: false, attack: 0 };

function setup(yawDeg: number, template: 'wyrm-nest' | 'cave' | 'ruin' | 'lore-stone') {
  const world = new PhysicsWorld();
  return { world, placed: placePiece({ id: 'lp', template, params: { ledge: true } }, { x: 0, z: 0, yawDeg }) };
}

describe.each([0, 90, 135, 200])('a placed Leap ledge at yaw %i', (yaw) => {
  async function run(template: 'wyrm-nest' | 'cave' | 'ruin' | 'lore-stone', leap: boolean) {
    const { world, placed } = setup(yaw, template);
    await world.init();
    world.addHeightfield(flatGround(400));
    for (const s of placed.layout.structures) {
      const h = s.height ?? 1;
      const r = (s.yawDeg * Math.PI) / 180;
      const desc = world.rapier.ColliderDesc.cuboid(s.footprint[0] / 2, h / 2, s.footprint[1] / 2)
        .setTranslation(s.x, h / 2, s.z)
        .setRotation({ x: 0, y: Math.sin(r / 2), z: 0, w: Math.cos(r / 2) });
      world.addStaticCollider(desc);
    }
    const top = placed.layout.anchors.find((a) => a.id === anchorId('lp', 'ledge'))!;
    const launch = placed.layout.anchors.find((a) => a.id === anchorId('lp', 'ledge.launch'))!;
    // forward = (-sin yaw, -cos yaw): face the ledge from the launch point
    const faceYaw = Math.atan2(-(top.x - launch.x), -(top.z - launch.z));
    const player = new Player(new THREE.Scene(), world, { x: launch.x, y: 0, z: launch.z }, {});
    const tick = (mx: number, mz: number, input: InputSnapshot): void => {
      player.fixedUpdate(input, mx, mz);
      world.step();
      player.postStep();
    };
    for (let i = 0; i < 40; i++) tick(0, 0, IDLE);
    if (leap) {
      const h = player.leap({ yaw: faceYaw, distance: LEAP.distance, apex: LEAP.apex })!;
      for (let i = 0; i < 200 && h.active; i++) tick(0, 0, IDLE);
      for (let i = 0; i < 30; i++) tick(0, 0, IDLE);
    } else {
      const dx = -Math.sin(faceYaw);
      const dz = -Math.cos(faceYaw);
      for (let i = 0; i < 120; i++) tick(dx, dz, { ...IDLE, moveForward: 1, jump: i === 5 });
    }
    return (player.controller.interpolatedFeet(1, { x: 0, y: 0, z: 0 }) as Vec3).y;
  }

  it('is reached by a Leap from the launch anchor', async () => {
    expect(await run('wyrm-nest', true)).toBeGreaterThan(1.6);
  }, 30000);
  it('is not reached by a plain running jump', async () => {
    expect(await run('wyrm-nest', false)).toBeLessThan(0.5);
  }, 30000);
});

describe('rotated footprints', () => {
  it.each([0, 90, 135, 200])('keep their size and corners rotate with the pose (yaw %i)', (yaw) => {
    const local = buildPiece('fp', 'ruin', { ledge: true }).structures.find((s) => s.role === 'ledge')!;
    const placed = placePiece({ id: 'fp', template: 'ruin', params: { ledge: true } }, { x: 100, z: 50, yawDeg: yaw }).layout.structures.find((s) => s.role === 'ledge')!;
    expect(placed.footprint).toEqual(local.footprint);
    const corners = footprintCorners(placed);
    expect(corners).toHaveLength(4);
    const side = Math.hypot(corners[1][0] - corners[0][0], corners[1][1] - corners[0][1]);
    expect(Math.min(side, Math.hypot(corners[2][0] - corners[1][0], corners[2][1] - corners[1][1]))).toBeCloseTo(Math.min(...local.footprint), 5);
  });
});

describe('loot items', () => {
  it('only names items that exist in the live registry', () => {
    for (const [k, stacks] of Object.entries(POI_LOOT)) for (const s of stacks) expect(ITEMS[s.itemId], `${k}: ${s.itemId}`).toBeTruthy();
  });
});
