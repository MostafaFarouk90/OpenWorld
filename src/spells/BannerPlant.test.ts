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
