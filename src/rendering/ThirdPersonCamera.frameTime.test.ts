import * as THREE from 'three';
import type RAPIER_API from '@dimforge/rapier3d';
import { describe, expect, it, vi } from 'vitest';
import type { InputManager } from '../input/InputManager';
import type { PhysicsQueries } from '../physics/PhysicsWorld';
import { ThirdPersonCamera } from './ThirdPersonCamera';
import startWorldSource from '../world/startWorld.ts?raw';

function lockedCamera() {
  const input = {
    consumeMouseDelta: vi.fn(() => ({ dx: 0, dy: 0 })),
    consumeWheel: vi.fn(() => 0),
  } as unknown as InputManager;
  const physics = { raycast: vi.fn(() => null) } as unknown as PhysicsQueries;
  const cam = new ThirdPersonCamera(new THREE.PerspectiveCamera(), input, physics, {} as RAPIER_API.Collider);
  // Target 10 m east of the player: the eased yaw heads for -pi/2.
  cam.lockTarget = () => ({ x: 10, y: 1, z: 0 });
  return cam;
}

const feet = new THREE.Vector3(0, 0, 0);

/** Runs `seconds` of frames at `fps` and returns the camera's yaw and pitch. */
function after(seconds: number, fps: number | number[]) {
  const cam = lockedCamera();
  const steps = Array.isArray(fps) ? fps.map((f) => 1 / f) : Array.from({ length: Math.round(seconds * fps) }, () => 1 / fps);
  for (const dt of steps) cam.update(feet, dt);
  return { yaw: cam.yaw, pitch: cam.pitch };
}

describe('ThirdPersonCamera lock-on easing with variable frame time', () => {
  it('reaches the same yaw and pitch after the same time at 30, 60 and 144 fps', () => {
    const at60 = after(0.5, 60);
    for (const fps of [30, 144]) {
      const r = after(0.5, fps);
      expect(r.yaw).toBeCloseTo(at60.yaw, 2);
      expect(r.pitch).toBeCloseTo(at60.pitch, 2);
    }
    // And the camera has actually turned part of the way (not already settled, not still at 0).
    expect(at60.yaw).toBeLessThan(-0.3);
    expect(at60.yaw).toBeGreaterThan(-Math.PI / 2 + 0.01);
  });

  it('gives the same result for an uneven mix of frame times that adds up to the same time', () => {
    const steady = after(0.5, 60);
    // 0.5 s made of 1/30, 1/120 and 1/60 frames in no particular order.
    const mixed = after(0, [...Array.from({ length: 8 }, () => [30, 120, 60]).flat(), 30]);
    expect(mixed.yaw).toBeCloseTo(steady.yaw, 2);
  });

  it('a long stalled frame settles on the target bearing without overshooting', () => {
    const r = after(0, [1 / 2]);
    expect(r.yaw).toBeGreaterThanOrEqual(-Math.PI / 2 - 1e-6);
    expect(r.yaw).toBeCloseTo(-Math.PI / 2, 1);
  });

  it('a zero frame time leaves the camera where it was', () => {
    const r = after(0, [Infinity]);
    expect(r.yaw).toBe(0);
  });

  it('the world scene passes the frame time to the follow camera', () => {
    expect(startWorldSource).toMatch(/followCamera\.update\(world\.player\.feet, frameTime\)/);
  });
});
