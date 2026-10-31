import { describe, expect, it, vi } from 'vitest';
import type { DamageRequest, DamageResult } from '../../actors/DamageResolver';
import type { PerceptionProvider } from '../../enemies/perceptionHook';
import { FlickerStrike, GhostOfTheHearth, ThousandSparks, type SparkFoe } from './capstones';
import { FLICKER_STRIKE, GHOST_OF_THE_HEARTH, SKILL, THOUSAND_SPARKS } from './tuning';

type V3 = { x: number; y: number; z: number };

/** A world the ports read: the player, the foes, the clock. Facing yaw 0 looks along -Z. */
function world() {
  const w = {
    t: 0,
    ashblade: true,
    learned: true,
    blocked: null as string | null,
    feet: { x: 0, y: 0, z: 0 },
    yaw: 0,
    foes: [] as SparkFoe[],
    interiorOf: (_p: V3): string | null => null,
    current: null as string | null,
    open: (_x: number, _z: number) => true,
    wall: (_o: V3, _d: V3, _max: number): number | null => null,
    applied: [] as DamageRequest[],
    teleports: [] as Array<{ to: V3; yaw: number }>,
    invuln: [] as Array<{ seconds: number; released: boolean }>,
    holds: [] as Array<{ x: number; z: number; speed: number } | null>,
    effects: [] as string[],
    triggers: [] as string[],
  };
  return w;
}
type World = ReturnType<typeof world>;

let nextId = 0;
const foe = (w: World, x: number, z: number, over: Partial<SparkFoe> = {}): SparkFoe => {
  const f: SparkFoe = { id: `foe${nextId++}`, x, y: 0, z, live: true, mercy: undefined, facing: { x: 0, z: -1 }, ...over };
  w.foes.push(f);
  return f;
};

const baseOf = (w: World) => ({
  playerId: () => 'player',
  isAshblade: () => w.ashblade,
  learned: () => w.learned,
  blockedReason: () => w.blocked,
  now: () => w.t,
  feet: () => ({ ...w.feet }),
  facingYaw: () => w.yaw,
  effect: (id: string) => (w.effects.push(id), null),
  reportTrigger: (id: string) => void w.triggers.push(id),
});

const sparksOf = (w: World, over: Record<string, unknown> = {}) =>
  new ThousandSparks({
    ...baseOf(w),
    foes: () => w.foes,
    interiorAt: (p) => w.interiorOf(p),
    currentInterior: () => w.current,
    isOpen: (x, z) => w.open(x, z),
    raycast: (origin, dir, max) => {
      if (dir.y === -1) return { distance: 1.5, point: { x: origin.x, y: 0, z: origin.z } };
      const d = w.wall(origin, dir, max);
      return d === null ? null : { distance: d, point: { x: origin.x + dir.x * d, y: origin.y, z: origin.z + dir.z * d } };
    },
    teleport: (to, yaw) => {
      w.teleports.push({ to, yaw });
      w.feet = { ...to };
    },
    arrive: () => undefined,
    invulnerable: (seconds) => {
      const rec = { seconds, released: false };
      w.invuln.push(rec);
      return () => void (rec.released = true);
    },
    apply: (req) => (w.applied.push(req), null),
    warn: () => undefined,
    ...over,
  });

/** Runs `seconds` of fixed ticks. */
const run = (w: World, update: () => void, seconds: number) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    w.t += 1 / 60;
    update();
  }
};

