import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TERRAIN } from '../config/constants';
import { TerrainManager } from './TerrainManager';
import type { ChunkJobMessage } from './workerProtocol';
import type { WorkerLike } from './WorkerPool';
import { handleChunkMessage } from './workers/terrain.worker';

class FakeWorker implements WorkerLike {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  posted: ChunkJobMessage[] = [];
  terminated = 0;
  postMessage(message: unknown): void {
    this.posted.push(message as ChunkJobMessage);
  }
  terminate(): void {
    this.terminated++;
  }
  get last(): ChunkJobMessage | undefined {
    return this.posted[this.posted.length - 1];
  }
}

function setup() {
  const workers: FakeWorker[] = [];
  const factory = () => {
    const w = new FakeWorker();
    workers.push(w);
    return w;
  };
  const scene = new THREE.Scene();
  const manager = new TerrainManager(scene, factory);
  const camera = new THREE.Vector3(0, 50, 0);
  /** Builds the worker's real reply for its last posted job. */
  const realReply = (w: FakeWorker) => handleChunkMessage(w.last).message;
  /** Answers the current in-flight job of every worker once; returns how many were answered. */
  const answerAll = () => {
    let n = 0;
    for (const w of workers) {
      if (!w.onmessage || !w.last) continue;
      const msg = realReply(w);
      w.onmessage({ data: msg } as MessageEvent);
      n++;
    }
    return n;
  };
  return { manager, scene, workers, camera, realReply, answerAll };
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('TerrainManager', () => {
  it('adds the group to the scene and posts builds to the workers on update', () => {
    const { manager, scene, workers, camera } = setup();
    expect(scene.children).toContain(manager.group);
    expect(manager.group.children).toHaveLength(0);
    manager.update(camera);
    expect(workers.length).toBeGreaterThanOrEqual(1);
    expect(workers.every((w) => w.posted.length === 1)).toBe(true);
    const req = workers[0].posted[0].request;
    expect(req.segments).toBe(TERRAIN.chunkSegments);
    expect(req.skirtDepth).toBeGreaterThanOrEqual(TERRAIN.minSkirtDepth);
    expect(manager.stats.pending).toBeGreaterThan(workers.length);
    expect(manager.stats.chunks).toBe(0);
    manager.dispose();
  });

  it('prioritises the chunks nearest the camera', () => {
    const { manager, workers } = setup();
    const cam = new THREE.Vector3(1234, 50, -2345);
    manager.update(cam);
    // Same footprint formula as quadtree.distanceTo, without the height term.
    const gap = (r: { centerX: number; centerZ: number; size: number }) => {
      const half = r.size / 2;
      return Math.hypot(Math.max(Math.abs(cam.x - r.centerX) - half, 0), Math.max(Math.abs(cam.z - r.centerZ) - half, 0));
    };
    const first = workers.map((w) => w.posted[0].request);
    expect(first.length).toBeGreaterThan(0);
    // The camera is inside a root, so every first job must cover the camera's x/z.
    for (const r of first) expect(gap(r)).toBe(0);
    manager.dispose();
  });

  it('keeps dispatching nearest-first as builds complete', () => {
    const { manager, workers } = setup();
    const cam = new THREE.Vector3(1234, 50, -2345);
    manager.update(cam);
    const gap = (r: { centerX: number; centerZ: number; size: number }) => {
      const half = r.size / 2;
      return Math.hypot(Math.max(Math.abs(cam.x - r.centerX) - half, 0), Math.max(Math.abs(cam.z - r.centerZ) - half, 0));
    };
    const w = workers[0];
    w.onmessage?.({ data: handleChunkMessage(w.last).message } as MessageEvent);
    const next = (w.last as ChunkJobMessage).request;
    // Roots farther than viewDistance are never requested; the next job is still near the camera.
    expect(gap(next)).toBeLessThanOrEqual(TERRAIN.viewDistance);
    manager.dispose();
  });

  it('creates meshes from real worker replies', () => {
    const { manager, workers, camera, answerAll } = setup();
    manager.update(camera);
    for (let i = 0; i < 3; i++) answerAll();
    const answered = manager.stats.chunks;
    expect(answered).toBeGreaterThanOrEqual(workers.length);
    expect(manager.group.children).toHaveLength(answered);
    for (const child of manager.group.children) {
      const mesh = child as THREE.Mesh;
      expect(mesh.isMesh).toBe(true);
      expect(mesh.geometry.getAttribute('position').count).toBeGreaterThan(0);
      expect(mesh.geometry.getIndex()).not.toBeNull();
      expect(mesh.geometry.boundingSphere).not.toBeNull();
    }
    manager.update(camera);
    expect(manager.stats.visible).toBeGreaterThan(0);
    expect(manager.stats.visible).toBeLessThanOrEqual(manager.stats.chunks);
    manager.dispose();
  });

  it('draws Act 2 chunks with the ground material and Act 1 chunks with the plain one', () => {
    const { manager, camera, answerAll } = setup();
    // Near Cinderreach's west edge the quadtree's chunks straddle both kinds of ground.
    camera.set(14850, 60, 2500);
    manager.update(camera);
    for (let i = 0; i < 6; i++) answerAll();
    const meshes = manager.group.children as THREE.Mesh[];
    const act2 = meshes.filter((m) => m.geometry.getAttribute('ground'));
    const act1 = meshes.filter((m) => !m.geometry.getAttribute('ground'));
    expect(act2.length).toBeGreaterThan(0);
    expect(act1.length).toBeGreaterThan(0);
    for (const m of act2) expect((m.material as THREE.Material).name).toBe('terrain-act2-ground');
    for (const m of act1) expect((m.material as THREE.Material).name).not.toBe('terrain-act2-ground');
    manager.dispose();
  });

  it('gives every built mesh a bounding box containing all vertices, skirts included', () => {
    const { manager, camera, answerAll } = setup();
    manager.update(camera);
    for (let i = 0; i < 3; i++) answerAll();
    expect(manager.group.children.length).toBeGreaterThan(0);
    for (const child of manager.group.children) {
      const geometry = (child as THREE.Mesh).geometry;
      const box = geometry.boundingBox as THREE.Box3;
      const pos = geometry.getAttribute('position');
      const point = new THREE.Vector3();
      const tolerant = box.clone().expandByScalar(1e-3);
      let lowest = Infinity;
      for (let i = 0; i < pos.count; i++) {
        point.fromBufferAttribute(pos, i);
        expect(tolerant.containsPoint(point)).toBe(true);
        lowest = Math.min(lowest, point.y);
      }
      // The skirt reaches below the terrain, and the box covers it.
      expect(box.min.y).toBeLessThanOrEqual(lowest + 1e-3);
    }
    manager.dispose();
  });

  it('drops resident chunks when the camera teleports away and keeps stats consistent', () => {
    const { manager, camera, answerAll } = setup();
    manager.update(camera);
    for (let i = 0; i < 4; i++) answerAll();
    const before = manager.stats.chunks;
    expect(before).toBeGreaterThan(0);
    expect(manager.stats.chunks).toBe(manager.group.children.length);

    manager.update(new THREE.Vector3(200_000, 50, 200_000));
    expect(manager.stats.chunks).toBeLessThan(before);
    expect(manager.stats.chunks).toBe(manager.group.children.length);
    expect(manager.stats.visible).toBeLessThanOrEqual(manager.stats.chunks);

    for (let i = 0; i < 4; i++) {
      answerAll();
      expect(manager.stats.chunks).toBe(manager.group.children.length);
    }
    manager.update(new THREE.Vector3(200_000, 50, 200_000));
    expect(manager.stats.chunks).toBeGreaterThan(0);
    expect(manager.stats.chunks).toBe(manager.group.children.length);
    // Every surviving mesh belongs to the new area.
    for (const child of manager.group.children) expect(child.position.x).toBeGreaterThan(100_000);
    manager.dispose();
  });

  it('logs and recovers when a worker reports a build error', () => {
    const { manager, workers, camera } = setup();
    manager.update(camera);
    const w = workers[0];
    const failing = w.last as ChunkJobMessage;
    w.onmessage?.({ data: { id: failing.id, ok: false, error: 'boom' } } as MessageEvent);
    // Retried once.
    const attempts = () => workers.flatMap((x) => x.posted).filter((m) => m.id === failing.id);
    expect(attempts().length).toBeGreaterThanOrEqual(1);
    // Fail every dispatch of that job and answer the rest, until it gives up (the retry queues
    // behind the other pending jobs). The cap scales with the queue, not the worker count, which
    // depends on navigator.hardwareConcurrency (absent on Node 20, so one worker there).
    for (let i = 0; i < 10_000 && warn.mock.calls.length === 0 && manager.stats.pending > 0; i++) {
      for (const x of workers) {
        if (!x.last || !x.onmessage) continue;
        const msg = x.last.id === failing.id ? { id: failing.id, ok: false, error: 'boom' } : handleChunkMessage(x.last).message;
        x.onmessage({ data: msg } as MessageEvent);
      }
    }
    expect(attempts()).toHaveLength(2);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('boom'));
    manager.dispose();
  });

  it('exposes heightAt and buildPhysicsHeightfield passthroughs', () => {
    const { manager } = setup();
    expect(manager.heightAt(0, 0)).toBe(0);
    expect(Number.isFinite(manager.heightAt(5000, 5000))).toBe(true);
    expect(manager.buildPhysicsHeightfield(0, 0, 10, 2).heights).toHaveLength(9);
    expect(() => manager.buildPhysicsHeightfield(NaN, 0, 10, 2)).toThrow(RangeError);
    manager.dispose();
  });

  it('ignores a non-finite camera position', () => {
    const { manager, workers } = setup();
    manager.update(new THREE.Vector3(NaN, 0, 0));
    expect(workers.every((w) => w.posted.length === 0)).toBe(true);
    expect(manager.stats.pending).toBe(0);
    manager.dispose();
  });

  describe('dispose', () => {
    it('cleans up with queued jobs and one reply in flight', () => {
      const { manager, scene, workers, camera, answerAll, realReply } = setup();
      manager.update(camera);
      answerAll();
      expect(manager.group.children.length).toBeGreaterThan(0);
      expect(manager.stats.pending).toBeGreaterThan(0);

      const inFlightWorker = workers[0];
      const lateReply = realReply(inFlightWorker);
      const lateHandler = inFlightWorker.onmessage;
      const postedBefore = workers.map((w) => w.posted.length);
      manager.dispose();
      // The pool is disposed before the tree cancels its builds, so dispose posts no new jobs.
      expect(workers.map((w) => w.posted.length)).toEqual(postedBefore);

      expect(manager.group.children).toHaveLength(0);
      expect(scene.children).not.toContain(manager.group);
      expect(manager.group.parent).toBeNull();
      for (const w of workers) {
        expect(w.terminated).toBe(1);
        expect(w.onmessage).toBeNull();
        expect(w.onerror).toBeNull();
      }
      expect(manager.stats.chunks).toBe(0);
      expect(manager.stats.visible).toBe(0);
      expect(manager.stats.pending).toBe(0);

      // The reply that was already in flight arrives late.
      expect(() => lateHandler?.({ data: lateReply } as MessageEvent)).not.toThrow();
      expect(manager.group.children).toHaveLength(0);
      expect(manager.stats.chunks).toBe(0);

      // update() after dispose is a no-op.
      manager.update(new THREE.Vector3(5000, 50, 5000));
      expect(workers.map((w) => w.posted.length)).toEqual(postedBefore);
      expect(workers.length).toBe(postedBefore.length);
      expect(manager.group.children).toHaveLength(0);
    });

    it('works before any reply has arrived (only queued and running jobs)', () => {
      const { manager, scene, workers, camera } = setup();
      manager.update(camera);
      expect(manager.stats.pending).toBeGreaterThan(0);
      manager.dispose();
      expect(scene.children).not.toContain(manager.group);
      expect(workers.every((w) => w.terminated === 1)).toBe(true);
      expect(manager.stats.pending).toBe(0);
    });

    it('works before the first update', () => {
      const { manager, scene, workers } = setup();
      expect(() => manager.dispose()).not.toThrow();
      expect(scene.children).not.toContain(manager.group);
      expect(workers.every((w) => w.terminated === 1)).toBe(true);
    });

    it('is safe to call twice', () => {
      const { manager, workers, camera, answerAll } = setup();
      manager.update(camera);
      answerAll();
      manager.dispose();
      expect(() => manager.dispose()).not.toThrow();
      expect(workers.every((w) => w.terminated === 1)).toBe(true);
      expect(manager.group.children).toHaveLength(0);
    });

    it('disposes both shared materials (Act 1 and the Act 2 ground)', () => {
      const { manager, camera, answerAll } = setup();
      manager.update(camera);
      answerAll();
      const spy = vi.spyOn(THREE.Material.prototype, 'dispose');
      manager.dispose();
      const materials = spy.mock.contexts.filter((c) => c instanceof THREE.MeshStandardMaterial);
      expect(materials).toHaveLength(2);
      expect(materials.map((m) => (m as THREE.Material).name)).toContain('terrain-act2-ground');
    });

    it('disposes the geometry of every resident chunk', () => {
      const { manager, camera, answerAll } = setup();
      manager.update(camera);
      answerAll();
      const geometries = manager.group.children.map((c) => (c as THREE.Mesh).geometry);
      expect(geometries.length).toBeGreaterThan(0);
      const spies = geometries.map((g) => vi.spyOn(g, 'dispose'));
      manager.dispose();
      for (const spy of spies) expect(spy).toHaveBeenCalled();
    });
  });

  it('uses no timers', () => {
    vi.useFakeTimers();
    const { manager, camera, answerAll } = setup();
    manager.update(camera);
    answerAll();
    manager.update(camera);
    expect(vi.getTimerCount()).toBe(0);
    manager.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
});
