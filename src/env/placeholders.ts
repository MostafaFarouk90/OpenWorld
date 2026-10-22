// Scripted stand-ins for environment ids with no model yet: simple flat-coloured solids at the id's target size (src/env/targets.json),
// one merged geometry with vertex colours, base on y = 0 and centred on x, z. They carry the agreed ids so a real glb replaces
// them later without moving a placement.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import targets from './targets.json';
import type { PlaceholderShape } from './resolve';

const objects = targets.objects as Record<string, { w: number; d: number; h: number }>;

export function targetSize(id: string): { w: number; d: number; h: number } {
  return objects[id] ?? { w: 1, d: 1, h: 1 };
}

const colored = (g: THREE.BufferGeometry, hex: number): THREE.BufferGeometry => {
  const c = new THREE.Color(hex);
  const n = g.getAttribute('position').count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  g.deleteAttribute('uv');
  return g.index ? g.toNonIndexed() : g;
};

const lift = (g: THREE.BufferGeometry, y: number): THREE.BufferGeometry => g.translate(0, y, 0);

/** Placeholder geometry for `id`, sized from the target table. */
export function placeholderGeometry(id: string, shape: PlaceholderShape): THREE.BufferGeometry {
  const { w, d, h } = targetSize(id);
  const parts: THREE.BufferGeometry[] = [];
  switch (shape) {
    case 'tree': {
      parts.push(colored(lift(new THREE.CylinderGeometry(0.06 * w, 0.1 * w, h * 0.45, 7), h * 0.225), 0x6b4a2b));
      const crown = new THREE.IcosahedronGeometry(0.5, 0).scale(w, h * 0.55, d);
      parts.push(colored(lift(crown, h * 0.72), /^autumn/.test(id) ? 0xc07a30 : /^birch/.test(id) ? 0x8fb35a : 0x4c7f3b));
      break;
    }
    case 'bush':
      parts.push(colored(lift(new THREE.IcosahedronGeometry(0.5, 0).scale(w, h, d), h / 2), 0x4f8a3e));
      break;
    case 'grass':
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        parts.push(colored(lift(new THREE.ConeGeometry(0.06, h, 3).translate(Math.cos(a) * w * 0.25, 0, Math.sin(a) * d * 0.25), h / 2), 0x7aa04a));
      }
      break;
    case 'flower':
      parts.push(colored(lift(new THREE.IcosahedronGeometry(0.5, 0).scale(w, h, d), h / 2), 0xe0d060));
      break;
    case 'rock':
      parts.push(colored(lift(new THREE.DodecahedronGeometry(0.5, 0).scale(w, h, d), h * 0.4), 0x8a8a90));
      break;
    case 'haystack':
      parts.push(colored(lift(new THREE.CylinderGeometry(w * 0.5, w * 0.5, h * 0.5, 10), h * 0.25), 0xd1b25a));
      parts.push(colored(lift(new THREE.ConeGeometry(w * 0.5, h * 0.5, 10), h * 0.75), 0xc8a64c));
      break;
    case 'post':
      parts.push(colored(lift(new THREE.BoxGeometry(Math.min(w, d) * 0.4, h, Math.min(w, d) * 0.4), h / 2), 0x6b4a2b));
      break;
    case 'patch':
      parts.push(colored(lift(new THREE.CylinderGeometry(0.5, 0.5, 1, 8).scale(w, h, d), h / 2), 0x7a5a38));
      break;
    default:
      parts.push(colored(lift(new THREE.BoxGeometry(w, h, d), h / 2), 0x8a6a40));
  }
  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error(`placeholder: could not merge geometry for ${id}`);
  merged.computeVertexNormals();
  return merged;
}

let shared: THREE.MeshLambertMaterial | null = null;
/** One material for every placeholder so they batch. */
export function placeholderMaterial(): THREE.Material {
  return (shared ??= new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
}
