// Act 3 thread K1: the master positions sit on the shaped heightfield (plan 3.5; K2, K3, K4 and K9 read them).
import { describe, expect, it } from 'vitest';
import { heightAt } from '../../terrain/heightfield';
import { MAX_GROUND_RANGE } from '../../interiors/layout';
import { engineBox } from '../regions';
import { ACT3_INTERIOR_PADS, ACT3_PLACES, ACT3_WAYSTONES, WYRMWATCH_HEARTH } from './act3Places';

describe('Act 3 master positions (K1)', () => {
  it('every dry place stands on the ground at its y, inside its region', () => {
    for (const [id, p] of Object.entries(ACT3_PLACES)) {
      const b = engineBox(p.region);
      expect(p.x > b.x0 && p.x < b.x1 && p.z > b.z0 && p.z < b.z1, id).toBe(true);
      // The Mere's y is its water surface, over its deep floor.
      if (id === 'hathrens-mere') {
        expect(heightAt(p.x, p.z), id).toBeLessThan(p.y - 1.3);
        continue;
      }
      expect(heightAt(p.x, p.z), id).toBeCloseTo(p.y, 0);
    }
  });

  it('nine waystones, each on its plateau', () => {
    expect(Object.keys(ACT3_WAYSTONES)).toHaveLength(9);
    for (const [id, w] of Object.entries(ACT3_WAYSTONES)) expect(heightAt(w.x, w.z), id).toBeCloseTo(w.y, 1);
    expect(ACT3_WAYSTONES['wyrms-hearth'].y).toBe(600);
  });

  it('the Dragonspine interior pads are flat inside the 40 m float rule', () => {
    for (const id of ['frostfang-keep', 'wyrmwatch-hall'] as const) {
      const p = ACT3_INTERIOR_PADS[id];
      let lo = Infinity;
      let hi = -Infinity;
      for (let x = p.x - p.w / 2; x <= p.x + p.w / 2; x += 2) {
        for (let z = p.z - p.d / 2; z <= p.z + p.d / 2; z += 2) {
          const h = heightAt(x, z);
          lo = Math.min(lo, h);
          hi = Math.max(hi, h);
        }
      }
      expect(hi - lo, id).toBeLessThan(1);
      expect(hi - lo).toBeLessThan(MAX_GROUND_RANGE);
      expect(lo, id).toBeCloseTo(p.y, 1);
    }
  });

  it('the camp anchor stands on the lodge plateau', () => {
    expect(heightAt(WYRMWATCH_HEARTH.x, WYRMWATCH_HEARTH.z)).toBeCloseTo(WYRMWATCH_HEARTH.y, 1);
  });
});
