import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { Graphics } from './graphics';

function make() {
  let ratio = 1;
  const renderer = {
    setPixelRatio: vi.fn((r: number) => void (ratio = r)),
    getPixelRatio: () => ratio,
    getSize: (v: THREE.Vector2) => v.set(800, 600),
    render: vi.fn(),
  } as unknown as THREE.WebGLRenderer;
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0, 10, 100);
  const camera = new THREE.PerspectiveCamera();
  const sun = new THREE.DirectionalLight();
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const warn = vi.fn();
  const g = new Graphics({ renderer, scene, camera, sun, viewDistance: 1000, devicePixelRatio: () => 3, warn });
  return { g, renderer, scene, camera, sun, warn };
}

describe('Graphics', () => {
  it('clamps the render scale to 0.5..1 of the capped device pixel ratio', () => {
    const t = make();
    t.g.setRenderScale(0.25);
    expect(t.renderer.setPixelRatio).toHaveBeenLastCalledWith(1);
    t.g.setRenderScale(0.75);
    expect(t.renderer.setPixelRatio).toHaveBeenLastCalledWith(1.5);
    t.g.setRenderScale(NaN);
    expect(t.warn).toHaveBeenCalled();
    expect(t.g.renderScale).toBe(0.75);
  });

  it('switches shadows off, half and full', () => {
    const t = make();
    t.g.setShadows('off');
    expect(t.sun.castShadow).toBe(false);
    t.g.setShadows('half', 25);
    expect(t.sun.castShadow).toBe(true);
    expect(t.sun.shadow.mapSize.x).toBe(1024);
    expect(t.sun.shadow.camera.right).toBe(25);
    t.g.setShadows('full');
    expect(t.sun.shadow.mapSize.x).toBe(2048);
    t.g.setShadows('ultra' as never);
    expect(t.g.shadows).toBe('full');
  });

  it('moves fog and the far plane with the view distance offset, never below 200 m', () => {
    const t = make();
    t.g.setViewDistanceOffset(-300);
    expect((t.scene.fog as THREE.Fog).far).toBeCloseTo(700 * 0.95);
    expect(t.camera.far).toBeCloseTo(700 * 1.05);
    t.g.setViewDistanceOffset(-5000);
    expect(t.camera.far).toBeCloseTo(200 * 1.05);
  });

  it('renders through the post pass and falls back to a plain render when it throws', () => {
    const t = make();
    t.g.render();
    expect(t.renderer.render).toHaveBeenCalledTimes(1);
    const pass = { render: vi.fn() };
    t.g.setPostPass(pass);
    t.g.render();
    expect(pass.render).toHaveBeenCalledTimes(1);
    expect(t.renderer.render).toHaveBeenCalledTimes(1);
    pass.render.mockImplementation(() => {
      throw new Error('gl');
    });
    t.g.render();
    expect(t.renderer.render).toHaveBeenCalledTimes(2);
    expect(t.g.postPass).toBeNull();
  });
});

describe('Graphics renderer and post pass sizing', () => {
  const pass = () => ({ render: vi.fn(), setSize: vi.fn(), setPixelRatio: vi.fn() });

  it('exposes the renderer read-only', () => {
    const t = make();
    expect(t.g.renderer).toBe(t.renderer);
    expect(() => {
      (t.g as unknown as { renderer: unknown }).renderer = null;
    }).toThrow();
  });

  it('forwards the current size and pixel ratio when a pass is installed', () => {
    const t = make();
    t.g.setRenderScale(0.75);
    const p = pass();
    t.g.setPostPass(p);
    expect(p.setSize).toHaveBeenCalledWith(800, 600);
    expect(p.setPixelRatio).toHaveBeenCalledWith(1.5);
  });

  it('forwards resizes and render-scale changes to the installed pass', () => {
    const t = make();
    const p = pass();
    t.g.setPostPass(p);
    t.g.resize(1280, 720);
    expect(p.setSize).toHaveBeenLastCalledWith(1280, 720);
    t.g.setRenderScale(0.5);
    expect(p.setPixelRatio).toHaveBeenLastCalledWith(1);
  });

  it('ignores a zero or invalid size and works with a pass that has neither hook', () => {
    const t = make();
    const p = pass();
    t.g.setPostPass(p);
    p.setSize.mockClear();
    t.g.resize(0, 600);
    t.g.resize(NaN, 600);
    expect(p.setSize).not.toHaveBeenCalled();
    const bare = { render: vi.fn() };
    t.g.setPostPass(bare);
    t.g.resize(640, 480);
    t.g.setRenderScale(1);
    t.g.render();
    expect(bare.render).toHaveBeenCalled();
  });

  it('does nothing without a pass, and stops forwarding after the pass is removed', () => {
    const t = make();
    expect(() => t.g.resize(640, 480)).not.toThrow();
    const p = pass();
    t.g.setPostPass(p);
    t.g.setPostPass(null);
    p.setSize.mockClear();
    t.g.resize(640, 480);
    expect(p.setSize).not.toHaveBeenCalled();
  });

  it('a pass whose resize throws is removed and the plain render takes over', () => {
    const t = make();
    const p = pass();
    p.setSize.mockImplementation(() => {
      throw new Error('gl lost');
    });
    t.g.setPostPass(p);
    expect(t.g.postPass).toBeNull();
    expect(t.warn).toHaveBeenCalledWith(expect.stringContaining('gl lost'));
    t.g.render();
    expect(t.renderer.render).toHaveBeenCalledTimes(1);
    expect(p.render).not.toHaveBeenCalled();
  });
});
