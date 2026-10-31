import * as THREE from 'three';
import { HurtboxSet } from '../../combat/HurtboxSet';
import type { HurtboxDef } from '../../combat/types';
import { LOOK } from './tuning';

export interface MurkjawModel {
  /** Origin = the surfacing point at the water's surface; yaw 0 faces -Z (toward the walkway he lunges at). */
  readonly root: THREE.Group;
  /** The hurtbox owner. */
  readonly owner: THREE.Object3D;
  /** The head and the first four segments. */
  readonly hurtboxes: HurtboxSet;
  /** 0 = under the water (hidden), 1 = reared up out of it. */
  setEmergence(e: number): void;
  /** 0..1 of a lunge `length` metres along -Z: at 1 the head lies on the walkway (`deck` metres above the water). */
  setReach(t: number, length: number): void;
  /** 0..1 belly-up (the death roll). */
  setRoll(r: number): void;
  setOpacity(o: number): void;
  faceToward(x: number, z: number): void;
  /** Advances the travelling wave along the chain. */
  update(dt: number): void;
  headWorld(out: THREE.Vector3): THREE.Vector3;
  dispose(): void;
}

/** Below this emergence, with no reach, the whole eel is hidden (he is under the water). */
export const HIDE_BELOW = 0.05;
export const HEAD_BONE = 'murkjaw-head';
export const segmentBone = (i: number): string => (i === 0 ? HEAD_BONE : `murkjaw-seg-${i}`);
/** The walkway stands this far above the channel water (K3: surface 0.3 m below the walkway). */
export const DECK = 0.3;
/** How many segments, the head first, carry hurtboxes. */
export const HURT_SEGMENTS = 5;
const TEETH = 16;

/** The reared pose: the head high over the spot, the neck curving down into the water and the body trailing under it. */
const REAR_SPINE: readonly [number, number, number][] = [
  [0, 2.8, -0.8],
  [0, 2.2, 0.3],
  [0, 0.9, 1.2],
  [0, -0.4, 2.0],
  [0, -1.4, 3.5],
  [0, -2.0, 8],
  [0, -2.2, 18],
];

/**
 * A procedural eel (plans/act3-K8.md 3.6): a chain of spheres tapering from the head to the tail, peat brown with a pale belly
 * stripe, two pale eyes and an instanced lamprey ring of teeth, moved by a travelling sine gait. Plain materials (no shader
 * noise, so the far-coordinates rule has nothing to sample). A glb under the same id can replace it later (Q10).
 */
