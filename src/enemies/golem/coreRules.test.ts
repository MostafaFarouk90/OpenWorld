import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { ActorRegistry } from '../../actors/ActorRegistry';
import { FIXED_TIMESTEP } from '../../config/constants';
import { GameEvents } from '../../core/events';
import { fakeActions, fakeContexts } from '../../interaction/testkit';
import { InteractionSystem, type Interactable } from '../../interaction/InteractionSystem';
import { WorldState } from '../../state/WorldState';
import { calmOptions } from '../calm';
import { EnemyManager } from '../EnemyManager';
import { FakeHost, loadKnight } from '../testing/fakeHost';
import { MERCY } from '../tuning';
import { CINDER_GOLEM } from './def';
import { GOLEM_CORE_ORDER, isCoreHit } from './rules';

describe('isCoreHit', () => {
  // yaw 0 faces -Z, so a hit from behind travels attacker -> golem along the facing, i.e. toward -Z.
  it('a named bone decides: core is a core hit, anything else is not, whatever the direction', () => {
    expect(isCoreHit('core', undefined, 0)).toBe(true);
    expect(isCoreHit('core', { x: 0, z: 1 }, 0)).toBe(true);
    expect(isCoreHit('chest', { x: 0, z: -1 }, 0)).toBe(false);
    expect(isCoreHit('head', undefined, 0)).toBe(false);
  });

  it('boneless: a hit from behind (direction along the facing) is a core hit', () => {
    expect(isCoreHit(undefined, { x: 0, z: -1 }, 0)).toBe(true);
    expect(isCoreHit(undefined, { x: 0, z: -7 }, 0)).toBe(true); // length does not matter
  });

  it('boneless: front and side hits are not, a 45 degree rear quarter is', () => {
    expect(isCoreHit(undefined, { x: 0, z: 1 }, 0)).toBe(false);
    expect(isCoreHit(undefined, { x: 1, z: 0 }, 0)).toBe(false);
    expect(isCoreHit(undefined, { x: 1, z: -1 }, 0)).toBe(true); // 45 degrees off the facing is still behind it
  });

  it('boneless: the threshold is 60 degrees off the facing', () => {
    const a = (deg: number) => ({ x: Math.sin((deg * Math.PI) / 180), z: -Math.cos((deg * Math.PI) / 180) });
    expect(isCoreHit(undefined, a(59), 0)).toBe(true);
    expect(isCoreHit(undefined, a(61), 0)).toBe(false);
  });

  it('boneless: yaw rotates the facing', () => {
    // yaw PI/2 faces -X
    expect(isCoreHit(undefined, { x: -1, z: 0 }, Math.PI / 2)).toBe(true);
    expect(isCoreHit(undefined, { x: 0, z: -1 }, Math.PI / 2)).toBe(false);
    // yaw PI faces +Z
    expect(isCoreHit(undefined, { x: 0, z: 1 }, Math.PI)).toBe(true);
  });

  it('no bone and no (or zero, or vertical-only) direction is not a core hit', () => {
    expect(isCoreHit(undefined, undefined, 0)).toBe(false);
    expect(isCoreHit(undefined, { x: 0, z: 0 }, 0)).toBe(false);
    expect(isCoreHit('', { x: 0, z: 0 }, 0)).toBe(false);
  });
});

describe('golem rule constants', () => {
  it('the core rule sits in the defender band after the Footman guard (-50), and the golem numbers', () => {
    expect(GOLEM_CORE_ORDER).toBe(-40);
    expect(CINDER_GOLEM.maxPoise).toBe(120);
    expect(CINDER_GOLEM.breakStaggerSeconds).toBe(2.5);
    expect(CINDER_GOLEM.mercy).toMatchObject({ when: 'exposed', freeCalm: 'always', verb: 'calm' });
  });
});

// ---- through the real EnemyManager (damage modifier 'enemies.core', Enemy, Brain) ---------------------------------

const DT = FIXED_TIMESTEP;
let gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] };
beforeAll(async () => {
  gltf = await loadKnight();
});

