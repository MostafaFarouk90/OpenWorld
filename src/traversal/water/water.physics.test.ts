// K7's water against the real Player and CharacterController (K0's hooks only): wading speeds, the land regression,
// and a whole dive in a pit pool: falling in, holding depth, swimming, the head-out line and the climb out at the rim.
import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import { MoveModifiers, type MoveModifier } from '../../core/MoveModifiers';
import type { Vec3Like } from '../../core/events';
import { Player } from '../../characters/Player';
import { PLAYER } from '../../config/constants';
import type { InputSnapshot } from '../../input/InputManager';
import type { MovementMode } from '../../movement/types';
import { PhysicsWorld } from '../../physics/PhysicsWorld';
import { DIVE_RULES } from '../dive/types';
import { ledgeProbe } from './ledge';
import { wadeScale, WaterPlayer } from './WaterPlayer';
import { WaterVolumes } from './WaterVolumes';

const DT = 1 / 60;
const IDLE: InputSnapshot = { moveRight: 0, moveForward: 0, sprint: false, jump: false, attack: 0 };

let physics: PhysicsWorld;
beforeEach(async () => {
  physics = new PhysicsWorld();
  await physics.init();
});

/** Ground at 0 with a 6 m pit at x 10..20, z -5..5 (1 m cells); a dive volume over the pit, a wade strip at x -40..-10. */
function world(opts: { wadeFloor?: number } = {}) {
  const size = 128;
  const cells = 128;
  const stride = cells + 1;
  const heights = new Float32Array(stride * stride);
  for (let col = 0; col <= cells; col++) {
    const x = -size / 2 + col;
    for (let row = 0; row <= cells; row++) {
      const z = -size / 2 + row;
      heights[row + col * stride] = x >= 10 && x <= 20 && z >= -5 && z <= 5 ? -6 : x >= -40 && x <= -10 ? (opts.wadeFloor ?? -0.8) : 0;
    }
  }
  physics.addHeightfield({ nrows: cells, ncols: cells, heights, scale: { x: size, y: 1, z: size }, center: { x: 0, y: 0, z: 0 } });
  const mods = new MoveModifiers();
  const player = new Player(new THREE.Scene(), physics, { x: 0, y: 0.1, z: 0 }, { moveModifier: () => mods.state() });
  const volumes = new WaterVolumes({
    groundAt: (x, z, fromY) => physics.raycast({ x, y: fromY, z }, { x: 0, y: -1, z: 0 }, 80, player.controller.collider)?.point.y ?? 0,
    flags: { getFlag: () => undefined },
  });
  volumes.register({ id: 'water.t.wade', kind: 'wade', surfaceY: 0, area: { box: { x0: -40, z0: -60, x1: -10, z1: 60 } } });
  volumes.register({ id: 'water.t.pool', kind: 'dive', surfaceY: -0.3, area: { box: { x0: 9, z0: -6, x1: 21, z1: 6 } } });
  volumes.registerRoute({
    id: 'dive.t.pool',
    volumeId: 'water.t.pool',
    points: [{ x: 11, y: -2, z: 0 }, { x: 15, y: -5.5, z: 0 }, { x: 11, y: -2, z: 0 }],
    airPockets: [],
    entryStand: { x: 8, y: 0, z: 0 },
  } as never);
  const s = { rise: false, sink: false, moving: false, mode: 'walk' as MovementMode, boots: false };
  const feet = () => player.controller.interpolatedFeet(1, { x: 0, y: 0, z: 0 });
  let water!: WaterPlayer;
  water = new WaterPlayer(volumes, {
    feet,
    yaw: () => player.facingYaw,
    grounded: () => player.controller.grounded,
    teleport: (p: Vec3Like) => {
      water.expect(p);
      player.controller.teleport(p);
    },
    setControllerMode: (m) => player.controller.setMoveMode(m),
    setVerticalIntent: (v) => player.setVerticalIntent(v),
    addModifier: (src: string, m: MoveModifier) => mods.add(src, m),
    movementMode: () => s.mode,
    setMovementMode: (m) => (s.mode = m),
    emit: () => {},
    toast: () => {},
    fade: () => {},
    rise: () => s.rise,
    sink: () => s.sink,
    moving: () => s.moving,
    mounted: () => false,
    fenBoots: () => s.boots,
    hurtNonLethal: () => {},
    probeLedge: ledgeProbe(physics, () => player.controller.collider),
    warn: () => {},
  });
  /** One fixed tick: water first (the intent phase), then the player and the physics step. */
  const tick = (input: InputSnapshot = IDLE, moveX = 0, moveZ = 0) => {
    s.moving = moveX !== 0 || moveZ !== 0;
    water.fixedUpdate(DT);
    player.fixedUpdate(input, moveX, moveZ);
    physics.step();
    player.postStep();
  };
  const run = (sec: number, input?: InputSnapshot, mx = 0, mz = 0) => {
    for (let i = 0; i < Math.round(sec * 60); i++) tick(input, mx, mz);
  };
  physics.step();
  return { player, water, volumes, s, feet, tick, run };
}