export function buildMurkjawModel(): MurkjawModel {
  const root = new THREE.Group();
  root.name = 'murkjaw';
  const body = new THREE.Group();
  body.name = 'murkjaw-body';
  root.add(body);

  const sphere = new THREE.SphereGeometry(1, 16, 12);
  const tooth = new THREE.ConeGeometry(0.06, 0.28, 5);
  const skin = new THREE.MeshStandardMaterial({ color: LOOK.skin, roughness: 0.55, metalness: 0.05 });
  const belly = new THREE.MeshStandardMaterial({ color: LOOK.belly, roughness: 0.7 });
  const eye = new THREE.MeshStandardMaterial({ color: LOOK.eye, emissive: LOOK.eye, emissiveIntensity: 0.6 });
  const toothMat = new THREE.MeshStandardMaterial({ color: LOOK.tooth, roughness: 0.4 });
  const materials = [skin, belly, eye, toothMat];

  const n = LOOK.segments;
  const radius = (i: number) => THREE.MathUtils.lerp(LOOK.headRadius, LOOK.tailRadius, Math.pow(i / (n - 1), 0.8));
  const nodes: THREE.Object3D[] = [];
  for (let i = 0; i < n; i++) {
    const node = new THREE.Object3D();
    node.name = segmentBone(i);
    const r = radius(i);
    const m = new THREE.Mesh(sphere, skin);
    m.scale.set(r, r * 0.9, r * (i === 0 ? 1.25 : 1.1));
    const b = new THREE.Mesh(sphere, belly);
    b.scale.set(r * 0.7, r * 0.45, r * 0.95);
    b.position.y = -r * 0.5;
    node.add(m, b);
    body.add(node);
    nodes.push(node);
  }
  const head = nodes[0];
  const r0 = radius(0);
  for (const side of [-1, 1]) {
    const e = new THREE.Mesh(sphere, eye);
    e.scale.setScalar(r0 * 0.14);
    e.position.set(side * r0 * 0.55, r0 * 0.45, -r0 * 0.75);
    head.add(e);
  }
  const teeth = new THREE.InstancedMesh(tooth, toothMat, TEETH);
  teeth.name = 'murkjaw-teeth';
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  for (let k = 0; k < TEETH; k++) {
    const a = (k / TEETH) * Math.PI * 2;
    // Around the round mouth at the front of the head, each tooth pointing inward and back into the throat.
    const pos = new THREE.Vector3(Math.cos(a) * r0 * 0.55, Math.sin(a) * r0 * 0.5, -r0 * 1.2);
    const inward = new THREE.Vector3(-Math.cos(a), -Math.sin(a), 0.6).normalize();
    q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), inward);
    teeth.setMatrixAt(k, m4.compose(pos, q, new THREE.Vector3(1, 1, 1)));
  }
  teeth.instanceMatrix.needsUpdate = true;
  head.add(teeth);

  const curve = new THREE.CatmullRomCurve3(REAR_SPINE.map(([x, y, z]) => new THREE.Vector3(x, y, z)), false, 'centripetal');
  const curveLen = curve.getLength();
  const rear = nodes.map((_, i) => curve.getPointAt(Math.min(1, (i * LOOK.spacing) / curveLen)));

  let emergence = 0;
  let reach = 0;
  let reachLen = 0;
  let roll = 0;
  let t = 0;
  let opacity = 1;
  let disposed = false;
  const under = new THREE.Vector3();
  const lunge = new THREE.Vector3();

  const layout = (): void => {
    for (let i = 0; i < n; i++) {
      const r = radius(i);
      const k = i / (n - 1);
      under.set(0, -LOOK.under - r - k * 0.6, i * LOOK.spacing);
      const z = -reachLen + i * LOOK.spacing;
      // Flat on the walkway and over the water ahead of the spot, sloping down into the channel behind it.
      const y = z < 0 ? DECK + r * 0.5 : DECK + r * 0.5 - z * 0.35;
      lunge.set(0, y, z);
      const p = nodes[i].position;
      p.lerpVectors(under, rear[i], emergence);
      p.lerp(lunge, reach);
      const amp = 0.28 * (0.25 + 0.75 * k) * (1 - 0.6 * reach);
      p.x += Math.sin(t * 2.4 - i * 0.55) * amp;
      p.y += Math.sin(t * 1.3 - i * 0.4) * 0.05 * emergence;
    }
    // The head pitches down at the walkway as he rears, flat once lunged.
    head.rotation.x = -0.45 * emergence * (1 - reach);
    body.rotation.z = roll * Math.PI;
    root.visible = emergence >= HIDE_BELOW || reach > 0;
  };

  layout();
  root.updateMatrixWorld(true);
  const defs: HurtboxDef[] = nodes.slice(0, HURT_SEGMENTS).map((node, i) => ({
    name: i === 0 ? 'head' : `segment${i}`,
    bone: node.name,
    start: { x: 0, y: 0, z: -radius(i) * 0.4 },
    end: { x: 0, y: 0, z: radius(i) * 0.4 },
    radius: radius(i) * 0.95,
  }));
  const hurtboxes = new HurtboxSet(root, defs, body);
  const headPos = new THREE.Vector3();
  const clamp01 = (v: number, d: number) => THREE.MathUtils.clamp(Number.isFinite(v) ? v : d, 0, 1);

  return {
    root,
    owner: body,
    hurtboxes,
    setEmergence(e) {
      emergence = clamp01(e, 0);
      layout();
    },
    setReach(v, length) {
      reach = clamp01(v, 0);
      reachLen = Number.isFinite(length) && length > 0 ? length : 0;
      layout();
    },
    setRoll(r) {
      roll = clamp01(r, 0);
      layout();
    },
    setOpacity(o) {
      opacity = clamp01(o, 1);
      const transparent = opacity < 1;
      for (const m of materials) {
        if (m.transparent !== transparent) m.needsUpdate = true;
        m.transparent = transparent;
        m.opacity = opacity;
      }
    },
    faceToward(x, z) {
      const dx = x - root.position.x;
      const dz = z - root.position.z;
      if (!Number.isFinite(dx) || !Number.isFinite(dz) || Math.hypot(dx, dz) < 1e-6) return;
      root.rotation.y = Math.atan2(-dx, -dz);
    },
    update(dt) {
      if (!(dt > 0) || !Number.isFinite(dt)) return;
      t += dt;
      layout();
    },
    headWorld(out) {
      root.updateMatrixWorld(true);
      headPos.copy(head.position);
      return out.copy(body.localToWorld(headPos));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      hurtboxes.dispose();
      sphere.dispose();
      tooth.dispose();
      teeth.dispose();
      for (const m of materials) m.dispose();
      root.removeFromParent();
    },
  };
}
