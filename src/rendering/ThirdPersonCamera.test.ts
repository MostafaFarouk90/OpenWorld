import * as THREE from 'three';
import type RAPIER_API from '@dimforge/rapier3d';
import { describe, expect, it, vi } from 'vitest';
import { CAMERA } from '../config/constants';
import type { InputManager } from '../input/InputManager';
import type { PhysicsQueries } from '../physics/PhysicsWorld';
import { ThirdPersonCamera } from './ThirdPersonCamera';

function setup(hitDistance: number | null = null) {
  const camera = new THREE.PerspectiveCamera();
  const mouse = { dx: 0, dy: 0 };
  const state = { wheel: 0 };
  const input = {
    consumeMouseDelta: vi.fn(() => {
      const d = { ...mouse };
      mouse.dx = 0;
      mouse.dy = 0;
      return d;
    }),
    consumeWheel: vi.fn(() => {
      const w = state.wheel;
      state.wheel = 0;
      return w;
    }),
  } as unknown as InputManager;
  const raycast = vi.fn((..._args: unknown[]) => (hitDistance === null ? null : { distance: hitDistance }));
  const physics = { raycast, overlapShape: vi.fn(), sweepShape: vi.fn() } as unknown as PhysicsQueries;
  const ignore = { handle: 42 } as unknown as RAPIER_API.Collider;
  const cam = new ThirdPersonCamera(camera, input, physics, ignore);
  return { camera, mouse, state, raycast, ignore, cam };
}

const feet = new THREE.Vector3(1, 2, 3);
const targetOf = (f: THREE.Vector3) => new THREE.Vector3(f.x, f.y + CAMERA.targetHeight, f.z);
const distFromTarget = (camera: THREE.Camera, f = feet) => camera.position.distanceTo(targetOf(f));

describe('ThirdPersonCamera.toWorld', () => {
  const cases: [string, number, number, number, number, number][] = [
    // name, yaw, right, forward, x, z
    ['yaw 0 forward', 0, 0, 1, 0, -1],
    ['yaw 0 back', 0, 0, -1, 0, 1],
    ['yaw 0 right', 0, 1, 0, 1, 0],
    ['yaw 0 left', 0, -1, 0, -1, 0],
    ['yaw pi/2 forward', Math.PI / 2, 0, 1, -1, 0],
    ['yaw pi/2 back', Math.PI / 2, 0, -1, 1, 0],
    ['yaw -pi/2 forward', -Math.PI / 2, 0, 1, 1, 0],
    ['yaw -pi/2 back', -Math.PI / 2, 0, -1, -1, 0],
    ['yaw pi forward', Math.PI, 0, 1, 0, 1],
    ['yaw pi back', Math.PI, 0, -1, 0, -1],
    ['yaw pi/2 right', Math.PI / 2, 1, 0, 0, -1],
    ['yaw pi/2 left', Math.PI / 2, -1, 0, 0, 1],
  ];
  it.each(cases)('%s', (_n, yaw, right, forward, x, z) => {
    const { cam } = setup();
    cam.yaw = yaw;
    const w = cam.toWorld(right, forward);
    expect(w.x).toBeCloseTo(x, 10);
    expect(w.z).toBeCloseTo(z, 10);
  });

  it('preserves length for unit inputs at arbitrary yaw', () => {
    const { cam } = setup();
    for (const yaw of [0, 0.7, 2.1, -3, 10]) {
      cam.yaw = yaw;
      for (const [r, f] of [[1, 0], [0, 1], [-1, 0], [0, -1]] as const) {
        const w = cam.toWorld(r, f);
        expect(Math.hypot(w.x, w.z)).toBeCloseTo(1, 10);
      }
      const d = cam.toWorld(0.6, 0.8);
      expect(Math.hypot(d.x, d.z)).toBeCloseTo(1, 10);
    }
  });

  it('returns zero for zero input', () => {
    const { cam } = setup();
    cam.yaw = 1.3;
    const w = cam.toWorld(0, 0);
    expect(w.x).toBeCloseTo(0);
    expect(w.z).toBeCloseTo(0);
  });
});

describe('ThirdPersonCamera.toWorld matches what the camera sees', () => {
  it.each([0, 0.7, -1.3, Math.PI, 2.5])('forward is the view direction and right is screen-right at yaw %s', (yaw) => {
    const { camera, cam } = setup();
    cam.yaw = yaw;
    cam.update(feet);
    camera.updateMatrixWorld();
    const view = camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
    const screenRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).setY(0).normalize();
    const forward = cam.toWorld(0, 1);
    const right = cam.toWorld(1, 0);
    expect(forward.x).toBeCloseTo(view.x, 6);
    expect(forward.z).toBeCloseTo(view.z, 6);
    expect(right.x).toBeCloseTo(screenRight.x, 6);
    expect(right.z).toBeCloseTo(screenRight.z, 6);
  });
});

