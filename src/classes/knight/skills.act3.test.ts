import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { COMBAT } from '../../config/constants';
import { BastionWall, ExecutionersArc, HearthfireWard, type WallRequest } from './skills.act3';
import { BASTION_WALL, EXECUTIONERS_ARC } from './tuning';

// ---------------------------------------------------------------------------------------------------------------------
// Bastion Wall
// ---------------------------------------------------------------------------------------------------------------------

function wallRig(over: { classId?: string | null; learned?: boolean; dead?: boolean; blocked?: string | null; yaw?: number } = {}) {
  const st = { now: 0, broke: false, block: true, dead: over.dead ?? false, learned: over.learned ?? true, classId: over.classId === undefined ? null : over.classId, blocked: over.blocked ?? null };
  const flicker = vi.fn();
  const stop = vi.fn();
  const trig = vi.fn();
  const cones = { n: 0 };
  const wall = new BastionWall({
    now: () => st.now,
    playerId: () => 'player',
    classId: () => st.classId,
    learned: () => st.learned,
    dead: () => st.dead,
    feet: () => ({ x: 0, y: 0, z: 0 }),
    facingYaw: () => over.yaw ?? 0,
    blockHeld: () => st.block,
    blockedReason: () => st.blocked,
    guardBrokeThisTick: () => st.broke,
    cone: () => (cones.n++, { stop, flicker }),
    reportTrigger: trig,
    skillId: 'knight.bastionWall',
  });
  return { wall, st, flicker, stop, trig, coneCount: () => cones.n };
}

/** A request coming from straight ahead of a knight at yaw 0 (facing -z): the attacker is at -z, so the hit travels +z. */
const fromFront = (over: Partial<WallRequest> = {}): WallRequest => ({ amount: 100, poise: 50, outcome: 'hit', kind: 'melee', direction: { x: 0, z: 1 }, ...over });
const ally = (x: number, z: number, over: Record<string, unknown> = {}) => ({
  id: 'ally',
  team: 'ally',
  dead: false,
  worldPosition: (o: THREE.Vector3) => o.set(x, 0, z),
  ...over,
});
const knightTarget = { id: 'player', team: 'player', dead: false, worldPosition: (o: THREE.Vector3) => o.set(0, 0, 0) };

describe('Bastion Wall: casting', () => {
  it('succeeds, starts the cone and reports the trigger', () => {
    const r = wallRig();
    expect(r.wall.cast()).toEqual({ ok: true });
    expect(r.wall.active).toBe(true);
    expect(r.trig).toHaveBeenCalledWith('knight.bastionWall');
  });

  it.each([
    ['wrong class', { classId: 'warden' }, 'wrong-class'],
    ['not learned', { learned: false }, 'not-learned'],
    ['dead', { dead: true }, 'dead'],
    ['staggered', { blocked: 'staggered' }, 'staggered'],
  ])('refuses when %s', (_n, over, reason) => {
    const r = wallRig(over);
    expect(r.wall.cast()).toEqual({ ok: false, reason });
    expect(r.wall.active).toBe(false);
    expect(r.trig).not.toHaveBeenCalled();
  });

  it('accepts a null class and the knight class, and refuses a second cast while up', () => {
    expect(wallRig({ classId: 'knight' }).wall.cast()).toEqual({ ok: true });
    const r = wallRig({ classId: null });
    expect(r.wall.cast()).toEqual({ ok: true });
    expect(r.wall.cast()).toEqual({ ok: false, reason: 'active' });
  });
});

