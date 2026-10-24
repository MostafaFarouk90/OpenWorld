import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { EFFECTS } from '../effects/index';
import { WARDEN_T4_EFFECT_IDS, WARDEN_T4_PARTICLES } from './warden';

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
const at = { position: { x: 0, y: 0, z: 0 }, yaw: 0 };
const make = (id: string, f: ReturnType<typeof fx>, t: object, p: object) => (EFFECTS as any)[id](f.ctx, t, p);

describe('Warden tier 4 presets', () => {
  it('are registered, and the particle table covers exactly the ids and stays well under the 4,000 point cap', () => {
    for (const id of WARDEN_T4_EFFECT_IDS) expect(EFFECTS[id], id).toBeTypeOf('function');
    expect(Object.keys(WARDEN_T4_PARTICLES).sort()).toEqual([...WARDEN_T4_EFFECT_IDS].sort());
    expect(Object.values(WARDEN_T4_PARTICLES).reduce((a, b) => a + b, 0)).toBeLessThan(400);
  });

  it('skullsplitter: ring, scorch and 42 points; a staggered target adds the 5-decal crack fan and 10 more points', () => {
    const plain = fx();
    const e = make('skullsplitter', plain, at, {});
    expect(plain.emitted).toEqual([30, 12]);
    expect(plain.raw.decals.place).toHaveBeenCalledTimes(1);
    expect(e.update(0.1)).toBe(true);
    expect(e.update(1)).toBe(false);
    expect(plain.scene.children).toHaveLength(0);
    const cracked = fx();
    make('skullsplitter', cracked, at, { staggered: true });
    expect(cracked.emitted).toEqual([30, 12, 10]);
    expect(cracked.raw.decals.place).toHaveBeenCalledTimes(6);
    expect(cracked.emitted.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(WARDEN_T4_PARTICLES.skullsplitter);
  });

  it('earthroot: 8 root strips under the feet for the duration, stoppable, nothing left in the scene', () => {
    const f = fx();
    const e = make('earthroot', f, at, { seconds: 5 });
    expect(f.scene.children).toHaveLength(1);
    expect(f.scene.children[0].children).toHaveLength(8);
    expect(f.emitted).toEqual([24]);
    expect(e.update(1)).toBe(true);
    expect(e.update(4.9)).toBe(true);
    expect(e.update(5.1)).toBe(false);
    expect(f.scene.children).toHaveLength(0);
    const g = fx();
    const e2 = make('earthroot', g, at, { seconds: 5 });
    e2.stop();
    expect(g.scene.children).toHaveLength(0);
  });

  it('earthroot-shock: a stone ring and 16 grit points that end by themselves', () => {
    const f = fx();
    const e = make('earthroot-shock', f, at, { radius: 3 });
    expect(f.emitted).toEqual([16]);
    expect(f.scene.children).toHaveLength(1);
    expect(e.update(1)).toBe(false);
    expect(f.scene.children).toHaveLength(0);
  });

  it('frenzied-hearth: steam from both shoulders until stopped, 4 points per 0.3 s', () => {
    const f = fx();
    const e = make('frenzied-hearth', f, at, {});
    expect(e.update(0)).toBe(true);
    expect(f.emitted).toEqual([2, 2]);
    expect(e.update(0.1)).toBe(true);
    expect(f.emitted).toHaveLength(2);
    expect(e.update(10)).toBe(true);
    expect(f.emitted).toHaveLength(4);
    e.stop();
    expect(e.update(20)).toBe(false);
  });
});
