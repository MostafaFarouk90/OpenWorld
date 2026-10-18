import * as THREE from 'three';
import type { HurtboxSet } from '../../combat/HurtboxSet';
import { GRIMTOOTH_SCALE, HOUND } from '../../enemies/quadruped/params';
import { QUADRUPED_CLIPS, QuadrupedBody } from '../../enemies/quadruped/QuadrupedBody';
import { QuadrupedRig } from '../../enemies/quadruped/QuadrupedRig';
import { LOOK } from './tuning';

/** Gaffer's clips: friendly names over thread 5's procedural quadruped clips. */
export const GRIMTOOTH_CLIPS = {
  idle: QUADRUPED_CLIPS.idle,
  walk: QUADRUPED_CLIPS.walk,
  run: QUADRUPED_CLIPS.run,
  crouch: QUADRUPED_CLIPS.crouch,
  pounce: QUADRUPED_CLIPS.pounce,
  bite: QUADRUPED_CLIPS.bite,
  howl: QUADRUPED_CLIPS.howl,
  headLower: QUADRUPED_CLIPS.headLower,
  knockdown: QUADRUPED_CLIPS.knockdown,
  flinch: QUADRUPED_CLIPS.flinch,
} as const;

export type GrimtoothClip = keyof typeof GRIMTOOTH_CLIPS;

/** Spike emissive intensity at rest and at full collar flash. */
const SPIKE_GLOW = 1;
const SPIKE_FLASH_GLOW = 3;

export interface GrimtoothModel {
  /** Feet at the origin; place and turn this (yaw 0 faces -Z). */
  readonly root: THREE.Group;
  readonly body: QuadrupedBody;
  readonly hurtboxes: HurtboxSet;
  /** What the hurtbox set was built on (the rig group); the key for DamageBridge `byOwner` lookups. */
  readonly owner: THREE.Object3D;
  /** The ember spikes: one instanced cone mesh parented to the rig's collar socket. */
  readonly collar: THREE.InstancedMesh;
  /** Plays a clip; one-shots clamp on their last frame, `loop` repeats. */
  play(clip: GrimtoothClip, opts?: { loop?: boolean }): void;
  /** The gait speed (m/s) of the walk and run clips. */
  setSpeed(mps: number): void;
  /** Advances the pose (fixed tick). */
  update(dt: number): void;
  /** Emissive boost 0..1 on the hide and tail (the pounce tail flare). */
  setTelegraph(t: number): void;
  /** 0..1 flashes the collar spikes toward red and brighter; 0 restores them. */
  setCollarFlash(t: number): void;
  setOpacity(o: number): void;
  dispose(): void;
}

/**
 * Builds Gaffer Grimtooth (plans/slice-2-grimtooth.md section 3): thread 5's Ember Hound rig at 1.8x with a dark tint and an
 * ember-spiked collar of instanced cones on the neck. The body gets no damage bus on purpose: its tracers never add damage,
 * the boss deals damage through script hits. `playAttack` is never called.
 */
export function buildGrimtoothModel(warn?: (m: string) => void): GrimtoothModel {
  const body = new QuadrupedBody(
    { ...HOUND, tint: LOOK.tint, emissive: LOOK.emissive, scale: GRIMTOOTH_SCALE },
    { warn },
  );
  const rig = body.owner;
  const dims = QuadrupedRig.dims(rig);

  // Spikes are sized in rig-local metres (the socket inherits the 1.8 scale): a ring just outside the neck, apex outward.
  const neckR = Math.min(dims.bodyRadius * 0.55, dims.neckLen * 0.4);
  const spikeLen = Math.max(0.1, neckR * 0.9);
  const geometry = new THREE.ConeGeometry(spikeLen * 0.3, spikeLen, 6);
  geometry.translate(0, spikeLen / 2, 0); // base at the origin, apex along +Y
  const material = new THREE.MeshStandardMaterial({
    color: LOOK.spikeColor,
    emissive: LOOK.spikeEmissive,
    emissiveIntensity: SPIKE_GLOW,
    roughness: 0.7,
  });
  const collar = new THREE.InstancedMesh(geometry, material, LOOK.spikeCount);
  collar.name = 'grimtooth-collar';
  collar.castShadow = true;
  const up = new THREE.Vector3(0, 1, 0);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const dir = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < LOOK.spikeCount; i++) {
    const a = (i / LOOK.spikeCount) * Math.PI * 2;
    dir.set(Math.cos(a), Math.sin(a), 0);
    pos.copy(dir).multiplyScalar(neckR * 0.9);
    q.setFromUnitVectors(up, dir);
    collar.setMatrixAt(i, m.compose(pos, q, one));
  }
  collar.instanceMatrix.needsUpdate = true;
  // A skinned-rig child moves every frame; never cull the ring by its rest-pose bounds.
  collar.frustumCulled = false;
  QuadrupedRig.sockets(rig).collar.add(collar);

  const baseEmissive = new THREE.Color(LOOK.spikeEmissive);
  const flash = new THREE.Color(LOOK.collarFlash);
  let disposed = false;

  return {
    root: body.root,
    body,
    hurtboxes: body.hurtboxes,
    owner: rig,
    collar,
    play(clip, opts = {}) {
      body.play(GRIMTOOTH_CLIPS[clip], { loop: opts.loop ?? false });
    },
    setSpeed(mps) {
      body.setSpeed(mps);
    },
    update(dt) {
      if (Number.isFinite(dt) && dt > 0) body.fixedUpdate(dt);
    },
    setTelegraph(t) {
      body.setTelegraph(t);
    },
    setCollarFlash(t) {
      if (disposed) return;
      const k = THREE.MathUtils.clamp(Number.isFinite(t) ? t : 0, 0, 1);
      material.emissive.copy(baseEmissive).lerp(flash, k);
      material.emissiveIntensity = SPIKE_GLOW + (SPIKE_FLASH_GLOW - SPIKE_GLOW) * k;
    },
    setOpacity(o) {
      if (disposed) return;
      const v = THREE.MathUtils.clamp(Number.isFinite(o) ? o : 1, 0, 1);
      body.setOpacity(v);
      const transparent = v < 1;
      if (material.transparent !== transparent) material.needsUpdate = true;
      material.transparent = transparent;
      material.opacity = v;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      collar.removeFromParent();
      geometry.dispose();
      material.dispose();
      collar.dispose();
      body.dispose();
    },
  };
}
