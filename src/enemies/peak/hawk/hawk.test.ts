// The Rime Hawk in the enemy stack (plans/act3-K6b-pr2.md section 2): soar, the hover telegraph and stoop, grounding by a
// projectile or a poise break in the air, Calm with Hawk Jerky only when grounded or perched, the water and stealth
// call-off, the nest, and the fly-off.
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { FIXED_TIMESTEP } from '../../../config/constants';
import { ENEMY_DEFS } from '../../defs';
import { EnemyManager } from '../../EnemyManager';
import { mercyInteractableId } from '../../mercy';
import { FakeHost, loadKnight } from '../../testing/fakeHost';
import type { SpawnerDef, SpawnOptions } from '../../types';
import '../overlays';
import { HAWK } from '../tuning';
import { RIME_HAWK } from './def';
import { HawkBody } from './HawkBody';
import { hawkView, isGroundingHit } from './overlay';

const DT = FIXED_TIMESTEP;
let gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] };
beforeAll(async () => {
  gltf = await loadKnight();
});

interface RigOptions {
  playerZ?: number;
  items?: Record<string, number>;
  /** The water service stand-in: is (x, z) in water. */
  water?: (x: number, z: number) => boolean;
  stealth?: { active: boolean; hidden: boolean };
  spawner?: Partial<SpawnerDef>;
}

function rig(o: RigOptions = {}) {
  const fake = new FakeHost(gltf.scene, { playerFeet: { x: 0, y: 0, z: o.playerZ ?? -10 } });
  fake.defineAnchor('a', 0, 0);
  fake.defineAnchor('nest', 0, 0);
  fake.flags.set('enemies.mercy.calm', true);
  const counts = fake.provideItems(o.items ?? { 'hawk-jerky': 2 });
  const stealth = o.stealth ?? { active: false, hidden: false };
  const host = {
    ...fake.host,
    services: {
      get: ((name: string) => {
        if (name === 'water' && o.water) return { volumeAt: (p: { x: number; z: number }) => (o.water!(p.x, p.z) ? { kind: 'wade' } : null) };
        if (name === 'stealth') return { active: () => stealth.active, hidden: () => stealth.hidden };
        return fake.host.services.get(name as 'vfx');
      }) as typeof fake.host.services.get,
    },
  };
  const def: SpawnerDef = { id: 'g', enemy: 'rime-hawk', count: 1, anchor: 'a', band: { min: 20, max: 20 }, activation: 'manual', respawn: 'never', leash: false, ...o.spawner };
  const m = new EnemyManager(host, FakeHost.factory(gltf), { spawners: [def], seed: 3 });
  const tick = (seconds = DT, until?: () => boolean): boolean => {
    for (let i = 0; i < Math.max(1, Math.round(seconds / DT)); i++) {
      m.think(DT);
      m.animate(DT);
      fake.combatStep(DT);
      m.react(DT);
      if (until?.()) return true;
    }
    return false;
  };
  const spawn = (opts: SpawnOptions = { aggro: true }) => {
    const id = m.service.spawnGroup('g', opts)[0]!;
    return { id, enemy: m.get(id)!, body: m.get(id)!.body as unknown as HawkBody };
  };
  const view = (id: string) => hawkView(id)!;
  const hold = (id: string) => fake.interactables.get(mercyInteractableId(m.get(id)!.slug))!;
  const bolt = (id: string, extra: Record<string, unknown> = {}) =>
    fake.apply({ attackerId: 'player', targetId: id, amount: 1, poise: 1, kind: 'melee', attackId: 'pathfinder.bolt.1', ...extra });
  return { fake, m, tick, spawn, view, hold, bolt, counts, stealth };
}

