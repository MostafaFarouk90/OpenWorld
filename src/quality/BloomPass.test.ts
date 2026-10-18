import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ throwOnConstruct: false, throwOnRatio: false, composer: null as any }));

vi.mock('three/examples/jsm/postprocessing/EffectComposer.js', () => ({
  EffectComposer: class {
    addPass = vi.fn();
    render = vi.fn();
    setSize = vi.fn();
    setPixelRatio = vi.fn((r: number) => {
      if (h.throwOnRatio) throw new Error('lost context');
      void r;
    });
    dispose = vi.fn();
    constructor() {
      if (h.throwOnConstruct) throw new Error('no gl');
      h.composer = this;
    }
  },
}));
vi.mock('three/examples/jsm/postprocessing/RenderPass.js', () => ({ RenderPass: class {} }));
vi.mock('three/examples/jsm/postprocessing/OutputPass.js', () => ({ OutputPass: class {} }));
vi.mock('three/examples/jsm/postprocessing/UnrealBloomPass.js', () => ({
  UnrealBloomPass: class {
    enabled = true;
    strength = 0;
  },
}));

import { BloomPostPass, BLOOM } from './BloomPass';

const renderer: any = { render: vi.fn(), getSize: (v: any) => v };
const scene: any = {};
const camera: any = {};

beforeEach(() => {
  h.throwOnConstruct = false;
  h.composer = null;
  renderer.render.mockClear();
});

describe('BloomPostPass', () => {
  it('delegates render to the composer', () => {
    const p = new BloomPostPass(renderer, scene, camera);
    p.render();
    expect(h.composer.render).toHaveBeenCalledTimes(1);
    expect(renderer.render).not.toHaveBeenCalled();
  });
  it('falls back and logs once when construction throws', () => {
    h.throwOnConstruct = true;
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const p = new BloomPostPass(renderer, scene, camera);
    p.render();
    p.render();
    expect(renderer.render).toHaveBeenCalledTimes(2);
    expect(err).toHaveBeenCalledTimes(1);
    err.mockRestore();
  });
  it('pulse decays with elapsed time back to base', () => {
    let t = 1000;
    const p = new BloomPostPass(renderer, scene, camera, () => t);
    p.pulse(1, 1);
    expect(p.strength).toBeCloseTo(BLOOM.strength + 1);
    t += 250;
    p.render();
    t += 250;
    p.render();
    expect(p.strength).toBeCloseTo(BLOOM.strength + 0.5);
    t += 250;
    p.render();
    t += 250;
    p.render();
    expect(p.strength).toBeCloseTo(BLOOM.strength);
  });
  it('setStrength and setEnabled', () => {
    const p = new BloomPostPass(renderer, scene, camera);
    p.setStrength(0.8);
    expect(p.strength).toBeCloseTo(0.8);
    expect(() => {
      p.setEnabled(false);
      p.setSize(100, 100);
    }).not.toThrow();
    expect(h.composer.setSize).toHaveBeenCalledWith(100, 100);
  });
  it('dispose is idempotent and disposes the composer once', () => {
    const p = new BloomPostPass(renderer, scene, camera);
    const c = h.composer;
    p.dispose();
    p.dispose();
    expect(c.dispose).toHaveBeenCalledTimes(1);
    p.render();
    expect(renderer.render).toHaveBeenCalledTimes(1);
  });
  it('setPixelRatio reaches the composer, ignores invalid ratios and survives a throwing composer', () => {
    h.throwOnRatio = false;
    const p = new BloomPostPass(renderer, scene, camera);
    p.setPixelRatio(1.5);
    expect(h.composer.setPixelRatio).toHaveBeenCalledWith(1.5);
    p.setPixelRatio(Number.NaN);
    p.setPixelRatio(0);
    p.setPixelRatio(-1);
    expect(h.composer.setPixelRatio).toHaveBeenCalledTimes(1);
    h.throwOnRatio = true;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => p.setPixelRatio(2)).not.toThrow();
    warn.mockRestore();
    h.throwOnRatio = false;
  });
  it('setPixelRatio after dispose does not touch the composer', () => {
    const p = new BloomPostPass(renderer, scene, camera);
    const c = h.composer;
    p.dispose();
    p.setPixelRatio(2);
    expect(c.setPixelRatio).not.toHaveBeenCalled();
  });
  it('setPixelRatio without a composer is a no-op', () => {
    h.throwOnConstruct = true;
    const p = new BloomPostPass(renderer, scene, camera);
    h.throwOnConstruct = false;
    expect(() => p.setPixelRatio(2)).not.toThrow();
  });
});
