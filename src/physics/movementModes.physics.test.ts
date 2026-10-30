// v0.7 movement-mode hook (K0 Step 0 spike): water, swim, glide and containment against the real CharacterController. Numbers
// are printed (SPIKE lines) and folded into plans/act3-k0-spike.md; the asserts are the properties K7 relies on.
import * as THREE from 'three';
import type RAPIER_API from '@dimforge/rapier3d';
import { beforeEach, describe, expect, it } from 'vitest';
import { CAMERA, CHARACTER_CONTROLLER, PLAYER } from '../config/constants';
import { CharacterController, type MoveIntent } from './CharacterController';
import { PhysicsWorld, type Vec3 } from './PhysicsWorld';
import { heightAt } from '../terrain/heightfield';
import { Containment } from '../region/containment';
import { ThirdPersonCamera } from '../rendering/ThirdPersonCamera';
import type { InputManager } from '../input/InputManager';

const IDLE: MoveIntent = { moveX: 0, moveZ: 0, sprint: false, jump: false };
const I = (p: Partial<MoveIntent>): MoveIntent => ({ ...IDLE, ...p });
const log = (..._a: unknown[]): void => {};
const DT = 1 / 60;
const G = PLAYER.gravity;

let physics: PhysicsWorld;
beforeEach(async () => {
  physics = new PhysicsWorld();
  await physics.init();
});

/** A heightfield of edge `size` with `cells` cells per edge sampled from `h`, in TerrainColliders' layout. */
function field(h: (x: number, z: number) => number, cx: number, cz: number, size: number, cells: number): RAPIER_API.Collider {
  const stride = cells + 1;
  const heights = new Float32Array(stride * stride);
  const step = size / cells;
  for (let col = 0; col <= cells; col++) {
    const x = cx - size / 2 + col * step;
    for (let row = 0; row <= cells; row++) heights[row + col * stride] = h(x, cz - size / 2 + row * step);
  }
  return physics.addHeightfield({ nrows: cells, ncols: cells, heights, scale: { x: size, y: 1, z: size }, center: { x: cx, y: 0, z: cz } });
}
const feetOf = (c: CharacterController): Vec3 => c.interpolatedFeet(1, { x: 0, y: 0, z: 0 });
/** Feet height above the collider surface under them (negative: the feet are inside the ground). */
const clearance = (c: CharacterController, f: Vec3 = feetOf(c)): number => {
  const hit = physics.raycast({ x: f.x, y: f.y + 3, z: f.z }, { x: 0, y: -1, z: 0 }, 50, c.collider);
  return hit ? f.y - hit.point.y : Infinity;
};
const tick = (c: CharacterController, i: MoveIntent = IDLE) => {
  c.fixedUpdate(i);
  physics.step();
};

describe('far coordinates: walking real terrain at the Act 3 points (stall survey)', () => {
  it.each([
    ['dragonspine far corner', 16500, 16500],
    ['summit high point (504 m today)', 15400, 15900],
    ['greyfen west edge', -400, 15400],
    ['origin ring (control)', 400, 0],
  ])('%s', (name, bx, bz) => {
    field(heightAt, bx, bz, 400, 256);
    physics.step();
    let stalls = 0;
    let walkableTicks = 0;
    let minClear = Infinity;
    const dirs = 24;
    for (let d = 0; d < dirs; d++) {
      const a = (d / dirs) * Math.PI * 2;
      const c = new CharacterController(physics, { x: bx, y: heightAt(bx, bz) + 0.5, z: bz });
      for (let k = 0; k < 40; k++) tick(c);
      let prev = feetOf(c);
      for (let k = 0; k < 300; k++) {
        tick(c, I({ moveX: Math.cos(a), moveZ: Math.sin(a) }));
        const f = feetOf(c);
        const g = Math.hypot(heightAt(f.x + 1, f.z) - heightAt(f.x - 1, f.z), heightAt(f.x, f.z + 1) - heightAt(f.x, f.z - 1)) / 2;
        const deg = (Math.atan(g) * 180) / Math.PI;
        if (c.grounded && deg < 30) {
          walkableTicks++;
          if (Math.hypot(f.x - prev.x, f.z - prev.z) < (PLAYER.walkSpeed * DT) * 0.5) stalls++;
        }
        minClear = Math.min(minClear, clearance(c, f));
        prev = f;
        if (Math.hypot(f.x - bx, f.z - bz) > 180) break;
      }
      c.dispose();
    }
    log(`walk ${name}: walkable grounded ticks ${walkableTicks}, stalls ${stalls}, min feet clearance ${minClear.toFixed(3)} m`);
    expect(minClear).toBeGreaterThan(-0.1);
  });
});

