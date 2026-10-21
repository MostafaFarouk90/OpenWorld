import * as THREE from 'three';
import {
  boneGeometry,
  coneDecalGeometry,
  headGeometry,
  jawGeometry,
  linkGeometry,
  membraneGeometry,
  spikeGeometry,
  spineGeometry,
  wingFrame,
  type WingFrame,
} from './geometry';
import { makeMaterials, makeUniforms, PART, type WyrmMaterials, type WyrmUniforms } from './materials';
import { paletteOf, type WyrmPalette } from './palettes';
import { segmentProfile, seeded, WYRM_SHAPE, wyrmParams, type WyrmParams } from './params';
import { WyrmSpine, type Vec3Like } from './spine';

/** Hurtbox joint names (the bone names `HurtboxSet` looks up); `head` keeps the x2 bone multiplier. */
export const WYRM_JOINTS = ['head', 'neck', 'torso', 'belly', 'tail', 'tailTip', 'wingL', 'wingR'] as const;
export type WyrmJoint = (typeof WYRM_JOINTS)[number];

/** Breath particles (design 11 effect 21, reduced: logged): flame and smoke. */
export const BREATH = { flame: 96, smoke: 48 } as const;
/** Chain links drawn per chain (collar to post). */
export const CHAIN_LINKS = 16;

/** Distance levels of detail (plan section 9): 0 full, 1 past 40 m, 2 past 90 m. */
export const LOD_DISTANCES = [40, 90] as const;

/** Everything the rig draws this tick, in the body's terms. Angles in radians. */
export interface WyrmPose {
  /** Jaw open, 0..1. */
  jaw: number;
  /** Head pitch (+ up) and yaw (+ left) on top of the spine's heading. */
  headPitch: number;
  headYaw: number;
  /** Shoulder flap angle, + raises the wings. */
  flap: number;
  /** Wing fold, 0 open .. 1 folded against the body. */
  fold: number;
  /** Membrane billow, 0..1 of the build's billow. */
  billow: number;
  /** Leg cycle phase and tuck (0 standing .. 1 tucked for flight). */
  legPhase: number;
  legTuck: number;
  /** Whole-body roll (a knockdown on its side). */
  roll: number;
  mouth: number;
  flash: number;
  tailGlow: number;
  /** Flame emission 0..1 and the jet's reach in metres. */
  breath: number;
  breathReach: number;
  /** The spit's cone decal fill, 0..1 (hidden at 0), and its reach. */
  cone: number;
  coneReach: number;
  /** Tail-whip sweep angle (radians about the chest, 0 when not whipping): the tail tracer swings through it. */
  whip: number;
}

export function restPose(): WyrmPose {
  return {
    jaw: 0, headPitch: 0, headYaw: 0, flap: -0.2, fold: 1, billow: 0, legPhase: 0, legTuck: 0, roll: 0,
    mouth: 0, flash: 0, tailGlow: 0, breath: 0, breathReach: 0, cone: 0, coneReach: 0, whip: 0,
  };
}

/** Where the root stands this tick (world, float64) and its yaw (yaw 0 faces -Z). */
export interface RootFrame {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  life: number;
  size: number;
}

const UP = new THREE.Vector3(0, 1, 0);
const TMP_M = new THREE.Matrix4();
const TMP_Q = new THREE.Quaternion();
const TMP_S = new THREE.Vector3();
const TMP_Q2 = new THREE.Quaternion();
/** Dorsal spikes lean back toward the tail (about the body-left axis; positive would tip them toward the head). */
const SPIKE_LEAN = -0.6;
const TMP_E = new THREE.Euler();
const HALF_TURN = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);

/**
 * One wyrm's visual (design 10 "Dragon fallback"): an instanced spine on the spline, a merged head with a hinged jaw,
 * instanced wing bones with both membranes in one mesh, instanced stub legs, a breath `Points`, the spit's cone decal,
 * optional chains, and the hurtbox and weapon joints the body hands to combat. All transforms are relative to `root`
 * (float64 maths on the CPU), so nothing is in raw world space on the GPU. `apply` is called once per fixed tick.
 */
export class WyrmRig {
  readonly params: WyrmParams;
  readonly palette: WyrmPalette;
  readonly root = new THREE.Group();
  /** The node the hurtboxes and tracers hang from. */
  readonly owner = new THREE.Group();
  readonly spine: WyrmSpine;
  readonly uniforms: WyrmUniforms;
  readonly materials: WyrmMaterials;
  readonly spineMesh: THREE.InstancedMesh;
  readonly spikeMesh: THREE.InstancedMesh | null;
  readonly headPivot = new THREE.Group();
  readonly headMesh: THREE.Mesh;
  readonly jawPivot = new THREE.Group();
  readonly jawMesh: THREE.Mesh;
  readonly boneMesh: THREE.InstancedMesh;
  readonly membraneMesh: THREE.Mesh;
  readonly legMesh: THREE.InstancedMesh | null;
  readonly breathPoints: THREE.Points;
  readonly coneDecal: THREE.Mesh;
  readonly chainMesh: THREE.InstancedMesh;
  readonly joints: Record<WyrmJoint, THREE.Object3D>;
  /** Weapon channels: the mouth (bite, spit, puff, dive) and the tail (whip). */
  readonly mouth: { object: THREE.Object3D; hilt: THREE.Object3D; tip: THREE.Object3D };
  readonly tailTip: { object: THREE.Object3D; hilt: THREE.Object3D; tip: THREE.Object3D };
  /** Joint half-lengths and radii, for the hurtbox defs. */
  readonly jointSize: Record<WyrmJoint, { half: number; radius: number }>;
  readonly frame: WingFrame;
  /** Draw calls at each LOD (excluding the decal, chains and breath when idle), for the budget tests. */
  lod = 0;
  /** Breath points per kind, after the quality cut. */
  readonly breathBudget: { flame: number; smoke: number };

