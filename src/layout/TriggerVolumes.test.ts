import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ActorRegistry } from '../actors/ActorRegistry';
import { GameEvents } from '../core/events';
import { TriggerVolumes } from './TriggerVolumes';

function setup() {
  const events = new GameEvents((m, e) => { throw new Error(m + String(e)); });
  const actors = new ActorRegistry(events);
  const tv = new TriggerVolumes({ actors, events });
  const log: string[] = [];
  events.on('trigger.enter', (e) => log.push(`enter ${e.triggerId} ${e.actorId}`));
  events.on('trigger.exit', (e) => log.push(`exit ${e.triggerId} ${e.actorId}`));
  const spawn = (id: string, x: number, y = 0, z = 0) => {
    const root = new THREE.Object3D();
    root.position.set(x, y, z);
    const actor = actors.spawn({ id, kind: id, team: id === 'player' ? 'player' : 'hostile', maxHealth: 5, root });
    return { actor, root };
  };
  return { events, actors, tv, log, spawn };
}
const sphere = (r = 2, c = { x: 0, y: 0, z: 0 }) => ({ type: 'sphere' as const, center: c, radius: r });

describe('TriggerVolumes', () => {
  it('has the contract identity', () => {
    const t = setup();
    expect([t.tv.id, t.tv.fixedPhase, t.tv.order]).toEqual(['core.triggers', 'rules', -100]);
  });
  it('enter then exit for the player on a sphere (boundary inclusive)', () => {
    const t = setup();
    const p = t.spawn('player', 5);
    t.tv.add({ id: 'zone', shape: sphere(2) });
    t.tv.fixedUpdate();
    expect(t.log).toEqual([]);
    p.root.position.x = 2;
    t.tv.fixedUpdate();
    t.tv.fixedUpdate();
    expect(t.log).toEqual(['enter zone player']);
    p.root.position.x = 2.01;
    t.tv.fixedUpdate();
    expect(t.log).toEqual(['enter zone player', 'exit zone player']);
  });
  it('an actor already inside gets enter on the next update', () => {
    const t = setup();
    t.spawn('player', 0);
    t.tv.add({ id: 'zone', shape: sphere() });
    expect(t.log).toEqual([]);
    t.tv.fixedUpdate();
    expect(t.log).toEqual(['enter zone player']);
  });
  it('who defaults to player; any-actor includes others', () => {
    const t = setup();
    t.spawn('player', 50);
    t.spawn('wolf', 0);
    t.tv.add({ id: 'p', shape: sphere() });
    t.tv.add({ id: 'any', shape: sphere(), who: 'any-actor' });
    t.tv.fixedUpdate();
    expect(t.log).toEqual(['enter any wolf']);
  });
  it('once triggers remove themselves after the first enter, with no exit', () => {
    const t = setup();
    const p = t.spawn('player', 5);
    t.tv.add({ id: 'once', shape: sphere(), once: true });
    p.root.position.x = 0;
    t.tv.fixedUpdate();
    p.root.position.x = 9;
    t.tv.fixedUpdate();
    p.root.position.x = 0;
    t.tv.fixedUpdate();
    expect(t.log).toEqual(['enter once player']);
    expect(() => t.tv.add({ id: 'once', shape: sphere() })).not.toThrow();
  });
  it('remove emits no exit and stops events', () => {
    const t = setup();
    const p = t.spawn('player', 0);
    const off = t.tv.add({ id: 'z', shape: sphere() });
    t.tv.fixedUpdate();
    off();
    p.root.position.x = 50;
    t.tv.fixedUpdate();
    expect(t.log).toEqual(['enter z player']);
    off();
  });
  it('a re-added trigger starts fresh: enter again', () => {
    const t = setup();
    t.spawn('player', 0);
    const off = t.tv.add({ id: 'z', shape: sphere() });
    t.tv.fixedUpdate();
    off();
    t.tv.add({ id: 'z', shape: sphere() });
    t.tv.fixedUpdate();
    expect(t.log).toEqual(['enter z player', 'enter z player']);
  });
  it('dead actors produce exit; revived and inside again produce enter', () => {
    const t = setup();
    const p = t.spawn('player', 0);
    t.tv.add({ id: 'z', shape: sphere() });
    t.tv.fixedUpdate();
    p.actor._dead = true;
    t.tv.fixedUpdate();
    t.tv.fixedUpdate();
    expect(t.log).toEqual(['enter z player', 'exit z player']);
    p.actor._dead = false;
    t.tv.fixedUpdate();
    expect(t.log).toEqual(['enter z player', 'exit z player', 'enter z player']);
  });
  it('despawned actors produce exit immediately', () => {
    const t = setup();
    t.spawn('player', 50);
    t.spawn('wolf', 0);
    t.tv.add({ id: 'z', shape: sphere(), who: 'any-actor' });
    t.tv.fixedUpdate();
    t.actors.despawn('wolf');
    expect(t.log).toEqual(['enter z wolf', 'exit z wolf']);
    t.tv.fixedUpdate();
    expect(t.log).toHaveLength(2);
  });
  it('actors without a root are never inside', () => {
    const t = setup();
    t.actors.spawn({ id: 'player', kind: 'player', team: 'player', maxHealth: 1 });
    t.tv.add({ id: 'z', shape: sphere(1000) });
    t.tv.fixedUpdate();
    expect(t.log).toEqual([]);
  });
  it('the player missing from the registry is fine', () => {
    const t = setup();
    t.tv.add({ id: 'z', shape: sphere() });
    expect(() => t.tv.fixedUpdate()).not.toThrow();
  });
  it('uses world position of nested roots', () => {
    const t = setup();
    const parent = new THREE.Object3D();
    parent.position.set(100, 0, 0);
    const root = new THREE.Object3D();
    root.position.set(1, 0, 0);
    parent.add(root);
    parent.updateMatrixWorld(true);
    t.actors.spawn({ id: 'player', kind: 'player', team: 'player', maxHealth: 1, root });
    t.tv.add({ id: 'z', shape: sphere(1, { x: 101, y: 0, z: 0 }) });
    t.tv.fixedUpdate();
    expect(t.log).toEqual(['enter z player']);
  });
  describe('box', () => {
    const box = (yaw?: number) => ({ type: 'box' as const, center: { x: 10, y: 0, z: 10 }, half: { x: 4, y: 1, z: 1 }, yaw });
    it('axis-aligned', () => {
      const t = setup();
      const p = t.spawn('player', 13.9, 0, 10.9);
      t.tv.add({ id: 'b', shape: box() });
      t.tv.fixedUpdate();
      expect(t.log).toEqual(['enter b player']);
      p.root.position.set(13.9, 0, 11.1);
      t.tv.fixedUpdate();
      p.root.position.set(10, 1.1, 10);
      t.tv.fixedUpdate();
      expect(t.log).toEqual(['enter b player', 'exit b player']);
    });
    it('with yaw pi/2 the long axis points along -Z', () => {
      const t = setup();
      // local +x (half 4) maps to world (cos yaw, 0, -sin yaw) = (0, 0, -1)
      const p = t.spawn('player', 10, 0, 6.5);
      t.tv.add({ id: 'b', shape: box(Math.PI / 2) });
      t.tv.fixedUpdate();
      expect(t.log).toEqual(['enter b player']);
      p.root.position.set(13, 0, 10); // inside unrotated, outside rotated
      t.tv.fixedUpdate();
      expect(t.log).toEqual(['enter b player', 'exit b player']);
      p.root.position.set(10, 0, 13.9);
      t.tv.fixedUpdate();
      expect(t.log).toHaveLength(3);
    });
    it('with a 45 degree yaw, diagonal points are in and axis points out', () => {
      const t = setup();
      const p = t.spawn('player', 10 + 2.5, 0, 10 - 2.5); // along local x
      t.tv.add({ id: 'b', shape: box(Math.PI / 4) });
      t.tv.fixedUpdate();
      expect(t.log).toEqual(['enter b player']);
      p.root.position.set(13.5, 0, 10); // 3.5 along world x: local lz = 2.47 > 1
      t.tv.fixedUpdate();
      expect(t.log).toEqual(['enter b player', 'exit b player']);
    });
  });
  describe('validation', () => {
    it('duplicate id throws', () => {
      const t = setup();
      t.tv.add({ id: 'z', shape: sphere() });
      expect(() => t.tv.add({ id: 'z', shape: sphere() })).toThrow(/duplicate/);
    });
    it.each([
      ['sphere radius 0', { type: 'sphere', center: { x: 0, y: 0, z: 0 }, radius: 0 }],
      ['sphere radius NaN', { type: 'sphere', center: { x: 0, y: 0, z: 0 }, radius: NaN }],
      ['sphere NaN center', { type: 'sphere', center: { x: NaN, y: 0, z: 0 }, radius: 1 }],
      ['box zero half', { type: 'box', center: { x: 0, y: 0, z: 0 }, half: { x: 1, y: 0, z: 1 } }],
      ['box infinite center', { type: 'box', center: { x: 0, y: Infinity, z: 0 }, half: { x: 1, y: 1, z: 1 } }],
      ['box bad yaw', { type: 'box', center: { x: 0, y: 0, z: 0 }, half: { x: 1, y: 1, z: 1 }, yaw: NaN }],
      ['unknown type', { type: 'cone' }],
      ['missing', undefined],
    ])('bad shape: %s', (_n, shape) => {
      const t = setup();
      expect(() => t.tv.add({ id: 'z', shape: shape as never })).toThrow(/TriggerVolumes/);
      expect(() => t.tv.add({ id: 'z', shape: sphere() })).not.toThrow(); // nothing was registered
    });
    it('bad who and empty id throw', () => {
      const t = setup();
      expect(() => t.tv.add({ id: 'z', shape: sphere(), who: 'npc' as never })).toThrow();
      expect(() => t.tv.add({ id: '', shape: sphere() })).toThrow();
    });
  });
  it('dispose stops reacting to despawns', () => {
    const t = setup();
    t.spawn('wolf', 0);
    t.tv.add({ id: 'z', shape: sphere(), who: 'any-actor' });
    t.tv.fixedUpdate();
    t.tv.dispose();
    t.actors.despawn('wolf');
    expect(t.log).toEqual(['enter z wolf']);
  });
  it('isInside tracks membership per actor and is false for unknown triggers', () => {
    const t = setup();
    const p = t.spawn('player', 5);
    t.spawn('wolf', 0);
    t.tv.add({ id: 'z', shape: sphere(), who: 'any-actor' });
    expect(t.tv.isInside('z')).toBe(false);
    t.tv.fixedUpdate();
    expect(t.tv.isInside('z')).toBe(false);
    expect(t.tv.isInside('z', 'wolf')).toBe(true);
    p.root.position.x = 0;
    t.tv.fixedUpdate();
    expect(t.tv.isInside('z')).toBe(true);
    expect(t.tv.isInside('z', 'player')).toBe(true);
    expect(t.tv.isInside('nope')).toBe(false);
    expect(t.tv.isInside('nope', 'wolf')).toBe(false);
    p.root.position.x = 9;
    t.tv.fixedUpdate();
    expect(t.tv.isInside('z')).toBe(false);
    t.actors.despawn('wolf');
    expect(t.tv.isInside('z', 'wolf')).toBe(false);
  });
});
