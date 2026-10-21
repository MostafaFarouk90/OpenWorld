import { describe, expect, it, vi } from 'vitest';
import { Herd, type HerdEnv, type Point, type SheepView } from './Herd';
import { HERD } from './tuning';

function fakeView() {
  const v = { x: 0, z: 0, yaw: 0, speed: 0, updates: 0, disposed: 0 };
  const view: SheepView = {
    place: (x, z, yaw) => Object.assign(v, { x, z, yaw }),
    setSpeed: (m) => (v.speed = m),
    update: () => v.updates++,
    dispose: () => v.disposed++,
  };
  return { v, view };
}

function mk(anchors: Point[], opts: { size?: number; fog?: { x: number; z: number; radius: number }[]; player?: Point | null } = {}) {
  const views: ReturnType<typeof fakeView>[] = [];
  const player = { p: opts.player === undefined ? { x: 0, z: 0 } : opts.player };
  const env: HerdEnv = {
    player: () => player.p,
    makeView: () => {
      const f = fakeView();
      views.push(f);
      return f.view;
    },
    rng: () => 0.5,
  };
  const events = { joined: vi.fn(), scattered: vi.fn() };
  const herd = new Herd('h', env, { anchors, size: opts.size, fog: opts.fog }, events);
  return { herd, views, player, events };
}

const ring = (n: number, r = 4): Point[] => Array.from({ length: n }, (_, i) => ({ x: Math.cos(i) * r + 20, z: Math.sin(i) * r }));
const run = (h: Herd, secs: number, dt = 0.1) => {
  for (let t = 0; t < secs; t += dt) h.step(dt);
};

describe('Herd', () => {
  it('caps size at 8 and at the number of anchors', () => {
    expect(mk(ring(12)).herd.size).toBe(HERD.maxSize);
    expect(mk(ring(12), { size: 20 }).herd.size).toBe(HERD.maxSize);
    expect(mk(ring(3), { size: 8 }).herd.size).toBe(3);
    expect(mk(ring(6), { size: 2 }).herd.size).toBe(2);
    expect(mk([]).herd.size).toBe(0);
  });

  it('setFollowing(true) makes grazing sheep follow and emits joined(n); off emits 0', () => {
    const { herd, events } = mk(ring(4));
    herd.setFollowing(true);
    expect(herd.followers).toBe(4);
    expect(herd.modes().every((m) => m === 'follow')).toBe(true);
    expect(events.joined).toHaveBeenCalledWith(4);
    herd.setFollowing(true);
    expect(events.joined).toHaveBeenCalledTimes(1);
    herd.setFollowing(false);
    expect(events.joined).toHaveBeenLastCalledWith(0);
    expect(herd.followers).toBe(0);
  });

  it('followers close in to followDistance and do not stack', () => {
    const { herd } = mk(ring(6, 6), { player: { x: 0, z: 0 } });
    herd.setFollowing(true);
    run(herd, 40);
    const ps = herd.positions();
    for (const p of ps) expect(Math.hypot(p.x, p.z)).toBeLessThan(HERD.followDistance + 1.5);
    for (let i = 0; i < ps.length; i++)
      for (let j = i + 1; j < ps.length; j++) expect(Math.hypot(ps[i]!.x - ps[j]!.x, ps[i]!.z - ps[j]!.z)).toBeGreaterThan(0.3);
  });

  it('sheep exactly on top of each other still separate (no NaN)', () => {
    const { herd } = mk([{ x: 10, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 0 }]);
    herd.setFollowing(true);
    run(herd, 20);
    for (const p of herd.positions()) {
      expect(Number.isFinite(p.x) && Number.isFinite(p.z)).toBe(true);
    }
  });

  it('a sheep that wanders into fog scatters (event, mode lost) and is not counted home', () => {
    const fog = [{ x: 20, z: 0, radius: 3 }];
    const { herd, events } = mk([{ x: 21, z: 0 }, { x: 40, z: 0 }], { fog });
    herd.step(0.1);
    expect(events.scattered).toHaveBeenCalledWith(1);
    expect(herd.modes()).toEqual(['lost', 'graze']);
    // the lost one is within radius of its start but is not counted
    expect(herd.count({ x: 21, z: 0 }, 100)).toBe(1);
    expect(herd.count({ x: 40, z: 0 }, 1)).toBe(1);
  });

  it('count only counts sheep within radius of home', () => {
    const { herd } = mk([{ x: 0, z: 0 }, { x: 5, z: 0 }, { x: 50, z: 0 }]);
    expect(herd.count({ x: 0, z: 0 }, 6)).toBe(2);
    expect(herd.count({ x: 0, z: 0 }, 1)).toBe(1);
    expect(herd.count({ x: 0, z: 0 }, 100)).toBe(3);
  });

  it('sheep beyond loseDistance stop following', () => {
    const { herd } = mk([{ x: HERD.loseDistance + 5, z: 0 }, { x: 10, z: 0 }]);
    herd.setFollowing(true);
    herd.step(0.1);
    expect(herd.modes()).toEqual(['graze', 'follow']);
  });

  it('a herd told to follow while the player is far away follows once the player walks up to it (R05 fox road)', () => {
    const far = HERD.loseDistance + 60;
    const { herd, player } = mk([{ x: far, z: 0 }, { x: far + 3, z: 0 }]);
    herd.setFollowing(true);
    run(herd, 1);
    expect(herd.modes()).toEqual(['graze', 'graze']);
    // Still far: nothing changes.
    player.p = { x: far - 20, z: 0 };
    run(herd, 1);
    expect(herd.followers).toBe(0);
    // The player arrives within the rejoin radius of both, and walks home: the sheep come along.
    player.p = { x: far + 1.5, z: 0 };
    run(herd, 1);
    expect(herd.followers).toBe(2);
    player.p = { x: far - 40, z: 0 };
    run(herd, 25);
    for (const p of herd.positions()) expect(Math.hypot(p.x - player.p.x, p.z - player.p.z)).toBeLessThan(HERD.followDistance + 1);
  });

  it('a grazing sheep does not join a herd that is not following', () => {
    const { herd } = mk([{ x: 2, z: 0 }]);
    run(herd, 2);
    expect(herd.followers).toBe(0);
  });

  it('dispose disposes every view once and empties the herd', () => {
    const { herd, views } = mk(ring(5));
    herd.dispose();
    expect(views.map((v) => v.v.disposed)).toEqual([1, 1, 1, 1, 1]);
    expect(herd.size).toBe(0);
    herd.step(0.1);
  });

  it('step with dt 0 does not move or corrupt positions', () => {
    const { herd } = mk(ring(4));
    herd.setFollowing(true);
    const before = herd.positions();
    herd.step(0);
    expect(herd.positions()).toEqual(before);
  });

  // KNOWN SOURCE BUG (Herd.ts `s.x += vx * dt`): a NaN dt makes every moving sheep's position NaN. Flip to `it` once guarded.
  it('step with NaN dt does not corrupt positions', () => {
    const { herd } = mk(ring(4));
    herd.setFollowing(true);
    herd.step(NaN);
    for (const p of herd.positions()) expect(Number.isFinite(p.x) && Number.isFinite(p.z)).toBe(true);
  });
});
