// Act 4 thread L1 (plans/act4-L1.md section 7): the rope-lines drawn: one instanced mesh for every post (about 560)
// and one line-segment mesh for the rope between them. Two draw calls for the whole Waste.
import * as THREE from 'three';
import { ROPE_LINE_GEOMS, ropePosts, POST_SPACING } from './ropeLines';

export const POST_HEIGHT = 1.3;
export const POST_RADIUS = 0.07;
/** The rope hangs this high on each post. */
export const ROPE_HEIGHT = 1.05;

export interface RopePostsHandle {
  readonly object: THREE.Group;
  readonly postCount: number;
  dispose(): void;
}

export function buildRopePosts(heightAt: (x: number, z: number) => number): RopePostsHandle {
  const group = new THREE.Group();
  group.name = 'act4-rope-lines';
  const lines = ROPE_LINE_GEOMS.map((l) => ropePosts(l.id).map((p) => ({ ...p, y: heightAt(p.x, p.z) })));
  const count = lines.reduce((n, l) => n + l.length, 0);
  const postGeo = new THREE.CylinderGeometry(POST_RADIUS, POST_RADIUS * 1.3, POST_HEIGHT, 5);
  postGeo.translate(0, POST_HEIGHT / 2, 0);
  const postMat = new THREE.MeshLambertMaterial({ color: 0x3b3128, flatShading: true });
  const posts = new THREE.InstancedMesh(postGeo, postMat, count);
  posts.name = 'rope-posts';
  const m = new THREE.Matrix4();
  let i = 0;
  const rope: number[] = [];
  for (const l of lines) {
    for (let k = 0; k < l.length; k++) {
      const p = l[k];
      m.makeTranslation(p.x, p.y - 0.1, p.z);
      posts.setMatrixAt(i++, m);
      const q = l[k + 1];
      // Rope only between neighbouring posts (a skipped post leaves a gap).
      if (q && Math.hypot(q.x - p.x, q.z - p.z) <= POST_SPACING * 1.5) rope.push(p.x, p.y + ROPE_HEIGHT, p.z, q.x, q.y + ROPE_HEIGHT, q.z);
    }
  }
  posts.instanceMatrix.needsUpdate = true;
  posts.computeBoundingSphere();
  posts.receiveShadow = true;
  group.add(posts);
  const ropeGeo = new THREE.BufferGeometry();
  ropeGeo.setAttribute('position', new THREE.Float32BufferAttribute(rope, 3));
  ropeGeo.computeBoundingSphere();
  const ropeMat = new THREE.LineBasicMaterial({ color: 0x8a7a5c });
  const ropeLines = new THREE.LineSegments(ropeGeo, ropeMat);
  ropeLines.name = 'rope';
  group.add(ropeLines);
  let disposed = false;
  return {
    object: group,
    postCount: count,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      posts.dispose();
      postGeo.dispose();
      postMat.dispose();
      ropeGeo.dispose();
      ropeMat.dispose();
    },
  };
}
