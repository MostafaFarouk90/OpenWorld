import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { EFFECTS, num, origin, ring, timedMesh } from '../effects/index';
import { KNIGHT_T4_EFFECT_IDS, KNIGHT_T4_PARTICLES } from './knight';

function fx() {
  const scene = new THREE.Scene();
  const emitted: number[] = [];
  const ctx = {
    scene,
    now: () => 0,
    points: { emit: vi.fn((_k: string, _p: unknown, n: number) => (emitted.push(n), n)) },
    sparks: { burst: vi.fn() },
    decals: { place: vi.fn(() => true) },
    lights: { flash: vi.fn() },
    dissolver: {},
  };
  return { ctx: ctx as never, scene, emitted, raw: ctx };
}

describe('knight tier 4 presets', () => {
  it('are registered and the shared helpers are the same ones', () => {
    for (const id of KNIGHT_T4_EFFECT_IDS) expect(EFFECTS[id as keyof typeof EFFECTS], id).toBeTypeOf('function');
    expect(typeof ring + typeof timedMesh + typeof origin + typeof num).toBe('functionfunctionfunctionfunction');
  });

  it('bastion-wall builds 8 cards and a fan, follows time, and leaves nothing in the scene when stopped', () => {
    const f = fx();
    const e = (EFFECTS as any)['bastion-wall'](f.ctx, { position: { x: 0, y: 0, z: 0 }, yaw: 0 }, { seconds: 8 });
    expect(f.scene.children).toHaveLength(1);
    expect(f.scene.children[0].children).toHaveLength(9);
    expect(e.update(1)).toBe(true);
    e.stop();
    expect(f.scene.children).toHaveLength(0);
  });

  it('bastion-wall flicker is a short flash that ends by itself and emits at most 6 points', () => {
    const f = fx();
    const e = (EFFECTS as any)['bastion-wall'](f.ctx, { position: { x: 0, y: 0, z: 0 } }, { flicker: 1 });
    expect(f.emitted).toEqual([6]);
    expect(e.update(0.1)).toBe(true);
    expect(e.update(0.2)).toBe(false);
    expect(f.scene.children).toHaveLength(0);
  });

  it("executioners-arc sweeps a half-disc, places the scorch and ends in 0.4 s", () => {
    const f = fx();
    const e = (EFFECTS as any)['executioners-arc'](f.ctx, { position: { x: 0, y: 0, z: 0 }, yaw: 0 }, {});
    expect(f.raw.decals.place).toHaveBeenCalledTimes(1);
    expect(f.emitted).toEqual([20]);
    expect(e.update(0.1)).toBe(true);
    expect(e.update(0.5)).toBe(false);
    expect(f.scene.children).toHaveLength(0);
  });

  it('hearthfire-motes emits 40 motes, and a heart for a healed actor', () => {
    const f = fx();
    (EFFECTS as any)['hearthfire-motes'](f.ctx, { position: { x: 0, y: 0, z: 0 } }, {});
    expect(f.emitted).toEqual([40]);
    const h = (EFFECTS as any)['hearthfire-motes'](f.ctx, { position: { x: 1, y: 0, z: 0 } }, { heart: 1 });
    expect(f.scene.children).toHaveLength(1);
    expect(h.update(0.5)).toBe(true);
    expect(h.update(1)).toBe(false);
    expect(f.scene.children).toHaveLength(0);
  });

  it('the particle table stays far below the 4,000-point cap', () => {
    const total = Object.values(KNIGHT_T4_PARTICLES).reduce((a, b) => a + b, 0);
    expect(total).toBeLessThan(400);
  });
});