function rig(items: Record<string, number> = {}) {
  const events = new GameEvents((m, e) => {
    throw new Error(`${m} ${String(e)}`);
  });
  const actors = new ActorRegistry(events);
  const state = new WorldState(events, () => {});
  const player = actors.spawn({ id: 'player', kind: 'player', team: 'player', maxHealth: 100 });
  const input = fakeActions();
  const fake = new FakeHost(gltf.scene, { playerFeet: { x: 0, y: 0, z: 1.5 } });
  const interaction = new InteractionSystem({
    events,
    actions: () => input.actions,
    contexts: fakeContexts().stack,
    player: () => ({ actor: player, feet: fake.playerFeet, facingYaw: 0, moving: false }),
  });
  const bag = new Map(Object.entries(items));
  const inventory = {
    count: (id: string) => bag.get(id) ?? 0,
    remove: (id: string, n: number) => {
      if ((bag.get(id) ?? 0) < n) return false;
      bag.set(id, (bag.get(id) ?? 0) - n);
      return true;
    },
  };
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
        if (name === 'inventory') return inventory;
        return fake.host.services.get(name as 'vfx');
      }) as typeof fake.host.services.get,
    },
  };
  const manager = new EnemyManager(host, FakeHost.factory(gltf), { spawners: [], seed: 3 });
  fake.bus.on('mercy', (e) => void state.recordMercy(e as Parameters<WorldState['recordMercy']>[0]));
  const id = manager.spawnLoose('cinder-golem', { x: 0, y: 0, z: 0 })!;
  const enemy = manager.get(id)!;
  const actor = fake.actorMap.get(id)!;
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
  const hit = (extra: { bone?: string; direction?: THREE.Vector3; poise?: number; amount?: number; kind?: 'melee' | 'spell' } = {}) =>
    fake.apply({ attackerId: 'player', targetId: id, amount: extra.amount ?? 5, poise: extra.poise ?? 1, kind: extra.kind ?? 'melee', bone: extra.bone, direction: extra.direction });
  return { id, enemy, actor, fake, manager, state, inventory, bag, frame, frames, seconds, holdMercy, hit };
}

const FRONT = new THREE.Vector3(0, 0, 1); // attacker in front (golem faces -Z at yaw 0): the swing travels toward +Z, away from the facing
const BEHIND = new THREE.Vector3(0, 0, -1);

describe('area and ranged moves hurt once per swing', () => {
  it('while an area move is current, a tracer hit from the golem deals nothing but its own area hit stands', () => {
    const r = rig();
    r.enemy.brain.alert('player');
    let move = r.enemy.brain.currentMove;
    for (let i = 0; i < 600 && !(move?.area || move?.ranged); i++) {
      r.frames(1);
      move = r.enemy.brain.currentMove;
    }
    expect(move?.area || move?.ranged).toBeTruthy();
    const tracer = r.fake.apply({ attackerId: r.id, targetId: 'player', amount: 40, poise: 40, kind: 'melee', attackId: move!.clip })!;
    expect(tracer.outcome).toBe('immune');
    const own = r.fake.apply({ attackerId: r.id, targetId: 'player', amount: 40, poise: 40, kind: 'melee', attackId: `ranged:${move!.id}` })!;
    expect(own.outcome).toBe('hit');
  });
});

