// K7's glide against the real Player and CharacterController (K0's hooks only) over the real Dragonspine heightfield:
// the chasm lane on its thermal, a slope-wind lane, letting go over the chasm into the catch, and no fall damage.
import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import { MoveModifiers, type MoveModifier } from '../../core/MoveModifiers';
import type { Vec3Like } from '../../core/events';
import { Player } from '../../characters/Player';
import type { InputSnapshot } from '../../input/InputManager';
import type { GlideEndReason, MovementMode } from '../../movement/types';
import { PhysicsWorld } from '../../physics/PhysicsWorld';
import { heightAt } from '../../terrain/heightfield';
import { GlidePlayer } from './GlidePlayer';
import { GLIDE_LANES, fallbackStand, inLanding, type GlideLane } from './lanes';

const IDLE: InputSnapshot = { moveRight: 0, moveForward: 0, sprint: false, jump: false, attack: 0 };
const lane = (id: string): GlideLane => GLIDE_LANES.find((l) => l.site.id === id)!;

let physics: PhysicsWorld;
beforeEach(async () => {
  physics = new PhysicsWorld();
  await physics.init();
});

/** The real heightfield as a collider over the lane's catch box (about 2.5 m cells). */
function world(l: GlideLane) {
  const b = l.site.catchBox;
  const size = Math.max(b.x1 - b.x0, b.z1 - b.z0);
  const cx = (b.x0 + b.x1) / 2;
  const cz = (b.z0 + b.z1) / 2;
  const cells = Math.ceil(size / 2.5);
  const stride = cells + 1;
  const heights = new Float32Array(stride * stride);
  const step = size / cells;
  for (let col = 0; col <= cells; col++) {
    const x = cx - size / 2 + col * step;
    for (let row = 0; row <= cells; row++) heights[row + col * stride] = heightAt(x, cz - size / 2 + row * step);
  }
  physics.addHeightfield({ nrows: cells, ncols: cells, heights, scale: { x: size, y: 1, z: size }, center: { x: cx, y: 0, z: cz } });
  const stand = fallbackStand(l.site, heightAt);
  const mods = new MoveModifiers();
  const player = new Player(new THREE.Scene(), physics, { ...stand, y: stand.y + 0.1 }, { moveModifier: () => mods.state() });
  const feet = () => player.controller.interpolatedFeet(1, { x: 0, y: 0, z: 0 });
  const s = { mode: 'walk' as MovementMode, ended: [] as GlideEndReason[], landedAt: null as Vec3Like | null, fades: 0 };
  let glide!: GlidePlayer;
  glide = new GlidePlayer({
    feet,
    grounded: () => player.controller.grounded,
    groundAt: (x, z, fromY) => physics.raycast({ x, y: fromY, z }, { x: 0, y: -1, z: 0 }, 2000, player.controller.collider)?.point.y ?? heightAt(x, z),
    launch: (vy) => player.controller.launch(vy),
    setControllerMode: (m, sinkRate) => player.controller.setMoveMode(m, { sinkRate }),
    setForcedMove: (m) => player.setForcedMove(m),
    steer: () => 0,
    addModifier: (src: string, m: MoveModifier) => mods.add(src, m),
    movementMode: () => s.mode,
    setMovementMode: (m) => (s.mode = m),
    teleport: (p: Vec3Like) => {
      glide.expect(p);
      player.controller.teleport(p);
    },
    fade: () => s.fades++,
    isOpen: () => true,
    stand: () => stand,
    busy: () => false,
    dead: () => false,
    mounted: () => false,
    dismount: () => {},
    emit: ((type: string, p: { reason?: GlideEndReason; at?: Vec3Like }) => {
      if (type === 'glide.ended') s.ended.push(p.reason!);
      if (type === 'glide.landed') s.landedAt = p.at!;
    }) as never,
    toast: () => {},
  });
  const tick = () => {
    glide.fixedUpdate(1 / 60);
    player.fixedUpdate(IDLE, 0, 0);
    physics.step();
    player.postStep();
  };
  for (let i = 0; i < 30; i++) tick();
  return { player, glide, s, feet, tick, stand };
}

describe('the real controller on the real Dragonspine', () => {
  it.each(['summit-aerie', 'rime-pass-lodge'])('%s: launches, flies the lane and lands in the landing area', (id) => {
    const l = lane(id);
    const w = world(l);
    expect(w.glide.launch(id)).toBeNull();
    let ticks = 0;
    let minAbove = Infinity;
    while (w.glide.state !== 'idle' && ticks < 60 * 300) {
      w.tick();
      ticks++;
      if (w.glide.state === 'gliding' && ticks > 60 * 10 && !inLanding(l, w.feet().x, w.feet().z)) minAbove = Math.min(minAbove, w.glide.heightAboveGround);
    }
    expect(w.s.ended).toEqual(['landed']);
    expect(w.s.landedAt).not.toBeNull();
    expect(inLanding(l, w.s.landedAt!.x, w.s.landedAt!.z)).toBe(true);
    expect(minAbove).toBeGreaterThan(3);
    expect(w.player.controller.moveMode).toBe('walk');
    expect(w.s.mode).toBe('walk');
    expect(w.glide.catchArmed).toBe(false);
  });

  it('letting go over the Frostfang chasm falls into the catch and returns the player to the ledge', () => {
    const l = lane('summit-aerie');
    const w = world(l);
    w.glide.launch('summit-aerie');
    // Out over the chasm (about 300 m of air under the glider).
    for (let i = 0; i < 60 * 25; i++) w.tick();
    expect(w.glide.state).toBe('gliding');
    expect(w.glide.heightAboveGround).toBeGreaterThan(100);
    w.glide.letGo();
    for (let i = 0; i < 60 * 20 && (w.glide.catchArmed || w.s.fades < 2); i++) w.tick();
    expect(w.s.ended).toEqual(['cancelled']);
    expect(w.s.fades).toBe(2);
    const f = w.feet();
    expect(Math.hypot(f.x - w.stand.x, f.z - w.stand.z)).toBeLessThan(1);
    expect(w.glide.catchArmed).toBe(false);
  });
});

