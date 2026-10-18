import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ActorRegistry } from '../actors/ActorRegistry';
import { FIXED_TIMESTEP } from '../config/constants';
import { GameEvents } from '../core/events';
import { InputManager } from '../input/InputManager';
import { fakeActions, fakeContexts } from '../interaction/testkit';
import { InteractionSystem, type Interactable } from '../interaction/InteractionSystem';
import { Inventory } from '../inventory/Inventory';
import { Burn } from '../spells/Burn';
import { WorldState } from '../state/WorldState';
import { ENEMY_DEFS } from './defs';
import { EnemyManager } from './EnemyManager';
import { FakeHost, loadKnight } from './testing/fakeHost';
import { MERCY } from './tuning';
import type { EnemyDef, EnemyKind, SpawnerDef } from './types';

const DT = FIXED_TIMESTEP;
let gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] };

// Thread 5's hound row is not on main yet: this fixture stands in for it (see mercyCalm.test.ts).
const HOUND: EnemyDef = {
  ...ENEMY_DEFS['ash-wraith'],
  kind: 'fixture-hound' as EnemyKind,
  rises: false,
  mercy: {
    verb: 'calm',
    tier: 'normal',
    track: 'dragons',
    when: 'calming',
    offerings: [
      { itemId: 'hearth-bread', count: 1 },
      { itemId: 'barley-cake', count: 1 },
    ],
    warmHand: true,
  },
};

beforeAll(async () => {
  gltf = await loadKnight();
  (ENEMY_DEFS as unknown as Record<string, EnemyDef>)[HOUND.kind] = HOUND;
});
afterAll(() => {
  delete (ENEMY_DEFS as unknown as Record<string, EnemyDef>)[HOUND.kind];
});

const SPAWNERS: SpawnerDef[] = [
  { id: 'kennel', enemy: 'fixture-hound' as SpawnerDef['enemy'], count: 1, anchor: 'spawn.kennel', band: { min: 1, max: 1 }, activation: 'manual', respawn: 'never', leash: false },
];

/**
 * The real InteractionSystem (focus, 0.5 s hold), InputManager wheel claims, Inventory, Burn (`useShard`, Scars) and
 * WorldState favour driving the real EnemyManager; only the enemy bodies and the avatar are fakes.
 */
