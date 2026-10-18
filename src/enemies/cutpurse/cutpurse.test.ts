import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { FIXED_TIMESTEP } from '../../config/constants';
import { Brain, type BrainHooks, type Senses } from '../ai/Brain';
import { ENEMY_CLIPS } from '../clips';
import { ENEMY_DEFS } from '../defs';
import { buildEnemyModel } from '../EnemyModel';
import { EnemyManager } from '../EnemyManager';
import { bandForRegion, REGION_BANDS } from '../level';
import { mercyInteractableId } from '../mercy';
import { FakeHost, loadKnight } from '../testing/fakeHost';
import { AI } from '../tuning';
import type { SpawnerDef } from '../types';
import { ALLEY_CUTPURSE, CUTPURSE_MOVES } from './def';
import { CUTPURSE, theftAmount } from './tuning';

const DT = FIXED_TIMESTEP;
let gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] };
beforeAll(async () => {
  gltf = await loadKnight();
});

const GRAB_ONLY = [CUTPURSE_MOVES.grab];
const def = (over: Partial<SpawnerDef> = {}): SpawnerDef => ({
  id: 'purse', enemy: 'alley-cutpurse', count: 1, anchor: 'a', band: { min: 1, max: 1 },
  activation: 'manual', respawn: 'never', leash: false, ...over,
});

function rig(gold: number | null, opts: { spare?: boolean } = {}) {
  // The player stands 1 m from the thief's anchor: inside the grab's 1.2 m lunge.
  const fake = new FakeHost(gltf.scene, { playerFeet: { x: 0, y: 0, z: -1 } });
  fake.defineAnchor('a', 0, 0);
  fake.flags.set('enemies.mercy.spare', opts.spare ?? true);
  const inv = gold === null ? undefined : fake.provideInventory(gold);
  const m = new EnemyManager(fake.host, FakeHost.factory(gltf), { spawners: [def()], seed: 7 });
  const tick = (seconds = DT) => {
    for (let i = 0; i < Math.max(1, Math.round(seconds / DT)); i++) {
      m.think(DT);
      m.animate(DT);
      fake.combatStep(DT);
      m.react(DT);
    }
  };
  const until = (cond: () => boolean, seconds = 20): boolean => {
    for (let i = 0; i < Math.round(seconds / DT); i++) {
      if (cond()) return true;
      tick();
    }
    return cond();
  };
  const spawn = (o: { moves?: readonly string[] } = {}) => {
    const [id] = m.service.spawnGroup('purse', { aggro: true, ...o });
    return id!;
  };
  /** Spawns a grab-only thief and ticks until it has robbed the player. */
  const robbed = () => {
    const id = spawn({ moves: GRAB_ONLY });
    expect(until(() => fake.bus.of('enemies.cutpurse.robbed').length > 0, 10)).toBe(true);
    return id;
  };
  return { fake, inv, m, tick, until, spawn, robbed };
}
type Rig = ReturnType<typeof rig>;

const interact = (t: Rig, id: string) =>
  t.fake.interactables.get(mercyInteractableId(t.m.get(id)!.slug))!.onInteract(t.fake.player);

describe('theftAmount', () => {
  it('is min(gold, 10% rounded up, 40)', () => {
    expect(theftAmount(1)).toBe(1);
    expect(theftAmount(5)).toBe(1);
    expect(theftAmount(11)).toBe(2);
    expect(theftAmount(250)).toBe(25);
    expect(theftAmount(400)).toBe(40);
    expect(theftAmount(100000)).toBe(40);
  });
  it('is 0 for an empty, negative or invalid purse', () => {
    for (const g of [0, -5, 0.4, NaN, Infinity, -Infinity]) expect(theftAmount(g), String(g)).toBe(0);
  });
});

