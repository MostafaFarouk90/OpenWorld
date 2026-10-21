import type * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { FIXED_TIMESTEP as DT } from '../../config/constants';
import { Brain, type BrainHooks, type Senses } from '../ai/Brain';
import { ENEMY_DEFS } from '../defs';
import { EnemyManager } from '../EnemyManager';
import { mercyInteractableId } from '../mercy';
import { FakeHost, loadKnight } from '../testing/fakeHost';
import { AI } from '../tuning';
import type { AiState, EnemyDef, MoveDef, SpawnerDef } from '../types';
import { HUNTER_HARPOONER, HUNTER_SPEARMAN } from './def';

let gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] };
beforeAll(async () => {
  gltf = await loadKnight();
});

describe('hunter defs', () => {
  it.each([
    ['hunter-spearman', HUNTER_SPEARMAN],
    ['hunter-harpooner', HUNTER_HARPOONER],
  ] as const)('%s: poise 35, spare mercy for Oswin, yields when rooted', (kind, def) => {
    expect(ENEMY_DEFS[kind]).toBe(def);
    expect(def.kind).toBe(kind);
    expect(def.maxPoise).toBe(35);
    expect(def.mercy).toMatchObject({ verb: 'spare', tier: 'normal', track: 'oswin', when: 'yielding' });
    expect(def.yieldWhenRooted).toBe(true);
    expect(def.fleeAtHealth).toBeUndefined();
  });

  it('the net is blockable and roots 2 s; the harpoon is dodge-only and pulls 4 m', () => {
    const net = HUNTER_SPEARMAN.moves.find((m) => m.id === 'hunter.net')!;
    const harpoon = HUNTER_HARPOONER.moves.find((m) => m.id === 'harpooner.harpoon')!;
    expect(net.telegraph).toBe('block');
    expect(net.ranged).toMatchObject({ shape: 'net', root: 2 });
    expect(net.ranged!.pull).toBeUndefined();
    expect(harpoon.telegraph).toBe('dodge');
    expect(harpoon.ranged).toMatchObject({ shape: 'harpoon', pull: 4 });
    expect(harpoon.ranged!.root).toBeUndefined();
  });
});

// Explicit literals read from git HEAD (before A6b) of src/enemies/defs.ts and src/enemies/hound/def.ts.
describe('Act 1 defs are unchanged by A6b', () => {
  it('blighted-soldier (the Charred Footman)', () => {
    const d = ENEMY_DEFS['blighted-soldier'];
    expect(d).toMatchObject({
      kind: 'blighted-soldier',
      nameKey: 'enemies.name.charred-footman',
      maxHealth: 60,
      maxPoise: 40,
      mercy: { verb: 'spare', tier: 'normal', track: 'halvard', when: 'yielding' },
      rises: false,
      guard: true,
      pairAdvance: true,
    });
    expect(d.yieldWhenRooted).toBeUndefined();
  });

  it('ash-wraith', () => {
    const d = ENEMY_DEFS['ash-wraith'];
    expect(d).toMatchObject({
      kind: 'ash-wraith',
      maxHealth: 30,
      maxPoise: 20,
      mercy: { verb: 'release', tier: 'normal', track: 'ashwalkers', when: 'staggered' },
      rises: true,
    });
    expect(d.yieldWhenRooted).toBeUndefined();
  });

  it('ember-hound', () => {
    const d = ENEMY_DEFS['ember-hound'];
    expect(d).toMatchObject({
      kind: 'ember-hound',
      maxHealth: 40,
      maxPoise: 15,
      mercy: {
        verb: 'calm',
        tier: 'normal',
        track: 'dragons',
        when: 'calming',
        offerings: [
          { itemId: 'hearth-bread', count: 1 },
          { itemId: 'ember-coal', count: 1 },
        ],
        warmHand: true,
      },
      rises: false,
      body: 'quadruped',
      behaviour: 'circle-rush',
      fleeAtHealth: 0.15,
    });
    expect(d.yieldWhenRooted).toBeUndefined();
  });

  it('"charred-footman" is not a def key: the Charred Footman keeps its slice 1 id blighted-soldier', () => {
    expect((ENEMY_DEFS as Record<string, unknown>)['charred-footman']).toBeUndefined();
  });

  it('no Act 1 def sets yieldWhenRooted', () => {
    const act1 = ['ash-wraith', 'blighted-soldier', 'alley-cutpurse', 'ember-hound', 'watch-guard', 'guildhall-thug', 'toll-sergeant', 'yard-veteran'] as const;
    for (const k of act1) expect(ENEMY_DEFS[k].yieldWhenRooted, k).toBeUndefined();
  });
});