describe('Rime Hawk def', () => {
  it('is registered on the bird body with the hawk overlay, a dodge stoop after a 0.8 s hover and a block rake', () => {
    expect(ENEMY_DEFS['rime-hawk']).toBe(RIME_HAWK);
    expect(RIME_HAWK.body).toBe('bird');
    expect(RIME_HAWK.behaviour).toBe('hawk');
    expect(RIME_HAWK.maxPoise).toBe(30);
    const stoop = RIME_HAWK.moves.find((m) => m.id === 'hawk.stoop')!;
    expect(stoop.windup).toBe(0.8);
    expect(stoop.telegraph).toBe('dodge');
    expect(stoop.leap).toBeDefined();
    expect(RIME_HAWK.moves.find((m) => m.id === 'hawk.rake')!.telegraph).toBe('block');
  });

  it('Calm only: Hawk Jerky, grounded, dragons\' trust; no Spare, no Warm Hand', () => {
    expect(RIME_HAWK.mercy).toMatchObject({ verb: 'calm', track: 'dragons', when: 'calming', precondition: 'grounded', offerings: [{ itemId: 'hawk-jerky', count: 1 }] });
    expect(RIME_HAWK.mercy!.warmHand).toBeFalsy();
  });

  it('a grounding hit is a landed player projectile: a bolt, its blast or a spell; never a melee swing, status or script', () => {
    expect(isGroundingHit({ outcome: 'hit', kind: 'melee', attackId: 'pathfinder.bolt.2' })).toBe(true);
    expect(isGroundingHit({ outcome: 'hit', kind: 'spell', attackId: 'pathfinder.bolt.4.blast' })).toBe(true);
    expect(isGroundingHit({ outcome: 'hit', kind: 'spell', attackId: 'emberwright.bolt' })).toBe(true);
    expect(isGroundingHit({ outcome: 'hit', kind: 'melee', attackId: '1H_Melee_Attack_Chop' })).toBe(false);
    expect(isGroundingHit({ outcome: 'hit', kind: 'status', attackId: 'pathfinder.bolt.1' })).toBe(false);
    expect(isGroundingHit({ outcome: 'hit', kind: 'script', attackId: 'pathfinder.bolt.1' })).toBe(false);
    expect(isGroundingHit({ outcome: 'blocked', kind: 'melee', attackId: 'pathfinder.bolt.1' })).toBe(false);
  });
});

