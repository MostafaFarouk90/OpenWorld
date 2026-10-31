import { describe, expect, it } from 'vitest';
import { HAWK } from '../tuning';
import { HawkFlight, type HawkInput } from './flight';

const DT = 1 / 60;
const input = (over: Partial<HawkInput> = {}): HawkInput => ({
  self: { x: 0, z: 0 },
  target: { x: 0, z: -10 },
  engaged: true,
  swinging: false,
  striking: false,
  free: true,
  returning: false,
  ...over,
});
const run = (f: HawkFlight, seconds: number, i: HawkInput) => {
  for (let k = 0; k < Math.round(seconds / DT); k++) f.step(DT, i);
};
const rng = () => 0.5;

/** A flight through soar into the stoop's hover, the dive and the skim. */
function toLow(f: HawkFlight, hit: boolean) {
  run(f, HAWK.stoopEvery[1] + 0.1, input());
  expect(f.canStoop).toBe(true);
  f.stoopStarted();
  run(f, 0.8, input({ swinging: true }));
  run(f, 0.4, input({ swinging: true, striking: true }));
  if (hit) f.stoopLanded();
  f.step(DT, input());
  expect(f.mode).toBe('low');
}

describe('HawkFlight', () => {
  it('starts soaring (asking to take off) without a nest, perched with one', () => {
    const a = new HawkFlight({ home: { x: 0, z: 0 }, startAirborne: false, rng });
    expect(a.mode).toBe('soar');
    expect(a.requests.takeoff).toBe(true);
    const b = new HawkFlight({ home: { x: 0, z: 0 }, nest: { x: 0, z: 0 }, startAirborne: false, rng });
    expect(b.mode).toBe('perched');
    expect(b.grounded).toBe(true);
  });

  it('the hover eases to hover height, the dive drops to skimming height, then it skims and climbs back', () => {
    const f = new HawkFlight({ home: { x: 0, z: 0 }, startAirborne: true, rng });
    toLow(f, false);
    expect(f.altitude).toBeCloseTo(HAWK.lowAltitude, 1);
    run(f, HAWK.lowSeconds + 0.05, input());
    expect(f.mode).toBe('climb');
    run(f, HAWK.climbSeconds + 0.05, input());
    expect(f.mode).toBe('soar');
    expect(f.canStoop).toBe(false); // a fresh wait before the next stoop
  });

  it('the rake is offered only skimming after a stoop that missed', () => {
    const miss = new HawkFlight({ home: { x: 0, z: 0 }, startAirborne: true, rng });
    toLow(miss, false);
    expect(miss.canRake).toBe(true);
    const hit = new HawkFlight({ home: { x: 0, z: 0 }, startAirborne: true, rng });
    toLow(hit, true);
    expect(hit.canRake).toBe(false);
  });

  it('a hover called off climbs without diving', () => {
    const f = new HawkFlight({ home: { x: 0, z: 0 }, startAirborne: true, rng });
    run(f, HAWK.stoopEvery[1] + 0.1, input());
    f.stoopStarted();
    run(f, 0.3, input({ swinging: true }));
    f.abortStoop();
    expect(f.mode).toBe('climb');
    expect(f.stooping).toBe(false);
  });

  it('knocked down it falls for 0.5 s, asks for a fall touchdown, lies grounded until free, then takes off', () => {
    const f = new HawkFlight({ home: { x: 0, z: 0 }, startAirborne: true, rng });
    f.clearRequests();
    expect(f.knockDown()).toBe(true);
    expect(f.knockDown()).toBe(false);
    run(f, HAWK.fallSeconds + 0.05, input({ free: false }));
    expect(f.mode).toBe('grounded');
    expect(f.requests.touchdown).toEqual({ reason: 'fall', at: null });
    f.clearRequests();
    run(f, 2, input({ free: false }));
    expect(f.mode).toBe('grounded');
    run(f, 0.5, input());
    expect(f.mode).toBe('takeoff');
    expect(f.requests.takeoff).toBe(true);
  });

  it('grounded or perched it cannot be knocked down again (the brain handles a ground poise break)', () => {
    const f = new HawkFlight({ home: { x: 0, z: 0 }, nest: { x: 0, z: 0 }, startAirborne: false, rng });
    expect(f.knockDown()).toBe(false);
  });

  it('a nest hawk with nothing to fight flies home and perches', () => {
    const f = new HawkFlight({ home: { x: 0, z: 0 }, nest: { x: 20, z: 0 }, startAirborne: true, rng });
    f.clearRequests();
    let self = { x: 0, z: 0 };
    for (let k = 0; k < 600 && f.mode !== 'perched'; k++) {
      const s = f.step(DT, input({ engaged: false, target: null, self }));
      if (s?.goal) {
        const dx = s.goal.x - self.x;
        const dz = s.goal.z - self.z;
        const d = Math.hypot(dx, dz) || 1;
        const step = Math.min(d, s.speed * DT);
        self = { x: self.x + (dx / d) * step, z: self.z + (dz / d) * step };
      }
    }
    expect(f.mode).toBe('perched');
    expect(f.requests.touchdown).toEqual({ reason: 'perch', at: { x: 20, z: 0 } });
  });

  it('ignores a bad dt', () => {
    const f = new HawkFlight({ home: { x: 0, z: 0 }, startAirborne: true, rng });
    expect(f.step(NaN, input())).toBeNull();
    expect(f.step(0, input())).toBeNull();
  });
});
