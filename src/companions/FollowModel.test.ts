import { describe, expect, it } from 'vitest';
import { FollowModel, Trail, behind, yawToward, type FollowInput, type Vec3 } from './FollowModel';
import { COMPANION_TUNING } from './tuning';

const DT = 1 / 60;
const flat = () => 0;
const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

function input(player: Vec3, over: Partial<FollowInput> = {}): FollowInput {
  return { dt: DT, player, playerYaw: 0, groundAt: flat, ...over };
}

function run(m: FollowModel, player: Vec3, steps: number, over: Partial<FollowInput> = {}) {
  let last = m.step(input(player, over));
  for (let i = 1; i < steps; i++) last = m.step(input(player, over));
  return last;
}

describe('Trail', () => {
  it('skips points closer than the spacing and keeps those at or beyond it', () => {
    const t = new Trail(96, 0.5);
    t.push(v(0, 0, 0));
    t.push(v(0.3, 0, 0));
    t.push(v(0.49, 0, 0));
    expect(t.length).toBe(1);
    t.push(v(0.5, 0, 0));
    expect(t.length).toBe(2);
    expect(t.newest()).toEqual(v(0.5, 0, 0));
  });
  it('measures spacing on the ground plane only', () => {
    const t = new Trail(96, 0.5);
    t.push(v(0, 0, 0));
    t.push(v(0, 5, 0));
    expect(t.length).toBe(1);
  });
  it('caps at 96 points and drops the oldest', () => {
    const t = new Trail(COMPANION_TUNING.trailPoints, COMPANION_TUNING.trailSpacing);
    for (let i = 0; i < 120; i++) t.push(v(i, 0, 0));
    expect(t.length).toBe(96);
    expect(t.points()[0].x).toBe(24);
    expect(t.newest()?.x).toBe(119);
  });
  it('ignores non-finite points and copies what it stores', () => {
    const t = new Trail(10, 0.5);
    t.push(v(NaN, 0, 0));
    t.push(v(0, Infinity, 0));
    expect(t.length).toBe(0);
    const p = v(1, 2, 3);
    t.push(p);
    p.x = 99;
    expect(t.newest()).toEqual(v(1, 2, 3));
  });
  it('clear empties it', () => {
    const t = new Trail(10, 0.5);
    t.push(v(0, 0, 0));
    t.clear();
    expect(t.length).toBe(0);
    expect(t.newest()).toBeUndefined();
  });

  describe('pursue', () => {
    const line = () => {
      const t = new Trail(96, 0.5);
      for (let i = 0; i <= 4; i++) t.push(v(0, i, -i));
      return t;
    };
    it('looks ahead along the polyline from the nearest point, interpolating', () => {
      const p = line().pursue({ x: 0, z: -0.1 }, 1.5, 8)!;
      expect(p.x).toBeCloseTo(0);
      expect(p.z).toBeCloseTo(-1.5);
      expect(p.y).toBeCloseTo(1.5);
    });
    it('follows corners rather than cutting them', () => {
      const t = new Trail(96, 0.5);
      t.push(v(0, 0, 0));
      t.push(v(2, 0, 0));
      t.push(v(2, 0, -2));
      const p = t.pursue({ x: 0, z: 0 }, 3, 8)!;
      expect(p.x).toBeCloseTo(2);
      expect(p.z).toBeCloseTo(-1);
    });
    it('returns the newest point when the look-ahead runs past the end', () => {
      expect(line().pursue({ x: 0, z: -3 }, 10, 8)).toEqual(v(0, 4, -4));
    });
    it('returns null when more than 8 m from every point, and null for an empty trail', () => {
      expect(line().pursue({ x: 20, z: 0 }, 1.5, 8)).toBeNull();
      expect(new Trail(10, 0.5).pursue({ x: 0, z: 0 }, 1.5, 8)).toBeNull();
    });
    it('is not lost just inside the lost distance', () => {
      expect(line().pursue({ x: 7.9, z: 0 }, 1.5, 8)).not.toBeNull();
      expect(line().pursue({ x: 8.5, z: -4 }, 1.5, 8)).toBeNull();
    });
    it('breaks distance ties towards the newer point', () => {
      const t = new Trail(96, 0.5);
      t.push(v(-1, 0, 0));
      t.push(v(1, 0, 0));
      // equidistant from both: starts at the newer point, which is the end of the trail
      expect(t.pursue({ x: 0, z: 0 }, 1, 8)).toEqual(v(1, 0, 0));
    });
  });
});

