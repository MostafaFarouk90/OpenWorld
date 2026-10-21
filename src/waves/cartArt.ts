import * as THREE from 'three';
import type { HurtboxDef } from '../combat/types';

/**
 * The brazier cart, built from primitives (no cart model exists). Geometry and materials are shared by every cart and
 * are plain colours: nothing samples world position, so the cart looks the same at x 22000 as at the origin. Each cart
 * adds at most one point light, in its brazier.
 */

interface Kit {
  geo: Record<'bed' | 'rail' | 'wheel' | 'axle' | 'post' | 'bowl' | 'flame' | 'coals' | 'bar' | 'spill', THREE.BufferGeometry>;
  mat: Record<'wood' | 'iron' | 'coal' | 'flame' | 'spill', THREE.Material>;
}

let kit: Kit | null = null;
let users = 0;

function makeKit(): Kit {
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xff8a2a });
  const spillMat = new THREE.MeshBasicMaterial({ color: 0xff6a1a, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false });
  return {
    geo: {
      bed: new THREE.BoxGeometry(1.7, 0.18, 1.1),
      rail: new THREE.BoxGeometry(1.7, 0.4, 0.08),
      wheel: new THREE.CylinderGeometry(0.46, 0.46, 0.12, 12),
      axle: new THREE.CylinderGeometry(0.05, 0.05, 1.3, 6),
      post: new THREE.BoxGeometry(0.1, 0.55, 0.1),
      bowl: new THREE.CylinderGeometry(0.5, 0.3, 0.34, 10, 1, true),
      flame: new THREE.ConeGeometry(0.34, 0.8, 8),
      coals: new THREE.CylinderGeometry(0.46, 0.46, 0.05, 10),
      bar: new THREE.BoxGeometry(0.1, 0.1, 1.2),
      spill: new THREE.CircleGeometry(1, 14),
    },
    mat: {
      wood: new THREE.MeshStandardMaterial({ color: 0x4a3622, roughness: 0.95 }),
      iron: new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.7, metalness: 0.3, side: THREE.DoubleSide }),
      coal: new THREE.MeshStandardMaterial({ color: 0x1c0d06, emissive: 0xd8461a, emissiveIntensity: 0.9, roughness: 1 }),
      flame: flameMat,
      spill: spillMat,
    },
  };
}

export interface CartVisual {
  root: THREE.Group;
  /** Rocks with the wind-back; the wheels, bowl and flame hang off it. */
  body: THREE.Group;
  wheels: THREE.Object3D[];
  bowl: THREE.Group;
  flame: THREE.Mesh;
  light: THREE.PointLight;
  hurtboxDefs: HurtboxDef[];
  /** Wheel radius, metres, for the spin. */
  wheelRadius: number;
  /** Builds the flat fire patch the strike leaves; the caller owns it and calls `dispose` on the returned remover. */
  makeSpill(): THREE.Mesh;
  /** Releases the shared geometry and materials (the last cart frees them). */
  release(): void;
}

export const CART_BED_NODE = 'cart-bed';
export const CART_BRAZIER_NODE = 'cart-brazier';

