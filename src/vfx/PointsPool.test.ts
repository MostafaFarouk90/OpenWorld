import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ParticleBudget } from './ParticleBudget';
import { PointsPool } from './PointsPool';

const P = { x: 0, y: 1, z: 0 };
function setup(cap = 10, budgetCap = 100) {
  const scene = new THREE.Scene();
  const budget = new ParticleBudget(budgetCap);
  return { scene, budget, pool: new PointsPool(scene, budget, cap) };
}

describe('PointsPool', () => {
  it('bursts and charges the budget', () => {
    const { pool, budget, scene } = setup();
    expect(pool.emit('ember', P, 5, undefined, 0)).toBe(5);
    expect(pool.liveCount).toBe(5);
    expect(budget.used).toBe(5);
    expect(scene.children.length).toBe(1);
  });
  it('recycles oldest when capacity is exhausted', () => {
    const { pool, budget } = setup(10, 100);
    pool.emit('ember', P, 8, { life: 1 }, 0);
    pool.emit('ember', P, 6, { life: 1 }, 0.1);
    expect(pool.liveCount).toBe(10);
    expect(budget.used).toBe(10);
    const t = (pool.points.geometry.getAttribute('aTime') as THREE.BufferAttribute).array as Float32Array;
    const starts = Array.from({ length: 10 }, (_, i) => t[i * 4]);
    expect(starts.filter((s) => s === 0).length).toBe(4);
    expect(starts.filter((s) => s > 0).length).toBe(6);
  });
  it('count larger than capacity is clamped', () => {
    const { pool } = setup(10);
    expect(pool.emit('ember', P, 100, undefined, 0)).toBe(10);
  });
  it('exhausted budget returns 0', () => {
    const { pool, budget } = setup(10, 100);
    budget.request(100);
    expect(pool.emit('ember', P, 5, undefined, 0)).toBe(0);
    expect(pool.liveCount).toBe(0);
  });
  it('partial grant when budget is short', () => {
    const { pool } = setup(10, 3);
    expect(pool.emit('ember', P, 5, undefined, 0)).toBe(3);
  });
  it('count 0, negative, NaN and NaN position do nothing', () => {
    const { pool, budget } = setup();
    expect(pool.emit('ember', P, 0, undefined, 0)).toBe(0);
    expect(pool.emit('ember', P, -1, undefined, 0)).toBe(0);
    expect(pool.emit('ember', P, NaN, undefined, 0)).toBe(0);
    expect(pool.emit('ash', { x: NaN, y: 0, z: 0 }, 3, undefined, 0)).toBe(0);
    expect(pool.emit('ember', P, 3, undefined, NaN)).toBe(0);
    expect(budget.used).toBe(0);
  });
  it('all kinds emit with bad optional values', () => {
    const { pool } = setup();
    expect(pool.emit('smoke', P, 1, { life: NaN, velocity: { x: NaN, y: 1, z: 0 }, size: NaN }, 0)).toBe(1);
    expect(pool.emit('ash', P, 1, { color: 0xffffff, rise: 1 }, 0)).toBe(1);
  });
  it('update sets uTime, frees ended instances and returns budget', () => {
    const { pool, budget } = setup();
    pool.emit('ember', P, 5, { life: 0.5 }, 0);
    pool.update(0.2);
    expect(pool.points.material instanceof THREE.ShaderMaterial && pool.points.material.uniforms.uTime.value).toBe(0.2);
    expect(pool.liveCount).toBe(5);
    pool.update(2);
    expect(pool.liveCount).toBe(0);
    expect(budget.used).toBe(0);
    expect(pool.emit('ember', P, 10, undefined, 2)).toBe(10);
  });
  it('dispose is idempotent, returns budget and removes the mesh', () => {
    const { pool, budget, scene } = setup();
    pool.emit('ember', P, 5, undefined, 0);
    pool.dispose();
    pool.dispose();
    expect(budget.used).toBe(0);
    expect(scene.children.length).toBe(0);
    expect(pool.emit('ember', P, 5, undefined, 0)).toBe(0);
  });
});
