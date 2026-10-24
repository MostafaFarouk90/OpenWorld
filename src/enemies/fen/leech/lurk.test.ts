import type * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { FIXED_TIMESTEP } from '../../../config/constants';
import { ENEMY_DEFS } from '../../defs';
import { EnemyManager } from '../../EnemyManager';
import { FakeHost, loadKnight } from '../../testing/fakeHost';
import type { SpawnerDef } from '../../types';
import { drainStamina } from '../drain';
import '../overlays';
import { FEN_TUNING } from '../tuning';
import { FEN_LEECH } from './def';
import { LEECH_BODY_HEIGHT, LURK_COVER, MAX_BURROW, SURFACE_SECONDS, legalWater, lurkSink, type LurkWater } from './lurk';

const DT = FIXED_TIMESTEP;
const T = FEN_TUNING.leech;
let gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] };
beforeAll(async () => {
  gltf = await loadKnight();
});

type Kind = 'wade' | 'dive' | 'deep';

/**
 * One Fen Leech at the origin over the fake core. `water` is the K7 water service stand-in (a kind and depth everywhere, or a
 * function); `mode` is the movementMode service's current mode. The player starts `at` metres south.
 */
function rig(opts: { at?: number; water?: { kind: Kind | null; depth: number } | ((x: number, z: number) => { kind: Kind | null; depth: number }) | null; group?: boolean } = {}) {
  const fake = new FakeHost(gltf.scene, { playerFeet: { x: 0, y: 0, z: opts.at ?? 20 } });
  const mode = { current: 'walk' as string };
  const w = opts.water === undefined ? { kind: 'wade' as Kind, depth: 0.5 } : opts.water;
  const at = (x: number, z: number) => (typeof w === 'function' ? w(x, z) : w);
  const water: LurkWater | undefined = w
    ? {
        depthAt: (x, z) => at(x, z)!.depth,
        volumeAt: (p) => {
          const k = at(p.x, p.z)!.kind;
          return k ? { kind: k } : null;
        },
      }
    : undefined;
  const host = {
    ...fake.host,
    services: {
      get: ((name: string) => {
        if (name === 'water') return water;
        if (name === 'movementMode') return mode;
        return fake.host.services.get(name as 'vfx');
      }) as typeof fake.host.services.get,
    },
  };
  fake.defineAnchor('knot', 0, 0);
  const knot: SpawnerDef = { id: 'knot', enemy: 'fen-leech', count: 1, anchor: 'knot', band: { min: 1, max: 1 }, activation: 'manual', respawn: 'never', leash: false };
  const manager = new EnemyManager(host, FakeHost.factory(gltf), { spawners: opts.group ? [knot] : [], seed: 11 });
  const id = opts.group ? manager.service.spawnGroup('knot')[0]! : manager.spawnLoose('fen-leech', { x: 0, y: 0, z: 0 })!;
  const enemy = manager.get(id)!;
  const frame = () => {
    manager.think(DT);
    manager.animate(DT);
    fake.combatStep(DT);
    manager.react(DT);
    manager.render(1);
  };
  const seconds = (s: number) => {
    for (let i = 0, n = Math.round(s / DT); i < n; i++) frame();
  };
  const actor = () => fake.actorMap.get(id)! as typeof fake.player & { untargetable?: boolean };
  const up = () => actor().untargetable === false && !actor().invulnerable;
  const telegraphs = () => fake.bus.of('telegraph').filter((t) => (t as { actorId?: string }).actorId === id) as Array<{ moveId: string }>;
  const hit = (poise: number, amount = 1, extra: Record<string, unknown> = {}) =>
    fake.apply({ attackerId: 'player', targetId: id, amount, poise, kind: 'melee', ...extra });
  const surface = () => {
    fake.movePlayer(0, 3);
    seconds(SURFACE_SECONDS + 0.2);
    expect(up()).toBe(true);
  };
  const submerge = () => (enemy.body as unknown as { submergeTarget: number }).submergeTarget;
  const brain = enemy.brain as unknown as { move: unknown };
  return { id, enemy, manager, fake, mode, frame, seconds, actor, up, telegraphs, hit, surface, submerge, brain };
}

describe('Fen Leech def', () => {
  it('is registered, has no mercy and a drain bite', () => {
    expect(ENEMY_DEFS['fen-leech']).toBe(FEN_LEECH);
    expect(FEN_LEECH.mercy).toBeUndefined();
    expect(FEN_LEECH.behaviour).toBe('lurk');
    expect(FEN_LEECH.moves.find((m) => m.id === 'leech.bite')!.onHit).toBe('drain');
    expect(FEN_LEECH.moves.find((m) => m.id === 'leech.lunge')!.telegraph).toBe('dodge');
  });
});

