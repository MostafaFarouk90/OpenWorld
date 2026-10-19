// Sizes against the player (follow-up to the asset swap): anything meant to block is out of reach of a jump, gates clear a mounted
// rider, doors clear the Knight. The jump is simulated with the real character controller on real Rapier colliders.
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { Player } from '../characters/Player';
import { ModelLibrary } from '../assets/swap/ModelLibrary';
import { diskSource } from '../assets/swap/testing/diskSource';
import { HARROWMARK_LAYOUT } from '../harrowmark/harrowmark.layout';
import { PORTCULLIS_ID, GATE_GAP } from '../harrowmark/city';
import type { InputSnapshot } from '../input/InputManager';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { flatGround } from '../physics/flatGround';
import { heightAt } from '../terrain/heightfield';
import { BRIGHTWATER_LAYOUT } from './brightwater.layout';
import { CORRIDOR_LAYOUT } from './corridor.layout';
import { DEADROAD_LAYOUT } from './deadroad.layout';
import { groundRange } from './geometry';
import { DOOR_HEIGHT, structureHeight } from './greybox';
import { GATE_PILLAR_AT, GATE_PILLAR_HALF } from './StructureBuilder';
import type { StructureSpec } from './layoutTypes';
import { GATE_CLEARANCE, createStructureArt } from './structureArt';

/** Out of reach of the jump (apex 1.05 m) plus the auto-step (0.4 m), with a margin. */
export const BLOCKING_MIN = 1.6;
/** Low rails that exist to be jumped (tutorial T07: the cart and the lane rail). */
const HURDLES = new Set(['fence-lane', 'cart']);
/** The Knight's height, and the Ashmare's rider (saddle 1.47 m plus the Knight). */
const KNIGHT = 1.8;
const RIDER = 3.3;

const layouts = [BRIGHTWATER_LAYOUT, DEADROAD_LAYOUT, CORRIDOR_LAYOUT];
const all = layouts.flatMap((l) => l.structures);

describe('blocking fences', () => {
  it('every solid fence is at least 1.6 m, except the tutorial hurdles', () => {
    const fences = all.filter((s) => (s.kind === 'fence' || s.kind === 'yard-fence') && s.mode === 'solid');
    expect(fences.length).toBeGreaterThan(2);
    for (const f of fences) {
      if (HURDLES.has(f.id)) expect(structureHeight(f), f.id).toBeLessThanOrEqual(0.8);
      else expect(structureHeight(f), f.id).toBeGreaterThanOrEqual(BLOCKING_MIN);
    }
    // The hurdles stay jumpable: the tutorial needs them.
    for (const id of HURDLES) {
      const s = all.find((x) => x.id === id);
      if (s) expect(structureHeight(s), id).toBeLessThan(1.0);
    }
  });

  it('open yard fences read as the same fence (1.6 m) even though they do not block', () => {
    for (const f of [...all, ...HARROWMARK_LAYOUT.structures].filter((s) => s.kind === 'yard-fence')) expect(structureHeight(f), f.id).toBeGreaterThanOrEqual(BLOCKING_MIN);
  });
});

describe('the jump against a fence (real character controller)', () => {
  let physics: PhysicsWorld;
  beforeAll(async () => {
    physics = new PhysicsWorld();
    await physics.init();
  });
  const NO_INPUT: InputSnapshot = { moveRight: 0, moveForward: 0, sprint: false, jump: false, attack: 0 };

  /** Sprints at a fence of `top` metres, jumping `jumpAt` metres before it; returns whether the player got over or on top. */
  async function simulate(top: number, jumpAt: number) {
    const w = new PhysicsWorld();
    await w.init();
    w.addHeightfield(flatGround(200));
    const fenceZ = -20;
    w.addStaticCollider(w.rapier.ColliderDesc.cuboid(8, top / 2, 0.3).setTranslation(0, top / 2, fenceZ));
    const player = new Player(new THREE.Scene(), w, { x: 0, y: 0, z: 0 }, { moveModifier: () => ({ speedScale: 1, lockMove: false, lockFacing: false }) });
    const tick = (input: InputSnapshot, mx: number, mz: number) => {
      player.fixedUpdate(input, mx, mz);
      w.step();
      player.postStep();
    };
    for (let i = 0; i < 20; i++) tick(NO_INPUT, 0, 0);
    let peak = 0;
    for (let i = 0; i < 400; i++) {
      const f = player.controller.interpolatedFeet(1, { x: 0, y: 0, z: 0 });
      const near = f.z - (fenceZ + 0.3) < jumpAt;
      tick({ ...NO_INPUT, moveForward: 1, sprint: true, jump: near && player.controller.grounded }, 0, -1);
      peak = Math.max(peak, f.y);
    }
    const f = player.controller.interpolatedFeet(1, { x: 0, y: 0, z: 0 });
    return { crossed: f.z < fenceZ - 0.3, onTop: player.controller.grounded && f.y > 0.5, peak };
  }

  it('cannot clear or climb a 1.6 m fence, at any jump distance', async () => {
    for (let d = 0.2; d <= 3.4; d += 0.2) {
      const r = await simulate(BLOCKING_MIN, d);
      expect(r.crossed, `jump at ${d.toFixed(1)} m`).toBe(false);
      expect(r.onTop, `jump at ${d.toFixed(1)} m`).toBe(false);
    }
  });

  it('can clear the 0.6 m tutorial hurdle (the test is not vacuous)', async () => {
    let crossed = false;
    for (let d = 0.4; d <= 2.4 && !crossed; d += 0.2) crossed = (await simulate(0.6, d)).crossed;
    expect(crossed).toBe(true);
  });

  it('a 1.0 m fence could be hopped over (so the 1.6 m result means something)', async () => {
    let over = false;
    for (let d = 0.2; d <= 3.4 && !over; d += 0.2) {
      const r = await simulate(1.0, d);
      over = r.crossed || r.onTop;
    }
    expect(over).toBe(true);
  });

  it('a fence on the highest adjacent ground is still out of reach', async () => {
    // The collider is a single box at the centre's ground height; the terrain beside it can be higher.
    const fences = all.filter((s) => (s.kind === 'fence' || s.kind === 'yard-fence') && s.mode === 'solid' && !HURDLES.has(s.id));
    for (const f of fences) {
      const base = heightAt(f.x, f.z);
      const range = groundRange(f, heightAt, 1.5);
      const worst = BLOCKING_MIN - Math.max(0, range.max - base);
      expect(worst, `${f.id}: terrain rises ${(range.max - base).toFixed(2)} m beside it`).toBeGreaterThanOrEqual(1.45);
    }
    const r = await simulate(1.45, 1.0);
    expect(r.onTop).toBe(false);
  });
});

