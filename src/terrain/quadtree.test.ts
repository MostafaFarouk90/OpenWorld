import { describe, expect, it } from 'vitest';
import { LodQuadtree, retryDelayFrames, type LodSettings, type QuadNode, type QuadtreeHost } from './quadtree';

interface Data {
  name: string;
}

const SETTINGS: LodSettings = { minChunkSize: 100, maxChunkSize: 400, lodSplitFactor: 1.6, viewDistance: 500 };

type Node = QuadNode<Data>;

const label = (n: Node) => `${n.size}@${n.centerX},${n.centerZ}`;

function setup(settings: LodSettings = SETTINGS) {
  const calls = { build: [] as Node[], cancel: [] as Node[], release: [] as Node[], visible: [] as [Node, boolean][] };
  const shown = new Set<string>();
  const host: QuadtreeHost<Data> = {
    build: (n) => calls.build.push(n),
    cancel: (n) => calls.cancel.push(n),
    release: (n) => calls.release.push(n),
    setVisible: (n, _d, v) => {
      calls.visible.push([n, v]);
      if (v) shown.add(label(n));
      else shown.delete(label(n));
    },
  };
  const tree = new LodQuadtree<Data>(host, settings, () => 0);
  /** Completes every node that is currently building (optionally filtered). */
  const flush = (filter: (n: Node) => boolean = () => true) => {
    const pending = calls.build.filter((n) => n.building && !n.disposed && filter(n));
    for (const n of pending) tree.complete(n, { name: label(n) });
    return pending;
  };
  return { tree, calls, shown, host, flush };
}

/** Camera above the centre of root 0,0 (centre 200,200), high enough that only the root splits. */
const SPLIT_ROOT_ONLY = { x: 200, y: 400, z: 200 };

describe('retryDelayFrames', () => {
  it('grows exponentially and caps at 600', () => {
    expect([1, 2, 3, 4, 5].map(retryDelayFrames)).toEqual([30, 60, 120, 240, 480]);
    expect(retryDelayFrames(6)).toBe(600);
    expect(retryDelayFrames(50)).toBe(600);
    expect(retryDelayFrames(1000)).toBe(600);
  });
});

describe('shouldSplit', () => {
  it('splits just below size * factor, not at or above it, with the camera directly above', () => {
    const { tree } = setup();
    // Node of size 200 at the origin; camera above its centre: distance == camera height.
    tree.update({ x: 0, y: 319.999, z: 0 });
    expect(tree.shouldSplit(0, 0, 200)).toBe(true);
    tree.update({ x: 0, y: 320, z: 0 });
    expect(tree.shouldSplit(0, 0, 200)).toBe(false);
    tree.update({ x: 0, y: 321, z: 0 });
    expect(tree.shouldSplit(0, 0, 200)).toBe(false);
  });

  it('never splits a node of minChunkSize, even at distance zero', () => {
    const { tree } = setup();
    tree.update({ x: 0, y: 0, z: 0 });
    expect(tree.shouldSplit(0, 0, 100)).toBe(false);
    expect(tree.shouldSplit(0, 0, 50)).toBe(false);
    expect(tree.shouldSplit(0, 0, 200)).toBe(true);
  });

  it('counts camera height above ground in the distance', () => {
    const { tree } = setup();
    tree.update({ x: 0, y: 0, z: 0 });
    expect(tree.shouldSplit(0, 0, 400)).toBe(true);
    tree.update({ x: 0, y: 700, z: 0 });
    expect(tree.shouldSplit(0, 0, 400)).toBe(false);
    expect(tree.distanceTo(0, 0, 400)).toBeCloseTo(700, 9);
  });

  it('measures horizontal distance to the footprint edge, not its centre', () => {
    const { tree } = setup();
    tree.update({ x: 300, y: 0, z: 0 });
    // Footprint of size 200 at the origin spans x in [-100, 100]: gap is 200.
    expect(tree.distanceTo(0, 0, 200)).toBeCloseTo(200, 9);
    // Inside the footprint the gap is zero.
    expect(tree.distanceTo(250, 0, 200)).toBeCloseTo(0, 9);
  });

  it('treats a camera below ground as height zero', () => {
    const { tree } = setup();
    tree.update({ x: 0, y: -500, z: 0 });
    expect(tree.distanceTo(0, 0, 200)).toBe(0);
  });
});

