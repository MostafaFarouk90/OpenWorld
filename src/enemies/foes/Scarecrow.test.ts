import type * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { BRIGHTWATER_SPAWNERS } from '../brightwaterSpawners';
import { FakeHost, loadKnight } from '../testing/fakeHost';
import { foeKit, swordHit, type Kit } from './foeTestKit';
import { Scarecrow } from './Scarecrow';
import { SCARECROW } from './tuning';

let gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] };
beforeAll(async () => {
  gltf = await loadKnight();
});

const SURGE = 'heartshard-surge';

/** Starts R01 and returns the six scarecrows. */
function r01(kit: Kit): Scarecrow[] {
  kit.fake.quests = { active: () => ['r01'] };
  kit.fake.bus.emit('quest.started', { questId: 'r01' });
  return kit.manager.service.alive('r01.scarecrows').map((id) => kit.manager.getFoe(id) as Scarecrow);
}

const surgeHit = (fake: FakeHost, id: string) => fake.apply({ attackerId: 'player', targetId: id, amount: 15, poise: 40, kind: 'spell', attackId: SURGE });

describe('scarecrow spawning', () => {
  it('spawns six only while R01 is active, as hostile straw actors, never building a Knight model', () => {
    const kit = foeKit(gltf);
    expect(kit.manager.service.alive('r01.scarecrows')).toHaveLength(0);
    const sc = r01(kit);
    expect(sc).toHaveLength(6);
    const a = sc[0].actor;
    expect(a.team).toBe('hostile');
    expect(a.kind).toBe('ash-scarecrow');
    expect(a.spawnTag).toBe('r01.scarecrows');
    expect(a.data['audio']).toEqual({ material: 'straw' });
    expect(a.level).toBeGreaterThanOrEqual(2);
    expect(a.level).toBeLessThanOrEqual(3);
    expect(kit.factory).not.toHaveBeenCalled();
    expect(kit.manager.service.view(a.id)).toMatchObject({ kind: 'ash-scarecrow', spawnerId: 'r01.scarecrows', state: 'idle' });
    expect(sc.map((s) => s.scarecrowId)).toEqual([1, 2, 3, 4, 5, 6].map((i) => `r01.scarecrow.${i}`));
    expect(kit.manager.count).toBe(0);
    expect(kit.manager.foeCount).toBe(6);
  });

  it('another quest starting spawns none', () => {
    const kit = foeKit(gltf);
    kit.fake.bus.emit('quest.started', { questId: 'm01' });
    expect(kit.manager.foeCount).toBe(0);
  });
});

