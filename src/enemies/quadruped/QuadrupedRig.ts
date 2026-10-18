import * as THREE from 'three';
import { LEG_IDS, type LegId } from './gait';
import { quadrupedDims, type QuadrupedDims, type QuadrupedParams } from './params';

/** Names of the rig's joints and meshes. Legs: `leg<ID>` is the hip joint (upper segment), `leg<ID>Knee` the lower joint. */
export const RIG_NAMES = {
  root: 'quadruped',
  spine: 'spine',
  neck: 'neck',
  head: 'head',
  tail: 'tail',
  leg: (id: LegId) => `leg${id}`,
  knee: (id: LegId) => `leg${id}Knee`,
  upperMesh: (id: LegId) => `leg${id}Upper`,
  lowerMesh: (id: LegId) => `leg${id}Lower`,
} as const;

export interface QuadrupedJoints {
  spine: THREE.Object3D;
  neck: THREE.Object3D;
  head: THREE.Object3D;
  tail: THREE.Object3D;
  legs: Record<LegId, { upper: THREE.Object3D; lower: THREE.Object3D }>;
}

export interface QuadrupedMaterials {
  body: THREE.MeshStandardMaterial;
  limbs: THREE.MeshStandardMaterial;
  head: THREE.MeshStandardMaterial;
  /** The tail's own material, so the telegraph can flare it alone. */
  tail: THREE.MeshStandardMaterial;
}

const USER_KEY = 'quadruped';
interface RigData {
  params: QuadrupedParams;
  dims: QuadrupedDims;
  materials: QuadrupedMaterials;
}

/**
 * Builds the procedural quadruped: a capsule torso, a capsule neck and head with a cone snout and ears,
 * capsule upper legs with cone lower legs, and a cone tail. Feet (the cone tips) are at y = 0 in the rest
 * pose, forward is -Z, left is -X. Geometry and materials are per-instance; free them with `dispose`.
 */
