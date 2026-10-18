import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import { PLAYER } from '../config/constants';
import type { InputSnapshot } from '../input/InputManager';
import { PhysicsWorld, type Vec3 } from '../physics/PhysicsWorld';
import { flatGround } from '../physics/flatGround';
import { Player, type MoveModifierState, type PlayerOptions } from './Player';

const NO_INPUT: InputSnapshot = { moveRight: 0, moveForward: 0, sprint: false, jump: false, attack: 0 };
type LeapEvent = { phase: 'start' | 'land' | 'cancel'; from: Vec3; to?: Vec3 };

let physics: PhysicsWorld;
let scene: THREE.Scene;
let events: LeapEvent[];
let mod: MoveModifierState;

beforeEach(async () => {
  physics = new PhysicsWorld();
  await physics.init();
  scene = new THREE.Scene();
  events = [];
  mod = { speedScale: 1, lockMove: false, lockFacing: false };
  physics.addHeightfield(flatGround(200));
});

function makePlayer(opts: PlayerOptions = {}, spawn: Vec3 = { x: 0, y: 0, z: 0 }): Player {
  return new Player(scene, physics, spawn, { onLeap: (e) => events.push(e), moveModifier: () => mod, ...opts });
}

function tick(p: Player, moveX = 0, moveZ = 0): void {
  p.fixedUpdate(NO_INPUT, moveX, moveZ);
  physics.step();
  p.postStep();
}

function settle(p: Player, n = 40): void {
  for (let i = 0; i < n; i++) tick(p);
}

function feetOf(p: Player): Vec3 {
  return p.controller.interpolatedFeet(1, { x: 0, y: 0, z: 0 });
}

/** Ticks until the predicate holds or `max` ticks pass; returns ticks run. */
function runUntil(p: Player, done: () => boolean, max = 200): number {
  let n = 0;
  while (n < max && !done()) {
    tick(p);
    n++;
  }
  return n;
}

function addBox(centre: Vec3, half: Vec3): void {
  physics.addStaticCollider(
    physics.rapier.ColliderDesc.cuboid(half.x, half.y, half.z).setTranslation(centre.x, centre.y, centre.z),
  );
}