describe('scarecrow behaviour', () => {
  it('stays dormant beyond 14 m, then lurches at 1.2 m/s and aggroes exactly once', () => {
    const kit = foeKit(gltf, { player: { x: 0, z: -20 } });
    const [s] = r01(kit);
    const start = s.feet.clone();
    kit.tick(3);
    expect(s.state).toBe('dormant');
    expect(s.feet.distanceTo(start)).toBe(0);
    expect(kit.fake.bus.of('ai.aggro')).toHaveLength(0);

    kit.fake.movePlayer(s.feet.x, -10);
    kit.tick(1);
    expect(s.state).toBe('lurch');
    expect(kit.fake.bus.of('ai.aggro').filter((e) => e.actorId === s.id)).toHaveLength(1);
    const moved = s.feet.distanceTo(start);
    expect(moved).toBeGreaterThan(1.0);
    expect(moved).toBeLessThan(1.4);
    kit.tick(2);
    expect(kit.fake.bus.of('ai.aggro').filter((e) => e.actorId === s.id)).toHaveLength(1);
  });

  it('wakes just inside the 14 m edge and not just outside it', () => {
    const kit = foeKit(gltf, { player: { x: 0, z: -14.4 } });
    const sc = r01(kit);
    const mid = sc[2]; // anchor x = -1.5
    kit.fake.movePlayer(mid.feet.x, mid.feet.z - 14.2);
    kit.tick(0.2);
    expect(mid.state).toBe('dormant');
    kit.fake.movePlayer(mid.feet.x, mid.feet.z - 13.8);
    kit.tick(0.2);
    expect(mid.state).toBe('lurch');
  });

  it('telegraphs 0.7 s, then claws the player for 10 damage (scaled by level) through the bus', () => {
    const kit = foeKit(gltf, { player: { x: -4.5, z: -1.6 } });
    const [s] = r01(kit);
    kit.fake.player.invulnerable = false;
    kit.tick(6);
    const tele = kit.fake.bus.of('telegraph').filter((t) => t.actorId === s.id);
    expect(tele.length).toBeGreaterThan(0);
    expect(tele[0]).toMatchObject({ kind: 'block', attackId: SCARECROW.clawId, moveId: SCARECROW.clawId, leadSeconds: 0.7 });
    const hits = kit.fake.bus.of('damage.dealt').filter((d) => d.attackerId === s.id && d.targetId === 'player');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].amount).toBeCloseTo(SCARECROW.clawDamage * (1 + 0.1 * (s.actor.level - 1)), 5);
    expect(hits[0].attackId).toBe(SCARECROW.clawId);
    // one hit per swing at most
    expect(new Set(hits.map((h) => h.swingId)).size).toBe(hits.length);
  });

  it('sword hits never kill it: it is knocked down about 2.5 s and rises again', () => {
    const kit = foeKit(gltf, { player: { x: -4.5, z: -10 } });
    const [s] = r01(kit);
    kit.tick(0.5);
    for (let i = 0; i < 40; i++) swordHit(kit.fake, s.id, 500, 40);
    expect(s.actor.dead).toBe(false);
    expect(s.actor.health).toBeGreaterThanOrEqual(1);
    expect(kit.fake.bus.of('actor.died')).toHaveLength(0);
    expect(kit.manager.getFoe(s.id)).toBe(s);
    expect(s.state).toBe('down');
    kit.tick(2.3);
    expect(s.state).toBe('down');
    kit.tick(0.4);
    expect(s.state).not.toBe('down');
    expect(s.state).toBe('lurch');
    // and again
    swordHit(kit.fake, s.id, 500, 40);
    expect(s.state).toBe('down');
    expect(s.actor.dead).toBe(false);
    expect(kit.fake.bus.of('scarecrow.cleared')).toHaveLength(0);
  });

  it('a hit during the windup cancels the telegraph', () => {
    const kit = foeKit(gltf, { player: { x: -4.5, z: -1.6 } });
    const [s] = r01(kit);
    for (let i = 0; i < 300 && s.state !== 'windup'; i++) kit.tick();
    expect(s.state).toBe('windup');
    const swing = kit.fake.bus.of('telegraph').filter((t) => t.actorId === s.id).at(-1)!.swingId;
    swordHit(kit.fake, s.id);
    expect(s.state).toBe('down');
    expect(kit.fake.bus.of('telegraph.cancelled')).toContainEqual({ actorId: s.id, swingId: swing });
  });

  it('a dormant scarecrow that is struck goes down and then rises into the lurch', () => {
    const kit = foeKit(gltf, { player: { x: 0, z: -30 } });
    const [s] = r01(kit);
    swordHit(kit.fake, s.id);
    expect(s.state).toBe('down');
    kit.tick(SCARECROW.knockdownSeconds + 0.2);
    expect(s.state).toBe('lurch');
  });
});

