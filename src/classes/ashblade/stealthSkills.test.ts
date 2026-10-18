import { describe, expect, it, vi } from 'vitest';
import { ashCloudHandler, QuietSoles, type AshCloudPorts, type StealthHooks } from './stealthSkills';
import { ASH_CLOUD } from './tuning';

/** A fake stealth service shaped like PR #47's `StealthEffects`: scales and blockers with idempotent releases. */
function fakeStealth(active = false) {
  const scales = new Map<number, number>();
  const blockers: { x: number; z: number; r: number; seconds: number }[] = [];
  let id = 0;
  const hooks: StealthHooks & { active(): boolean } = {
    active: () => active,
    addNoiseScale: (_source, scale) => {
      const k = ++id;
      scales.set(k, scale);
      return () => void scales.delete(k);
    },
    addSightBlocker: (b) => {
      blockers.push(b);
      return () => undefined;
    },
  };
  return { hooks, scales, blockers };
}

describe('Quiet Soles', () => {
  const setup = (initial = true) => {
    const state = { wanted: initial, svc: undefined as StealthHooks | undefined };
    const warn = vi.fn();
    const q = new QuietSoles(() => state.wanted, () => state.svc, warn);
    return { state, q, warn };
  };

  it('silences the footsteps while learned and releases them on a respec or a class change', () => {
    const { state, q } = setup();
    const s = fakeStealth();
    state.svc = s.hooks;
    q.tick();
    expect([...s.scales.values()]).toEqual([0]);
    q.tick();
    expect(s.scales.size).toBe(1);
    state.wanted = false;
    q.tick();
    expect(s.scales.size).toBe(0);
    state.wanted = true;
    q.tick();
    expect(s.scales.size).toBe(1);
  });

  it('does nothing and throws nothing while the stealth service is absent, then binds when it appears', () => {
    const { state, q } = setup();
    q.tick();
    expect(q.bindings).toBe(0);
    const s = fakeStealth();
    state.svc = s.hooks;
    q.tick();
    expect(s.scales.size).toBe(1);
  });

  it('rebinds to a new stealth instance and releases the old handle first', () => {
    const { state, q } = setup();
    const a = fakeStealth();
    const b = fakeStealth();
    state.svc = a.hooks;
    q.tick();
    state.svc = b.hooks;
    q.tick();
    expect(a.scales.size).toBe(0);
    expect(b.scales.size).toBe(1);
  });

  it('warns once when the service has no addNoiseScale', () => {
    const { state, q, warn } = setup();
    state.svc = {};
    q.tick();
    q.tick();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(q.bindings).toBe(0);
  });

  it('release is safe to call twice', () => {
    const { state, q } = setup();
    const s = fakeStealth();
    state.svc = s.hooks;
    q.tick();
    q.release();
    q.release();
    expect(s.scales.size).toBe(0);
  });
});

describe('Ash Cloud', () => {
  const ports = (over: Partial<AshCloudPorts> = {}) => {
    const spawned: unknown[] = [];
    const throwClip = vi.fn();
    const warn = vi.fn();
    const p: AshCloudPorts = {
      isAshblade: () => true,
      stealth: () => undefined,
      feet: () => ({ x: 10, y: 5, z: 20 }),
      facingYaw: () => 0,
      wallAhead: () => null,
      groundAt: () => null,
      spawnCloud: (at, r, s) => spawned.push({ at, r, s }),
      throwClip,
      perceptionPresent: () => true,
      warn,
      ...over,
    };
    return { p, spawned, throwClip, warn };
  };

  it('drops a 3.5 m, 6 s blocker 3 m ahead of the facing (forward is -sin, -cos)', () => {
    const s = fakeStealth();
    const { p, spawned, throwClip } = ports({ stealth: () => s.hooks, facingYaw: () => Math.PI / 2 });
    expect(ashCloudHandler(p)()).toEqual({ ok: true });
    expect(s.blockers).toHaveLength(1);
    expect(s.blockers[0].x).toBeCloseTo(10 - 3);
    expect(s.blockers[0].z).toBeCloseTo(20, 5);
    expect(s.blockers[0].r).toBe(ASH_CLOUD.radius);
    expect(s.blockers[0].seconds).toBe(ASH_CLOUD.seconds);
    expect(throwClip).toHaveBeenCalledOnce();
    expect(spawned).toHaveLength(1);
  });

  it('works the same inside and outside a live stealth section', () => {
    for (const live of [true, false]) {
      const s = fakeStealth(live);
      const { p } = ports({ stealth: () => s.hooks });
      expect(ashCloudHandler(p)()).toEqual({ ok: true });
      expect(s.blockers).toHaveLength(1);
    }
  });

  it('stops the cloud short of a wall', () => {
    const s = fakeStealth();
    const { p } = ports({ stealth: () => s.hooks, wallAhead: () => 1.5 });
    ashCloudHandler(p)();
    expect(20 - s.blockers[0].z).toBeCloseTo(1.2);
  });

  it('rests the cloud on the ground the cast finds, else at the feet height', () => {
    const s = fakeStealth();
    const withGround = ports({ stealth: () => s.hooks, groundAt: () => 4.5 });
    ashCloudHandler(withGround.p)();
    expect((withGround.spawned[0] as { at: { y: number } }).at.y).toBe(4.5);
    const noGround = ports({ stealth: () => s.hooks });
    ashCloudHandler(noGround.p)();
    expect((noGround.spawned[0] as { at: { y: number } }).at.y).toBe(5);
  });

  it('refuses without spending (ok false) outside the class and while the stealth service is absent', () => {
    const s = fakeStealth();
    const off = ports({ stealth: () => s.hooks, isAshblade: () => false });
    expect(ashCloudHandler(off.p)()).toEqual({ ok: false, reason: 'not-ashblade' });
    const none = ports();
    expect(ashCloudHandler(none.p)()).toEqual({ ok: false, reason: 'no-stealth' });
    const noHook = ports({ stealth: () => ({}) });
    expect(ashCloudHandler(noHook.p)()).toEqual({ ok: false, reason: 'no-stealth' });
    expect(s.blockers).toHaveLength(0);
    expect(off.throwClip).not.toHaveBeenCalled();
  });

  it('warns once that enemies cannot see the cloud until their perception lands', () => {
    const s = fakeStealth();
    const { p, warn } = ports({ stealth: () => s.hooks, perceptionPresent: () => false });
    const h = ashCloudHandler(p);
    h();
    h();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
