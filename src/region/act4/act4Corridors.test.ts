// Act 4 thread L1: the fitted Ash Road corridor and Ashgate's two corridors (plans/act4-L1.md section 4), walked over
// the act's states with the real containment (every shipped corridor and hole registered).
import { describe, expect, it } from 'vitest';
import { ASH_ROAD } from '../../terrain/shape/waste';
import { ACT2_CORRIDORS } from '../act2/act2World';
import { ACT3_CORRIDORS, ACT3_HOLES, SUMMIT_OPEN_WHEN } from '../act3Containment';
import {
  ACT4_CORRIDORS,
  ACT4_HOLES,
  ASH_ROAD_CORRIDOR,
  ASHGATE_GATE_CORRIDOR,
  ASHGATE_POINT,
  ASHGATE_REFUGE_CORRIDOR,
  OCCUPIED_FLAG,
} from '../act4Containment';
import { Containment, DEAD_ROAD_CORRIDOR } from '../containment';
import { ACT4_WORLD_LAYOUT } from './act4World.layout';

type Flags = Record<string, boolean>;
const ACT3_DONE: Flags = {
  'story.gate.a2': true,
  'story.d03.complete': true,
  'story.gate.a3': true,
  ...Object.fromEntries((SUMMIT_OPEN_WHEN.all ?? []).map((k) => [k, true])),
  'story.gate.a4': true,
};
const BEFORE_M41: Flags = { ...ACT3_DONE, [OCCUPIED_FLAG]: true };
const PHASE_G: Flags = { ...BEFORE_M41, 'story.m41.complete': true, 'story.m42.started': true };
const PHASE_H: Flags = { ...PHASE_G, 'story.phase.wasteOpen': true };
function containment(flags: Flags): Containment {
  const c = new Containment({ getFlag: (k: string) => flags[k] }, [DEAD_ROAD_CORRIDOR, ...ACT3_CORRIDORS, ...ACT4_CORRIDORS], [...ACT3_HOLES, ...ACT4_HOLES]);
  for (const def of ACT2_CORRIDORS) c.addCorridor(def);
  return c;
}
const anchor = (id: string) => ACT4_WORLD_LAYOUT.anchors.find((a) => a.id === id)!;
/** Every refuge and Ashgate anchor (present from M41). */
const ASHGATE_ANCHORS = ACT4_WORLD_LAYOUT.anchors.filter((a) => a.id.startsWith('ashgate.') || a.id.endsWith('.refuge') || a.id === 'npc-post.hild' || a.id === 'waystone.ashgate');

describe('the fitted Ash Road corridor', () => {
  it('follows the shaped road and ends on Ashgate', () => {
    const pts = ASH_ROAD_CORRIDOR.points;
    expect(pts.slice(0, -1)).toEqual(ASH_ROAD.points.slice(0, -1).map((p) => [p.x, p.z]));
    expect(pts[pts.length - 1]).toEqual([ASHGATE_POINT.x, ASHGATE_POINT.z]);
    expect(ACT4_CORRIDORS).toEqual([ASH_ROAD_CORRIDOR, ASHGATE_REFUGE_CORRIDOR, ASHGATE_GATE_CORRIDOR]);
  });

  it('is walkable end to end after M41 (5 m steps), closed north of the city before it', () => {
    const g = containment(PHASE_G);
    const before = containment(BEFORE_M41);
    const pts = ASH_ROAD_CORRIDOR.points;
    for (let i = 1; i < pts.length; i++) {
      const [ax, az] = pts[i - 1];
      const [bx, bz] = pts[i];
      const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 5);
      for (let k = 0; k <= n; k++) {
        const x = ax + ((bx - ax) * k) / n;
        const z = az + ((bz - az) * k) / n;
        expect(g.isOpen(x, z), `(${x}, ${z})`).toBe(true);
        if (z > 4000) expect(before.isOpen(x, z), `(${x}, ${z})`).toBe(false);
      }
    }
  });
});

describe("Ashgate's corridors", () => {
  it('open every refuge and Ashgate anchor from M41, none before', () => {
    expect(ASHGATE_ANCHORS.length).toBeGreaterThan(30);
    const g = containment(PHASE_G);
    const before = containment(BEFORE_M41);
    for (const a of ASHGATE_ANCHORS) {
      expect(g.isOpen(a.x, a.z), a.id).toBe(true);
      expect(before.isOpen(a.x, a.z), a.id).toBe(false);
    }
  });

  it("keep the arch shut until the Waste opens, then lead from Ashgate into the Waste", () => {
    const arch = anchor('ashgate.arch');
    const north = { x: ASHGATE_POINT.x, z: 4540 };
    expect(containment(PHASE_G).isOpen(north.x, north.z)).toBe(false);
    const h = containment(PHASE_H);
    for (let z = ASHGATE_POINT.z; z <= 4600; z += 5) expect(h.isOpen(ASHGATE_POINT.x, z), `z ${z}`).toBe(true);
    expect(h.isOpen(arch.x, arch.z)).toBe(true);
    // In Phase G a player at the arch who steps north is set back on the camp side.
    const back = containment(PHASE_G).nearestOpen(north.x, north.z);
    expect(back.z).toBeLessThan(4500);
  });
});