describe('scarecrow cleared by the torch', () => {
  it('torch contact ignites it, glows, and after 4 s clears it once with method torch', () => {
    const kit = foeKit(gltf, { player: { x: -4.5, z: -10 } });
    const [s] = r01(kit);
    const before = s.actor.health;
    kit.fake.setTorch(s.feet.x + 0.4, 1, s.feet.z);
    kit.tick(0.1);
    expect(s.state).toBe('burning');
    const cloth = (s.root.getObjectByName('foe-torso') as THREE.Mesh).material as THREE.MeshStandardMaterial;
    const glow0 = cloth.emissive.r;
    kit.tick(2);
    const glow1 = cloth.emissive.r;
    expect(glow1).toBeGreaterThan(glow0);
    expect(kit.fake.bus.of('scarecrow.cleared')).toHaveLength(0);
    kit.tick(2.2);
    const cleared = kit.fake.bus.of('scarecrow.cleared');
    expect(cleared).toEqual([{ actorId: s.id, scarecrowId: 'r01.scarecrow.1', method: 'torch' }]);
    expect(s.actor.health).toBe(before); // no damage, no actor.died
    expect(kit.fake.bus.of('actor.died')).toHaveLength(0);
    kit.tick(1.5);
    expect(kit.manager.getFoe(s.id)).toBeUndefined();
    expect(kit.fake.actorMap.has(s.id)).toBe(false);
  });

  it('a second torch touch while burning, and after, does not double-emit', () => {
    const kit = foeKit(gltf, { player: { x: -4.5, z: -10 } });
    const [s] = r01(kit);
    kit.fake.setTorch(s.feet.x, 1, s.feet.z);
    kit.tick(1);
    kit.fake.setTorch(s.feet.x, 1, s.feet.z); // touches again
    kit.tick(5);
    expect(kit.fake.bus.of('scarecrow.cleared').filter((e) => e.actorId === s.id)).toHaveLength(1);
    kit.tick(3);
    expect(kit.fake.bus.of('scarecrow.cleared').filter((e) => e.actorId === s.id)).toHaveLength(1);
  });

  it('an unlit torch, a torch out of reach or no torch does nothing', () => {
    const kit = foeKit(gltf, { player: { x: -4.5, z: -10 } });
    const [s] = r01(kit);
    kit.fake.setTorch(s.feet.x, 1, s.feet.z, 0.5, false);
    kit.tick(1);
    expect(s.state).not.toBe('burning');
    kit.fake.setTorch(s.feet.x + 3, 1, s.feet.z);
    kit.tick(1);
    expect(s.state).not.toBe('burning');
    kit.fake.setTorch(s.feet.x, 6, s.feet.z); // far above
    kit.tick(1);
    expect(s.state).not.toBe('burning');
    kit.fake.provideTorch(null);
    kit.tick(1);
    expect(s.state).not.toBe('burning');
    expect(kit.fake.warnings).toEqual([]);
  });

  it('ignites a dormant one and one that is knocked down, and only the one it touches', () => {
    const kit = foeKit(gltf, { player: { x: -4.5, z: -40 } });
    const [a, b, c] = r01(kit);
    swordHit(kit.fake, b.id);
    expect(b.state).toBe('down');
    kit.fake.setTorch(a.feet.x, 1, a.feet.z);
    kit.tick(0.1);
    expect(a.state).toBe('burning'); // dormant, 40 m from the player
    expect(b.state).toBe('down'); // 3 m away
    expect(c.state).toBe('dormant');
    kit.fake.setTorch(b.feet.x, 1, b.feet.z);
    kit.tick(0.1);
    expect(b.state).toBe('burning');
  });
});

describe('scarecrow cleared by the Surge', () => {
  it('a Surge hit dissolves it, clears it once with method surge, without actor.died', () => {
    const kit = foeKit(gltf, { player: { x: -4.5, z: -10 } });
    const [s] = r01(kit);
    surgeHit(kit.fake, s.id);
    expect(kit.fake.bus.of('scarecrow.cleared')).toEqual([{ actorId: s.id, scarecrowId: 'r01.scarecrow.1', method: 'surge' }]);
    expect(s.actor.dead).toBe(false);
    expect(kit.fake.bus.of('actor.died')).toHaveLength(0);
    surgeHit(kit.fake, s.id); // not hittable any more
    kit.tick(SCARECROW.clearFadeSeconds + 0.6);
    expect(kit.manager.getFoe(s.id)).toBeUndefined();
    expect(kit.fake.bus.of('scarecrow.cleared')).toHaveLength(1);
  });

  it('a Surge during the burn does not change the method or emit twice', () => {
    const kit = foeKit(gltf, { player: { x: -4.5, z: -10 } });
    const [s] = r01(kit);
    kit.fake.setTorch(s.feet.x, 1, s.feet.z);
    kit.tick(0.5);
    surgeHit(kit.fake, s.id);
    swordHit(kit.fake, s.id);
    expect(s.state).toBe('burning');
    kit.tick(4);
    expect(kit.fake.bus.of('scarecrow.cleared')).toEqual([{ actorId: s.id, scarecrowId: 'r01.scarecrow.1', method: 'torch' }]);
  });

  it('a Surge on a scarecrow that never aggroed clears it without ai.calm', () => {
    const kit = foeKit(gltf, { player: { x: -4.5, z: -40 } });
    const [s] = r01(kit);
    surgeHit(kit.fake, s.id);
    expect(kit.fake.bus.of('ai.calm')).toHaveLength(0);
  });

  it('ai.calm fires once when an aggroed scarecrow is cleared', () => {
    const kit = foeKit(gltf, { player: { x: -4.5, z: -10 } });
    const [s] = r01(kit);
    kit.tick(0.3);
    surgeHit(kit.fake, s.id);
    kit.tick(2);
    expect(kit.fake.bus.of('ai.calm').filter((e) => e.actorId === s.id)).toHaveLength(1);
  });
});

