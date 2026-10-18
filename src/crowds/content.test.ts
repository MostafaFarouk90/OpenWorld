// Content checks of the crowd against thread 17's real layout: lanes clear of buildings and keep-outs, groups clear of
// everything, and M06's stealth ground touched only where the guarded state empties the crowd.
import { describe, expect, it } from 'vitest';
import { CROWD_LANES } from '../harrowmark/harrowmark.layout';
import { blockedInterval } from './lanes';
import { clearance, cityWorld } from './crowdTestKit';
import { CROWD_CLUSTERS } from './clusters';
import { CROWD_TUNING, LANE_WALKERS } from './tuning';
import { densityFor, laneRange } from './density';

const w = cityWorld();
const R = CROWD_TUNING.bodyRadius;

describe('crowd content against the Harrowmark layout', () => {
  it('names a walker count for every one of the ten lanes', () => {
    expect(CROWD_LANES).toHaveLength(10);
    for (const l of w.lanes) expect(LANE_WALKERS[l.name], l.name).toBeGreaterThan(0);
  });

  it('has a clear path along every lane (a lane that clips a building carries no walkers and fails here)', () => {
    for (const lane of w.lanes) expect(lane.blocked, `${lane.name} blocked at samples`).toEqual([]);
  });

  it('keeps every free lateral slot clear of structures and keep-outs by the body radius', () => {
    const worst: string[] = [];
    for (const lane of w.lanes) {
      for (const s of lane.samples) {
        for (const [lo, hi] of s.free) {
          for (const l of [lo, (lo + hi) / 2, hi]) {
            const x = s.x + s.nx * l;
            const z = s.z + s.nz * l;
            for (const o of w.statics) {
              const c = clearance(o, x, z);
              if (c <= R - 0.25) worst.push(`${lane.name} (${x.toFixed(1)}, ${z.toFixed(1)}) vs ${o.id}: ${c.toFixed(2)}`);
            }
          }
        }
      }
    }
    expect(worst).toEqual([]);
  });

  it('touches the M06 stealth ground only on lane stretches the guarded state empties', () => {
    const d = densityFor({ gate: 'guarded', stealthActive: false, chaseActive: false, quality: 'high' });
    for (const lane of w.lanes) {
      const range = laneRange(lane.name, lane.length, d);
      lane.samples.forEach((s, k) => {
        const arc = lane.loop ? (k * lane.length) / lane.samples.length : (k * lane.length) / (lane.samples.length - 1);
        if (!range || arc < range[0] || arc > range[1]) return;
        const lim = lane.halfWidth - CROWD_TUNING.laneEdgeMargin;
        for (const o of w.guarded) {
          const cut = blockedInterval(o, s.x, s.z, s.nx, s.nz, R);
          if (cut) expect(cut[1] < -lim || cut[0] > lim, `${lane.name} at ${arc.toFixed(0)} m vs ${o.id}`).toBe(true);
        }
      });
    }
  });

  it('stands every idle group clear of structures, keep-outs, lanes and the guards nudge room', () => {
    expect(CROWD_CLUSTERS.reduce((n, c) => n + c.size, 0)).toBe(50);
    for (const c of w.clusters) {
      expect(c.spec.size).toBeGreaterThanOrEqual(3);
      expect(c.spec.size).toBeLessThanOrEqual(5);
      for (const s of c.spots) {
        for (const o of w.statics) expect(clearance(o, s.x, s.z), `${c.spec.id} vs ${o.id}`).toBeGreaterThan(R + CROWD_TUNING.idle.nudgeMax);
        for (const lane of w.lanes) {
          for (const ls of lane.samples) {
            const d = Math.hypot(ls.x - s.x, ls.z - s.z);
            expect(d, `${c.spec.id} stands in ${lane.name}`).toBeGreaterThan(lane.halfWidth + R + 0.5);
          }
        }
        for (const a of w.withTag('patrol')) expect(Math.hypot(a.position.x - s.x, a.position.z - s.z), `${c.spec.id} vs ${a.id}`).toBeGreaterThan(3);
      }
    }
  });
});
