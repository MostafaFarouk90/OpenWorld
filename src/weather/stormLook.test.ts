import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { installStormLook, lookAt, maskActive, targetWeight } from './stormLook';
import { STORM_LOOK } from './tuning';

const WASTE = { x0: 7000, z0: 4500, x1: 15000, z1: 11000 };

describe('storm look numbers', () => {
  it('uses the spike table per quality step', () => {
    expect(lookAt('high', 1, false)).toMatchObject({ fogNear: 12, fogFar: 140, layerAlpha: 0.55, particles: 2000, cameraFar: 630 });
    expect(lookAt('low', 1, false)).toMatchObject({ fogFar: 120, layerAlpha: 0.35, particles: 600, cameraFar: 525 });
  });

  it('the mask opens the fog and thins the layer, nothing else', () => {
    const on = lookAt('medium', 1, true);
    const off = lookAt('medium', 1, false);
    expect(on.fogFar).toBe(400);
    expect(on.layerAlpha).toBeCloseTo(0.3, 9);
    expect({ ...on, fogFar: 0, layerAlpha: 0 }).toEqual({ ...off, fogFar: 0, layerAlpha: 0 });
    expect(lookAt('low', 1, true).fogFar).toBe(360);
  });

  it('the warning shows a thin haze and a quarter of the particles; clear shows nothing', () => {
    expect(lookAt('high', 0.2, false).particles).toBe(500);
    expect(lookAt('high', 0.2, false).layerAlpha).toBeCloseTo(0.11, 9);
    expect(lookAt('high', 0, false)).toMatchObject({ particles: 0, layerAlpha: 0 });
  });

  it('keeps the fog inside the camera far plane at every weight on every step', () => {
    for (const step of ['low', 'medium', 'high'] as const) {
      const base = step === 'low' ? 3200 : 4800;
      for (let w = 0; w <= 1; w += 0.05) {
        const l = STORM_LOOK[step];
        const fog = base * 0.95 + (l.fogFar - base * 0.95) * w;
        const cam = base * 1.05 + (l.viewDistance * 1.05 - base * 1.05) * w;
        expect(fog).toBeLessThan(cam);
      }
    }
  });

  it('weights by phase and the edge band, and is 0 indoors', () => {
    expect(targetWeight('storm', [WASTE], 10000, 5000, false)).toBe(1);
    expect(targetWeight('storm', [WASTE], 10000, 4450, false)).toBeCloseTo(0.5, 9); // Ashgate
    expect(targetWeight('storm', [WASTE], 8500, 2000, false)).toBe(0); // Harrowmark
    expect(targetWeight('warning', [WASTE], 10000, 5000, false)).toBeCloseTo(0.2, 9);
    expect(targetWeight('storm', [WASTE], 10000, 5000, true)).toBe(0);
  });

  it('reads the mask from the flag or the item', () => {
    const flags = new Map<string, boolean>();
    const ctx = { state: { getBool: (k: string) => flags.get(k) === true }, services: { get: () => undefined } } as never;
    expect(maskActive(ctx)).toBe(false);
    flags.set('story.m42.complete', true);
    expect(maskActive(ctx)).toBe(true);
    const inv = { state: { getBool: () => false }, services: { get: () => ({ has: (id: string) => id === 'ash-shroud-mask' }) } } as never;
    expect(maskActive(inv)).toBe(true);
  });
});