// ---- Water ------------------------------------------------------------------------------------------------------
// A pool: wading shelf z > 0 (floor 0, surface 0.8), a dive pit z -40..0 (floor -6), an exit ledge at z < -40 whose
// top is 0.5 m above the surface, and a 20 degree beach at x > 30 inside the pit.
const SURFACE = 0.8;
const HEAD_OUT = 1.4; // swimming at the surface: feet this far under it, head and shoulders out
function poolHeight(x: number, z: number): number {
  if (z > 0) return 0;
  if (z < -40) return SURFACE + 0.5;
  if (x > 30) return Math.min(0, -6 + (x - 30) * Math.tan((20 * Math.PI) / 180));
  return -6;
}
const depthAt = (f: Vec3) => SURFACE - f.y;
/** The K7 swim rule this spike assumes: never above the head-out line, 2 m/s. */
const swimV = (f: Vec3, want: number) => Math.min(want, (SURFACE - HEAD_OUT - f.y) / DT);

describe('water prototype', () => {
  beforeEach(() => {
    field(poolHeight, 0, 0, 160, 256);
    physics.step();
  });

  it('wading: speed x 0.55 through the existing speedOverride hook', () => {
    const c = new CharacterController(physics, { x: -20, y: 0, z: 10 });
    for (let k = 0; k < 30; k++) tick(c);
    const a = feetOf(c);
    for (let k = 0; k < 120; k++) {
      const d = depthAt(feetOf(c));
      const wading = d >= 0.4 && d <= 1.2;
      tick(c, I({ moveX: 1, sprint: true, speedOverride: wading ? PLAYER.walkSpeed * 0.55 : undefined }));
    }
    const b = feetOf(c);
    const v = (b.x - a.x) / 2;
    log(`wade: ${v.toFixed(3)} m/s (sprint held; want ${(PLAYER.walkSpeed * 0.55).toFixed(3)}), grounded ${c.grounded}`);
    expect(v).toBeCloseTo(PLAYER.walkSpeed * 0.55, 1);
  });

  it('dive: swim mode (hook) holds depth, stops on the floor, slides on walls, climbs out at a ledge and up a beach', () => {
    const c = new CharacterController(physics, { x: 0, y: 0, z: 2 });
    for (let k = 0; k < 30; k++) tick(c);
    // Walk off the shelf into the pit; switch to swim when the head goes under (depth > 1.7 m).
    let k = 0;
    for (; k < 240 && c.moveMode === 'walk'; k++) {
      tick(c, I({ moveZ: -1 }));
      if (depthAt(feetOf(c)) > 1.7) c.setMoveMode('swim');
    }
    expect(c.moveMode).toBe('swim');
    // Hold still for 10 s: drift.
    const s = feetOf(c);
    let drift = 0;
    for (let i = 0; i < 600; i++) {
      tick(c, I({ verticalSpeed: 0 }));
      const f = feetOf(c);
      drift = Math.max(drift, Math.hypot(f.x - s.x, f.y - s.y, f.z - s.z));
    }
    // Swim down into the floor for 5 s at 2 m/s.
    let minY = Infinity;
    for (let i = 0; i < 300; i++) {
      tick(c, I({ moveZ: -0.3, speedOverride: 2, verticalSpeed: -2 }));
      minY = Math.min(minY, feetOf(c).y);
    }
    const floorGrounded = c.grounded;
    // Swim along the floor 3 s, then into the pit's +z wall (the shelf face) 2 s.
    const along0 = feetOf(c);
    for (let i = 0; i < 180; i++) tick(c, I({ moveX: -1, speedOverride: 2, verticalSpeed: -0.5 }));
    const along = (feetOf(c).x - along0.x) / 3;
    for (let i = 0; i < 120; i++) tick(c, I({ moveZ: 1, speedOverride: 2, verticalSpeed: 0 }));
    const wall = c.wallContact();
    // Up to the surface (capped at the head-out line), then to the exit ledge at z -40.
    for (let i = 0; i < 300; i++) tick(c, I({ verticalSpeed: swimV(feetOf(c), 2) }));
    const surfY = feetOf(c).y;
    // Swim at the surface towards the exit ledge until blocked for 3 ticks (wallContact() alone is not enough: see report).
    let wallHit: { normal: Vec3 } | null = null;
    let blocked = 0;
    let wallReported = false;
    let prevF = feetOf(c);
    for (let i = 0; i < 1500 && blocked < 3; i++) {
      tick(c, I({ moveZ: -1, speedOverride: 2, verticalSpeed: swimV(feetOf(c), 0) }));
      const f = feetOf(c);
      blocked = Math.hypot(f.x - prevF.x, f.z - prevF.z) < 2 * DT * 0.5 ? blocked + 1 : 0;
      if (c.wallContact()) wallReported = true;
      prevF = f;
    }
    wallHit = blocked >= 3 ? { normal: { x: 0, y: 0, z: 1 } } : null;
    const atWall = feetOf(c);
    const fwd = physics.raycast({ x: atWall.x, y: atWall.y + 1.2, z: atWall.z }, { x: 0, y: 0, z: -1 }, 1, c.collider);
    log(`exit: blocked at z ${atWall.z.toFixed(3)} grounded ${c.grounded}; wallContact reported ${wallReported}; chest ray normal ${fwd ? JSON.stringify(fwd.normal) : 'none'}`);
    // Climb out: ray down from just past the wall finds the ledge top; teleport there and go back to walk.
    const n = wallHit!.normal;
    const probe = { x: atWall.x - n.x * (PLAYER.radius + 0.4), y: SURFACE + 2.5, z: atWall.z - n.z * (PLAYER.radius + 0.4) };
    const top = physics.raycast(probe, { x: 0, y: -1, z: 0 }, 5, c.collider);
    const climb = top ? top.point.y - atWall.y : NaN;
    void wallHit;
    if (top) {
      c.setMoveMode('walk');
      c.teleport({ x: probe.x, y: top.point.y, z: probe.z });
    }
    for (let i = 0; i < 30; i++) tick(c);
    const out = feetOf(c);
    log(
      `swim hook: entered pit after ${k} ticks; 10 s still drift ${(drift * 1000).toFixed(2)} mm; floor min feet ${minY.toFixed(3)} (floor -6), grounded ${floorGrounded}; along floor ${along.toFixed(2)} m/s; ` +
        `shelf wall contact ${wall ? wall.normal.z.toFixed(2) : 'none'}; surface feet y ${surfY.toFixed(3)} (want ${(SURFACE - HEAD_OUT).toFixed(2)}); ` +
        `exit wall at z ${atWall.z.toFixed(2)}, ledge top ${top?.point.y.toFixed(2)}, climb ${climb.toFixed(2)} m; after climb-out feet (${out.x.toFixed(1)}, ${out.y.toFixed(2)}, ${out.z.toFixed(2)}) grounded ${c.grounded}`,
    );
    expect(drift).toBeLessThan(0.001);
    expect(minY).toBeGreaterThan(-6.05);
    expect(wallHit).not.toBeNull();
    expect(c.grounded).toBe(true);
    expect(out.y).toBeGreaterThan(SURFACE + 0.4);

    // Beach exit: swim mode up a 20 degree slope; back to walk when depth < 1.2 m.
    c.teleport({ x: 20, y: -3, z: -20 });
    c.setMoveMode('swim');
    let switched = -1;
    for (let i = 0; i < 900; i++) {
      const f = feetOf(c);
      if (c.moveMode === 'swim' && c.grounded && depthAt(f) < 1.2) {
        c.setMoveMode('walk');
        switched = i;
      }
      tick(c, I({ moveX: 1, speedOverride: c.moveMode === 'swim' ? 2 : PLAYER.walkSpeed * 0.55, verticalSpeed: c.moveMode === 'swim' ? swimV(f, -0.5) : 0 }));
    }
    const beach = feetOf(c);
    log(`beach exit: back to walk after ${switched} ticks; final feet (${beach.x.toFixed(1)}, ${beach.y.toFixed(2)}) grounded ${c.grounded}`);
    expect(switched).toBeGreaterThan(0);
  });

  it('dive without the hook: launch() each tick cancels gravity (works, but snap and the grounded push stay on)', () => {
    const c = new CharacterController(physics, { x: 0, y: -6, z: -20 });
    for (let k = 0; k < 30; k++) tick(c);
    c.teleport({ x: 0, y: -3, z: -20 });
    const s = feetOf(c);
    let drift = 0;
    for (let i = 0; i < 600; i++) {
      c.launch(0 + G * DT);
      tick(c);
      const f = feetOf(c);
      drift = Math.max(drift, Math.hypot(f.x - s.x, f.y - s.y, f.z - s.z));
    }
    // On the floor: swim along with a slight upward wish; does snap keep it glued?
    c.teleport({ x: 0, y: -6, z: -20 });
    for (let k = 0; k < 10; k++) tick(c);
    const y0 = feetOf(c).y;
    for (let i = 0; i < 120; i++) {
      c.launch(0.2 + G * DT);
      tick(c, I({ moveX: 1, speedOverride: 2 }));
    }
    const lift = feetOf(c).y - y0;
    log(`swim external: 10 s still drift ${(drift * 1000).toFixed(2)} mm; 2 s at +0.2 m/s from the floor rose ${lift.toFixed(3)} m (want 0.4)`);
  });
});