describe('Death by a Thousand Sparks', () => {
  it('hops 12 times over 3 s, nearest first and round robin, striking 0.6x with poise 5, invulnerable throughout', () => {
    const w = world();
    const a = foe(w, 0, -3);
    const b = foe(w, 4, -4);
    const c = foe(w, -3, -6);
    const s = sparksOf(w);
    expect(s.cast()).toEqual({ ok: true });
    expect(w.applied).toHaveLength(1);
    expect(w.invuln).toEqual([{ seconds: THOUSAND_SPARKS.seconds + 0.05, released: false }]);
    run(w, () => s.update(), 3.2);
    expect(w.applied).toHaveLength(12);
    expect(s.hopsDone).toBe(12);
    expect(s.active).toBe(false);
    expect(w.invuln[0].released).toBe(true);
    const ids = w.applied.map((r) => r.targetId);
    // The first hop goes to the nearest; every round of three strikes each foe once before any is struck again.
    expect(ids[0]).toBe(a.id);
    for (let i = 0; i < 12; i += 3) expect(new Set(ids.slice(i, i + 3)), `round ${i / 3}`).toEqual(new Set([a.id, b.id, c.id]));
    for (const r of w.applied) {
      expect(r).toMatchObject({ attackerId: 'player', amount: 6, poise: 5, kind: 'spell', attackId: THOUSAND_SPARKS.attackId });
    }
    expect(w.teleports).toHaveLength(12);
    expect(w.triggers).toEqual([SKILL.deathByAThousandSparks]);
  });

  it('measures the round from where the Ashblade stands: a foe out of range of the new spot is left out', () => {
    const w = world();
    const near = foe(w, 0, -3);
    const away = foe(w, 0, 6);
    const s = sparksOf(w);
    s.cast();
    // Landed behind `near`; `away` is 7 m from there, still in range, so the second hop goes to it.
    run(w, () => s.update(), 0.26);
    expect(w.applied.map((r) => r.targetId)).toEqual([near.id, away.id]);
    // Now behind `away` (z 7.2): `near` is 10.2 m off and out of range, so the round repeats on `away` alone.
    run(w, () => s.update(), 0.26);
    expect(w.applied[2].targetId).toBe(away.id);
  });

  it('hops every 0.25 s: one on the cast, the next a quarter second later', () => {
    const w = world();
    foe(w, 0, -3);
    const s = sparksOf(w);
    s.cast();
    run(w, () => s.update(), 0.24);
    expect(w.applied).toHaveLength(1);
    run(w, () => s.update(), 0.03);
    expect(w.applied).toHaveLength(2);
  });

  it('a lone foe is struck on every hop', () => {
    const w = world();
    const a = foe(w, 0, -4);
    const s = sparksOf(w);
    s.cast();
    run(w, () => s.update(), 3.1);
    expect(w.applied).toHaveLength(12);
    expect(new Set(w.applied.map((r) => r.targetId))).toEqual(new Set([a.id]));
  });

  it('lands behind the foe, looking at it', () => {
    const w = world();
    foe(w, 0, -5, { facing: { x: 0, z: 1 } });
    const s = sparksOf(w);
    s.cast();
    // The foe faces +Z (towards the player), so behind it is at z = -5 - 1.2.
    expect(w.teleports[0].to.z).toBeCloseTo(-6.2);
    expect(Math.abs(w.teleports[0].yaw)).toBeCloseTo(Math.PI);
  });

  it('refuses in another class, unlearned, dead, staggered and busy, spending nothing', () => {
    const cases: Array<[(w: World) => void, string]> = [
      [(w) => (w.ashblade = false), 'class'],
      [(w) => (w.learned = false), 'not-learned'],
      [(w) => (w.blocked = 'dead'), 'dead'],
      [(w) => (w.blocked = 'staggered'), 'staggered'],
      [(w) => (w.blocked = 'busy'), 'busy'],
    ];
    for (const [setup, reason] of cases) {
      const w = world();
      foe(w, 0, -3);
      setup(w);
      const s = sparksOf(w);
      expect(s.cast(), reason).toEqual({ ok: false, reason });
      expect(w.teleports, reason).toEqual([]);
      expect(w.invuln, reason).toEqual([]);
      expect(w.applied, reason).toEqual([]);
    }
  });

  it('is refused with no hostile within 10 m, and a foe exactly 10 m away counts', () => {
    const w = world();
    foe(w, 0, -10.01);
    const s = sparksOf(w);
    expect(s.cast()).toEqual({ ok: false, reason: 'no-target' });
    expect(w.invuln).toEqual([]);
    foe(w, 10, 0);
    expect(s.cast()).toEqual({ ok: true });
  });

  it('is refused with no landing at all (nothing spent), and a foe on another floor is out of range', () => {
    const w = world();
    foe(w, 0, -3);
    // Walls everywhere except on the Ashblade's own sight line (which starts at the origin): the foe is seen but has no landing.
    w.wall = (o) => (Math.hypot(o.x, o.z) < 0.01 ? null : 0.5);
    const s = sparksOf(w);
    expect(s.cast()).toEqual({ ok: false, reason: 'no-spot' });
    expect(w.teleports).toEqual([]);
    expect(w.invuln).toEqual([]);
    const w2 = world();
    foe(w2, 0, -3, { y: 3.5 });
    expect(sparksOf(w2).cast()).toEqual({ ok: false, reason: 'no-target' });
  });

  // A gate across the plane z = -2: a ray starting on the near side and heading to -Z is cut there.
  const gate = (o: V3, d: V3, max: number): number | null => {
    if (!(o.z > -2) || !(d.z < -1e-6)) return null;
    const hit = (o.z + 2) / -d.z;
    return hit <= max ? hit : null;
  };

  it('never hops to a foe with no line of sight (a wall or gate between chests), and takes the next one that is seen', () => {
    const w = world();
    const gated = foe(w, 0, -3);
    const seen = foe(w, 4, 3);
    w.wall = gate;
    const s = sparksOf(w);
    expect(s.cast()).toEqual({ ok: true });
    run(w, () => s.update(), 3.1);
    expect(w.applied.length).toBeGreaterThan(0);
    expect(w.applied.every((r) => r.targetId === seen.id)).toBe(true);
    expect(w.applied.some((r) => r.targetId === gated.id)).toBe(false);
    // Only a foe behind the gate: refused 'no-target', nothing spent.
    const w2 = world();
    foe(w2, 0, -3);
    w2.wall = gate;
    expect(sparksOf(w2).cast()).toEqual({ ok: false, reason: 'no-target' });
    expect(w2.teleports).toEqual([]);
    expect(w2.invuln).toEqual([]);
  });

  it('never chooses a foe in a mercy state, even the nearest', () => {
    const w = world();
    const calm = foe(w, 0, -2, { mercy: 'yielding' });
    const ok = foe(w, 0, -6);
    const s = sparksOf(w);
    s.cast();
    run(w, () => s.update(), 3.1);
    expect(w.applied.every((r) => r.targetId === ok.id)).toBe(true);
    expect(w.applied.some((r) => r.targetId === calm.id)).toBe(false);
    const w2 = world();
    foe(w2, 0, -2, { mercy: 'staggered' });
    expect(sparksOf(w2).cast()).toEqual({ ok: false, reason: 'no-target' });
  });

  it('a foe that turns to mercy mid-flurry is dropped from the round, and a dead one ends the run when it was the last', () => {
    const w = world();
    const a = foe(w, 0, -3);
    const b = foe(w, 3, 0);
    const s = sparksOf(w);
    s.cast();
    run(w, () => s.update(), 0.3);
    a.mercy = 'yielding';
    const before = w.applied.length;
    run(w, () => s.update(), 1);
    expect(w.applied.slice(before).every((r) => r.targetId === b.id)).toBe(true);
    b.live = false;
    run(w, () => s.update(), 0.3);
    expect(s.active).toBe(false);
    expect(w.invuln[0].released).toBe(true);
    const count = w.applied.length;
    run(w, () => s.update(), 2);
    expect(w.applied).toHaveLength(count);
  });

  it('a landing outside the open area is passed over; with none left the flurry ends where it stands', () => {
    const w = world();
    foe(w, 0, -3);
    const far = foe(w, 8, 0);
    w.open = (x) => x > 5;
    const s = sparksOf(w);
    expect(s.cast()).toEqual({ ok: true });
    expect(w.applied.every((r) => r.targetId === far.id)).toBe(true);
    w.open = () => false;
    run(w, () => s.update(), 0.3);
    expect(s.active).toBe(false);
    expect(w.invuln[0].released).toBe(true);
    expect(w.teleports).toHaveLength(1);
  });

  it('never lands into or out of an interior, and does not chase a foe indoors from outside', () => {
    const w = world();
    foe(w, 0, -3);
    const outdoors = foe(w, 5, 0);
    w.interiorOf = (p) => (p.z < -2 ? 'cellar' : null);
    const s = sparksOf(w);
    expect(s.cast()).toEqual({ ok: true });
    expect(w.applied[0].targetId).toBe(outdoors.id);
    for (const t of w.teleports) expect(w.interiorOf(t.to)).toBeNull();
    // Stepping out of the cast's space mid-flurry ends it.
    w.current = 'cellar';
    run(w, () => s.update(), 0.3);
    expect(s.active).toBe(false);
  });

  it('a wall between the Ashblade and the landing skips that foe', () => {
    const w = world();
    foe(w, 0, -3);
    const clear = foe(w, 6, 0);
    w.wall = (o) => (o.z < -1 ? 1 : null);
    const s = sparksOf(w);
    s.cast();
    expect(w.applied[0].targetId).toBe(clear.id);
  });

  it('ends and releases the invulnerability on death, a class change, losing the skill and reset', () => {
    for (const how of ['dead', 'class', 'unlearn', 'end'] as const) {
      const w = world();
      foe(w, 0, -3);
      const s = sparksOf(w);
      s.cast();
      if (how === 'dead') w.blocked = 'dead';
      if (how === 'class') w.ashblade = false;
      if (how === 'unlearn') w.learned = false;
      if (how === 'end') s.end();
      run(w, () => s.update(), 0.3);
      expect(s.active, how).toBe(false);
      expect(w.invuln[0].released, how).toBe(true);
      expect(w.applied, how).toHaveLength(1);
    }
  });

  it('cannot be cast while running', () => {
    const w = world();
    foe(w, 0, -3);
    const s = sparksOf(w);
    s.cast();
    expect(s.cast()).toEqual({ ok: false, reason: 'active' });
  });

  it('warns once when the invulnerability hook is absent and still runs', () => {
    const w = world();
    foe(w, 0, -3);
    const warn = vi.fn();
    const s = sparksOf(w, { invulnerable: () => null, warn });
    s.cast();
    run(w, () => s.update(), 3.1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(w.applied).toHaveLength(12);
  });
});

// ---- Ghost of the Hearth -----------------------------------------------------------------------------------------------

function ghostRig(w: World, over: Record<string, unknown> = {}) {
  const providers: PerceptionProvider[] = [];
  const noise = new Map<string, number>();
  const rig = { swinging: false, bosses: new Set<string>(), providers, noise };
  const ghost = new GhostOfTheHearth({
    ...baseOf(w),
    stealth: () => ({ addNoiseScale: (s: string, v: number) => (noise.set(s, v), () => void noise.delete(s)) }),
    perception: () => ({
      register: (p: PerceptionProvider) => {
        providers.push(p);
        return () => void providers.splice(providers.indexOf(p), 1);
      },
    }),
    swinging: () => rig.swinging,
    isBoss: (id: string) => rig.bosses.has(id),
    warn: () => undefined,
    ...over,
  });
  return { ghost, ...rig, rig };
}
const pose = (state: string) => ({ state, feet: { x: 0, y: 0, z: 0 }, yaw: 0, observerOnly: false }) as never;
const target = (over: Record<string, unknown> = {}) => ({ id: 'foe', health: 80, mercyState: () => 'none', ...over }) as never;
const meleeReq = (over: Record<string, unknown> = {}) => ({ attackerId: 'player', targetId: 'foe', amount: 10, poise: 10, kind: 'melee', outcome: 'hit', ...over }) as never;
const dealt = (over: Record<string, unknown> = {}) => ({ attackerId: 'player', targetId: 'foe', outcome: 'hit', ...over }) as unknown as DamageResult;

describe('Ghost of the Hearth', () => {
  it('gives sight 0 and hearing 0 to unalerted watchers of the player only, with noise 0, and lets go at 12 s', () => {
    const w = world();
    const g = ghostRig(w);
    expect(g.ghost.cast()).toEqual({ ok: true });
    expect(g.noise.get(GHOST_OF_THE_HEARTH.noiseSource)).toBe(0);
    expect(g.providers).toHaveLength(1);
    const p = g.providers[0];
    for (const s of ['idle', 'patrol', 'wander']) {
      expect(p.modifiers('player', pose(s)), s).toMatchObject({ sightRangeScale: 0, hearingQuietScale: 0, hearingLoudScale: 0, coneScale: 1 });
    }
    for (const s of ['notice', 'chase', 'telegraph', 'attack', 'recover', 'stagger']) expect(p.modifiers('player', pose(s)), s).toBeNull();
    expect(p.modifiers('someone-else', pose('idle'))).toBeNull();
    run(w, () => g.ghost.update(), 11.9);
    expect(g.providers).toHaveLength(1);
    run(w, () => g.ghost.update(), 0.2);
    expect(g.providers).toHaveLength(0);
    expect(g.noise.size).toBe(0);
    expect(g.ghost.hidden).toBe(false);
    expect(g.ghost.armed).toBe(false);
    // Whatever provider the hub still held would now return nothing.
    expect(p.modifiers('player', pose('idle'))).toBeNull();
  });

  it('refuses in another class, unlearned, dead, staggered, busy and with no stealth service', () => {
    const cases: Array<[(w: World) => void, string]> = [
      [(w) => (w.ashblade = false), 'class'],
      [(w) => (w.learned = false), 'not-learned'],
      [(w) => (w.blocked = 'dead'), 'dead'],
      [(w) => (w.blocked = 'staggered'), 'staggered'],
      [(w) => (w.blocked = 'busy'), 'busy'],
    ];
    for (const [setup, reason] of cases) {
      const w = world();
      setup(w);
      const g = ghostRig(w);
      expect(g.ghost.cast(), reason).toEqual({ ok: false, reason });
      expect(g.providers, reason).toHaveLength(0);
    }
    const w = world();
    const g = ghostRig(w, { stealth: () => undefined, perception: () => undefined });
    expect(g.ghost.cast()).toEqual({ ok: false, reason: 'no-stealth' });
  });

  it('works with only one of the two services (a warning for the missing perception)', () => {
    const w = world();
    const warn = vi.fn();
    const g = ghostRig(w, { perception: () => undefined, warn });
    expect(g.ghost.cast()).toEqual({ ok: true });
    expect(g.noise.get(GHOST_OF_THE_HEARTH.noiseSource)).toBe(0);
    expect(warn).toHaveBeenCalledTimes(1);
    const w2 = world();
    const g2 = ghostRig(w2, { stealth: () => undefined });
    expect(g2.ghost.cast()).toEqual({ ok: true });
    expect(g2.providers).toHaveLength(1);
  });

  it('the first blow raises the hit to the foe\'s current health, then the Ghost is spent', () => {
    const w = world();
    const g = ghostRig(w);
    g.ghost.cast();
    const req = meleeReq();
    g.ghost.modifier(req, target({ health: 80 }), null);
    expect((req as unknown as { amount: number }).amount).toBe(80);
    g.ghost.onDealt(dealt());
    expect(g.ghost.armed).toBe(false);
    expect(g.providers).toHaveLength(0);
    expect(g.noise.size).toBe(0);
    expect(w.effects).toContain(GHOST_OF_THE_HEARTH.flashEffectId);
    const second = meleeReq();
    g.ghost.modifier(second, target({ health: 80 }), null);
    expect((second as unknown as { amount: number }).amount).toBe(10);
  });

  it('a foe that can yield is raised to exactly 1 HP left with its poise broken; a bigger hit is cut to 1 HP left', () => {
    const w = world();
    const g = ghostRig(w, { canYield: (id: string) => id === 'foe' });
    g.ghost.cast();
    const req = meleeReq({ amount: 500, poise: 3 });
    g.ghost.modifier(req, target({ health: 80, poise: 20 }), null);
    expect(req as unknown as { amount: number; poise: number }).toMatchObject({ amount: 79, poise: 20 });
    const small = meleeReq({ amount: 10, poise: 50 });
    g.ghost.modifier(small, target({ health: 80, poise: 20 }), null);
    expect(small as unknown as { amount: number; poise: number }).toMatchObject({ amount: 79, poise: 50 });
    const other = meleeReq({ targetId: 'x' });
    g.ghost.modifier(other, target({ id: 'x', health: 80, poise: 20 }), null);
    expect((other as unknown as { amount: number }).amount).toBe(80);
  });

  it('the late clamp keeps a yield-capable foe at 1 HP after a later multiplier (Wyrmbreaker crack) and leaves other foes alone', () => {
    const w = world();
    const g = ghostRig(w, { canYield: (id: string) => id === 'foe' });
    g.ghost.cast();
    const req = meleeReq({ amount: 10 });
    const foe = target({ health: 80, poise: 20 });
    g.ghost.modifier(req, foe, null);
    (req as unknown as { amount: number }).amount *= 1.25;
    g.ghost.clamp(req, foe, null);
    expect((req as unknown as { amount: number }).amount).toBe(79);
    const other = meleeReq({ targetId: 'x', amount: 500 });
    g.ghost.clamp(other, target({ id: 'x', health: 80 }), null);
    expect((other as unknown as { amount: number }).amount).toBe(500);
  });

  it('never lowers a bigger hit, and ignores bosses, mercy-state foes, other attackers, spells, blocked hits and foes with no health', () => {
    const w = world();
    const g = ghostRig(w);
    g.ghost.cast();
    g.rig.bosses.add('boss');
    const amount = (req: unknown) => (req as { amount: number }).amount;
    const big = meleeReq({ amount: 200 });
    g.ghost.modifier(big, target({ health: 80 }), null);
    expect(amount(big)).toBe(200);
    g.ghost.onDealt(dealt());
    expect(g.ghost.armed).toBe(false);
    g.ghost.cast();
    const cases: Array<[unknown, unknown]> = [
      [meleeReq({ targetId: 'boss' }), target({ id: 'boss' })],
      [meleeReq(), target({ mercyState: () => 'yielding' })],
      [meleeReq(), target({ mercyState: () => 'staggered' })],
      [meleeReq({ attackerId: 'foe2' }), target()],
      [meleeReq({ kind: 'spell' }), target()],
      [meleeReq({ kind: 'script' }), target()],
      [meleeReq({ kind: 'status' }), target()],
      [meleeReq({ outcome: 'blocked' }), target()],
      [meleeReq(), target({ health: 0 })],
    ];
    for (const [req, t] of cases) {
      g.ghost.modifier(req as never, t as never, null);
      expect(amount(req), JSON.stringify(req)).toBe(10);
    }
    // A hit on a boss did not spend it: the next foe still falls.
    expect(g.ghost.armed).toBe(true);
    const next = meleeReq();
    g.ghost.modifier(next, target({ health: 55 }), null);
    expect(amount(next)).toBe(55);
  });

  it('a boosted hit that came out blocked does not spend it', () => {
    const w = world();
    const g = ghostRig(w);
    g.ghost.cast();
    g.ghost.modifier(meleeReq(), target(), null);
    g.ghost.onDealt(dealt({ outcome: 'blocked' }));
    expect(g.ghost.armed).toBe(true);
  });

  it('the first attack makes the player seen at once but the swing keeps its strike for 1.5 s', () => {
    const w = world();
    const g = ghostRig(w);
    g.ghost.cast();
    run(w, () => g.ghost.update(), 2);
    g.rig.swinging = true;
    run(w, () => g.ghost.update(), 1 / 60);
    expect(g.providers).toHaveLength(0);
    expect(g.noise.size).toBe(0);
    expect(g.ghost.hidden).toBe(false);
    expect(g.ghost.armed).toBe(true);
    const req = meleeReq();
    g.ghost.modifier(req, target({ health: 70 }), null);
    expect((req as unknown as { amount: number }).amount).toBe(70);
    g.ghost.onDealt(dealt());
    expect(g.ghost.armed).toBe(false);
  });

  it('a swing that hits nothing wastes the strike after the grace time, and the Ghost is gone', () => {
    const w = world();
    const g = ghostRig(w);
    g.ghost.cast();
    g.rig.swinging = true;
    run(w, () => g.ghost.update(), 1.4);
    expect(g.ghost.armed).toBe(true);
    run(w, () => g.ghost.update(), 0.2);
    expect(g.ghost.armed).toBe(false);
    const req = meleeReq();
    g.ghost.modifier(req, target(), null);
    expect((req as unknown as { amount: number }).amount).toBe(10);
  });

  it('the grace never runs past the 12 s cap', () => {
    const w = world();
    const g = ghostRig(w);
    g.ghost.cast();
    run(w, () => g.ghost.update(), 11.5);
    g.rig.swinging = true;
    run(w, () => g.ghost.update(), 0.6);
    expect(g.ghost.armed).toBe(false);
  });

  it('a skill, a spell cast, death, a class change, an unlearn and reset end it; its own ability event does not', () => {
    for (const how of ['skill', 'spell', 'dead', 'class', 'unlearn', 'reset'] as const) {
      const w = world();
      const g = ghostRig(w);
      g.ghost.cast();
      g.ghost.onSkillUsed(SKILL.ghostOfTheHearth);
      expect(g.ghost.hidden, how).toBe(true);
      if (how === 'skill') g.ghost.onSkillUsed(SKILL.flickerStrike);
      if (how === 'spell') g.ghost.onSpellCast();
      if (how === 'dead') w.blocked = 'dead';
      if (how === 'class') w.ashblade = false;
      if (how === 'unlearn') w.learned = false;
      if (how === 'reset') g.ghost.end();
      run(w, () => g.ghost.update(), 0.1);
      expect(g.ghost.hidden, how).toBe(false);
      expect(g.ghost.armed, how).toBe(false);
      expect(g.providers, how).toHaveLength(0);
      expect(g.noise.size, how).toBe(0);
      const req = meleeReq();
      g.ghost.modifier(req, target(), null);
      expect((req as unknown as { amount: number }).amount, how).toBe(10);
    }
  });

  it('a recast restarts the 12 s without a second provider', () => {
    const w = world();
    const g = ghostRig(w);
    g.ghost.cast();
    run(w, () => g.ghost.update(), 8);
    g.ghost.cast();
    expect(g.providers).toHaveLength(1);
    run(w, () => g.ghost.update(), 8);
    expect(g.providers).toHaveLength(1);
    run(w, () => g.ghost.update(), 4.1);
    expect(g.providers).toHaveLength(0);
  });
});

// ---- Flicker Strike ----------------------------------------------------------------------------------------------------

function flickerRig(w: World, over: Record<string, unknown> = {}) {
  const rig = { dodging: false, interrupted: false, hold: null as { x: number; z: number; speed: number } | null, applyResults: 0 };
  const flicker = new FlickerStrike({
    ...baseOf(w),
    foes: () => w.foes,
    isOpen: (x, z) => w.open(x, z),
    interiorAt: (p) => w.interiorOf(p),
    hold: (m) => {
      rig.hold = m;
      w.holds.push(m);
    },
    invulnerable: (seconds) => {
      const rec = { seconds, released: false };
      w.invuln.push(rec);
      return () => void (rec.released = true);
    },
    dodging: () => rig.dodging,
    interrupted: () => rig.interrupted,
    apply: (req) => (w.applied.push(req), null),
    warn: () => undefined,
    ...over,
  });
  /** One fixed tick: the verbs move the player along the hold, then the class steps. */
  const tick = () => {
    w.t += 1 / 60;
    if (rig.hold) {
      w.feet = { ...w.feet, x: w.feet.x + rig.hold.x * (rig.hold.speed / 60), z: w.feet.z + rig.hold.z * (rig.hold.speed / 60) };
    }
    flicker.update();
  };
  const ticks = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds * 60); i++) tick();
  };
  /** A dodge press: the action starts, runs `length` seconds, then ends. */
  const dodge = (length = 0.4) => {
    rig.dodging = true;
    ticks(length);
    rig.dodging = false;
  };
  return { flicker, rig, tick, ticks, dodge };
}

