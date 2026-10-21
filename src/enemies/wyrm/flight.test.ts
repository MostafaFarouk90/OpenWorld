import { describe, expect, it } from 'vitest';
import { WyrmFlight, type FlightInput } from './flight';
import { findLandingSpot } from './landing';
import { EMBER_WYRM } from './tuning';

const DT = 1 / 60;

function seq(values: number[]) {
  let i = 0;
  return () => values[i++ % values.length]!;
}

const input = (over: Partial<FlightInput> = {}): FlightInput => ({
  self: { x: 0, z: 10 },
  target: { x: 0, z: 0 },
  engaged: true,
  swinging: false,
  striking: false,
  free: true,
  ...over,
});

/** Runs the flight, answering its requests the way the overlay does (landing spots always found). */
function run(f: WyrmFlight, seconds: number, inp: FlightInput | (() => FlightInput) = input()) {
  const log: string[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    f.step(DT, typeof inp === 'function' ? inp() : inp);
    const r = f.requests;
    if (r.takeoff) log.push('takeoff');
    if (r.findLanding) f.landAt({ x: r.findLanding.x + 3, z: r.findLanding.z });
    if (r.touchdown) log.push(`touchdown:${r.touchdown.reason}`);
    f.clearRequests();
  }
  return log;
}

describe('WyrmFlight cadence', () => {
  it('perched until it notices, then takes off and climbs to the circle', () => {
    const f = new WyrmFlight({ canFly: true, rng: seq([0.5]) });
    expect(run(f, 1, input({ engaged: false }))).toEqual([]);
    expect(f.mode).toBe('perched');
    expect(run(f, 0.1)).toEqual(['takeoff']);
    expect(f.mode).toBe('takeoff');
    run(f, 1.2);
    expect(f.mode).toBe('circle');
    run(f, 1);
    expect(f.altitude).toBeGreaterThan(4);
    expect(f.airborne).toBe(true);
  });

  it('an aggro spawn (a wave closer) skips the perch', () => {
    const f = new WyrmFlight({ canFly: true, startEngaged: true, rng: seq([0.5]) });
    expect(f.mode).toBe('takeoff');
    expect(f.requests.takeoff).toBe(true);
  });

  it('indoors it never flies', () => {
    const f = new WyrmFlight({ canFly: false, startEngaged: true, rng: seq([0.5]) });
    expect(f.mode).toBe('ground');
    run(f, 30);
    expect(f.mode).toBe('ground');
    expect(f.altitude).toBe(0);
  });

  it('two strafes at 2 m, then it lands near the player and walks the ground for 8 to 10 s, then lifts again', () => {
    // rng 0.9: no dive (the first draw over 0.4 strafes).
    const f = new WyrmFlight({ canFly: true, startEngaged: true, rng: seq([0.9]) });
    f.clearRequests();
    const modes = new Set<string>();
    let minStrafeAlt = Infinity;
    let pos = { x: 0, z: 10 };
    const inp = () => input({ self: pos });
    let landed = false;
    let lifted = -1;
    let groundSince = -1;
    for (let i = 0; i < Math.round(40 / DT); i++) {
      const steer = f.step(DT, inp());
      if (steer?.goal && steer.speed > 0) {
        const dx = steer.goal.x - pos.x;
        const dz = steer.goal.z - pos.z;
        const d = Math.hypot(dx, dz);
        const s = Math.min(d, steer.speed * DT);
        if (d > 1e-6) pos = { x: pos.x + (dx / d) * s, z: pos.z + (dz / d) * s };
      }
      modes.add(f.mode);
      if (f.mode === 'strafe' && i % 10 === 0) minStrafeAlt = Math.min(minStrafeAlt, f.altitude);
      const r = f.requests;
      if (r.findLanding) f.landAt(r.findLanding);
      if (r.touchdown) {
        landed = true;
        groundSince = i * DT;
      }
      if (r.takeoff && landed && lifted < 0) lifted = i * DT;
      f.clearRequests();
    }
    expect(modes.has('strafe')).toBe(true);
    expect(modes.has('landing')).toBe(true);
    expect(minStrafeAlt).toBeLessThan(3);
    expect(landed).toBe(true);
    expect(lifted - groundSince).toBeGreaterThanOrEqual(8 - 1e-6);
    expect(lifted - groundSince).toBeLessThanOrEqual(10 + 0.05);
  });

  it('the dive is offered only in the circle, after its wait; air moves never on the ground, ground moves never in the air', () => {
    const f = new WyrmFlight({ canFly: true, startEngaged: true, rng: seq([0.1]) });
    expect(f.allows('ground')).toBe(false);
    expect(f.allows('air')).toBe(false);
    run(f, 0.9);
    expect(f.mode).toBe('circle');
    expect(f.canDive).toBe(false);
    run(f, EMBER_WYRM.circleSeconds[1]);
    expect(f.canDive).toBe(true);
    expect(f.allows('air')).toBe(true);
    expect(f.allows('ground')).toBe(false);
    f.diveStarted();
    expect(f.mode).toBe('dive');
    // Telegraph, then the stoop, then the swing ends on the ground.
    run(f, 0.9, input({ swinging: true }));
    expect(f.altitude).toBeGreaterThan(3);
    run(f, 0.5, input({ swinging: true, striking: true }));
    expect(f.altitude).toBeLessThan(0.5);
    expect(run(f, DT, input())).toEqual(['touchdown:dive']);
    expect(f.mode).toBe('ground');
    expect(f.allows('ground')).toBe(true);
    expect(f.allows('air')).toBe(false);
  });

  it('a dive the brain never takes ends in a landing', () => {
    const f = new WyrmFlight({ canFly: true, startEngaged: true, rng: seq([0.1]) });
    const log = run(f, 0.9 + 4 + 3.2 + 1.1);
    expect(log).toContain('touchdown:landing');
    expect(f.mode).toBe('ground');
  });
});

