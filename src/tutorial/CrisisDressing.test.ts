import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { BRIGHTWATER_LAYOUT } from '../region/brightwater.layout';
import { CAPS } from '../vfx/tuning';
import {
  BAKERY_FIRE,
  BRAZIER_ANCHOR,
  CARDS_FULL,
  CARDS_LOW,
  CrisisDressing,
  FIRE_ANCHORS,
  FIRE_FLAG,
  MAX_ACTIVE,
  type FireLightSlot,
  type QualityName,
} from './CrisisDressing';

function setup(opts: { flag?: boolean; m01?: string; m02?: string; quality?: QualityName; skip?: string[]; light?: boolean } = {}) {
  const scene = new THREE.Scene();
  const state = { flag: opts.flag ?? false, m01: opts.m01 ?? 'active', m02: opts.m02 ?? 'inactive', quality: opts.quality ?? 'high' };
  const skip = new Set(opts.skip ?? []);
  const acquired: { held: boolean; sets: number }[] = [];
  const lights = opts.light === false ? undefined : {
    acquire: (): FireLightSlot => {
      const rec = { held: true, sets: 0 };
      acquired.push(rec);
      return { set: () => { rec.sets++; }, release: () => { rec.held = false; } };
    },
  };
  const warn = vi.fn();
  const anchorSpecs = new Map(BRIGHTWATER_LAYOUT.anchors.map((a) => [a.id, a]));
  const dress = new CrisisDressing({
    scene,
    anchors: {
      find: (id) => {
        const a = anchorSpecs.get(id);
        return !a || skip.has(id) ? undefined : { position: { x: a.x, y: a.dy ?? 0, z: a.z } };
      },
    },
    questState: (q) => (q === 'm01' ? state.m01 : q === 'm02' ? state.m02 : 'inactive'),
    flag: (k) => k === FIRE_FLAG && state.flag,
    quality: () => state.quality,
    lights,
    warn,
  });
  return { dress, scene, state, warn, acquired };
}
const near = { x: 0, y: 0, z: 100 };

