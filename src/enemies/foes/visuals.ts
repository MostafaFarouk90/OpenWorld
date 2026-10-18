import * as THREE from 'three';
import type { HurtboxDef } from '../../combat/types';
import type { FoeVisual } from './Foe';
import { BLOOM } from './tuning';

/** Collects the geometries and materials a primitive body creates, so the foe can free them. */
class Kit {
  readonly geometries: THREE.BufferGeometry[] = [];
  readonly materials: THREE.Material[] = [];

  geo<G extends THREE.BufferGeometry>(g: G): G {
    this.geometries.push(g);
    return g;
  }

  mat(color: number, emissive = 0x000000, extra: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
    const m = new THREE.MeshStandardMaterial({ color, emissive, roughness: 0.9, metalness: 0, ...extra });
    this.materials.push(m);
    return m;
  }

  mesh(geometry: THREE.BufferGeometry, material: THREE.Material, name?: string): THREE.Mesh {
    const m = new THREE.Mesh(this.geo(geometry), material);
    m.castShadow = true;
    if (name) m.name = name;
    return m;
  }
}

function capsule(name: string, bone: string, start: [number, number, number], end: [number, number, number], radius: number): HurtboxDef {
  return {
    name,
    bone,
    start: { x: start[0], y: start[1], z: start[2] },
    end: { x: end[0], y: end[1], z: end[2] },
    radius,
  };
}

export interface ScarecrowVisual extends FoeVisual {
  /** Tilts the whole body about the feet (knockdown). */
  body: THREE.Group;
  /** The claw arm's pivot: rotation.x 0 hangs down, PI/2 points forward (-Z), PI is overhead. */
  armPivot: THREE.Group;
  /** The arm object the claw tracer follows. */
  arm: THREE.Group;
  /** Weapon markers on `arm`, local coordinates. */
  hilt: THREE.Object3D;
  tip: THREE.Object3D;
  head: THREE.Object3D;
  /** Materials that glow when burning, with their resting emissive. */
  glow: Array<{ material: THREE.MeshStandardMaterial; base: THREE.Color; baseColor: THREE.Color }>;
}

export const ARM_LENGTH = 1.1;

/** A cross pole, sack head, straw torso and cards, and a claw arm on a pivot: all primitives, facing -Z. */
export function buildScarecrowVisual(slug: string): ScarecrowVisual {
  const k = new Kit();
  const root = new THREE.Group();
  root.name = `foe-${slug}`;
  const body = new THREE.Group();
  body.name = 'scarecrow-body';
  root.add(body);

  const wood = k.mat(0x4a3622);
  const straw = k.mat(0xb59a4f);
  const sack = k.mat(0x8a7a5a);
  const eyes = k.mat(0x201008, 0xff6a20, { emissiveIntensity: 0.6 });

  const pole = k.mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.3, 6), wood, 'pole');
  pole.position.y = 1.15;
  const cross = k.mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.95, 6), wood, 'crossbar');
  cross.rotation.z = Math.PI / 2;
  cross.position.set(-0.28, 1.55, 0);
  const torso = k.mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.75, 8), straw, 'foe-torso');
  torso.position.y = 1.2;
  const head = k.mesh(new THREE.SphereGeometry(0.2, 8, 6), sack, 'foe-head');
  head.position.y = 1.92;
  const eyeGeo = new THREE.BoxGeometry(0.06, 0.04, 0.03);
  for (const x of [-0.07, 0.07]) {
    const eye = k.mesh(eyeGeo, eyes);
    eye.position.set(x, 1.95, -0.19);
    body.add(eye);
  }
  body.add(pole, cross, torso, head);

  // Straw cards: thin planes around the hem and the shoulders.
  const card = new THREE.BoxGeometry(0.05, 0.38, 0.01);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const c = k.mesh(card, straw);
    c.position.set(Math.cos(a) * 0.3, 0.78, Math.sin(a) * 0.3);
    c.rotation.set(0.35 * Math.sin(a), -a, 0.35 * Math.cos(a));
    body.add(c);
  }
  const hand = k.mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), straw);
  hand.position.set(-0.78, 1.55, 0);
  body.add(hand);

  // The claw arm: a forearm on a shoulder pivot, claw prongs at its end.
  const armPivot = new THREE.Group();
  armPivot.name = 'scarecrow-arm-pivot';
  armPivot.position.set(0.3, 1.55, 0);
  const arm = new THREE.Group();
  arm.name = 'scarecrow-arm';
  const forearm = k.mesh(new THREE.BoxGeometry(0.09, ARM_LENGTH, 0.09), wood, 'forearm');
  forearm.position.y = -ARM_LENGTH / 2;
  const prongGeo = new THREE.ConeGeometry(0.03, 0.28, 4);
  arm.add(forearm);
  for (const x of [-0.06, 0, 0.06]) {
    const prong = k.mesh(prongGeo, eyes);
    prong.rotation.x = Math.PI;
    prong.position.set(x, -ARM_LENGTH - 0.12, 0);
    arm.add(prong);
  }
  const hilt = new THREE.Object3D();
  hilt.name = 'claw-hilt';
  hilt.position.set(0, -0.55, 0);
  const tip = new THREE.Object3D();
  tip.name = 'claw-tip';
  tip.position.set(0, -ARM_LENGTH - 0.25, 0);
  arm.add(hilt, tip);
  armPivot.add(arm);
  body.add(armPivot);

  const glow = [straw, sack, wood].map((material) => ({
    material,
    base: material.emissive.clone(),
    baseColor: material.color.clone(),
  }));

  const hurtboxDefs = [
    capsule('torso', 'foe-torso', [0, -0.3, 0], [0, 0.3, 0], 0.32),
    capsule('head', 'foe-head', [0, 0, 0], [0, 0.02, 0], 0.24),
  ];
  return { root, body, armPivot, arm, hilt, tip, head, glow, hurtboxDefs, materials: k.materials, geometries: k.geometries };
}

