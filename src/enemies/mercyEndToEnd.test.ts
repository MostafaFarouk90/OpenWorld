import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { ActorRegistry } from '../actors/ActorRegistry';
import { BossRegistry } from '../actors/BossRegistry';
import { DamageResolver } from '../actors/DamageResolver';
import { FIXED_TIMESTEP } from '../config/constants';
import { GameEvents } from '../core/events';
import { fakeActions, fakeContexts } from '../interaction/testkit';
import { InteractionSystem, type Interactable } from '../interaction/InteractionSystem';
import { Burn } from '../spells/Burn';
import { WorldState } from '../state/WorldState';
import { EnemyManager } from './EnemyManager';
import { FakeActor, FakeHost, loadKnight } from './testing/fakeHost';
import { AI, MERCY } from './tuning';
import type { SpawnerDef } from './types';

const DT = FIXED_TIMESTEP;
let gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] };

beforeAll(async () => {
  gltf = await loadKnight();
});

const SPAWNERS: SpawnerDef[] = [
  { id: 'pack', enemy: 'ash-wraith', count: 2, anchor: 'spawn.pack', band: { min: 1, max: 1 }, activation: 'manual', respawn: 'never', leash: false },
];

/**
 * The real InteractionSystem (focus, 0.5 s hold), BossRegistry, WorldState favour and Burn
 * (`useShard`, Scars) driving the real EnemyManager; only the enemy bodies and the avatar are fakes.
 */
function rig(opts: { burn?: number; releaseUnlocked?: boolean } = {}) {
  const events = new GameEvents((m, e) => {
    throw new Error(`${m} ${String(e)}`);
  });
  const actors = new ActorRegistry(events);
  const damage = new DamageResolver(actors, events, () => {});
  const state = new WorldState(events, () => {});
  const bosses = new BossRegistry({ events, actors, damage, state });
  const player = actors.spawn({ id: 'player', kind: 'player', team: 'player', maxHealth: 100 });
  const input = fakeActions();
  const interaction = new InteractionSystem({
    events,
    actions: () => input.actions,
    contexts: fakeContexts().stack,
    player: () => ({ actor: player, feet: new THREE.Vector3(0, 0, 1.5), facingYaw: 0, moving: false }),
  });
  const burn = new Burn();
  burn.add(opts.burn ?? 0, 'test');

  const fake = new FakeHost(gltf.scene, { playerFeet: { x: 0, y: 0, z: 1.5 } });
  fake.defineAnchor('spawn.pack', 0, 0);
  const host = {
    ...fake.host,
    bosses,
    interaction: { register: (i: unknown) => interaction.register(i as Interactable) },
    services: {
      get: ((name: string) => {
        if (name === 'spells') return { useShard: (g: number, s: string) => burn.useShard(g, s) };
        return fake.host.services.get(name as 'vfx');
      }) as typeof fake.host.services.get,
    },
  };
  const manager = new EnemyManager(host, FakeHost.factory(gltf), { spawners: SPAWNERS, seed: 7 });
  manager.service.setMercyUnlocked('release', opts.releaseUnlocked ?? true);

  // The real bus feeds the enemies code; the enemies code's mercy events feed the real favour ledger.
  const forward = ['boss.releaseWindow', 'boss.released', 'boss.ended'] as const;
  for (const t of forward) events.on(t, (p) => (fake.bus.emit as (t: string, p: unknown) => void)(t, p));
  fake.bus.on('mercy', (e) => void state.recordMercy(e as Parameters<WorldState['recordMercy']>[0]));

  const bossActor = actors.spawn({ kind: 'ashen-prior', team: 'hostile', maxHealth: 100, maxPoise: 10 });
  fake.actorMap.set(bossActor.id, new FakeActor(bossActor.id, 'ashen-prior', { kind: 'ashen-prior', team: 'hostile', maxHealth: 100, root: new THREE.Group() }));
  bosses.register(bossActor.id, { bossId: 'ashen-prior', nameKey: 'boss.ashen-prior', phases: [], breaksPerPhase: 1 });
  const seen: string[] = [];
  events.onAny((t) => void seen.push(t));
  const openWindow = () => {
    bossActor.restorePoise();
    damage.stagger(bossActor.id, player.id, 10);
  };
  const tick = (n: number) => {
    for (let i = 0; i < n; i++) interaction.fixedUpdate(DT);
  };
  /** Press mercy, keep holding for `seconds`, then let go. */
  const holdMercy = (seconds: number) => {
    input.press('mercy');
    tick(1);
    input.hold('mercy');
    tick(Math.round(seconds / DT));
    input.release('mercy');
    tick(1);
  };
  const startFavour = state.favour('ashwalkers');
  const gained = () => state.favour('ashwalkers') - startFavour;
  const settle = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds / DT); i++) {
      manager.think(DT);
      manager.animate(DT);
      fake.combatStep(DT);
      manager.react(DT);
    }
  };
  return { events, state, bosses, burn, manager, fake, bossActor, openWindow, holdMercy, seen, gained, settle };
}