describe('CrisisDressing', () => {
  it('the layout provides every anchor it looks for', () => {
    const ids = new Set(BRIGHTWATER_LAYOUT.anchors.map((a) => a.id));
    for (const id of [...FIRE_ANCHORS, BRAZIER_ANCHOR]) expect(ids.has(id), id).toBe(true);
    expect(FIRE_ANCHORS.length).toBe(8);
  });

  it('is off before the Heartshard awakens, on after, and the cart fire burns', () => {
    const { dress, state, scene } = setup();
    dress.update(0.1, near);
    expect(dress.activeFires).toBe(0);
    expect(dress.particles).toBe(0);
    state.flag = true;
    dress.refresh();
    expect(dress.activeFires).toBe(MAX_ACTIVE);
    // From the cart the cart fire is the nearest and is among the active ones.
    dress.update(0.1, { x: 0, y: 0, z: 62 });
    expect(scene.getObjectByName('crisis-fire:lane.fire-cart')!.visible).toBe(true);
  });

  it('other fires go out when M01 completes; the bakery burns until M02 completes', () => {
    const { dress, state, scene } = setup({ flag: true });
    const pos = { x: 20, y: 0, z: 120 };
    dress.update(0.1, pos);
    expect(dress.activeFires).toBe(3);
    state.m01 = 'completed';
    dress.refresh();
    // the bakery and, until M02's buckets douse it, its door (the density pass's quest fire)
    expect(dress.activeFires).toBe(2);
    expect(scene.getObjectByName('crisis-fire:kettlewick.fire-bakery-door')!.visible).toBe(true);
    expect(scene.getObjectByName(`crisis-fire:${BAKERY_FIRE}`)!.visible).toBe(true);
    state.m02 = 'completed';
    dress.refresh();
    expect(dress.activeFires).toBe(0);
    expect(dress.particles).toBe(0);
  });

  it('a load with the flag set and m01 completed but m02 not shows only the bakery fire', () => {
    const { dress, scene } = setup({ flag: true, m01: 'completed', m02: 'active' });
    dress.update(0.1, near);
    // the bakery and its door fire (doused by M02's buckets)
    expect(dress.activeFires).toBe(2);
    expect(scene.getObjectByName(`crisis-fire:${BAKERY_FIRE}`)!.visible).toBe(true);
  });

  it('?tutorial=kettlewick-like state (flag set, m01 inactive) lights every enabled fire up to the cap', () => {
    const { dress, state } = setup({ flag: true, m01: 'inactive' });
    dress.update(0.1, near);
    expect(dress.activeFires).toBe(MAX_ACTIVE);
    state.m01 = 'inactive';
    dress.refresh();
    expect(dress.activeFires).toBe(MAX_ACTIVE);
  });

  it('the nearest three burn: moving the player swaps which ones', () => {
    const { dress, scene } = setup({ flag: true });
    dress.update(0.1, { x: 0, y: 0, z: 72 });
    expect(scene.getObjectByName('crisis-fire:lane.fire-cart')!.visible).toBe(true);
    expect(scene.getObjectByName('crisis-fire:chapel.fire-1')!.visible).toBe(false);
    dress.update(0.1, { x: 30, y: 0, z: 60 });
    expect(scene.getObjectByName('crisis-fire:chapel.fire-1')!.visible).toBe(true);
    expect(scene.getObjectByName('crisis-fire:lane.fire-cart')!.visible).toBe(false);
  });

  it.each(['low', 'medium', 'high'] as const)('stays within 3 fires, 1 light and the particle cap on %s', (q) => {
    const { dress, acquired } = setup({ flag: true, quality: q });
    for (let i = 0; i < 20; i++) dress.update(0.05, { x: i * 3, y: 0, z: 50 + i * 5 });
    dress.kindle(true);
    dress.smoke(true);
    expect(dress.activeFires).toBeLessThanOrEqual(3);
    expect(dress.lightsUsed).toBeLessThanOrEqual(1);
    expect(dress.lightsUsed).toBe(q === 'low' ? 0 : 1);
    expect(acquired.filter((a) => a.held).length).toBe(q === 'low' ? 0 : 1);
    expect(dress.lightsUsed).toBeLessThanOrEqual(CAPS.pointLights);
    expect(dress.particles).toBeLessThan(CAPS.particlesTotal);
    expect(dress.particles).toBe(dress.activeFires * (q === 'low' ? CARDS_LOW : CARDS_FULL) + 2);
  });

  it('uses no light without a provider and releases the slot when the fires go out', () => {
    const none = setup({ flag: true, light: false });
    none.dress.update(0.1, near);
    expect(none.dress.lightsUsed).toBe(0);
    const { dress, state, acquired } = setup({ flag: true });
    dress.update(0.1, near);
    expect(dress.lightsUsed).toBe(1);
    state.m01 = 'completed';
    state.m02 = 'completed';
    dress.refresh();
    expect(dress.lightsUsed).toBe(0);
    expect(acquired.every((a) => !a.held)).toBe(true);
  });

  it('skips missing anchors with one warning and keeps running', () => {
    const { dress, warn } = setup({ flag: true, skip: ['lane.fire-cart', BRAZIER_ANCHOR] });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain('lane.fire-cart');
    dress.update(0.1, near);
    expect(dress.activeFires).toBe(3);
    expect(() => dress.kindle(true)).not.toThrow();
    expect(dress.burstAtBrazier()).toBeNull();
  });

  it('kindle and smoke toggle their cards; the burst point is the brazier', () => {
    const { dress, scene } = setup();
    dress.update(0.1, near);
    expect(dress.particles).toBe(0);
    dress.kindle(true);
    expect(dress.particles).toBe(1);
    dress.smoke(true);
    expect(dress.particles).toBe(2);
    dress.kindle(false);
    dress.smoke(false);
    expect(dress.particles).toBe(0);
    const b = dress.burstAtBrazier()!;
    const spec = BRIGHTWATER_LAYOUT.anchors.find((a) => a.id === BRAZIER_ANCHOR)!;
    expect([b.x, b.z]).toEqual([spec.x, spec.z]);
    expect(scene.getObjectByName('crisis:ember')).toBeDefined();
  });

  it('adds no PointLight to the scene', () => {
    const { dress, scene } = setup({ flag: true });
    dress.update(0.1, near);
    let lights = 0;
    scene.traverse((o) => { if ((o as THREE.Light).isLight) lights++; });
    expect(lights).toBe(0);
  });

  it('dispose removes everything, releases the light and is idempotent', () => {
    const { dress, scene, acquired } = setup({ flag: true });
    dress.update(0.1, near);
    dress.dispose();
    expect(scene.getObjectByName('crisis-dressing')).toBeUndefined();
    expect(acquired.every((a) => !a.held)).toBe(true);
    expect(() => { dress.dispose(); dress.update(0.1, near); dress.refresh(); dress.kindle(true); }).not.toThrow();
    expect(dress.lightsUsed).toBe(0);
  });
});