/** Feet at the origin, facing -Z (the direction it rolls); about 1.7 m long and 1.5 m tall with the flame. */
export function buildCartVisual(slug: string): CartVisual {
  if (!kit) kit = makeKit();
  users++;
  const k = kit;
  const root = new THREE.Group();
  root.name = `cart-${slug}`;
  const body = new THREE.Group();
  body.name = 'cart-body-group';
  root.add(body);

  const mesh = (g: THREE.BufferGeometry, m: THREE.Material, name: string): THREE.Mesh => {
    const o = new THREE.Mesh(g, m);
    o.name = name;
    o.castShadow = true;
    return o;
  };

  // The bed is a named node so its hurtbox can ride it.
  const bed = new THREE.Group();
  bed.name = CART_BED_NODE;
  bed.position.y = 0.62;
  const floor = mesh(k.geo.bed, k.mat.wood, 'bed');
  const railL = mesh(k.geo.rail, k.mat.wood, 'rail-l');
  railL.position.set(0, 0.24, -0.5);
  const railR = mesh(k.geo.rail, k.mat.wood, 'rail-r');
  railR.position.set(0, 0.24, 0.5);
  bed.add(floor, railL, railR);
  body.add(bed);

  const axleFront = mesh(k.geo.axle, k.mat.iron, 'axle-front');
  axleFront.rotation.x = Math.PI / 2;
  axleFront.position.set(-0.55, 0.46, 0);
  const axleBack = axleFront.clone();
  axleBack.name = 'axle-back';
  axleBack.position.x = 0.55;
  body.add(axleFront, axleBack);

  const wheels: THREE.Object3D[] = [];
  for (const [x, z] of [[-0.55, -0.62], [-0.55, 0.62], [0.55, -0.62], [0.55, 0.62]] as const) {
    // A pivot per wheel: the disc lies on its side inside it, and the pivot's Z turns it.
    const pivot = new THREE.Group();
    pivot.name = 'wheel-pivot';
    pivot.position.set(x, 0.46, z);
    const w = mesh(k.geo.wheel, k.mat.wood, 'wheel');
    w.rotation.x = Math.PI / 2;
    pivot.add(w);
    wheels.push(pivot);
    body.add(pivot);
  }

  // The tow bar points down the lane (-Z is forward; the long axis of the bed is X, so the cart rolls sideways in its
  // own frame: turn the whole body a quarter so +X becomes the rolling direction -Z).
  body.rotation.y = Math.PI / 2;

  const bowl = new THREE.Group();
  bowl.name = CART_BRAZIER_NODE;
  bowl.position.set(0, 0.9, 0);
  const cup = mesh(k.geo.bowl, k.mat.iron, 'bowl');
  const coals = mesh(k.geo.coals, k.mat.coal, 'coals');
  coals.position.y = 0.04;
  const flame = mesh(k.geo.flame, k.mat.flame, 'flame');
  flame.position.y = 0.45;
  flame.castShadow = false;
  bowl.add(cup, coals, flame);
  for (const [x, z] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]] as const) {
    const p = mesh(k.geo.post, k.mat.iron, 'post');
    p.position.set(x, -0.2, z);
    bowl.add(p);
  }
  body.add(bowl);

  const light = new THREE.PointLight(0xff8a3a, 6, 9, 2);
  light.name = 'cart-light';
  light.position.set(0, 1.5, 0);
  light.castShadow = false;
  body.add(light);

  // Capsules in each named node's own space (before the body's quarter turn is applied, so they follow it).
  const hurtboxDefs: HurtboxDef[] = [
    { name: 'bed', bone: CART_BED_NODE, start: { x: -0.7, y: 0.15, z: 0 }, end: { x: 0.7, y: 0.15, z: 0 }, radius: 0.55 },
    { name: 'brazier', bone: CART_BRAZIER_NODE, start: { x: 0, y: 0, z: 0 }, end: { x: 0, y: 0.5, z: 0 }, radius: 0.5 },
  ];

  let released = false;
  return {
    root,
    body,
    wheels,
    bowl,
    flame,
    light,
    hurtboxDefs,
    wheelRadius: 0.46,
    makeSpill() {
      const s = new THREE.Mesh(k.geo.spill, k.mat.spill);
      s.name = 'cart-spill';
      s.rotation.x = -Math.PI / 2;
      return s;
    },
    release() {
      if (released) return;
      released = true;
      root.removeFromParent();
      if (--users > 0 || !kit) return;
      for (const g of Object.values(kit.geo)) g.dispose();
      for (const m of Object.values(kit.mat)) m.dispose();
      kit = null;
    },
  };
}

/** Shared-kit users alive (tests). */
export function cartKitUsers(): number {
  return users;
}