describe('scarecrow lifecycle', () => {
  it('a scripted kill still reports the clearing once, with method strike', () => {
    const kit = foeKit(gltf, { player: { x: -4.5, z: -10 } });
    const [s] = r01(kit);
    kit.fake.host.damage.kill!(s.id, 'player');
    expect(kit.fake.bus.of('scarecrow.cleared')).toEqual([{ actorId: s.id, scarecrowId: 'r01.scarecrow.1', method: 'strike' }]);
    kit.tick(3);
    expect(kit.manager.getFoe(s.id)).toBeUndefined();
    expect(kit.fake.bus.of('scarecrow.cleared')).toHaveLength(1);
  });

  it('despawning releases every registration: no listener, target, attacker or actor is left behind', () => {
    const kit = foeKit(gltf, { player: { x: -4.5, z: -10 } });
    const listeners = kit.fake.bus.listenerCount();
    const targets = kit.fake.targetCount;
    const attackers = kit.fake.attackerCount;
    const actors = kit.fake.actorMap.size;
    const modifiers = kit.fake.modifiers.length;
    const sc = r01(kit);
    kit.tick(0.5);
    expect(kit.fake.targetCount).toBe(targets + 6);
    expect(kit.fake.attackerCount).toBe(attackers + 6);
    kit.manager.service.despawnGroup('r01.scarecrows');
    expect(kit.manager.foeCount).toBe(0);
    expect(kit.fake.targetCount).toBe(targets);
    expect(kit.fake.attackerCount).toBe(attackers);
    expect(kit.fake.actorMap.size).toBe(actors);
    expect(kit.fake.bus.listenerCount()).toBe(listeners);
    expect(kit.fake.modifiers.length).toBe(modifiers);
    // an aggroed one calmed on despawn
    expect(kit.fake.bus.of('ai.calm').length).toBe(kit.fake.bus.of('ai.aggro').length);
    expect(sc.every((s) => s.isGone)).toBe(true);
    kit.manager.dispose();
    expect(kit.fake.bus.listenerCount()).toBeLessThan(listeners);
    expect(kit.fake.modifiers.length).toBe(0);
  });

  it('despawning mid-windup cancels the telegraph and does not leave the swing open', () => {
    const kit = foeKit(gltf, { player: { x: -4.5, z: -1.6 } });
    const [s] = r01(kit);
    for (let i = 0; i < 300 && s.state !== 'windup'; i++) kit.tick();
    expect(s.state).toBe('windup');
    s.despawn();
    expect(kit.fake.bus.of('telegraph.cancelled').filter((e) => e.actorId === s.id)).toHaveLength(1);
  });
});

