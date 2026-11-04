import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { ModifiableRequest } from '../actors/DamageResolver';
import type { ActorLike } from '../vfx/ports';
import { BannerState, createBanner } from './BannerPlant';
import { FakeActor, FakeEvents } from './testHost';
import { BANNER } from './tuning';

const req = (amount = 100): ModifiableRequest => ({ attackerId: 'e', targetId: 'player', amount, poise: amount, kind: 'melee', outcome: 'hit' });

describe('BannerState', () => {
  it('scales damage inside 8 m (inclusive) and not outside', () => {
    const s = new BannerState();
    s.plant({ x: 0, y: 0, z: 0 }, 0);
    expect(s.scaleFor({ x: 7.9, y: 0, z: 0 })).toBe(0.9);
    expect(s.scaleFor({ x: 8, y: 0, z: 0 })).toBe(0.9);
    expect(s.scaleFor({ x: 8.1, y: 0, z: 0 })).toBe(1);
  });
  it('expires after 20 s and reports it once', () => {
    const s = new BannerState();
    s.plant({ x: 0, y: 0, z: 0 }, 5);
    expect(s.update(24.9)).toBe(false);
    expect(s.update(25)).toBe(true);
    expect(s.active).toBe(false);
    expect(s.update(26)).toBe(false);
    expect(s.scaleFor({ x: 0, y: 0, z: 0 })).toBe(1);
  });
  it('re-planting replaces the banner and restarts the timer', () => {
    const s = new BannerState();
    s.plant({ x: 0, y: 0, z: 0 }, 0);
    s.plant({ x: 50, y: 0, z: 0 }, 10);
    expect(s.scaleFor({ x: 0, y: 0, z: 0 })).toBe(1);
    expect(s.scaleFor({ x: 50, y: 0, z: 0 })).toBe(0.9);
    expect(s.remaining(10)).toBe(BANNER.lifetimeSeconds);
  });
  it('ignores a non-finite position', () => {
    const s = new BannerState();
    s.plant({ x: Number.NaN, y: 0, z: 0 }, 0);
    expect(s.active).toBe(false);
  });
});

describe('createBanner', () => {
  function make() {
    const events = new FakeEvents();
    const scene = new THREE.Group();
    const feet = new THREE.Vector3(0, 0, 0);
    const spawned: string[] = [];
    const services = { get: (n: string) => (n === 'vfx' ? { spawnEffect: (id: string) => spawned.push(id) } : undefined) } as never;
    const b = createBanner({ events, scene, services, player: { feet, facingYaw: 0 } });
    return { b, events, scene, feet, spawned };
  }
  const actor = (team: ActorLike['team'], x: number, z: number) => new FakeActor('a', team, x, z);

  it('plants 2 m ahead (-Z at yaw 0), adds a mesh and a buff, and pulses its aura', () => {
    const { b, events, scene, spawned } = make();
    b.plant(0);
    const at = b.state.position!;
    expect([at.x + 0, at.y, at.z]).toEqual([0, 0, -2]);
    expect(scene.children).toHaveLength(1);
    expect(events.log.find((l) => l.type === 'buff.applied')?.payload).toMatchObject({ id: 'knight.bannerPlant', seconds: 20 });
    expect(spawned).toEqual(['skill-q']);
    b.update(3.1, true);
    expect(spawned).toEqual(['skill-q', 'skill-q']);
  });

  it('reduces damage by 10% for the player and allies in range only', () => {
    const { b } = make();
    b.plant(0);
    for (const [team, x, z, expected] of [
      ['player', 0, -2, 90],
      ['ally', 5, -2, 90],
      ['ally', 20, 0, 100],
      ['hostile', 0, -2, 100],
      ['neutral', 0, -2, 100],
    ] as const) {
      const r = req();
      b.modify(r, actor(team, x, z));
      expect(r.amount, `${team} ${x},${z}`).toBe(expected);
    }
  });

  it('does nothing before planting, after expiry, and a respec (skill unlearned) removes it', () => {
    const { b, scene } = make();
    const r = req();
    b.modify(r, actor('player', 0, 0));
    expect(r.amount).toBe(100);
    b.plant(0);
    b.update(1, false); // respec dropped Banner Plant
    expect(b.state.active).toBe(false);
    expect(scene.children).toHaveLength(0);
    b.plant(2);
    b.update(22.5, true);
    expect(b.state.active).toBe(false);
    expect(scene.children).toHaveLength(0);
  });

  it('removal announces buff.removed once (expiry, respec, dispose, load)', () => {
    const { b, events } = make();
    const removed = () => events.log.filter((l) => l.type === 'buff.removed').length;
    b.plant(0);
    b.update(21, true);
    expect(removed()).toBe(1);
    b.update(22, true);
    expect(removed()).toBe(1);
    b.plant(30);
    b.update(31, false);
    expect(removed()).toBe(2);
    b.plant(40);
    b.clear();
    expect(removed()).toBe(3);
    b.plant(50);
    b.dispose();
    expect(removed()).toBe(4);
  });

  it('re-planting leaves a single mesh, and dispose removes everything', () => {
    const { b, scene } = make();
    b.plant(0);
    b.plant(1);
    expect(scene.children).toHaveLength(1);
    b.dispose();
    expect(scene.children).toHaveLength(0);
    expect(b.state.active).toBe(false);
  });
});