class Spy implements BrainHooks {
  yields = 0;
  states: AiState[] = [];
  swing = 0;
  move: MoveDef | null = null;
  stateChanged(_f: AiState, to: AiState) { this.states.push(to); }
  aggro() {}
  calm() {}
  startAttack() { return ++this.swing; }
  cancelAttack() {}
  telegraph() {}
  telegraphCancelled() {}
  pickMove() { return this.move; }
  markMoveUsed() {}
  acquireToken() { return true; }
  releaseToken() {}
  flinch() {}
  knockback() {}
  yieldStarted() { this.yields++; }
  refill() {}
  alertPack() {}
}

const senses = (over: Partial<Senses> = {}): Senses => ({
  self: { x: 0, z: 0 }, targetId: 'player', targetAlive: true, targetPos: { x: 0, z: -5 }, notices: false, sees: true,
  distance: 5, facingErrorDeg: 0, healthFraction: 1, stuckGiveUp: false, yieldAllowed: true, ...over,
});

function engaged(def: EnemyDef) {
  const spy = new Spy();
  const brain = new Brain(def, spy, { home: { x: 0, z: 0 }, rise: false });
  brain.step(DT, senses({ notices: true }));
  for (let i = 0; i < Math.round((AI.noticeSeconds + 0.1) / DT); i++) brain.step(DT, senses({ distance: 12 }));
  return { brain, spy };
}

describe('Brain: yieldWhenRooted', () => {
  it('a rooted hunter under half health yields at once and Spare opens', () => {
    const { brain, spy } = engaged(HUNTER_SPEARMAN);
    expect(brain.state).toBe('chase');
    brain.step(DT, senses({ distance: 12, rooted: true, healthFraction: 0.4 }));
    expect(brain.state).toBe('yield');
    expect(brain.mercyOpen).toBe(true);
    expect(spy.yields).toBe(1);
  });

  it('a rooted hunter at or above half health does not yield', () => {
    for (const hp of [0.5, 0.51, 0.9, 1]) {
      const { brain, spy } = engaged(HUNTER_SPEARMAN);
      for (let i = 0; i < 30; i++) brain.step(DT, senses({ distance: 12, rooted: true, healthFraction: hp }));
      expect(brain.state, `hp ${hp}`).not.toBe('yield');
      expect(brain.mercyOpen).toBe(false);
      expect(spy.yields).toBe(0);
    }
  });

  it('not rooted and under half health it keeps fighting (the root is what opens it)', () => {
    const { brain } = engaged(HUNTER_HARPOONER);
    for (let i = 0; i < 30; i++) brain.step(DT, senses({ distance: 12, rooted: false, healthFraction: 0.3 }));
    expect(brain.state).not.toBe('yield');
  });

  it('while Spare is locked, a root does not open it', () => {
    const { brain } = engaged(HUNTER_SPEARMAN);
    brain.step(DT, senses({ distance: 12, rooted: true, healthFraction: 0.2, yieldAllowed: false }));
    expect(brain.state).not.toBe('yield');
  });

  it('a staggered hunter under half health with Spare unlocked is spareable; above half it is not', () => {
    const low = engaged(HUNTER_SPEARMAN);
    low.brain.setCondition(0.4, true);
    low.brain.staggered('player');
    expect(low.brain.state).toBe('yield');
    expect(low.brain.mercyOpen).toBe(true);
    const high = engaged(HUNTER_SPEARMAN);
    high.brain.setCondition(0.6, true);
    high.brain.staggered('player');
    expect(high.brain.state).toBe('stagger');
    expect(high.brain.mercyOpen).toBe(false);
  });

  it.each(['blighted-soldier', 'ash-wraith', 'ember-hound'] as const)('a %s brain never yields because of a root', (kind) => {
    const def = ENEMY_DEFS[kind];
    const { brain, spy } = engaged(def);
    for (let i = 0; i < 120; i++) brain.step(DT, senses({ distance: 12, rooted: true, healthFraction: 0.1 }));
    expect(brain.state, kind).not.toBe('yield');
    expect(spy.yields).toBe(0);
    expect(spy.states).not.toContain('yield');
  });

  it('even a def that yields at a poise break (when: yielding) ignores a root unless it opts in', () => {
    const { brain } = engaged({ ...HUNTER_SPEARMAN, yieldWhenRooted: undefined });
    brain.step(DT, senses({ distance: 12, rooted: true, healthFraction: 0.1 }));
    expect(brain.state).not.toBe('yield');
  });
});

