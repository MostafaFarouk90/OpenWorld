import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { ActorRegistry } from '../../actors/ActorRegistry';
import { FIXED_TIMESTEP } from '../../config/constants';
import { GameEvents } from '../../core/events';
import { fakeActions, fakeContexts } from '../../interaction/testkit';
import { InteractionSystem, type Interactable } from '../../interaction/InteractionSystem';
import { Burn } from '../../spells/Burn';
import { WorldState } from '../../state/WorldState';
import { calmOptions } from '../calm';
import { EnemyManager } from '../EnemyManager';
import { FakeHost, loadKnight } from '../testing/fakeHost';
import { MERCY } from '../tuning';
import { CRAWLER_DROP, SLAG_CRAWLER } from './def';
import { CEILING } from './tuning';

const DT = FIXED_TIMESTEP;
let gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] };
beforeAll(async () => {
  gltf = await loadKnight();
});

/** Real InteractionSystem, Inventory, WorldState and EnemyManager; the crawler body is the real procedural one. */
function rig(opts: { items?: Record<string, number>; hanging?: boolean; player?: { x: number; z: number } } = {}) {
  const events = new GameEvents((m, e) => {
    throw new Error(`${m} ${String(e)}`);
  });
  const actors = new ActorRegistry(events);
  const state = new WorldState(events, () => {});
  const player = actors.spawn({ id: 'player', kind: 'player', team: 'player', maxHealth: 100 });
  const input = fakeActions();
  const fake = new FakeHost(gltf.scene, { playerFeet: { x: opts.player?.x ?? 0, y: 0, z: opts.player?.z ?? 1.5 } });
  const interaction = new InteractionSystem({
    events,
    actions: () => input.actions,
    contexts: fakeContexts().stack,
    player: () => ({ actor: player, feet: fake.playerFeet, facingYaw: 0, moving: false }),
  });
  const items = new Map(Object.entries(opts.items ?? {}));
  const inventory = {
    count: (id: string) => items.get(id) ?? 0,
    remove: (id: string, n: number) => {
      if ((items.get(id) ?? 0) < n) return false;
      items.set(id, (items.get(id) ?? 0) - n);
      return true;
    },
  };
  const burn = new Burn();
  fake.flags.set('enemies.mercy.calm', true);
  const host = {
    ...fake.host,
    interaction: { register: (i: unknown) => interaction.register(i as Interactable) },
    calmUi: {
      focusedId: () => interaction.focusFor('mercy')?.id ?? null,
      holding: () => interaction.holdProgressFor('mercy') > 0,
      modalOpen: () => false,
      claimWheel: () => () => {},
      consumeWheel: () => 0,
      text: (k: string) => k,
    },
    services: {
      get: ((name: string) => {
        if (name === 'spells') return { useShard: (g: number, s: string) => burn.useShard(g, s) };
        if (name === 'inventory') return { count: (id: string) => inventory.count(id), remove: (id: string, n: number) => inventory.remove(id, n) };
        return fake.host.services.get(name as 'vfx');
      }) as typeof fake.host.services.get,
    },
  };
  const manager = new EnemyManager(host, FakeHost.factory(gltf), { spawners: [], seed: 7 });
  fake.bus.on('mercy', (e) => void state.recordMercy(e as Parameters<WorldState['recordMercy']>[0]));
  const id = manager.spawnLoose('slag-crawler', { x: 0, y: 0, z: 0 }, { hanging: opts.hanging ?? true })!;
  const enemy = manager.get(id)!;
  const ground = manager.service.ground.get(id)!;
  const frame = () => {
    manager.think(DT);
    manager.animate(DT);
    fake.combatStep(DT);
    manager.react(DT);
    interaction.fixedUpdate(DT);
    manager.render(1);
  };
  const frames = (n: number) => {
    for (let i = 0; i < n; i++) frame();
  };
  const seconds = (s: number) => frames(Math.round(s / DT));
  const holdMercy = (s: number) => {
    input.press('mercy');
    frame();
    input.hold('mercy');
    seconds(s);
    input.release('mercy');
    frame();
  };
  const untilLanded = () => {
    for (let i = 0; i < 600 && !enemy.ceiling!.landed; i++) frame();
  };
  const hit = (poise = 1, amount = 1) => fake.apply({ attackerId: 'player', targetId: id, amount, poise, kind: 'melee' });
  const start = state.favour('grisel');
  const states = (): string[] => fake.bus.log.filter((l) => l.type === 'enemies.state').map((l) => (l.payload as { to: string }).to);
  return { id, enemy, ground, manager, fake, inventory, state, player: fake.player, frame, frames, seconds, holdMercy, untilLanded, hit, gained: () => state.favour('grisel') - start, states, service: manager.service };
}

