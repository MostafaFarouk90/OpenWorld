// Act 4 thread L1: the Sunforge column landmark (plans/act4-L1.md section 8).
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SUNFORGE_COLUMN } from '../../terrain/shape/waste';
import { PROXY_FAR_FRACTION } from '../act2/oldsmokeStacks';
import { PLUME_SPRITES, buildSunforgeLandmark, sunforgePlacement } from './sunforgeLandmark';

describe('sunforgePlacement', () => {
  it('stands at its true place inside 0.9 x far', () => {
    const p = sunforgePlacement({ x: SUNFORGE_COLUMN[0] - 2000, y: 100, z: SUNFORGE_COLUMN[1] }, 5000, 1000, 50);
    expect(p).toMatchObject({ x: SUNFORGE_COLUMN[0], y: 50, z: SUNFORGE_COLUMN[1], scale: 1 });
  });

  it("from the Ash Road's start (5.75 km) draws inside the far plane at the true angular size", () => {
    const cam = { x: 8825, y: 22, z: 2676 };
    const far = 5000;
    const radius = 1200;
    const p = sunforgePlacement(cam, far, radius, 50);
    const placed = Math.hypot(p.x - cam.x, p.y - cam.y, p.z - cam.z);
    expect(placed).toBeLessThanOrEqual(PROXY_FAR_FRACTION * far + 1e-6);
    expect(placed * (1 + radius / p.distance)).toBeLessThanOrEqual(0.98 * far + 1e-6);
    // Angular size: a height h at the true distance looks as big as h * scale at the placed one.
    expect(placed / p.distance).toBeCloseTo(p.scale, 9);
    // On the true bearing.
    const bear = (x: number, z: number) => Math.atan2(x - cam.x, z - cam.z);
    expect(bear(p.x, p.z)).toBeCloseTo(bear(SUNFORGE_COLUMN[0], SUNFORGE_COLUMN[1]), 9);
  });
});

describe('the Sunforge landmark', () => {
  it('draws the column only on Low, 24 plume sprites on Medium and 64 on High, and hides indoors', () => {
    const l = buildSunforgeLandmark(() => 50);
    expect(l.object.name).toBe('landmark.sunforge');
    const plume = l.object.getObjectByName('sunforge-plume') as THREE.Points;
    for (const step of ['low', 'medium', 'high'] as const) {
      l.setQuality(step);
      expect(l.plumeCount).toBe(PLUME_SPRITES[step]);
      expect(plume.geometry.drawRange.count).toBe(PLUME_SPRITES[step]);
      expect(plume.visible).toBe(PLUME_SPRITES[step] > 0);
    }
    expect([PLUME_SPRITES.low, PLUME_SPRITES.medium, PLUME_SPRITES.high]).toEqual([0, 24, 64]);
    l.update({ x: 9000, y: 30, z: 3000 }, 5000, 12, new THREE.Color(0.5, 0.5, 0.5), false);
    expect(l.object.visible).toBe(true);
    expect(l.object.scale.x).toBeLessThan(1);
    l.update({ x: 9000, y: 30, z: 3000 }, 5000, 12, null, true);
    expect(l.object.visible).toBe(false);
    l.dispose();
  });
});
