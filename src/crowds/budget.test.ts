// The crowd's per-frame cost (plan section 6, as amended by the review): wall-clock numbers in Node are noise, so this pins
// scaling (no O(n^2)), a loose tripwire for accidents, and pooling. The real frame cost is measured in the browser.
import { describe, expect, it } from 'vitest';
import { CrowdSim } from './CrowdSim';
import { CrowdView } from './CrowdView';
import { cityWorld } from './crowdTestKit';
import { LANE_WALKERS } from './tuning';

const DT = 1 / 60;
const world = cityWorld();
const player = { x: 8490, y: 20, z: 1700 };

function costPerFrame(scale: number, frames: number): number {
  const per: Record<string, number> = {};
  for (const [k, v] of Object.entries(LANE_WALKERS)) per[k] = Math.round(v * scale);
  const sim = new CrowdSim({ lanes: world.lanes, clusters: world.clusters, laneWalkers: per });
  const view = new CrowdView(sim.capacity + sim.idle.length);
  sim.reseed(player);
  const eye = { x: player.x, y: 21.6, z: player.z };
  for (let i = 0; i < 60; i++) {
    sim.update(DT, player);
    view.write(sim, eye, i * DT);
  }
  const t0 = performance.now();
  for (let i = 0; i < frames; i++) {
    sim.update(DT, player);
    view.write(sim, eye, i * DT);
  }
  const ms = (performance.now() - t0) / frames;
  view.dispose();
  return ms;
}

const median = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];

describe('crowd budget', () => {
  it('scales linearly: double the walkers costs at most 2.5 times as much', () => {
    // Interleaved after a warm-up pair, so JIT tiering does not favour whichever size runs last.
    costPerFrame(1, 200);
    costPerFrame(2, 200);
    const half: number[] = [];
    const double: number[] = [];
    for (let i = 0; i < 4; i++) {
      half.push(costPerFrame(1, 300));
      double.push(costPerFrame(2, 300));
    }
    expect(median(double) / median(half)).toBeLessThan(2.5);
  });

  it('stays under a loose 5 ms tripwire per frame at the full count', () => {
    expect(costPerFrame(1, 600)).toBeLessThan(5);
  });
});
