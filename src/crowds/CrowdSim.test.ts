import { describe, expect, it } from 'vitest';
import { densityFor } from './density';
import { clearance, citySim } from './crowdTestKit';
import { CROWD_TUNING } from './tuning';
import type { CrowdSim, PlayerPos } from './CrowdSim';

const DT = 1 / 60;
const full = densityFor({ gate: 'open', stealthActive: false, chaseActive: false, quality: 'high' });
const guarded = densityFor({ gate: 'guarded', stealthActive: false, chaseActive: false, quality: 'high' });
const chase = densityFor({ gate: 'open', stealthActive: false, chaseActive: true, quality: 'high' });
const FAR: PlayerPos = { x: 0, y: 0, z: 0 };

const live = (sim: CrowdSim) => sim.walkers.filter((w) => w.active);
const liveIdle = (sim: CrowdSim) => sim.idle.filter((m) => m.active);
const run = (sim: CrowdSim, seconds: number, player: PlayerPos | null, each?: () => void) => {
  for (let t = 0; t < seconds; t += DT) {
    sim.update(DT, player);
    each?.();
  }
};

describe('crowd simulation', () => {
  it('populates 150 walkers and 50 idle townsfolk at full density', () => {
    const { sim } = citySim();
    sim.reseed(FAR);
    expect(live(sim)).toHaveLength(147);
    expect(liveIdle(sim)).toHaveLength(50);
    expect(sim.capacity).toBe(147);
  });

  it('keeps to the right of its own walking direction (+Z north, +X east)', () => {
    const { sim, lanes } = citySim();
    sim.reseed(FAR);
    const north = lanes.findIndex((l) => l.name === 'main-street-north'); // points run south to north at x 8490
    run(sim, 1, FAR);
    const walkers = live(sim).filter((w) => w.lane === north && w.walking);
    expect(walkers.some((w) => w.dir === 1) && walkers.some((w) => w.dir === -1)).toBe(true);
    for (const w of walkers) {
      if (w.dir === 1) expect(w.x).toBeGreaterThan(8490); // heading north: right is east
      else expect(w.x).toBeLessThan(8490);
      // Facing: yaw 0 faces -Z, so a north-bound walker has yaw +-PI.
      if (w.dir === 1) expect(Math.abs(Math.abs(w.yaw) - Math.PI)).toBeLessThan(1e-6);
    }
  });

  it('never leaves its lane band and never enters a keep-out or a building in two minutes with the player walking the main street', () => {
    const { sim, lanes, statics } = citySim();
    sim.reseed(FAR);
    const player: PlayerPos = { x: 8490, y: 20, z: 1300 };
    let worst = Infinity;
    let worstWhat = '';
    let outOfBand = 0;
    run(sim, 120, player, () => {
      player.z = 1300 + ((player.z - 1300 + 1.5 * DT) % 1200);
      for (const w of sim.walkers) {
        if (!w.active) continue;
        if (Math.abs(w.l) > lanes[w.lane].halfWidth - CROWD_TUNING.laneEdgeMargin + 1e-6) outOfBand++;
        for (const o of statics) {
          if (Math.abs(o.x - w.x) > 40 || Math.abs(o.z - w.z) > 40) continue;
          const c = clearance(o, w.x, w.z);
          if (c < worst) {
            worst = c;
            worstWhat = `${lanes[w.lane].name} vs ${o.id}`;
          }
        }
      }
    });
    expect(outOfBand).toBe(0);
    expect(worst, worstWhat).toBeGreaterThan(0.1);
  });

  it('slows, steps aside and stops for a player standing in the lane, never overlapping', () => {
    const { sim, lanes } = citySim();
    sim.reseed(FAR);
    const north = lanes.findIndex((l) => l.name === 'main-street-north');
    // The player stands on the north-bound side of the street; watch the walkers coming at them.
    const player: PlayerPos = { x: 8493, y: 20, z: 2000 };
    let nearest = Infinity;
    let encounters = 0;
    run(sim, 90, player, () => {
      for (const w of sim.walkers) {
        if (!w.active || w.lane !== north) continue;
        const d = Math.hypot(w.x - player.x, w.z - player.z);
        nearest = Math.min(nearest, d);
        if (d < 2.5) encounters++;
      }
    });
    expect(nearest).toBeGreaterThan(0.4 + CROWD_TUNING.bodyRadius);
    expect(encounters).toBeGreaterThan(0);
  });

  it('ignores a player on a roof above the street', () => {
    const { sim, lanes } = citySim();
    sim.reseed(FAR);
    const north = lanes.findIndex((l) => l.name === 'main-street-north');
    const onRoof: PlayerPos = { x: 8493, y: 27, z: 2000 };
    const w = live(sim).find((x) => x.lane === north)!;
    w.s = 2000 - 1770 - 1.5;
    w.dir = 1;
    w.l = 3;
    w.pause = 0;
    const s0 = w.s;
    run(sim, 0.5, onRoof);
    expect(w.s).toBeGreaterThan(s0 + 0.4);
  });

  it('nudges idle townsfolk out of the player way and lets them drift home', () => {
    const { sim } = citySim();
    sim.reseed(FAR);
    const m = liveIdle(sim)[0];
    const player: PlayerPos = { x: m.homeX + 0.3, y: m.y, z: m.homeZ };
    run(sim, 2, player);
    expect(Math.hypot(m.x - player.x, m.z - player.z)).toBeGreaterThan(0.9);
    expect(Math.hypot(m.ox, m.oz)).toBeLessThanOrEqual(CROWD_TUNING.idle.nudgeMax + 1e-9);
    run(sim, 6, FAR);
    expect(Math.hypot(m.ox, m.oz)).toBeLessThan(1e-6);
  });

  it('empties the streets within the grace when the chase starts: far walkers at once, near ones after 3 s', () => {
    const { sim } = citySim();
    const player: PlayerPos = { x: 8490, y: 20, z: 2000 };
    sim.reseed(player);
    run(sim, 5, player);
    const nearBefore = live(sim).filter((w) => Math.hypot(w.x - player.x, w.z - player.z) <= 30).length;
    sim.setDensity(chase);
    sim.update(DT, player);
    expect(live(sim).length).toBeLessThanOrEqual(nearBefore);
    run(sim, CROWD_TUNING.leaveGrace + 0.1, player);
    expect(live(sim)).toHaveLength(0);
    expect(liveIdle(sim)).toHaveLength(0);
  });

  it('spawns new walkers only beyond 30 m of the player when density rises', () => {
    const { sim } = citySim();
    const player: PlayerPos = { x: 8490, y: 20, z: 2000 };
    sim.setDensity(chase);
    sim.reseed(player);
    expect(live(sim)).toHaveLength(0);
    sim.setDensity(full);
    for (let i = 0; i < 120; i++) {
      const before = new Set(live(sim));
      sim.update(DT, player);
      for (const w of live(sim)) if (!before.has(w)) expect(Math.hypot(w.x - player.x, w.z - player.z)).toBeGreaterThan(30);
    }
    expect(live(sim).length).toBe(147);
  });

  it('keeps M06 stealth ground empty while the gate is guarded', () => {
    const { sim } = citySim();
    sim.setDensity(guarded);
    sim.reseed(FAR);
    run(sim, 60, FAR, () => {
      for (const f of [...live(sim), ...liveIdle(sim)]) {
        const inBox = f.x > 8325 && f.x < 8675 && f.z > 1190 && f.z < 1360;
        if (inBox) throw new Error(`figure in the M06 box at ${f.x.toFixed(1)}, ${f.z.toFixed(1)}`);
      }
    });
    expect(live(sim).length).toBeGreaterThan(100);
  });

  it('moves walkers out of the stealth box when the gate turns guarded mid-visit', () => {
    const { sim } = citySim();
    sim.reseed(FAR);
    sim.setDensity(guarded);
    run(sim, CROWD_TUNING.leaveGrace + 0.2, FAR);
    for (const w of live(sim)) expect(w.x > 8325 && w.x < 8675 && w.z > 1190 && w.z < 1360).toBe(false);
  });

  it('re-seeds to the same crowd on a load, and keeps 30 m clear around a player who loads mid-street', () => {
    const a = citySim().sim;
    const b = citySim().sim;
    const player: PlayerPos = { x: 8490, y: 20, z: 1900 };
    a.reseed(player);
    run(a, 10, player);
    a.reseed(player);
    b.reseed(player);
    const pos = (s: CrowdSim) => s.walkers.map((w) => (w.active ? `${w.lane}:${w.s.toFixed(4)}:${w.l.toFixed(4)}` : '-'));
    expect(pos(a)).toEqual(pos(b));
    for (const w of live(a)) expect(Math.hypot(w.x - player.x, w.z - player.z)).toBeGreaterThanOrEqual(30 - 1e-6);
  });

  it('clears the player on wake (a teleport into the street) by moving walkers along their lane', () => {
    const { sim } = citySim();
    sim.reseed(FAR);
    const w = live(sim)[0];
    const player: PlayerPos = { x: w.x, y: w.y, z: w.z };
    sim.clearPlayer(player);
    for (const x of live(sim)) expect(Math.hypot(x.x - player.x, x.z - player.z)).toBeGreaterThanOrEqual(30 - 1e-6);
  });

  it('sleeps far from every lane, also at the closed gate it stays awake', () => {
    const { sim } = citySim();
    expect(sim.farFrom({ x: 8500, y: 20, z: 800 })).toBe(true);
    expect(sim.farFrom({ x: 0, y: 0, z: 0 })).toBe(true);
    expect(sim.farFrom(null)).toBe(true);
    expect(sim.farFrom({ x: 8500, y: 20, z: 1230 })).toBe(false);
  });

  it('allocates nothing per frame and does one player test per live figure', () => {
    const { sim } = citySim();
    const player: PlayerPos = { x: 8490, y: 20, z: 2000 };
    sim.reseed(player);
    run(sim, 10, player);
    expect(sim.allocations).toBe(0);
    expect(sim.walkers.length).toBe(147);
    sim.update(DT, player);
    expect(sim.checks).toBe(live(sim).length + liveIdle(sim).length);
  });
});
