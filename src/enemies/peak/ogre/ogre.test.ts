// The Crag Ogre (plans/act3-K6b-pr2.md section 3): the slam and the throw, heavy chops at double poise, Calm with two Barley
// Cakes or one Hearth Bread before it swings, and the sit that lets the party pass.
import type * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { FIXED_TIMESTEP } from '../../../config/constants';
import { HEAVY_CHOP_CLIP } from '../../../combat/heavyBlow';
import { ENEMY_DEFS } from '../../defs';
import { EnemyManager } from '../../EnemyManager';
import { mercyInteractableId } from '../../mercy';
import { FakeHost, loadKnight } from '../../testing/fakeHost';
import type { SpawnerDef } from '../../types';
import '../overlays';
import { ogrePoise } from '../peak.plugin';
import { OGRE } from '../tuning';
import { OGRE_CLUB_ID } from './club';
import { CRAG_OGRE } from './def';
import { ogreLeave } from './overlay';

const DT = FIXED_TIMESTEP;
let gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] };
beforeAll(async () => {
  gltf = await loadKnight();
});

function rig(items: Record<string, number>, playerZ = -14) {
  const fake = new FakeHost(gltf.scene, { playerFeet: { x: 0, y: 0, z: playerZ } });
  fake.defineAnchor('a', 0, 0);
  fake.flags.set('enemies.mercy.calm', true);
  fake.provideItems(items);
  const def: SpawnerDef = { id: 'g', enemy: 'crag-ogre', count: 1, anchor: 'a', band: { min: 20, max: 20 }, activation: 'manual', respawn: 'never', leash: false };
  const m = new EnemyManager(fake.host, FakeHost.factory(gltf), { spawners: [def], seed: 4 });
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
  const id = m.service.spawnGroup('g')[0]!;
  const enemy = m.get(id)!;
  const hold = () => fake.interactables.get(mercyInteractableId(enemy.slug))!;
  return { fake, m, tick, id, enemy, hold };
}

describe('Crag Ogre def', () => {
  it('is a grey Barbarian at 1.7 with a club, poise 100, a red dodge slam after 1.0 s and a thrown rock', () => {
    expect(ENEMY_DEFS['crag-ogre']).toBe(CRAG_OGRE);
    expect(CRAG_OGRE.model.prefer).toEqual(['barbarian']);
    expect(CRAG_OGRE.model.scale).toBe(1.7);
    expect(CRAG_OGRE.model.props?.[0]?.id).toBe(OGRE_CLUB_ID);
    expect(CRAG_OGRE.maxPoise).toBe(100);
    const slam = CRAG_OGRE.moves.find((m) => m.id === 'ogre.slam')!;
    expect(slam).toMatchObject({ windup: 1.0, telegraph: 'dodge' });
    expect(slam.area?.radius).toBe(2.5);
    const thr = CRAG_OGRE.moves.find((m) => m.id === 'ogre.throw')!;
    expect(thr.ranged?.shape).toBe('rock');
    expect(thr.range[0]).toBeGreaterThan(slam.range[1]);
  });

  it('Calm: two Barley Cakes or one Hearth Bread (any-of), no Warm Hand, codex only', () => {
    expect(CRAG_OGRE.mercy).toMatchObject({
      verb: 'calm',
      track: null,
      when: 'calming',
      offerings: [
        { itemId: 'barley-cake', count: 2 },
        { itemId: 'hearth-bread', count: 1 },
      ],
    });
    expect(CRAG_OGRE.mercy!.warmHand).toBeFalsy();
  });

  it('a heavy chop deals double poise; a light swing does not', () => {
    expect(ogrePoise({ attackId: HEAVY_CHOP_CLIP, poise: 12 })).toBe(12 * OGRE.heavyPoiseMultiplier);
    expect(ogrePoise({ attackId: '1H_Melee_Attack_Slice_Horizontal', poise: 12 })).toBe(12);
  });
});