describe('geometry in the engine convention', () => {
  it('yawToward faces -Z at 0, -X at pi/2, +X at -pi/2, +Z at pi', () => {
    expect(yawToward(0, -1)).toBeCloseTo(0);
    expect(yawToward(-1, 0)).toBeCloseTo(Math.PI / 2);
    expect(yawToward(1, 0)).toBeCloseTo(-Math.PI / 2);
    expect(Math.abs(yawToward(0, 1))).toBeCloseTo(Math.PI);
  });
  it('yawToward is consistent with the forward vector (-sin yaw, -cos yaw)', () => {
    for (const yaw of [0, 0.7, -1.9, 3]) {
      expect(yawToward(-Math.sin(yaw), -Math.cos(yaw))).toBeCloseTo(yaw);
    }
  });
  it('behind yaw 0 is +Z, right is +X', () => {
    const p = behind(v(1, 0, 2), 0, 3);
    expect(p.x).toBeCloseTo(1);
    expect(p.z).toBeCloseTo(5);
    const r = behind(v(0, 0, 0), 0, 0, 1.2);
    expect(r.x).toBeCloseTo(1.2);
    expect(r.z).toBeCloseTo(0);
  });
  it('behind rotates with the yaw: facing -X puts it at +X; facing +X puts the right side at +Z', () => {
    const a = behind(v(0, 0, 0), Math.PI / 2, 3);
    expect(a.x).toBeCloseTo(3);
    expect(a.z).toBeCloseTo(0);
    const b = behind(v(0, 0, 0), -Math.PI / 2, 0, 1);
    expect(b.x).toBeCloseTo(0);
    expect(b.z).toBeCloseTo(1);
  });
  it('a negative side is the left', () => {
    expect(behind(v(0, 0, 0), 0, 0, -2).x).toBeCloseTo(-2);
  });
});

describe('FollowModel gait and speed', () => {
  const at = (z: number) => new FollowModel(v(0, 0, z), 0);
  /** Runs a player moving along -Z at `speed` for `seconds`; returns the model, the player z and every step. */
  function chase(start: number, speed: number, seconds: number) {
    const m = at(start);
    let z = 0;
    const steps: ReturnType<FollowModel['step']>[] = [];
    for (let i = 0; i < seconds * 60; i++) {
      z -= speed * DT;
      steps.push(m.step(input(v(0, 0, z))));
    }
    return { m, z, steps };
  }

  it('gait follows his speed: walk for a short gap, sprint for a long one (starting from idle)', () => {
    expect(run(at(4.5), v(0, 0, 0), 1).gait).toBe('walk');
    expect(run(at(20), v(0, 0, 0), 1).gait).toBe('sprint');
  });
  it('sprint speed is 1.2 x 7.5 = 9 m/s and caps his step', () => {
    expect(COMPANION_TUNING.sprintSpeed).toBeCloseTo(9);
    const m = at(30);
    m.step(input(v(0, 0, 0)));
    expect(30 - m.pos.z).toBeCloseTo(9 * DT, 5);
  });
  it('keeps up with a player sprinting at 7.5 m/s: closes in, matches speed, never teleports', () => {
    const { m, z, steps } = chase(12, 7.5, 20);
    expect(steps.every((s) => s.teleport === null)).toBe(true);
    expect(Math.abs(m.pos.z - z)).toBeLessThan(5);
    // Once caught up the gait settles instead of flipping every few ticks.
    const late = steps.slice(-5 * 60).map((s) => s.gait);
    const changes = late.filter((g, i) => i > 0 && g !== late[i - 1]).length;
    expect(changes).toBeLessThanOrEqual(2);
  });
  it('keeps up with walking (4.5) and running (6) players without teleports', () => {
    for (const speed of [4.5, 6]) {
      const { m, z, steps } = chase(8, speed, 15);
      expect(steps.every((s) => s.teleport === null)).toBe(true);
      expect(Math.abs(m.pos.z - z)).toBeLessThan(5);
    }
  });
  it('a player slower than walking (a flask at half speed) gives no idle/walk flicker', () => {
    const { steps } = chase(3, 2.25, 8);
    const g = steps.slice(60).map((s) => s.gait);
    const changes = g.filter((x, i) => i > 0 && x !== g[i - 1]).length;
    expect(changes).toBeLessThan(10);
  });
  it('a player who stops: he arrives, idles, and stays idle while the slot is within the resume margin', () => {
    const m = at(10);
    let last = run(m, v(0, 0, 0), 5 * 60);
    expect(last.gait).toBe('idle');
    // A small, slow shuffle of the player (0.3 m over half a second) does not start him walking again.
    for (let i = 1; i <= 30; i++) {
      last = m.step(input(v(0.01 * i, 0, 0)));
      expect(last.gait).toBe('idle');
    }
  });
});

