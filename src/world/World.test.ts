import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KnightAvatar } from '../characters/KnightAvatar';
import { KNIGHT_ATTACKS, KNIGHT_CLIPS } from '../characters/knightClips';
import { FIXED_TIMESTEP } from '../config/constants';
import type { InputSnapshot } from '../input/InputManager';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { heightAt } from '../terrain/heightfield';
import { TerrainColliders } from './TerrainColliders';
import { ATTACK_SLOTS, World } from './World';

const IDLE: InputSnapshot = { moveRight: 0, moveForward: 0, sprint: false, jump: false, attack: 0 };
const NO_MOVE = { x: 0, z: 0 };
const EAST = { x: 1, z: 0 };

function makeRig() {
  const model = new THREE.Group();
  const bone = (name: string, parent?: THREE.Object3D) => {
    const b = new THREE.Bone();
    b.name = name;
    b.position.y = 0.1;
    parent?.add(b);
    return b;
  };
  const root = bone('root');
  const hips = bone('hips', root);
  const spine = bone('spine', hips);
  const chest = bone('chest', spine);
  bone('head', chest);
  for (const side of ['l', 'r']) {
    const upper = bone(`upperarm${side}`, chest);
    const lower = bone(`lowerarm${side}`, upper);
    const wrist = bone(`wrist${side}`, lower);
    bone(`handslot${side}`, bone(`hand${side}`, wrist));
  }
  const bones: THREE.Bone[] = [];
  root.traverse((o) => {
    if ((o as THREE.Bone).isBone) bones.push(o as THREE.Bone);
  });
  const geo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Array(24 * 4).fill(0), 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Array(24).fill([1, 0, 0, 0]).flat(), 4));
  const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshBasicMaterial());
  mesh.add(root);
  model.add(mesh);
  root.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones));

  const track = () => new THREE.VectorKeyframeTrack('hips.position', [0, 1], [0, 0.1, 0, 0, 0.2, 0]);
  const clips = [...Object.values(KNIGHT_CLIPS), ...KNIGHT_ATTACKS.map((a) => a.clip)].map(
    (name) => new THREE.AnimationClip(name, name === 'Walking_A' ? 1.067 : 1, [track()]),
  );
  const sword = new THREE.Group();
  sword.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.4, 0.1), new THREE.MeshBasicMaterial()));
  const shield = new THREE.Group();
  shield.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.1), new THREE.MeshBasicMaterial()));
  return new KnightAvatar({ model, clips, sword, shield }, { warn: () => {} });
}

let physics: PhysicsWorld;
let scene: THREE.Scene;
let sounds: { footstep: ReturnType<typeof vi.fn>; land: ReturnType<typeof vi.fn> };

beforeEach(async () => {
  physics = new PhysicsWorld();
  await physics.init();
  scene = new THREE.Scene();
  sounds = { footstep: vi.fn(), land: vi.fn() };
});

afterEach(() => vi.restoreAllMocks());

const smallColliders = () => new TerrainColliders(physics, { patchSize: 50, cells: 16 });
const feetOf = (w: World) => w.player.controller.interpolatedFeet(1, { x: 0, y: 0, z: 0 });

function run(w: World, n: number, input: InputSnapshot = IDLE, move = NO_MOVE): void {
  for (let i = 0; i < n; i++) w.fixedUpdate(input, move);
}

function makeWorld(withAvatar = true) {
  const world = new World(scene, physics, { colliders: smallColliders(), sounds });
  const avatar = withAvatar ? makeRig() : null;
  if (avatar) world.setAvatar(avatar);
  return { world, avatar: avatar as KnightAvatar };
}

describe('spawn', () => {
  it('spawns on the meadow and settles on the ground with default colliders', () => {
    const world = new World(scene, physics);
    expect(world.spawn).toEqual({ x: 0, y: heightAt(0, 0), z: 0 });
    expect(world.spawn.y).toBe(0);
    // The player's own patch is registered immediately.
    expect(world.colliders.count).toBeGreaterThanOrEqual(1);
    run(world, 120);
    const f = feetOf(world);
    expect(Math.abs(f.y)).toBeLessThan(0.05);
    expect(Math.abs(f.x)).toBeLessThan(0.05);
    expect(Math.abs(f.z)).toBeLessThan(0.05);
    expect(world.player.controller.grounded).toBe(true);
    // 3 x 3 block eventually complete under the default 2 ms budget.
    run(world, 600);
    expect(world.colliders.count).toBe(9);
    world.dispose();
  });

  it('adds the player mesh to the scene and has no avatar yet', () => {
    const world = new World(scene, physics, { colliders: smallColliders() });
    expect(scene.children).toContain(world.player.mesh);
    expect(world.avatar).toBeNull();
    world.dispose();
  });
});

