// N3 lava meshes: every surface faces up (a front face seen from above), so a channel or a crust is not culled away.
// The real-game run found ribbons wound face-down: invisible from above while they still burned.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { LavaShape } from '../lava';
import { shapeOrigin, surfaceGeometry } from './lavaMeshes';

function faceNormalsY(g: THREE.BufferGeometry): number[] {
  const pos = g.getAttribute('position');
  const index = g.getIndex();
  const ids = index ? Array.from(index.array) : Array.from({ length: pos.count }, (_, i) => i);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const out: number[] = [];
  for (let i = 0; i < ids.length; i += 3) {
    a.fromBufferAttribute(pos, ids[i]!);
    b.fromBufferAttribute(pos, ids[i + 1]!);
    c.fromBufferAttribute(pos, ids[i + 2]!);
    out.push(new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize().y);
  }
  return out;
}

const shapes: Record<string, LavaShape> = {
  box: { kind: 'box', x0: 10990, x1: 11010, z0: 7990, z1: 8010 },
  circle: { kind: 'circle', x: 11000, z: 8000, r: 12 },
  'ribbon east': { kind: 'ribbon', points: [[10990, 8000], [11010, 8000]], halfWidth: 2 },
  'ribbon west, bending': { kind: 'ribbon', points: [[11010, 8000], [11000, 8004], [10990, 7990]], halfWidth: 2.5 },
  'ribbon north': { kind: 'ribbon', points: [[11000, 8010], [11000, 7990]], halfWidth: 1 },
};

describe('lava surface geometry', () => {
  for (const [name, shape] of Object.entries(shapes)) {
    it(`a ${name} faces up on every triangle, with up vertex normals`, () => {
      const origin = shapeOrigin(shape, 140);
      const g = surfaceGeometry(shape, origin, () => 140);
      const ys = faceNormalsY(g);
      expect(ys.length).toBeGreaterThan(0);
      expect(Math.min(...ys)).toBeGreaterThan(0.99);
      const n = g.getAttribute('normal');
      for (let i = 0; i < n.count; i++) expect(n.getY(i)).toBeGreaterThan(0.99);
    });
  }

  it('a sloped ribbon still faces up', () => {
    const shape: LavaShape = { kind: 'ribbon', points: [[11000, 8000], [11000, 7970]], halfWidth: 2 };
    const g = surfaceGeometry(shape, shapeOrigin(shape, 150), (_x, z) => 150 + (8000 - z) * 0.3);
    expect(Math.min(...faceNormalsY(g))).toBeGreaterThan(0.9);
  });
});