describe('Rime Hawk in the air', () => {
  it('an aggro spawn soars 14 m up on the bird body, out of reach: no Calm, no pull, aimed at in the air', () => {
    const t = rig();
    const { id, enemy, body } = t.spawn();
    expect(body).toBeInstanceOf(HawkBody);
    t.tick(1);
    expect(t.view(id).mode).toBe('soar');
    expect(t.view(id).altitude).toBeGreaterThan(12);
    const p = enemy.actor.worldPosition(new THREE.Vector3());
    expect(p.y - enemy.feet.y).toBeCloseTo(t.view(id).altitude, 5);
    expect(enemy.mercyOpen).toBe(false);
    expect(enemy.calmOpen).toBe(false);
    expect(enemy.pulledToward({ x: 0, z: -10 }, 4)).toBe(false);
    expect(t.hold(id).enabled!()).toBe(false);
  });

  it('the stoop: the shriek (telegraph) at the hover\'s start, the wings flash white, the dive lands, then it skims and climbs', () => {
    const t = rig();
    const { id, enemy, body } = t.spawn();
    expect(t.tick(10, () => enemy.state === 'telegraph')).toBe(true);
    const tel = t.fake.bus.of('telegraph').filter((e) => (e as { actorId: string }).actorId === id) as Array<{ moveId: string; kind: string }>;
    expect(tel.map((e) => e.moveId)).toEqual(['hawk.stoop']);
    expect(tel[0]!.kind).toBe('dodge');
    expect(t.view(id).mode).toBe('stoop');
    t.tick(0.2);
    expect(body.flash).toBe(1);
    // The hover holds through most of the 0.8 s windup before the window opens.
    let hover = 0.2;
    t.tick(1, () => {
      hover += DT;
      return enemy.state === 'attack';
    });
    expect(hover).toBeGreaterThan(0.6);
    expect(t.view(id).altitude).toBeLessThan(HAWK.hoverAltitude + 0.5);
    const before = t.fake.player.health;
    t.tick(0.6, () => t.view(id).mode === 'low');
    expect(t.fake.player.health).toBeLessThan(before);
    expect(t.view(id).altitude).toBeLessThan(1.5);
    expect(t.tick(HAWK.lowSeconds + HAWK.climbSeconds + 0.5, () => t.view(id).mode === 'soar')).toBe(true);
    expect(body.flash).toBe(0);
  });

  it('a bolt in the hover knocks it down: a 0.5 s fall with no Calm, then 4 s grounded with Calm open; jerky calms it and it flies off', () => {
    const t = rig();
    const { id, enemy } = t.spawn();
    t.tick(10, () => enemy.state === 'telegraph');
    t.tick(0.2);
    t.bolt(id);
    t.tick(0.2);
    expect(t.view(id).mode).toBe('falling');
    expect(enemy.mercyOpen).toBe(false);
    t.tick(0.5);
    expect(t.view(id).mode).toBe('grounded');
    expect(t.view(id).altitude).toBe(0);
    expect(enemy.state).toBe('stagger');
    expect(enemy.mercyOpen).toBe(true);
    expect(enemy.calmContext()).toMatchObject({ grounded: true });
    const h = t.hold(id);
    expect(h.enabled!()).toBe(true);
    h.onInteract(t.fake.player);
    expect(enemy.state).toBe('calmed');
    expect(t.fake.inventory!.removed).toEqual([{ itemId: 'hawk-jerky', count: 1 }]);
    t.tick(1);
    expect(t.m.get(id)).toBeDefined(); // flying off
    t.tick(HAWK.leaveSeconds + 0.5);
    expect(t.m.get(id)).toBeUndefined();
  });

  it('struck while it flies off (the calm revoked): back on the ground at full opacity and hostile, its body follows its flight again', () => {
    const t = rig();
    const { id, enemy, body } = t.spawn();
    t.tick(10, () => enemy.state === 'telegraph');
    t.tick(0.2);
    t.bolt(id);
    t.tick(0.8);
    t.hold(id).onInteract(t.fake.player);
    t.tick(4);
    expect(body.altitude).toBeGreaterThan(5);
    let opacity = -1;
    const set = body.setOpacity.bind(body);
    body.setOpacity = (o: number) => {
      opacity = o;
      set(o);
    };
    t.fake.bus.emit('mercy.revoked', { actorId: id, track: 'dragons', removed: 1 });
    t.tick(DT);
    expect(enemy.state).not.toBe('calmed');
    expect(opacity).toBe(1);
    t.tick(3);
    expect(t.m.get(id)).toBeDefined();
    expect(body.altitude).toBeCloseTo(t.view(id).altitude, 5);
  });

  it('a status stun in the air brings it down stunned, with no Calm window (a stun is not a stagger)', () => {
    const t = rig();
    const { id, enemy } = t.spawn();
    t.tick(1.5);
    expect(t.view(id).altitude).toBeGreaterThan(5);
    t.m.get(id)!.actor.data['status'] = { stunned: true, stunRemaining: 2, slow: 0 };
    t.tick(0.8);
    expect(t.view(id).mode).toBe('grounded');
    expect(enemy.mercyOpen).toBe(false);
    expect(t.hold(id).enabled!()).toBe(false);
  });

  it('put to sleep in the air, it lands without a stagger', () => {
    const t = rig();
    const { id } = t.spawn();
    t.tick(1.5);
    expect(t.view(id).altitude).toBeGreaterThan(5);
    const before = t.fake.bus.of('enemies.state').length;
    (t.m.get(id) as unknown as { sleep(): void }).sleep();
    t.tick(DT);
    const states = t.fake.bus.of('enemies.state').slice(before) as Array<{ to?: string }>;
    expect(states.some((s) => s.to === 'stagger')).toBe(false);
    expect(t.view(id).altitude).toBe(0);
  });

  it('a spell in the dive grounds it too', () => {
    const t = rig();
    const { id, enemy } = t.spawn();
    t.tick(10, () => enemy.state === 'attack');
    t.fake.apply({ attackerId: 'player', targetId: id, amount: 1, poise: 1, kind: 'spell', attackId: 'emberwright.bolt' });
    t.tick(0.7);
    expect(t.view(id).mode).toBe('grounded');
  });

  it('while soaring a bolt, a light melee hit or a status tick does not ground it', () => {
    const t = rig();
    const { id } = t.spawn();
    t.tick(1);
    t.bolt(id);
    t.fake.apply({ attackerId: 'player', targetId: id, amount: 1, poise: 1, kind: 'melee' });
    t.fake.apply({ attackerId: 'player', targetId: id, amount: 1, poise: 0, kind: 'status' });
    t.tick(0.7);
    expect(t.view(id).mode).toBe('soar');
  });

  it('a hostile\'s bolt in the hover does not ground it', () => {
    const t = rig();
    const { id, enemy } = t.spawn();
    t.tick(10, () => enemy.state === 'telegraph');
    t.bolt(id, { attackerId: null });
    t.tick(0.1);
    // The hit may call the hover off (a flinch), but it never knocks the hawk down.
    expect(['stoop', 'climb']).toContain(t.view(id).mode);
    t.tick(0.6);
    expect(['falling', 'grounded']).not.toContain(t.view(id).mode);
  });

  it('a poise break in the air knocks it down at any height (no Calm while falling)', () => {
    const t = rig();
    const { id, enemy } = t.spawn();
    t.tick(1);
    t.fake.apply({ attackerId: 'player', targetId: id, amount: 1, poise: 1000, kind: 'melee' });
    t.tick(0.1);
    expect(t.view(id).mode).toBe('falling');
    expect(enemy.mercyOpen).toBe(false);
    t.tick(0.6);
    expect(t.view(id).mode).toBe('grounded');
    expect(enemy.mercyOpen).toBe(true);
  });

  it('grounded without jerky: no Calm prompt, and once the stagger ends it takes off again', () => {
    const t = rig({ items: {} });
    const { id } = t.spawn();
    t.tick(1);
    t.fake.apply({ attackerId: 'player', targetId: id, amount: 1, poise: 1000, kind: 'melee' });
    t.tick(0.7);
    expect(t.view(id).mode).toBe('grounded');
    expect(t.hold(id).enabled!()).toBe(false);
    t.hold(id).onInteract(t.fake.player);
    expect(t.m.get(id)!.state).not.toBe('calmed');
    expect(t.tick(HAWK.groundedSeconds + 2, () => t.view(id).mode === 'takeoff' || t.view(id).mode === 'soar')).toBe(true);
  });

  it('struck while grounded, Calm still opens (the grounded stagger is the Warm Hand window, not the unstruck one)', () => {
    const t = rig();
    const { id, enemy } = t.spawn();
    t.tick(1);
    t.fake.apply({ attackerId: 'player', targetId: id, amount: 1, poise: 1000, kind: 'melee' });
    t.tick(0.7);
    t.fake.apply({ attackerId: 'player', targetId: id, amount: 1, poise: 0, kind: 'melee' });
    expect(enemy.mercyOpen).toBe(true);
  });

  it('killed in the air, it drops to the ground', () => {
    const t = rig();
    const { id, body } = t.spawn();
    t.tick(1);
    t.fake.host.damage.kill!(id, 'player');
    t.tick(1.5);
    expect(body.altitude).toBe(0);
  });
});