describe('Crag Ogre Calm and sit', () => {
  it('two cakes calm it before it swings: it walks home, sits, and leaves once the player is 40 m away', () => {
    const t = rig({ 'barley-cake': 2 });
    t.tick(0.3);
    expect(t.enemy.calmOpen).toBe(true);
    expect(t.hold().enabled!()).toBe(true);
    t.hold().onInteract(t.fake.player);
    expect(t.enemy.state).toBe('calmed');
    expect(t.fake.inventory!.removed).toEqual([{ itemId: 'barley-cake', count: 2 }]);
    expect(t.tick(25, () => ogreLeave(t.id) === 'sitting')).toBe(true);
    t.tick(5);
    expect(ogreLeave(t.id)).toBe('sitting');
    t.fake.movePlayer(0, -OGRE.sitUntilPlayerMetres - 5);
    t.tick(0.2);
    expect(ogreLeave(t.id)).toBe('walkOff');
    t.tick(OGRE.walkOffSeconds + 0.5);
    expect(t.m.get(t.id)).toBeUndefined();
  });

  it('one Hearth Bread calms it too; it gets up after the sit time even with the player beside it', () => {
    const t = rig({ 'hearth-bread': 1 }, -6);
    t.tick(0.1);
    expect(t.enemy.calmOpen).toBe(true);
    t.hold().onInteract(t.fake.player);
    expect(t.fake.inventory!.removed).toEqual([{ itemId: 'hearth-bread', count: 1 }]);
    t.tick(25, () => ogreLeave(t.id) === 'sitting');
    t.tick(OGRE.sitSeconds + 0.5);
    expect(ogreLeave(t.id)).toBe('walkOff');
  });

  it('one cake is not enough: no prompt, and a completed hold does nothing', () => {
    const t = rig({ 'barley-cake': 1 });
    t.tick(0.3);
    expect(t.hold().enabled!()).toBe(false);
    t.hold().onInteract(t.fake.player);
    expect(t.enemy.state).not.toBe('calmed');
  });

  it('it blusters for the first seconds of an engagement: no swing in reach, so the Calm hold can land', () => {
    const t = rig({ 'hearth-bread': 1 }, -2);
    expect(t.tick(OGRE.blusterSeconds - 0.3, () => t.enemy.state === 'telegraph')).toBe(false);
    expect(t.enemy.calmOpen).toBe(true);
    expect(t.hold().enabled!()).toBe(true);
    // Unanswered, it swings once the bluster runs out.
    expect(t.tick(2, () => t.enemy.state === 'telegraph')).toBe(true);
  });

  it('struck during the bluster, it swings at once', () => {
    const t = rig({}, -2);
    t.tick(0.5);
    t.fake.apply({ attackerId: 'player', targetId: t.id, amount: 1, poise: 1, kind: 'melee' });
    expect(t.tick(1.2, () => t.enemy.state === 'telegraph')).toBe(true);
  });

  it('once it swings, or once struck, Calm is closed', () => {
    const a = rig({ 'hearth-bread': 1 }, -2);
    expect(a.tick(8, () => a.enemy.state === 'telegraph')).toBe(true);
    expect(a.enemy.calmOpen).toBe(false);
    expect(a.hold().enabled!()).toBe(false);
    const b = rig({ 'hearth-bread': 1 });
    b.tick(0.2);
    b.fake.apply({ attackerId: 'player', targetId: b.id, amount: 1, poise: 1, kind: 'melee' });
    b.tick(0.1);
    expect(b.enemy.mercyOpen).toBe(false);
  });

  it('struck on its sit (the calm revoked): out of the sit pose and hostile; a second calm walks home and sits afresh', () => {
    const t = rig({ 'hearth-bread': 2 });
    t.tick(0.3);
    t.hold().onInteract(t.fake.player);
    t.tick(25, () => ogreLeave(t.id) === 'sitting');
    t.tick(2);
    t.fake.bus.emit('mercy.revoked', { actorId: t.id, track: null, removed: 1 });
    t.tick(0.2);
    expect(ogreLeave(t.id)).toBe('none');
    expect(t.enemy.body.currentClip).not.toBe('Sit_Floor_Idle');
  });

  it('the sit idle plays once (it is not restarted every tick) and it walks off on the walk clip', () => {
    const t = rig({ 'hearth-bread': 1 });
    t.tick(0.3);
    t.hold().onInteract(t.fake.player);
    t.tick(25, () => ogreLeave(t.id) === 'sitting');
    t.tick(2);
    const clip = t.enemy.body.currentClip;
    t.tick(1);
    expect(t.enemy.body.currentClip).toBe(clip);
    expect(clip).toBe('Sit_Floor_Idle');
    t.fake.movePlayer(0, -OGRE.sitUntilPlayerMetres - 5);
    t.tick(0.3);
    expect(ogreLeave(t.id)).toBe('walkOff');
    expect(t.enemy.body.currentClip).toBe('Walking_B');
  });

  it('a calmed ogre that cannot get home in time never sits off its spot: it walks off', () => {
    const t = rig({ 'hearth-bread': 1 });
    // It blusters toward the player first (no swing yet), so it is well off its spot when the calm lands.
    expect(t.tick(OGRE.blusterSeconds, () => Math.hypot(t.enemy.feet.x, t.enemy.feet.z) > 4)).toBe(true);
    expect(t.enemy.calmOpen).toBe(true);
    t.hold().onInteract(t.fake.player);
    // Hold it in place (a rock in the way).
    t.tick(0.5);
    const stuck = t.enemy.feet.clone();
    const seen = new Set<string>();
    for (let i = 0; i < 40 / DT && t.m.get(t.id); i++) {
      t.tick(DT);
      if (ogreLeave(t.id) === 'walkHome') t.enemy.feet.copy(stuck);
      const l = ogreLeave(t.id);
      if (l) seen.add(l);
    }
    expect(seen.has('sitting')).toBe(false);
    expect(seen.has('walkOff')).toBe(true);
  });

  it('retired (no mercy), it walks off at once and is gone', () => {
    const t = rig({});
    t.tick(0.1);
    expect((t.enemy as unknown as { retire(): boolean }).retire()).toBe(true);
    t.tick(0.1);
    expect(ogreLeave(t.id)).toBe('walkOff');
    t.tick(OGRE.walkOffSeconds + 0.5);
    expect(t.m.get(t.id)).toBeUndefined();
  });
});
