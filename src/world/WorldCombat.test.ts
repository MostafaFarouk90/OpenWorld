import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { KnightAvatar } from '../characters/KnightAvatar';
import { FIXED_TIMESTEP, KNIGHT } from '../config/constants';
import { WeaponTracer } from '../combat/WeaponTracer';
import { WorldCombat, formatHitStats, type Dummy } from './WorldCombat';

const SLICE = '1H_Melee_Attack_Slice_Horizontal';
const GROUNDED = { grounded: true, horizontalSpeed: 0, verticalSpeed: 0 };
const AIRBORNE = { grounded: false, horizontalSpeed: 0, verticalSpeed: 6 };

let gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] };

beforeAll(async () => {
  (globalThis as any).self ??= globalThis;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const fsModule = 'node:fs';
  const { readFileSync } = (await import(/* @vite-ignore */ fsModule)) as any;
  const file = readFileSync('public/assets/kaykit-adventurers/characters/Knight.glb');
  const buf = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
  gltf = await new Promise((res, rej) => new GLTFLoader().parse(buf, '', res as any, rej));
});

afterEach(() => vi.restoreAllMocks());

/** The player at the origin facing -Z, with dummies at the given (x, z) positions. */
function arena(spots: Array<[number, number]>, sounds?: ConstructorParameters<typeof WorldCombat>[1]) {
  const scene = new THREE.Scene();
  const avatar = new KnightAvatar(
    { model: cloneSkinned(gltf.scene), clips: gltf.animations, sword: null, shield: null },
    { warn: () => {} },
  );
  scene.add(avatar.root);
  const wc = new WorldCombat(scene, sounds);
  wc.attachPlayer(avatar);
  const dummies: Dummy[] = spots.map(([x, z]) => {
    const model = cloneSkinned(gltf.scene);
    model.scale.setScalar(KNIGHT.modelScale);
    model.position.set(x, 0, z);
    return wc.addDummy(model, gltf.animations);
  });
  const hits: Array<{ target: unknown; bone: string }> = [];
  wc.combat.bus.subscribe((e) => hits.push({ target: e.target, bone: e.bone }));
  const tick = (n = 1, input = GROUNDED) => {
    for (let i = 0; i < n; i++) {
      avatar.fixedUpdate(input);
      wc.fixedUpdate(FIXED_TIMESTEP);
    }
  };
  return { scene, avatar, wc, dummies, hits, tick };
}

/** Records the `active` argument of every WeaponTracer.tick call. */
function spyTicks(): boolean[] {
  const calls: boolean[] = [];
  const orig = WeaponTracer.prototype.tick;
  vi.spyOn(WeaponTracer.prototype, 'tick').mockImplementation(function (this: WeaponTracer, active, ...rest) {
    calls.push(active);
    return orig.call(this, active, ...rest);
  });
  return calls;
}

const swing = (a: ReturnType<typeof arena>, clip = SLICE) => {
  expect(a.avatar.controller.playAttack(clip)).toBe(true);
  a.tick(90);
};