// ---- Glide ------------------------------------------------------------------------------------------------------
const GLIDE_SPEED = 10;
const SINK = 2.5;

function glide(c: CharacterController, hx: number, hz: number, maxTicks: number, onTick?: (i: number) => boolean | void) {
  c.setMoveMode('glide', { sinkRate: SINK });
  let i = 0;
  let midairBlocked = 0;
  let minClear = Infinity;
  let prev = feetOf(c);
  for (; i < maxTicks; i++) {
    if (onTick?.(i) === false) break;
    tick(c, I({ moveX: hx, moveZ: hz, speedOverride: GLIDE_SPEED }));
    const f = feetOf(c);
    minClear = Math.min(minClear, clearance(c, f));
    if (!c.grounded && Math.hypot(f.x - prev.x, f.z - prev.z) < GLIDE_SPEED * DT * 0.5) midairBlocked++;
    prev = f;
    if (c.grounded) break;
  }
  return { ticks: i, midairBlocked, minClear };
}

describe('glide prototype', () => {
  it.each([20, 30, 35, 40, 45, 55])('lands into a %d degree uphill slope at 10 m/s, then settles', (deg) => {
    const t = Math.tan((deg * Math.PI) / 180);
    // Flat valley at 0 for x < 0, then the slope rises with +x.
    const h = (x: number) => (x < 0 ? 0 : x * t);
    field((x) => h(x), 0, 0, 240, 256);
    physics.step();
    const c = new CharacterController(physics, { x: -60, y: 30, z: 0 });
    c.teleport({ x: -60, y: 30, z: 0 });
    const g = glide(c, 1, 0, 1200);
    const land = feetOf(c);
    c.setMoveMode('walk');
    for (let i = 0; i < 120; i++) tick(c);
    const rest = feetOf(c);
    const slid = Math.hypot(rest.x - land.x, rest.y - land.y);
    log(
      `glide land ${deg} deg: landed after ${(g.ticks * DT).toFixed(2)} s at (${land.x.toFixed(2)}, ${land.y.toFixed(2)}), ground there ${h(land.x).toFixed(2)}, ` +
        `mid-air blocked ticks ${g.midairBlocked}; 2 s after: slid ${slid.toFixed(2)} m, grounded ${c.grounded}`,
    );
    expect(land.y).toBeGreaterThan(h(land.x) - 0.1);
  });

  it('a glider never tunnels: 0.2 m wall, a 70 degree cliff face, and a 40 m/s plunge into the heightfield', () => {
    field(() => 0, 0, 0, 200, 64);
    // A thin wall across the path at x 20, and a 70 degree cliff box at x 50.
    physics.addStaticCollider(physics.rapier.ColliderDesc.cuboid(0.1, 10, 10).setTranslation(20, 10, 0));
    physics.step();
    const c = new CharacterController(physics, { x: 0, y: 5, z: 0 });
    c.teleport({ x: 0, y: 5, z: 0 });
    let maxX = -Infinity;
    glide(c, 1, 0, 180, () => {
      maxX = Math.max(maxX, feetOf(c).x);
    });
    c.setMoveMode('walk');
    // A plunge at terminal speed (walk mode, 40 m/s) from 300 m onto the heightfield.
    c.teleport({ x: -30, y: 300, z: 0 });
    let minY = Infinity;
    for (let i = 0; i < 900; i++) {
      tick(c);
      minY = Math.min(minY, feetOf(c).y);
    }
    log(`no tunnelling: thin wall x 20 reached max feet x ${maxX.toFixed(3)} (wall face 19.9 - r 0.35 = 19.55); plunge min feet y ${minY.toFixed(3)}`);
    expect(maxX).toBeLessThan(19.9);
    expect(minY).toBeGreaterThan(-0.05);
  });

  it('glides the real summit heightfield in eight headings: clearance, blocked ticks, landings', () => {
    const bx = 15400;
    const bz = 15900;
    field(heightAt, bx, bz, 1280, 820);
    physics.step();
    const rows: string[] = [];
    for (let d = 0; d < 8; d++) {
      const a = (d / 8) * Math.PI * 2;
      const c = new CharacterController(physics, { x: bx, y: heightAt(bx, bz) + 0.5, z: bz });
      for (let k = 0; k < 30; k++) tick(c);
      c.teleport({ x: bx, y: heightAt(bx, bz) + 3, z: bz }); // stepping off a ledge 3 m above the high point
      const g = glide(c, Math.cos(a), Math.sin(a), 60 * 60);
      const f = feetOf(c);
      const slope = (Math.atan(Math.hypot(heightAt(f.x + 1, f.z) - heightAt(f.x - 1, f.z), heightAt(f.x, f.z + 1) - heightAt(f.x, f.z - 1)) / 2) * 180) / Math.PI;
      c.setMoveMode('walk');
      for (let i = 0; i < 120; i++) tick(c);
      const r = feetOf(c);
      rows.push(
        `${(d * 45).toString().padStart(3)} deg: ${(g.ticks * DT).toFixed(1)} s, ${Math.hypot(f.x - bx, f.z - bz).toFixed(0)} m out, drop ${(heightAt(bx, bz) - f.y).toFixed(0)} m, ` +
          `land slope ${slope.toFixed(0)} deg, min clearance ${g.minClear.toFixed(2)}, blocked ${g.midairBlocked}, slid after ${Math.hypot(r.x - f.x, r.z - f.z).toFixed(1)} m`,
      );
      expect(g.minClear).toBeGreaterThan(-0.15);
      c.dispose();
    }
    log('real summit glides\n' + rows.join('\n'));
  });

  it('containment: a glider pushed against a closed edge', () => {
    // Harrowmark (open) has its north edge at engine z 4000. Flat ground at 0; glide north from 60 m up.
    field(() => 0, 9000, 4000, 400, 64);
    physics.step();
    const containment = new Containment({ getFlag: () => false });
    const c = new CharacterController(physics, { x: 9000, y: 60, z: 3960 });
    c.teleport({ x: 9000, y: 60, z: 3960 });
    c.setMoveMode('glide', { sinkRate: SINK });
    let pushes = 0;
    const ys: number[] = [];
    for (let i = 0; i < 600; i++) {
      // containmentSystem.ts:57-60, verbatim logic, run before the controller as at intent order -95.
      const feet = feetOf(c);
      if (!containment.isOpen(feet.x, feet.z)) {
        const q = containment.nearestOpen(feet.x, feet.z);
        c.teleport({ x: q.x, y: Math.max(feet.y, 0) + 0.1, z: q.z });
        pushes++;
      }
      tick(c, I({ moveZ: 1, speedOverride: GLIDE_SPEED }));
      ys.push(feetOf(c).y);
    }
    const f = feetOf(c);
    log(
      `containment glider: 10 s against z 4000: ${pushes} push-backs (one every ${(600 / Math.max(pushes, 1) / 60).toFixed(2)} s), still mode ${c.moveMode}, ` +
        `final feet z ${f.z.toFixed(2)} y ${f.y.toFixed(2)} (from 60; free sink would be ${(60 - SINK * 10).toFixed(0)})`,
    );
  });

  it('camera: the follow camera behind a glider over the real summit', () => {
    const bx = 15400;
    const bz = 15900;
    field(heightAt, bx, bz, 1280, 820);
    physics.step();
    const c = new CharacterController(physics, { x: bx, y: heightAt(bx, bz) + 0.5, z: bz });
    for (let k = 0; k < 30; k++) tick(c);
    const input = { consumeMouseDelta: () => ({ dx: 0, dy: 0 }), consumeWheel: () => 0 } as unknown as InputManager;
    const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 5000);
    const rig = new ThirdPersonCamera(camera, input, physics, c.collider);
    const out: string[] = [];
    for (const deg of [0, 90, 180, 270]) {
      const a = (deg * Math.PI) / 180;
      c.teleport({ x: bx, y: heightAt(bx, bz) + 3, z: bz });
      const hx = Math.cos(a);
      const hz = Math.sin(a);
      rig.yaw = Math.atan2(-hx, -hz);
      let pulled = 0;
      let under = 0;
      let minDist = Infinity;
      let n = 0;
      let maxStep = 0;
      let last: THREE.Vector3 | null = null;
      glide(c, hx, hz, 60 * 30, () => {
        const f = feetOf(c);
        rig.update(new THREE.Vector3(f.x, f.y, f.z), DT);
        const tgt = new THREE.Vector3(f.x, f.y + CAMERA.targetHeight, f.z);
        const d = camera.position.distanceTo(tgt);
        minDist = Math.min(minDist, d);
        if (d < CAMERA.distance - 0.05) pulled++;
        if (camera.position.y < heightAt(camera.position.x, camera.position.z) + 0.1) under++;
        if (last) maxStep = Math.max(maxStep, camera.position.distanceTo(last));
        last = camera.position.clone();
        n++;
      });
      out.push(`${deg} deg: ${n} frames, pulled in ${pulled}, min dist ${minDist.toFixed(2)}, under ground ${under}, max frame step ${maxStep.toFixed(2)} m`);
    }
    log('glide camera\n' + out.join('\n'));
    void CHARACTER_CONTROLLER;
  });
});