describe('WyrmFlight falls', () => {
  for (const mode of ['takeoff', 'circle', 'strafe', 'landing'] as const) {
    it(`a wing break during ${mode} falls in 0.5 s and grounds it for good`, () => {
      const f = new WyrmFlight({ canFly: true, startEngaged: true, rng: seq([0.9]) });
      f.clearRequests();
      let guard = 0;
      while (f.mode !== mode && guard++ < 6000) {
        f.step(DT, input());
        const r = f.requests;
        if (r.findLanding) f.landAt(r.findLanding);
        f.clearRequests();
      }
      expect(f.mode).toBe(mode);
      expect(f.fall('wing')).toBe(true);
      expect(f.mode).toBe('falling');
      expect(f.airborne).toBe(true);
      expect(f.flying).toBe(false);
      const log = run(f, EMBER_WYRM.fallSeconds + DT);
      expect(log[0]).toBe('touchdown:fall');
      expect(f.altitude).toBe(0);
      expect(f.downed).toBe(true);
      expect(run(f, 30)).toEqual([]);
      expect(f.mode).toBe('ground');
    });
  }

  it('on the ground a break is the brain\'s (no fall); a stun in the air falls but does not ground it for good', () => {
    const f = new WyrmFlight({ canFly: false, rng: seq([0.5]) });
    expect(f.fall('wing')).toBe(false);
    const g = new WyrmFlight({ canFly: true, startEngaged: true, rng: seq([0.9]) });
    run(g, 1.5);
    expect(g.fall('stun')).toBe(true);
    run(g, 0.6);
    expect(g.mode).toBe('ground');
    expect(g.downed).toBe(false);
    // A second fall request while falling is refused.
    const h = new WyrmFlight({ canFly: true, startEngaged: true, rng: seq([0.9]) });
    run(h, 1.5);
    h.fall('wing');
    expect(h.fall('wing')).toBe(false);
  });

  it('no landing spot keeps it circling and retries a second later', () => {
    const f = new WyrmFlight({ canFly: true, startEngaged: true, rng: seq([0.9]) });
    let asks = 0;
    for (let i = 0; i < Math.round(3 / DT); i++) {
      f.step(DT, input({ engaged: false }));
      if (f.requests.findLanding) {
        asks++;
        f.landingBlocked();
      }
      f.clearRequests();
    }
    expect(f.mode).toBe('circle');
    expect(asks).toBeGreaterThanOrEqual(2);
    expect(asks).toBeLessThanOrEqual(3);
  });

  it('forceGround (dormancy) puts it down at once and asks for a touchdown', () => {
    const f = new WyrmFlight({ canFly: true, startEngaged: true, rng: seq([0.9]) });
    run(f, 2);
    f.forceGround();
    expect(f.altitude).toBe(0);
    expect(f.mode).toBe('perched');
    expect(f.requests.touchdown).not.toBeNull();
  });
});

describe('findLandingSpot', () => {
  const flat = { heightAt: () => 0, raycast: () => null };

  it('takes the point itself on open flat ground', () => {
    expect(findLandingSpot({ x: 3, z: 4 }, flat)).toEqual({ x: 3, y: 0, z: 4 });
  });

  it('a 20 m shelf beside a drop: lands on the shelf, never in the hold', () => {
    // Shelf for x < 2, a 20 m drop beyond.
    const heightAt = (x: number) => (x < 2 ? 20 : 0);
    const spot = findLandingSpot({ x: 0, z: 0 }, { heightAt, raycast: () => null });
    expect(spot).not.toBeNull();
    expect(spot!.y).toBe(20);
  });

  it('skips a roof over the point and a wall beside it', () => {
    // Something 4 m up over x in [-1, 1] (a roof); a wall feeler hit near x = 2.5.
    const raycast = (o: { x: number; y: number }, d: { x: number; y: number }) => {
      if (d.y < 0 && Math.abs(o.x) <= 1) return { distance: 26 };
      if (d.y === 0 && o.x > 1 && o.x < 4 && d.x > 0.5) return { distance: 0.5 };
      return null;
    };
    const spot = findLandingSpot({ x: 0, z: 0 }, { heightAt: () => 0, raycast });
    expect(spot).not.toBeNull();
    expect(Math.abs(spot!.x) > 1 || Math.abs(spot!.z) > 0).toBe(true);
  });

  it('steep ground everywhere: null', () => {
    expect(findLandingSpot({ x: 0, z: 0 }, { heightAt: (x) => x * 3, raycast: () => null })).toBeNull();
    expect(findLandingSpot({ x: Number.NaN, z: 0 }, flat)).toBeNull();
  });
});