  private readonly segRadius: number[];
  private readonly segLength: number;
  private readonly spikeCount: number;
  private readonly particles: Particle[] = [];
  private readonly rng: () => number;
  private readonly posAttr: THREE.BufferAttribute;
  private readonly sizeAttr: THREE.BufferAttribute;
  private readonly colorAttr: THREE.BufferAttribute;
  private chainTo: THREE.Vector3 | null = null;
  private emitCarry = 0;
  private disposed = false;
  private time = 0;
  // Scratch (rig-local).
  private readonly lp: THREE.Vector3[];
  private readonly lt: THREE.Vector3[];
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private readonly c = new THREE.Vector3();
  private readonly x = new THREE.Vector3();
  private readonly y = new THREE.Vector3();
  private readonly z = new THREE.Vector3();

  constructor(over: Partial<WyrmParams> = {}, opts: { lowQuality?: boolean } = {}) {
    const p = wyrmParams(over);
    this.params = p;
    this.palette = paletteOf(p.palette);
    const s = p.scale;
    this.spine = new WyrmSpine(p.segments, WYRM_SHAPE.bodyLength * s);
    this.uniforms = makeUniforms(this.palette, p.segments);
    this.materials = makeMaterials(this.uniforms);
    this.rng = seeded(p.seed);
    this.root.name = 'enemy-wyrm';
    this.owner.name = 'wyrm-rig';
    this.root.add(this.owner);
    this.segLength = this.spine.length / (p.segments - 1);
    this.segRadius = [];
    for (let i = 0; i < p.segments; i++) this.segRadius.push(WYRM_SHAPE.chestRadius * s * segmentProfile(i / (p.segments - 1)));

    // Spine (instanced, aSeg per instance).
    const sg = spineGeometry();
    const seg = new Float32Array(p.segments);
    for (let i = 0; i < p.segments; i++) seg[i] = i;
    sg.setAttribute('aSeg', new THREE.InstancedBufferAttribute(seg, 1));
    this.spineMesh = new THREE.InstancedMesh(sg, this.materials.scales, p.segments);
    this.spineMesh.name = 'wyrm-spine';
    this.spineMesh.castShadow = true;
    this.spineMesh.receiveShadow = true;
    this.spineMesh.frustumCulled = false;
    this.owner.add(this.spineMesh);

    this.spikeCount = p.spikes ? Math.floor(p.segments / 2) - 2 : 0;
    if (this.spikeCount > 0) {
      const kg = spikeGeometry();
      kg.setAttribute('aSeg', new THREE.InstancedBufferAttribute(new Float32Array(this.spikeCount).map((_, i) => 2 + i * 2), 1));
      this.spikeMesh = new THREE.InstancedMesh(kg, this.materials.scales, this.spikeCount);
      this.spikeMesh.name = 'wyrm-spikes';
      this.spikeMesh.frustumCulled = false;
      this.owner.add(this.spikeMesh);
    } else this.spikeMesh = null;

    // Head and jaw.
    this.headPivot.name = 'wyrm-head';
    this.headMesh = new THREE.Mesh(headGeometry(s, p.seed, p.crest), this.materials.scales);
    this.headMesh.name = 'wyrm-head-mesh';
    this.headMesh.frustumCulled = false;
    this.headPivot.add(this.headMesh);
    this.jawPivot.position.set(0, -0.08 * s, -0.22 * s);
    this.jawMesh = new THREE.Mesh(jawGeometry(s), this.materials.scales);
    this.jawMesh.name = 'wyrm-jaw';
    this.jawMesh.frustumCulled = false;
    this.jawPivot.add(this.jawMesh);
    this.headPivot.add(this.jawPivot);
    this.owner.add(this.headPivot);

    // Wings: 5 bones per wing, both membranes in one mesh.
    this.frame = wingFrame(s, p.wingspan);
    const bg = boneGeometry(PART.frame);
    this.boneMesh = new THREE.InstancedMesh(bg, this.materials.scales, 10);
    this.boneMesh.name = 'wyrm-wing-bones';
    this.boneMesh.castShadow = true;
    this.boneMesh.frustumCulled = false;
    this.owner.add(this.boneMesh);
    this.membraneMesh = new THREE.Mesh(membraneGeometry(s, p.wingspan), this.materials.membrane);
    this.membraneMesh.name = 'wyrm-membranes';
    this.membraneMesh.castShadow = true;
    this.membraneMesh.receiveShadow = true;
    this.membraneMesh.customDepthMaterial = this.materials.membraneDepth;
    this.membraneMesh.frustumCulled = false;
    this.owner.add(this.membraneMesh);

    // Legs: two pieces per leg.
    if (p.legs !== 'none') {
      this.legMesh = new THREE.InstancedMesh(boneGeometry(PART.frame), this.materials.scales, 8);
      this.legMesh.name = 'wyrm-legs';
      this.legMesh.frustumCulled = false;
      this.owner.add(this.legMesh);
    } else this.legMesh = null;

    // Breath: one Points for flame and smoke (Low quality halves the flame and drops the smoke).
    this.breathBudget = opts.lowQuality ? { flame: BREATH.flame / 2, smoke: 0 } : { flame: BREATH.flame, smoke: BREATH.smoke };
    const total = this.breathBudget.flame + this.breathBudget.smoke;
    const pg = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(new Float32Array(total * 3), 3);
    this.sizeAttr = new THREE.BufferAttribute(new Float32Array(total), 1);
    this.colorAttr = new THREE.BufferAttribute(new Float32Array(total * 4), 4);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    this.sizeAttr.setUsage(THREE.DynamicDrawUsage);
    this.colorAttr.setUsage(THREE.DynamicDrawUsage);
    pg.setAttribute('position', this.posAttr);
    pg.setAttribute('aSize', this.sizeAttr);
    pg.setAttribute('aColor', this.colorAttr);
    this.breathPoints = new THREE.Points(pg, this.materials.breath);
    this.breathPoints.name = 'wyrm-breath';
    this.breathPoints.frustumCulled = false;
    this.breathPoints.visible = false;
    for (let i = 0; i < total; i++) this.particles.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 1, life: 0, size: 0 });
    this.owner.add(this.breathPoints);

    this.coneDecal = new THREE.Mesh(coneDecalGeometry(0.28), this.materials.decal);
    this.coneDecal.name = 'wyrm-spit-cone';
    this.coneDecal.visible = false;
    this.coneDecal.renderOrder = 2;
    this.owner.add(this.coneDecal);

    this.chainMesh = new THREE.InstancedMesh(linkGeometry(), this.materials.scales, CHAIN_LINKS);
    this.chainMesh.name = 'wyrm-chain';
    this.chainMesh.frustumCulled = false;
    this.chainMesh.visible = false;
    this.owner.add(this.chainMesh);

    // Hurtbox joints and their capsule sizes.
    const r = WYRM_SHAPE.chestRadius * s;
    const wingL = WYRM_SHAPE.wingLength * s * p.wingspan;
    this.jointSize = {
      head: { half: WYRM_SHAPE.headLength * s * 0.34, radius: 0.3 * s },
      neck: { half: this.spine.length * 0.09, radius: r * 0.75 },
      torso: { half: this.spine.length * 0.14, radius: r * 1.05 },
      belly: { half: this.spine.length * 0.1, radius: r * 0.8 },
      tail: { half: this.spine.length * 0.17, radius: r * 0.55 },
      tailTip: { half: this.spine.length * 0.07, radius: r * 0.35 },
      wingL: { half: wingL * 0.33, radius: 0.32 * s * p.wingspan },
      wingR: { half: wingL * 0.33, radius: 0.32 * s * p.wingspan },
    };
    const joints = {} as Record<WyrmJoint, THREE.Object3D>;
    for (const j of WYRM_JOINTS) {
      const o = new THREE.Object3D();
      o.name = j;
      this.owner.add(o);
      joints[j] = o;
    }
    this.joints = joints;
    this.mouth = channel('wyrm-mouth', this.owner);
    this.tailTip = channel('wyrm-tail-whip', this.owner);

    this.lp = [];
    this.lt = [];
    for (let i = 0; i < p.segments; i++) {
      this.lp.push(new THREE.Vector3());
      this.lt.push(new THREE.Vector3());
    }
    // Lay the body straight behind a standing head and pose once, so a fresh rig is valid before its first tick.
    const head = this.headWorld({ x: 0, y: 0, z: 0, yaw: 0 }, 0, restPose());
    this.spine.reset(head, { x: 0, y: -0.3, z: 1 });
    this.apply({ x: 0, y: 0, z: 0, yaw: 0 }, restPose(), 0);
  }

  get disposedYet(): boolean {
    return this.disposed;
  }

  /** Every material of the rig (the body tints and fades these). */
  get allMaterials(): THREE.Material[] {
    return this.materials.all;
  }

  /** Draw calls this rig issues now in the colour pass (visible meshes; breath, decal and chain counted when shown). */
  drawCalls(): { color: number; shadow: number } {
    let color = 0;
    let shadow = 0;
    this.owner.traverseVisible((o) => {
      const m = o as THREE.Mesh;
      if (!(m.isMesh || (o as THREE.Points).isPoints)) return;
      if ((m as THREE.InstancedMesh).isInstancedMesh && (m as THREE.InstancedMesh).count === 0) return;
      color++;
      if (m.castShadow) shadow++;
    });
    return { color, shadow };
  }

  /** The head point the spine follows, world, for a root frame, an altitude and a pose. */
  headWorld(root: RootFrame, altitude: number, pose: WyrmPose, out: Vec3Like = { x: 0, y: 0, z: 0 }): Vec3Like {
    const s = this.params.scale;
    const fwd = WYRM_SHAPE.headForward * s;
    const h = WYRM_SHAPE.headHeight * s + altitude + Math.sin(pose.headPitch) * 0.3 * s;
    const yaw = root.yaw + pose.headYaw * 0.3;
    out.x = root.x - Math.sin(yaw) * fwd;
    out.y = root.y + h;
    out.z = root.z - Math.cos(yaw) * fwd;
    return out;
  }

  /**
   * Lays the body straight behind the head, level, along the root's facing (a spawn, a teleport, a landing). The
   * root faces -Z at yaw 0, so the body runs back along +Z turned by `yaw`.
   */
  resetSpine(root: RootFrame, altitude: number, pose: WyrmPose): void {
    const head = this.headWorld(root, altitude, pose);
    this.spine.reset(head, { x: Math.sin(root.yaw), y: 0, z: Math.cos(root.yaw) });
  }

  /** Chains the collar to `post` (world), or removes the chain with null. */
  setChain(post: Vec3Like | null): void {
    this.chainTo = post ? new THREE.Vector3(post.x, post.y, post.z) : null;
    this.chainMesh.visible = !!post;
  }

  /**
   * One fixed tick: the spine (already stepped by the caller) and the pose drawn relative to `root`. `dt` advances the
   * breath and the crack pulse. `visual` false (LOD 2 on alternate ticks) writes only the hurtbox and weapon joints.
   */
  apply(root: RootFrame, pose: WyrmPose, dt: number, visual = true): void {
    if (this.disposed) return;
    this.time = (this.time + (dt > 0 ? dt : 0)) % 1000;
    const u = this.uniforms;
    u.uWyrmTime.value = this.time;
    u.uMouth.value = clamp01(pose.mouth);
    u.uFlash.value = clamp01(pose.flash);
    u.uTailGlow.value = clamp01(pose.tailGlow);
    const n = this.params.segments;
    const s = this.params.scale;
    const cy = Math.cos(root.yaw);
    const sy = Math.sin(root.yaw);
    // World to rig-local (inverse of the root's yaw and position), then the knockdown roll about the body axis.
    for (let i = 0; i < n; i++) {
      const wx = this.spine.positions[i * 3]! - root.x;
      const wy = this.spine.positions[i * 3 + 1]! - root.y;
      const wz = this.spine.positions[i * 3 + 2]! - root.z;
      this.lp[i]!.set(cy * wx - sy * wz, wy, sy * wx + cy * wz);
      const tx = this.spine.tangents[i * 3]!;
      const ty = this.spine.tangents[i * 3 + 1]!;
      const tz = this.spine.tangents[i * 3 + 2]!;
      this.lt[i]!.set(cy * tx - sy * tz, ty, sy * tx + cy * tz);
    }
    if (pose.roll !== 0) {
      TMP_Q.setFromAxisAngle(this.b.set(0, 0, 1), pose.roll);
      for (let i = 0; i < n; i++) {
        const lift = this.segRadius[i]!;
        this.lp[i]!.y -= lift * Math.abs(Math.sin(pose.roll)) * 0.5;
        this.lt[i]!.applyQuaternion(TMP_Q);
      }
    }

    if (pose.whip !== 0) {
      // The tail whip: everything behind the chest swings round it in the ground plane, the tip furthest.
      const ci = Math.round(0.3 * (n - 1));
      const chest = this.lp[ci]!;
      for (let i = ci + 1; i < n; i++) {
        const w = pose.whip * Math.min(1, (i - ci) / Math.max(1, n - 1 - ci) * 1.6);
        const c = Math.cos(w);
        const sn = Math.sin(w);
        const p = this.lp[i]!;
        const dx = p.x - chest.x;
        const dz = p.z - chest.z;
        p.x = chest.x + c * dx + sn * dz;
        p.z = chest.z - sn * dx + c * dz;
        const t = this.lt[i]!;
        const tx = t.x;
        t.x = c * tx + sn * t.z;
        t.z = -sn * tx + c * t.z;
      }
    }

    if (visual) this.writeBody(pose);
    // Head on segment 0, looking along the tangent, with the pose's pitch and yaw.
    this.basis(this.lt[0]!, pose.roll);
    TMP_M.makeBasis(this.x, this.y, this.z);
    TMP_Q.setFromRotationMatrix(TMP_M);
    // The head looks along +tangent; head space looks along -Z: turn half a circle about Y.
    TMP_Q.multiply(HALF_TURN);
    TMP_Q.multiply(TMP_Q2.setFromEuler(TMP_E.set(pose.headPitch, pose.headYaw, 0, 'YXZ')));
    this.headPivot.quaternion.copy(TMP_Q);
    this.headPivot.position.copy(this.lp[0]!);
    this.jawPivot.rotation.x = 0.55 * clamp01(pose.jaw);

    // Wings at the shoulders.
    const shoulderI = Math.round(WYRM_SHAPE.shoulderAt * (n - 1));
    const sp = this.lp[shoulderI]!;
    this.basis(this.lt[shoulderI]!, pose.roll);
    const rr = this.segRadius[shoulderI]!;
    const fold = clamp01(pose.fold);
    for (const side of [-1, 1] as const) {
      const W = side < 0 ? u.uWingL.value : u.uWingR.value;
      // Wing space: x out along the body's right (the left geometry is mirrored), y up, z back (-tangent).
      this.b.copy(this.x).negate();
      this.a.copy(sp).addScaledVector(this.b, side * rr * 0.75).addScaledVector(this.y, rr * 0.45);
      this.c.copy(this.z).negate();
      W.makeBasis(this.b, this.y, this.c);
      TMP_M.makeRotationZ(side * (pose.flap + fold * 0.5));
      W.multiply(TMP_M);
      W.setPosition(this.a);
    }
    u.uFold.value = fold;
    u.uBillow.value = this.lod === 0 ? 0.18 * s * this.params.wingspan * clamp01(pose.billow) : 0;
    u.uPhase.value = this.time * 7;
    if (visual) {
      this.writeWingBones(fold);
      if (this.legMesh) this.writeLegs(pose);
    }
    this.joints_(fold);
    this.channels(root, pose, dt, visual);
  }

  /** Spine and spikes. */
  private writeBody(pose: WyrmPose): void {
    const n = this.params.segments;
    // Spine: every segment at full detail, every other one (twice as long) past 40 m.
    const step = this.lod >= 1 ? 2 : 1;
    const segAttr = this.spineMesh.geometry.getAttribute('aSeg') as THREE.InstancedBufferAttribute;
    const segs = segAttr.array as Float32Array;
    let k = 0;
    for (let j = 0; j < n; j += step) {
      // Past 40 m every other segment, and always the tail tip.
      const i = step > 1 && j + step >= n ? n - 1 : j;
      if (segs[k] !== i) {
        segs[k] = i;
        segAttr.needsUpdate = true;
      }
      this.basis(this.lt[i]!, pose.roll);
      const r = this.segRadius[i]!;
      TMP_S.set(r, r * 0.86, Math.max(r, this.segLength * 0.78 * step));
      TMP_M.makeBasis(this.x, this.y, this.z).scale(TMP_S).setPosition(this.lp[i]!);
      this.spineMesh.setMatrixAt(k++, TMP_M);
    }
    this.spineMesh.count = k;
    this.spineMesh.instanceMatrix.needsUpdate = true;

    if (this.spikeMesh) {
      this.spikeMesh.visible = this.lod === 0;
      if (this.lod === 0) {
        for (let j = 0; j < this.spikeCount; j++) {
          const i = 2 + j * 2;
          this.basis(this.lt[i]!, pose.roll);
          const r = this.segRadius[i]!;
          const h = r * (0.55 + 0.25 * Math.sin(i * 1.7 + this.params.seed));
          this.a.copy(this.lp[i]!).addScaledVector(this.y, r * 0.75);
          // Spikes lean back toward the tail.
          TMP_Q.setFromRotationMatrix(TMP_M.makeBasis(this.x, this.y, this.z));
          TMP_Q.multiply(TMP_Q2.setFromAxisAngle(this.c.set(1, 0, 0), SPIKE_LEAN));
          TMP_M.compose(this.a, TMP_Q, TMP_S.set(r * 0.4, h, r * 0.4));
          this.spikeMesh.setMatrixAt(j, TMP_M);
        }
        this.spikeMesh.instanceMatrix.needsUpdate = true;
      }
    }
  }

  private joints_(fold: number): void {
    const u = this.uniforms;
    const n = this.params.segments;
    const s = this.params.scale;
    // Joints for the hurtboxes.
    this.placeJoint('head', this.headPivot.position, this.headDir(), WYRM_SHAPE.headLength * s * 0.25);
    this.placeSpan('neck', Math.round(0.02 * (n - 1)), Math.round(0.16 * (n - 1)));
    this.placeSpan('torso', Math.round(0.14 * (n - 1)), Math.round(0.42 * (n - 1)));
    this.placeSpan('belly', Math.round(0.18 * (n - 1)), Math.round(0.4 * (n - 1)));
    this.joints.belly.position.y -= this.segRadius[Math.round(0.3 * (n - 1))]! * 0.45;
    this.placeSpan('tail', Math.round(0.45 * (n - 1)), Math.round(0.85 * (n - 1)));
    this.placeSpan('tailTip', Math.round(0.85 * (n - 1)), n - 1);
    for (const side of [-1, 1] as const) {
      const W = side < 0 ? u.uWingL.value : u.uWingR.value;
      const L = WYRM_SHAPE.wingLength * s * this.params.wingspan * (1 - 0.6 * fold);
      const C = WYRM_SHAPE.wingChord * s * this.params.wingspan;
      this.a.set(side * 0.15 * L, 0, 0.3 * C).applyMatrix4(W);
      this.b.set(side * 0.82 * L, 0, 0.3 * C).applyMatrix4(W);
      this.placeBetween(side < 0 ? 'wingL' : 'wingR', this.a, this.b);
    }
  }

  private channels(root: RootFrame, pose: WyrmPose, dt: number, visual: boolean): void {
    const n = this.params.segments;
    const s = this.params.scale;
    // Weapon channels: the mouth tracer reaches `breathReach` (or a bite's length) along the head's facing.
    const hd = this.headDir();
    const mouthAt = this.a.copy(this.headPivot.position).addScaledVector(hd, WYRM_SHAPE.headLength * s * 0.8);
    this.mouth.hilt.position.copy(mouthAt).addScaledVector(hd, -WYRM_SHAPE.headLength * s * 0.3);
    const reach = pose.breathReach > 0 ? pose.breathReach : WYRM_SHAPE.headLength * s * 0.9;
    this.mouth.tip.position.copy(mouthAt).addScaledVector(hd, reach);
    if (pose.breathReach > 0) {
      // The jet falls toward the ground: aim its far end at the ground below the reach (never above the mouth).
      this.mouth.tip.position.y = Math.min(mouthAt.y, Math.max(0.3 * s, mouthAt.y - reach * 0.45));
    }
    const tailI = n - 1;
    const midTail = Math.round(0.7 * (n - 1));
    // The tail channel runs along the tail itself (bent round the chest by a whip in `apply`).
    this.tailTip.hilt.position.copy(this.lp[midTail]!);
    this.tailTip.tip.position.copy(this.lp[tailI]!);

    // Spit cone decal: on the ground under the jet, filling with the inhale.
    const cone = clamp01(pose.cone);
    this.coneDecal.visible = cone > 0.001;
    if (this.coneDecal.visible) {
      const len = Math.max(0.5, pose.coneReach) * (0.35 + 0.65 * cone);
      this.coneDecal.position.set(mouthAt.x, 0.06, mouthAt.z);
      this.coneDecal.rotation.set(0, Math.atan2(-hd.x, -hd.z), 0);
      this.coneDecal.scale.set(len, 1, len);
      this.materials.decal.opacity = 0.15 + 0.45 * cone;
    }

    if (visual) {
      this.stepBreath(dt, mouthAt, hd, pose);
      if (this.chainTo) this.writeChain(root);
    }

    // Shadows: spine, wing bones and membranes up close; the membranes stop past 40 m, everything past 90 m.
    const shadows = this.lod < 2;
    this.spineMesh.castShadow = shadows;
    this.boneMesh.castShadow = shadows;
    this.membraneMesh.castShadow = this.lod === 0;
    this.root.updateMatrixWorld(true);
  }

  /** Releases geometry and materials and leaves the scene. Idempotent. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      if ((m as THREE.InstancedMesh).isInstancedMesh) (m as THREE.InstancedMesh).dispose();
    });
    for (const m of this.materials.all) m.dispose();
    this.root.removeFromParent();
  }

  // ---- internals --------------------------------------------------------------------------------

  /** this.z = tangent (toward the head), this.x = the body's left (so x, y, z stay right-handed), this.y = up, with `roll` about the tangent. */
  private basis(t: THREE.Vector3, roll: number): void {
    this.z.copy(t).normalize();
    this.x.crossVectors(UP, this.z);
    if (this.x.lengthSq() < 1e-8) this.x.set(1, 0, 0);
    this.x.normalize();
    this.y.crossVectors(this.z, this.x).normalize();
    if (roll !== 0) {
      TMP_Q.setFromAxisAngle(this.z, roll);
      this.x.applyQuaternion(TMP_Q);
      this.y.applyQuaternion(TMP_Q);
    }
  }

  private headDir(): THREE.Vector3 {
    return this.c.set(0, 0, -1).applyQuaternion(this.headPivot.quaternion).normalize();
  }

  private placeJoint(name: WyrmJoint, at: THREE.Vector3, dir: THREE.Vector3, ahead: number): void {
    const o = this.joints[name];
    o.position.copy(at).addScaledVector(dir, ahead);
    o.quaternion.setFromUnitVectors(this.b.set(0, 0, 1), dir);
  }

  private placeSpan(name: WyrmJoint, i0: number, i1: number): void {
    this.placeBetween(name, this.lp[i0]!, this.lp[i1]!);
  }

  private placeBetween(name: WyrmJoint, a: THREE.Vector3, b: THREE.Vector3): void {
    const o = this.joints[name];
    o.position.copy(a).add(b).multiplyScalar(0.5);
    const d = this.y.copy(b).sub(a);
    if (d.lengthSq() < 1e-10) d.set(0, 0, 1);
    o.quaternion.setFromUnitVectors(this.c.set(0, 0, 1), d.normalize());
  }

  private writeWingBones(fold: number): void {
    const f = this.frame;
    const s = this.params.scale;
    const r = 0.05 * s * this.params.wingspan;
    let k = 0;
    for (const side of [-1, 1] as const) {
      const W = side < 0 ? this.uniforms.uWingL.value : this.uniforms.uWingR.value;
      const pt = (v: THREE.Vector3, out: THREE.Vector3) => out.set(side * v.x * (1 - 0.6 * fold), v.y, v.z * (1 - 0.3 * fold)).applyMatrix4(W);
      const segs: Array<[THREE.Vector3, THREE.Vector3, number]> = [
        [f.shoulder, f.elbow, 1.3],
        [f.elbow, f.wrist, 1.1],
        [f.wrist, f.tips[0], 0.7],
        [f.wrist, f.tips[1], 0.6],
        [f.wrist, f.tips[2], 0.55],
      ];
      for (const [from, to, w] of segs) {
        const a = pt(from, new THREE.Vector3());
        const b = pt(to, new THREE.Vector3());
        this.boneMesh.setMatrixAt(k++, segmentMatrix(a, b, r * w));
      }
    }
    this.boneMesh.instanceMatrix.needsUpdate = true;
  }

  private writeLegs(pose: WyrmPose): void {
    const legs = this.legMesh!;
    const n = this.params.segments;
    const s = this.params.scale * (this.params.legs === 'small' ? 0.7 : 1);
    const L = WYRM_SHAPE.legLength * s;
    const tuck = clamp01(pose.legTuck);
    let k = 0;
    for (const [at, phase] of [[WYRM_SHAPE.shoulderAt + 0.04, 0], [WYRM_SHAPE.hipAt, Math.PI]] as const) {
      const i = Math.round(at * (n - 1));
      const p = this.lp[i]!;
      this.basis(this.lt[i]!, pose.roll);
      const r = this.segRadius[i]!;
      for (const side of [-1, 1] as const) {
        const hip = this.a.copy(p).addScaledVector(this.x, -side * r * 0.7).addScaledVector(this.y, -r * 0.35);
        const swing = Math.sin(pose.legPhase + phase + (side > 0 ? Math.PI : 0)) * 0.25 * L;
        // Standing: the foot on the ground (rig-local y 0) below the hip; tucked: folded back under the belly.
        const foot = this.b.copy(hip).addScaledVector(this.z, swing).addScaledVector(this.x, -side * 0.15 * L);
        foot.y = Math.min(hip.y - 0.2 * L, Math.max(0.02, hip.y - L * 1.2));
        if (tuck > 0) {
          const tucked = new THREE.Vector3().copy(hip).addScaledVector(this.z, -0.7 * L).addScaledVector(this.y, -0.15 * L);
          foot.lerp(tucked, tuck);
        }
        const knee = this.c.copy(hip).lerp(foot, 0.5).addScaledVector(this.z, 0.18 * L).addScaledVector(this.x, -side * 0.1 * L);
        const rad = 0.09 * s;
        legs.setMatrixAt(k++, segmentMatrix(hip, knee, rad));
        legs.setMatrixAt(k++, segmentMatrix(knee, foot, rad * 0.75));
      }
    }
    legs.instanceMatrix.needsUpdate = true;
  }

  private stepBreath(dt: number, mouth: THREE.Vector3, dir: THREE.Vector3, pose: WyrmPose): void {
    const parts = this.particles;
    const flameN = this.breathBudget.flame;
    const smokeN = this.breathBudget.smoke;
    const total = flameN + smokeN;
    let alive = 0;
    if (dt > 0) {
      // Emit flame while breathing (the jet), smoke as the flame dies.
      const reach = Math.max(1, pose.breathReach);
      if (pose.breath > 0) {
        this.emitCarry += dt * flameN * 2.2 * clamp01(pose.breath);
        while (this.emitCarry >= 1) {
          this.emitCarry -= 1;
          const p = this.free(0, flameN);
          if (!p) break;
          const spread = 0.12;
          const speed = reach / 0.45;
          p.x = mouth.x;
          p.y = mouth.y;
          p.z = mouth.z;
          p.vx = (dir.x + (this.rng() - 0.5) * spread) * speed;
          p.vy = (dir.y + (this.rng() - 0.5) * spread) * speed - reach * 0.6;
          p.vz = (dir.z + (this.rng() - 0.5) * spread) * speed;
          p.age = 0;
          p.life = 0.45;
          p.size = (0.35 + this.rng() * 0.25) * this.params.scale;
        }
      } else this.emitCarry = 0;
      for (let i = 0; i < total; i++) {
        const p = parts[i]!;
        if (p.age >= p.life) continue;
        p.age += dt;
        p.x += p.vx * dt;
        p.y = Math.max(0.05, p.y + p.vy * dt);
        p.z += p.vz * dt;
        if (i < flameN && p.age >= p.life && smokeN > 0) {
          const q = this.free(flameN, total);
          if (q) {
            q.x = p.x;
            q.y = p.y;
            q.z = p.z;
            q.vx = p.vx * 0.1;
            q.vy = 0.8 * this.params.scale;
            q.vz = p.vz * 0.1;
            q.age = 0;
            q.life = 1.0;
            q.size = p.size * 1.4;
          }
        }
      }
    }
    const pa = this.posAttr.array as Float32Array;
    const sa = this.sizeAttr.array as Float32Array;
    const ca = this.colorAttr.array as Float32Array;
    for (let i = 0; i < total; i++) {
      const p = parts[i]!;
      const live = p.age < p.life;
      if (live) alive++;
      const t = live ? p.age / p.life : 1;
      pa[i * 3] = p.x;
      pa[i * 3 + 1] = p.y;
      pa[i * 3 + 2] = p.z;
      sa[i] = live ? p.size * (i < flameN ? 1 + t : 1 + 2 * t) : 0;
      if (i < flameN) {
        ca[i * 4] = 1;
        ca[i * 4 + 1] = 0.75 - 0.5 * t;
        ca[i * 4 + 2] = 0.25 - 0.2 * t;
        ca[i * 4 + 3] = live ? 0.9 * (1 - t) : 0;
      } else {
        ca[i * 4] = 0.18;
        ca[i * 4 + 1] = 0.16;
        ca[i * 4 + 2] = 0.15;
        ca[i * 4 + 3] = live ? 0.35 * (1 - t) : 0;
      }
    }
    this.posAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
    this.colorAttr.needsUpdate = true;
    this.breathPoints.visible = alive > 0;
  }

  /** Live breath particles (tests). */
  get breathAlive(): number {
    let n = 0;
    for (const p of this.particles) if (p.age < p.life) n++;
    return n;
  }

  private free(from: number, to: number): Particle | null {
    for (let i = from; i < to; i++) {
      const p = this.particles[i]!;
      if (p.age >= p.life) return p;
    }
    return null;
  }

  private writeChain(root: RootFrame): void {
    const to = this.chainTo!;
    // The post in rig-local space.
    const wx = to.x - root.x;
    const wy = to.y - root.y;
    const wz = to.z - root.z;
    const cy = Math.cos(root.yaw);
    const sy = Math.sin(root.yaw);
    const post = this.b.set(cy * wx - sy * wz, wy, sy * wx + cy * wz);
    const collar = this.a.copy(this.lp[Math.min(2, this.lp.length - 1)]!);
    const span = collar.distanceTo(post);
    const linkLen = span / CHAIN_LINKS;
    const size = Math.max(0.04, Math.min(linkLen * 0.9, 0.12 * this.params.scale));
    const prev = new THREE.Vector3().copy(collar);
    for (let i = 0; i < CHAIN_LINKS; i++) {
      const t = (i + 1) / CHAIN_LINKS;
      const p = new THREE.Vector3().lerpVectors(collar, post, t);
      // A shallow sag in the middle.
      p.y -= Math.sin(Math.PI * t) * span * 0.08;
      const dir = new THREE.Vector3().subVectors(p, prev);
      if (dir.lengthSq() < 1e-10) dir.set(0, 0, 1);
      TMP_Q.setFromUnitVectors(this.c.set(1, 0, 0), dir.normalize());
      if (i % 2 === 1) TMP_Q.multiply(new THREE.Quaternion().setFromAxisAngle(this.c.set(1, 0, 0), Math.PI / 2));
      TMP_M.compose(new THREE.Vector3().lerpVectors(prev, p, 0.5), TMP_Q, TMP_S.set(size, size, size));
      this.chainMesh.setMatrixAt(i, TMP_M);
      prev.copy(p);
    }
    this.chainMesh.instanceMatrix.needsUpdate = true;
  }
}