describe('FollowModel teleports', () => {
  it('asks for "far" beyond 40 m but not at 40 m', () => {
    expect(at40(41).step(input(v(0, 0, 0))).teleport).toBe('far');
    expect(at40(39.9).step(input(v(0, 0, 0))).teleport).toBeNull();
  });
  function at40(z: number) {
    return new FollowModel(v(0, 0, z));
  }

  it('does not move him and goes idle when it asks for a teleport', () => {
    const m = at40(50);
    const r = m.step(input(v(0, 0, 0)));
    expect(r).toEqual({ gait: 'idle', teleport: 'far' });
    expect(m.pos).toEqual(v(0, 0, 50));
  });
  it('"jump" when the player moves >= 8 m in one step, and clears the trail', () => {
    const m = new FollowModel(v(0, 0, 0));
    run(m, v(0, 0, 0), 5);
    m.step(input(v(1, 0, 0)));
    expect(m.trail.length).toBeGreaterThan(0);
    const r = m.step(input(v(9, 0, 0)));
    expect(r.teleport).toBe('jump');
    expect(m.trail.length).toBe(0);
  });
  it('does not jump for a 7.9 m move', () => {
    const m = new FollowModel(v(0, 0, 0));
    m.step(input(v(0, 0, 0)));
    expect(m.step(input(v(7.9, 0, 0))).teleport).toBeNull();
  });
  it('the first step never jumps', () => {
    expect(new FollowModel(v(0, 0, 0)).step(input(v(500, 0, 500))).teleport).toBe('far');
  });
  it('two consecutive jumps (a door, then a rollback) give two "jump" teleports', () => {
    const m = new FollowModel(v(0, 0, 0));
    m.step(input(v(0, 0, 0)));
    expect(m.step(input(v(10, 0, 0))).teleport).toBe('jump');
    expect(m.step(input(v(0, 0, 0))).teleport).toBe('jump');
    expect(m.step(input(v(0, 0, 0))).teleport).not.toBe('jump');
  });
  it('"unsupported" when there is no ground under him', () => {
    const m = new FollowModel(v(0, 0, 3));
    expect(m.step(input(v(0, 0, 0), { groundAt: () => null })).teleport).toBe('unsupported');
  });
  it('"unsupported" when the next step would leave the ground', () => {
    const m = new FollowModel(v(0, 0, 2));
    const r = m.step(input(v(0, 0, 0), { groundAt: (_x, z) => (z > 2.01 ? null : 0) }));
    expect(r.teleport).toBe('unsupported');
    expect(m.pos.z).toBe(2);
  });
  it('"stuck" after 3 s of moving under 0.5 m himself while > 6 m away (ground keeps refusing him)', () => {
    const m = new FollowModel(v(0, 0, 20));
    // Ground exists where he stands but every step forward clamps him back (simulated by a ground that only
    // answers for his own spot): he cannot advance, so after 3 s he asks for a teleport.
    let reason: string | null = null;
    let at = -1;
    for (let i = 0; i < 400 && !reason; i++) {
      const r = m.step(input(v(0, 0, 0), { groundAt: () => 0 }));
      if (r.teleport) reason = r.teleport;
      m.pos.z = 20; // pinned
      at = i;
    }
    expect(reason).toBe('stuck');
    expect(at).toBeGreaterThanOrEqual(175);
    expect(at).toBeLessThanOrEqual(185);
  });
  it('is not stuck when he makes progress', () => {
    const m = new FollowModel(v(0, 0, 20));
    for (let i = 0; i < 300; i++) {
      const r = m.step(input(v(0, 0, 0)));
      expect(r.teleport).toBeNull();
    }
  });
  it('is never stuck within 6 m (slow pursuit of a moving player)', () => {
    const m = new FollowModel(v(0, 0, 5));
    let z = 0;
    for (let i = 0; i < 600; i++) {
      z -= 4.5 * DT;
      expect(m.step(input(v(0, 0, z))).teleport).not.toBe('stuck');
    }
  });
  it('requestTeleport gives "requested" on the next step, once', () => {
    const m = new FollowModel(v(0, 0, 2));
    m.requestTeleport();
    expect(m.step(input(v(0, 0, 0))).teleport).toBe('requested');
    expect(m.step(input(v(0, 0, 0))).teleport).toBeNull();
  });
  it('place() drops a pending request', () => {
    const m = new FollowModel(v(0, 0, 2));
    m.requestTeleport();
    m.place(v(0, 0, 3), 0);
    expect(m.step(input(v(0, 0, 0))).teleport).toBeNull();
  });
});