describe('Cinder Golem poise rules through the manager', () => {
  it('a heavy front hit (huge poise, bone chest) deals health damage but no stagger and no poise loss', () => {
    const r = rig();
    r.frames(2);
    const h = r.actor.health;
    const result = r.hit({ bone: 'chest', poise: 9999, amount: 30 })!;
    r.frames(2);
    expect(result.poise).toBe(0);
    expect(result.staggered).toBe(false);
    expect(r.actor.health).toBe(h - 30);
    expect(r.actor.poise).toBe(r.actor.maxPoise);
    expect(r.enemy.state).not.toBe('stagger');
  });

  it('a core hit (bone core) sets poise to max, so even a 1-poise hit staggers it and opens the exposed window', () => {
    const r = rig();
    r.frames(2);
    const result = r.hit({ bone: 'core', poise: 1 })!;
    r.frames(2);
    expect(result.poise).toBe(r.actor.maxPoise);
    expect(result.staggered).toBe(true);
    expect(r.enemy.state).toBe('stagger');
    expect(r.enemy.mercyOpen).toBe(true);
  });

  it('boneless hits fall back on the direction: from behind staggers, from the front does not (melee and spell)', () => {
    for (const kind of ['melee', 'spell'] as const) {
      const front = rig();
      front.frames(2);
      front.hit({ direction: FRONT, poise: 9999, kind });
      front.frames(2);
      expect(front.enemy.state).not.toBe('stagger');
      const back = rig();
      back.frames(2);
      back.hit({ direction: BEHIND, poise: 1, kind });
      back.frames(2);
      expect(back.enemy.state).toBe('stagger');
    }
  });

  it('a boneless hit with no direction at all is a front hit (no stagger)', () => {
    const r = rig();
    r.frames(2);
    r.hit({ poise: 9999 });
    r.frames(2);
    expect(r.enemy.state).not.toBe('stagger');
  });

  it('a parry or shield bash (damage.stagger from the front, no core hit) does not stagger it and restores its poise', () => {
    const r = rig();
    r.frames(2);
    r.hit({ bone: 'chest', poise: 40 }); // keeps poise at max under the rule; also check restore below
    r.actor.poise = 10;
    r.fake.stagger(r.id, 'player');
    r.frames(2);
    expect(r.enemy.state).not.toBe('stagger');
    expect(r.enemy.mercyOpen).toBe(false);
    expect(r.actor.poise).toBe(r.actor.maxPoise);
  });

  it('a core hit, unlike the front stagger, is consumed: a later front stagger is ignored again', () => {
    const r = rig();
    r.frames(2);
    r.hit({ bone: 'core' });
    r.frames(2);
    expect(r.enemy.state).toBe('stagger');
    r.seconds(3);
    expect(r.enemy.state).not.toBe('stagger');
    r.fake.stagger(r.id, 'player');
    r.frames(2);
    expect(r.enemy.state).not.toBe('stagger');
  });

  it('the exposed window lasts about breakStaggerSeconds, then it is no longer calmable', () => {
    const r = rig();
    r.frames(2);
    r.hit({ bone: 'core' });
    r.seconds(2.2);
    expect(r.enemy.state).toBe('stagger');
    expect(r.enemy.mercyOpen).toBe(true);
    r.seconds(0.6);
    expect(r.enemy.state).not.toBe('stagger');
    expect(r.enemy.mercyOpen).toBe(false);
    r.holdMercy(MERCY.holdSeconds + 0.2);
    expect(r.enemy.state).not.toBe('calmed');
  });

  it('it is not calmable before the core is broken', () => {
    const r = rig();
    r.frames(3);
    expect(r.enemy.mercyOpen).toBe(false);
    r.holdMercy(MERCY.holdSeconds + 0.2);
    expect(r.enemy.state).not.toBe('calmed');
  });

  it('Calm in the exposed window is the free option: no item taken, settles into a cairn (no walk-off), and fades', () => {
    expect(calmOptions(CINDER_GOLEM.mercy!, undefined, {})).toEqual([{ kind: 'free' }]);
    const r = rig({ 'hearth-bread': 2 });
    r.frames(2);
    r.hit({ bone: 'core' });
    r.frames(3);
    const at = r.enemy.feet.clone();
    r.holdMercy(MERCY.holdSeconds + 0.2);
    expect((r.enemy as unknown as { goneHow: string }).goneHow).toBe('calmed');
    expect(r.enemy.state).toBe('calmed');
    expect(r.bag.get('hearth-bread')).toBe(2);
    expect(r.enemy.feet.distanceTo(at)).toBeLessThan(0.01);
    r.seconds(1);
    expect(r.manager.get(r.id)).toBeUndefined();
  });

  it('the Calm prompt anchors on the exposed core, not the feet', () => {
    const r = rig();
    r.frames(2);
    const out = new THREE.Vector3();
    r.enemy.mercyAnchor(out);
    const core = (r.enemy.body as unknown as { coreWorldPosition(o: THREE.Vector3): THREE.Vector3 }).coreWorldPosition(new THREE.Vector3());
    expect(out.distanceTo(core)).toBeLessThan(1e-6);
    expect(out.y).toBeGreaterThan(r.enemy.feet.y + 0.5);
  });

  it('markCoreHit only arms back-core kinds (a stray call on another kind does not make it stagger-immune or vulnerable)', () => {
    const r = rig();
    const wraith = r.manager.spawnLoose('ash-wraith', { x: 9, y: 0, z: 9 })!;
    const w = r.manager.get(wraith)!;
    w.markCoreHit();
    r.seconds(3); // let it finish rising
    r.fake.stagger(wraith, 'player');
    r.frames(2);
    expect(w.state).toBe('stagger'); // ordinary kinds stagger on any break
  });
});
