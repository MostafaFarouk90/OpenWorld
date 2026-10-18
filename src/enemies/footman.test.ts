import type * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { FIXED_TIMESTEP } from '../config/constants';
import { Guard } from './ai/guard';
import { pairGoal } from './ai/pair';
import { EnemyManager } from './EnemyManager';
import { FakeHost, loadKnight } from './testing/fakeHost';
import { GUARD, PAIR } from './tuning';
import type { SpawnerDef } from './types';

const DT = FIXED_TIMESTEP;
let gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] };
beforeAll(async () => {
  gltf = await loadKnight();
});

describe('Guard', () => {
  it('rolls the chance every rollSeconds while it may guard, and stays down otherwise', () => {
    const g = new Guard(0.5);
    const rolls = [0.1, 0.9, 0.2];
    let i = 0;
    const rng = () => rolls[i++]!;
    g.step(DT, true, rng);
    expect(g.up).toBe(true);
    g.step(GUARD.rollSeconds - 2 * DT, true, rng);
    expect(g.up).toBe(true); // not rolled again yet
    g.step(0.1, true, rng);
    expect(g.up).toBe(false); // 0.9 >= 0.5
    g.step(GUARD.rollSeconds, true, rng);
    expect(g.up).toBe(true);
    g.step(DT, false, rng);
    expect(g.up).toBe(false); // swinging or staggered: shield down at once
  });

  it('classifies front, heavy, back and side hits', () => {
    const g = new Guard(1);
    g.step(DT, true, () => 0);
    expect(g.up).toBe(true);
    expect(g.classify(false, 0)).toBe('blocked');
    expect(g.classify(true, 0)).toBe('broken'); // judged before the poise scaling
    expect(g.classify(false, GUARD.arcDegrees)).toBe('blocked');
    expect(g.classify(false, GUARD.arcDegrees + 1)).toBe('open');
    expect(g.classify(false, 180 - GUARD.backDegrees)).toBe('back'); // exactly on the boundary counts as the back
    expect(g.classify(true, 180)).toBe('back'); // a heavy hit from behind is just a back hit
  });

  it('a guard that is down blocks nothing, but the back is still weak', () => {
    const g = new Guard(0);
    g.step(DT, true, () => 0.99);
    expect(g.classify(false, 0)).toBe('open');
    expect(g.classify(false, 170)).toBe('back');
  });

  it('a broken guard stays down for brokenSeconds even when it rolls up', () => {
    const g = new Guard(1);
    g.break();
    expect(g.broken).toBe(true);
    g.step(GUARD.brokenSeconds / 2, true, () => 0);
    expect(g.up).toBe(false);
    g.step(GUARD.brokenSeconds, true, () => 0);
    expect(g.broken).toBe(false);
    expect(g.up).toBe(true);
  });
});

describe('pairGoal', () => {
  const target = { x: 0, z: -10 };
  it('sends the two partners to opposite flanks', () => {
    const a = { x: -1, z: 0 };
    const b = { x: 1, z: 0 };
    const ga = pairGoal(a, b, target, 'a', 'b');
    const gb = pairGoal(b, a, target, 'b', 'a');
    expect(ga.x).not.toBeCloseTo(gb.x);
    expect(Math.sign(ga.x - target.x)).toBe(-Math.sign(gb.x - target.x));
  });
  it('returns the target without a partner, with a far partner, or with identical keys', () => {
    const self = { x: 0, z: 0 };
    expect(pairGoal(self, null, target, 'a', 'b')).toBe(target);
    expect(pairGoal(self, { x: PAIR.maxPartnerDistance + 1, z: 0 }, target, 'a', 'b')).toBe(target);
    expect(pairGoal(self, { x: 1, z: 0 }, target, 'a', 'a')).toBe(target);
  });
  it('closes in: no offset once inside closeIn, and no NaN on top of the target or a partner', () => {
    const near = { x: 0, z: -PAIR.closeIn + 0.5 };
    expect(pairGoal({ x: 0, z: 0 }, { x: 1, z: 0 }, near, 'a', 'b')).toBe(near);
    const same = pairGoal({ x: 0, z: 0 }, { x: 0, z: 0 }, target, 'a', 'b');
    expect(Number.isFinite(same.x) && Number.isFinite(same.z)).toBe(true);
    expect(pairGoal({ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 0, z: 0 }, 'a', 'b')).toEqual({ x: 0, z: 0 });
  });
  it('the flank offset fades in with distance', () => {
    const p = { x: 1, z: 0 };
    const near = pairGoal({ x: 0, z: 0 }, p, { x: 0, z: -PAIR.closeIn - 1 }, 'a', 'b');
    const far = pairGoal({ x: 0, z: 0 }, p, { x: 0, z: -3 * PAIR.closeIn }, 'a', 'b');
    expect(Math.abs(far.x)).toBeGreaterThan(Math.abs(near.x));
    expect(Math.abs(far.x)).toBeCloseTo(PAIR.flankMetres);
  });
});