describe('streaming across patches', () => {
  it('sprints 400 m east without falling through the terrain', () => {
    const world = new World(scene, physics, { colliders: smallColliders() });
    run(world, 120);
    const sprint: InputSnapshot = { ...IDLE, moveRight: 1, sprint: true };
    let minMargin = Infinity;
    const ticks = 3300;
    for (let i = 0; i < ticks; i++) {
      world.fixedUpdate(sprint, EAST);
      const f = feetOf(world);
      minMargin = Math.min(minMargin, f.y - heightAt(f.x, f.z));
    }
    expect(minMargin).toBeGreaterThanOrEqual(-0.05);
    expect(feetOf(world).x).toBeGreaterThan(300);
    expect(world.colliders.count).toBeGreaterThan(0);
    world.dispose();
  }, 60_000);
});

describe('kill-plane respawn', () => {
  it('re-registers the spawn patches in the same tick and settles at spawn', () => {
    const world = new World(scene, physics, { colliders: smallColliders() });
    run(world, 30);
    world.player.controller.teleport({ x: 5000, y: -100, z: 5000 });
    // The far position is not near the spawn patch.
    world.fixedUpdate(IDLE, NO_MOVE);
    const key = `${Math.floor(world.spawn.x / 50)},${Math.floor(world.spawn.z / 50)}`;
    expect(world.colliders.colliderFor(key)).toBeDefined();
    const f = feetOf(world);
    expect(f.x).toBeCloseTo(0, 1);
    expect(f.z).toBeCloseTo(0, 1);
    run(world, 120);
    const g = feetOf(world);
    expect(Math.abs(g.y - world.spawn.y)).toBeLessThan(0.05);
    expect(world.player.controller.grounded).toBe(true);
    world.dispose();
  });
});