/** Horizontal speed over `sec` seconds of a held move. */
function speedOver(w: ReturnType<typeof world>, sec: number, input: InputSnapshot, mx: number, mz: number): number {
  const a = w.feet();
  w.run(sec, input, mx, mz);
  const b = w.feet();
  return Math.hypot(b.x - a.x, b.z - a.z) / sec;
}

describe('land regression: with the water system running and no water near, movement is the shipped one', () => {
  it('walk 4.5 and sprint 7.5 m/s, a jump leaves the ground, no mode and no modifier', () => {
    const w = world();
    w.player.controller.teleport({ x: 0, y: 0.1, z: 40 });
    w.run(0.5);
    expect(speedOver(w, 1, IDLE, 1, 0)).toBeCloseTo(PLAYER.walkSpeed, 1);
    expect(speedOver(w, 1, { ...IDLE, sprint: true }, -1, 0)).toBeCloseTo(PLAYER.sprintSpeed, 1);
    w.tick({ ...IDLE, jump: true });
    w.run(0.2);
    expect(w.player.controller.grounded).toBe(false);
    expect(w.player.controller.moveMode).toBe('walk');
    expect(w.s.mode).toBe('walk');
    expect(w.water.state).toBe('dry');
  });
});

describe('wading on the real controller', () => {
  it('2.48 m/s, sprint held or not; 3.49 m/s with the Fen Boots', () => {
    const w = world();
    w.player.controller.teleport({ x: -25, y: -0.7, z: -40 });
    w.run(0.5);
    expect(w.water.state).toBe('wading');
    expect(speedOver(w, 2, { ...IDLE, sprint: true }, 0, 1)).toBeCloseTo(4.5 * wadeScale(false), 1);
    expect(speedOver(w, 2, IDLE, 0, 1)).toBeCloseTo(4.5 * wadeScale(false), 1);
    w.s.boots = true;
    w.run(0.1, IDLE, 0, -1);
    expect(speedOver(w, 2, { ...IDLE, sprint: true }, 0, -1)).toBeCloseTo(4.5 * wadeScale(true), 1);
  });
});

describe('a dive in a pit pool on the real controller', () => {
  it('falls in, swims at 2 m/s, holds depth, sinks, rises to the head-out line, and climbs out at the rim', () => {
    const w = world();
    w.player.controller.teleport({ x: 8, y: 0.1, z: 0 });
    w.run(0.3);
    // Walk east over the rim and drop in.
    for (let i = 0; i < 240 && w.water.state !== 'diving'; i++) w.tick(IDLE, 1, 0);
    expect(w.water.state).toBe('diving');
    expect(w.player.controller.moveMode).toBe('swim');
    expect(w.s.mode).toBe('dive');
    // Hold still: no drift.
    const y0 = w.feet().y;
    w.run(2);
    expect(Math.abs(w.feet().y - y0)).toBeLessThan(0.01);
    // Sink to the floor (feet stop on it), then swim along it at 2 m/s.
    w.s.sink = true;
    w.run(3);
    w.s.sink = false;
    expect(w.feet().y).toBeGreaterThan(-6.05);
    expect(w.feet().y).toBeLessThan(-5.5);
    const v = speedOver(w, 1, { ...IDLE, sprint: true }, 0, 1);
    expect(v).toBeCloseTo(2, 1);
    // Rise to the head-out line and hold there.
    w.s.rise = true;
    w.run(4);
    expect(w.feet().y).toBeCloseTo(-0.3 - DIVE_RULES.headOutDepth, 1);
    w.s.rise = false;
    expect(w.water.breath).toBe(30);
    // Swim west into the pit wall: blocked, then the climb onto the rim.
    for (let i = 0; i < 600 && w.water.state === 'diving'; i++) {
      w.tick(IDLE, -1, 0);
    }
    expect(w.water.state).not.toBe('diving');
    expect(w.player.controller.moveMode).toBe('walk');
    expect(w.feet().y).toBeGreaterThan(-0.1);
    expect(w.feet().x).toBeLessThan(9.4);
    expect(w.s.mode).toBe('walk');
    w.run(0.5);
    expect(w.player.controller.grounded).toBe(true);
  });

  it('drowning on the real controller ends dry at the entry stand, on foot', () => {
    const w = world();
    w.player.controller.teleport({ x: 15, y: -4, z: 0 });
    w.run(0.2);
    expect(w.water.state).toBe('diving');
    w.run(31);
    w.run(1);
    const f = w.feet();
    expect(f.x).toBeCloseTo(8, 1);
    expect(w.water.state).toBe('dry');
    expect(w.player.controller.moveMode).toBe('walk');
    w.run(0.5);
    expect(w.player.controller.grounded).toBe(true);
  });
});
