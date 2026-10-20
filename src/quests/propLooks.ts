// Small greybox looks for the quest props and notes the layout threads do not draw: a page on a post, a grave,
// rubble, a candle, a box, a chain, a stake, a hearth and a bucket. One group per prop; the quests plugin places it
// at the prop's anchor and hides it when the prop is spent.
import * as THREE from 'three';

export type PropLook = 'page' | 'grave' | 'rubble' | 'candle' | 'box' | 'chain' | 'stake' | 'hearth' | 'bucket' | 'brazier';

const mats = new Map<number, THREE.MeshStandardMaterial>();
const mat = (color: number, emissive = 0): THREE.MeshStandardMaterial => {
  const key = color * 16 + (emissive ? 1 : 0);
  let m = mats.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.9, emissive: emissive || 0x000000, emissiveIntensity: emissive ? 0.6 : 0 });
    mats.set(key, m);
  }
  return m;
};

function box(w: number, h: number, d: number, color: number, y: number, emissive = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, emissive));
  m.position.y = y;
  m.castShadow = true;
  return m;
}

export function buildPropLook(look: PropLook): THREE.Group {
  const g = new THREE.Group();
  g.name = `quest-prop-${look}`;
  switch (look) {
    case 'page':
      g.add(box(0.12, 1.1, 0.12, 0x6b4a2b, 0.55), box(0.5, 0.36, 0.04, 0xe8dcc0, 1.05));
      break;
    case 'grave':
      g.add(box(0.7, 1.0, 0.22, 0x8a8a86, 0.5), box(0.8, 0.12, 1.6, 0x5a5048, 0.06));
      break;
    case 'rubble':
      g.add(box(1.6, 0.35, 1.0, 0x4a3a2a, 0.17), box(0.9, 0.3, 0.7, 0x3a2e22, 0.45), box(1.2, 0.12, 0.25, 0x6b4a2b, 0.62));
      break;
    case 'candle':
      g.add(box(0.12, 0.3, 0.12, 0xf2ead2, 0.15), box(0.05, 0.08, 0.05, 0xffb040, 0.34, 0xffb040));
      break;
    case 'box':
      g.add(box(0.7, 0.45, 0.45, 0x5a3e24, 0.6), box(0.12, 0.38, 0.12, 0x5a3e24, 0.19), box(0.3, 0.06, 0.06, 0xb08a3a, 0.84));
      break;
    case 'chain':
      g.add(box(0.15, 0.8, 0.15, 0x6b4a2b, 0.4), box(0.06, 0.06, 1.1, 0x55585c, 0.55));
      break;
    case 'stake':
      g.add(box(0.1, 1.8, 0.1, 0x8a6a40, 0.9), box(1.1, 0.08, 0.08, 0x8a6a40, 1.4), box(0.5, 0.6, 0.3, 0xc8b070, 1.2));
      break;
    case 'hearth':
      g.add(box(1.6, 0.4, 1.0, 0x77746f, 0.2), box(1.0, 0.12, 0.6, 0x3a2a20, 0.46));
      break;
    case 'bucket':
      g.add(box(0.36, 0.4, 0.36, 0x7a5a3a, 0.2));
      break;
    case 'brazier':
      g.add(box(0.2, 0.9, 0.2, 0x3a3a3a, 0.45), box(0.7, 0.2, 0.7, 0x2a2a2a, 0.95), box(0.4, 0.12, 0.4, 0xff7a20, 1.08, 0xff7a20));
      break;
  }
  return g;
}

/** Frees the geometries of a group built here (materials are shared and live as long as the page). */
export function disposePropLook(g: THREE.Object3D): void {
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.geometry.dispose();
  });
  g.removeFromParent();
}
