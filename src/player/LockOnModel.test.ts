import { describe, expect, it } from 'vitest';
import { type Candidate, LockOnModel, type LockView } from './LockOnModel';
import { LOCK_ON } from './tuning';

/** Candidate at distance `d` and `deg` degrees to the right of forward (yaw 0, player at origin). */
const polar = (id: string, d: number, deg: number, extra: Partial<Candidate> = {}): Candidate => {
  const a = (deg * Math.PI) / 180;
  return { id, x: Math.sin(a) * d, z: -Math.cos(a) * d, team: 'hostile', dead: false, ...extra };
};

function view(candidates: Candidate[], over: Partial<LockView> = {}, blind: string[] = []): LockView {
  return {
    tick: 0,
    playerX: 0,
    playerZ: 0,
    cameraYaw: 0,
    playerDead: false,
    candidates,
    hasSight: (id) => !blind.includes(id),
    ...over,
  };
}

describe('LockOnModel selection', () => {
  it('prefers the smallest angle, then the nearest', () => {
    const m = new LockOnModel();
    expect(m.toggle(view([polar('a', 5, 30), polar('b', 15, 10), polar('c', 8, 20)])).target).toBe('b');
    const m2 = new LockOnModel();
    expect(m2.toggle(view([polar('far', 15, 10), polar('near', 5, 10)])).target).toBe('near');
  });

  it('ignores dead, neutral, ally, player, too far, outside the cone and out of sight', () => {
    const m = new LockOnModel();
    const list = [
      polar('dead', 5, 0, { dead: true }),
      polar('neutral', 5, 1, { team: 'neutral' }),
      polar('ally', 5, 2, { team: 'ally' }),
      polar('player', 5, 2, { team: 'player' }),
      polar('far', 20.5, 3),
      polar('side', 5, 71),
      polar('blind', 5, 4),
      polar('ok', 19.9, 60),
    ];
    expect(m.toggle(view(list, {}, ['blind'])).target).toBe('ok');
  });

  it('honours the camera yaw', () => {
    const m = new LockOnModel();
    const e = polar('east', 5, 90);
    expect(m.toggle(view([e])).changed).toBe(false);
    expect(m.toggle(view([e], { cameraYaw: -Math.PI / 2 })).target).toBe('east');
  });

  it('toggles on and off', () => {
    const m = new LockOnModel();
    const v = view([polar('a', 5, 0)]);
    expect(m.toggle(v)).toEqual({ changed: true, target: 'a' });
    expect(m.target).toBe('a');
    expect(m.toggle(v)).toEqual({ changed: true, target: null });
    expect(m.target).toBeNull();
  });

  it('reports no change when nothing is available', () => {
    const m = new LockOnModel();
    expect(m.toggle(view([]))).toEqual({ changed: false, target: null });
    expect(m.target).toBeNull();
  });
});

describe('LockOnModel swap', () => {
  const three = [polar('mid', 6, 0), polar('l1', 6, -20), polar('l2', 6, -50), polar('r1', 6, 25), polar('r2', 6, 55)];

  it('picks the nearest candidate on the requested side', () => {
    const m = new LockOnModel();
    m.toggle(view(three));
    expect(m.target).toBe('mid');
    expect(m.swap(1, view(three, { tick: 100 }))).toBe(true);
    expect(m.target).toBe('r1');
    expect(m.swap(-1, view(three, { tick: 200 }))).toBe(true);
    expect(m.target).toBe('mid');
    expect(m.swap(-1, view(three, { tick: 300 }))).toBe(true);
    expect(m.target).toBe('l1');
  });

  it('leaves the target unchanged when nothing is on that side', () => {
    const m = new LockOnModel();
    m.toggle(view(three));
    m.swap(1, view(three, { tick: 100 }));
    m.swap(1, view(three, { tick: 200 }));
    expect(m.target).toBe('r2');
    expect(m.swap(1, view(three, { tick: 300 }))).toBe(false);
    expect(m.target).toBe('r2');
  });

  it('returns false with a single target or when not locked', () => {
    const m = new LockOnModel();
    expect(m.swap(1, view(three))).toBe(false);
    const solo = [polar('a', 5, 0)];
    m.toggle(view(solo));
    expect(m.swap(1, view(solo, { tick: 100 }))).toBe(false);
    expect(m.swap(-1, view(solo, { tick: 100 }))).toBe(false);
  });

  it('enforces the cooldown at the exact boundary', () => {
    const m = new LockOnModel();
    m.toggle(view(three, { tick: 0 }));
    expect(m.swap(1, view(three, { tick: 1000 }))).toBe(true);
    const n = LOCK_ON.swapCooldownTicks;
    expect(m.swap(1, view(three, { tick: 1000 + n - 1 }))).toBe(false);
    expect(m.target).toBe('r1');
    expect(m.swap(1, view(three, { tick: 1000 + n }))).toBe(true);
    expect(m.target).toBe('r2');
  });

  it('skips candidates that fail the candidate filter', () => {
    const list = [polar('mid', 6, 0), polar('dead', 6, 20, { dead: true }), polar('blind', 6, 25), polar('r', 6, 40)];
    const m = new LockOnModel();
    m.toggle(view(list, {}, ['blind']));
    expect(m.swap(1, view(list, { tick: 100 }, ['blind']))).toBe(true);
    expect(m.target).toBe('r');
  });
});

