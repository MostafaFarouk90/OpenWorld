import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FieldBlender, closeTo, scaled, toward } from './fieldBlend';

function setup() {
  const fog = new THREE.Fog(0x9db8d3, 720, 4560);
  const scene = { background: new THREE.Color(0x9db8d3) as THREE.Color | null };
  const light = new THREE.DirectionalLight(0xffffff, 2);
  const b = new FieldBlender()
    .addNumber({ get: () => fog.near, set: (v) => (fog.near = v), mix: toward(12) })
    .addNumber({ get: () => fog.far, set: (v) => (fog.far = v), mix: closeTo(140) })
    .addNumber({ get: () => light.intensity, set: (v) => (light.intensity = v), mix: scaled(0.45) })
    .addColor({ get: () => fog.color, target: new THREE.Color(0x8a8580) })
    .addColor({ get: () => scene.background, target: new THREE.Color(0x8a8580) });
  return { fog, scene, light, b };
}

describe('field blender', () => {
  it('blends by weight and hands back the bases exactly at 0', () => {
    const { fog, scene, light, b } = setup();
    const sky = (scene.background as THREE.Color).getHex();
    b.apply(1);
    expect(fog.near).toBe(12);
    expect(fog.far).toBe(140);
    expect(light.intensity).toBeCloseTo(0.9, 9);
    expect(fog.color.getHex()).toBe(0x8a8580);
    b.apply(0.5);
    expect(fog.far).toBeCloseTo(2350, 6);
    b.apply(0);
    expect([fog.near, fog.far, light.intensity]).toEqual([720, 4560, 2]);
    expect(fog.color.getHex()).toBe(0x9db8d3);
    expect((scene.background as THREE.Color).getHex()).toBe(sky);
    expect(b.engaged).toBe(false);
  });

  it('keeps a change someone else made mid-blend as the new base', () => {
    const { fog, b } = setup();
    b.apply(1);
    // A quality step mid-storm: the graphics service rewrites near and far.
    fog.near = 480;
    fog.far = 3040;
    b.apply(1);
    expect(fog.far).toBe(140);
    b.apply(0);
    expect([fog.near, fog.far]).toEqual([480, 3040]);
  });

  it('leaves a field alone on restore when someone else wrote it last', () => {
    const { fog, b } = setup();
    b.apply(1);
    fog.far = 60; // an interior's fog
    b.restore();
    expect(fog.far).toBe(60);
  });

  it('takes a swapped background Color as a new base and survives a null background', () => {
    const { scene, b } = setup();
    b.apply(1);
    const black = new THREE.Color(0x000000);
    scene.background = black;
    b.apply(1);
    expect(black.getHex()).toBe(0x8a8580);
    b.apply(0);
    expect(black.getHex()).toBe(0x000000);
    scene.background = null;
    expect(() => b.apply(1)).not.toThrow();
  });

  it('never opens the fog out past its base', () => {
    const m = closeTo(140);
    expect(m(100, 1)).toBe(100);
    expect(m(4560, 1)).toBe(140);
  });
});