describe('Alley Cutpurse def', () => {
  it('matches the spec', () => {
    const d = ENEMY_DEFS['alley-cutpurse'];
    expect(d).toBe(ALLEY_CUTPURSE);
    expect(d).toMatchObject({ maxHealth: 25, maxPoise: 10, chaseSpeed: 4.2, fleeAtHealth: 0.5, thief: true });
    expect(d.mercy).toEqual({ verb: 'spare', tier: 'normal', track: null, when: 'yielding' });
    const slash = d.moves.find((m) => m.id === 'cutpurse.slash')!;
    expect(slash).toMatchObject({ windup: 0.3, damage: 6 });
    expect(d.moves.find((m) => m.id === 'cutpurse.grab')!.range[1]).toBe(1.2);
    const smoke = d.moves.find((m) => m.id === 'cutpurse.smoke')!;
    expect(smoke.windup).toBe(0.4);
    expect(smoke.weight).toBe(0);
  });
  it('Harrowmark has the 4..9 band', () => {
    expect(REGION_BANDS.harrowmark).toEqual({ min: 4, max: 9 });
    expect(bandForRegion('harrowmark')).toEqual({ min: 4, max: 9 });
  });
  it('builds on the Rogue rig as well as the Knight fallback', async () => {
    (globalThis as { self?: unknown }).self ??= globalThis;
    const fsModule = 'node:fs';
    const { readFileSync } = (await import(/* @vite-ignore */ fsModule)) as {
      readFileSync(p: string): { buffer: ArrayBuffer; byteOffset: number; byteLength: number };
    };
    const file = readFileSync('public/assets/kaykit-adventurers/characters/Rogue.glb');
    const buf = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
    const rogue = await new Promise<{ scene: THREE.Object3D; animations: THREE.AnimationClip[] }>((res, rej) =>
      new GLTFLoader().parse(buf, '', res as never, rej),
    );
    expect(rogue.animations.map((c) => c.name)).toEqual(expect.arrayContaining(['Use_Item', '1H_Melee_Attack_Slice_Horizontal', 'Unarmed_Melee_Attack_Punch_A']));
    const model = buildEnemyModel({ model: SkeletonUtils.clone(rogue.scene), clips: rogue.animations }, ALLEY_CUTPURSE);
    expect(model.tracers.right).toBeDefined();
    model.dispose();
  });
});

describe('the coin grab', () => {
  it('takes the capped amount through takeGold(n, theft), keeps it and flees', () => {
    const t = rig(1000);
    const id = t.robbed();
    expect(t.inv!.spent).toEqual([{ amount: 40, reason: 'theft' }]);
    expect(t.inv!.gold).toBe(960);
    expect(t.m.get(id)!.thief!.stolenGold).toBe(40);
    expect(t.fake.bus.of('enemies.cutpurse.robbed')).toEqual([{ amount: 40 }]);
    t.tick(0.1);
    expect(t.m.get(id)!.state).toBe('flee');
  });

  it('takes ten percent rounded up from a modest purse', () => {
    const t = rig(83);
    t.robbed();
    expect(t.inv!.gold).toBe(83 - 9);
    expect(t.fake.bus.of('enemies.cutpurse.robbed')).toEqual([{ amount: 9 }]);
  });

  it('with no gold there is no grab: the thief only slashes', () => {
    const t = rig(0);
    const id = t.spawn({ moves: GRAB_ONLY });
    t.tick(5);
    // The grab is the only allowed move and it is not available, so nothing starts.
    expect(t.fake.bus.of('telegraph')).toHaveLength(0);
    expect(t.fake.bus.of('enemies.cutpurse.robbed')).toHaveLength(0);
    expect(t.m.get(id)!.thief!.canGrab()).toBe(false);

    const free = rig(0);
    free.spawn();
    free.tick(8);
    const moves = free.fake.bus.of('telegraph').map((e) => e.moveId);
    expect(moves.length).toBeGreaterThan(0);
    expect(new Set(moves)).toEqual(new Set([CUTPURSE_MOVES.slash]));
    expect(free.inv!.spent).toHaveLength(0);
  });

  it('without an inventory service it steals nothing and warns once', () => {
    const t = rig(null);
    const id = t.spawn();
    t.m.get(id)!.thief!.grabHit();
    t.m.get(id)!.thief!.grabHit();
    expect(t.fake.bus.of('enemies.cutpurse.robbed')).toHaveLength(0);
    expect(t.fake.warnings.filter((w) => w.includes('inventory'))).toHaveLength(1);
    expect(t.m.get(id)!.state).not.toBe('flee');
  });

  it('a block stops the theft (only a landed hit steals)', () => {
    const t = rig(500);
    t.spawn({ moves: GRAB_ONLY });
    // The player raises a block: every melee hit on the player is blocked.
    t.fake.modifiers.push({ id: 'test.block', order: 0, fn: (req, target) => { if (target.id === 'player') req.outcome = 'blocked'; } });
    t.tick(6);
    expect(t.fake.bus.of('telegraph').length).toBeGreaterThan(0);
    expect(t.fake.bus.of('enemies.cutpurse.robbed')).toHaveLength(0);
    expect(t.inv!.gold).toBe(500);
  });

  it('a second grab is impossible while it holds the pouch', () => {
    const t = rig(1000);
    const id = t.robbed();
    const thief = t.m.get(id)!.thief!;
    expect(thief.canGrab()).toBe(false);
    expect(thief.availableMoves(ALLEY_CUTPURSE.moves).some((m) => m.id === CUTPURSE_MOVES.grab)).toBe(false);
    expect(thief.grabHit()).toBe(0);
    t.tick(2);
    expect(t.inv!.spent).toHaveLength(1);
    expect(t.fake.bus.of('enemies.cutpurse.robbed')).toHaveLength(1);
  });
});