describe('ThirdPersonCamera mouse look', () => {
  it('positive dx decreases yaw by dx * sensitivity', () => {
    const { cam, mouse } = setup();
    mouse.dx = 100;
    cam.update(feet);
    expect(cam.yaw).toBeCloseTo(-100 * CAMERA.mouseSensitivity, 10);
  });

  it('negative dx increases yaw', () => {
    const { cam, mouse } = setup();
    mouse.dx = -40;
    cam.update(feet);
    expect(cam.yaw).toBeCloseTo(40 * CAMERA.mouseSensitivity, 10);
  });

  it('dy changes pitch by -dy * sensitivity', () => {
    const { cam, mouse } = setup();
    const start = cam.pitch;
    mouse.dy = 50;
    cam.update(feet);
    expect(cam.pitch).toBeCloseTo(start - 50 * CAMERA.mouseSensitivity, 10);
    mouse.dy = -80;
    cam.update(feet);
    expect(cam.pitch).toBeCloseTo(start - 50 * CAMERA.mouseSensitivity + 80 * CAMERA.mouseSensitivity, 10);
  });

  it('leaves yaw and pitch unchanged with no movement', () => {
    const { cam } = setup();
    const { yaw, pitch } = cam;
    cam.update(feet);
    expect(cam.yaw).toBe(yaw);
    expect(cam.pitch).toBe(pitch);
  });

  it('clamps pitch at min and max for very large dy', () => {
    const { cam, mouse } = setup();
    mouse.dy = 1e6;
    cam.update(feet);
    expect(cam.pitch).toBe(CAMERA.minPitch);
    mouse.dy = -1e7;
    cam.update(feet);
    expect(cam.pitch).toBe(CAMERA.maxPitch);
  });
});

describe('ThirdPersonCamera zoom', () => {
  it('changes distance by 0.5 per wheel step', () => {
    const { cam, camera, state } = setup();
    state.wheel = 2;
    cam.update(feet);
    expect(distFromTarget(camera)).toBeCloseTo(CAMERA.distance + 1, 6);
    state.wheel = -3;
    cam.update(feet);
    expect(distFromTarget(camera)).toBeCloseTo(CAMERA.distance + 1 - 1.5, 6);
  });

  it('clamps to maxDistance', () => {
    const { cam, camera, state } = setup();
    state.wheel = 1000;
    cam.update(feet);
    expect(distFromTarget(camera)).toBeCloseTo(CAMERA.maxDistance, 6);
  });

  it('clamps to minDistance', () => {
    const { cam, camera, state } = setup();
    state.wheel = -1000;
    cam.update(feet);
    expect(distFromTarget(camera)).toBeCloseTo(CAMERA.minDistance, 6);
  });

  it('recovers from a clamped extreme without accumulating overshoot', () => {
    const { cam, camera, state } = setup();
    state.wheel = 1000;
    cam.update(feet);
    state.wheel = -1;
    cam.update(feet);
    expect(distFromTarget(camera)).toBeCloseTo(CAMERA.maxDistance - 0.5, 6);
  });
});

describe('ThirdPersonCamera placement', () => {
  it('sits at CAMERA.distance from the target and looks at it when nothing is hit', () => {
    const { cam, camera } = setup();
    cam.yaw = 0.8;
    cam.pitch = -0.4;
    cam.update(feet);
    const target = targetOf(feet);
    expect(distFromTarget(camera)).toBeCloseTo(CAMERA.distance, 6);
    const forward = camera.getWorldDirection(new THREE.Vector3());
    const toTarget = target.clone().sub(camera.position).normalize();
    expect(forward.distanceTo(toTarget)).toBeLessThan(1e-6);
  });

  it('is behind (+Z) and above the target for yaw 0, pitch -0.3 (documented formula)', () => {
    const { cam, camera } = setup();
    cam.update(feet);
    const target = targetOf(feet);
    const d = CAMERA.distance;
    expect(camera.position.x).toBeCloseTo(target.x, 6);
    expect(camera.position.y).toBeCloseTo(target.y + d * Math.sin(0.3), 6);
    expect(camera.position.z).toBeCloseTo(target.z + d * Math.cos(0.3), 6);
    expect(camera.position.z).toBeGreaterThan(target.z);
    expect(camera.position.y).toBeGreaterThan(target.y);
  });

  it('moves with the player position', () => {
    const { cam, camera } = setup();
    const other = new THREE.Vector3(-10, 0, 7);
    cam.update(other);
    expect(distFromTarget(camera, other)).toBeCloseTo(CAMERA.distance, 6);
  });
});

describe('ThirdPersonCamera collision', () => {
  it('pulls the camera to hit distance minus margin', () => {
    const { cam, camera } = setup(3);
    cam.update(feet);
    expect(distFromTarget(camera)).toBeCloseTo(3 - CAMERA.collisionMargin, 6);
  });

  it('never goes closer than 0.3 for a tiny hit distance', () => {
    const { cam, camera } = setup(0.05);
    cam.update(feet);
    expect(distFromTarget(camera)).toBeCloseTo(0.3, 6);
  });

  it('never goes closer than 0.3 for a zero hit distance', () => {
    const { cam, camera } = setup(0);
    cam.update(feet);
    expect(distFromTarget(camera)).toBeCloseTo(0.3, 6);
  });

  it('does not permanently shrink the zoom distance after a hit', () => {
    const { cam, camera, raycast } = setup(2);
    cam.update(feet);
    raycast.mockReturnValue(null);
    cam.update(feet);
    expect(distFromTarget(camera)).toBeCloseTo(CAMERA.distance, 6);
  });

  it('raycasts from the target with ignore collider and distance + margin', () => {
    const { cam, raycast, ignore, state } = setup();
    state.wheel = 2;
    cam.update(feet);
    expect(raycast).toHaveBeenCalledTimes(1);
    const [origin, direction, maxDistance, exclude] = raycast.mock.calls[0] as [
      THREE.Vector3,
      THREE.Vector3,
      number,
      unknown,
    ];
    const target = targetOf(feet);
    expect(origin.distanceTo(target)).toBeLessThan(1e-9);
    expect(direction.length()).toBeCloseTo(1, 6);
    expect(maxDistance).toBeCloseTo(CAMERA.distance + 1 + CAMERA.collisionMargin, 6);
    expect(exclude).toBe(ignore);
  });
});