const group = (id: string, enemy: SpawnerDef['enemy'], count: number): SpawnerDef => ({
  id, enemy, count, anchor: 'a', band: { min: 1, max: 1 }, activation: 'manual', respawn: 'never', leash: false,
});

function rig(enemy: SpawnerDef['enemy']) {
  const fake = new FakeHost(gltf.scene, { playerFeet: { x: 0, y: 0, z: -12 } });
  fake.defineAnchor('a', 0, 0);
  fake.flags.set('enemies.mercy.release', true);
  fake.flags.set('enemies.mercy.spare', true);
  const m = new EnemyManager(fake.host, FakeHost.factory(gltf), { spawners: [group('g', enemy, 1)], seed: 5 });
  const tick = (seconds = DT) => {
    for (let i = 0; i < Math.max(1, Math.round(seconds / DT)); i++) {
      m.think(DT);
      m.animate(DT);
      fake.combatStep(DT);
      m.react(DT);
    }
  };
  const [id] = m.service.spawnGroup('g', { aggro: true, guard: false });
  const actor = fake.actorMap.get(id!)!;
  const root = () => (actor.data['status'] = { stunned: false, stunRemaining: 0, slow: 0, rooted: true });
  const interact = () => fake.interactables.get(mercyInteractableId(m.get(id!)!.slug))!.onInteract(fake.player);
  return { fake, m, tick, id: id!, actor, root, interact };
}

describe('hunters in an EnemyManager', () => {
  it.each(['hunter-spearman', 'hunter-harpooner'] as const)('a rooted %s under half health yields; its mercy opens', (kind) => {
    const t = rig(kind);
    t.tick(0.1);
    t.actor.health = t.actor.maxHealth * 0.4;
    t.root();
    t.tick(0.2);
    expect(t.m.get(t.id)!.state).toBe('yield');
    expect(t.fake.interactables.has(mercyInteractableId(t.m.get(t.id)!.slug))).toBe(true);
  });

  it('a rooted spearman above half health does not yield', () => {
    const t = rig('hunter-spearman');
    t.tick(0.1);
    t.actor.health = t.actor.maxHealth * 0.8;
    t.root();
    t.tick(1);
    expect(t.m.get(t.id)!.state).not.toBe('yield');
  });

  it('a staggered spearman under half health is spareable', () => {
    const t = rig('hunter-spearman');
    t.tick(0.1);
    t.actor.health = t.actor.maxHealth * 0.4;
    t.fake.stagger(t.id, 'player');
    expect(t.m.get(t.id)!.state).toBe('yield');
  });

  it('a staggered spearman above half health is not (it staggers instead)', () => {
    const t = rig('hunter-spearman');
    t.tick(0.1);
    t.fake.stagger(t.id, 'player');
    expect(t.m.get(t.id)!.state).toBe('stagger');
  });

  it('sparing through the mercy path emits `mercy` exactly once and removes the hunter', () => {
    const t = rig('hunter-spearman');
    t.tick(0.1);
    t.actor.health = t.actor.maxHealth * 0.4;
    t.root();
    t.tick(0.2);
    expect(t.m.get(t.id)!.state).toBe('yield');
    t.interact();
    t.actor.data['status'] = undefined; // the root has run out by the time it walks off (a rooted body cannot leave)
    t.tick(10);
    const mercies = t.fake.bus.of('mercy');
    expect(mercies).toHaveLength(1);
    expect(mercies[0]).toMatchObject({ actorId: t.id, verb: 'spare', track: 'oswin', tier: 'normal', creature: 'hunter-spearman' });
    expect(t.m.get(t.id)).toBeUndefined();
    expect(t.m.service.mercyTally()['hunter-spearman']).toBeDefined();
  });

  it('an Act 1 footman rooted under half health does not yield through the manager either', () => {
    const t = rig('blighted-soldier');
    t.tick(0.1);
    t.actor.health = t.actor.maxHealth * 0.4;
    t.root();
    t.tick(0.5);
    expect(t.m.get(t.id)!.state).not.toBe('yield');
  });
});
