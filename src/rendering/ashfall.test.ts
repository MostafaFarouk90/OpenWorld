import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { engineBox } from '../region/regions';
import { ashfallWeight, installAshfall } from './ashfall';

const HM = engineBox('harrowmark');

describe('Harrowmark ash-fall', () => {
  it('is off before story.gate.a4 and indoors, full in the city, fading 300 m out', () => {
    expect(ashfallWeight(HM, 8500, 2000, false, false)).toBe(0);
    expect(ashfallWeight(HM, 8500, 2000, true, true)).toBe(0);
    expect(ashfallWeight(HM, 8500, 2000, true, false)).toBe(1);
    expect(ashfallWeight(HM, 8500, HM.z1 + 150, true, false)).toBeCloseTo(0.5, 9);
    expect(ashfallWeight(HM, 8500, HM.z1 + 400, true, false)).toBe(0);
  });

  let loaded: () => void = () => {};
  function rig(gate: { v: boolean }, step = 'medium') {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x9db8d3);
    scene.fog = new THREE.Fog(0x9db8d3, 720, 4560);
    const sun = new THREE.DirectionalLight(0xffffff, 2.5);
    const hemi = new THREE.HemisphereLight(0xdfe8ff, 0x4a3f2a, 0.9);
    scene.add(sun, hemi);
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(8500, 60, 2000);
    const systems: { render: (a: number, ft: number) => void }[] = [];
    const services = new Map<string, unknown>([['quality', { step, subscribe: () => () => {} }]]);
    const off = installAshfall({
      scene,
      camera,
      state: { getBool: () => gate.v },
      services: { get: (id: string) => services.get(id) },
      systems: { add: (s: never) => (systems.push(s), () => {}) },
      events: { on: (_n: string, fn: () => void) => ((loaded = fn), () => {}) },
    } as never);
    const frame = (s: number) => {
      for (let i = 0; i < Math.round(s * 60); i++) systems[0].render(0, 1 / 60);
    };
    return { scene, sun, hemi, off, frame, services, loaded: () => loaded() };
  }

  it('grades the lights to 45% and warms the sky after the gate, and hands everything back', () => {
    const gate = { v: false };
    const t = rig(gate);
    t.frame(1);
    expect(t.sun.intensity).toBe(2.5);
    gate.v = true;
    t.frame(4);
    expect(t.sun.intensity).toBeCloseTo(2.5 * 0.45, 9);
    expect(t.hemi.intensity).toBeCloseTo(0.9 * 0.45, 9);
    expect((t.scene.background as THREE.Color).getHex()).not.toBe(0x9db8d3);
    const pts = t.scene.getObjectByName('ash-particles:ashfall') as THREE.Points;
    expect(pts.visible).toBe(true);
    expect(pts.geometry.drawRange.count).toBe(1500);
    gate.v = false;
    t.frame(4);
    expect(t.sun.intensity).toBe(2.5);
    expect((t.scene.background as THREE.Color).getHex()).toBe(0x9db8d3);
    expect(t.sun.color.getHex()).toBe(0xffffff);
    t.off();
  });

  it('is on at full weight right after a load with the gate set', () => {
    const t = rig({ v: true });
    t.loaded();
    t.frame(1 / 60);
    expect(t.sun.intensity).toBeCloseTo(2.5 * 0.45, 9);
    t.off();
  });

  it('draws 400 particles on Low', () => {
    const t = rig({ v: true }, 'low');
    t.frame(4);
    expect((t.scene.getObjectByName('ash-particles:ashfall') as THREE.Points).geometry.drawRange.count).toBe(400);
    t.off();
  });

  it('leaves the lights to an interior and resumes after its restore', () => {
    const t = rig({ v: true });
    t.frame(4);
    const graded = t.sun.intensity;
    const interior = { current: 'x' as string | null };
    t.services.set('interiors', interior);
    t.sun.intensity = 0; // the interior dims the sun
    t.frame(1);
    expect(t.sun.intensity).toBe(0);
    interior.current = null;
    t.sun.intensity = graded; // its restore
    t.frame(4);
    expect(t.sun.intensity).toBeCloseTo(graded, 9);
    t.off();
    expect(t.sun.intensity).toBe(2.5);
  });
});
