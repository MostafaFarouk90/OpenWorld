import * as THREE from 'three';
import { ActorMaterials, getFx } from './ActorMaterials';

interface Job {
  start: number;
  seconds: number;
  reverse: boolean;
  mats: THREE.MeshStandardMaterial[];
  resolve: () => void;
}

const DEFAULT_TINT = 0xff8a2a;

export class Dissolver {
  private readonly jobs = new Map<THREE.Object3D, Job>();
  private disposed = false;

  constructor(private readonly materials: ActorMaterials) {}

  start(
    root: THREE.Object3D,
    seconds: number,
    now: number,
    opts?: { tint?: number; reverse?: boolean },
  ): { done: Promise<void>; cancel(): void } {
    const instant = { done: Promise.resolve(), cancel() {} };
    if (this.disposed || !root || !Number.isFinite(seconds) || seconds <= 0 || !Number.isFinite(now)) return instant;
    const mats = this.materials.ensure(root);
    if (mats.length === 0) return instant;

    const prev = this.jobs.get(root);
    if (prev) {
      this.jobs.delete(root);
      prev.resolve();
    }
    const reverse = !!opts?.reverse;
    for (const m of mats) {
      const fx = getFx(m);
      if (!fx) continue;
      fx.uDissolveTint.value.setHex(opts?.tint ?? DEFAULT_TINT);
      fx.uDissolve.value = reverse ? 1 : 0;
    }
    let resolve!: () => void;
    const done = new Promise<void>((r) => (resolve = r));
    const job: Job = { start: now, seconds: Math.min(10, Math.max(0.05, seconds)), reverse, mats, resolve };
    this.jobs.set(root, job);
    return {
      done,
      cancel: () => {
        if (this.jobs.get(root) !== job) return;
        this.jobs.delete(root);
        this.set(job, 0);
        job.resolve();
      },
    };
  }

  update(now: number): void {
    for (const [root, job] of this.jobs) {
      const p = Math.min(1, Math.max(0, (now - job.start) / job.seconds));
      this.set(job, job.reverse ? 1 - p : p);
      for (const m of job.mats) {
        const fx = getFx(m);
        if (fx) fx.uTime.value = now;
      }
      if (p >= 1) {
        this.jobs.delete(root);
        job.resolve();
      }
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const job of this.jobs.values()) job.resolve();
    this.jobs.clear();
  }

  private set(job: Job, v: number): void {
    for (const m of job.mats) {
      const fx = getFx(m);
      if (fx) fx.uDissolve.value = v;
    }
  }
}
