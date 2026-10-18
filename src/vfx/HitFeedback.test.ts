import { describe, expect, it, vi } from 'vitest';
import { HitFeedback, planFeedback } from './HitFeedback';
import type { DamageResultLike } from './ports';

const result = (o: Partial<DamageResultLike> = {}): DamageResultLike => ({
  attackerId: 'player',
  targetId: 'dummy#1',
  amount: 10,
  poise: 10,
  kind: 'melee',
  outcome: 'hit',
  dealt: 10,
  poiseDealt: 10,
  healthAfter: 90,
  killed: false,
  saved: false,
  staggered: false,
  point: { x: 1, y: 1, z: 1 },
  ...o,
});

function setup(clockOver: Record<string, unknown> = {}) {
  const vfx = { spawnEffect: vi.fn(), shake: vi.fn(), fovPunch: vi.fn(), pulseScreen: vi.fn() };
  const clock = { tick: 1, seconds: 0, hitStop: vi.fn(), ...clockOver };
  const fb = new HitFeedback({ vfx: vfx as never, clock: clock as never, actors: { get: () => undefined, all: () => [], player: {} as never } });
  return { vfx, clock, fb };
}

describe('planFeedback', () => {
  it('normal hit uses the 50 ms stack', () => {
    const p = planFeedback({ outcome: 'hit', attackId: '1H_Melee_Attack_Slice_Horizontal', killed: false, kind: 'melee' });
    expect(p).toMatchObject({ hitStop: 0.05, fov: 2, sparks: 24, effect: 'hit-spark' });
    expect(p.shake).toEqual({ amplitude: 0.03, seconds: 0.1 });
  });
  it('stab is 60 ms, chop is heavy, a killing blow is 100 ms', () => {
    expect(planFeedback({ outcome: 'hit', attackId: '1H_Melee_Attack_Stab', killed: false, kind: 'melee' }).hitStop).toBe(0.06);
    const chop = planFeedback({ outcome: 'hit', attackId: '1H_Melee_Attack_Chop', killed: false, kind: 'melee' });
    expect(chop).toMatchObject({ hitStop: 0.09, fov: 5, sparks: 48, effect: 'hit-spark-heavy' });
    expect(chop.extra).toEqual(['shockwave-ring', 'scorch-decal']);
    expect(planFeedback({ outcome: 'hit', killed: true, kind: 'melee' }).hitStop).toBe(0.1);
  });
  it('blocked is at most 30 ms, parried 70 ms, immune nothing', () => {
    expect(planFeedback({ outcome: 'blocked', killed: false, kind: 'melee' })).toMatchObject({ hitStop: 0.03, effect: 'block-spark' });
    expect(planFeedback({ outcome: 'parried', killed: false, kind: 'melee' })).toMatchObject({ hitStop: 0.07, effect: 'parry-flash' });
    const im = planFeedback({ outcome: 'immune', killed: false, kind: 'melee' });
    expect(im.hitStop).toBe(0);
    expect(im.effect).toBeNull();
  });
});