describe('lurkSink and legalWater', () => {
  it('lies on the bed in deep enough water, burrows in shallow, never more than the cap', () => {
    expect(lurkSink(1)).toBe(0);
    expect(lurkSink(LEECH_BODY_HEIGHT + LURK_COVER)).toBe(0);
    expect(lurkSink(0.2)).toBeCloseTo(LEECH_BODY_HEIGHT + LURK_COVER - 0.2);
    expect(lurkSink(0)).toBe(MAX_BURROW);
    expect(lurkSink(null)).toBe(MAX_BURROW);
    expect(lurkSink(Number.NaN)).toBe(MAX_BURROW);
    expect(lurkSink(-3)).toBe(MAX_BURROW);
    expect(MAX_BURROW).toBeLessThanOrEqual(T.sinkDepth);
  });

  it('wade and dive volumes are legal, deep water and dry land are not; no service means anywhere', () => {
    const w = (kind: Kind | null): LurkWater => ({ depthAt: () => 1, volumeAt: () => (kind ? { kind } : null) });
    const p = { x: 0, y: 0, z: 0 };
    expect(legalWater(w('wade'), p)).toBe(true);
    expect(legalWater(w('dive'), p)).toBe(true);
    expect(legalWater(w('deep'), p)).toBe(false);
    expect(legalWater(w(null), p)).toBe(false);
    expect(legalWater(null, p)).toBe(true);
  });
});

describe('drainStamina', () => {
  it('takes n, never below 0, and leaves an actor without a pool alone', () => {
    const a = { stamina: 40 };
    expect(drainStamina(a, 25)).toBe(25);
    expect(a.stamina).toBe(15);
    expect(drainStamina(a, 25)).toBe(15);
    expect(a.stamina).toBe(0);
    expect(drainStamina({}, 25)).toBe(0);
    expect(drainStamina({ stamina: Number.NaN }, 25)).toBe(0);
    expect(drainStamina(null, 25)).toBe(0);
    expect(drainStamina({ stamina: 10 }, -5)).toBe(0);
  });
});

describe('Fen Leech lurking', () => {
  it('waits submerged: untargetable, invulnerable, a hit is immune', () => {
    const r = rig();
    r.seconds(1);
    expect(r.actor().untargetable).toBe(true);
    expect(r.actor().invulnerable).toBe(true);
    expect(r.hit(10, 10)!.outcome).toBe('immune');
    expect(r.actor().health).toBe(r.actor().maxHealth);
    expect(r.submerge()).toBeGreaterThanOrEqual(0);
  });

  it('stays down with the player at 6 m and comes up at 5 m', () => {
    const r = rig({ at: T.surfaceRadius + 1 });
    r.seconds(2);
    expect(r.actor().untargetable).toBe(true);
    r.fake.movePlayer(0, T.surfaceRadius - 0.1);
    r.seconds(SURFACE_SECONDS + 0.1);
    expect(r.up()).toBe(true);
  });

  it('a diving player never brings it up', () => {
    const r = rig({ water: { kind: 'dive', depth: 2 } });
    r.mode.current = 'dive';
    r.fake.movePlayer(0, 2);
    r.seconds(2);
    expect(r.actor().untargetable).toBe(true);
  });

  it('opens with the lunge', () => {
    const r = rig();
    r.surface();
    r.seconds(4);
    const t = r.telegraphs();
    expect(t.length).toBeGreaterThan(0);
    expect(t[0]!.moveId).toBe('leech.lunge');
  });

  it('the player going into a dive mid-fight makes it break off and sink', () => {
    const r = rig({ water: { kind: 'dive', depth: 2 } });
    r.surface();
    r.mode.current = 'dive';
    r.seconds(0.2);
    expect(r.actor().untargetable).toBe(true);
    expect(r.enemy.brain.target).toBeNull();
  });

  it('never leaves its tether', () => {
    const r = rig();
    r.surface();
    for (let i = 0; i < 40; i++) {
      r.fake.movePlayer(0, 3 + i);
      r.seconds(0.25);
      const f = r.enemy.feet;
      expect(Math.hypot(f.x, f.z)).toBeLessThanOrEqual(T.tether + 0.2);
    }
  });

  it('sinks again once the target is lost for the resink time', () => {
    const r = rig();
    r.surface();
    r.fake.movePlayer(0, 80);
    r.seconds(T.resinkSeconds + 2);
    expect(r.actor().untargetable).toBe(true);
  });
});