describe('createBanner onPulse (K11, Hearthfire Ward)', () => {
  it('calls onPulse on each 3 s pulse with the banner position and radius, and not before', () => {
    const events = new FakeEvents();
    const pulses: Array<{ position: { x: number; y: number; z: number }; radius: number }> = [];
    const services = { get: () => undefined } as never;
    const b = createBanner({
      events,
      scene: new THREE.Group(),
      services,
      player: { feet: new THREE.Vector3(0, 0, 0), facingYaw: 0 },
      onPulse: (position, radius) => pulses.push({ position, radius }),
    });
    b.plant(0);
    b.update(2.9, true);
    expect(pulses).toHaveLength(0);
    b.update(3, true);
    expect(pulses).toHaveLength(1);
    expect(pulses[0].position).toEqual({ x: 0, y: 0, z: -2 });
    expect(pulses[0].radius).toBe(BANNER.radius);
    b.update(5.9, true);
    expect(pulses).toHaveLength(1);
    b.update(6, true);
    expect(pulses).toHaveLength(2);
  });
});

describe('per-plant radius (K11, Banner of the Sunforge)', () => {
  function make() {
    const events = new FakeEvents();
    const spawned: Array<{ id: string; params: any }> = [];
    const pulses: number[] = [];
    const services = { get: (n: string) => (n === 'vfx' ? { spawnEffect: (id: string, _t: unknown, params: unknown) => spawned.push({ id, params }) } : undefined) } as never;
    const b = createBanner({
      events,
      scene: new THREE.Group(),
      services,
      player: { feet: new THREE.Vector3(0, 0, 0), facingYaw: 0 },
      onPulse: (_p, r) => pulses.push(r),
    });
    return { b, spawned, pulses };
  }

  it('BannerState: a radius is for that banner only; the default is 8 m', () => {
    const s = new BannerState();
    expect(s.radius).toBe(BANNER.radius);
    s.plant({ x: 0, y: 0, z: 0 }, 0, 20);
    expect(s.radius).toBe(20);
    expect(s.scaleFor({ x: 20, y: 0, z: 0 })).toBe(0.9);
    expect(s.scaleFor({ x: 20.1, y: 0, z: 0 })).toBe(1);
    s.plant({ x: 0, y: 0, z: 0 }, 1);
    expect(s.radius).toBe(8);
    expect(s.scaleFor({ x: 9, y: 0, z: 0 })).toBe(1);
  });

  it('a bad radius falls back to 8 m', () => {
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const s = new BannerState();
      s.plant({ x: 0, y: 0, z: 0 }, 0, bad);
      expect(s.radius, String(bad)).toBe(8);
    }
  });

  it('plant(now, { radius: 20 }) sizes the damage cut, the plant effect and the pulse; the next plain plant is 8 m again', () => {
    const { b, spawned, pulses } = make();
    b.plant(0, { radius: 20 });
    expect(spawned[0].params.radius).toBe(20);
    const near = new FakeActor('a', 'player', 19, -2);
    const r1 = req(100);
    b.modify(r1, near as never);
    expect(r1.amount).toBe(90);
    b.update(3, true);
    expect(pulses).toEqual([20]);
    expect(spawned[1].params.radius).toBe(20);
    // a normal Banner Plant afterwards
    b.plant(4);
    expect(spawned[2].params.radius).toBe(8);
    const r2 = req(100);
    b.modify(r2, near as never);
    expect(r2.amount).toBe(100);
    b.update(7, true);
    expect(pulses).toEqual([20, 8]);
  });

  it('plant without options is unchanged (8 m)', () => {
    const { b, spawned } = make();
    b.plant(0);
    expect(b.state.radius).toBe(8);
    expect(spawned[0].params.radius).toBe(8);
  });
});
