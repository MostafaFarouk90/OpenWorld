import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CameraFx } from './CameraFx';

const cam = () => {
  const c = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  c.position.set(1, 2, 3);
  c.updateMatrixWorld();
  return c;
};

describe('CameraFx', () => {
  it('shakes then settles back to exactly the base pose', () => {
    const fx = new CameraFx();
    const c = cam();
    fx.shake(0.1, 0.1);
    let moved = false;
    for (let i = 0; i < 10; i++) {
      fx.restore(c);
      fx.apply(c, 1 / 60);
      if (c.position.distanceTo(new THREE.Vector3(1, 2, 3)) > 1e-6) moved = true;
    }
    fx.restore(c);
    expect(moved).toBe(true);
    expect(c.position.x).toBeCloseTo(1, 9);
    expect(c.position.y).toBeCloseTo(2, 9);
    expect(c.position.z).toBeCloseTo(3, 9);
    expect(fx.active).toBe(false);
  });

  it('never accumulates against a camera that lerps toward a target', () => {
    const fx = new CameraFx();
    const c = cam();
    const target = new THREE.Vector3(10, 2, 3);
    fx.shake(0.2, 0.5);
    for (let i = 0; i < 120; i++) {
      fx.restore(c);
      c.position.lerp(target, 0.1);
      fx.apply(c, 1 / 60);
    }
    fx.restore(c);
    expect(c.position.distanceTo(target)).toBeLessThan(1e-3);
  });

  it('keeps the stronger of overlapping shakes, not the sum', () => {
    const a = new CameraFx();
    const b = new CameraFx();
    const ca = cam();
    const cb = cam();
    a.shake(0.1, 1);
    b.shake(0.1, 1);
    b.shake(0.05, 1);
    a.apply(ca, 0);
    b.apply(cb, 0);
    expect(cb.position.distanceTo(ca.position)).toBeLessThan(0.1 * 2);
    expect(cb.position.length()).toBeLessThan(ca.position.length() + 0.2);
  });

  it('ignores zero, negative, NaN and infinite input', () => {
    const fx = new CameraFx();
    fx.shake(0, 1);
    fx.shake(0.1, 0);
    fx.shake(NaN, 1);
    fx.shake(0.1, Infinity);
    fx.fovPunch(NaN);
    fx.fovPunch(0);
    fx.fovPunch(2, -1);
    expect(fx.active).toBe(false);
  });

  it('punches the FOV and returns to the base even when the base changes mid-punch', () => {
    const fx = new CameraFx();
    const c = cam();
    fx.fovPunch(5, 0.2);
    fx.apply(c, 0);
    expect(c.fov).toBeCloseTo(65);
    fx.restore(c);
    c.fov = 70; // a zoom changed the base
    fx.apply(c, 1 / 60);
    fx.restore(c);
    expect(c.fov).toBeCloseTo(70);
  });

  it('does not age while paused (dt 0) and is a no-op without a camera', () => {
    const fx = new CameraFx();
    fx.shake(0.1, 0.1);
    fx.apply(null, 1);
    expect(fx.active).toBe(false);
    fx.shake(0.1, 0.1);
    const c = cam();
    for (let i = 0; i < 100; i++) {
      fx.restore(c);
      fx.apply(c, 0);
    }
    expect(fx.active).toBe(true);
    fx.restore(null);
    fx.restore(c);
  });

  it('restore twice is harmless', () => {
    const fx = new CameraFx();
    const c = cam();
    fx.shake(0.1, 1);
    fx.apply(c, 0.01);
    fx.restore(c);
    fx.restore(c);
    expect(c.position.x).toBeCloseTo(1, 9);
  });
});