export interface BloomVisual extends FoeVisual {
  petals: THREE.Group[];
  core: THREE.Mesh;
  coreMaterial: THREE.MeshStandardMaterial;
  petalMaterial: THREE.MeshStandardMaterial;
  puff: THREE.Mesh;
  puffMaterial: THREE.MeshBasicMaterial;
}

/** A stalk, a glowing core, a ring of 12 petals and a grey spore puff: all primitives. */
export function buildBloomVisual(slug: string): BloomVisual {
  const k = new Kit();
  const root = new THREE.Group();
  root.name = `foe-${slug}`;
  const stemMat = k.mat(0x3b4a2a);
  const coreMaterial = k.mat(0x6b6f55, 0x9a5a2a, { emissiveIntensity: 0.6 });
  const petalMaterial = k.mat(0x7a7d62, 0x5a3a1a, { emissiveIntensity: 0.5, side: THREE.DoubleSide });

  const stem = k.mesh(new THREE.CylinderGeometry(0.08, 0.13, 1.0, 6), stemMat, 'foe-stem');
  stem.position.y = 0.5;
  const core = k.mesh(new THREE.SphereGeometry(0.3, 8, 6), coreMaterial, 'foe-head');
  core.position.y = 1.05;
  root.add(stem, core);

  const petalGeo = k.geo(new THREE.PlaneGeometry(0.42, 0.9));
  const petals: THREE.Group[] = [];
  for (let i = 0; i < BLOOM.petals; i++) {
    const pivot = new THREE.Group();
    pivot.rotation.y = (i / BLOOM.petals) * Math.PI * 2;
    pivot.position.y = 1.05;
    const hinge = new THREE.Group();
    hinge.position.z = 0.2;
    const petal = new THREE.Mesh(petalGeo, petalMaterial);
    petal.position.y = 0.45;
    petal.castShadow = true;
    hinge.add(petal);
    pivot.add(hinge);
    root.add(pivot);
    petals.push(hinge);
  }

  const puffMaterial = new THREE.MeshBasicMaterial({ color: 0x9a9a98, transparent: true, opacity: 0, depthWrite: false });
  k.materials.push(puffMaterial);
  const puff = k.mesh(new THREE.SphereGeometry(1, 8, 6), puffMaterial, 'spore-puff');
  puff.position.y = 1.05;
  puff.visible = false;
  root.add(puff);

  const hurtboxDefs = [
    capsule('stem', 'foe-stem', [0, -0.45, 0], [0, 0.45, 0], 0.2),
    capsule('head', 'foe-head', [0, 0, 0], [0, 0.02, 0], 0.4),
  ];
  return { root, petals, core, coreMaterial, petalMaterial, puff, puffMaterial, hurtboxDefs, materials: k.materials, geometries: k.geometries };
}

/** A toll post: a post with a bar across it. */
export function buildTollPostVisual(slug: string): FoeVisual {
  const k = new Kit();
  const root = new THREE.Group();
  root.name = `foe-${slug}`;
  const wood = k.mat(0x5a4128);
  const iron = k.mat(0x3a3a3c, 0x000000, { metalness: 0.4, roughness: 0.6 });
  const post = k.mesh(new THREE.CylinderGeometry(0.13, 0.16, 1.8, 8), wood, 'foe-post');
  post.position.y = 0.9;
  const cap = k.mesh(new THREE.SphereGeometry(0.16, 8, 6), iron);
  cap.position.y = 1.85;
  const bar = k.mesh(new THREE.BoxGeometry(1.5, 0.12, 0.12), wood, 'foe-bar');
  bar.position.y = 1.35;
  root.add(post, cap, bar);
  const hurtboxDefs = [
    capsule('post', 'foe-post', [0, -0.8, 0], [0, 0.8, 0], 0.22),
    capsule('bar', 'foe-bar', [-0.6, 0, 0], [0.6, 0, 0], 0.12),
  ];
  return { root, hurtboxDefs, materials: k.materials, geometries: k.geometries };
}
