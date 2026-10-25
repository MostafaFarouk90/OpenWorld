// Act 3 thread K1: no ground a player can reach in the Greyfen, the Dragonspine or their blend rings lies within 10 m of
// the kill plane (plan review, "Kill plane"). Reachable = within 50 m of ground open under act-complete containment, and
// not behind a fog face still standing then. Lower ground behind closed edges is never stood on: under the Ashen Waste,
// past the world's edge, and the 50 m strip between the Waste (z 11000) and fog.wyrmwatch-waste (z 11050), where the
// raw lowland dips to -52 (the uplifts may not reach into the protected Waste) and the face pushes anyone back every step.
import { describe, expect, it } from 'vitest';
import { ACT2_CORRIDORS } from '../../region/act2/act2World';
import { ACT3_FOG_WALLS, FOG_FACE_POINTS } from '../../region/act3/act3World';
import { ACT3_CORRIDORS, ACT3_HOLES, SUMMIT_OPEN_WHEN } from '../../region/act3Containment';
import { flagConditionHolds } from '../../core/flagCondition';
import { needsPushBackDef } from '../../region/fogWall';
import { Containment, DEAD_ROAD_CORRIDOR } from '../../region/containment';
import { engineBox } from '../../region/regions';
import { heightAt } from '../heightfield';
import { ACT3_MIN_FLOOR } from './act3';

const SUMMIT_FLAGS = Object.fromEntries((SUMMIT_OPEN_WHEN.all ?? []).map((k) => [k, true]));
const FLAGS: Record<string, boolean> = {
  'story.gate.a2': true,
  'story.d03.complete': true,
  'story.gate.a3': true,
  'story.phase.dragonspineOpen': true,
  ...SUMMIT_FLAGS,
  'story.gate.a4': true,
};

describe('Act 3 ground and the kill plane (K1)', () => {
  it('keeps every reachable point of both regions and a 600 m ring at or above the kill plane plus 10 m', () => {
    const c = new Containment({ getFlag: (k: string) => FLAGS[k] }, [DEAD_ROAD_CORRIDOR, ...ACT3_CORRIDORS], ACT3_HOLES);
    for (const def of ACT2_CORRIDORS) c.addCorridor(def);
    const state = { getFlag: (k: string) => FLAGS[k] };
    const standing = ACT3_FOG_WALLS.filter((w) => !flagConditionHolds(w.openWhen, state));
    expect(standing.map((w) => w.id)).toContain('fog.wyrmwatch-waste');
    const behindFace = (x: number, z: number): boolean => standing.some((w) => needsPushBackDef(w, { x, z }, FOG_FACE_POINTS[w.id as keyof typeof FOG_FACE_POINTS]));
    const reach = (x: number, z: number): boolean =>
      !behindFace(x, z) && [[0, 0], [50, 0], [-50, 0], [0, 50], [0, -50]].some(([dx, dz]) => c.isOpen(x + dx, z + dz));
    // The kill plane is -50 (Player.ts).
    expect(ACT3_MIN_FLOOR).toBe(-50 + 10);
    let checked = 0;
    let low = 0;
    let behind = 0;
    for (const id of ['greyfen', 'dragonspine'] as const) {
      const b = engineBox(id);
      for (let x = b.x0 - 600; x <= b.x1 + 600; x += 25) {
        for (let z = b.z0 - 600; z <= b.z1 + 600; z += 25) {
          const h = heightAt(x, z);
          if (h < ACT3_MIN_FLOOR) low++;
          if (h < ACT3_MIN_FLOOR && behindFace(x, z) && z >= 11000) behind++;
          if (!reach(x, z)) continue;
          checked++;
          expect(h, `(${x}, ${z})`).toBeGreaterThanOrEqual(ACT3_MIN_FLOOR);
        }
      }
    }
    expect(checked).toBeGreaterThan(100000);
    // The lower ground exists, behind the closed edges: the test would see it if containment opened there.
    expect(low).toBeGreaterThan(0);
    expect(behind).toBeGreaterThan(0);
  });

  it('keeps the low strip behind fog.wyrmwatch-waste inside the face span, and the ground just past the face safe', () => {
    const face = ACT3_FOG_WALLS.find((w) => w.id === 'fog.wyrmwatch-waste')!;
    const at = FOG_FACE_POINTS['fog.wyrmwatch-waste'];
    for (let x = 10000; x <= 17000; x += 5) {
      for (let z = 11000; z <= at.z + 2; z += 2) {
        if (heightAt(x, z) >= ACT3_MIN_FLOOR) continue;
        expect(Math.abs(x - at.x), `(${x}, ${z})`).toBeLessThanOrEqual(face.halfLength);
        expect(z, `(${x}, ${z})`).toBeLessThan(at.z);
      }
      // Where the push-back lands (1 m in front of the face) the ground is well above the kill plane.
      expect(heightAt(x, at.z + 1), `(${x}, ${at.z + 1})`).toBeGreaterThan(ACT3_MIN_FLOOR + 20);
    }
  });
});