function fakeCtx(kind: { v: 'clear' | 'warning' | 'storm' }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9db8d3);
  scene.fog = new THREE.Fog(0x9db8d3, 720, 4560);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 5040);
  camera.position.set(10000, 130, 5000);
  const systems: { render: (a: number, ft: number) => void }[] = [];
  const listeners = new Map<string, () => void>();
  const services = new Map<string, unknown>();
  const ctx = {
    scene,
    camera,
    state: { getBool: () => false },
    services: { get: (id: string) => services.get(id) },
    events: { on: (n: string, fn: () => void) => (listeners.set(n, fn), () => listeners.delete(n)) },
    systems: { add: (s: { render: (a: number, ft: number) => void }) => (systems.push(s), () => systems.splice(systems.indexOf(s), 1)) },
    anchors: { find: () => undefined },
  };
  const rt = { get lookKind() { return kind.v; }, currentShelter: null, shelterPoints: () => [{ id: 's1', x: 10000, z: 5100 }] };
  const off = installStormLook(ctx as never, rt);
  const frame = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds * 60); i++) systems[0]?.render(0, 1 / 60);
  };
  return { scene, camera, services, listeners, off, frame, fog: scene.fog as THREE.Fog };
}

describe('storm look in a scene (headless THREE)', () => {
  it('ramps in over 3 s, then hands every field back exactly', () => {
    const kind = { v: 'storm' as 'clear' | 'warning' | 'storm' };
    const t = fakeCtx(kind);
    const sky = (t.scene.background as THREE.Color).getHex();
    t.frame(1.5);
    expect(t.fog.far).toBeLessThan(4560);
    expect(t.fog.far).toBeGreaterThan(140);
    t.frame(2);
    expect(t.fog.far).toBe(140);
    expect(t.camera.far).toBeCloseTo(630, 6);
    expect(t.scene.getObjectByName('weather.ash-layer')!.visible).toBe(true);
    expect(t.scene.getObjectByName('weather.beacon:s1')!.visible).toBe(true);
    kind.v = 'clear';
    t.frame(4);
    expect([t.fog.near, t.fog.far, t.camera.far]).toEqual([720, 4560, 5040]);
    expect((t.scene.background as THREE.Color).getHex()).toBe(sky);
    expect(t.scene.getObjectByName('weather.ash-layer')!.visible).toBe(false);
    t.off();
    expect(t.scene.getObjectByName('weather.ash-layer')).toBeUndefined();
  });

  it('snaps to full weight after a load', () => {
    const t = fakeCtx({ v: 'storm' });
    t.listeners.get('save.loaded')!();
    t.frame(1 / 60);
    expect(t.fog.far).toBe(140);
    t.off();
  });

  it('an interior that snapshots the storm and restores it on exit leaves the sky exact after the storm', () => {
    const kind = { v: 'storm' as 'clear' | 'warning' | 'storm' };
    const t = fakeCtx(kind);
    const sky0 = (t.scene.background as THREE.Color).getHex();
    const fog0 = t.fog.color.getHex();
    t.frame(4);
    // The interior environment's snapshot and swap.
    const snap = { bg: t.scene.background, fog: t.fog.color.getHex(), near: t.fog.near, far: t.fog.far };
    const interior = { current: 'test' as string | null };
    t.services.set('interiors', interior);
    t.scene.background = new THREE.Color(0);
    t.fog.color.setHex(0x101010);
    t.frame(2);
    interior.current = null;
    t.scene.background = snap.bg;
    t.fog.color.setHex(snap.fog);
    t.fog.near = snap.near;
    t.fog.far = snap.far;
    kind.v = 'clear';
    t.frame(5);
    expect((t.scene.background as THREE.Color).getHex()).toBe(sky0);
    expect(t.fog.color.getHex()).toBe(fog0);
    t.off();
  });

  it('lets go indoors and comes back outside', () => {
    const t = fakeCtx({ v: 'storm' });
    t.frame(4);
    const interior = { current: 'test' as string | null };
    t.services.set('interiors', interior);
    // The interior writes its own fog.
    t.fog.far = 60;
    t.frame(0.1);
    expect(t.fog.far).toBe(60);
    expect(t.scene.getObjectByName('weather.ash-layer')!.visible).toBe(false);
    interior.current = null;
    t.fog.far = 4560; // the interior's restore
    t.frame(4);
    expect(t.fog.far).toBe(140);
    t.off();
  });
});