describe('root selection', () => {
  it('includes a root whose footprint is exactly viewDistance away and excludes one just beyond', () => {
    const inside = setup();
    inside.tree.update({ x: -500, y: 5000, z: 200 });
    expect(inside.tree.roots.has('0,0')).toBe(true);

    const outside = setup();
    outside.tree.update({ x: -500.001, y: 5000, z: 200 });
    expect(outside.tree.roots.has('0,0')).toBe(false);
  });

  it('uses the corner distance, not the per-axis distance, for diagonal roots', () => {
    const { tree } = setup();
    // 400 away on both axes from root 0,0's corner (0,0): hypot = 565 > 500.
    tree.update({ x: -400, y: 5000, z: -400 });
    expect(tree.roots.has('0,0')).toBe(false);
    tree.update({ x: -350, y: 5000, z: -350 });
    expect(tree.roots.has('0,0')).toBe(true);
  });

  it('requests a build for every root and releases/cancels them all when the camera leaves', () => {
    const { tree, calls, flush } = setup();
    tree.update({ x: 200, y: 5000, z: 200 });
    const firstRoots = [...tree.roots.values()];
    expect(firstRoots.length).toBe(9);
    expect(calls.build.length).toBe(9);
    // Complete five, leave four building.
    const done = flush((n) => calls.build.indexOf(n) < 5);
    expect(done.length).toBe(5);

    tree.update({ x: 100000, y: 5000, z: 100000 });
    for (const n of firstRoots) expect(n.disposed).toBe(true);
    expect(calls.release.filter((n) => firstRoots.includes(n)).length).toBe(5);
    expect(calls.cancel.filter((n) => firstRoots.includes(n)).length).toBe(4);
    const fresh = [...tree.roots.values()];
    expect(fresh.length).toBeGreaterThan(0);
    for (const n of fresh) expect(firstRoots).not.toContain(n);
    expect(calls.build.filter((n) => fresh.includes(n)).length).toBe(fresh.length);
  });

  it('keeps existing roots (no rebuild) when the camera moves within range', () => {
    const { tree, calls } = setup();
    tree.update({ x: 200, y: 5000, z: 200 });
    const before = calls.build.length;
    tree.update({ x: 210, y: 5000, z: 205 });
    expect(calls.build.length).toBe(before);
    expect(calls.release.length).toBe(0);
    expect(calls.cancel.length).toBe(0);
  });

  it('ignores non-finite camera positions', () => {
    const { tree, calls } = setup();
    tree.update({ x: NaN, y: 0, z: 0 });
    tree.update({ x: 0, y: Infinity, z: 0 });
    tree.update({ x: 0, y: 0, z: -Infinity });
    expect(tree.roots.size).toBe(0);
    expect(calls.build.length).toBe(0);

    tree.update({ x: 200, y: 5000, z: 200 });
    const roots = tree.roots.size;
    const builds = calls.build.length;
    tree.update({ x: NaN, y: NaN, z: NaN });
    expect(tree.roots.size).toBe(roots);
    expect(calls.build.length).toBe(builds);
    expect(calls.release.length + calls.cancel.length).toBe(0);
  });
});