describe('Player.leap', () => {
  describe('on flat ground', () => {
    it('lands about `distance` ahead (within 10%) and reports start then land', () => {
      const p = makePlayer();
      settle(p);
      const from = feetOf(p);
      const h = p.leap({ yaw: 0, distance: 6, apex: 1.5 })!;
      expect(h.active).toBe(true);
      expect(h.landed).toBe(false);
      runUntil(p, () => !h.active);
      expect(h.landed).toBe(true);
      const to = feetOf(p);
      expect(from.z - to.z).toBeGreaterThan(5.4);
      expect(from.z - to.z).toBeLessThan(6.6);
      expect(Math.abs(to.x - from.x)).toBeLessThan(0.05);
      expect(events.map((e) => e.phase)).toEqual(['start', 'land']);
      expect(events[0]!.from.z).toBeCloseTo(from.z, 3);
      expect(events[1]!.to!.z).toBeCloseTo(to.z, 3);
    });

    it('peaks near the requested apex', () => {
      const p = makePlayer();
      settle(p);
      const y0 = feetOf(p).y;
      const h = p.leap({ yaw: 0, distance: 5, apex: 2 })!;
      let peak = 0;
      runUntil(p, () => {
        peak = Math.max(peak, feetOf(p).y - y0);
        return !h.active;
      });
      expect(peak).toBeGreaterThan(1.8);
      expect(peak).toBeLessThan(2.2);
    });

    it('follows yaw and defaults to the current facing; turns the player to the leap yaw', () => {
      const p = makePlayer();
      settle(p);
      p.setFacingYaw(Math.PI / 2);
      const from = feetOf(p);
      const h = p.leap({ distance: 4, apex: 1 })!;
      runUntil(p, () => !h.active);
      const to = feetOf(p);
      // yaw pi/2 faces -X.
      expect(from.x - to.x).toBeGreaterThan(3.5);
      expect(Math.abs(to.z - from.z)).toBeLessThan(0.1);
      expect(p.facingYaw).toBeCloseTo(Math.PI / 2, 4);
    });

    it('turns to an explicit yaw unless lockFacing is set', () => {
      const p = makePlayer();
      settle(p);
      p.leap({ yaw: 1, distance: 3, apex: 1 });
      tick(p);
      expect(p.facingYaw).toBeCloseTo(1, 4);

      const q = makePlayer({}, { x: 20, y: 0, z: 0 });
      settle(q);
      mod.lockFacing = true;
      const before = q.facingYaw;
      q.leap({ yaw: 1, distance: 3, apex: 1 });
      tick(q);
      expect(q.facingYaw).toBeCloseTo(before, 4);
    });
  });

  describe('obstacles', () => {
    it('reaches a ledge just under the apex height', () => {
      addBox({ x: 0, y: 0.85, z: -9 }, { x: 5, y: 0.85, z: 7.5 }); // top at 1.7, front face at z = -1.5
      const p = makePlayer();
      settle(p);
      const h = p.leap({ yaw: 0, distance: 4, apex: 2 })!;
      runUntil(p, () => !h.active);
      expect(h.landed).toBe(true);
      expect(feetOf(p).y).toBeGreaterThan(1.6);
      expect(feetOf(p).z).toBeLessThan(-1.5);
    });

    it('a wall blocks forward motion yet the leap still lands', () => {
      addBox({ x: 0, y: 3, z: -2.5 }, { x: 5, y: 3, z: 0.25 });
      const p = makePlayer();
      settle(p);
      const h = p.leap({ yaw: 0, distance: 8, apex: 1 })!;
      runUntil(p, () => !h.active);
      expect(h.active).toBe(false);
      expect(h.landed).toBe(true);
      expect(feetOf(p).z).toBeGreaterThan(-2.3);
    });

    it('cancels when it never leaves the ground (low ceiling) instead of staying active', () => {
      addBox({ x: 0, y: 2.2, z: 0 }, { x: 5, y: 0.1, z: 5 }); // ceiling just above the head
      const p = makePlayer();
      settle(p);
      const h = p.leap({ yaw: 0, distance: 4, apex: 1 })!;
      runUntil(p, () => !h.active, 20);
      expect(h.active).toBe(false);
    });

    it('landing on an over-limit slope still ends (never stuck)', () => {
      // 70 degree slab: too steep to stand on.
      const angle = (70 * Math.PI) / 180;
      physics.addStaticCollider(
        physics.rapier.ColliderDesc.cuboid(5, 0.1, 6)
          .setTranslation(0, 1, -8)
          .setRotation({ x: Math.sin(angle / 2), y: 0, z: 0, w: Math.cos(angle / 2) }),
      );
      const p = makePlayer();
      settle(p);
      const h = p.leap({ yaw: 0, distance: 6, apex: 1 })!;
      runUntil(p, () => !h.active, 150);
      expect(h.active).toBe(false);
      expect(events.at(-1)!.phase === 'land' || events.at(-1)!.phase === 'cancel').toBe(true);
    });
  });

  describe('refusals', () => {
    it.each([
      ['zero distance', { distance: 0, apex: 1 }],
      ['negative distance', { distance: -1, apex: 1 }],
      ['NaN distance', { distance: NaN, apex: 1 }],
      ['zero apex', { distance: 3, apex: 0 }],
      ['Infinity apex', { distance: 3, apex: Infinity }],
      ['zero maxSeconds', { distance: 3, apex: 1, maxSeconds: 0 }],
      ['NaN maxSeconds', { distance: 3, apex: 1, maxSeconds: NaN }],
      ['NaN yaw', { distance: 3, apex: 1, yaw: NaN }],
    ])('refuses %s', (_n, opts) => {
      const p = makePlayer();
      settle(p);
      expect(p.leap(opts)).toBeNull();
      expect(events).toEqual([]);
      const z = feetOf(p).z;
      tick(p);
      expect(feetOf(p).z).toBeCloseTo(z, 3);
    });

    it('refuses while airborne', () => {
      const p = makePlayer({}, { x: 0, y: 10, z: 0 });
      tick(p);
      expect(p.controller.grounded).toBe(false);
      expect(p.leap({ distance: 3, apex: 1 })).toBeNull();
    });

    it('refuses while frozen', () => {
      const p = makePlayer();
      settle(p);
      mod.freeze = true;
      expect(p.leap({ distance: 3, apex: 1 })).toBeNull();
    });

    it('refuses a second leap while one is active, and allows one after landing', () => {
      const p = makePlayer();
      settle(p);
      const h = p.leap({ distance: 3, apex: 1 })!;
      expect(p.leap({ distance: 3, apex: 1 })).toBeNull();
      runUntil(p, () => !h.active);
      settle(p, 5);
      expect(p.leap({ distance: 3, apex: 1 })).not.toBeNull();
    });
  });

  describe('cancel', () => {
    it('handle.cancel() mid-air emits cancel, stops horizontal motion and falls normally', () => {
      const p = makePlayer();
      settle(p);
      const h = p.leap({ yaw: 0, distance: 8, apex: 2 })!;
      for (let i = 0; i < 10; i++) tick(p);
      h.cancel();
      expect(h.active).toBe(false);
      expect(h.landed).toBe(false);
      expect(events.map((e) => e.phase)).toEqual(['start', 'cancel']);
      expect(events[1]!.to).toBeUndefined();
      const z = feetOf(p).z;
      runUntil(p, () => p.controller.grounded && feetOf(p).y < 0.05, 200);
      expect(Math.abs(feetOf(p).z - z)).toBeLessThan(0.05);
      expect(p.controller.grounded).toBe(true);
      expect(events).toHaveLength(2);
    });

    it('cancel after the leap ended is a no-op', () => {
      const p = makePlayer();
      settle(p);
      const h = p.leap({ distance: 3, apex: 1 })!;
      runUntil(p, () => !h.active);
      h.cancel();
      expect(events.map((e) => e.phase)).toEqual(['start', 'land']);
      expect(h.landed).toBe(true);
    });

    it('a stale handle cannot cancel a later leap', () => {
      const p = makePlayer();
      settle(p);
      const old = p.leap({ distance: 3, apex: 1 })!;
      runUntil(p, () => !old.active);
      settle(p, 5);
      const next = p.leap({ distance: 3, apex: 1 })!;
      old.cancel();
      expect(next.active).toBe(true);
    });

    it('cancelLeap() cancels once and is harmless when idle', () => {
      const p = makePlayer();
      settle(p);
      p.cancelLeap();
      expect(events).toEqual([]);
      const h = p.leap({ distance: 5, apex: 1.5 })!;
      tick(p);
      tick(p);
      p.cancelLeap();
      p.cancelLeap();
      expect(h.active).toBe(false);
      expect(events.map((e) => e.phase)).toEqual(['start', 'cancel']);
    });

    it('freeze mid-air cancels the leap and holds the player', () => {
      const p = makePlayer();
      settle(p);
      const h = p.leap({ yaw: 0, distance: 8, apex: 2 })!;
      for (let i = 0; i < 8; i++) tick(p);
      mod.freeze = true;
      tick(p);
      expect(h.active).toBe(false);
      expect(events.map((e) => e.phase)).toEqual(['start', 'cancel']);
      const f = feetOf(p);
      for (let i = 0; i < 10; i++) tick(p);
      expect(feetOf(p).y).toBeCloseTo(f.y, 5);
      expect(feetOf(p).z).toBeCloseTo(f.z, 5);
    });

    it('kill-plane respawn mid-air cancels the leap', () => {
      const p = makePlayer();
      settle(p);
      const h = p.leap({ yaw: 0, distance: 8, apex: 2 })!;
      for (let i = 0; i < 5; i++) tick(p);
      p.controller.body.setTranslation({ x: 0, y: -60, z: 0 }, true);
      p.postStep();
      expect(h.active).toBe(false);
      expect(events.map((e) => e.phase)).toEqual(['start', 'cancel']);
    });

    it('times out after maxSeconds of ticks', () => {
      const p = makePlayer();
      settle(p);
      const h = p.leap({ yaw: 0, distance: 6, apex: 3, maxSeconds: 0.2 })!;
      const n = runUntil(p, () => !h.active);
      expect(n).toBeLessThanOrEqual(13);
      expect(h.landed).toBe(false);
      expect(events.map((e) => e.phase)).toEqual(['start', 'cancel']);
    });
  });

  describe('interaction with other movement systems', () => {
    it('setForcedMove(null) mid-leap does not end it', () => {
      const p = makePlayer();
      settle(p);
      const from = feetOf(p);
      const h = p.leap({ yaw: 0, distance: 6, apex: 1.5 })!;
      for (let i = 0; i < 5; i++) tick(p);
      p.setForcedMove(null);
      expect(h.active).toBe(true);
      runUntil(p, () => !h.active);
      expect(h.landed).toBe(true);
      expect(from.z - feetOf(p).z).toBeGreaterThan(5.4);
    });

    it('wins over an active forced move, which resumes after landing', () => {
      const p = makePlayer();
      settle(p);
      const from = feetOf(p);
      p.setForcedMove({ x: 1, z: 0, speed: 4 }); // knockback along +X
      const h = p.leap({ yaw: 0, distance: 6, apex: 1.5 })!;
      runUntil(p, () => !h.active);
      expect(h.landed).toBe(true);
      const landed = feetOf(p);
      expect(Math.abs(landed.x - from.x)).toBeLessThan(0.1);
      expect(from.z - landed.z).toBeGreaterThan(5.4);
      for (let i = 0; i < 15; i++) tick(p);
      expect(feetOf(p).x - landed.x).toBeGreaterThan(0.8);
    });

    it('a forced move set mid-leap resumes after the leap ends', () => {
      const p = makePlayer();
      settle(p);
      const h = p.leap({ yaw: 0, distance: 6, apex: 1.5 })!;
      for (let i = 0; i < 4; i++) tick(p);
      p.setForcedMove({ x: 1, z: 0, speed: 4 });
      const x0 = feetOf(p).x;
      runUntil(p, () => !h.active);
      expect(Math.abs(feetOf(p).x - x0)).toBeLessThan(0.1);
      for (let i = 0; i < 15; i++) tick(p);
      expect(feetOf(p).x - x0).toBeGreaterThan(0.8);
    });

    it('lockMove, speedScale and movementLocked do not affect the leap', () => {
      mod.lockMove = true;
      mod.speedScale = 0;
      const p = makePlayer({ movementLocked: () => true });
      settle(p);
      const from = feetOf(p);
      const h = p.leap({ yaw: 0, distance: 6, apex: 1.5 })!;
      runUntil(p, () => !h.active);
      expect(h.landed).toBe(true);
      expect(from.z - feetOf(p).z).toBeGreaterThan(5.4);
    });

    it('ignores movement input mid-leap', () => {
      const p = makePlayer();
      settle(p);
      const from = feetOf(p);
      const h = p.leap({ yaw: 0, distance: 6, apex: 1.5 })!;
      let n = 0;
      while (h.active && n++ < 200) tick(p, 1, 0);
      expect(Math.abs(feetOf(p).x - from.x)).toBeLessThan(0.05);
    });
  });

  it('launch speed matches the ballistic formula (first tick only)', () => {
    const p = makePlayer();
    settle(p);
    p.leap({ yaw: 0, distance: 5, apex: 1.2 });
    const y0 = feetOf(p).y;
    tick(p);
    const rise = feetOf(p).y - y0;
    const v = Math.sqrt(2 * PLAYER.gravity * 1.2);
    expect(rise).toBeGreaterThan(0.8 * v * (1 / 60));
    expect(rise).toBeLessThan(1.1 * v * (1 / 60));
  });
});