describe('Fen Leech dives', () => {
  it('a poise break sends it under; it comes up again; at most two dives', () => {
    const r = rig();
    r.surface();
    r.hit(1000);
    r.frame();
    expect(r.actor().untargetable).toBe(true);
    r.seconds(T.diveSeconds + SURFACE_SECONDS + 0.3);
    expect(r.up()).toBe(true);
    r.hit(1000);
    r.frame();
    expect(r.actor().untargetable).toBe(true);
    r.seconds(T.diveSeconds + SURFACE_SECONDS + 0.3);
    expect(r.up()).toBe(true);
    // The third break is a plain stagger: it stays up.
    r.hit(1000);
    r.frame();
    expect(r.up()).toBe(true);
    expect(r.enemy.brain.state).toBe('stagger');
  });

  it('low health sends it under once its swing is over', () => {
    const r = rig();
    r.surface();
    r.hit(0, r.actor().maxHealth * (1 - T.diveBelowHealth) + 1);
    r.seconds(2);
    expect(r.actor().untargetable).toBe(true);
  });

  it('slides only to legal water inside the ring: a wade-only pool, never the deep side', () => {
    const r = rig({ water: (x) => (x > 1 ? { kind: 'deep', depth: 5 } : { kind: 'wade', depth: 0.4 }) });
    r.surface();
    r.hit(1000);
    r.frame();
    r.seconds(T.diveSeconds);
    expect(r.enemy.feet.x).toBeLessThanOrEqual(1.3);
  });

  it('a dive volume is accepted for the resurface (D05 corridors)', () => {
    const r = rig({ water: { kind: 'dive', depth: 2 } });
    r.surface();
    const before = { x: r.enemy.feet.x, z: r.enemy.feet.z };
    r.hit(1000);
    r.frame();
    r.seconds(T.diveSeconds);
    expect(Math.hypot(r.enemy.feet.x - before.x, r.enemy.feet.z - before.z)).toBeGreaterThan(0.5);
  });

  it('no water service: it still lurks (burrowed to the cap)', () => {
    const r = rig({ water: null });
    r.seconds(0.5);
    expect(r.submerge()).toBe(MAX_BURROW);
    expect(r.actor().untargetable).toBe(true);
  });

  it('a load mid-dive keeps it alive in its group and lurking', () => {
    const r = rig({ group: true });
    r.surface();
    r.hit(1000);
    r.frame();
    r.fake.loadFlags({});
    r.seconds(T.diveSeconds + 2);
    // The player is still at 3 m: it comes back up; with the player gone it would sink. Either way it is the same leech, whole.
    expect(r.manager.get(r.id)).toBeDefined();
    r.fake.movePlayer(0, 80);
    r.seconds(T.resinkSeconds + 2);
    expect(r.actor().untargetable).toBe(true);
  });
});

describe('the drain bite', () => {
  const bite = FEN_LEECH.moves.find((m) => m.id === 'leech.bite')!;
  const withStamina = (r: ReturnType<typeof rig>, n: number) => {
    (r.fake.player as unknown as { stamina: number }).stamina = n;
  };
  const stamina = (r: ReturnType<typeof rig>) => (r.fake.player as unknown as { stamina: number }).stamina;
  const bitePlayer = (r: ReturnType<typeof rig>, outcome?: 'blocked' | 'parried') => {
    r.brain.move = bite;
    const off = outcome
      ? r.fake.host.damage.addModifier('test.guard', (req) => {
          (req as { outcome: string }).outcome = outcome;
        })
      : null;
    r.fake.apply({ attackerId: r.id, targetId: 'player', amount: bite.damage, poise: bite.damage, kind: 'melee' });
    off?.();
    r.frame();
  };

  it('a landed bite takes 25 stamina, never below 0', () => {
    const r = rig();
    r.surface();
    withStamina(r, 60);
    bitePlayer(r);
    expect(stamina(r)).toBe(60 - T.drainStamina);
    withStamina(r, 10);
    bitePlayer(r);
    expect(stamina(r)).toBe(0);
  });

  it('a blocked or parried bite drains nothing', () => {
    const r = rig();
    r.surface();
    withStamina(r, 60);
    bitePlayer(r, 'blocked');
    bitePlayer(r, 'parried');
    expect(stamina(r)).toBe(60);
  });

  it('a bite on a companion drains neither the companion nor the player', () => {
    const r = rig();
    r.surface();
    withStamina(r, 60);
    const ally = r.fake.host.actors.spawn({ kind: 'companion:test', team: 'ally', maxHealth: 50 }) as unknown as { id: string; stamina: number };
    ally.stamina = 30;
    r.brain.move = bite;
    r.fake.apply({ attackerId: r.id, targetId: ally.id, amount: 5, poise: 5, kind: 'melee' });
    r.frame();
    expect(ally.stamina).toBe(30);
    expect(stamina(r)).toBe(60);
  });

  it('a lunge hit drains nothing', () => {
    const r = rig();
    r.surface();
    withStamina(r, 60);
    r.brain.move = FEN_LEECH.moves.find((m) => m.id === 'leech.lunge')!;
    r.fake.apply({ attackerId: r.id, targetId: 'player', amount: 5, poise: 5, kind: 'melee' });
    r.frame();
    expect(stamina(r)).toBe(60);
  });
});