describe('FollowModel rest and hold', () => {
  it('hold stops him and turns him to face the player', () => {
    const m = new FollowModel(v(0, 0, 3), Math.PI);
    const r = run(m, v(0, 0, 0), 60, { hold: true });
    expect(r).toEqual({ gait: 'idle', teleport: null });
    expect(m.pos).toEqual(v(0, 0, 3));
    expect(Math.abs(m.yaw)).toBeLessThan(1e-6);
  });
  it('hold also faces a player off to the side', () => {
    const m = new FollowModel(v(5, 0, 0), 0);
    run(m, v(0, 0, 0), 60, { hold: true });
    expect(m.yaw).toBeCloseTo(Math.PI / 2, 4); // the player is at -X
  });
  it('turns at a limited rate (10 rad/s)', () => {
    const m = new FollowModel(v(0, 0, 3), Math.PI);
    m.step(input(v(0, 0, 0), { hold: true }));
    expect(Math.abs(Math.abs(m.yaw) - Math.PI)).toBeCloseTo(10 * DT, 5);
  });
  it('rests about 3 m behind and 1.2 m to the side, idle, once the player stands still', () => {
    const m = new FollowModel(v(0, 0, 0));
    expect(m.step(input(v(0, 0, 0))).gait).toBe('walk');
    const r = run(m, v(0, 0, 0), 600);
    expect(r.gait).toBe('idle');
    expect(Math.hypot(m.pos.x - 1.2, m.pos.z - 3)).toBeLessThanOrEqual(COMPANION_TUNING.arriveRadius + 1e-9);
    // and stays put
    const before = { ...m.pos };
    run(m, v(0, 0, 0), 60);
    expect(m.pos).toEqual(before);
    // faces the player, who is towards -Z
    expect(Math.cos(m.yaw)).toBeGreaterThan(0.5);
  });
  it('the slot follows the player yaw', () => {
    const m = new FollowModel(v(0, 0, 0));
    run(m, v(0, 0, 0), 600, { playerYaw: Math.PI / 2 }); // player faces -X, behind is +X
    expect(m.pos.x).toBeGreaterThan(2.5);
    expect(Math.abs(m.pos.z)).toBeLessThan(1.6);
  });
  it('switches side only when the other side is clearly closer to the player height', () => {
    const rightHigh = (h: number) => (x: number) => (x > 0.5 ? h : 0);
    const clear = new FollowModel(v(0, 0, 3));
    run(clear, v(0, 0, 0), 600, { groundAt: rightHigh(2) });
    expect(clear.pos.x).toBeLessThan(-0.8);

    const slight = new FollowModel(v(0, 0, 3));
    run(slight, v(0, 0, 0), 600, { groundAt: rightHigh(0.3) });
    expect(slight.pos.x).toBeGreaterThan(0.8);
  });
  it('switches to the free side when the preferred side has no ground', () => {
    const m = new FollowModel(v(0, 0, 3));
    run(m, v(0, 0, 0), 600, { groundAt: (x) => (x > 0.5 ? null : 0) });
    expect(m.pos.x).toBeLessThan(-0.8);
  });
  it('stays on the new side afterwards (no flip back when both are level)', () => {
    const m = new FollowModel(v(0, 0, 3));
    run(m, v(0, 0, 0), 300, { groundAt: (x) => (x > 0.5 ? 2 : 0) });
    run(m, v(0, 0, 0), 300);
    expect(m.pos.x).toBeLessThan(-0.8);
  });
});