describe('Bastion Wall: cover', () => {
  it('blocks a front hit on the Knight and scales amount and poise by 0.2', () => {
    const r = wallRig();
    r.wall.cast();
    const q = fromFront();
    r.wall.cover(q, knightTarget);
    expect(q.outcome).toBe('blocked');
    expect(q.amount).toBeCloseTo(20);
    expect(q.poise).toBeCloseTo(10);
    expect(r.flicker).toHaveBeenCalledTimes(1);
  });

  it('headline: an ally within 6 m in the cone is covered; 6.1 m or behind the Knight is not', () => {
    const r = wallRig();
    r.wall.cast();
    for (const [x, z, covered] of [
      [3, -2, true],
      [0, -6, true],
      [6, 0, true],
      [0, -6.1, false],
      [6.1, 0, false],
      [0, 3, true], // behind the Knight but near: the Knight's facing decides the cone, not the ally's position
    ] as const) {
      const q = fromFront();
      r.wall.cover(q, ally(x, z), { x: 0, y: 0, z: -4 });
      expect(q.outcome, `${x},${z}`).toBe(covered ? 'blocked' : 'hit');
    }
    // A hit whose source is behind the Knight is not covered, for the Knight or an ally.
    const behind = fromFront({ direction: { x: 0, z: -1 } });
    r.wall.cover(behind, ally(0, -2), { x: 0, y: 0, z: 4 });
    expect(behind.outcome).toBe('hit');
    const behindSelf = fromFront({ direction: { x: 0, z: -1 } });
    r.wall.cover(behindSelf, knightTarget);
    expect(behindSelf.outcome).toBe('hit');
  });

  it('the cone edge is 60 degrees each side, inclusive', () => {
    const r = wallRig();
    r.wall.cast();
    // Source at angle a from the facing (-z): the hit travels from the source to the target.
    const src = (deg: number) => ({ x: Math.sin((deg * Math.PI) / 180), z: -Math.cos((deg * Math.PI) / 180) });
    for (const [deg, covered] of [
      [0, true],
      [59.9, true],
      [-59.9, true],
      [60, true],
      [60.5, false],
      [-61, false],
      [90, false],
    ] as const) {
      const s = src(deg);
      const q = fromFront({ direction: { x: -s.x, z: -s.z } });
      r.wall.cover(q, knightTarget);
      expect(q.outcome, `${deg}`).toBe(covered ? 'blocked' : 'hit');
    }
  });

  it('follows the Knight facing: at yaw 90 degrees the cone points along -x', () => {
    const r = wallRig({ yaw: Math.PI / 2 });
    r.wall.cast();
    const front = fromFront({ direction: { x: 1, z: 0 } });
    r.wall.cover(front, knightTarget);
    expect(front.outcome).toBe('blocked');
    const side = fromFront({ direction: { x: 0, z: 1 } });
    r.wall.cover(side, knightTarget);
    expect(side.outcome).toBe('hit');
  });

  it('a request without direction is not covered', () => {
    const r = wallRig();
    r.wall.cast();
    const q = fromFront({ direction: undefined });
    r.wall.cover(q, knightTarget);
    expect(q).toMatchObject({ outcome: 'hit', amount: 100, poise: 50 });
  });

  it('never acts on a status tick or an unblockable request', () => {
    const r = wallRig();
    r.wall.cast();
    for (const o of [{ kind: 'status' }, { unblockable: true }] as const) {
      const q = fromFront(o);
      r.wall.cover(q, knightTarget);
      expect(q, JSON.stringify(o)).toMatchObject({ outcome: 'hit', amount: 100 });
    }
  });

  it('does not scale a hit the guard already blocked twice, and a parry stays a parry', () => {
    const r = wallRig();
    r.wall.cast();
    const blocked = fromFront({ outcome: 'blocked', amount: 20, poise: 10 });
    r.wall.cover(blocked, knightTarget);
    expect(blocked).toMatchObject({ outcome: 'blocked', amount: 20, poise: 10 });
    const parried = fromFront({ outcome: 'parried', amount: 0, poise: 0 });
    r.wall.cover(parried, knightTarget);
    expect(parried).toMatchObject({ outcome: 'parried', amount: 0, poise: 0 });
    const immune = fromFront({ outcome: 'immune' });
    r.wall.cover(immune, knightTarget);
    expect(immune.outcome).toBe('immune');
  });

  it('does not cover a dead ally, a hostile or a neutral', () => {
    const r = wallRig();
    r.wall.cast();
    for (const t of [ally(0, -2, { dead: true }), ally(0, -2, { team: 'hostile' }), ally(0, -2, { team: 'neutral' })]) {
      const q = fromFront();
      r.wall.cover(q, t, { x: 0, y: 0, z: -4 });
      expect(q.outcome).toBe('hit');
    }
  });

  it('an ally hit is judged by where the attacker stands, not by the hit direction', () => {
    const r = wallRig(); // the Knight faces -z at the origin
    r.wall.cast();
    // A foe at (0,0,3) behind the Knight strikes an ally at (0,0,5) further behind: the hit travels +z, which reads as "from ahead".
    const behind = fromFront({ direction: { x: 0, z: 1 } });
    r.wall.cover(behind, ally(0, 5, {}), { x: 0, y: 0, z: 3 });
    expect(behind.outcome).toBe('hit');
    // A foe in front of the Knight at (2,0,-3) strikes an ally beside it at (4,0,-3) (hit travels +x, "from the side"): covered.
    const front = fromFront({ direction: { x: 1, z: 0 } });
    r.wall.cover(front, ally(4, -3), { x: 2, y: 0, z: -3 });
    expect(front.outcome).toBe('blocked');
    // Unknown attacker position: the ally is not covered; the Knight himself still is.
    const unknown = fromFront();
    r.wall.cover(unknown, ally(0, -2), null);
    expect(unknown.outcome).toBe('hit');
    const self = fromFront();
    r.wall.cover(self, knightTarget, null);
    expect(self.outcome).toBe('blocked');
  });

  it('a hit that broke the Knight guard stays a hit for him, while an ally is still covered', () => {
    const r = wallRig();
    r.wall.cast();
    r.st.broke = true;
    const self = fromFront();
    r.wall.cover(self, knightTarget);
    expect(self).toMatchObject({ outcome: 'hit', amount: 100, poise: 50 });
    const al = fromFront();
    r.wall.cover(al, ally(0, -2), { x: 0, y: 0, z: -4 });
    expect(al.outcome).toBe('blocked');
    r.st.broke = false;
    const next = fromFront();
    r.wall.cover(next, knightTarget);
    expect(next.outcome).toBe('blocked');
  });

  it('does nothing before the cast', () => {
    const r = wallRig();
    const q = fromFront();
    r.wall.cover(q, knightTarget);
    expect(q.outcome).toBe('hit');
  });
});