const PAIRDEF: SpawnerDef = {
  id: 'pair', enemy: 'blighted-soldier', count: 2, anchor: 'a', band: { min: 1, max: 1 },
  activation: 'manual', respawn: 'never', leash: false,
};
const NOGUARD: SpawnerDef = { ...PAIRDEF, id: 'plain', count: 1, guard: false };

function rig(defs: SpawnerDef[]) {
  const fake = new FakeHost(gltf.scene, { playerFeet: { x: 0, y: 0, z: -6 } });
  fake.defineAnchor('a', 0, 0);
  const m = new EnemyManager(fake.host, FakeHost.factory(gltf), { spawners: defs, seed: 11 });
  const tick = (seconds = DT) => {
    for (let i = 0; i < Math.max(1, Math.round(seconds / DT)); i++) {
      m.think(DT);
      m.animate(DT);
      fake.combatStep(DT);
      m.react(DT);
    }
  };
  return { fake, m, tick };
}

const hit = (t: ReturnType<typeof rig>, id: string, poise: number, amount = 20) =>
  t.fake.apply({ attackerId: 'player', targetId: id, amount, poise, kind: 'melee' })!;

/** Ticks until the footman has its shield up (a seeded 50% roll every 1.5 s). */
function untilGuarding(t: ReturnType<typeof rig>, id: string): void {
  for (let i = 0; i < 60 * 30; i++) {
    t.tick();
    if (t.m.get(id)!.guarding) return;
  }
  throw new Error('the footman never raised its shield');
}

