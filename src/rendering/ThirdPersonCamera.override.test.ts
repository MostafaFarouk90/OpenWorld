import * as THREE from 'three';
import type RAPIER_API from '@dimforge/rapier3d';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CAMERA } from '../config/constants';
import type { InputManager } from '../input/InputManager';
import type { PhysicsQueries } from '../physics/PhysicsWorld';
import { ThirdPersonCamera, type CameraShot } from './ThirdPersonCamera';

const DT = 1 / 60;
const feet = new THREE.Vector3(1, 2, 3);

function setup() {
  const camera = new THREE.PerspectiveCamera(60);
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
  const physics = { raycast: vi.fn(() => null), overlapShape: vi.fn(), sweepShape: vi.fn() } as unknown as PhysicsQueries;
  const cam = new ThirdPersonCamera(camera, input, physics, { handle: 1 } as unknown as RAPIER_API.Collider);
  return { camera, mouse, state, cam };
}

/** Runs `seconds` of frames, returning nothing; the camera keeps its last pose. */
function run(cam: ThirdPersonCamera, seconds: number, f = feet): void {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) cam.update(f, DT);
}

const shotAt = (x: number, y: number, z: number, patch: Partial<CameraShot> = {}): CameraShot => ({
  position: { x, y, z },
  lookAt: { x, y, z: z - 5 },
  blendIn: 0.5,
  blendOut: 0.5,
  ...patch,
});

/** Camera pose with no override, for comparison. */
function followPose(yaw = 0, pitch = -0.3) {
  const { camera, cam } = setup();
  cam.yaw = yaw;
  cam.pitch = pitch;
  cam.update(feet, DT);
  return camera.position.clone();
}

afterEach(() => vi.restoreAllMocks());