describe('avatar', () => {
  it('setAvatar puts the avatar root under the player mesh and a second call throws', () => {
    const { world, avatar } = makeWorld();
    expect(avatar.root.parent).toBe(world.player.mesh);
    expect(world.avatar).toBe(avatar);
    expect(() => world.setAvatar(makeRig())).toThrow(/already set/);
    expect(world.avatar).toBe(avatar);
    world.dispose();
  });

  describe('footsteps', () => {
    it('alternates feet near the player while walking', () => {
      const { world } = makeWorld();
      run(world, 60);
      sounds.footstep.mockClear();
      run(world, 120, { ...IDLE, moveRight: 1 }, EAST);
      const calls = sounds.footstep.mock.calls;
      expect(calls.length).toBeGreaterThanOrEqual(3);
      const feet = calls.map((c) => c[0]);
      for (let i = 1; i < feet.length; i++) expect(feet[i]).not.toBe(feet[i - 1]);
      expect(new Set(feet)).toEqual(new Set(['left', 'right']));
      const f = feetOf(world);
      for (const [, pos] of calls) {
        expect(Math.abs(pos.x - f.x)).toBeLessThan(15);
        expect(Math.abs(pos.y - f.y)).toBeLessThan(0.2);
        expect(Math.abs(pos.z - f.z)).toBeLessThan(0.1);
      }
      world.dispose();
    });

    it('makes no footsteps while idle', () => {
      const { world } = makeWorld();
      run(world, 180);
      expect(sounds.footstep).not.toHaveBeenCalled();
      world.dispose();
    });
  });

  describe('attacks', () => {
    it('attack 1 enters the attack state on that tick and locks movement and jump', () => {
      const { world, avatar } = makeWorld();
      run(world, 60);
      const before = feetOf(world);
      world.fixedUpdate({ ...IDLE, attack: 1 }, NO_MOVE);
      expect(avatar.controller.state).toBe('attack');
      expect(avatar.controller.activeAttack()?.clip).toBe(ATTACK_SLOTS[0]);
      for (let i = 0; i < 30; i++) {
        world.fixedUpdate({ ...IDLE, moveRight: 1, jump: i === 5 }, EAST);
        expect(avatar.controller.state).toBe('attack');
        const f = feetOf(world);
        expect(Math.abs(f.x - before.x)).toBeLessThan(1e-3);
        expect(Math.abs(f.z - before.z)).toBeLessThan(1e-3);
        expect(Math.abs(f.y - before.y)).toBeLessThan(0.02);
        expect(world.player.controller.grounded).toBe(true);
      }
      world.dispose();
    });

    it('allows movement again after the clip ends', () => {
      const { world, avatar } = makeWorld();
      run(world, 60);
      world.fixedUpdate({ ...IDLE, attack: 1 }, NO_MOVE);
      run(world, 75, { ...IDLE, moveRight: 1 }, EAST);
      expect(avatar.controller.state).not.toBe('attack');
      expect(avatar.controller.movementLocked).toBe(false);
      const x0 = feetOf(world).x;
      run(world, 30, { ...IDLE, moveRight: 1 }, EAST);
      expect(feetOf(world).x - x0).toBeGreaterThan(1);
      world.dispose();
    });

    it('a second attack is ignored while one is playing', () => {
      const { world, avatar } = makeWorld();
      run(world, 60);
      world.fixedUpdate({ ...IDLE, attack: 1 }, NO_MOVE);
      const id = avatar.controller.activeAttack()?.swingId;
      run(world, 5);
      world.fixedUpdate({ ...IDLE, attack: 3 }, NO_MOVE);
      expect(avatar.controller.activeAttack()?.clip).toBe(ATTACK_SLOTS[0]);
      expect(avatar.controller.activeAttack()?.swingId).toBe(id);
      world.dispose();
    });

    it.each([
      [2, '1H_Melee_Attack_Slice_Diagonal'],
      [3, '1H_Melee_Attack_Chop'],
      [4, '1H_Melee_Attack_Stab'],
    ])('slot %i plays %s', (slot, clip) => {
      const { world, avatar } = makeWorld();
      run(world, 60);
      world.fixedUpdate({ ...IDLE, attack: slot }, NO_MOVE);
      expect(avatar.controller.state).toBe('attack');
      expect(avatar.controller.activeAttack()?.clip).toBe(clip);
      world.dispose();
    });

    it.each([0, 5, 9, -1])('attack value %i does nothing', (attack) => {
      const { world, avatar } = makeWorld();
      run(world, 60);
      world.fixedUpdate({ ...IDLE, attack }, NO_MOVE);
      expect(avatar.controller.state).toBe('idle');
      expect(avatar.controller.activeAttack()).toBeNull();
      expect(avatar.controller.movementLocked).toBe(false);
      world.dispose();
    });
  });

  describe('jump', () => {
    it('goes jumpStart -> airborne -> land and plays the land sound once', () => {
      const { world, avatar } = makeWorld();
      run(world, 60);
      const seen: string[] = [];
      const note = () => {
        const s = avatar.controller.state;
        if (seen[seen.length - 1] !== s) seen.push(s);
      };
      world.fixedUpdate({ ...IDLE, jump: true }, NO_MOVE);
      note();
      for (let i = 0; i < 120; i++) {
        world.fixedUpdate(IDLE, NO_MOVE);
        note();
      }
      expect(seen.slice(0, 4)).toEqual(['jumpStart', 'airborne', 'land', 'idle']);
      expect(sounds.land).toHaveBeenCalledTimes(1);
      const [fallSpeed, pos] = sounds.land.mock.calls[0];
      expect(fallSpeed).toBeGreaterThan(0);
      expect(Math.abs(pos.y)).toBeLessThan(0.2);
      expect(world.player.controller.grounded).toBe(true);
      world.dispose();
    });
  });
});

describe('without an avatar', () => {
  it('simulates the capsule and ignores attack input', () => {
    const world = new World(scene, physics, { colliders: smallColliders(), sounds });
    run(world, 60);
    expect(() => world.fixedUpdate({ ...IDLE, attack: 1 }, NO_MOVE)).not.toThrow();
    const x0 = feetOf(world).x;
    run(world, 60, { ...IDLE, moveRight: 1 }, EAST);
    expect(feetOf(world).x - x0).toBeGreaterThan(3);
    expect(world.player.controller.grounded).toBe(true);
    expect(sounds.footstep).not.toHaveBeenCalled();
    world.dispose();
  });

  it('render does not throw and places the mesh at the feet', () => {
    const world = new World(scene, physics, { colliders: smallColliders() });
    run(world, 30);
    world.render(1, FIXED_TIMESTEP);
    expect(world.player.mesh.position.y).toBeCloseTo(0, 1);
    world.dispose();
  });
});

