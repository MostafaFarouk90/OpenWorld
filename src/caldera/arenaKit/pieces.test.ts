// N3 arena kit: BreakingFloor and RisingLava states and resets, and every piece reset through the real bossArena on
// boss.ended and save.loaded. (TurningPlatforms with the real controller: ride.test.ts.)
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { BossArenas } from '../../bosses/arena';
import type { Vec3 } from '../../physics/PhysicsWorld';
import { ARENA_KIT } from '../lava/tuning';
import { BreakingFloor, RisingLava, kitSystem } from './index';

const DT = 1 / 60;

function floor() {
  const colliders = [{ on: true, setEnabled(b: boolean) { this.on = b; } }, { on: true, setEnabled(b: boolean) { this.on = b; } }];
  const meshes = [new THREE.Object3D(), new THREE.Object3D()];
  meshes[0]!.position.y = 10;
  meshes[1]!.position.y = 12;
  const solid = { s: true, setSolid(b: boolean) { this.s = b; } };
  const crack = { value: 0 };
  const warn = vi.fn();
  const f = new BreakingFloor({ tiles: [{ mesh: meshes[0], colliders: [colliders[0]!] }, { mesh: meshes[1], colliders: [colliders[1]!] }], solids: [solid], crackUniforms: [crack], warn });
  return { f, colliders, meshes, solid, crack, warn };
}

function lavaStub(y0: number) {
  const s = { y: y0, lips: [] as readonly Vec3[] };
  return {
    s,
    lava: {
      setSurface: (_id: string, y: number) => ((s.y = y), true),
      surface: () => s.y,
      setLips: (_id: string, l: readonly Vec3[]) => ((s.lips = l), true),
    },
  };
}

describe('BreakingFloor', () => {
  it('cracked glows; broken drops colliders and solids at once and the tiles fall and hide; reset restores all', () => {
    const t = floor();
    t.f.apply('cracked');
    expect(t.crack.value).toBe(1);
    expect(t.colliders.every((c) => c.on)).toBe(true);
    t.f.apply('broken');
    expect(t.colliders.every((c) => !c.on)).toBe(true);
    expect(t.solid.s).toBe(false);
    for (let i = 0; i < Math.ceil(ARENA_KIT.floorFallS / DT) + 1; i++) t.f.update(DT);
    expect(t.meshes[0]!.position.y).toBeCloseTo(10 - ARENA_KIT.floorFallM, 6);
    expect(t.meshes.every((m) => !m.visible)).toBe(true);
    t.f.reset();
    expect(t.f.state).toBe('whole');
    expect(t.colliders.every((c) => c.on)).toBe(true);
    expect(t.solid.s).toBe(true);
    expect(t.crack.value).toBe(0);
    expect(t.meshes.map((m) => m.position.y)).toEqual([10, 12]);
    expect(t.meshes.every((m) => m.visible)).toBe(true);
  });

  it('an unknown state warns once and changes nothing; "whole" is a reset; a floor with only external solids works', () => {
    const t = floor();
    t.f.apply('molten');
    t.f.apply('molten');
    expect(t.warn).toHaveBeenCalledTimes(1);
    expect(t.f.state).toBe('whole');
    t.f.apply('broken');
    t.f.apply('whole');
    expect(t.solid.s).toBe(true);
    const solid = { setSolid: vi.fn() };
    const bare = new BreakingFloor({ solids: [solid] });
    bare.apply('broken');
    bare.update(DT);
    bare.reset();
    expect(solid.setSolid.mock.calls).toEqual([[false], [true]]);
  });
});

describe('RisingLava', () => {
  const lips0 = [{ x: 0, y: 150, z: 0 }];
  const lips1 = [{ x: 0, y: 160, z: 0 }];

  it('rises over riseS with the new lips at once; falls with its lips on arrival; reset snaps low', () => {
    const { s, lava } = lavaStub(0);
    const r = new RisingLava({ lava, volumeId: 'v', levels: { low: { y: 140, lips: lips0 }, 'level:1': { y: 146, lips: lips1 } } });
    expect(s.y).toBe(140);
    expect(s.lips).toEqual(lips0);
    r.apply('level:1');
    expect(s.lips).toEqual(lips1);
    for (let i = 0; i < Math.round(ARENA_KIT.riseS / 2 / DT); i++) r.update(DT);
    expect(s.y).toBeCloseTo(143, 1);
    for (let i = 0; i < Math.round(ARENA_KIT.riseS / DT); i++) r.update(DT);
    expect(s.y).toBe(146);
    r.apply('low');
    expect(s.lips).toEqual(lips1); // still flooded until it is down
    for (let i = 0; i < Math.round(ARENA_KIT.riseS / DT) + 1; i++) r.update(DT);
    expect(s.y).toBe(140);
    expect(s.lips).toEqual(lips0);
    r.apply('level:1');
    r.update(DT);
    r.reset();
    expect(r.state).toBe('low');
    expect(s.y).toBe(140);
    r.update(DT);
    expect(s.y).toBe(140);
  });

  it('refuses a missing low level and lips without low lips; an unknown level warns once', () => {
    const { lava } = lavaStub(0);
    expect(() => new RisingLava({ lava, volumeId: 'v', levels: {} })).toThrow(/low/);
    expect(() => new RisingLava({ lava, volumeId: 'v', levels: { low: { y: 1 }, up: { y: 2, lips: lips1 } } })).toThrow(/lips/);
    const warn = vi.fn();
    const r = new RisingLava({ lava, volumeId: 'v', levels: { low: { y: 1 } }, warn });
    r.apply('nope');
    r.apply('nope');
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('the kit on bossArena', () => {
  it('boss.ended and save.loaded reset every piece; kitSystem ticks them', () => {
    const arenas = new BossArenas({ warn: () => {} });
    const t = floor();
    const { s, lava } = lavaStub(0);
    const rise = new RisingLava({ lava, volumeId: 'v', levels: { low: { y: 140 }, flood: { y: 150 } } });
    arenas.register('d10', { bossId: 'ulthred', pieces: { floor: t.f, lava: rise } });
    const sys = kitSystem('d10', [t.f, rise]);
    expect(arenas.set('d10', 'floor', 'broken')).toBe(true);
    arenas.set('d10', 'lava', 'flood');
    for (let i = 0; i < 60; i++) sys.fixedUpdate!(DT, undefined as never);
    expect(s.y).toBeGreaterThan(140);
    arenas.onBossEnded('ulthred');
    expect(t.f.state).toBe('whole');
    expect(s.y).toBe(140);
    arenas.set('d10', 'floor', 'broken');
    arenas.onLoaded();
    expect(t.solid.s).toBe(true);
    expect(arenas.state('d10', 'floor')).toBeUndefined();
  });
});
