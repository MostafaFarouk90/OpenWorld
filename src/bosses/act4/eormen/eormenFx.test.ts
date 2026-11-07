import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { NaveDark, SpiritBlades, TollRing } from './eormenFx';
import { BLADES, DARK, TOLL } from './tuning';

describe('SpiritBlades', () => {
  it('a fan of four flies at the target and each blade lands at most once', () => {
    const b = new SpiritBlades();
    b.fire({ x: 0, y: 1.2, z: 0 }, { x: 0, y: 0, z: 8 });
    expect(b.liveCount).toBe(BLADES.count);
    const landed: number[] = [];
    for (let i = 0; i < 120; i++) b.update(1 / 60, (at) => Math.abs(at.z - 8) < 0.3 && Math.abs(at.x) < 1, (id) => landed.push(id));
    expect(new Set(landed).size).toBe(landed.length);
    expect(landed.length).toBeGreaterThanOrEqual(2);
    expect(b.liveCount).toBe(0);
    b.dispose();
  });

  it('blades that miss stop at their reach', () => {
    const b = new SpiritBlades();
    b.fire({ x: 0, y: 1, z: 0 }, { x: 10, y: 0, z: 0 });
    const t = BLADES.range / BLADES.speed;
    for (let i = 0; i < Math.ceil((t * 60) / 1) + 2; i++) b.update(1 / 60, () => false, () => {});
    expect(b.liveCount).toBe(0);
    b.dispose();
  });
});

describe('TollRing', () => {
  it('charges over the lead, pulses, then goes out', () => {
    const r = new TollRing();
    r.charge({ x: 0, y: 0, z: 0 }, TOLL.windup);
    expect(r.active).toBe(true);
    r.update(TOLL.windup);
    r.pulse({ x: 0, y: 0, z: 0 });
    r.update(0.6);
    expect(r.active).toBe(false);
    r.dispose();
  });
});

describe('NaveDark', () => {
  const scene = () => {
    const s = new THREE.Scene();
    const hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 0.8);
    const follow = new THREE.PointLight(0xffffff, 2);
    follow.name = 'interior-light';
    const other = new THREE.PointLight(0xffffff, 3);
    other.name = 'env.glow';
    s.add(hemi, follow, other);
    return { s, hemi, follow, other };
  };

  it('fades the hemisphere and the follow light to the dark share, leaves glow lights alone, and restores', () => {
    const { s, hemi, follow, other } = scene();
    const d = new NaveDark(s);
    d.dim();
    expect(d.lights).toBe(2);
    d.update(DARK.fadeSeconds + 0.01);
    expect(hemi.intensity).toBeCloseTo(0.8 * DARK.share);
    expect(follow.intensity).toBeCloseTo(2 * DARK.share);
    expect(other.intensity).toBe(3);
    d.restore();
    expect(hemi.intensity).toBeCloseTo(0.8);
    expect(follow.intensity).toBeCloseTo(2);
  });

  it('never undoes a light someone else set meanwhile (the interior exit restoring the outdoors)', () => {
    const { s, hemi } = scene();
    const d = new NaveDark(s);
    d.dim();
    d.update(DARK.fadeSeconds);
    hemi.intensity = 1.4; // the interior's restore
    d.update(0.1);
    d.restore();
    expect(hemi.intensity).toBe(1.4);
  });

  it('restore without a dim does nothing', () => {
    const { s, hemi } = scene();
    new NaveDark(s).restore();
    expect(hemi.intensity).toBe(0.8);
  });
});