describe('Flicker Strike', () => {
  it('dashes 6 m in 0.25 s, invulnerable, hitting each foe passed once for 1.2x and skipping mercy foes, those behind and those to the side', () => {
    const w = world();
    const a = foe(w, 0, -2);
    const b = foe(w, 0.5, -4.5);
    const calm = foe(w, 0, -3, { mercy: 'yielding' });
    const behind = foe(w, 0, 3);
    const side = foe(w, 3, -3);
    const far = foe(w, 0, -9);
    const f = flickerRig(w);
    expect(f.flicker.cast()).toEqual({ ok: true });
    expect(w.holds[0]).toEqual({ x: -0, z: -1, speed: 24 });
    expect(w.invuln).toEqual([{ seconds: 15 / 60 + 0.05, released: false }]);
    f.ticks(0.3);
    const ids = w.applied.map((r) => r.targetId);
    expect(ids).toEqual([a.id, b.id]);
    expect(ids).not.toContain(calm.id);
    expect(ids).not.toContain(behind.id);
    expect(ids).not.toContain(side.id);
    expect(ids).not.toContain(far.id);
    for (const r of w.applied) expect(r).toMatchObject({ attackerId: 'player', amount: 12, kind: 'melee', attackId: FLICKER_STRIKE.attackId });
    expect(w.feet.z).toBeCloseTo(-6, 5);
    expect(w.holds[w.holds.length - 1]).toBeNull();
    expect(w.invuln[0].released).toBe(true);
    expect(f.flicker.dashing).toBe(false);
    expect(w.triggers).toEqual([SKILL.flickerStrike]);
  });

  it('ground probe: the dash stops before a drop larger than the allowed step (a ledge 2 m ahead), and a slope down is fine', () => {
    // Ground at y 0 up to z = -2, then a 3 m drop.
    const ledge = (origin: V3, _dir: V3, _max: number) => ({ distance: 1.5, point: { x: origin.x, y: origin.z > -2 ? 0 : -3, z: origin.z } });
    const w = world();
    const f = flickerRig(w, { raycast: ledge });
    expect(f.flicker.cast()).toEqual({ ok: true });
    // The last grounded 0.5 m sample is z = -1.5: 1.5 m, so the speed is 1.5 m over 0.25 s.
    expect(w.holds[0]).toEqual({ x: -0, z: -1, speed: 6 });
    f.ticks(0.3);
    expect(w.feet.z).toBeCloseTo(-1.5, 5);
    // A gentle slope (0.4 m per 0.5 m step) is walked down in full.
    const w2 = world();
    const slope = (origin: V3) => ({ distance: 1.5, point: { x: origin.x, y: Math.max(-2.4, origin.z * 0.8), z: origin.z } });
    const g = flickerRig(w2, { raycast: slope });
    expect(g.flicker.cast()).toEqual({ ok: true });
    expect(w2.holds[0]).toMatchObject({ speed: 24 });
    // No ground at all ahead (a void): refused, nothing spent.
    const w3 = world();
    const h = flickerRig(w3, { raycast: () => null });
    expect(h.flicker.cast()).toEqual({ ok: false, reason: 'blocked' });
    expect(w3.holds).toEqual([]);
    expect(w3.invuln).toEqual([]);
  });

  it('a foe in front is hit once even though the dash passes it over several ticks', () => {
    const w = world();
    foe(w, 0, -3);
    const f = flickerRig(w);
    f.flicker.cast();
    f.ticks(0.3);
    expect(w.applied).toHaveLength(1);
  });

  it('refuses in another class, unlearned, dead, staggered, busy; spends nothing', () => {
    const cases: Array<[(w: World) => void, string]> = [
      [(w) => (w.ashblade = false), 'class'],
      [(w) => (w.learned = false), 'not-learned'],
      [(w) => (w.blocked = 'dead'), 'dead'],
      [(w) => (w.blocked = 'staggered'), 'staggered'],
      [(w) => (w.blocked = 'busy'), 'busy'],
    ];
    for (const [setup, reason] of cases) {
      const w = world();
      setup(w);
      const f = flickerRig(w);
      expect(f.flicker.cast(), reason).toEqual({ ok: false, reason });
      expect(w.holds, reason).toEqual([]);
      expect(w.invuln, reason).toEqual([]);
    }
  });

  it('stops at the edge of the open area: a shorter dash at the same 0.25 s, or a refusal when the edge is under 1 m away', () => {
    const w = world();
    w.open = (_x, z) => z > -3.2;
    const f = flickerRig(w);
    expect(f.flicker.cast()).toEqual({ ok: true });
    expect(w.holds[0]!.speed).toBeCloseTo(12);
    f.ticks(0.3);
    expect(w.feet.z).toBeCloseTo(-3, 5);
    expect(w.open(w.feet.x, w.feet.z)).toBe(true);
    const w2 = world();
    w2.open = (_x, z) => z > -0.8;
    const f2 = flickerRig(w2);
    expect(f2.flicker.cast()).toEqual({ ok: false, reason: 'blocked' });
    expect(w2.holds).toEqual([]);
    expect(w2.invuln).toEqual([]);
  });

  it('never dashes into or out of an interior', () => {
    const w = world();
    w.interiorOf = (p) => (p.z < -4 ? 'hall' : null);
    const f = flickerRig(w);
    f.flicker.cast();
    f.ticks(0.3);
    expect(w.feet.z).toBeGreaterThanOrEqual(-4);
    expect(w.interiorOf(w.feet)).toBeNull();
    const w2 = world();
    w2.interiorOf = () => 'hall';
    w2.interiorOf = (p) => (p.z > -4.2 ? 'hall' : null);
    const f2 = flickerRig(w2);
    f2.flicker.cast();
    f2.ticks(0.3);
    expect(w2.interiorOf(w2.feet)).toBe('hall');
  });

  it('a dodge press within 1.5 s of a dash that hit something dashes again when the dodge ends, no extra cost', () => {
    const w = world();
    foe(w, 0, -3);
    foe(w, 0, -9);
    const f = flickerRig(w);
    f.flicker.cast();
    f.ticks(0.3);
    expect(f.flicker.windowOpen).toBe(true);
    f.ticks(0.5);
    f.rig.dodging = true;
    f.ticks(0.1);
    expect(f.flicker.pending).toBe(true);
    expect(f.flicker.dashCount).toBe(1);
    f.rig.dodging = false;
    f.ticks(0.02);
    expect(f.flicker.dashCount).toBe(2);
    expect(f.flicker.dashing).toBe(true);
    expect(w.effects).toContain(FLICKER_STRIKE.pingEffectId);
    f.ticks(0.3);
    // The second dash hit the second foe: another window.
    expect(w.applied.map((r) => r.targetId)).toHaveLength(2);
    expect(f.flicker.windowOpen).toBe(true);
    expect(w.triggers).toEqual([SKILL.flickerStrike]);
  });

  it('a dodge after the window closes does nothing, and a dash that hit nothing opens no window', () => {
    const w = world();
    foe(w, 0, -3);
    const f = flickerRig(w);
    f.flicker.cast();
    f.ticks(0.3);
    f.ticks(1.4);
    expect(f.flicker.windowOpen).toBe(true);
    f.ticks(0.2);
    expect(f.flicker.windowOpen).toBe(false);
    f.dodge();
    f.ticks(0.5);
    expect(f.flicker.dashCount).toBe(1);

    const w2 = world();
    const f2 = flickerRig(w2);
    f2.flicker.cast();
    f2.ticks(0.3);
    expect(f2.flicker.windowOpen).toBe(false);
    f2.dodge();
    f2.ticks(0.5);
    expect(f2.flicker.dashCount).toBe(1);
  });

  it('a press at the very end of the window still dashes once the dodge is over; one that cannot start for a second is dropped', () => {
    const w = world();
    foe(w, 0, -3);
    const f = flickerRig(w);
    f.flicker.cast();
    f.ticks(0.3);
    f.ticks(1.4);
    f.dodge(0.5);
    f.ticks(0.1);
    expect(f.flicker.dashCount).toBe(2);

    const w2 = world();
    foe(w2, 0, -3);
    const f2 = flickerRig(w2);
    f2.flicker.cast();
    f2.ticks(0.3);
    f2.rig.dodging = true;
    f2.ticks(0.1);
    expect(f2.flicker.pending).toBe(true);
    w2.blocked = 'busy';
    f2.rig.dodging = false;
    f2.ticks(2.7);
    expect(f2.flicker.pending).toBe(false);
    expect(f2.flicker.dashCount).toBe(1);
  });

  it('the chain stops at 5 dashes', () => {
    const w = world();
    // A foe at every stride: each dash hits one, because the player moves 6 m a dash and the foes sit 3 m ahead of each start.
    for (let i = 0; i < 8; i++) foe(w, 0, -3 - i * 6);
    const f = flickerRig(w);
    f.flicker.cast();
    f.ticks(0.3);
    for (let n = 2; n <= 8; n++) {
      f.dodge(0.2);
      f.ticks(0.1);
      f.ticks(0.3);
      expect(f.flicker.dashCount).toBe(Math.min(n, 5));
    }
    expect(f.flicker.dashCount).toBe(5);
    expect(w.applied).toHaveLength(5);
    expect(f.flicker.windowOpen).toBe(false);
    f.dodge();
    f.ticks(0.5);
    expect(f.flicker.dashCount).toBe(5);
  });

  it('a stagger, a death or a dodge during the dash ends it, releases the hold and the invulnerability and opens no window', () => {
    for (const how of ['interrupt', 'dead', 'class'] as const) {
      const w = world();
      foe(w, 0, -1);
      const f = flickerRig(w);
      f.flicker.cast();
      f.ticks(0.05);
      if (how === 'interrupt') f.rig.interrupted = true;
      if (how === 'dead') w.blocked = 'dead';
      if (how === 'class') w.ashblade = false;
      f.ticks(0.1);
      expect(f.flicker.dashing, how).toBe(false);
      expect(w.holds[w.holds.length - 1], how).toBeNull();
      expect(w.invuln[0].released, how).toBe(true);
      expect(f.flicker.windowOpen, how).toBe(false);
    }
  });

  it('reset clears a running dash, a window and a queued dash', () => {
    const w = world();
    foe(w, 0, -3);
    const f = flickerRig(w);
    f.flicker.cast();
    f.ticks(0.1);
    f.flicker.reset();
    expect(f.flicker.dashing).toBe(false);
    expect(w.holds[w.holds.length - 1]).toBeNull();
    f.ticks(0.3);
    f.flicker.cast();
    f.ticks(0.3);
    f.rig.dodging = true;
    f.ticks(0.1);
    expect(f.flicker.pending).toBe(true);
    f.flicker.reset();
    f.rig.dodging = false;
    f.ticks(0.5);
    expect(f.flicker.pending).toBe(false);
    expect(f.flicker.windowOpen).toBe(false);
  });

  it('cannot be cast mid-dash', () => {
    const w = world();
    const f = flickerRig(w);
    f.flicker.cast();
    expect(f.flicker.cast()).toEqual({ ok: false, reason: 'active' });
  });
});
