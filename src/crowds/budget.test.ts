// The crowd's per-frame cost (plan section 6, as amended by the review): wall-clock numbers in Node, and on a shared CI
// runner even their ratios, are noise, so scaling is pinned on a deterministic work count; wall clock only gets a loose
// tripwire for accidents. The real frame cost is measured in the browser (tools/measure-crowds.mjs).
import { describe, expect, it } from 'vitest';
import { CrowdSim } from './CrowdSim';
import { CrowdView } from './CrowdView';
import { cityWorld } from './crowdTestKit';
import { LANE_WALKERS } from './tuning';
import { densityFor } from './density';

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

describe('crowd budget', () => {
  it('scales linearly: double the walkers does at most 2.5 times the work (a quadratic would be 4), steady and while density changes', () => {
    const work = (scale: number, flip: boolean): number => {
      const per: Record<string, number> = {};
      for (const [k, v] of Object.entries(LANE_WALKERS)) per[k] = Math.round(v * scale);
      const sim = new CrowdSim({ lanes: world.lanes, clusters: world.clusters, laneWalkers: per });
      sim.reseed(player);
      const before = sim.ops;
      for (let i = 0; i < 600; i++) {
        // Flipping density every second exercises the surplus and spawn paths, where a quadratic would hide.
        if (flip && i % 60 === 0) sim.setDensity(densityFor({ gate: i % 120 ? 'guarded' : 'open', stealthActive: false, chaseActive: (i / 60) % 4 === 3, quality: 'high' }));
        sim.update(DT, player);
      }
      return sim.ops - before;
    };
    for (const flip of [false, true]) expect(work(2, flip) / work(1, flip), flip ? 'changing' : 'steady').toBeLessThan(2.5);
  });

  it('stays under a loose 5 ms tripwire per frame at the full count', () => {
    expect(costPerFrame(1, 600)).toBeLessThan(5);
  });
});
