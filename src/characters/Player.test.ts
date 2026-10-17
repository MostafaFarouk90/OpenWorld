import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import type { InputSnapshot } from '../input/InputManager';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { Player } from './Player';
import { flatGround } from '../physics/flatGround';

const NO_INPUT: InputSnapshot = { moveRight: 0, moveForward: 0, sprint: false, jump: false, attack: 0 };
const DT = 1 / 60;

let physics: PhysicsWorld;
let scene: THREE.Scene;

beforeEach(async () => {
  physics = new PhysicsWorld();
  await physics.init();
  scene = new THREE.Scene();
});

function addGround(): void {
  physics.addHeightfield(flatGround(200));
}

function tick(player: Player, moveX = 0, moveZ = 0, input: InputSnapshot = NO_INPUT): void {
  player.fixedUpdate(input, moveX, moveZ);
  physics.step();
  player.postStep();
}

describe('Player', () => {
  it('adds its mesh to the scene', () => {
    addGround();
    const player = new Player(scene, physics, { x: 0, y: 0, z: 0 });
    expect(scene.children).toContain(player.mesh);
  });

  describe('kill plane', () => {
    it('respawns at the spawn point after falling below y = -50', () => {
      const spawn = { x: 3, y: 0, z: 2 };
      const player = new Player(scene, physics, spawn); // no ground at all
      let respawned = false;
      let ticks = 0;
      for (let i = 0; i < 400 && !respawned; i++) {
        const before = player.controller.body.translation().y;
        tick(player);
        const after = player.controller.body.translation().y;
        ticks++;
        if (after > before) respawned = true;
      }
      expect(respawned).toBe(true);
      // Falling 50 m at terminal speed (40 m/s) takes well over a second.
      expect(ticks).toBeGreaterThan(60);
      player.render(1, DT);
      expect(player.feet.x).toBeCloseTo(spawn.x, 3);
      expect(player.feet.z).toBeCloseTo(spawn.z, 3);
      expect(player.feet.y).toBeGreaterThan(-1);
      expect(player.controller.grounded).toBe(false);
    });

    it('does not respawn while above the kill plane', () => {
      const player = new Player(scene, physics, { x: 0, y: 100, z: 0 });
      for (let i = 0; i < 60; i++) tick(player);
      const t = player.controller.body.translation();
      expect(t.y).toBeLessThan(100);
      expect(t.y).toBeGreaterThan(-50);
    });

    it('postStep respawns immediately when the body is below the plane', () => {
      addGround();
      const spawn = { x: 1, y: 0, z: 1 };
      const player = new Player(scene, physics, spawn);
      player.controller.body.setTranslation({ x: 20, y: -60, z: 20 }, true);
      player.postStep();
      const t = player.controller.body.translation();
      expect(t.x).toBeCloseTo(1, 5);
      expect(t.z).toBeCloseTo(1, 5);
      expect(t.y).toBeGreaterThan(0);
    });

    it('postStep leaves a body above the plane alone', () => {
      addGround();
      const player = new Player(scene, physics, { x: 1, y: 0, z: 1 });
      player.controller.body.setTranslation({ x: 20, y: -49, z: 20 }, true);
      player.postStep();
      expect(player.controller.body.translation().x).toBeCloseTo(20, 5);
    });
  });

  describe('facing', () => {
    it('leaves the mesh orientation unchanged on idle ticks', () => {
      addGround();
      const player = new Player(scene, physics, { x: 0, y: 0, z: 0 });
      const before = player.mesh.quaternion.clone();
      for (let i = 0; i < 30; i++) {
        tick(player);
        player.render(1, DT);
      }
      expect(player.mesh.quaternion.angleTo(before)).toBeLessThan(1e-6);
    });

    it('turns towards +X when moving along +X', () => {
      addGround();
      const player = new Player(scene, physics, { x: 0, y: 0, z: 0 });
      for (let i = 0; i < 30; i++) {
        tick(player);
        player.render(1, DT);
      }
      for (let i = 0; i < 30; i++) {
        tick(player, 1, 0);
        player.render(1, DT);
      }
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(player.mesh.quaternion);
      expect(forward.x).toBeGreaterThan(0.95);
      expect(Math.abs(forward.z)).toBeLessThan(0.2);
    });

    it('rotates gradually rather than snapping in a single render', () => {
      addGround();
      const player = new Player(scene, physics, { x: 0, y: 0, z: 0 });
      tick(player, 1, 0);
      player.render(1, DT);
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(player.mesh.quaternion);
      expect(forward.x).toBeGreaterThan(0);
      expect(forward.x).toBeLessThan(0.9);
    });

    it('keeps its heading after movement stops', () => {
      addGround();
      const player = new Player(scene, physics, { x: 0, y: 0, z: 0 });
      for (let i = 0; i < 40; i++) {
        tick(player, 1, 0);
        player.render(1, DT);
      }
      const heading = player.mesh.quaternion.clone();
      for (let i = 0; i < 40; i++) {
        tick(player);
        player.render(1, DT);
      }
      expect(player.mesh.quaternion.angleTo(heading)).toBeLessThan(1e-3);
    });

    it('turns towards +Z (backwards) when moving along +Z', () => {
      addGround();
      const player = new Player(scene, physics, { x: 0, y: 0, z: 0 });
      for (let i = 0; i < 60; i++) {
        tick(player, 0, 1);
        player.render(1, DT);
      }
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(player.mesh.quaternion);
      expect(forward.z).toBeGreaterThan(0.95);
    });
  });

  describe('render', () => {
    it('positions the mesh at the interpolated feet', () => {
      addGround();
      const player = new Player(scene, physics, { x: 0, y: 0, z: 0 });
      for (let i = 0; i < 30; i++) tick(player);
      tick(player, 1, 0);
      const expected = (alpha: number) => player.controller.interpolatedFeet(alpha, new THREE.Vector3());
      for (const alpha of [0, 0.25, 0.5, 1]) {
        player.render(alpha, DT);
        const e = expected(alpha);
        expect(player.mesh.position.distanceTo(e)).toBeLessThan(1e-6);
        expect(player.feet.distanceTo(e)).toBeLessThan(1e-6);
      }
    });

    it('moves the mesh with the player as it walks', () => {
      addGround();
      const player = new Player(scene, physics, { x: 0, y: 0, z: 0 });
      for (let i = 0; i < 30; i++) tick(player);
      player.render(1, DT);
      const x0 = player.mesh.position.x;
      for (let i = 0; i < 60; i++) tick(player, 1, 0);
      player.render(1, DT);
      expect(player.mesh.position.x - x0).toBeGreaterThan(4);
    });
  });

  describe('input forwarding', () => {
    it('passes jump and sprint from the snapshot to the controller', () => {
      addGround();
      const player = new Player(scene, physics, { x: 0, y: 0, z: 0 });
      for (let i = 0; i < 30; i++) tick(player);
      player.render(1, DT);
      const y0 = player.feet.y;
      tick(player, 0, 0, { ...NO_INPUT, jump: true });
      for (let i = 0; i < 3; i++) tick(player);
      player.render(1, DT);
      expect(player.feet.y).toBeGreaterThan(y0 + 0.1);

      const runner = new Player(new THREE.Scene(), physics, { x: 30, y: 0, z: 0 });
      const walker = new Player(new THREE.Scene(), physics, { x: -30, y: 0, z: 0 });
      for (let i = 0; i < 30; i++) {
        runner.fixedUpdate({ ...NO_INPUT, sprint: true }, 0, -1);
        walker.fixedUpdate(NO_INPUT, 0, -1);
        physics.step();
      }
      runner.render(1, DT);
      walker.render(1, DT);
      expect(Math.abs(runner.feet.z)).toBeGreaterThan(Math.abs(walker.feet.z) + 0.5);
    });
  });
});