describe('dispose', () => {
  it('removes the mesh, every collider and silences the sounds', () => {
    const { world, avatar } = makeWorld();
    run(world, 120);
    expect(physics.world.colliders.len()).toBeGreaterThan(1);
    world.dispose();
    expect(scene.children).not.toContain(world.player.mesh);
    expect(world.player.mesh.parent).toBeNull();
    expect(world.colliders.count).toBe(0);
    expect(physics.world.colliders.len()).toBe(0);

    sounds.footstep.mockClear();
    sounds.land.mockClear();
    avatar.events.emit({ type: 'footstep', foot: 'left' } as never);
    avatar.events.emit({ type: 'land', fallSpeed: 5 } as never);
    expect(sounds.footstep).not.toHaveBeenCalled();
    expect(sounds.land).not.toHaveBeenCalled();
  });

  it('works without an avatar', () => {
    const world = new World(scene, physics, { colliders: smallColliders() });
    run(world, 10);
    expect(() => world.dispose()).not.toThrow();
    expect(physics.world.colliders.len()).toBe(0);
  });

  it('tolerates a second dispose call', () => {
    const world = new World(scene, physics, { colliders: smallColliders() });
    run(world, 10);
    world.dispose();
    expect(() => world.dispose()).not.toThrow();
  });
});

describe('review follow-ups', () => {
  it('during the tick the avatar is at the simulated feet and heading, not the interpolated render pose', () => {
    const { world, avatar } = makeWorld();
    const walk: InputSnapshot = { ...IDLE, moveForward: 1 };
    const checks: number[] = [];
    avatar.events.subscribe((e) => {
      if (e.type !== 'footstep') return;
      const feet = feetOf(world);
      const at = avatar.root.getWorldPosition(new THREE.Vector3());
      checks.push(at.distanceTo(new THREE.Vector3(feet.x, feet.y, feet.z)));
      const q = avatar.root.getWorldQuaternion(new THREE.Quaternion());
      const facing = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), world.player.facingYaw);
      checks.push(q.angleTo(facing));
    });
    for (let i = 0; i < 180; i++) {
      // A render between ticks leaves the mesh one tick behind and only partly turned.
      world.render(0, 0.0001);
      world.fixedUpdate(walk, EAST);
    }
    expect(checks.length).toBeGreaterThan(4);
    for (const c of checks) expect(c).toBeLessThan(1e-5);
    // The render pose really did differ, so the check above is meaningful.
    world.render(0, 0.0001);
    const rendered = avatar.root.getWorldPosition(new THREE.Vector3());
    const f = feetOf(world);
    expect(rendered.distanceTo(new THREE.Vector3(f.x, f.y, f.z))).toBeGreaterThan(0.05);
    world.dispose();
  });

  it('makes no footsteps while airborne during a running jump', () => {
    const { world, avatar } = makeWorld();
    const walk: InputSnapshot = { ...IDLE, moveForward: 1 };
    run(world, 60, walk, EAST);
    world.fixedUpdate({ ...walk, jump: true }, EAST);
    let airborneSteps = 0;
    let airTicks = 0;
    for (let i = 0; i < 90; i++) {
      const before = sounds.footstep.mock.calls.length;
      world.fixedUpdate(walk, EAST);
      const s = avatar.controller.state;
      if (s === 'jumpStart' || s === 'airborne') {
        airTicks++;
        airborneSteps += sounds.footstep.mock.calls.length - before;
      }
    }
    expect(airTicks).toBeGreaterThan(20);
    expect(airborneSteps).toBe(0);
    world.dispose();
  });

  it('an attack is interrupted when the player leaves the ground, and movement unlocks', () => {
    const { world, avatar } = makeWorld();
    run(world, 30);
    const events: string[] = [];
    avatar.events.subscribe((e) => {
      if (e.type === 'clipEnd' && e.clip === '1H_Melee_Attack_Slice_Horizontal') events.push(`end:${e.interrupted}`);
    });
    world.fixedUpdate({ ...IDLE, attack: 1 }, NO_MOVE);
    run(world, 10);
    expect(avatar.controller.state).toBe('attack');
    const f = feetOf(world);
    world.player.controller.teleport({ x: f.x, y: f.y + 6, z: f.z });
    run(world, 20);
    expect(avatar.controller.state).toBe('airborne');
    expect(events).toEqual(['end:true']);
    expect(avatar.controller.movementLocked).toBe(false);
    expect(avatar.controller.activeAttack()).toBeNull();
    world.dispose();
  });
});
