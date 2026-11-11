// Review (December final tree): L14 moved the use point onto the stone for Dragonspine's stones only. Ashgate's, the
// Waste's (L1 PR 2) and the Caldera's (N1) stones stand 2.6 m north of their anchors, so with the use point on the anchor
// only the anchor's face was in reach (each side face 2.84 m, the far face 3.75 m, against a 2.5 m radius).
import { describe, expect, it } from 'vitest';
import { PLAYER } from '../config/constants';
import type { LayoutData } from '../region/layoutTypes';
import { WASTE_LAYOUT } from '../waste/waste.layout';
import { CALDERA_LAYOUT } from '../caldera/caldera.layout';
import { ACT4_WORLD_LAYOUT } from '../region/act4/act4World.layout';
import { WAYSTONE_STONE_OFFSET, WAYSTONE_TUNING } from './tuning';

const LAYOUTS: Record<string, LayoutData> = { act4: ACT4_WORLD_LAYOUT, waste: WASTE_LAYOUT, caldera: CALDERA_LAYOUT };
const R = WAYSTONE_TUNING.interactRadius;

describe('waystone use point on the stone (Ashgate, the Waste, the Caldera)', () => {
  for (const [name, layout] of Object.entries(LAYOUTS)) {
    const stones = layout.anchors.filter((a) => a.id.startsWith('waystone.'));
    it(`${name}: has waystones`, () => expect(stones.length).toBeGreaterThan(0));
    for (const anchor of stones) {
      const id = anchor.id.replace('waystone.', '');
      it(`${name} ${id}: the use point is the stone's centre and in reach from all sides`, () => {
        const stone = layout.structures.find((s) => s.kind === 'waystone' && Math.hypot(s.x - anchor.x, s.z - anchor.z) < 4);
        expect(stone, id).toBeDefined();
        const off = WAYSTONE_STONE_OFFSET[id] ?? { x: 0, z: 0 };
        expect(anchor.x + off.x).toBeCloseTo(stone!.x, 5);
        expect(anchor.z + off.z).toBeCloseTo(stone!.z, 5);
        const hx = stone!.footprint[0] / 2 + PLAYER.radius;
        const hz = stone!.footprint[1] / 2 + PLAYER.radius;
        for (const [dx, dz] of [[hx, 0], [-hx, 0], [0, hz], [0, -hz], [hx, hz], [-hx, -hz], [hx, -hz], [-hx, hz]]) {
          expect(Math.hypot(dx!, dz!), `${id} ${dx},${dz}`).toBeLessThanOrEqual(R);
        }
      });
    }
  }
});