describe('LockOnModel mouse swap', () => {
  const W = LOCK_ON.swapWindowTicks;

  it('ignores movement below the threshold', () => {
    const m = new LockOnModel();
    expect(m.pushMouse(79, 0)).toBe(0);
    expect(m.pushMouse(0, 1)).toBe(0);
  });

  it('fires inside the window in either direction', () => {
    const m = new LockOnModel();
    expect(m.pushMouse(30, 0)).toBe(0);
    expect(m.pushMouse(30, 5)).toBe(0);
    expect(m.pushMouse(20, W)).toBe(1);
    expect(m.pushMouse(-80, 100)).toBe(-1);
  });

  it('ignores 80 px spread slower than the window', () => {
    const m = new LockOnModel();
    for (let t = 0; t <= 8 * (W + 1); t += W + 1) expect(m.pushMouse(10, t)).toBe(0);
  });

  it('resets after firing', () => {
    const m = new LockOnModel();
    expect(m.pushMouse(80, 0)).toBe(1);
    expect(m.pushMouse(40, 1)).toBe(0);
    expect(m.pushMouse(40, 2)).toBe(1);
  });
});

describe('LockOnModel update', () => {
  const lockOn = (list: Candidate[], blind: string[] = []) => {
    const m = new LockOnModel();
    m.toggle(view(list, {}, blind));
    return m;
  };

  it('stays locked while everything is fine', () => {
    const m = lockOn([polar('a', 5, 0)]);
    expect(m.update(view([polar('a', 5, 0)]))).toBeNull();
    expect(m.target).toBe('a');
  });

  it('re-acquires the nearest hostile in front when the target dies', () => {
    const m = lockOn([polar('a', 5, 0), polar('b', 10, 10), polar('c', 7, 40)]);
    const r = m.update(view([polar('a', 5, 0, { dead: true }), polar('b', 10, 10), polar('c', 7, 40)]));
    expect(r).toEqual({ reacquired: 'c' });
    expect(m.target).toBe('c');
  });

  it('does not re-acquire beyond the re-acquire range and releases with dead', () => {
    const m = lockOn([polar('a', 5, 0), polar('b', 15, 10)]);
    const r = m.update(view([polar('a', 5, 0, { dead: true }), polar('b', 15, 10)]));
    expect(r).toEqual({ released: 'dead' });
    expect(m.target).toBeNull();
  });

  it('releases dead when the only other hostile is behind the player', () => {
    const m = lockOn([polar('a', 5, 0)]);
    const r = m.update(view([polar('a', 5, 0, { dead: true }), polar('b', 5, 180)]));
    expect(r).toEqual({ released: 'dead' });
  });

  it('releases gone when the target leaves the list', () => {
    const m = lockOn([polar('a', 5, 0)]);
    expect(m.update(view([]))).toEqual({ released: 'gone' });
    expect(m.target).toBeNull();
  });

  it('releases team when the target is no longer hostile', () => {
    const m = lockOn([polar('a', 5, 0)]);
    expect(m.update(view([polar('a', 5, 0, { team: 'neutral' })]))).toEqual({ released: 'team' });
    expect(m.target).toBeNull();
  });

  it('releases far beyond 25 m but not at 24.9', () => {
    const m = lockOn([polar('a', 5, 0)]);
    expect(m.update(view([polar('a', 24.9, 0)]))).toBeNull();
    expect(m.update(view([polar('a', 25.1, 0)]))).toEqual({ released: 'far' });
  });

  it('releases lostSight on the 120th blind tick, not the 119th', () => {
    const m = lockOn([polar('a', 5, 0)]);
    const list = [polar('a', 5, 0)];
    for (let i = 0; i < LOCK_ON.lostSightTicks - 1; i++) expect(m.update(view(list, {}, ['a']))).toBeNull();
    expect(m.target).toBe('a');
    expect(m.update(view(list, {}, ['a']))).toEqual({ released: 'lostSight' });
  });

  it('resets the sight count when sight returns', () => {
    const m = lockOn([polar('a', 5, 0)]);
    const list = [polar('a', 5, 0)];
    for (let i = 0; i < LOCK_ON.lostSightTicks - 1; i++) m.update(view(list, {}, ['a']));
    expect(m.update(view(list))).toBeNull();
    for (let i = 0; i < LOCK_ON.lostSightTicks - 1; i++) expect(m.update(view(list, {}, ['a']))).toBeNull();
    expect(m.target).toBe('a');
  });

  it('releases playerDead, and is inert when unlocked', () => {
    const m = lockOn([polar('a', 5, 0)]);
    expect(m.update(view([polar('a', 5, 0)], { playerDead: true }))).toEqual({ released: 'playerDead' });
    expect(m.update(view([polar('a', 5, 0)]))).toBeNull();
  });
});