function channel(name: string, parent: THREE.Object3D): { object: THREE.Object3D; hilt: THREE.Object3D; tip: THREE.Object3D } {
  const object = new THREE.Object3D();
  object.name = name;
  const hilt = new THREE.Object3D();
  hilt.name = `${name}-hilt`;
  const tip = new THREE.Object3D();
  tip.name = `${name}-tip`;
  // Hilt and tip are positioned in rig space directly (the channel object stays at the rig's origin).
  object.add(hilt, tip);
  parent.add(object);
  return { object, hilt, tip };
}

/** A tapered-bone instance from a to b with base radius r (the bone geometry runs z 0..1). */
const SEG_D = new THREE.Vector3();
const SEG_Q = new THREE.Quaternion();
const SEG_S = new THREE.Vector3();
const SEG_M = new THREE.Matrix4();
const Z_AXIS = new THREE.Vector3(0, 0, 1);

/** A unit bone (z 0..1) stretched from `a` to `b` with radius `r`. Returns a shared matrix: use it before the next call. */
function segmentMatrix(a: THREE.Vector3, b: THREE.Vector3, r: number): THREE.Matrix4 {
  const d = SEG_D.subVectors(b, a);
  const len = Math.max(1e-4, d.length());
  SEG_Q.setFromUnitVectors(Z_AXIS, d.multiplyScalar(1 / len));
  return SEG_M.compose(a, SEG_Q, SEG_S.set(r, r, len));
}

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
}