describe('Rime Hawk call-off: water and stealth', () => {
  it('a target in water: no stoop starts', () => {
    const t = rig({ water: () => true });
    const { id, enemy } = t.spawn();
    expect(t.tick(12, () => enemy.state === 'telegraph')).toBe(false);
    expect(t.view(id).mode).toBe('soar');
  });

  it('the target steps into water mid-hover: the hover is called off, no dive, it climbs', () => {
    let wet = false;
    const t = rig({ water: () => wet });
    const { id, enemy } = t.spawn();
    t.tick(10, () => enemy.state === 'telegraph');
    t.tick(0.2);
    wet = true;
    const before = t.fake.player.health;
    t.tick(0.1);
    expect(enemy.state).not.toBe('telegraph');
    expect(t.view(id).mode).toBe('climb');
    t.tick(1);
    expect(enemy.state).not.toBe('attack');
    expect(t.fake.player.health).toBe(before);
  });

  it('a leashed ambient hawk whose target wades in mid-hover keeps its target and its wounds (no trip home to heal)', () => {
    let wet = false;
    const t = rig({ water: () => wet, spawner: { leash: true } });
    const { id, enemy } = t.spawn();
    t.fake.apply({ attackerId: 'player', targetId: id, amount: 10, poise: 0, kind: 'melee' });
    const hp = t.fake.actorMap.get(id)!.health;
    t.tick(10, () => enemy.state === 'telegraph');
    wet = true;
    t.tick(0.1);
    expect(t.view(id).mode).toBe('climb');
    expect(enemy.brain.target).not.toBeNull();
    t.tick(3);
    expect(enemy.state).not.toBe('return');
    expect(t.fake.actorMap.get(id)!.health).toBe(hp);
  });

  it('an ambient hawk leaves Cael alone in a stealth section', () => {
    const t = rig({ stealth: { active: true, hidden: false } });
    const { enemy } = t.spawn();
    expect(t.tick(12, () => enemy.state === 'telegraph')).toBe(false);
  });

  it('a stealth section that starts mid-hover calls the hover off', () => {
    const t = rig();
    const { id, enemy } = t.spawn();
    t.tick(10, () => enemy.state === 'telegraph');
    t.stealth.active = true;
    t.tick(0.1);
    expect(t.view(id).mode).toBe('climb');
  });
});

