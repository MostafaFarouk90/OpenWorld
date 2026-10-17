import { describe, expect, it } from 'vitest';
import { TERRAIN } from '../config/constants';
import { heightAt } from './heightfield';
import { LodQuadtree, type QuadNode, type QuadtreeHost } from './quadtree';

type N = QuadNode<{ id: number }>;

/** Small seeded PRNG (mulberry32). */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FRAMES = 800;
const CONVERGE_FRAMES = 700;

function run(seed: number) {
  const rnd = prng(seed);
  const building = new Set<N>();
  let created = 0;
  let released = 0;
  let nextId = 1;
  const problems: string[] = [];

  const host: QuadtreeHost<{ id: number }> = {
    build: (n) => {
      if (building.has(n)) problems.push(`double build ${n.size}@${n.centerX},${n.centerZ}`);
      building.add(n);
    },
    cancel: (n) => {
      building.delete(n);
    },
    release: () => {
      released++;
    },
    setVisible: () => {},
  };
  const tree = new LodQuadtree(host, TERRAIN, heightAt);

  const walk = (n: N, f: (n: N, visibleAncestor: boolean) => void, anc = false) => {
    f(n, anc);
    n.children?.forEach((c) => walk(c, f, anc || n.visible));
  };
  const visibleArea = (n: N): number =>
    n.visible ? n.size * n.size : (n.children?.reduce((s, c) => s + visibleArea(c), 0) ?? 0);

  const check = (frame: number) => {
    let held = 0;
    for (const root of tree.roots.values()) {
      walk(root, (n, anc) => {
        if (n.visible && anc) problems.push(`f${frame} visible under visible ancestor ${n.size}@${n.centerX},${n.centerZ}`);
        if (n.visible && n.data === null) problems.push(`f${frame} visible without data`);
        if (n.data !== null) held++;
        if (n.disposed) problems.push(`f${frame} disposed node reachable`);
        if (n.building && !building.has(n)) problems.push(`f${frame} node building but host unaware`);
      });
      if (root.ready) {
        const area = visibleArea(root);
        if (Math.abs(area - root.size * root.size) > 1e-6) {
          problems.push(`f${frame} root ${root.centerX},${root.centerZ} visible area ratio ${area / (root.size * root.size)}`);
        }
      }
    }
    if (held !== created - released) problems.push(`f${frame} leak held=${held} created-released=${created - released}`);
  };

  const answer = (failRate: number, share: number) => {
    const snapshot = [...building];
    // Random completion order.
    for (let i = snapshot.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [snapshot[i], snapshot[j]] = [snapshot[j], snapshot[i]];
    }
    for (const n of snapshot) {
      if (!building.has(n) || rnd() >= share) continue;
      building.delete(n);
      if (rnd() < failRate) tree.fail(n);
      else {
        created++;
        tree.complete(n, { id: nextId++ });
      }
    }
  };

  const cam = { x: 0, y: 60, z: 0 };
  for (let frame = 0; frame < FRAMES; frame++) {
    const r = rnd();
    if (r < 0.01) {
      cam.x = (rnd() - 0.5) * 40000;
      cam.z = (rnd() - 0.5) * 40000;
      cam.y = 60;
    } else if (r < 0.06) cam.y = 10 + rnd() * 3000;
    else {
      cam.x += (rnd() - 0.5) * 120;
      cam.z += (rnd() - 0.5) * 120;
    }
    cam.y = Math.max(cam.y, heightAt(cam.x, cam.z) + 2);
    tree.update(cam);
    check(frame);
    answer(0.1, 0.5);
  }

  // Convergence: camera still, every build answered (past the longest failure backoff).
  for (let i = 0; i < CONVERGE_FRAMES; i++) {
    tree.update(cam);
    answer(0, 1);
  }
  tree.update(cam);
  check(-1);

  let stillBuilding = 0;
  let nonLeafVisible = 0;
  let visible = 0;
  for (const root of tree.roots.values()) {
    walk(root, (n) => {
      if (n.building) stillBuilding++;
      if (n.visible) {
        visible++;
        if (n.children !== null || tree.shouldSplit(n.centerX, n.centerZ, n.size)) nonLeafVisible++;
      }
    });
  }
  const visibleCount = tree.visibleCount;
  tree.dispose();
  return { problems, building: building.size, stillBuilding, nonLeafVisible, visible, visibleCount, created, released, roots: tree.roots.size };
}

describe('quadtree invariants under random camera motion', () => {
  it.each([1, 2, 3])('seed %i holds every invariant every frame and converges cleanly', (seed) => {
    const result = run(seed);
    expect(result.problems.slice(0, 5)).toEqual([]);
    expect(result.created).toBeGreaterThan(0);
    // Convergence: nothing building, only true leaves drawn, and the count agrees.
    expect(result.building).toBe(0);
    expect(result.stillBuilding).toBe(0);
    expect(result.visible).toBeGreaterThan(0);
    expect(result.nonLeafVisible).toBe(0);
    expect(result.visibleCount).toBe(result.visible);
    // Dispose releases everything.
    expect(result.released).toBe(result.created);
    expect(result.roots).toBe(0);
  });
});