describe('WorldCombat with the real Knight and controller', () => {
  it('a full swing produces exactly one hit on a dummy in reach', () => {
    const a = arena([[0, -1.0]]);
    swing(a);
    expect(a.hits).toHaveLength(1);
    expect(a.hits[0].target).toBe(a.dummies[0].model);
    expect(a.wc.stats.hits).toBe(1);
    expect(a.wc.stats.totalDamage).toBeGreaterThan(0);
  });

  it('hits each of two dummies in reach exactly once', () => {
    const a = arena([
      [0, -1.0],
      [0, -1.2],
    ]);
    swing(a);
    expect(a.hits.map((h) => h.target).sort()).toEqual([a.dummies[0].model, a.dummies[1].model].sort());
    expect(a.hits).toHaveLength(2);
  });

  it('misses a dummy at striking range on the far side from the sword (angle, not distance)', () => {
    // Facing -Z the sword hand is on +X, and the horizontal slice sweeps across it.
    const near = arena([[1.2, 0]]);
    swing(near);
    expect(near.hits).toHaveLength(1);
    const far = arena([[-1.2, 0]]);
    swing(far);
    expect(far.hits).toHaveLength(0);
  });

  it('a swing that misses (too far, behind, to the side) produces no hit', () => {
    for (const spot of [[0, -3.5], [0, 1.2], [3, 0], [-3, 0]] as Array<[number, number]>) {
      const a = arena([spot]);
      swing(a);
      expect(a.hits, `dummy at ${spot}`).toHaveLength(0);
      expect(a.wc.stats.hits).toBe(0);
    }
  });

  it('two consecutive swings hit the same dummy once each', () => {
    const a = arena([[0, -1.0]]);
    swing(a);
    swing(a, '1H_Melee_Attack_Slice_Horizontal');
    expect(a.hits).toHaveLength(2);
  });

  it('an interrupt inside the open window stops tracing at once', () => {
    const a = arena([[0, -3.5]]);
    const ticks = spyTicks();
    a.avatar.controller.playAttack(SLICE);
    for (let i = 0; i < 90 && !a.avatar.controller.activeAttack()?.active; i++) a.tick();
    expect(a.avatar.controller.activeAttack()?.active).toBe(true);
    a.tick(1, AIRBORNE as typeof GROUNDED);
    const seen = ticks.filter(Boolean).length;
    a.tick(100);
    expect(ticks.filter(Boolean).length).toBe(seen);
  });

  it('an interrupted attack traces nothing afterwards', () => {
    const a = arena([[0, -1.0]]);
    a.avatar.controller.playAttack(SLICE);
    a.tick(5); // still winding up
    a.tick(1, AIRBORNE as typeof GROUNDED); // jump cancels the attack
    a.tick(100);
    expect(a.hits).toHaveLength(0);
  });

  it('does not trace between swings (a dummy moved into the blade path while idle)', () => {
    const a = arena([[0, -3.5]]);
    const ticks = spyTicks();
    swing(a); // a clean miss
    const activeAfterSwing = ticks.filter(Boolean).length;
    expect(activeAfterSwing).toBeGreaterThan(0);
    a.dummies[0].model.position.set(0, 0, -1.0);
    a.tick(120); // idle: the blade rests, nothing is swept
    expect(ticks.filter(Boolean).length).toBe(activeAfterSwing);
    expect(a.hits).toHaveLength(0);
  });

  it('removing a dummy mid-swing neither throws nor hits it, and the other is still hit', () => {
    const a = arena([
      [0, -1.0],
      [0, -1.2],
    ]);
    a.avatar.controller.playAttack(SLICE);
    a.tick(8);
    a.wc.removeDummy(a.dummies[0]);
    expect(() => a.tick(90)).not.toThrow();
    expect(a.hits.map((h) => h.target)).toEqual([a.dummies[1].model]);
    expect(a.wc.dummyCount).toBe(1);
    expect(a.dummies[0].model.parent).toBeNull();
  });

  it('removing a dummy from inside a hit listener is safe', () => {
    const a = arena([[0, -1.0]]);
    a.wc.onHitEvent(() => a.wc.removeDummy(a.dummies[0]));
    expect(() => swing(a)).not.toThrow();
    expect(a.hits).toHaveLength(1);
    expect(a.wc.dummyCount).toBe(0);
    a.wc.removeDummy(a.dummies[0]); // already gone: ignored
  });

  it('never hits the player themself, even with no dummies', () => {
    const a = arena([]);
    // Even when the player's own hurtboxes are registered as a target, the sword never hits them.
    a.wc.combat.addTarget((a.wc as unknown as { playerBoxes: Parameters<typeof a.wc.combat.addTarget>[0] }).playerBoxes);
    swing(a);
    expect(a.hits).toHaveLength(0);
  });

  it('a struck dummy plays its hit reaction and returns to Idle', () => {
    const a = arena([[0, -1.0]]);
    swing(a);
    const d = a.dummies[0];
    expect(d.reaction).not.toBeNull();
    expect(d.reaction!.isRunning()).toBe(false); // reaction finished
    expect(d.idle!.getEffectiveWeight()).toBeCloseTo(1, 1);
  });

  it('ignores a second attachPlayer and a disposed instance', () => {
    const a = arena([[0, -1.0]]);
    a.wc.attachPlayer(a.avatar);
    swing(a);
    expect(a.hits).toHaveLength(1);
    a.wc.dispose();
    expect(a.wc.fixedUpdate(FIXED_TIMESTEP)).toEqual([]);
    expect(() => a.wc.addDummy(cloneSkinned(gltf.scene), gltf.animations)).toThrow(/disposed/);
    expect(() => a.wc.dispose()).not.toThrow();
  });
});

