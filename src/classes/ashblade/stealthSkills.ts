import type { AbilityHandlerResult } from '../../hud/ports';
import { ASH_CLOUD } from './tuning';

/**
 * The two hooks of thread 18's `stealth` service (PR #47, `StealthEffects`). The service is read loosely and every call is
 * feature-detected: it is absent until #47 is on main and a rename must not break the class.
 */
export interface StealthHooks {
  addNoiseScale?(source: string, scale: number): () => void;
  addSightBlocker?(b: { x: number; z: number; r: number; seconds: number }): () => void;
}

export const QUIET_SOLES_SOURCE = 'ashblade.quietSoles';

/**
 * Quiet Soles: footsteps do not alert. There is no unlearn event, so the scale is reconciled every tick against
 * `wanted()` (learned and Ashblade) and against the identity of the stealth service, which also rebinds after a restart.
 */
export class QuietSoles {
  private handle: (() => void) | null = null;
  private bound: StealthHooks | null = null;
  private warned = false;

  constructor(
    private readonly wanted: () => boolean,
    private readonly stealth: () => StealthHooks | undefined,
    private readonly warn: (m: string) => void = () => undefined,
  ) {}

  get bindings(): number {
    return this.handle ? 1 : 0;
  }

  tick(): void {
    const svc = this.stealth() ?? null;
    if (this.handle && (!this.wanted() || svc !== this.bound)) this.release();
    if (this.handle || !this.wanted() || !svc) return;
    if (typeof svc.addNoiseScale !== 'function') {
      if (!this.warned) {
        this.warned = true;
        this.warn('ashblade: the stealth service has no addNoiseScale, Quiet Soles is inert');
      }
      return;
    }
    this.handle = svc.addNoiseScale(QUIET_SOLES_SOURCE, 0);
    this.bound = svc;
  }

  release(): void {
    this.handle?.();
    this.handle = null;
    this.bound = null;
  }
}

export interface AshCloudPorts {
  isAshblade(): boolean;
  stealth(): StealthHooks | undefined;
  feet(): { x: number; y: number; z: number };
  /** The player's facing, with forward (-sin yaw, -cos yaw). */
  facingYaw(): number;
  /** Surface height at a point, or null when there is no ground (the cloud then rests at the feet's height). */
  groundAt(x: number, z: number, nearY: number): number | null;
  /** Distance to the first wall along a horizontal ray at chest height, or null; stops the cloud landing in the next room. */
  wallAhead(from: { x: number; y: number; z: number }, dir: { x: number; z: number }, max: number): number | null;
  /** Visual and animation; both best effort. */
  spawnCloud(at: { x: number; y: number; z: number }, radius: number, seconds: number): void;
  throwClip(): void;
  /** Thread 5's `enemies.perception` (PR #53): without it the cloud blocks the stealth sections' sight only. */
  perceptionPresent(): boolean;
  warn(message: string): void;
}

/**
 * Ash Cloud (Smokecloak 2, the abilities handler): throws a 3.5 m smoke bomb 3 m ahead that blocks sight for 6 s through
 * `stealth.addSightBlocker`. Ember and the 18 s cooldown are the abilities service's. It refuses (nothing spent) outside the
 * class and while the stealth service is absent.
 */
export function ashCloudHandler(p: AshCloudPorts): () => AbilityHandlerResult {
  let warnedPerception = false;
  return () => {
    if (!p.isAshblade()) return { ok: false, reason: 'not-ashblade' };
    const svc = p.stealth();
    if (!svc || typeof svc.addSightBlocker !== 'function') return { ok: false, reason: 'no-stealth' };
    const feet = p.feet();
    const yaw = p.facingYaw();
    const dir = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
    const wall = p.wallAhead(feet, dir, ASH_CLOUD.ahead);
    const d = wall === null ? ASH_CLOUD.ahead : Math.max(0, wall - 0.3);
    const x = feet.x + dir.x * d;
    const z = feet.z + dir.z * d;
    const y = p.groundAt(x, z, feet.y) ?? feet.y;
    svc.addSightBlocker({ x, z, r: ASH_CLOUD.radius, seconds: ASH_CLOUD.seconds });
    p.throwClip();
    p.spawnCloud({ x, y, z }, ASH_CLOUD.radius, ASH_CLOUD.seconds);
    if (!warnedPerception && !p.perceptionPresent()) {
      warnedPerception = true;
      p.warn('ashblade: enemies.perception is absent, so the Ash Cloud hides the player from stealth sections only');
    }
    return { ok: true };
  };
}