describe('Bastion Wall: release', () => {
  it('letting go of block does not end it: the cone stops, and holding again within 8 s covers again', () => {
    const r = wallRig();
    r.wall.cast();
    r.wall.tick();
    r.st.block = false;
    r.wall.tick();
    expect(r.wall.active).toBe(true);
    expect(r.stop).toHaveBeenCalledTimes(1);
    const up = fromFront();
    r.wall.cover(up, knightTarget);
    expect(up.outcome).toBe('hit');
    r.st.now = 3;
    r.st.block = true;
    r.wall.tick();
    expect(r.coneCount()).toBe(2);
    const q = fromFront();
    r.wall.cover(q, knightTarget);
    expect(q.outcome).toBe('blocked');
  });

  it('cast without block held starts the timer but no cone until block is pressed', () => {
    const r = wallRig();
    r.st.block = false;
    expect(r.wall.cast()).toEqual({ ok: true });
    expect(r.coneCount()).toBe(0);
    r.st.block = true;
    r.wall.tick();
    expect(r.coneCount()).toBe(1);
  });

  it('ends after 8 s, not before', () => {
    const r = wallRig();
    r.wall.cast();
    r.st.now = BASTION_WALL.seconds - 0.01;
    r.wall.tick();
    expect(r.wall.active).toBe(true);
    r.st.now = BASTION_WALL.seconds;
    r.wall.tick();
    expect(r.wall.active).toBe(false);
    const q = fromFront();
    r.wall.cover(q, knightTarget);
    expect(q.outcome).toBe('hit');
  });

  it.each([
    ['death', (s: ReturnType<typeof wallRig>['st']) => (s.dead = true)],
    ['a class change', (s: ReturnType<typeof wallRig>['st']) => (s.classId = 'warden')],
    ['unlearning', (s: ReturnType<typeof wallRig>['st']) => (s.learned = false)],
  ])('ends on %s', (_n, f) => {
    const r = wallRig();
    r.wall.cast();
    f(r.st);
    r.wall.tick();
    expect(r.wall.active).toBe(false);
  });

  it('clear() (a load) drops it and stops the effect once', () => {
    const r = wallRig();
    r.wall.cast();
    r.wall.clear();
    r.wall.clear();
    expect(r.wall.active).toBe(false);
    expect(r.stop).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Executioner's Arc
// ---------------------------------------------------------------------------------------------------------------------

function arcRig(over: { classId?: string | null; learned?: boolean; blocked?: string | null; clip?: boolean } = {}) {
  const foes: Array<Record<string, any>> = [];
  const applied: any[] = [];
  const st = { classId: over.classId === undefined ? null : over.classId, learned: over.learned ?? true, blocked: over.blocked ?? null, interrupted: false, clip: over.clip ?? true };
  const trig = vi.fn();
  const fx = vi.fn();
  const arc = new ExecutionersArc(
    {
      actors: { all: () => foes as never },
      damage: { apply: (r) => void applied.push(r) },
      classId: () => st.classId,
      learned: () => st.learned,
      feet: () => ({ x: 0, y: 0, z: 0 }),
      facingYaw: () => 0,
      blockedReason: () => st.blocked,
      playClip: () => st.clip,
      interrupted: () => st.interrupted,
      reportTrigger: trig,
      fx,
      skillId: 'knight.executionersArc',
    },
    () => 'player',
  );
  const foe = (id: string, x: number, z: number, extra: Record<string, unknown> = {}) => {
    const f = { id, team: 'hostile', dead: false, hittable: true, worldPosition: (o: THREE.Vector3) => o.set(x, 0, z), ...extra };
    foes.push(f);
    return f;
  };
  const run = (n: number) => {
    for (let i = 0; i < n; i++) arc.tick();
  };
  return { arc, foe, applied, st, trig, fx, run };
}

describe("Executioner's Arc", () => {
  it('uses 1.8x the base hit (the base the Charge doubles) with poise 30', () => {
    expect(EXECUTIONERS_ARC.damage).toBeCloseTo(COMBAT.baseDamage * 1.8);
    expect(EXECUTIONERS_ARC.poise).toBe(30);
  });

  it('hits every hostile within 3 m in the front half once, with the heavy numbers, in the hit window only', () => {
    const r = arcRig();
    r.foe('a', 0, -2);
    r.foe('b', 2.9, -0.2); // front edge of the half circle
    r.foe('c', 0, -3); // exactly 3 m
    r.foe('far', 0, -3.1);
    r.foe('behind', 0, 1);
    r.foe('side-behind', 2, 0.5);
    expect(r.arc.start()).toEqual({ ok: true });
    expect(r.trig).toHaveBeenCalledWith('knight.executionersArc');
    expect(r.fx).toHaveBeenCalledTimes(1);
    r.run(EXECUTIONERS_ARC.hitFromTick - 1);
    expect(r.applied).toHaveLength(0);
    r.run(EXECUTIONERS_ARC.ticks);
    expect(r.applied.map((x) => x.targetId).sort()).toEqual(['a', 'b', 'c']);
    for (const q of r.applied) expect(q).toMatchObject({ amount: EXECUTIONERS_ARC.damage, poise: 30, kind: 'melee', attackerId: 'player', attackId: 'knight.executionersArc' });
    expect(r.arc.chopping).toBe(false);
  });

  it('hits once per cast even though the window is several ticks long', () => {
    const r = arcRig();
    r.foe('a', 0, -1);
    r.arc.start();
    r.run(EXECUTIONERS_ARC.ticks);
    expect(r.applied).toHaveLength(1);
    r.arc.start();
    r.run(EXECUTIONERS_ARC.ticks);
    expect(r.applied).toHaveLength(2);
  });

  it('skips mercy-state foes, a throwing reader counts as none, and skips dead, unhittable and non-hostile actors', () => {
    const r = arcRig();
    r.foe('yield', 0, -1, { mercyState: () => 'yielding' });
    r.foe('stag', 0, -1, { mercyState: () => 'staggered' });
    r.foe('none', 0, -1, { mercyState: () => 'none' });
    r.foe('throws', 0, -1, { mercyState: () => { throw new Error('x'); } });
    r.foe('dead', 0, -1, { dead: true });
    r.foe('ghost', 0, -1, { hittable: false });
    r.foe('friend', 0, -1, { team: 'ally' });
    r.arc.start();
    r.run(EXECUTIONERS_ARC.ticks);
    expect(r.applied.map((x) => x.targetId).sort()).toEqual(['none', 'throws']);
  });

  it.each([
    ['wrong class', { classId: 'ashblade' }, 'wrong-class'],
    ['not learned', { learned: false }, 'not-learned'],
    ['dead', { blocked: 'dead' }, 'dead'],
    ['staggered', { blocked: 'staggered' }, 'staggered'],
    ['busy', { blocked: 'busy' }, 'busy'],
    ['the clip is refused', { clip: false }, 'busy'],
  ])('refuses when %s', (_n, over, reason) => {
    const r = arcRig(over);
    expect(r.arc.start()).toEqual({ ok: false, reason });
    expect(r.trig).not.toHaveBeenCalled();
    expect(r.arc.chopping).toBe(false);
  });

  it('refuses a second start while chopping', () => {
    const r = arcRig();
    r.arc.start();
    expect(r.arc.start()).toEqual({ ok: false, reason: 'chopping' });
  });

  it('a stagger, death or dodge before the window ends the chop with no damage; cancel clears it', () => {
    const r = arcRig();
    r.foe('a', 0, -1);
    r.arc.start();
    r.run(5);
    r.st.interrupted = true;
    r.run(EXECUTIONERS_ARC.ticks);
    expect(r.applied).toHaveLength(0);
    expect(r.arc.chopping).toBe(false);
    r.st.interrupted = false;
    r.arc.start();
    r.arc.cancel();
    r.run(EXECUTIONERS_ARC.ticks);
    expect(r.applied).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Hearthfire Ward
// ---------------------------------------------------------------------------------------------------------------------

function wardRig(over: { classId?: string | null; learned?: boolean } = {}) {
  const heals: Array<{ id: string; n: number }> = [];
  const actors: Array<Record<string, any>> = [];
  const add = (id: string, team: string, x: number, z: number, extra: Record<string, unknown> = {}) => {
    const a = { id, team, dead: false, maxHealth: 200, worldPosition: (o: THREE.Vector3) => o.set(x, 0, z), ...extra };
    actors.push(a);
    return a;
  };
  const fx = vi.fn();
  const ward = new HearthfireWard({
    actors: { all: () => actors as never },
    playerId: () => 'player',
    classId: () => (over.classId === undefined ? null : over.classId),
    learned: () => over.learned ?? true,
    heal: (id, n) => (heals.push({ id, n }), n),
    fx,
  });
  return { ward, add, heals, fx };
}

describe('Hearthfire Ward', () => {
  const at = { x: 0, y: 0, z: 0 };

  it('heals the player and live allies by 3% of their own max health', () => {
    const r = wardRig();
    r.add('player', 'player', 1, 0, { maxHealth: 100 });
    r.add('ally', 'ally', 2, 2, { maxHealth: 400 });
    expect(r.ward.pulse(at, 8)).toBe(2);
    expect(r.heals).toEqual([
      { id: 'player', n: 3 },
      { id: 'ally', n: 12 },
    ]);
    expect(r.fx).toHaveBeenCalledTimes(1);
  });

  it('boundary: 8 m is inclusive, 8.01 m is not', () => {
    const r = wardRig();
    r.add('in', 'ally', 8, 0);
    r.add('out', 'ally', 8.01, 0);
    r.add('player', 'player', 0, -8);
    r.ward.pulse(at, 8);
    expect(r.heals.map((h) => h.id).sort()).toEqual(['in', 'player']);
  });

  it('does not heal a dead ally, a hostile or a neutral', () => {
    const r = wardRig();
    r.add('dead', 'ally', 1, 0, { dead: true });
    r.add('foe', 'hostile', 1, 0);
    r.add('npc', 'neutral', 1, 0);
    r.add('player', 'player', 0, 0, { dead: true });
    expect(r.ward.pulse(at, 8)).toBe(0);
    expect(r.heals).toEqual([]);
  });

  it('does nothing when not learned or for another class', () => {
    for (const over of [{ learned: false }, { classId: 'warden' }]) {
      const r = wardRig(over);
      r.add('player', 'player', 0, 0);
      r.add('ally', 'ally', 1, 0);
      expect(r.ward.pulse(at, 8)).toBe(0);
      expect(r.heals).toEqual([]);
      expect(r.fx).not.toHaveBeenCalled();
    }
  });

  it('works for the knight class and uses the pulse radius it is given', () => {
    const r = wardRig({ classId: 'knight' });
    r.add('a', 'ally', 5, 0);
    r.ward.pulse(at, 4);
    expect(r.heals).toEqual([]);
    r.ward.pulse(at, 5);
    expect(r.heals).toHaveLength(1);
  });

  it('ignores a non-finite position', () => {
    const r = wardRig();
    r.add('a', 'ally', 0, 0);
    expect(r.ward.pulse({ x: NaN, y: 0, z: 0 }, 8)).toBe(0);
  });
});