describe('split and draw', () => {
  it('keeps the parent visible until all four children are complete', () => {
    const { tree, calls, flush, shown } = setup();
    tree.update(SPLIT_ROOT_ONLY);
    const root = tree.roots.get('0,0') as Node;
    expect(root.wantSplit).toBe(true);
    expect(root.children).toHaveLength(4);
    const children = root.children as Node[];
    // Children are leaves so they were requested; the root was requested as the fallback.
    for (const c of children) expect(calls.build).toContain(c);
    expect(calls.build).toContain(root);

    flush((n) => n === root);
    tree.update(SPLIT_ROOT_ONLY);
    expect(root.visible).toBe(true);

    flush((n) => n === children[0] || n === children[1] || n === children[2]);
    tree.update(SPLIT_ROOT_ONLY);
    expect(root.visible).toBe(true);
    for (const c of children) expect(c.visible).toBe(false);
    expect(shown.has(label(root))).toBe(true);

    flush((n) => n === children[3]);
    tree.update(SPLIT_ROOT_ONLY);
    expect(root.visible).toBe(false);
    for (const c of children) expect(c.visible).toBe(true);
  });

  it('counts visible nodes without double counting', () => {
    const { tree, flush, shown } = setup();
    tree.update(SPLIT_ROOT_ONLY);
    expect(tree.visibleCount).toBe(0);
    flush();
    tree.update(SPLIT_ROOT_ONLY);
    // Exact count: nodes holding data whose latest setVisible call was true.
    const exact = () => {
      let n = 0;
      const walk = (node: Node) => {
        if (node.data !== null && shown.has(label(node))) n++;
        node.children?.forEach(walk);
      };
      tree.roots.forEach(walk);
      return n;
    };
    expect(exact()).toBeGreaterThan(0);
    expect(shown.size).toBe(exact());
    expect(tree.visibleCount).toBe(exact());
    const after = tree.visibleCount;
    tree.update(SPLIT_ROOT_ONLY);
    expect(tree.visibleCount).toBe(after);
    expect(exact()).toBe(after);
  });

  it('shows built children of a node that has no data (no-hole fallback)', () => {
    const { tree, flush } = setup();
    tree.update(SPLIT_ROOT_ONLY);
    const root = tree.roots.get('0,0') as Node;
    const children = root.children as Node[];
    flush((n) => n === children[0] || n === children[2]);
    tree.update(SPLIT_ROOT_ONLY);
    expect(root.ready).toBe(false);
    expect(children[0].visible).toBe(true);
    expect(children[2].visible).toBe(true);
    expect(children[1].visible).toBe(false);
    expect(root.visible).toBe(false);
  });

  it('produces the same visible set regardless of completion order', () => {
    const run = (order: (nodes: Node[]) => Node[]) => {
      const { tree, calls, shown, flush } = setup();
      tree.update(SPLIT_ROOT_ONLY);
      const all = calls.build.slice();
      for (const n of order(all)) {
        tree.complete(n, { name: label(n) });
        tree.update(SPLIT_ROOT_ONLY);
      }
      flush();
      tree.update(SPLIT_ROOT_ONLY);
      return [...shown].sort();
    };
    const forward = run((n) => n);
    const reverse = run((n) => n.slice().reverse());
    const shuffled = run((n) => [...n.slice(1, 5), ...n.slice(5), n[0]]);
    expect(forward.length).toBeGreaterThan(0);
    expect(reverse).toEqual(forward);
    expect(shuffled).toEqual(forward);
  });
});

describe('merge', () => {
  it('keeps children drawn until the parent completes, cancels their builds, then releases them', () => {
    const { tree, calls, flush } = setup();
    tree.update(SPLIT_ROOT_ONLY);
    const root = tree.roots.get('0,0') as Node;
    const children = root.children as Node[];
    // Three children finish; the fourth is still building; the root has no data.
    flush((n) => n === children[0] || n === children[1] || n === children[2]);
    tree.update(SPLIT_ROOT_ONLY);
    expect(children[3].building).toBe(true);

    // Camera rises: the root no longer wants to split but stays in range.
    const away = { x: 200, y: 2000, z: 200 };
    tree.update(away);
    expect(root.wantSplit).toBe(false);
    expect(calls.cancel).toContain(children[3]);
    expect(children[3].building).toBe(false);
    expect(root.children).not.toBeNull();
    for (const c of children.slice(0, 3)) {
      expect(c.visible).toBe(true);
      expect(calls.release).not.toContain(c);
    }

    // The parent completes; the next update releases the children.
    flush((n) => n === root);
    tree.update(away);
    expect(root.children).toBeNull();
    for (const c of children.slice(0, 3)) {
      expect(c.disposed).toBe(true);
      expect(calls.release).toContain(c);
    }
    expect(root.visible).toBe(true);
  });

  it('ignores a late completion for a cancelled child and releases its data', () => {
    const { tree, calls } = setup();
    tree.update(SPLIT_ROOT_ONLY);
    const root = tree.roots.get('0,0') as Node;
    const child = (root.children as Node[])[0];
    tree.update({ x: 200, y: 2000, z: 200 });
    expect(child.building).toBe(false);
    expect(tree.complete(child, { name: 'late' })).toBe(false);
    expect(calls.release).toContain(child);
    expect(child.data).toBeNull();
  });
});

