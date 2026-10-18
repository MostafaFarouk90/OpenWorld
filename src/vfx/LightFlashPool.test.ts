import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { LightFlashPool } from './LightFlashPool';

const P = { x: 0, y: 1, z: 0 };
const lights = (s: THREE.Scene) => s.children as THREE.PointLight[];

describe('LightFlashPool', () => {
  it('creates 4 unshadowed lights', () => {
    const scene = new THREE.Scene();
    new LightFlashPool(scene);
    expect(lights(scene).length).toBe(4);
    expect(lights(scene).every((l) => !l.castShadow && l.intensity === 0)).toBe(true);
  });
  it('intensity ramps rise then decay then 0', () => {
    const scene = new THREE.Scene();
    const pool = new LightFlashPool(scene);
    pool.flash(P, 0xffaa00, 6, 0.04, 0.16, 1);
    const l = lights(scene)[0];
    pool.update(1.02);
    expect(l.intensity).toBeCloseTo(3);
    pool.update(1.04);
    expect(l.intensity).toBeCloseTo(6);
    pool.update(1.12);
    expect(l.intensity).toBeCloseTo(3);
    pool.update(1.3);
    expect(l.intensity).toBe(0);
  });
  it('zero rise starts at peak', () => {
    const scene = new THREE.Scene();
    const pool = new LightFlashPool(scene);
    pool.flash(P, 0xffffff, 5, 0, 0.1, 0);
    expect(lights(scene)[0].intensity).toBe(5);
  });
  it('5th flash recycles the oldest', () => {
    const scene = new THREE.Scene();
    const pool = new LightFlashPool(scene);
    for (let i = 0; i < 4; i++) pool.flash({ x: i, y: 0, z: 0 }, 0xffffff, 1, 0.1, 10, i * 0.01);
    pool.flash({ x: 99, y: 0, z: 0 }, 0xffffff, 1, 0.1, 10, 0.5);
    const xs = lights(scene).map((l) => l.position.x).sort((a, b) => a - b);
    expect(xs).toEqual([1, 2, 3, 99]);
  });
  it('ignores NaN and non-positive peaks; dispose is idempotent', () => {
    const scene = new THREE.Scene();
    const pool = new LightFlashPool(scene);
    pool.flash({ x: NaN, y: 0, z: 0 }, 0, 5, 0.1, 0.1, 0);
    pool.flash(P, 0, 0, 0.1, 0.1, 0);
    pool.flash(P, 0, NaN, 0.1, 0.1, 0);
    pool.update(NaN);
    expect(lights(scene).every((l) => l.intensity === 0)).toBe(true);
    pool.dispose();
    pool.dispose();
    expect(scene.children.length).toBe(0);
    pool.flash(P, 0, 5, 0.1, 0.1, 0);
  });
});
