// K5: the M27 deserter (scripted defender) on a real core Game (real damage, ally engagement and group-cleared helper).
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MercyState } from '../../actors/Actor';
import { PhysicsWorld } from '../../physics/PhysicsWorld';
import { Defenders, defenderBodyFactory } from '../../waves/defenders';
import { makeKit, type Kit } from '../../waves/testKit';
import { DEFENDER } from '../../waves/tuning';
import { DESERTER_ALLY, DeserterAlly, R14_CHOICE_FLAG } from './deserter';

let physics: PhysicsWorld;
let kit: Kit;
let ally: DeserterAlly;
const warns: string[] = [];

beforeEach(async () => {
  physics = new PhysicsWorld();
  await physics.init();
  warns.length = 0;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  kit = await makeKit(physics, { withWaves: false, anchors: false });
  const f = kit.ctx.player.feet;
  kit.ctx.anchors.define({ id: 'greyfen.m27.ally.1', position: { x: f.x + 3, y: f.y, z: f.z }, yaw: 1 });
  kit.ctx.anchors.define({ id: 'greyfen.m27.ally.2', position: { x: f.x - 6, y: f.y, z: f.z + 4 }, yaw: 2 });
  ally = new DeserterAlly({
    host: kit.ctx,
    makeBody: defenderBodyFactory(null),
    flag: (k) => kit.ctx.state.getFlag(k),
    anchor: (id) => kit.ctx.anchors.find(id),
    groundAt: () => null,
    warn: (m) => warns.push(m),
  });
  kit.ctx.systems.add({ id: 'test.deserter', fixedPhase: 'rules', order: 10, fixedUpdate: (dt) => ally.fixedUpdate(dt) });
}, 30_000);
afterEach(() => {
  ally.dispose();
  kit.teardown();
  vi.restoreAllMocks();
});

const release = () => kit.ctx.state.setFlag(R14_CHOICE_FLAG, 'released');
const hostile = (maxHealth = 40) =>
  kit.ctx.actors.spawn({ kind: 'dragon-hunter', team: 'hostile', maxHealth, maxPoise: 15, root: new THREE.Group() });
const actor = () => kit.ctx.actors.get(ally.deserter()!.actorId)!;
const near = (foe: ReturnType<typeof hostile>, dist = 1.2) => {
  const p = actor().root!.position;
  foe.root!.position.set(p.x + dist, p.y, p.z);
  foe.root!.updateMatrixWorld(true);
};

describe('the M27 deserter: spawn rules', () => {
  it('is refused unless R14 released him, and for an unknown anchor', () => {
    expect(ally.spawnDeserter('greyfen.m27.ally.1')).toBe(false);
    kit.ctx.state.setFlag(R14_CHOICE_FLAG, 'returned');
    expect(ally.spawnDeserter('greyfen.m27.ally.1')).toBe(false);
    release();
    expect(ally.spawnDeserter('greyfen.m27.nowhere')).toBe(false);
    expect(ally.deserter()).toBeNull();
    expect(warns).toHaveLength(3);
  });

  it('stands at the anchor, on the ally team, with his own kind', () => {
    release();
    expect(ally.spawnDeserter('greyfen.m27.ally.1')).toBe(true);
    const a = kit.ctx.anchors.find('greyfen.m27.ally.1')!;
    const d = ally.deserter()!;
    expect(d).toMatchObject({ anchorId: 'greyfen.m27.ally.1', state: 'post' });
    expect(actor().team).toBe('ally');
    expect(actor().kind).toBe(DESERTER_ALLY.kind);
    expect(actor().root!.position.x).toBeCloseTo(a.position.x);
    expect(actor().root!.rotation.y).toBeCloseTo(1);
  });

  it('a second spawn at the same anchor revives him in place; another anchor moves him (one actor only)', () => {
    release();
    ally.spawnDeserter('greyfen.m27.ally.1');
    const first = ally.deserter()!.actorId;
    kit.ctx.damage.kill(first);
    expect(ally.deserter()!.state).toBe('down');
    expect(ally.spawnDeserter('greyfen.m27.ally.1')).toBe(true);
    expect(ally.deserter()).toMatchObject({ actorId: first, state: 'post' });
    expect(ally.spawnDeserter('greyfen.m27.ally.2')).toBe(true);
    expect(ally.deserter()!.anchorId).toBe('greyfen.m27.ally.2');
    expect(kit.ctx.actors.get(first)).toBeUndefined();
    expect([...kit.ctx.actors.all()].filter((x) => x.kind === DESERTER_ALLY.kind)).toHaveLength(1);
  });

  it('despawn is idempotent and removes the actor', () => {
    release();
    ally.spawnDeserter('greyfen.m27.ally.1');
    const id = ally.deserter()!.actorId;
    ally.despawnDeserter();
    ally.despawnDeserter();
    expect(ally.deserter()).toBeNull();
    expect(kit.ctx.actors.get(id)).toBeUndefined();
  });
});

