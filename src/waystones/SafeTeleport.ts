import { WAYSTONE_TUNING } from './tuning';
import type { Vec3 } from './types';

/**
 * What the safe teleport needs from the engine. `ready` is the core's teleport
 * handle check (collider patch registered and visible to the controller after
 * a physics step); `groundedBelow` is a downward ray from the feet.
 */
export interface TeleportPorts {
  place(feet: Vec3, yaw: number): void;
  /** Hold the player still (no gravity, no movement); returns the release function. */
  freeze(): () => void;
  ready(): boolean;
  groundedBelow(maxDistance: number): boolean;
  chunksResident(feet: Vec3): boolean;
  fade(opacity: number, seconds: number): void;
  heightAt(x: number, z: number): number;
}

export type TeleportOutcome = { ok: true } | { ok: false; reason: 'terrain-not-ready' | 'busy' };

type Phase = 'idle' | 'fading-out' | 'settling' | 'revealing' | 'stuck';

interface Job {
  target: Vec3;
  yaw: number;
  fallback: { feet: Vec3; yaw: number } | null;
  resolve: (o: TeleportOutcome) => void;
}

/**
 * Condition-based teleport: place, freeze until the ground under the feet is
 * real, then lift the fade. Driven by `update(dt)` once per fixed tick, after
 * the physics step, so "a step has run since placement" is counted in ticks.
 */
export class SafeTeleport {
  private phase: Phase = 'idle';
  private job: Job | null = null;
  private release: (() => void) | null = null;
  private clock = 0;
  private ticksSincePlace = 0;
  private retried = false;
  private usedFallback = false;

  constructor(private readonly ports: TeleportPorts) {}

  /** True from the first call until the fade has lifted (or the player is stuck waiting for terrain). */
  get active(): boolean {
    return this.phase !== 'idle';
  }

  /** The position the player will be at once the teleport completes (for saves during travel). */
  get destination(): Vec3 | null {
    return this.job ? { ...this.job.target } : null;
  }

  start(target: Vec3, yaw: number, fallback: { feet: Vec3; yaw: number } | null = null): Promise<TeleportOutcome> {
    if (this.phase !== 'idle' && this.phase !== 'stuck') {
      return Promise.resolve({ ok: false, reason: 'busy' });
    }
    if (this.phase === 'stuck') this.finishStuck();
    return new Promise((resolve) => {
      this.job = { target: this.clampToTerrain(target), yaw, fallback, resolve };
      this.phase = 'fading-out';
      this.clock = 0;
      this.retried = false;
      this.usedFallback = false;
      this.ports.fade(1, WAYSTONE_TUNING.fadeOutSeconds);
    });
  }

  update(dt: number): void {
    const job = this.job;
    if (!job || !(dt >= 0)) return;
    this.clock += dt;
    switch (this.phase) {
      case 'fading-out':
        if (this.clock >= WAYSTONE_TUNING.fadeOutSeconds) this.placeNow(job.target, job.yaw);
        break;
      case 'settling':
        this.ticksSincePlace++;
        if (this.groundOk()) {
          this.phase = 'revealing';
          this.clock = 0;
        } else if (this.clock >= WAYSTONE_TUNING.settleTimeoutSeconds) {
          this.onSettleTimeout(job);
        }
        break;
      case 'revealing':
        if (this.ports.chunksResident(job.target) || this.clock >= WAYSTONE_TUNING.revealTimeoutSeconds) {
          this.complete(job);
        }
        break;
      case 'stuck':
        if (this.groundOk()) this.finishStuck();
        else this.ticksSincePlace++;
        break;
      default:
        break;
    }
  }

  private clampToTerrain(p: Vec3): Vec3 {
    const ground = this.ports.heightAt(p.x, p.z);
    return { x: p.x, y: Math.max(p.y, ground) + (p.y < ground ? WAYSTONE_TUNING.retryLift : 0), z: p.z };
  }

  private placeNow(feet: Vec3, yaw: number): void {
    this.release?.();
    this.ports.place(feet, yaw);
    this.release = this.ports.freeze();
    this.phase = 'settling';
    this.clock = 0;
    this.ticksSincePlace = 0;
  }

  private groundOk(): boolean {
    return this.ticksSincePlace >= 1 && this.ports.ready() && this.ports.groundedBelow(WAYSTONE_TUNING.groundRayMaxDistance);
  }

  private onSettleTimeout(job: Job): void {
    if (!this.retried) {
      this.retried = true;
      const t = job.target;
      this.placeNow({ x: t.x, y: Math.max(t.y, this.ports.heightAt(t.x, t.z)) + WAYSTONE_TUNING.retryLift, z: t.z }, job.yaw);
      return;
    }
    if (!this.usedFallback && job.fallback) {
      this.usedFallback = true;
      this.retried = false;
      job.target = { ...job.fallback.feet };
      job.yaw = job.fallback.yaw;
      this.placeNow(job.target, job.yaw);
      return;
    }
    // Nothing worked: stay frozen and keep checking until terrain shows up.
    this.phase = 'stuck';
    job.resolve({ ok: false, reason: 'terrain-not-ready' });
    this.job = { ...job, resolve: () => undefined };
  }

  private complete(job: Job): void {
    this.release?.();
    this.release = null;
    this.ports.fade(0, WAYSTONE_TUNING.fadeInSeconds);
    const failedOver = this.usedFallback;
    this.job = null;
    this.phase = 'idle';
    job.resolve(failedOver ? { ok: false, reason: 'terrain-not-ready' } : { ok: true });
  }

  private finishStuck(): void {
    this.release?.();
    this.release = null;
    this.ports.fade(0, WAYSTONE_TUNING.fadeInSeconds);
    this.job = null;
    this.phase = 'idle';
  }
}
