// Act 3 thread K1: saves on the 600 m Dragonspine load where they were made (plan review, "Save and load at 600 m").
import { describe, expect, it } from 'vitest';
import { FLOAT_HEIGHT } from '../../interiors/layout';
import { sanitizePosition } from '../../save/save.plugin';
import { heightAt } from '../../terrain/heightfield';
import { ACT3_GLIDE_LEDGES } from './act3Glide';
import { ACT3_INTERIOR_PADS, ACT3_PLACES, ACT3_WAYSTONES } from './act3Places';

const at = (x: number, z: number, above = 0.05) => ({ x, y: heightAt(x, z) + above, z, yaw: 0 });

describe('Act 3 saves at height (K1)', () => {
  it('a save on the Wyrm\'s Hearth and on the Aerie shelf, at their waystones too, loads on the ground there', () => {
    for (const p of [ACT3_PLACES['wyrms-hearth'], ACT3_WAYSTONES['wyrms-hearth'], ACT3_PLACES['frostfang-aerie'], ACT3_WAYSTONES['frostfang-aerie']]) {
      const loaded = sanitizePosition(at(p.x, p.z));
      expect(loaded).not.toBeNull();
      // The loader lifts the stored feet 0.05 m more.
      expect(loaded!.y).toBeCloseTo(heightAt(p.x, p.z) + 0.1, 3);
      expect(loaded!.y).toBeGreaterThan(540);
    }
  });

  it('a save stored a little under the ground (a sunk foot) snaps up onto the 600 m plateau', () => {
    const p = ACT3_PLACES['wyrms-hearth'];
    const loaded = sanitizePosition({ x: p.x, y: p.y - 3, z: p.z, yaw: 1 });
    expect(loaded!.y).toBeCloseTo(heightAt(p.x, p.z) + 0.05, 3);
  });

  it('the Frostfang keep and Wyrmwatch hall floors float inside the 200 m load rule above their pads', () => {
    for (const id of ['frostfang-keep', 'wyrmwatch-hall'] as const) {
      const pad = ACT3_INTERIOR_PADS[id];
      expect(sanitizePosition(at(pad.x, pad.z, FLOAT_HEIGHT + 1))).not.toBeNull();
    }
  });

  it('a position at glide height over the chasm is refused, which is why a glide saves its ledge (K0 mode rule)', () => {
    const l = ACT3_GLIDE_LEDGES['summit-aerie'];
    const mid = { x: 14750, z: 15930 };
    expect(heightAt(mid.x, mid.z)).toBeLessThan(l.catchFloorY + 1);
    expect(sanitizePosition({ ...mid, y: l.ledge.y, yaw: 0 })).toBeNull();
    // The ledge itself loads.
    expect(sanitizePosition(at(l.ledge.x, l.ledge.z))).not.toBeNull();
  });
});