function rig(opts: { burn?: number; items?: Record<string, number> } = {}) {
  const events = new GameEvents((m, e) => {
    throw new Error(`${m} ${String(e)}`);
  });
  const actors = new ActorRegistry(events);
  const state = new WorldState(events, () => {});
  const player = actors.spawn({ id: 'player', kind: 'player', team: 'player', maxHealth: 100 });
  const input = fakeActions();
  const interaction = new InteractionSystem({
    events,
    actions: () => input.actions,
    contexts: fakeContexts().stack,
    player: () => ({ actor: player, feet: new THREE.Vector3(0, 0, 1.5), facingYaw: 0, moving: false }),
  });
  const element = Object.assign(new EventTarget(), { requestPointerLock() {} }) as unknown as HTMLElement;
  const wheelInput = new InputManager(element, new EventTarget(), Object.assign(new EventTarget(), { pointerLockElement: null }) as never);
  const scroll = (deltaY: number) => element.dispatchEvent(Object.assign(new Event('wheel'), { deltaY }));
  const inventory = new Inventory({ emit: () => {}, logger: { warn: () => {} } });
  for (const [id, n] of Object.entries(opts.items ?? {})) inventory.add(id, n);
  const burn = new Burn();
  burn.add(opts.burn ?? 0, 'test');

  const fake = new FakeHost(gltf.scene, { playerFeet: { x: 0, y: 0, z: 1.5 } });
  fake.defineAnchor('spawn.kennel', 0, 0);
  fake.flags.set('enemies.mercy.calm', true);
  const host = {
    ...fake.host,
    interaction: { register: (i: unknown) => interaction.register(i as Interactable) },
    calmUi: {
      focusedId: () => interaction.focusFor('mercy')?.id ?? null,
      holding: () => interaction.holdProgressFor('mercy') > 0,
      modalOpen: () => false,
      claimWheel: (o: string) => wheelInput.claimWheel(o),
      consumeWheel: (o: string) => wheelInput.consumeWheel(o),
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
  const manager = new EnemyManager(host, FakeHost.factory(gltf), { spawners: SPAWNERS, seed: 7 });
  fake.bus.on('mercy', (e) => void state.recordMercy(e as Parameters<WorldState['recordMercy']>[0]));
  const [id] = manager.service.spawnGroup('kennel');

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
  /** Press mercy, keep holding for `seconds`, then let go. */
  const holdMercy = (seconds: number) => {
    input.press('mercy');
    frame();
    input.hold('mercy');
    frames(Math.round(seconds / DT));
    input.release('mercy');
    frame();
  };
  const startFavour = state.favour('dragons');
  return { id: id!, manager, fake, inventory, burn, wheelInput, scroll, frames, holdMercy, state, gained: () => state.favour('dragons') - startFavour };
}

describe('Calm, end to end', () => {
  it('a full hold with Hearth Bread: the loaf goes, Dragons +1, no Burn, the hound calmed', () => {
    const r = rig({ items: { 'hearth-bread': 2 } });
    r.frames(3);
    r.holdMercy(MERCY.holdSeconds + 0.1);
    expect(r.inventory.count('hearth-bread')).toBe(1);
    expect(r.manager.get(r.id)!.state).toBe('calmed');
    expect(r.gained()).toBe(1);
    expect(r.burn.value).toBe(0);
  });

  it('letting go early takes nothing', () => {
    const r = rig({ items: { 'hearth-bread': 1 } });
    r.frames(3);
    r.holdMercy(MERCY.holdSeconds - 0.2);
    expect(r.inventory.count('hearth-bread')).toBe(1);
    expect(r.manager.get(r.id)!.state).not.toBe('calmed');
    expect(r.gained()).toBe(0);
  });

  it('the wheel picks the second offering over the bread through the real claim, and the camera gets nothing back', () => {
    const r = rig({ items: { 'hearth-bread': 1, 'barley-cake': 1 } });
    r.frames(3);
    expect(r.wheelInput.wheelOwner).toBe('enemies.calm');
    r.scroll(120);
    r.frames(1);
    r.holdMercy(MERCY.holdSeconds + 0.1);
    expect(r.inventory.count('barley-cake')).toBe(0);
    expect(r.inventory.count('hearth-bread')).toBe(1);
    expect(r.burn.value).toBe(0);
    expect(r.wheelInput.wheelOwner).toBeNull();
    expect(r.wheelInput.consumeWheel()).toBe(0);
  });

  it('walking away (focus lost) releases the wheel claim', () => {
    const r = rig({ items: { 'hearth-bread': 1, 'barley-cake': 1 } });
    r.frames(3);
    expect(r.wheelInput.wheelOwner).toBe('enemies.calm');
    r.manager.get(r.id)!.feet.set(40, 0, 0);
    r.frames(2);
    expect(r.wheelInput.wheelOwner).toBeNull();
  });

  for (const [before, after, scars] of [
    [74, 84, 0],
    [75, 85, 1],
    [100, 100, 1],
  ] as const) {
    it(`the Warm Hand at Burn ${before}: ${after} Burn, ${scars} Scar`, () => {
      const r = rig({ burn: before });
      r.frames(3);
      r.holdMercy(MERCY.holdSeconds + 0.1);
      expect(r.manager.get(r.id)!.state).toBe('calmed');
      expect(r.burn.value).toBe(after);
      expect(r.burn.scars).toBe(scars);
    });
  }

  it('a struck hound refuses the hold until it staggers, then takes the Warm Hand', () => {
    const r = rig();
    r.frames(3);
    r.fake.apply({ attackerId: 'player', targetId: r.id, amount: 1, poise: 1, kind: 'melee' });
    r.frames(2);
    r.holdMercy(MERCY.holdSeconds + 0.1);
    expect(r.manager.get(r.id)!.state).not.toBe('calmed');
    expect(r.burn.value).toBe(0);
    r.fake.stagger(r.id, 'player');
    r.frames(2);
    r.holdMercy(MERCY.holdSeconds + 0.1);
    expect(r.manager.get(r.id)!.state).toBe('calmed');
    expect(r.burn.value).toBe(10);
  });
});
