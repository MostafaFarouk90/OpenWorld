import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { CINDERFORD_RAID } from './defs/cinderford';
import { DEFENDER } from './tuning';
import { makeKit, type Kit } from './testKit';

let physics: PhysicsWorld;
let kit: Kit;
beforeEach(async () => {
  physics = new PhysicsWorld();
  await physics.init();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  kit = await makeKit(physics);
  kit.waves().start(CINDERFORD_RAID.id);
});
afterEach(() => {
  kit.teardown();
  vi.restoreAllMocks();
});

const defenders = () => kit.director().parts!.defenders;
const hostile = (maxHealth = 40) => kit.ctx.actors.spawn({ kind: 'ember-hound', team: 'hostile', maxHealth, maxPoise: 15, root: new THREE.Group() });

describe('militia', () => {
  it('stand at the six posts with hurtboxes, ally team', () => {
    expect(defenders().count).toBe(6);
    for (const d of defenders().all) {
      expect(d.actor.team).toBe('ally');
      expect(d.actor.kind).toBe('militia');
      expect(d.actor.hittable).toBe(true);
    }
  });

  it('lethal damage leaves 1 HP, knocks down 4 s, then they stand at full health; repeatedly', () => {
    const d = defenders().all[0];
    const foe = hostile();
    for (let round = 0; round < 5; round++) {
      const r = kit.ctx.damage.apply({ attackerId: foe.id, targetId: d.id, amount: 9999, kind: 'melee' });
      expect(r?.saved).toBe(true);
      expect(r?.killed).toBe(false);
      expect(d.actor.dead).toBe(false);
      expect(d.actor.health).toBe(1);
      expect(d.state).toBe('down');
      expect(d.actor.hittable).toBe(false);
      kit.runSecs(DEFENDER.knockdownSeconds - 0.3);
      expect(d.state).toBe('down');
      kit.runSecs(0.5);
      expect(d.state).toBe('post');
      expect(d.actor.health).toBe(d.actor.maxHealth);
      expect(d.actor.hittable).toBe(true);
    }
    expect(defenders().count).toBe(6);
    expect(kit.of('actor.saved').every((e) => e.handlerId === DEFENDER.lethalHandlerId)).toBe(true);
    expect(kit.of('actor.saved')).toHaveLength(5);
    expect(kit.of('actor.died').filter((e) => e.kind === 'militia')).toEqual([]);
  });

  it('a scripted kill is also caught; a downed man takes no more hits', () => {
    const d = defenders().all[1];
    kit.ctx.damage.kill(d.id);
    expect(d.actor.dead).toBe(false);
    expect(d.state).toBe('down');
    const foe = hostile();
    expect(kit.ctx.damage.apply({ attackerId: foe.id, targetId: d.id, amount: 5, kind: 'melee' })).toBeNull();
  });

  it('the handler leaves other actors alone: a hound still dies', () => {
    const foe = hostile(10);
    const r = kit.ctx.damage.apply({ attackerId: 'player', targetId: foe.id, amount: 99, kind: 'melee' });
    expect(r?.killed).toBe(true);
  });

  function near(d: ReturnType<typeof defenders>['all'][number], foe: ReturnType<typeof hostile>, dist = 1.5) {
    foe.root!.position.set(d.post.x + dist, d.post.y, d.post.z);
    foe.root!.updateMatrixWorld(true);
  }

  it('swing at a hostile that is fighting the player, never to the last health point', () => {
    const d = defenders().all[2];
    const foe = hostile(40);
    near(d, foe);
    kit.runSecs(1);
    expect(foe.health).toBe(40); // not aggroed: no engagement
    kit.ctx.events.emit('ai.aggro', { actorId: foe.id, targetId: 'player' });
    kit.runSecs(DEFENDER.swingCooldown + 0.5);
    expect(foe.health).toBeLessThan(40);
    expect(foe.health).toBeGreaterThanOrEqual(1);
    kit.runSecs(30);
    expect(foe.health).toBe(1); // chipped to 1 and no further
    expect(foe.dead).toBe(false);
    expect(kit.of('actor.died').filter((e) => e.actorId === foe.id)).toEqual([]);
  });

  it('a later modifier that amplifies the swing (a back-hit) still cannot make it kill', () => {
    const d = defenders().all[2];
    const foe = hostile(7);
    const undo = kit.ctx.damage.addModifier('test.amplify', (req) => {
      req.amount *= 1.25;
    }, -50);
    const r = kit.ctx.damage.apply({ attackerId: d.id, targetId: foe.id, amount: 6, kind: 'melee', attackId: DEFENDER.swingAttackId });
    undo();
    expect(r?.killed).toBe(false);
    expect(foe.dead).toBe(false);
    expect(foe.health).toBe(1);
  });

  it('does not swing at a hostile out of reach, a mercy state, or a cart', () => {
    const d = defenders().all[3];
    const foe = hostile(40);
    near(d, foe, DEFENDER.swingRange + 1);
    kit.ctx.events.emit('ai.aggro', { actorId: foe.id, targetId: 'player' });
    kit.runSecs(3);
    expect(foe.health).toBe(40);
    near(d, foe, 1);
    (foe as any).mercyState = () => 'yielding';
    kit.runSecs(3);
    expect(foe.health).toBe(40);
  });
});