describe('fleeing', () => {
  it('runs, uses the smoke bomb (tell, hidden puff), then blinks out and the gold is lost', () => {
    const t = rig(1000);
    const id = t.robbed();
    const e = t.m.get(id)!;
    const sawSmokeTell = () => t.fake.bus.of('telegraph').some((x) => x.moveId === CUTPURSE_MOVES.smoke);
    expect(t.until(sawSmokeTell, CUTPURSE.fleeSeconds)).toBe(true);
    const tell = t.fake.bus.of('telegraph').find((x) => x.moveId === CUTPURSE_MOVES.smoke)!;
    expect(tell.leadSeconds).toBe(CUTPURSE.smokeTelegraphSeconds);
    expect(e.thief!.holdStill).toBe(true);
    expect(e.body.root.visible).toBe(true);
    expect(e.body.currentClip).toBe(ENEMY_CLIPS.useItem);
    const standing = e.feet.clone();
    t.tick(CUTPURSE.smokeTelegraphSeconds / 2);
    expect(e.feet.distanceTo(standing)).toBeLessThan(0.01);
    // The puff: hidden, and it moves away while hidden.
    expect(t.until(() => e.thief!.hidden, 1)).toBe(true);
    expect(e.body.root.visible).toBe(false);
    const hiddenAt = e.feet.clone();
    t.tick(CUTPURSE.smokeHiddenSeconds / 2);
    expect(e.feet.distanceTo(hiddenAt)).toBeGreaterThan(1);
    // ...then it blinks out. The pouch is gone for good.
    expect(t.until(() => t.m.get(id) === undefined, CUTPURSE.smokeHiddenSeconds)).toBe(true);
    expect(t.inv!.gold).toBe(960);
    expect(t.inv!.added).toEqual([]);
  });

  it('without the smoke it still despawns when the flee window ends, and the gold is lost', () => {
    const t = rig(1000);
    const id = t.robbed();
    // Take the smoke away: pretend it was used.
    (t.m.get(id)!.thief as unknown as { smokeUsed: boolean }).smokeUsed = true;
    // The player keeps the thief in sight by running after it.
    const follow = (seconds: number) => {
      for (let i = 0; i < Math.round(seconds / 0.25); i++) {
        const f = t.m.get(id)?.feet;
        if (f) t.fake.movePlayer(f.x, f.z - 4);
        t.tick(0.25);
      }
    };
    follow(CUTPURSE.fleeSeconds - 1);
    expect(t.m.get(id)).toBeDefined();
    follow(2);
    expect(t.m.get(id)).toBeUndefined();
    expect(t.inv!.gold).toBe(960);
  });

  it('despawns early once the player has not seen it for five seconds', () => {
    const t = rig(1000);
    const id = t.robbed();
    (t.m.get(id)!.thief as unknown as { smokeUsed: boolean }).smokeUsed = true;
    t.fake.movePlayer(0, -60); // beyond sight range
    t.tick(CUTPURSE.outOfSightSeconds - 1);
    expect(t.m.get(id)).toBeDefined();
    t.tick(2);
    expect(t.m.get(id)).toBeUndefined();
    expect(t.inv!.added).toEqual([]);
  });
});