describe('ThirdPersonCamera.override', () => {
  it('without overrides behaves as the follow camera and reports not overridden', () => {
    const { camera, cam } = setup();
    expect(cam.overridden).toBe(false);
    cam.update(feet, DT);
    expect(camera.position.distanceTo(followPose())).toBeLessThan(1e-9);
  });

  it('an override started and released before any frame draws it causes no jump', () => {
    const { camera, cam } = setup();
    cam.update(feet, DT);
    const follow = camera.position.clone();
    cam.override(shotAt(150, 5, 150)).release();
    cam.update(feet, DT);
    expect(camera.position.distanceTo(follow)).toBeLessThan(1e-6);
  });

  it('two overrides started in one frame blend from the shown pose to the newer shot', () => {
    const { camera, cam } = setup();
    cam.update(feet, DT);
    const follow = camera.position.clone();
    cam.override(shotAt(150, 5, 150));
    cam.override(shotAt(10, 5, 10));
    cam.update(feet, DT);
    // One frame into a 0.5 s blend: still close to the follow pose, never near the undrawn first shot.
    expect(camera.position.distanceTo(follow)).toBeLessThan(1);
    run(cam, 0.6);
    expect(camera.position.distanceTo(new THREE.Vector3(10, 5, 10))).toBeLessThan(1e-6);
  });

  it('an override before the first frame ever blends from the follow pose', () => {
    const { camera, cam } = setup();
    cam.override(shotAt(150, 5, 150)).release();
    cam.update(feet, DT);
    expect(camera.position.distanceTo(followPose())).toBeLessThan(1e-6);
  });

  it('blends in and reaches the shot pose after blendIn', () => {
    const { camera, cam } = setup();
    cam.update(feet, DT);
    const follow = camera.position.clone();
    const o = cam.override(shotAt(10, 5, 10));
    expect(cam.overridden).toBe(true);
    run(cam, 0.25);
    const mid = camera.position.clone();
    expect(mid.distanceTo(follow)).toBeGreaterThan(0.1);
    expect(mid.distanceTo(new THREE.Vector3(10, 5, 10))).toBeGreaterThan(0.1);
    run(cam, 0.3);
    expect(camera.position.distanceTo(new THREE.Vector3(10, 5, 10))).toBeLessThan(1e-6);
    expect(o.active).toBe(true);
  });

  it('looks at the shot lookAt once blended in', () => {
    const { camera, cam } = setup();
    cam.override(shotAt(0, 0, 0, { lookAt: { x: 0, y: 0, z: -10 } }));
    run(cam, 0.6);
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    expect(dir.z).toBeCloseTo(-1, 5);
  });

  it('blendIn 0 snaps on the next update', () => {
    const { camera, cam } = setup();
    cam.override(shotAt(7, 1, 2, { blendIn: 0 }));
    cam.update(feet, DT);
    expect(camera.position.distanceTo(new THREE.Vector3(7, 1, 2))).toBeLessThan(1e-9);
  });

  it('function-valued position and lookAt follow a moving target', () => {
    const { camera, cam } = setup();
    const p = { x: 0, y: 3, z: 0 };
    const look = { x: 0, y: 0, z: -5 };
    cam.override({ position: () => p, lookAt: () => look, blendIn: 0 });
    cam.update(feet, DT);
    expect(camera.position.x).toBeCloseTo(0);
    p.x = 9;
    look.x = 9;
    cam.update(feet, DT);
    expect(camera.position.x).toBeCloseTo(9);
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    expect(dir.x).toBeCloseTo(0, 5);
  });

  it('release blends back to the follow pose and clears the override', () => {
    const { camera, cam } = setup();
    const follow = followPose();
    const o = cam.override(shotAt(10, 5, 10, { blendIn: 0 }));
    run(cam, 0.1);
    o.release();
    expect(o.active).toBe(false);
    expect(cam.overridden).toBe(false);
    run(cam, 0.25);
    const mid = camera.position.clone();
    expect(mid.distanceTo(follow)).toBeGreaterThan(0.1);
    run(cam, 0.35);
    expect(camera.position.distanceTo(follow)).toBeLessThan(1e-6);
  });

  it('release(blendOut) argument overrides the shot blendOut; 0 snaps', () => {
    const { camera, cam } = setup();
    const follow = followPose();
    const o = cam.override(shotAt(10, 5, 10, { blendIn: 0, blendOut: 5 }));
    run(cam, 0.1);
    o.release(0);
    cam.update(feet, DT);
    expect(camera.position.distanceTo(follow)).toBeLessThan(1e-6);
  });

  it('release twice is a no-op', () => {
    const { camera, cam } = setup();
    const a = cam.override(shotAt(1, 1, 1, { blendIn: 0 }));
    const b = cam.override(shotAt(20, 1, 1, { blendIn: 0 }));
    run(cam, 0.1);
    b.release(0);
    b.release(0);
    expect(a.active).toBe(true);
    expect(cam.overridden).toBe(true);
    cam.update(feet, DT);
    expect(camera.position.distanceTo(new THREE.Vector3(1, 1, 1))).toBeLessThan(1e-6);
  });

  it('releasing the newer of two blends back to the older shot', () => {
    const { camera, cam } = setup();
    cam.override(shotAt(1, 1, 1, { blendIn: 0 }));
    const b = cam.override(shotAt(20, 1, 1, { blendIn: 0 }));
    run(cam, 0.1);
    expect(camera.position.x).toBeCloseTo(20);
    b.release();
    expect(cam.overridden).toBe(true);
    run(cam, 0.25);
    expect(camera.position.x).toBeGreaterThan(1.5);
    expect(camera.position.x).toBeLessThan(19.5);
    run(cam, 0.35);
    expect(camera.position.distanceTo(new THREE.Vector3(1, 1, 1))).toBeLessThan(1e-6);
  });

  it('releasing the older of two leaves the newer in place with no visible change', () => {
    const { camera, cam } = setup();
    const a = cam.override(shotAt(1, 1, 1, { blendIn: 0 }));
    cam.override(shotAt(20, 1, 1, { blendIn: 0 }));
    run(cam, 0.1);
    a.release();
    expect(a.active).toBe(false);
    expect(cam.overridden).toBe(true);
    cam.update(feet, DT);
    expect(camera.position.distanceTo(new THREE.Vector3(20, 1, 1))).toBeLessThan(1e-6);
  });

  it('overriding again while blending out continues from the on-screen pose', () => {
    const { camera, cam } = setup();
    const a = cam.override(shotAt(10, 5, 10, { blendIn: 0 }));
    run(cam, 0.1);
    a.release();
    run(cam, 0.25);
    const before = camera.position.clone();
    cam.override(shotAt(-10, 5, -10, { blendIn: 1 }));
    cam.update(feet, DT);
    expect(camera.position.distanceTo(before)).toBeLessThan(0.5);
  });

  describe('non-finite shots', () => {
    it('falls back to the follow pose and warns once per override', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { camera, cam } = setup();
      const follow = followPose();
      cam.override({ position: () => ({ x: NaN, y: 0, z: 0 }), lookAt: { x: 0, y: 0, z: 0 }, blendIn: 0 });
      run(cam, 0.2);
      expect(camera.position.distanceTo(follow)).toBeLessThan(1e-6);
      expect(warn).toHaveBeenCalledTimes(1);
    });

    it('warns separately for a second broken override', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { cam } = setup();
      cam.override({ position: { x: Infinity, y: 0, z: 0 }, lookAt: { x: 0, y: 0, z: 0 }, blendIn: 0 });
      run(cam, 0.05);
      cam.override({ position: { x: 0, y: 0, z: 0 }, lookAt: { x: 0, y: NaN, z: 0 }, blendIn: 0 });
      run(cam, 0.1);
      expect(warn).toHaveBeenCalledTimes(2);
    });

    it('recovers when the function returns finite values again', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { camera, cam } = setup();
      let x = NaN;
      cam.override({ position: () => ({ x, y: 1, z: 1 }), lookAt: { x: 0, y: 0, z: 0 }, blendIn: 0 });
      cam.update(feet, DT);
      x = 4;
      cam.update(feet, DT);
      expect(camera.position.x).toBeCloseTo(4);
    });
  });

  describe('input while overridden', () => {
    it('discards mouse delta and wheel; follow pose returns where it was', () => {
      const { camera, mouse, state, cam } = setup();
      cam.yaw = 0.4;
      cam.pitch = -0.2;
      cam.update(feet, DT);
      const follow = camera.position.clone();
      const o = cam.override(shotAt(10, 5, 10, { blendIn: 0 }));
      mouse.dx = 300;
      mouse.dy = 120;
      state.wheel = 10;
      cam.update(feet, DT);
      expect(cam.yaw).toBe(0.4);
      expect(cam.pitch).toBe(-0.2);
      expect(state.wheel).toBe(0);
      // Discarded, not deferred: nothing is left over for after the release.
      o.release(0);
      cam.update(feet, DT);
      expect(cam.yaw).toBe(0.4);
      expect(camera.position.distanceTo(follow)).toBeLessThan(1e-9);
    });

    it('mouse look works again while blending out', () => {
      const { mouse, cam } = setup();
      const o = cam.override(shotAt(10, 5, 10, { blendIn: 0 }));
      cam.update(feet, DT);
      o.release();
      mouse.dx = 100;
      cam.update(feet, DT);
      expect(cam.yaw).toBeCloseTo(-100 * CAMERA.mouseSensitivity);
    });

    it('suspends lock-on without clearing it, and resumes after release', () => {
      const { cam } = setup();
      const lockTarget = vi.fn(() => ({ x: 10, y: 2, z: 3 }));
      const onLockLook = vi.fn();
      cam.lockTarget = lockTarget;
      cam.onLockLook = onLockLook;
      cam.update(feet, DT);
      expect(lockTarget).toHaveBeenCalled();
      lockTarget.mockClear();
      onLockLook.mockClear();
      const o = cam.override(shotAt(10, 5, 10, { blendIn: 0 }));
      const yaw = cam.yaw;
      run(cam, 0.2);
      expect(lockTarget).not.toHaveBeenCalled();
      expect(onLockLook).not.toHaveBeenCalled();
      expect(cam.yaw).toBe(yaw);
      expect(cam.lockTarget).toBe(lockTarget);
      o.release(0);
      cam.update(feet, DT);
      expect(lockTarget).toHaveBeenCalled();
      expect(onLockLook).toHaveBeenCalled();
    });

    it('a cutscene writing yaw/pitch does not move the shot pose, and its yaw is kept after release', () => {
      const { camera, cam } = setup();
      const o = cam.override(shotAt(10, 5, 10, { blendIn: 0 }));
      cam.update(feet, DT);
      const pose = camera.position.clone();
      cam.yaw = 2.5;
      cam.pitch = 0.1;
      cam.update(feet, DT);
      expect(camera.position.distanceTo(pose)).toBeLessThan(1e-9);
      o.release(0);
      cam.update(feet, DT);
      expect(cam.yaw).toBe(2.5);
      expect(camera.position.distanceTo(followPose(2.5, 0.1))).toBeLessThan(1e-9);
    });
  });

  describe('fov', () => {
    it('applies the shot fov, then restores the base fov exactly', () => {
      const { camera, cam } = setup();
      camera.fov = 61.3;
      const o = cam.override(shotAt(10, 5, 10, { fov: 30, blendIn: 0.5 }));
      run(cam, 0.25);
      expect(camera.fov).toBeLessThan(61.3);
      expect(camera.fov).toBeGreaterThan(30);
      run(cam, 0.3);
      expect(camera.fov).toBeCloseTo(30, 8);
      o.release();
      run(cam, 0.7);
      expect(camera.fov).toBe(61.3);
    });

    it('a shot without fov keeps the base fov throughout', () => {
      const { camera, cam } = setup();
      const spy = vi.spyOn(camera, 'updateProjectionMatrix');
      const o = cam.override(shotAt(10, 5, 10));
      run(cam, 0.8);
      expect(camera.fov).toBe(60);
      o.release();
      run(cam, 0.8);
      expect(camera.fov).toBe(60);
      expect(spy).not.toHaveBeenCalled();
    });

    it('updates the projection matrix when the fov changes', () => {
      const { camera, cam } = setup();
      const spy = vi.spyOn(camera, 'updateProjectionMatrix');
      cam.override(shotAt(10, 5, 10, { fov: 40, blendIn: 0 }));
      cam.update(feet, DT);
      expect(spy).toHaveBeenCalled();
      expect(camera.fov).toBe(40);
    });

    it('an external fov delta added after update and removed before the next still ends at the base fov', () => {
      const { camera, cam } = setup();
      const o = cam.override(shotAt(10, 5, 10, { fov: 30, blendIn: 0.3, blendOut: 0.3 }));
      const frame = (delta: number) => {
        cam.update(feet, DT);
        camera.fov += delta; // CameraFx adds after the camera update ...
        camera.updateProjectionMatrix();
        camera.fov -= delta; // ... and takes it off before the next one.
      };
      for (let i = 0; i < 30; i++) frame(5);
      o.release();
      for (let i = 0; i < 30; i++) frame(5);
      cam.update(feet, DT);
      expect(camera.fov).toBe(60);
    });

    it('keeps the first base fov across stacked overrides', () => {
      const { camera, cam } = setup();
      const a = cam.override(shotAt(1, 1, 1, { fov: 30, blendIn: 0 }));
      cam.update(feet, DT);
      const b = cam.override(shotAt(2, 1, 1, { fov: 20, blendIn: 0 }));
      cam.update(feet, DT);
      expect(camera.fov).toBeCloseTo(20);
      b.release(0);
      a.release(0);
      run(cam, 0.1);
      expect(camera.fov).toBe(60);
    });
  });

  it('camera position offsets added after update (shake) do not accumulate', () => {
    const { camera, cam } = setup();
    cam.override(shotAt(10, 5, 10, { blendIn: 0 }));
    cam.update(feet, DT);
    const pose = camera.position.clone();
    for (let i = 0; i < 20; i++) {
      camera.position.x += 0.3; // shake applied after the update
      cam.update(feet, DT);
      expect(camera.position.distanceTo(pose)).toBeLessThan(1e-9);
    }
  });
});