describe('openings fit the Knight and the horse', () => {
  let lib: ModelLibrary;
  beforeAll(async () => {
    lib = new ModelLibrary(await diskSource());
  });

  /** True when a horizontal ray along the passage direction (z) hits the object's meshes. */
  const blockedAt = (obj: THREE.Object3D, x: number, y: number): boolean => {
    obj.updateMatrixWorld(true);
    const rc = new THREE.Raycaster(new THREE.Vector3(x, y, -50), new THREE.Vector3(0, 0, 1), 0, 100);
    rc.params.Mesh = {} as never;
    const meshes: THREE.Mesh[] = [];
    obj.traverse((o) => (o as THREE.Mesh).isMesh && meshes.push(o as THREE.Mesh));
    for (const m of meshes) (m.material as THREE.Material).side = THREE.DoubleSide;
    return rc.intersectObjects(meshes, false).length > 0;
  };

  it('the Brightwater gates are 5 m clear and a mounted rider (0.6 m either side of the centre) passes under them', async () => {
    const gates = all.filter((s) => s.kind === 'gate');
    expect(gates.length).toBe(2);
    const art = createStructureArt(lib);
    for (const g of gates) {
      expect(structureHeight(g), g.id).toBeGreaterThanOrEqual(GATE_CLEARANCE);
      const obj = await art(g as StructureSpec);
      expect(obj, g.id).not.toBeNull();
      for (const x of [-1.2, -0.6, 0, 0.6, 1.2]) for (let y = 0.2; y <= RIDER + 0.2; y += 0.25) expect(blockedAt(obj!, x, y), `${g.id} x ${x} y ${y.toFixed(2)}`).toBe(false);
      expect(blockedAt(obj!, 0, GATE_CLEARANCE + 0.1), `${g.id} crown`).toBe(false);
      expect(blockedAt(obj!, 0, GATE_CLEARANCE + 1), `${g.id} the arch is really there`).toBe(true);
    }
  });

  it('enterable doors are 3.0 m high and 2.6 m wide: the Knight walks through with 1.2 m of headroom', () => {
    expect(DOOR_HEIGHT).toBeGreaterThanOrEqual(KNIGHT + 1.2);
    const doors = all.filter((s) => s.door);
    expect(doors.length).toBeGreaterThanOrEqual(2);
    for (const s of doors) expect(s.door!.width, s.id).toBeGreaterThanOrEqual(2.6);
  });

  it('the South Gate passage is 12 m wide and 6 m high', () => {
    const p = HARROWMARK_LAYOUT.structures.find((s) => s.id === PORTCULLIS_ID)!;
    expect(p.footprint[0]).toBeGreaterThanOrEqual(GATE_GAP);
    expect(GATE_GAP).toBeGreaterThanOrEqual(2 * 2.6);
    expect(structureHeight(p)).toBeGreaterThanOrEqual(GATE_CLEARANCE);
  });

  it('gate pillar colliders sit on the arch pillars and leave a 5 m clear opening', () => {
    for (const w of [8, 10]) {
      const inner = (w / 2) * (GATE_PILLAR_AT - GATE_PILLAR_HALF);
      expect(2 * inner).toBeGreaterThanOrEqual(5);
      // the outer face stays inside the footprint
      expect((w / 2) * (GATE_PILLAR_AT + GATE_PILLAR_HALF)).toBeLessThanOrEqual(w / 2);
    }
  });
});