describe('scarecrow group and persistence', () => {
  it('the group clears when all six are cleared, once, and the cleared mark persists', () => {
    const kit = foeKit(gltf, { player: { x: -4.5, z: -10 } });
    const sc = r01(kit);
    for (const s of sc.slice(0, 5)) surgeHit(kit.fake, s.id);
    kit.tick(2);
    expect(kit.fake.bus.of('enemies.groupCleared')).toHaveLength(0);
    surgeHit(kit.fake, sc[5].id);
    kit.tick(2);
    expect(kit.fake.bus.of('enemies.groupCleared')).toEqual([{ spawnerId: 'r01.scarecrows' }]);
    expect(kit.fake.bus.of('scarecrow.cleared')).toHaveLength(6);
    expect(kit.manager.spawners.isCleared('r01.scarecrows')).toBe(true);
    expect(kit.manager.spawners.serialize().cleared).toContain('r01.scarecrows');
    // spent keys keep their `#n` shape
    expect(kit.manager.spawners.serialize().spent.every((k) => /#\d+$/.test(k))).toBe(true);
  });

  it('after a reload with R01 cleared, none come back, even with R01 active', () => {
    const kit = foeKit(gltf, { player: { x: -4.5, z: -10 } });
    const sc = r01(kit);
    for (const s of sc) surgeHit(kit.fake, s.id);
    kit.tick(2);
    const saved = JSON.parse(JSON.stringify(kit.manager.spawners.serialize()));
    const kit2 = foeKit(gltf);
    kit2.manager.spawners.load(saved);
    kit2.fake.quests = { active: () => ['r01'] };
    kit2.fake.bus.emit('save.loaded', { slot: 'a' });
    kit2.fake.bus.emit('quest.started', { questId: 'r01' });
    expect(kit2.manager.foeCount).toBe(0);
  });

  it('a partly cleared group keeps the cleared ones gone after a reload', () => {
    const kit = foeKit(gltf, { player: { x: -4.5, z: -10 } });
    const sc = r01(kit);
    for (const s of sc.slice(0, 2)) surgeHit(kit.fake, s.id);
    kit.tick(2);
    const saved = JSON.parse(JSON.stringify(kit.manager.spawners.serialize()));
    const kit2 = foeKit(gltf);
    kit2.manager.spawners.load(saved);
    kit2.fake.quests = { active: () => ['r01'] };
    kit2.fake.bus.emit('save.loaded', { slot: 'a' });
    expect(kit2.manager.foeCount).toBe(4);
    expect(kit2.manager.service.alive('r01.scarecrows')).toHaveLength(4);
  });

  it('loading while R01 is not active removes live scarecrows and spawns none', () => {
    const kit = foeKit(gltf, { player: { x: -4.5, z: -10 } });
    r01(kit);
    expect(kit.manager.foeCount).toBe(6);
    kit.fake.quests = { active: () => [] };
    kit.fake.bus.emit('save.loaded', { slot: 'a' });
    expect(kit.manager.foeCount).toBe(0);
  });

  it('a missing member anchor falls back to a ring slot with a warning; a missing spawn anchor spawns nothing', () => {
    const kit = foeKit(gltf);
    kit.fake.anchorMap.delete('r01.scarecrow.2');
    const sc = r01(kit);
    expect(sc).toHaveLength(6);
    expect(kit.fake.warnings.some((w) => w.includes('r01.scarecrow.2'))).toBe(true);
    const kit2 = foeKit(gltf);
    kit2.fake.anchorMap.clear();
    kit2.fake.bus.emit('quest.started', { questId: 'r01' });
    expect(kit2.manager.foeCount).toBe(0);
  });

  it('the Brightwater defs: six members, band 2 to 3, never respawn', () => {
    const d = BRIGHTWATER_SPAWNERS.find((s) => s.id === 'r01.scarecrows')!;
    expect(d.count).toBe(6);
    expect(d.memberAnchors).toHaveLength(6);
    expect(d.band).toEqual({ min: 2, max: 3 });
    expect(d.respawn).toBe('never');
    expect(d.activation).toEqual({ quest: 'r01' });
  });

  it('disposing the manager leaves nothing behind', () => {
    const kit = foeKit(gltf);
    r01(kit);
    kit.manager.dispose();
    expect(kit.manager.foeCount).toBe(0);
    expect(kit.manager.spawn({ spawnerId: 'x' } as never)).toBeNull();
  });
});