export class QuadrupedRig {
  /**
   * @throws RangeError when `params` has a non-positive or non-finite length.
   * Returns the group `quadruped`, scaled by `params.scale`.
   */
  static build(params: QuadrupedParams): THREE.Group {
    const dims = quadrupedDims(params);
    const root = new THREE.Group();
    root.name = RIG_NAMES.root;
    root.scale.setScalar(params.scale ?? 1);

    const tint = new THREE.Color(params.tint);
    const emissive = new THREE.Color(params.emissive ?? 0x000000);
    const mat = (name: string, shade: number): THREE.MeshStandardMaterial =>
      new THREE.MeshStandardMaterial({
        name: `quadruped-${name}`,
        color: tint.clone().multiplyScalar(shade),
        emissive: emissive.clone(),
        roughness: 0.85,
        metalness: 0,
        flatShading: true,
      });
    const materials: QuadrupedMaterials = { body: mat('body', 1), limbs: mat('limbs', 0.8), head: mat('head', 1.1), tail: mat('tail', 0.9) };

    const mesh = (name: string, g: THREE.BufferGeometry, m: THREE.Material): THREE.Mesh => {
      const o = new THREE.Mesh(g, m);
      o.name = name;
      o.castShadow = true;
      return o;
    };
    const joint = (name: string): THREE.Group => {
      const g = new THREE.Group();
      g.name = name;
      return g;
    };

    const spine = joint(RIG_NAMES.spine);
    spine.position.y = dims.spineRestY;
    root.add(spine);

    // Torso: capsule along Z.
    const r = dims.bodyRadius;
    const torso = new THREE.CapsuleGeometry(r, Math.max(0.01, params.bodyLength - 2 * r), 4, 10);
    torso.rotateX(Math.PI / 2);
    spine.add(mesh('torso', torso, materials.body));

    // Neck and head. Both extend along local -Z; the joint's X rotation raises them.
    const neck = joint(RIG_NAMES.neck);
    neck.position.set(0, dims.neckY, dims.neckZ);
    neck.rotation.x = dims.restNeck;
    spine.add(neck);
    const neckR = Math.min(r * 0.55, dims.neckLen * 0.4);
    const neckG = new THREE.CapsuleGeometry(neckR, Math.max(0.01, dims.neckLen - 2 * neckR), 4, 8);
    neckG.rotateX(Math.PI / 2);
    neckG.translate(0, 0, -dims.neckLen / 2);
    neck.add(mesh('neckMesh', neckG, materials.body));

    const h = dims.headSize;
    const head = joint(RIG_NAMES.head);
    head.position.set(0, 0, -dims.neckLen);
    head.rotation.x = dims.restHead;
    neck.add(head);
    const skull = new THREE.CapsuleGeometry(h * 0.36, h * 0.3, 4, 8);
    skull.rotateX(Math.PI / 2);
    skull.translate(0, 0, -h * 0.4);
    head.add(mesh('skull', skull, materials.head));
    const snout = new THREE.ConeGeometry(h * 0.26, h * 0.65, 8);
    snout.rotateX(-Math.PI / 2); // apex towards -Z
    snout.translate(0, -h * 0.05, -h * 0.8 - h * 0.32);
    head.add(mesh('snout', snout, materials.head));
    for (const side of [-1, 1]) {
      const ear = new THREE.ConeGeometry(h * 0.12, h * 0.32, 6);
      ear.translate(side * h * 0.2, h * 0.36 + h * 0.12, -h * 0.25);
      head.add(mesh(side < 0 ? 'earL' : 'earR', ear, materials.head));
    }

    // Tail: a cone trailing back (+Z) and up.
    const tail = joint(RIG_NAMES.tail);
    tail.position.set(0, dims.tailY, dims.tailZ);
    tail.rotation.x = -dims.restTail;
    spine.add(tail);
    const tailG = new THREE.ConeGeometry(Math.max(0.03, r * 0.28), dims.tailLen, 8);
    tailG.rotateX(Math.PI / 2); // apex towards +Z
    tailG.translate(0, 0, dims.tailLen / 2);
    tail.add(mesh('tailMesh', tailG, materials.tail));

    // Legs: capsule upper segment, cone lower segment ending in a point at the foot.
    const legR = Math.min(r * 0.4, dims.upperLen * 0.3);
    for (const id of LEG_IDS) {
      const front = id[0] === 'F';
      const left = id[1] === 'L';
      const hip = joint(RIG_NAMES.leg(id));
      hip.position.set(left ? -dims.hipX : dims.hipX, dims.hipY, front ? dims.hipZFront : dims.hipZBack);
      spine.add(hip);
      const upper = new THREE.CapsuleGeometry(legR, Math.max(0.01, dims.upperLen - 2 * legR), 3, 8);
      upper.translate(0, -dims.upperLen / 2, 0);
      hip.add(mesh(RIG_NAMES.upperMesh(id), upper, materials.limbs));
      const knee = joint(RIG_NAMES.knee(id));
      knee.position.y = -dims.upperLen;
      hip.add(knee);
      const lower = new THREE.ConeGeometry(legR * 0.85, dims.lowerLen, 8);
      lower.rotateX(Math.PI); // apex down
      lower.translate(0, -dims.lowerLen / 2, 0);
      knee.add(mesh(RIG_NAMES.lowerMesh(id), lower, materials.limbs));
    }

    const data: RigData = { params: { ...params }, dims, materials };
    root.userData[USER_KEY] = data;
    root.updateMatrixWorld(true);
    return root;
  }

  /** The joints of a built rig. @throws Error when `rig` was not built by `QuadrupedRig.build`. */
  static joints(rig: THREE.Object3D): QuadrupedJoints {
    const need = (name: string): THREE.Object3D => {
      const o = rig.getObjectByName(name);
      if (!o) throw new Error(`QuadrupedRig: joint "${name}" not found`);
      return o;
    };
    const legs = {} as QuadrupedJoints['legs'];
    for (const id of LEG_IDS) legs[id] = { upper: need(RIG_NAMES.leg(id)), lower: need(RIG_NAMES.knee(id)) };
    return { spine: need(RIG_NAMES.spine), neck: need(RIG_NAMES.neck), head: need(RIG_NAMES.head), tail: need(RIG_NAMES.tail), legs };
  }

  private static data(rig: THREE.Object3D): RigData {
    const d = rig.userData[USER_KEY] as RigData | undefined;
    if (!d) throw new Error('QuadrupedRig: not a rig built by QuadrupedRig.build');
    return d;
  }

  static dims(rig: THREE.Object3D): QuadrupedDims {
    return QuadrupedRig.data(rig).dims;
  }

  static params(rig: THREE.Object3D): QuadrupedParams {
    return QuadrupedRig.data(rig).params;
  }

  static materials(rig: THREE.Object3D): QuadrupedMaterials {
    return QuadrupedRig.data(rig).materials;
  }

  /** Frees the geometry of every mesh and the rig's materials, and detaches it. Safe to call twice. */
  static dispose(rig: THREE.Object3D): void {
    rig.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
    const d = rig.userData[USER_KEY] as RigData | undefined;
    if (d) for (const m of Object.values(d.materials)) m.dispose();
    rig.removeFromParent();
  }
}