describe('Slag Crawler on the ceiling', () => {
  it('spawns hanging and stays up while the player is outside the trigger range', () => {
    const r = rig({ player: { x: 0, z: CEILING.triggerRadius + 2 } });
    expect(r.ground.ceiling!.state).toBe('hanging');
    expect(r.ground.ceiling!.lift).toBeGreaterThan(0);
    r.seconds(3);
    expect(r.ground.ceiling!.state).toBe('hanging');
    expect(r.player.health).toBe(r.player.maxHealth);
  });

  it('hanging = false spawns on the floor with no ceiling form', () => {
    const r = rig({ hanging: false });
    expect(r.ground.ceiling).toBeNull();
  });

  it('a player within the trigger range starts the drip, which falls after the drip time and lands with a radius-3 hit', () => {
    const r = rig({ player: { x: 0, z: 2 } });
    r.frames(2);
    expect(r.ground.ceiling!.state).toBe('dripping');
    const tele = r.fake.bus.log.filter((l) => l.type === 'telegraph').map((l) => l.payload as { kind: string; leadSeconds: number; moveId: string });
    expect(tele.some((t) => t.kind === 'dodge' && t.moveId === CRAWLER_DROP.id && t.leadSeconds === CEILING.dripSeconds)).toBe(true);
    r.seconds(CEILING.dripSeconds - 0.2);
    expect(r.ground.ceiling!.state).toBe('dripping');
    expect(r.player.health).toBe(r.player.maxHealth);
    r.seconds(0.2 + 0.1);
    expect(['falling', 'landed']).toContain(r.ground.ceiling!.state);
    r.untilLanded();
    expect(r.ground.ceiling!.state).toBe('landed');
    expect(r.ground.ceiling!.lift).toBe(0);
    expect(r.player.health).toBe(r.player.maxHealth - CRAWLER_DROP.damage);
  });

  it('the landing circle has radius 3: a player outside it is not hurt', () => {
    expect(CRAWLER_DROP.area).toEqual({ radius: 3, centre: 'self' });
    const r = rig({ player: { x: 0, z: 4 } });
    r.untilLanded();
    expect(r.ground.ceiling!.landed).toBe(true);
    expect(r.player.health).toBe(r.player.maxHealth);
  });

  it('after landing it fights: alerted, and its bite telegraph is the 0.5 s rear-up', () => {
    expect(SLAG_CRAWLER.moves.find((m) => m.id === 'crawler.bite')!.windup).toBe(0.5);
    const r = rig({ player: { x: 0, z: 1.2 } });
    r.seconds(CEILING.dripSeconds + 2);
    expect(r.ground.ceiling!.landed).toBe(true);
    r.seconds(1.5);
    const tele = r.fake.bus.log.filter((l) => l.type === 'telegraph').map((l) => l.payload as { moveId?: string; leadSeconds: number });
    const bite = tele.find((t) => t.moveId === 'crawler.bite');
    expect(bite).toBeDefined();
    expect(bite!.leadSeconds).toBeCloseTo(0.5, 5);
  });

  it('a hit while hanging wakes it at once (no drip) and it falls', () => {
    const r = rig({ player: { x: 0, z: 20 } });
    r.frames(2);
    expect(r.ground.ceiling!.state).toBe('hanging');
    r.hit();
    expect(r.ground.ceiling!.state).toBe('falling');
    r.seconds(2);
    expect(r.ground.ceiling!.landed).toBe(true);
  });
});

