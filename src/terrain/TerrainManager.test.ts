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
    const { manager, workers, camera } = setup();
    manager.update(camera);
    const firstRoot = workers[0].posted[0].request;
    // Answer the first job: the next one dispatched to that worker is not a far-away root.
    workers[0].onmessage?.({ data: handleChunkMessage(workers[0].last).message } as MessageEvent);
    const next = workers[0].last?.request;
    expect(next).toBeDefined();
    const dist = (r: { centerX: number; centerZ: number }) => Math.hypot(r.centerX, r.centerZ);
    expect(dist(next as { centerX: number; centerZ: number })).toBeLessThan(TERRAIN.viewDistance * 2);
    expect(firstRoot.size).toBeGreaterThan(0);
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
    // behind the other pending jobs).
    for (let i = 0; i < 200 && warn.mock.calls.length === 0; i++) {
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