describe('complete / fail / dispose', () => {
  it('returns false and releases data for disposed or non-building nodes', () => {
    const { tree, calls } = setup();
    tree.update({ x: 200, y: 5000, z: 200 });
    const node = tree.roots.get('0,0') as Node;
    expect(tree.complete(node, { name: 'a' })).toBe(true);
    // Already has data and is no longer building.
    expect(tree.complete(node, { name: 'b' })).toBe(false);
    expect(calls.release.filter((n) => n === node)).toHaveLength(1);
    expect(node.data).toEqual({ name: 'a' });

    tree.update({ x: 100000, y: 5000, z: 100000 });
    expect(node.disposed).toBe(true);
    const releasesBefore = calls.release.length;
    expect(tree.complete(node, { name: 'c' })).toBe(false);
    expect(calls.release.length).toBe(releasesBefore + 1);
    expect(node.data).toBeNull();
  });

  it('accepts a completion once and rejects a duplicate for a split child', () => {
    const { tree, calls } = setup();
    tree.update({ x: 200, y: 400, z: 200 });
    const root = tree.roots.get('0,0') as Node;
    tree.complete(root, { name: 'root' });
    const fresh = { name: 'x' };
    // A split child of a node that was built is still building until completed; complete twice.
    const child = (root.children as Node[])[0];
    expect(tree.complete(child, fresh)).toBe(true);
    expect(tree.complete(child, fresh)).toBe(false);
    expect(calls.release.filter((n) => n === child)).toHaveLength(1);
  });

  it('does not re-request a failed node until retryDelayFrames(failures) updates have passed', () => {
    const { tree, calls } = setup();
    const cam = { x: 200, y: 5000, z: 200 };
    tree.update(cam);
    const root = tree.roots.get('0,0') as Node;
    const buildsOf = () => calls.build.filter((n) => n === root).length;
    expect(buildsOf()).toBe(1);

    tree.fail(root);
    expect(root.failures).toBe(1);
    expect(root.building).toBe(false);
    const delay = retryDelayFrames(1);
    for (let i = 1; i < delay; i++) {
      tree.update(cam);
      expect(buildsOf()).toBe(1);
    }
    tree.update(cam);
    expect(buildsOf()).toBe(2);

    // Second consecutive failure waits twice as long.
    tree.fail(root);
    expect(root.failures).toBe(2);
    for (let i = 1; i < retryDelayFrames(2); i++) {
      tree.update(cam);
      expect(buildsOf()).toBe(2);
    }
    tree.update(cam);
    expect(buildsOf()).toBe(3);

    // Success resets the failure count.
    expect(tree.complete(root, { name: 'ok' })).toBe(true);
    expect(root.failures).toBe(0);
  });

  it('ignores fail() for disposed or non-building nodes', () => {
    const { tree } = setup();
    tree.update({ x: 200, y: 5000, z: 200 });
    const root = tree.roots.get('0,0') as Node;
    tree.complete(root, { name: 'ok' });
    tree.fail(root);
    expect(root.failures).toBe(0);
    tree.update({ x: 100000, y: 5000, z: 100000 });
    tree.fail(root);
    expect(root.failures).toBe(0);
  });

  it('dispose releases all data, cancels all builds and resets the visible count', () => {
    const { tree, calls, flush } = setup();
    tree.update(SPLIT_ROOT_ONLY);
    const all = calls.build.slice();
    const completed = flush((n) => calls.build.indexOf(n) % 2 === 0);
    tree.update(SPLIT_ROOT_ONLY);
    expect(tree.visibleCount).toBeGreaterThan(0);

    tree.dispose();
    expect(tree.visibleCount).toBe(0);
    expect(tree.roots.size).toBe(0);
    for (const n of completed) expect(calls.release).toContain(n);
    const stillBuilding = all.filter((n) => !completed.includes(n));
    for (const n of stillBuilding) expect(calls.cancel).toContain(n);
    for (const n of all) expect(n.disposed).toBe(true);

    // Safe to call again and to update afterwards (re-creates roots).
    tree.dispose();
    expect(calls.release.length).toBe(completed.length);
  });
});
