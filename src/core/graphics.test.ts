import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { Graphics } from './graphics';

function make() {
  const renderer = { setPixelRatio: vi.fn(), render: vi.fn() } as unknown as THREE.WebGLRenderer;
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