describe('the M27 deserter: never dies, never kills', () => {
  it('lethal damage knocks him down 4 s, then he stands at full health', () => {
    release();
    ally.spawnDeserter('greyfen.m27.ally.1');
    const foe = hostile();
    const r = kit.ctx.damage.apply({ attackerId: foe.id, targetId: actor().id, amount: 9999, kind: 'melee' });
    expect(r?.killed).toBe(false);
    expect(actor().dead).toBe(false);
    expect(ally.deserter()!.state).toBe('down');
    kit.runSecs(DEFENDER.knockdownSeconds + 0.2);
    expect(ally.deserter()!.state).toBe('post');
    expect(actor().health).toBe(actor().maxHealth);
    expect(kit.of('actor.saved').every((e) => e.handlerId === DESERTER_ALLY.lethalHandlerId)).toBe(true);
  });

  it('swings at a hostile fighting Cael, never to its last health point', () => {
    release();
    ally.spawnDeserter('greyfen.m27.ally.1');
    const foe = hostile(40);
    near(foe);
    kit.runSecs(1);
    expect(foe.health).toBe(40);
    kit.ctx.events.emit('ai.aggro', { actorId: foe.id, targetId: 'player' });
    kit.runSecs(40);
    expect(foe.health).toBe(1);
    expect(foe.dead).toBe(false);
  });

  it.each(['staggered', 'yielding', 'calming', 'releasing'] as MercyState[])('never touches a foe that is %s', (ms) => {
    release();
    ally.spawnDeserter('greyfen.m27.ally.1');
    const foe = hostile(40);
    foe.mercyState = () => ms;
    near(foe);
    kit.ctx.events.emit('ai.aggro', { actorId: foe.id, targetId: 'player' });
    kit.runSecs(10);
    expect(foe.health).toBe(40);
  });

  it('coexists with the M12 militia: separate handler ids, both sets hold', () => {
    release();
    const f = kit.ctx.player.feet;
    const militia = new Defenders(kit.ctx, defenderBodyFactory(null));
    militia.build([{ x: f.x + 10, y: f.y, z: f.z }], 0);
    expect(ally.spawnDeserter('greyfen.m27.ally.1')).toBe(true);
    const foe = hostile();
    kit.ctx.damage.apply({ attackerId: foe.id, targetId: militia.all[0].id, amount: 9999, kind: 'melee' });
    kit.ctx.damage.apply({ attackerId: foe.id, targetId: actor().id, amount: 9999, kind: 'melee' });
    expect(militia.all[0].state).toBe('down');
    expect(ally.deserter()!.state).toBe('down');
    const ids = kit.of('actor.saved').map((e) => e.handlerId);
    expect(ids).toEqual([DEFENDER.lethalHandlerId, DESERTER_ALLY.lethalHandlerId]);
    militia.despawnAll();
  });
});

describe('the M27 deserter: group clears', () => {
  it('a group clears with him present, a member spared mid-fight counts as gone', () => {
    release();
    const enemies = kit.enemies.service;
    const ids = [...enemies.spawnGroup('m27.pack.1'), ...enemies.spawnGroup('m27.pack.1')];
    const standing = kit.ctx.services.require('groupStanding');
    ally.spawnDeserter('greyfen.m27.ally.1');
    expect(standing.isCleared('m27.pack.1')).toBe(false);
    kit.ctx.events.emit('mercy', { actorId: ids[0], verb: 'spare' } as never);
    kit.ctx.damage.kill(ids[1]);
    expect(standing.isCleared('m27.pack.1')).toBe(true);
    // He is still standing and is not part of any group.
    expect(ally.deserter()!.state).toBe('post');
    ally.despawnDeserter();
    expect(standing.isCleared('m27.pack.1')).toBe(true);
  });

  it('and clears the same way with him absent', () => {
    const enemies = kit.enemies.service;
    const ids = enemies.spawnGroup('m27.pack.2', { count: 2 });
    const standing = kit.ctx.services.require('groupStanding');
    kit.ctx.events.emit('mercy', { actorId: ids[0], verb: 'calm' } as never);
    kit.ctx.damage.kill(ids[1]);
    expect(standing.isCleared('m27.pack.2')).toBe(true);
  });
});