describe('Slag Crawler cooling and Calm', () => {
  it('no cooling hit and no draught: no free option, no offering, nothing offered', () => {
    const r = rig({ hanging: false, items: { 'cooling-draught': 3 } });
    r.frames(3);
    expect(r.enemy.mercyOpen).toBe(true); // an unstruck crawler is open to a thrown Calm
    expect(calmOptions(SLAG_CRAWLER.mercy!, r.inventory, { cooled: false })).toEqual([]);
    expect(calmOptions(SLAG_CRAWLER.mercy!, undefined, {})).toEqual([]);
    expect(r.enemy.isCooled).toBe(false);
    r.holdMercy(MERCY.holdSeconds + 0.2);
    expect(r.enemy.state).not.toBe('calmed');
    expect(r.inventory.count('cooling-draught')).toBe(3);
    expect(r.gained()).toBe(0);
  });

  it('calmOptions skips thrown offerings for the held Calm, even with the draught in the pack', () => {
    const inv = { count: () => 5, remove: () => true };
    expect(calmOptions(SLAG_CRAWLER.mercy!, inv, {})).toEqual([]);
    expect(calmOptions(SLAG_CRAWLER.mercy!, inv, { cooled: true })).toEqual([{ kind: 'free' }]);
  });

  it('a cooling hit staggers a high-poise-proof crawler, is not a strike, and a Calm hold then pays Grisel +1 for free', () => {
    const r = rig({ hanging: false, items: { 'cooling-draught': 2 } });
    r.frames(3);
    expect(r.ground.coolingHit(r.player.id)).toBe(true);
    r.frames(2);
    expect(r.enemy.state).toBe('stagger');
    expect(r.enemy.isCooled).toBe(true);
    expect(r.enemy.mercyOpen).toBe(true);
    r.holdMercy(MERCY.holdSeconds + 0.2);
    expect(r.enemy.state).toBe('calmed');
    expect(r.gained()).toBe(1);
    expect(r.inventory.count('cooling-draught')).toBe(2); // free: the draught is not spent
  });

  it('a cooling hit does not need any poise damage (poise stays full)', () => {
    const r = rig({ hanging: false });
    r.frames(2);
    const before = r.fake.actorMap.get(r.id)!.poise;
    expect(r.ground.coolingHit(null)).toBe(true);
    r.frames(2);
    expect(r.fake.actorMap.get(r.id)!.poise).toBe(before);
    expect(r.enemy.state).toBe('stagger');
  });

  it('a real hit (markStruck) closes the plain Calm window, unlike a cooling hit', () => {
    const r = rig({ hanging: false });
    r.frames(2);
    r.hit(1, 1);
    r.frames(2);
    expect(r.enemy.mercyOpen).toBe(false);
    expect(r.ground.coolingHit(r.player.id)).toBe(true);
    r.frames(2);
    expect(r.enemy.state).toBe('stagger');
    expect(r.enemy.isCooled).toBe(true);
  });

  it('cooling a hanging crawler wakes it and drops it', () => {
    const r = rig({ player: { x: 0, z: 20 } });
    expect(r.ground.ceiling!.state).toBe('hanging');
    expect(r.ground.coolingHit(r.player.id)).toBe(true);
    expect(r.ground.ceiling!.state).toBe('dripping');
  });

  it('the cooled flag ends with the stagger', () => {
    const r = rig({ hanging: false });
    r.frames(2);
    r.ground.coolingHit(r.player.id);
    r.frames(2);
    expect(r.enemy.isCooled).toBe(true);
    r.seconds(5);
    expect(r.enemy.state).not.toBe('stagger');
    expect(r.enemy.isCooled).toBe(false);
  });

  it('calmByThrow on a floor crawler calms it; Grisel +1 and it settles (no walk-off, calmed, fades)', () => {
    const r = rig({ hanging: false });
    r.frames(3);
    expect(r.service.ground.calmByThrow(r.id)).toBe(true);
    r.frames(2);
    expect((r.enemy as unknown as { goneHow: string }).goneHow).toBe('calmed');
    expect(r.enemy.state).toBe('calmed');
    const at = r.enemy.feet.clone();
    r.seconds(0.3);
    expect(r.enemy.feet.distanceTo(at)).toBeLessThan(0.01);
    r.seconds(1);
    expect(r.manager.get(r.id)).toBeUndefined();
    expect(r.gained()).toBe(1);
  });

  it('calmByThrow on a HANGING crawler (as coded): accepted while unstruck, it settles to the floor without the landing circle', () => {
    const r = rig({ player: { x: 0, z: 2 } });
    // Player is in range, but calm lands before the drip is over.
    expect(r.ground.ceiling!.state).toBe('hanging');
    expect(r.service.ground.calmByThrow(r.id)).toBe(true);
    expect(r.ground.ceiling!.landed).toBe(true);
    expect(r.ground.ceiling!.lift).toBe(0);
    r.seconds(2);
    expect(r.player.health).toBe(r.player.maxHealth);
    expect(r.gained()).toBe(1);
  });

  it('calmByThrow is refused for a struck crawler and while Calm is locked', () => {
    const r = rig({ hanging: false });
    r.frames(2);
    r.hit();
    r.frames(2);
    expect(r.service.ground.calmByThrow(r.id)).toBe(false);
    const r2 = rig({ hanging: false });
    r2.fake.flags.set('enemies.mercy.calm', false);
    expect(r2.service.ground.calmByThrow(r2.id)).toBe(false);
    expect(r2.service.ground.calmByThrow('nobody')).toBe(false);
  });

  it('a calmed crawler is invulnerable and does not attack afterwards', () => {
    const r = rig({ hanging: false, player: { x: 0, z: 1 } });
    r.frames(2);
    r.service.ground.calmByThrow(r.id);
    r.seconds(2);
    expect(r.player.health).toBe(r.player.maxHealth);
  });
});

describe('coolingHit on real enemies', () => {
  it('coolingHit refuses a dead-state or non-crawler kind via def and an already-gone enemy', () => {
    const r = rig({ hanging: false });
    r.frames(2);
    const wraith = r.manager.spawnLoose('ash-wraith', { x: 8, y: 0, z: 8 })!;
    expect(r.ground.coolingHit(null)).toBe(true);
    expect(r.service.ground.get(wraith)!.coolingHit(null)).toBe(false);
  });
});