describe('WorldCombat hit wiring', () => {
  it('plays the hit sound once at the contact point and updates the counter', () => {
    const hit = vi.fn();
    const a = arena([[0, -1.0]], { hit });
    const listener = vi.fn();
    a.wc.onHitEvent(listener);
    swing(a);
    expect(hit).toHaveBeenCalledTimes(1);
    const [point, damage] = hit.mock.calls[0];
    expect(Number.isFinite(point.x + point.y + point.z)).toBe(true);
    expect(damage).toBe(a.wc.stats.lastDamage);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(a.wc.stats).toMatchObject({ hits: 1, totalDamage: damage });
    expect(a.wc.stats.lastBone).not.toBe('');
  });

  it('a throwing sound or listener does not stop the others', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const a = arena([[0, -1.0]], {
      hit: () => {
        throw new Error('no audio');
      },
    });
    const bad = vi.fn(() => {
      throw new Error('bad listener');
    });
    const good = vi.fn();
    a.wc.onHitEvent(bad);
    a.wc.onHitEvent(good);
    swing(a);
    expect(bad).toHaveBeenCalled();
    expect(good).toHaveBeenCalledTimes(1);
    expect(a.wc.stats.hits).toBe(1);
  });

  it('an unsubscribed listener is not called', () => {
    const a = arena([[0, -1.0]]);
    const l = vi.fn();
    a.wc.onHitEvent(l)();
    swing(a);
    expect(l).not.toHaveBeenCalled();
  });
});

describe('tuned hurtboxes against the real Slice_Horizontal timing', () => {
  const hitsAt = (x: number, z: number) => {
    const a = arena([[x, z]]);
    swing(a);
    return a.hits.length;
  };

  it('connects at striking range and misses well beyond it', () => {
    for (const z of [-0.8, -1.0, -1.2]) expect(hitsAt(0, z), `z=${z}`).toBe(1);
    expect(hitsAt(0, -2.6)).toBe(0);
    expect(hitsAt(0, -3.5)).toBe(0);
  });

  it('the range scan is contiguous: one connected band from close in to the reach limit', () => {
    const connected: boolean[] = [];
    for (let z = -0.5; z >= -3; z -= 0.25) connected.push(hitsAt(0, z) === 1);
    const firstMiss = connected.indexOf(false);
    expect(firstMiss).toBeGreaterThan(0);
    expect(connected.slice(firstMiss).some(Boolean)).toBe(false);
  });

  it('the HUD line is empty before a hit and reports the counters after', () => {
    const s = { hits: 0, totalDamage: 0, lastBone: '', lastDamage: 0 };
    expect(formatHitStats(s)).toBe('');
    expect(formatHitStats({ hits: 1, totalDamage: 7.5, lastBone: 'torso', lastDamage: 7.5 })).toBe(
      'Hits 1 · damage 7.5 · last torso (7.5)',
    );
    expect(formatHitStats({ hits: 3, totalDamage: 22.5, lastBone: 'head', lastDamage: 20 })).toContain('Hits 3');
  });
});
