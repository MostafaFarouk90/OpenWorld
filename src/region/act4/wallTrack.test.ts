// Act 4 thread L1: the wall track round the occupied city (plans/act4-L1.md section 5).
import { describe, expect, it } from 'vitest';
import { defaultKeepOut } from '../../env/colliderKeepOut';
import { buildTileColliders, segmentToRect } from '../../env/colliders';
import { TILES } from '../../env/tiles';
import { CENTER, GATE_NAMES, MAX_STRUCTURE_RADIUS, gateBearing, polar } from '../../harrowmark/city';
import { heightAt } from '../../terrain/heightfield';
import { ASH_ROAD_POINTS, UNDERWAYS_EXIT_TRACK_POINTS } from '../../terrain/shape/waste';
import { ACT2_ROAD_STRIPS } from '../act2/act2World';
import { ACT3_ROAD_STRIPS } from '../act3/act3World';
import { ACT3_CORRIDORS, ACT3_HOLES, SUMMIT_OPEN_WHEN } from '../act3Containment';
import { ACT4_CORRIDORS, ACT4_HOLES, OCCUPIED_FLAG } from '../act4Containment';
import { ACT2_CORRIDORS } from '../act2/act2World';
import { Containment, DEAD_ROAD_CORRIDOR } from '../containment';
import { DEAD_ROAD_FULL } from '../deadRoad';
import { WALL_TRACK_HALF_WIDTH, WALL_TRACK_POINTS, distanceToWallTrack, wallTrackRadius } from './wallTrack';

const r = (x: number, z: number) => Math.hypot(x - CENTER.x, z - CENTER.z);
const P = WALL_TRACK_POINTS;

describe('the wall track', () => {
  it('is a closed loop well outside the wall, about 5 km long', () => {
    expect(P[0]).toEqual(P[P.length - 1]);
    let len = 0;
    for (let i = 1; i < P.length; i++) {
      len += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
      expect(r(P[i][0], P[i][1])).toBeGreaterThan(MAX_STRUCTURE_RADIUS + 10);
    }
    expect(len).toBeGreaterThan(4700);
    expect(len).toBeLessThan(5100);
  });

  it('keeps at least 18 m outside every gate, clear of the gate faces 15 m out', () => {
    GATE_NAMES.forEach((g, i) => {
      const face = polar(gateBearing(i), 765);
      expect(distanceToWallTrack(face.x, face.z), g).toBeGreaterThanOrEqual(18);
    });
  });

  it('never climbs steeper than 0.35 (1 m steps along the line)', () => {
    let worst = 0;
    for (let i = 1; i < P.length; i++) {
      const [ax, az] = P[i - 1];
      const [bx, bz] = P[i];
      const n = Math.ceil(Math.hypot(bx - ax, bz - az));
      for (let k = 0; k < n; k++) {
        const x0 = ax + ((bx - ax) * k) / n;
        const z0 = az + ((bz - az) * k) / n;
        const x1 = ax + ((bx - ax) * (k + 1)) / n;
        const z1 = az + ((bz - az) * (k + 1)) / n;
        worst = Math.max(worst, Math.abs(heightAt(x1, z1) - heightAt(x0, z0)) / Math.hypot(x1 - x0, z1 - z0));
      }
    }
    expect(worst).toBeLessThanOrEqual(0.35);
  });

  it("holds no env collider in its lane", () => {
    const keepOut = defaultKeepOut();
    const hits: string[] = [];
    for (const name of Object.keys(TILES)) {
      for (const b of buildTileColliders(name, TILES[name]!, keepOut).boxes) {
        if (Math.abs(r(b.cx, b.cz) - 790) > 60) continue;
        for (let i = 1; i < P.length; i++) {
          if (segmentToRect(b, P[i - 1][0], P[i - 1][1], P[i][0], P[i][1]) < WALL_TRACK_HALF_WIDTH) {
            hits.push(`${name} (${b.cx.toFixed(1)}, ${b.cz.toFixed(1)})`);
            break;
          }
        }
      }
    }
    expect(hits).toEqual([]);
  });

  it('is open all the way round in the occupied city (5 m steps)', () => {
    const flags: Record<string, boolean> = {
      'story.gate.a2': true,
      'story.d03.complete': true,
      'story.gate.a3': true,
      ...Object.fromEntries((SUMMIT_OPEN_WHEN.all ?? []).map((k) => [k, true])),
      'story.gate.a4': true,
      [OCCUPIED_FLAG]: true,
      'story.m41.complete': true,
    };
    const c = new Containment({ getFlag: (k: string) => flags[k] }, [DEAD_ROAD_CORRIDOR, ...ACT3_CORRIDORS, ...ACT4_CORRIDORS], [...ACT3_HOLES, ...ACT4_HOLES]);
    for (const d of ACT2_CORRIDORS) c.addCorridor(d);
    for (let b = 0; b < 360; b += 0.4) {
      const p = polar(b, wallTrackRadius(b));
      expect(c.isOpen(p.x, p.z), `bearing ${b}`).toBe(true);
    }
  });

  it('links every road that leaves the city: the Dead Road, the Cinder Road, the Fen Road, the Ash Road and the Underways exit', () => {
    /** A road crosses the track when it has points inside and outside the track's radius. */
    const crosses = (pts: readonly (readonly [number, number])[]) => {
      const side = pts.map(([x, z]) => Math.sign(r(x, z) - wallTrackRadius((Math.atan2(x - CENTER.x, z - CENTER.z) * 180) / Math.PI)));
      return side.includes(-1) && side.includes(1);
    };
    const gate = (name: (typeof GATE_NAMES)[number]) => {
      const p = polar(gateBearing(GATE_NAMES.indexOf(name)), 750);
      return [p.x, p.z] as const;
    };
    const road = (id: string) => [...ACT2_ROAD_STRIPS, ...ACT3_ROAD_STRIPS].find((s) => s.id === id)!.points;
    expect(crosses(DEAD_ROAD_FULL), 'dead road').toBe(true);
    expect(crosses([gate('river'), ...road('cinder-road')]), 'cinder road').toBe(true);
    expect(crosses([gate('northwest'), ...road('fen-road')]), 'fen road').toBe(true);
    expect(crosses(ASH_ROAD_POINTS), 'ash road').toBe(true);
    // The Underways exit track meets the Ash Road at its junction, outside the track.
    expect(ASH_ROAD_POINTS).toContainEqual(UNDERWAYS_EXIT_TRACK_POINTS[UNDERWAYS_EXIT_TRACK_POINTS.length - 1]);
  });
});