describe('Rime Hawk on its nest', () => {
  it('perches on its nest (Rest), Calm opens unstruck; a calmed perched hawk flies off', () => {
    const t = rig({ playerZ: -60, spawner: { options: { nest: 'nest' } } });
    const { id, enemy, body } = t.spawn({});
    t.tick(0.5);
    expect(t.view(id).mode).toBe('perched');
    expect(t.view(id).altitude).toBe(0);
    expect(body.currentClip).toBe('Rest');
    t.fake.movePlayer(0, -1.5);
    t.tick(DT);
    // Close by and not yet noticed: Calm with jerky (the grounded precondition holds on the nest).
    expect(['idle', 'notice']).toContain(enemy.state);
    expect(enemy.calmOpen).toBe(true);
    expect(enemy.calmContext()).toMatchObject({ grounded: true });
    t.hold(id).onInteract(t.fake.player);
    expect(enemy.state).toBe('calmed');
    t.tick(HAWK.leaveSeconds + 0.5);
    expect(t.m.get(id)).toBeUndefined();
  });

  it('a perched hawk that notices the player takes off', () => {
    const t = rig({ playerZ: -60, spawner: { options: { nest: 'nest' } } });
    const { id } = t.spawn({});
    t.tick(0.5);
    t.fake.movePlayer(0, -8);
    expect(t.tick(4, () => t.view(id).mode === 'takeoff' || t.view(id).mode === 'soar')).toBe(true);
  });

  it('a missing nest anchor warns and the hawk soars instead', () => {
    const t = rig({ spawner: { options: { nest: 'no-such-nest' } } });
    const { id } = t.spawn({});
    t.tick(0.2);
    expect(t.view(id).mode).toBe('soar');
    expect(t.fake.warnings.some((w) => w.includes('no-such-nest'))).toBe(true);
  });
});