describe('the Prior release, end to end', () => {
  it('a full hold releases the boss: boss.released, 20 Burn, Ashwalkers +4, one mercy', () => {
    const r = rig();
    r.openWindow();
    expect(r.bosses.state('ashen-prior')!.releaseOpen).toBe(true);
    r.holdMercy(MERCY.holdSeconds + 0.1);
    expect(r.bosses.state('ashen-prior')!.outcome).toBe('released');
    expect(r.seen).toContain('boss.released');
    expect(r.burn.value).toBe(20);
    expect(r.burn.scars).toBe(0);
    expect(r.gained()).toBe(4);
    expect(r.fake.bus.of('mercy').filter((m) => m.tier === 'boss')).toHaveLength(1);
  });

  it('letting go early releases nothing', () => {
    const r = rig();
    r.openWindow();
    r.holdMercy(MERCY.holdSeconds - 0.2);
    expect(r.bosses.state('ashen-prior')!.outcome).toBeNull();
    expect(r.burn.value).toBe(0);
    expect(r.gained()).toBe(0);
  });

  it('while Release is locked the hold never starts', () => {
    const r = rig({ releaseUnlocked: false });
    r.openWindow();
    r.holdMercy(MERCY.holdSeconds + 0.5);
    expect(r.bosses.state('ashen-prior')!.outcome).toBeNull();
    expect(r.burn.value).toBe(0);
  });

  it('with the window closed there is nothing to hold', () => {
    const r = rig();
    r.holdMercy(MERCY.holdSeconds + 0.5);
    expect(r.bosses.state('ashen-prior')!.outcome).toBeNull();
    expect(r.burn.value).toBe(0);
  });

  it('at Burn 75 the release adds a Scar; at Burn 100 it still releases, Burn stays 100 and a Scar is added', () => {
    const a = rig({ burn: 75 });
    a.openWindow();
    a.holdMercy(MERCY.holdSeconds + 0.1);
    expect(a.burn.scars).toBe(1);
    expect(a.burn.value).toBe(95);
    const b = rig({ burn: 100 });
    b.openWindow();
    b.holdMercy(MERCY.holdSeconds + 0.1);
    expect(b.bosses.state('ashen-prior')!.outcome).toBe('released');
    expect(b.burn.value).toBe(100);
    expect(b.burn.scars).toBe(1);
  });

  it('at Burn 74 there is no Scar', () => {
    const r = rig({ burn: 74 });
    r.openWindow();
    r.holdMercy(MERCY.holdSeconds + 0.1);
    expect(r.burn.scars).toBe(0);
  });

  it('a staggered summon in the pulse is released under the same single 20 charge', () => {
    const r = rig();
    const [id] = r.manager.service.spawnGroup('pack');
    r.settle(AI.riseSeconds + 0.1);
    // Beside the boss (3 m) but out of the player's reach, so the focus is the boss.
    r.manager.get(id)!.feet.set(3, 0, 0);
    r.fake.stagger(id, 'player');
    r.openWindow();
    r.holdMercy(MERCY.holdSeconds + 0.1);
    expect(r.burn.value).toBe(20);
    expect(r.fake.bus.of('mercy').map((m) => m.tier).sort()).toEqual(['boss', 'normal']);
    expect(r.gained()).toBe(5);
  });
});