describe('land regression: with the glide idle, movement is the shipped one', () => {
  it('walk 4.5 and sprint 7.5 m/s, a jump leaves the ground, the controller stays in walk', () => {
    const size = 128;
    const cells = 64;
    physics.addHeightfield({ nrows: cells, ncols: cells, heights: new Float32Array((cells + 1) * (cells + 1)), scale: { x: size, y: 1, z: size }, center: { x: 0, y: 0, z: 0 } });
    const mods = new MoveModifiers();
    const player = new Player(new THREE.Scene(), physics, { x: 0, y: 0.1, z: 0 }, { moveModifier: () => mods.state() });
    const feet = () => player.controller.interpolatedFeet(1, { x: 0, y: 0, z: 0 });
    const glide = new GlidePlayer({
      feet,
      grounded: () => player.controller.grounded,
      groundAt: () => 0,
      launch: (vy) => player.controller.launch(vy),
      setControllerMode: (m, sinkRate) => player.controller.setMoveMode(m, { sinkRate }),
      setForcedMove: (m) => player.setForcedMove(m),
      steer: () => 1,
      addModifier: (src: string, m: MoveModifier) => mods.add(src, m),
      movementMode: () => 'walk',
      setMovementMode: () => {},
      teleport: () => {},
      fade: () => {},
      isOpen: () => true,
      stand: () => ({ x: 0, y: 0, z: 0 }),
      busy: () => false,
      dead: () => false,
      mounted: () => false,
      dismount: () => {},
      emit: () => {},
      toast: () => {},
    });
    const tick = (input: InputSnapshot, mx: number, mz: number) => {
      glide.fixedUpdate(1 / 60);
      player.fixedUpdate(input, mx, mz);
      physics.step();
      player.postStep();
    };
    const speed = (input: InputSnapshot, mx: number) => {
      const a = feet();
      for (let i = 0; i < 60; i++) tick(input, mx, 0);
      const b = feet();
      return Math.hypot(b.x - a.x, b.z - a.z);
    };
    physics.step();
    for (let i = 0; i < 30; i++) tick(IDLE, 0, 0);
    expect(speed(IDLE, 1)).toBeCloseTo(4.5, 1);
    expect(speed({ ...IDLE, sprint: true }, -1)).toBeCloseTo(7.5, 1);
    tick({ ...IDLE, jump: true }, 0, 0);
    for (let i = 0; i < 12; i++) tick(IDLE, 0, 0);
    expect(player.controller.grounded).toBe(false);
    expect(player.controller.moveMode).toBe('walk');
    expect(glide.state).toBe('idle');
  });
});

describe('a flat launch stand (K4 platforms): the run-up, not an instant landing', () => {
  it('with no drop ahead the launch runs up and is cancelled after the timeout, never landed', () => {
    const size = 128;
    const cells = 64;
    physics.addHeightfield({ nrows: cells, ncols: cells, heights: new Float32Array((cells + 1) * (cells + 1)), scale: { x: size, y: 1, z: size }, center: { x: 0, y: 0, z: 0 } });
    const mods = new MoveModifiers();
    const player = new Player(new THREE.Scene(), physics, { x: 0, y: 0.1, z: 30 }, { moveModifier: () => mods.state() });
    const ended: string[] = [];
    const flat: GlideLane = { ...lane('hearth-updraft'), wind: 0, site: { ...lane('hearth-updraft').site, ledge: { x: 0, y: 0, z: 30 }, catchBox: { x0: -64, z0: -64, x1: 64, z1: 64 } } };
    const glide: GlidePlayer = new GlidePlayer(
      {
        feet: () => player.controller.interpolatedFeet(1, { x: 0, y: 0, z: 0 }),
        grounded: () => player.controller.grounded,
        groundAt: () => 0,
        launch: (vy) => player.controller.launch(vy),
        setControllerMode: (m, sinkRate) => player.controller.setMoveMode(m, { sinkRate }),
        setForcedMove: (m) => player.setForcedMove(m),
        steer: () => 0,
        addModifier: (src: string, m: MoveModifier) => mods.add(src, m),
        movementMode: () => 'walk',
        setMovementMode: () => {},
        teleport: (p: Vec3Like) => {
          glide.expect(p);
          player.controller.teleport(p);
        },
        fade: () => {},
        isOpen: () => true,
        stand: () => ({ x: 0, y: 0.05, z: 30 }),
        busy: () => false,
        dead: () => false,
        mounted: () => false,
        dismount: () => {},
        emit: ((type: string, p: { reason: string }) => type === 'glide.ended' && ended.push(p.reason)) as never,
        toast: () => {},
      },
      [flat],
    );
    physics.step();
    for (let i = 0; i < 30; i++) {
      player.fixedUpdate(IDLE, 0, 0);
      physics.step();
      player.postStep();
    }
    expect(glide.launch('hearth-updraft')).toBeNull();
    for (let i = 0; i < 60 * 3 && glide.state !== 'idle'; i++) {
      glide.fixedUpdate(1 / 60);
      player.fixedUpdate(IDLE, 0, 0);
      physics.step();
      player.postStep();
    }
    expect(ended).toEqual(['cancelled']);
    expect(player.controller.moveMode).toBe('walk');
  });
});
