import { describe, expect, it } from 'vitest';
import { footprintCorners } from '../region/geometry';
import { heightAt } from '../terrain/heightfield';
import { HARROWMARK_PLATEAU } from '../terrain/shape/harrowmark';
import { CENTER, RING_RADIUS } from './city';
import { HARROWMARK_LAYOUT } from './harrowmark.layout';

const TOP = HARROWMARK_PLATEAU.height;

describe('Harrowmark on core terrain shaping', () => {
  it('is flat at the plateau height all over the ring (and a hair beyond it at the wall)', () => {
    let worst = 0;
    for (let x = CENTER.x - RING_RADIUS; x <= CENTER.x + RING_RADIUS; x += 25) {
      for (let z = CENTER.z - RING_RADIUS; z <= CENTER.z + RING_RADIUS; z += 25) {
        if (Math.hypot(x - CENTER.x, z - CENTER.z) > RING_RADIUS + 3) continue;
        worst = Math.max(worst, Math.abs(heightAt(x, z) - TOP));
      }
    }
    expect(worst).toBeLessThan(0.3);
  });

  it('lets every structure corner stand on level ground (no footprint spread over 0.5 m)', () => {
    for (const s of HARROWMARK_LAYOUT.structures) {
      const hs = [...footprintCorners(s), [s.x, s.z] as [number, number]].map(([x, z]) => heightAt(x, z));
      expect(Math.max(...hs) - Math.min(...hs), s.id).toBeLessThan(0.5);
    }
  });

  it('sits the South Gate on the plateau edge, 20 m up where the road arrives', () => {
    expect(heightAt(8500, 1250)).toBeCloseTo(TOP, 0);
    expect(HARROWMARK_PLATEAU.box).toMatchObject({ minX: 7750, maxX: 9250, minZ: 1250, maxZ: 2750 });
  });
});
