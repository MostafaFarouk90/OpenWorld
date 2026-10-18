import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Graphics, type GraphicsService } from '../core/graphics';
import { heightAt } from '../terrain/heightfield';
import { buildInterior } from './build';
import { SceneEnvironment } from './environment';
import { layoutInterior } from './layout';
import { VAULT_DEF, VAULT_GATE } from './vaultDef';

function outdoorScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9db8d3);
  scene.fog = new THREE.Fog(0x9db8d3, 720, 4560);
  const hemi = new THREE.HemisphereLight(0xdfe8ff, 0x4a3f2a, 0.9);
  const sun = new THREE.DirectionalLight(0xfff1d6, 2);
  sun.castShadow = true;
  const terrain = new THREE.Group();
  terrain.name = 'terrain';
  scene.add(hemi, sun, terrain);
  const camera = new THREE.PerspectiveCamera();
  const renderer = { setPixelRatio() {}, getPixelRatio: () => 1, getSize: (v: THREE.Vector2) => v.set(0, 0) } as unknown as THREE.WebGLRenderer;
  const graphics = new Graphics({ renderer, scene, camera, sun, viewDistance: 4800, warn: () => {} });
  return { scene, hemi, sun, terrain, graphics, fog: scene.fog as THREE.Fog };
}

const ENV = VAULT_DEF.environment;

describe('SceneEnvironment', () => {
  it('swaps to the interior look and restores the outdoors exactly', () => {
    const o = outdoorScene();
    const env = new SceneEnvironment(o.scene, () => o.graphics);
    const bg = o.scene.background;
    env.apply(ENV);
    expect(env.inside).toBe(true);
    expect(o.sun.intensity).toBe(0);
    expect(o.sun.castShadow).toBe(false);
    expect(o.hemi.intensity).toBe(ENV.ambientIntensity);
    expect(o.terrain.visible).toBe(false);
    expect(o.fog.near).toBe(ENV.fogNear);
    expect(o.fog.far).toBe(ENV.fogFar);
    expect(o.scene.children).toContain(env.followLight);
    env.restore();
    expect(env.inside).toBe(false);
    expect(o.scene.background).toBe(bg);
    expect(o.sun.intensity).toBe(2);
    expect(o.sun.castShadow).toBe(true);
    expect(o.hemi.color.getHex()).toBe(0xdfe8ff);
    expect(o.hemi.groundColor.getHex()).toBe(0x4a3f2a);
    expect(o.hemi.intensity).toBe(0.9);
    expect(o.terrain.visible).toBe(true);
    expect(o.fog.color.getHex()).toBe(0x9db8d3);
    expect(o.fog.near).toBeCloseTo(720);
    expect(o.fog.far).toBeCloseTo(4560);
    expect(o.scene.children).not.toContain(env.followLight);
  });

  it('keeps the interior fog after a quality change made inside, and keeps that change after the exit', () => {
    const o = outdoorScene();
    const env = new SceneEnvironment(o.scene, () => o.graphics);
    env.apply(ENV);
    o.graphics.setViewDistanceOffset(-2000);
    expect(o.fog.far).not.toBe(ENV.fogFar);
    env.frame({ x: 0, y: 150, z: 0 });
    expect(o.fog.near).toBe(ENV.fogNear);
    expect(o.fog.far).toBe(ENV.fogFar);
    env.restore();
    expect(o.fog.far).toBeCloseTo((4800 - 2000) * 0.95);
  });

  it('keeps the sun shadow off inside after a shadow-quality change, and follows the setting on exit', () => {
    const o = outdoorScene();
    const env = new SceneEnvironment(o.scene, () => o.graphics);
    o.graphics.setShadows('off');
    env.apply(ENV);
    o.graphics.setShadows('full');
    env.frame({ x: 0, y: 150, z: 0 });
    expect(o.sun.castShadow).toBe(false);
    env.restore();
    expect(o.sun.castShadow).toBe(true);
    o.graphics.setShadows('off');
    env.apply(ENV);
    env.restore();
    expect(o.sun.castShadow).toBe(false);
  });

  it('moves the light with the player, and restore without apply or a second apply is harmless', () => {
    const o = outdoorScene();
    const env = new SceneEnvironment(o.scene, () => undefined as GraphicsService | undefined);
    env.restore();
    env.frame({ x: 1, y: 2, z: 3 });
    expect(env.followLight.parent).toBeNull();
    env.apply(ENV);
    env.apply(ENV);
    env.frame({ x: 1, y: 150, z: 3 });
    expect(env.followLight.position.toArray()).toEqual([1, 152.2, 3]);
    env.restore();
    // Headless (no graphics service): fog near and far come back from the snapshot.
    expect(o.fog.near).toBe(720);
    expect(o.sun.intensity).toBe(2);
  });

  it('copes with a scene with no fog, lights or terrain', () => {
    const scene = new THREE.Scene();
    const env = new SceneEnvironment(scene, () => undefined);
    env.apply(ENV);
    env.frame({ x: 0, y: 0, z: 0 });
    env.restore();
    expect(scene.children).toHaveLength(0);
  });
});

describe('buildInterior (no physics)', () => {
  const layout = layoutInterior(VAULT_DEF, heightAt);

  it('starts hidden and nothing in it casts a shadow (it floats over Brightwater)', () => {
    const b = buildInterior(layout, null);
    expect(b.root.visible).toBe(false);
    let meshes = 0;
    b.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        meshes++;
        expect(o.castShadow, o.name).toBe(false);
      }
    });
    expect(meshes).toBeGreaterThan(layout.torches.length);
    b.dispose();
    b.dispose();
  });

  it('opens and closes blockers and refuses unknown ones', () => {
    const b = buildInterior(layout, null);
    expect(b.hasBlocker(VAULT_GATE)).toBe(true);
    const gate = b.root.getObjectByName(`${b.root.name}-${VAULT_GATE}`)!;
    expect(gate.visible).toBe(false);
    expect(b.setBlocker(VAULT_GATE, true)).toBe(true);
    expect(gate.visible).toBe(true);
    expect(b.setBlocker(VAULT_GATE, false)).toBe(true);
    expect(gate.visible).toBe(false);
    expect(b.setBlocker('nope', true)).toBe(false);
    b.dispose();
  });
});
