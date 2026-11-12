// December (roadmap P1): every waystone in every layout has its use point on the stone, so it is in reach from all four
// faces and the corners. L14 fixed Dragonspine and the final-tree review Ashgate, the Waste and the Caldera; this covers
// the Act 1 to 3 stones too and guards any stone added later.
import { describe, expect, it } from 'vitest';
import { PLAYER } from '../config/constants';
import type { LayoutData } from '../region/layoutTypes';
import { BRIGHTWATER_LAYOUT } from '../region/brightwater.layout';
import { CORRIDOR_LAYOUT } from '../region/corridor.layout';
import { DEADROAD_LAYOUT } from '../region/deadroad.layout';
import { CINDERREACH_LAYOUT } from '../cinderreach/cinderreach.layout';
import { OLDSMOKE_LAYOUT } from '../oldsmoke/oldsmoke.layout';
import { GREYFEN_LAYOUT } from '../greyfen/greyfen.layout';
import { DRAGONSPINE_LAYOUT } from '../dragonspine/dragonspine.layout';
import { ACT4_WORLD_LAYOUT } from '../region/act4/act4World.layout';
import { WASTE_LAYOUT } from '../waste/waste.layout';
import { CALDERA_LAYOUT } from '../caldera/caldera.layout';
import { WAYSTONE_STONE_OFFSET, WAYSTONE_TUNING } from './tuning';

const LAYOUTS: Record<string, LayoutData> = {
  brightwater: BRIGHTWATER_LAYOUT, corridor: CORRIDOR_LAYOUT, deadroad: DEADROAD_LAYOUT, cinderreach: CINDERREACH_LAYOUT,
  oldsmoke: OLDSMOKE_LAYOUT, greyfen: GREYFEN_LAYOUT, dragonspine: DRAGONSPINE_LAYOUT, act4: ACT4_WORLD_LAYOUT,
  waste: WASTE_LAYOUT, caldera: CALDERA_LAYOUT,
};
const R = WAYSTONE_TUNING.interactRadius;
const STONES = Object.values(LAYOUTS).flatMap((l) => l.structures.filter((s) => s.kind === 'waystone'));

describe('every waystone is in reach from all sides', () => {
  let count = 0;
  for (const [name, layout] of Object.entries(LAYOUTS)) {
    for (const anchor of layout.anchors.filter((a) => a.id.startsWith('waystone.'))) {
      const id = anchor.id.slice('waystone.'.length);
      count++;
      it(`${name} ${id}`, () => {
        const stone = STONES.map((s) => ({ s, d: Math.hypot(s.x - anchor.x, s.z - anchor.z) })).sort((a, b) => a.d - b.d)[0]?.s;
        expect(stone, id).toBeDefined();
        const off = WAYSTONE_STONE_OFFSET[id] ?? { x: 0, z: 0 };
        const ux = anchor.x + off.x;
        const uz = anchor.z + off.z;
        const hx = stone!.footprint[0] / 2 + PLAYER.radius;
        const hz = stone!.footprint[1] / 2 + PLAYER.radius;
        for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]] as const) {
          const d = Math.hypot(stone!.x + sx * hx - ux, stone!.z + sz * hz - uz);
          expect(d, `${id} face ${sx},${sz}`).toBeLessThanOrEqual(R);
        }
      });
    }
  }
  it('found the stones', () => expect(count).toBeGreaterThan(25));
});
