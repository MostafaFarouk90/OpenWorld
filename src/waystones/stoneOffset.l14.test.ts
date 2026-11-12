// Act 4 L14 (Act 3 playthrough L2): the Wyrmwatch Lodge stone (and every Dragonspine stone, built the same way) stands
// 1.8 m off its anchor, so a use point on the anchor was out of reach from the far side. The use point is the stone.
import { describe, expect, it } from 'vitest';
import { PLAYER } from '../config/constants';
import { buildDragonspine } from '../dragonspine/layout';
import { WAYSTONE_STONE_OFFSET, WAYSTONE_TUNING } from './tuning';

describe('waystone use point on the stone (L14)', () => {
  const { layout: build } = buildDragonspine();
  const R = WAYSTONE_TUNING.interactRadius;
  it('covers every Dragonspine stone that stands off its anchor', () => {
    const off = build.anchors
      .filter((a) => a.id.startsWith('waystone.'))
      .filter((a) => {
        const s = build.structures.find((x) => x.id === `dragonspine-${a.id.replace('.', '-')}`);
        return s && Math.hypot(s.x - a.x, s.z - a.z) > 0.5;
      })
      .map((a) => a.id.replace('waystone.', ''));
    expect(off.sort()).toEqual(Object.keys(WAYSTONE_STONE_OFFSET).sort());
  });

  for (const id of Object.keys(WAYSTONE_STONE_OFFSET)) {
    it(`${id}: the use point is the stone's centre and in reach from all four sides`, () => {
      const anchor = build.anchors.find((a) => a.id === `waystone.${id}`)!;
      expect(anchor, id).toBeDefined();
      const stone = build.structures.find((s) => s.id === `dragonspine-waystone-${id}`)! as unknown as { x: number; z: number; footprint: [number, number] };
      expect(stone, id).toBeDefined();
      const off = WAYSTONE_STONE_OFFSET[id]!;
      const use = { x: anchor.x + off.x, z: anchor.z + off.z };
      expect(use.x).toBeCloseTo(stone.x, 5);
      expect(use.z).toBeCloseTo(stone.z, 5);
      // where the capsule stops against each face, and at the corners
      const hx = stone.footprint[0] / 2 + PLAYER.radius;
      const hz = stone.footprint[1] / 2 + PLAYER.radius;
      const stands = [[hx, 0], [-hx, 0], [0, hz], [0, -hz], [hx, hz], [-hx, -hz], [hx, -hz], [-hx, hz]];
      for (const [dx, dz] of stands) expect(Math.hypot(dx!, dz!), `${id} ${dx},${dz}`).toBeLessThanOrEqual(R);
      // the old use point (the anchor) was out of reach from the stone's far side
      expect(Math.hypot(stone.x - anchor.x, stone.z + hz - anchor.z)).toBeGreaterThan(R);
    });
  }
});