describe('caught, Spare and kill', () => {
  it('staggered while fleeing it yields, announces caught once, and Spare returns the exact pouch', () => {
    const t = rig(1000);
    const id = t.robbed();
    t.tick(0.3);
    t.fake.stagger(id, 'player');
    t.tick(0.05);
    expect(t.m.get(id)!.state).toBe('yield');
    expect(t.m.get(id)!.mercyOpen).toBe(true);
    expect(t.fake.bus.of('enemies.cutpurse.caught')).toEqual([{ amount: 40 }]);
    interact(t, id);
    expect(t.inv!.gold).toBe(1000);
    expect(t.inv!.added).toEqual([40]);
    expect(t.fake.flags.get('enemies.cutpurse.spared')).toBe(true);
    const mercy = t.fake.bus.of('mercy');
    expect(mercy).toHaveLength(1);
    expect(mercy[0]).toMatchObject({ verb: 'spare', tier: 'normal', track: null, creature: 'alley-cutpurse', actorId: id });
    // Sent off: it walks away and despawns; the pouch is not returned twice.
    expect(t.until(() => t.m.get(id) === undefined, 15)).toBe(true);
    expect(t.inv!.gold).toBe(1000);
    expect(t.inv!.added).toEqual([40]);
    expect(t.m.tally.snapshot()['alley-cutpurse']).toMatchObject({ spare: 1 });
  });

  it('caught is sent only once however often it is staggered', () => {
    const t = rig(1000);
    const id = t.robbed();
    t.fake.stagger(id, 'player');
    t.tick(AI.yieldSeconds + 0.5);
    expect(t.m.get(id)!.state).toBe('flee'); // the yield lapsed: it runs again
    t.fake.stagger(id, 'player');
    t.tick(0.1);
    expect(t.m.get(id)!.state).toBe('yield');
    expect(t.fake.bus.of('enemies.cutpurse.caught')).toHaveLength(1);
  });

  it('a hit on a yielding thief sends it running again, still holding the pouch', () => {
    const t = rig(1000);
    const id = t.robbed();
    t.fake.stagger(id, 'player');
    t.tick(0.1);
    t.fake.apply({ attackerId: 'player', targetId: id, amount: 1, poise: 0, kind: 'melee' });
    t.tick(0.1);
    expect(t.m.get(id)!.state).toBe('flee');
    expect(t.m.get(id)!.thief!.stolenGold).toBe(40);
  });

  it('caught with Spare locked: it only staggers, but caught is still announced and a kill pays', () => {
    const t = rig(1000, { spare: false });
    const id = t.robbed();
    t.fake.stagger(id, 'player');
    t.tick(0.1);
    expect(t.m.get(id)!.state).toBe('stagger');
    expect(t.fake.bus.of('enemies.cutpurse.caught')).toEqual([{ amount: 40 }]);
    t.fake.apply({ attackerId: 'player', targetId: id, amount: 9999, poise: 0, kind: 'melee' });
    t.tick(0.1);
    expect(t.inv!.gold).toBe(1000);
  });

  it('killing it drops the pouch as gold', () => {
    const t = rig(1000);
    const id = t.robbed();
    t.fake.apply({ attackerId: 'player', targetId: id, amount: 9999, poise: 0, kind: 'melee' });
    t.tick(0.1);
    expect(t.inv!.gold).toBe(1000);
    expect(t.inv!.added).toEqual([40]);
    t.tick(5); // the corpse fades; nothing is paid twice
    expect(t.m.get(id)).toBeUndefined();
    expect(t.inv!.added).toEqual([40]);
  });

  it('killing a thief that never robbed pays nothing', () => {
    const t = rig(1000);
    const id = t.spawn();
    t.fake.apply({ attackerId: 'player', targetId: id, amount: 9999, poise: 0, kind: 'melee' });
    t.tick(0.1);
    expect(t.inv!.added).toEqual([]);
    expect(t.inv!.gold).toBe(1000);
  });

  it('caught during the smoke: the puff is cancelled, the model shows again and it does not blink out', () => {
    const t = rig(1000);
    const id = t.robbed();
    const e = t.m.get(id)!;
    expect(t.until(() => e.thief!.hidden, CUTPURSE.fleeSeconds)).toBe(true);
    expect(e.body.root.visible).toBe(false);
    t.fake.stagger(id, 'player');
    t.tick(0.1);
    expect(e.body.root.visible).toBe(true);
    expect(e.thief!.hidden).toBe(false);
    expect(e.state).toBe('yield');
    t.tick(AI.yieldSeconds - 0.5); // inside the yield, past where the smoke would have blinked out
    expect(t.m.get(id)).toBeDefined();
    expect(e.state).toBe('yield');
    interact(t, id);
    expect(t.inv!.gold).toBe(1000);
  });

  it('staggered during the 0.4 s tell cancels the telegraph', () => {
    const t = rig(1000);
    const id = t.robbed();
    expect(t.until(() => t.m.get(id)!.thief!.holdStill, CUTPURSE.fleeSeconds)).toBe(true);
    t.fake.stagger(id, 'player');
    t.tick(0.1);
    const cancelled = t.fake.bus.of('telegraph.cancelled');
    expect(cancelled).toHaveLength(1);
    expect(t.m.get(id)!.thief!.holdStill).toBe(false);
    expect(t.m.get(id)!.state).toBe('yield');
  });
});