describe('HitFeedback', () => {
  it('applies hit-stop, shake, fov and sparks for a normal hit', () => {
    const { vfx, clock, fb } = setup();
    fb.onDamage(result({ attackId: '1H_Melee_Attack_Slice_Horizontal' }));
    expect(clock.hitStop).toHaveBeenCalledWith(0.05);
    expect(vfx.shake).toHaveBeenCalledWith(0.03, 0.1);
    expect(vfx.fovPunch).toHaveBeenCalledWith(2);
    expect(vfx.spawnEffect).toHaveBeenCalledWith('hit-spark', expect.anything(), { count: 24 });
  });
  it('immune hits produce no effects at all', () => {
    const { vfx, clock, fb } = setup();
    fb.onDamage(result({ outcome: 'immune', dealt: 0 }));
    expect(vfx.spawnEffect).not.toHaveBeenCalled();
    expect(clock.hitStop).not.toHaveBeenCalled();
  });
  it('drops hit-stop while the game is paused but keeps hit-stop frozen sims', () => {
    const paused = setup({ frozen: true, hitStopRemaining: 0 });
    paused.fb.onDamage(result());
    expect(paused.clock.hitStop).not.toHaveBeenCalled();
    const stopping = setup({ frozen: true, hitStopRemaining: 0.02 });
    stopping.fb.onDamage(result());
    expect(stopping.clock.hitStop).toHaveBeenCalled();
  });
  it('damps a five-target spell: one hit-stop and shake, sparks for each', () => {
    const { vfx, clock, fb } = setup();
    for (let i = 0; i < 5; i++) fb.onDamage(result({ kind: 'spell', targetId: `w#${i}` }));
    expect(clock.hitStop).toHaveBeenCalledTimes(1);
    expect(clock.hitStop.mock.calls[0][0]).toBeCloseTo(0.05 * 0.35);
    expect(vfx.shake).toHaveBeenCalledTimes(1);
    expect(vfx.spawnEffect).toHaveBeenCalledTimes(5);
  });
  it('falls back to the target position, then the origin, without a point', () => {
    const vfx = { spawnEffect: vi.fn(), shake: vi.fn(), fovPunch: vi.fn(), pulseScreen: vi.fn() };
    const fb = new HitFeedback({
      vfx: vfx as never,
      clock: { tick: 0, seconds: 0, hitStop: () => {} },
      actors: { get: (id: string) => (id === 'a' ? ({ root: {}, worldPosition: (o: { set: (x: number, y: number, z: number) => void }) => (o.set(2, 0, 4), o) } as never) : undefined), all: () => [], player: {} as never },
    });
    fb.onDamage(result({ point: undefined, targetId: 'a' }));
    expect(vfx.spawnEffect.mock.calls[0][1].position).toEqual({ x: 2, y: 1, z: 4 });
    fb.onDamage(result({ point: undefined, targetId: 'gone' }));
    expect(vfx.spawnEffect.mock.calls[1][1].position).toEqual({ x: 0, y: 0, z: 0 });
  });
  it('falls and scripted damage give no weapon feedback', () => {
    const { vfx, clock, fb } = setup();
    fb.onDamage(result({ kind: 'fall' }));
    fb.onDamage(result({ kind: 'script' }));
    expect(vfx.spawnEffect).not.toHaveBeenCalled();
    expect(clock.hitStop).not.toHaveBeenCalled();
  });
  it('a killing blow on an immortal dummy (killed false) uses the normal stack', () => {
    const { clock, fb } = setup();
    fb.onDamage(result({ killed: false, attackId: '1H_Melee_Attack_Slice_Diagonal' }));
    expect(clock.hitStop).toHaveBeenCalledWith(0.05);
  });
  it('a poise-only hit (amount 0) still gets sparks and the normal stack', () => {
    const { vfx, fb } = setup();
    fb.onDamage(result({ amount: 0, dealt: 0 }));
    expect(vfx.spawnEffect).toHaveBeenCalledWith('hit-spark', expect.anything(), { count: 24 });
  });
  it('heavy extras are placed on the ground under the hit, without a normal', () => {
    const vfx = { spawnEffect: vi.fn(), shake: vi.fn(), fovPunch: vi.fn(), pulseScreen: vi.fn() };
    const fb = new HitFeedback({ vfx: vfx as never, clock: { tick: 0, seconds: 0, hitStop: () => {} }, actors: { get: () => undefined, all: () => [], player: {} as never }, ground: () => 7 });
    fb.onDamage(result({ attackId: '1H_Melee_Attack_Chop', point: { x: 1, y: 1.5, z: 2 }, normal: { x: 1, y: 0, z: 0 } }));
    const scorch = vfx.spawnEffect.mock.calls.find((c) => c[0] === 'scorch-decal')!;
    expect(scorch[1]).toEqual({ position: { x: 1, y: 7, z: 2 } });
  });
  it('a parry flashes the screen and spawns the ring', () => {
    const { vfx, fb } = setup();
    fb.onDamage(result({ outcome: 'parried', dealt: 0 }));
    expect(vfx.pulseScreen).toHaveBeenCalled();
    expect(vfx.spawnEffect).toHaveBeenCalledWith('shockwave-ring', expect.anything());
  });
});