describe('FollowModel invalid input', () => {
  const bad: Array<[string, Partial<FollowInput>]> = [
    ['NaN player x', { player: v(NaN, 0, 0) }],
    ['Infinity player y', { player: v(0, Infinity, 0) }],
    ['NaN player z', { player: v(0, 0, NaN) }],
    ['NaN yaw', { playerYaw: NaN }],
    ['zero dt', { dt: 0 }],
    ['negative dt', { dt: -1 }],
    ['NaN dt', { dt: NaN }],
  ];
  it.each(bad)('ignores %s', (_n, over) => {
    const m = new FollowModel(v(0, 0, 3), 0.5);
    m.gait = 'run';
    const r = m.step(input(v(0, 0, 0), over));
    expect(r).toEqual({ gait: 'run', teleport: null });
    expect(m.pos).toEqual(v(0, 0, 3));
    expect(m.yaw).toBe(0.5);
    expect(m.trail.length).toBe(0);
  });
  it('a rejected step does not poison the jump detector', () => {
    const m = new FollowModel(v(0, 0, 0));
    m.step(input(v(0, 0, 0)));
    m.step(input(v(NaN, 0, 0)));
    expect(m.step(input(v(1, 0, 0))).teleport).toBeNull();
  });
  it('place() ignores NaN position and NaN yaw', () => {
    const m = new FollowModel(v(1, 2, 3), 0.5);
    m.place(v(NaN, 0, 0), 0);
    m.place(v(0, 0, 0), NaN);
    expect(m.pos).toEqual(v(1, 2, 3));
    expect(m.yaw).toBe(0.5);
  });
  it('place() moves him, wraps the yaw, goes idle and clears the trail', () => {
    const m = new FollowModel(v(0, 0, 0));
    run(m, v(0, 0, -10), 3);
    m.gait = 'run';
    m.place(v(4, 5, 6), 3 * Math.PI);
    expect(m.pos).toEqual(v(4, 5, 6));
    expect(Math.abs(Math.abs(m.yaw) - Math.PI)).toBeLessThan(1e-9);
    expect(m.gait).toBe('idle');
    expect(m.trail.length).toBe(0);
  });
  it('does not alias the start position', () => {
    const s = v(1, 1, 1);
    const m = new FollowModel(s);
    m.pos.x = 9;
    expect(s.x).toBe(1);
  });
});