describe('Charred Footman guard in the damage path', () => {
  it('a light front hit on a raised shield is blocked for 15% damage and half poise', () => {
    const t = rig([PAIRDEF]);
    const [id] = t.m.service.spawnGroup('pair', { aggro: true });
    untilGuarding(t, id!);
    const before = t.fake.actorMap.get(id!)!.health;
    const r = hit(t, id!, 10);
    expect(r.outcome).toBe('blocked');
    expect(r.dealt).toBeCloseTo(20 * GUARD.damageScale);
    expect(r.poiseDealt).toBeCloseTo(10 * GUARD.poiseScale);
    expect(t.fake.actorMap.get(id!)!.health).toBeCloseTo(before - r.dealt);
  });

  it('a heavy chop lands in full and breaks the guard for brokenSeconds', () => {
    const t = rig([PAIRDEF]);
    const [id] = t.m.service.spawnGroup('pair', { aggro: true });
    untilGuarding(t, id!);
    const r = hit(t, id!, 30);
    expect(r.outcome).toBe('hit');
    expect(r.dealt).toBe(20);
    expect(t.m.get(id!)!.guarding).toBe(false);
    t.tick(GUARD.brokenSeconds / 2);
    expect(t.m.get(id!)!.guarding).toBe(false);
  });

  it('a hit from behind ignores the shield and is 25% stronger', () => {
    const t = rig([PAIRDEF]);
    const [id] = t.m.service.spawnGroup('pair', { aggro: true });
    untilGuarding(t, id!);
    // Face the footman away from the player: walk the player round behind it, without ticking the footman.
    const e = t.m.get(id!)!;
    t.fake.movePlayer(e.feet.x + Math.sin(0) * 0, e.feet.z + 3); // the footman faces -Z toward the player at z=-6, so +Z is behind
    const r = hit(t, id!, 10);
    expect(r.outcome).toBe('hit');
    expect(r.dealt).toBeCloseTo(20 * GUARD.backDamageScale);
  });

  it('a group with guard: false never raises a shield and takes full damage', () => {
    const t = rig([NOGUARD]);
    const [id] = t.m.service.spawnGroup('plain', { aggro: true });
    for (let i = 0; i < 60 * 12; i++) {
      t.tick();
      expect(t.m.get(id!)!.guarding).toBe(false);
    }
    const r = hit(t, id!, 10);
    expect(r.outcome).toBe('hit');
    expect(r.dealt).toBe(20);
  });

  it('the shield drops the moment the footman telegraphs a swing', () => {
    const t = rig([{ ...PAIRDEF, count: 1, id: 'solo' }]);
    t.fake.movePlayer(0, -1.4);
    const [id] = t.m.service.spawnGroup('solo', { aggro: true });
    for (let i = 0; i < 60 * 20; i++) {
      t.tick();
      const s = t.m.get(id!)?.state;
      if (s === 'telegraph' || s === 'attack') {
        expect(t.m.get(id!)!.guarding).toBe(false);
        return;
      }
    }
    throw new Error('the footman never swung');
  });

  it('magic and non-melee damage ignores the shield', () => {
    const t = rig([PAIRDEF]);
    const [id] = t.m.service.spawnGroup('pair', { aggro: true });
    untilGuarding(t, id!);
    const r = t.fake.apply({ attackerId: 'player', targetId: id!, amount: 20, poise: 0, kind: 'spell' })!;
    expect(r.outcome).toBe('hit');
    expect(r.dealt).toBe(20);
  });

  it('an unblockable hit is not blocked', () => {
    const t = rig([PAIRDEF]);
    const [id] = t.m.service.spawnGroup('pair', { aggro: true });
    untilGuarding(t, id!);
    const r = t.fake.apply({ attackerId: 'player', targetId: id!, amount: 20, poise: 10, kind: 'melee', unblockable: true })!;
    expect(r.outcome).toBe('hit');
  });
});

describe('Footman pairs', () => {
  it('advance on opposite flanks and never start swings in the same instant', () => {
    const t = rig([PAIRDEF]);
    const ids = t.m.service.spawnGroup('pair', { aggro: true });
    expect(ids).toHaveLength(2);
    t.fake.movePlayer(0, -30);
    t.tick(2);
    // Approaching from far, the two spread onto opposite sides of the line to the player.
    const [a, b] = ids.map((id) => t.m.get(id)!.feet.x);
    expect(Math.sign(a!)).not.toBe(Math.sign(b!));
  });

  it('the second footman waits out the stagger before it may start a swing', () => {
    const t = rig([PAIRDEF]);
    const [a, b] = t.m.service.spawnGroup('pair', { aggro: true });
    t.fake.movePlayer(0, -1.3);
    const starts: Record<string, number> = {};
    t.fake.bus.on('telegraph', (e) => {
      starts[e.actorId] ??= clock;
    });
    let clock = 0;
    for (let i = 0; i < 60 * 15 && Object.keys(starts).length < 2; i++) {
      t.tick();
      clock += DT;
    }
    expect(Object.keys(starts).sort()).toEqual([a, b].sort());
    expect(Math.abs(starts[a!]! - starts[b!]!)).toBeGreaterThanOrEqual(PAIR.attackStaggerSeconds - DT);
  });

  it('the survivor of a pair fights on alone and the group clears once', () => {
    const t = rig([PAIRDEF]);
    const ids = t.m.service.spawnGroup('pair', { aggro: true });
    let cleared = 0;
    t.fake.bus.on('enemies.groupCleared', () => cleared++);
    t.fake.apply({ attackerId: 'player', targetId: ids[0]!, amount: 9999, poise: 0, kind: 'script' });
    t.tick(6);
    expect(cleared).toBe(0);
    expect(t.m.get(ids[1]!)!.active).toBe(true);
    t.tick(3);
    t.fake.apply({ attackerId: 'player', targetId: ids[1]!, amount: 9999, poise: 0, kind: 'script' });
    t.tick(6);
    expect(cleared).toBe(1);
  });
});
