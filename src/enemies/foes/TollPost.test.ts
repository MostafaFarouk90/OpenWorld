import type * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { KILL_XP_BASE } from '../../progression/tuning';
import { canDamage } from '../../actors/teams';
import { BRIGHTWATER_SPAWNERS } from '../brightwaterSpawners';
import { loadKnight } from '../testing/fakeHost';
import { foeKit, type Kit } from './foeTestKit';
import type { TollPost } from './TollPost';
import { TOLL } from './tuning';

let gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] };
beforeAll(async () => {
  gltf = await loadKnight();
});

function post(kit: Kit): TollPost {
  kit.fake.bus.emit('quest.started', { questId: 'm04' });
  const [id] = kit.manager.service.alive('brightwater.ford.toll-post');
  return kit.manager.getFoe(id) as TollPost;
}

const hit = (kit: Kit, id: string, amount: number, poise: number, attackId = 'sword') =>
  kit.fake.apply({ attackerId: 'player', targetId: id, amount, poise, kind: 'melee', attackId })!;

describe('toll post', () => {
  it('spawns on M04 as a neutral wooden structure the player can damage, tagged ford.toll-post', () => {
    const kit = foeKit(gltf, { player: { x: 0, z: -5 } });
    expect(kit.manager.foeCount).toBe(0);
    const p = post(kit);
    expect(p.actor.kind).toBe('toll-post');
    expect(p.actor.team).toBe('neutral');
    expect(canDamage('player', p.actor.team)).toBe(true);
    expect(p.actor.maxHealth).toBe(120);
    expect(p.actor.maxPoise).toBe(0);
    expect(p.actor.spawnTag).toBe('ford.toll-post');
    expect(p.actor.data['audio']).toEqual({ material: 'wood' });
    expect(kit.factory).not.toHaveBeenCalled();
    expect(kit.manager.service.view(p.id)).toMatchObject({ kind: 'toll-post', spawnerId: 'brightwater.ford.toll-post' });
    const def = BRIGHTWATER_SPAWNERS.find((s) => s.id === 'brightwater.ford.toll-post')!;
    expect(def).toMatchObject({ count: 1, anchor: 'spawn.ford.toll-post', activation: { quest: 'm04' }, respawn: 'never', band: { min: 1, max: 1 } });
  });

  it('a light hit does nothing, however much damage it carries', () => {
    const kit = foeKit(gltf, { player: { x: 0, z: -5 } });
    const p = post(kit);
    for (const poise of [0, 10, 25, TOLL.heavyPoise - 0.01]) {
      const r = hit(kit, p.id, 500, poise);
      expect(r.outcome).toBe('blocked');
      expect(r.dealt).toBe(0);
    }
    expect(p.actor.health).toBe(120);
    expect(kit.fake.bus.of('actor.died')).toHaveLength(0);
  });

  it('a heavy hit (poise 30 or more) damages it', () => {
    const kit = foeKit(gltf, { player: { x: 0, z: -5 } });
    const p = post(kit);
    const r = hit(kit, p.id, 50, TOLL.heavyPoise);
    expect(r.outcome).toBe('hit');
    expect(r.dealt).toBe(50);
    expect(p.actor.health).toBe(70);
    expect(hit(kit, p.id, 20, 60).dealt).toBe(20);
    expect(p.actor.health).toBe(50);
  });

  it('compares the poise before any scaling by other modifiers', () => {
    const kit = foeKit(gltf, { player: { x: 0, z: -5 } });
    const p = post(kit);
    kit.fake.host.damage.addModifier('test.scale-poise', (req) => void (req.poise = (req.poise ?? 0) * (req.attackId === 'big' ? 0.4 : 3)), -150);
    // 20 x 3 = 60 after scaling, but the raw 20 is light
    expect(hit(kit, p.id, 40, 20, 'small').outcome).toBe('blocked');
    // 30 x 0.4 = 12 after scaling, but the raw 30 is heavy
    expect(hit(kit, p.id, 40, 30, 'big').dealt).toBe(40);
    expect(p.actor.health).toBe(80);
  });

  it('dies through the normal actor.died path, gives no XP row, and is removed', () => {
    const kit = foeKit(gltf, { player: { x: 0, z: -5 } });
    const p = post(kit);
    hit(kit, p.id, 130, 40);
    expect(kit.fake.bus.of('actor.died')).toEqual([{ actorId: p.id, killerId: 'player', kind: 'toll-post', team: 'neutral', level: 1 }]);
    expect(p.actor.hittable).toBe(false);
    kit.tick(2.5);
    expect(kit.manager.getFoe(p.id)).toBeUndefined();
    expect(kit.fake.actorMap.has(p.id)).toBe(false);
    expect(Object.keys(KILL_XP_BASE)).not.toContain('toll-post');
    expect(kit.fake.bus.of('enemies.groupCleared')).toEqual([{ spawnerId: 'brightwater.ford.toll-post' }]);
  });

  it('a spell or fire hit under the heavy threshold is blocked too (Ember Bolt poise 10)', () => {
    const kit = foeKit(gltf, { player: { x: 0, z: -5 } });
    const p = post(kit);
    const r = kit.fake.apply({ attackerId: 'player', targetId: p.id, amount: 10, poise: 10, kind: 'spell', attackId: 'test-bolt' })!;
    expect(r.outcome).toBe('blocked');
    expect(p.actor.health).toBe(120);
  });

  it('never attacks, even with the player next to it', () => {
    const kit = foeKit(gltf, { player: { x: 0, z: -1 } });
    post(kit);
    kit.fake.player.invulnerable = false;
    kit.tick(10);
    expect(kit.fake.attackerCount).toBe(0);
    expect(kit.fake.bus.of('telegraph')).toHaveLength(0);
    expect(kit.fake.player.health).toBe(kit.fake.player.maxHealth);
  });

  it('does not appear before M04, does not come back once destroyed, and is gone after despawn', () => {
    const kit = foeKit(gltf, { player: { x: 0, z: -5 } });
    kit.fake.bus.emit('quest.started', { questId: 'r01' });
    expect(kit.manager.service.alive('brightwater.ford.toll-post')).toHaveLength(0);
    const p = post(kit);
    hit(kit, p.id, 500, 40);
    kit.tick(3);
    kit.fake.bus.emit('quest.started', { questId: 'm04' });
    expect(kit.manager.service.alive('brightwater.ford.toll-post')).toHaveLength(0);
    expect(kit.manager.spawners.isCleared('brightwater.ford.toll-post')).toBe(true);

    const kit2 = foeKit(gltf);
    const q = post(kit2);
    kit2.manager.service.despawnGroup('brightwater.ford.toll-post');
    expect(q.isGone).toBe(true);
    expect(kit2.fake.targetCount).toBe(1); // only the player's
  });
});