describe('damage details', () => {
  it('status-tick damage does not flinch it (a melee hit does)', () => {
    const t = rig(0);
    const id = t.spawn();
    t.tick(0.1);
    const e = t.m.get(id)!;
    const hp = e.actor.health;
    t.fake.apply({ attackerId: null, targetId: id, amount: 1, poise: 0, kind: 'status' });
    t.tick(0.05);
    expect(e.actor.health).toBe(hp - 1);
    expect(e.body.currentClip).not.toBe(ENEMY_CLIPS.flinch);
    t.fake.apply({ attackerId: 'player', targetId: id, amount: 1, poise: 0, kind: 'melee' });
    expect(e.body.currentClip).toBe(ENEMY_CLIPS.flinch);
  });

  it('a status tick alone does not provoke an idle thief', () => {
    const t = rig(0);
    const [id] = t.m.service.spawnGroup('purse'); // not aggro
    t.fake.movePlayer(0, -60);
    t.tick(0.1);
    t.fake.apply({ attackerId: null, targetId: id!, amount: 1, poise: 0, kind: 'status' });
    t.tick(0.1);
    expect(t.m.get(id!)!.state).toBe('idle');
  });

  it('health below half sends a thief that has not robbed anyone running too, and caught reports 0 gold', () => {
    const t = rig(0);
    const id = t.spawn();
    t.tick(0.1);
    t.fake.apply({ attackerId: 'player', targetId: id, amount: 15, poise: 0, kind: 'melee' });
    t.tick(0.2);
    expect(t.m.get(id)!.state).toBe('flee');
    t.fake.stagger(id, 'player');
    t.tick(0.1);
    expect(t.m.get(id)!.state).toBe('yield'); // not shoved back into the flee by the health check
    expect(t.fake.bus.of('enemies.cutpurse.caught')).toEqual([{ amount: 0 }]);
    interact(t, id);
    expect(t.inv!.added).toEqual([]);
    expect(t.fake.flags.get('enemies.cutpurse.spared')).toBe(true);
  });
});

describe('Brain: cornered', () => {
  const hooks = (log: string[]): BrainHooks => ({
    stateChanged: () => {},
    aggro: () => {},
    calm: () => {},
    startAttack: () => 1,
    cancelAttack: () => {},
    telegraph: () => {},
    telegraphCancelled: () => {},
    pickMove: () => null,
    markMoveUsed: () => {},
    acquireToken: () => true,
    releaseToken: () => {},
    flinch: () => {},
    knockback: () => {},
    yieldStarted: () => log.push('yield'),
    refill: () => {},
    alertPack: () => {},
    caught: (how) => log.push(`caught:${how}`),
  });
  const senses = (over: Partial<Senses> = {}): Senses => ({
    self: { x: 0, z: 0 }, targetId: 'player', targetAlive: true, targetPos: { x: 0, z: -3 }, notices: true, sees: true,
    distance: 3, facingErrorDeg: 0, healthFraction: 1, stuckGiveUp: false, yieldAllowed: true, ...over,
  });

  function fleeing(log: string[]): Brain {
    const b = new Brain(ALLEY_CUTPURSE, hooks(log), { home: { x: 0, z: 0 }, aggroOnSpawn: 'player', rise: false });
    for (let i = 0; i < 40; i++) b.step(DT, senses());
    b.startFlee();
    expect(b.state).toBe('flee');
    return b;
  }

  it('stuck while fleeing means caught: it yields', () => {
    const log: string[] = [];
    const b = fleeing(log);
    b.step(DT, senses({ stuckGiveUp: true }));
    expect(b.state).toBe('yield');
    expect(log).toEqual(['caught:cornered', 'yield']);
  });

  it('cornered with Spare locked staggers instead', () => {
    const log: string[] = [];
    const b = fleeing(log);
    b.step(DT, senses({ stuckGiveUp: true, yieldAllowed: false }));
    expect(b.state).toBe('stagger');
    expect(log).toEqual(['caught:cornered']);
  });

  it('a thief far from the player keeps running (no give-up) and resumes fleeing after a yield', () => {
    const log: string[] = [];
    const b = fleeing(log);
    b.step(DT, senses({ distance: AI.sightRange + 20, targetPos: { x: 0, z: -40 } }));
    expect(b.state).toBe('flee');
    b.step(DT, senses({ stuckGiveUp: true }));
    expect(b.state).toBe('yield');
    for (let i = 0; i < Math.round(AI.yieldSeconds / DT) + 2; i++) b.step(DT, senses());
    expect(b.state).toBe('flee');
  });
});
