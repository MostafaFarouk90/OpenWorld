import type { DamageModifier, DamageRequest, DamageResult } from '../../actors/DamageResolver';
import { FIXED_TIMESTEP, PLAYER } from '../../config/constants';
import { ASHBLADE_ATTACKS } from './attackSet';
import type { StealthHooks } from './stealthSkills';
import { SOOT_CLOAK, TWIN_FANGS, WALL_SKITTER } from './tuning';

const ticksOf = (seconds: number): number => Math.max(1, Math.round(seconds / FIXED_TIMESTEP));

/** Attack 1 of the Ashblade set (the dual slice); Twin Fangs only touches this clip. */
export const TWIN_FANGS_CLIP = ASHBLADE_ATTACKS[0].clip;

// ---- Twin Fangs ---------------------------------------------------------------------------------------------------

export interface TwinFangsPorts {
  playerId(): string;
  /** Learned and Ashblade. */
  active(): boolean;
  /** Fixed ticks since the start of the game. */
  tick(): number;
  /** The target is alive, hostile to the player and in mercy state 'none' (the second hit never touches a yielding foe). */
  targetOk(targetId: string): boolean;
  apply(req: DamageRequest): void;
  flash?(targetId: string): void;
}

/**
 * Twin Fangs. Attack 1 already swings its two blades in one clip but the tracer lands one hit per swing, so the passive
 * splits that hit: a modifier scales the first hit to 0.6x (damage and poise), and when it lands a second 0.6x hit on the
 * same target follows 0.12 s later (1.2x in all, a small buff by design). The first hit stays a normal request so every
 * existing hook (Back-Slit, Bleeding Ember, hit feedback, blocks) sees it unchanged. The second hit carries its own attack id
 * so it is never scaled or chained again, and it runs the full modifier pipeline: a block or i-frames in the 0.12 s still
 * count. It is skipped when the first was dodged, blocked, parried or immune, when the target died, left or entered a mercy
 * state, and when the skill stops being active (respec, class change).
 */
export class TwinFangs {
  private readonly base = new Map<string, { amount: number; poise: number }>();
  private queue: { due: number; req: DamageRequest }[] = [];
  /** True while the second hit is being applied (its Back-Slit pass is not reported as a second trigger). */
  applying = false;

  constructor(private readonly p: TwinFangsPorts) {}

  get pending(): number {
    return this.queue.length;
  }

  modifier: DamageModifier = (req) => {
    if (req.kind !== 'melee' || req.attackerId !== this.p.playerId() || req.attackId !== TWIN_FANGS_CLIP || !this.p.active()) return;
    this.base.set(req.targetId, { amount: req.amount, poise: req.poise });
    req.amount *= TWIN_FANGS.hitScale;
    req.poise *= TWIN_FANGS.hitScale;
  };

  onDealt = (r: DamageResult): void => {
    if (r.kind !== 'melee' || r.attackerId !== this.p.playerId() || r.attackId !== TWIN_FANGS_CLIP) return;
    const base = this.base.get(r.targetId);
    this.base.delete(r.targetId);
    if (!base || !this.p.active() || r.outcome !== 'hit' || !(r.dealt > 0) || r.killed) return;
    if (this.queue.length >= TWIN_FANGS.maxQueued) return;
    const req: DamageRequest = {
      attackerId: r.attackerId,
      targetId: r.targetId,
      amount: base.amount * TWIN_FANGS.hitScale,
      poise: base.poise * TWIN_FANGS.hitScale,
      kind: 'melee',
      attackId: TWIN_FANGS.attackId,
    };
    if (r.swingId !== undefined) req.swingId = r.swingId;
    if (r.bone !== undefined) req.bone = r.bone;
    if (r.point) req.point = r.point.clone();
    if (r.normal) req.normal = r.normal.clone();
    if (r.direction) req.direction = r.direction.clone();
    this.queue.push({ due: this.p.tick() + ticksOf(TWIN_FANGS.delaySeconds), req });
  };

  tick(): void {
    if (this.queue.length === 0) return;
    const now = this.p.tick();
    if (!this.p.active()) {
      this.clear();
      return;
    }
    const due: DamageRequest[] = [];
    this.queue = this.queue.filter((q) => (q.due <= now ? (due.push(q.req), false) : true));
    for (const req of due) {
      if (!this.p.targetOk(req.targetId)) continue;
      this.applying = true;
      try {
        this.p.apply(req);
      } finally {
        this.applying = false;
      }
      this.p.flash?.(req.targetId);
    }
  }

  clear(): void {
    this.queue = [];
    this.base.clear();
  }
}

// ---- Soot Cloak ---------------------------------------------------------------------------------------------------

export interface SootCloakPorts {
  /** Learned and Ashblade. */
  active(): boolean;
  stealth(): StealthHooks | undefined;
  tick(): number;
  feet(): { x: number; y: number; z: number };
  /** True while the dodge action plays (the rising edge is the dodge start). */
  dodging(): boolean;
  playerId(): string;
  /** Visual, best effort; the handle's `stop` ends it early. */
  effect?(): (() => void) | null;
  warn(message: string): void;
}

/**
 * Soot Cloak: a dodge (the start of the dodge action, whether or not it avoids a hit) hides the player from observers that
 * have not noticed the player for 5 s. A 1.2 m sight-blocker disc is re-added at the feet every 0.25 s and the previous one
 * released (the stealth hooks hold a static disc), and the footstep noise is halved. It ends on the player's first
 * attack (`damage.dealt` with the player as attacker, melee or spell), on a respec or class change, and on dispose.
 * Blockers only break sight: an enemy that is already chasing keeps the player (see the real-Enemy test). 12 s cooldown
 * from the dodge.
 */
export class SootCloak {
  private disc: (() => void) | null = null;
  private noise: (() => void) | null = null;
  private fx: (() => void) | null = null;
  private endsAt = 0;
  private nextDisc = 0;
  private discX = 0;
  private discZ = 0;
  private cooldownUntil = -Infinity;
  private wasDodging = false;
  private warned = false;

  constructor(private readonly p: SootCloakPorts) {}

  get cloaked(): boolean {
    return this.endsAt > 0;
  }

  tick(): void {
    const dodging = this.p.dodging();
    const edge = dodging && !this.wasDodging;
    this.wasDodging = dodging;
    if (!this.p.active()) {
      this.end();
      return;
    }
    const now = this.p.tick();
    if (this.cloaked && now >= this.endsAt) this.end();
    if (edge && !this.cloaked && now >= this.cooldownUntil) this.start(now);
    if (this.cloaked) {
      const f = this.p.feet();
      const far = Math.hypot(f.x - this.discX, f.z - this.discZ) > SOOT_CLOAK.radius / 2;
      if (far || now >= this.nextDisc) this.refresh(now);
    }
  }

  /** `damage.dealt`: the player's own attack ends the cloak. */
  onDealt = (r: DamageResult): void => {
    if (!this.cloaked || r.attackerId !== this.p.playerId()) return;
    if (r.kind !== 'melee' && r.kind !== 'spell') return;
    this.end();
  };

  end(): void {
    this.disc?.();
    this.noise?.();
    this.fx?.();
    this.disc = this.noise = this.fx = null;
    this.endsAt = 0;
  }

  /** Save load or the player's death: drops the cloak (the cooldown stands). */
  reset(): void {
    this.end();
    this.wasDodging = false;
  }

  private start(now: number): void {
    const svc = this.p.stealth();
    if (!svc || typeof svc.addSightBlocker !== 'function') {
      if (!this.warned) {
        this.warned = true;
        this.p.warn('ashblade: the stealth service has no addSightBlocker, Soot Cloak is inert');
      }
      return;
    }
    this.cooldownUntil = now + ticksOf(SOOT_CLOAK.cooldownSeconds);
    this.endsAt = now + ticksOf(SOOT_CLOAK.seconds);
    this.nextDisc = now;
    if (typeof svc.addNoiseScale === 'function') this.noise = svc.addNoiseScale(SOOT_CLOAK.noiseSource, SOOT_CLOAK.noiseScale);
    this.fx = this.p.effect?.() ?? null;
  }

  private refresh(now: number): void {
    const svc = this.p.stealth();
    if (!svc || typeof svc.addSightBlocker !== 'function') {
      this.end();
      return;
    }
    const f = this.p.feet();
    this.discX = f.x;
    this.discZ = f.z;
    const prev = this.disc;
    this.disc = svc.addSightBlocker({ x: f.x, z: f.z, r: SOOT_CLOAK.radius, seconds: SOOT_CLOAK.discSeconds });
    prev?.();
    this.nextDisc = now + ticksOf(SOOT_CLOAK.refreshSeconds);
  }
}

// ---- Wall Skitter -------------------------------------------------------------------------------------------------

export interface WallSkitterPorts {
  /** Learned and Ashblade. */
  active(): boolean;
  grounded(): boolean;
  /** The controller's last wall contact: the surface normal, or null. */
  wallContact(): { normal: { x: number; z: number } } | null;
  wallSlide(maxFallSpeed: number): void;
  /** The jump input was pressed this tick (edge). */
  jumpPressed(): boolean;
  /** Sets the controller's vertical speed (m/s) for the coming move. */
  launch(speed: number): void;
  holdMove(move: { x: number; z: number; speed: number } | null): void;
  facingYaw(): number;
  /** Rolls the avatar root by `radians` about its forward axis (0 restores it). */
  lean(radians: number): void;
  effect?(): void;
}

/**
 * Wall Skitter. Airborne with a wall contact the controller's `wallSlide(0.5)` is requested each tick, for up to 1.2 s per
 * airtime (reset on landing). Grounded play never triggers: sprinting into a wall on the ground does nothing. A jump
 * press while sliding is a wall kick: `controller.launch(jumpSpeed)` for the vertical part (the Player passes no
 * `jumpSpeed` to the controller, so there is no `intent.jumpSpeed` route from outside) and a forced move along the wall
 * normal held for a few ticks. The avatar root rolls toward the wall while sliding and eases back after.
 */
export class WallSkitter {
  private slideTicks = 0;
  private kickLeft = 0;
  private kicked = false;
  private kickDir: { x: number; z: number } | null = null;
  private roll = 0;

  constructor(private readonly p: WallSkitterPorts) {}

  /** Fixed ticks spent sliding this airtime. */
  get slid(): number {
    return this.slideTicks;
  }

  get leaning(): number {
    return this.roll;
  }

  tick(): void {
    if (!this.p.active()) {
      this.reset();
      return;
    }
    if (this.kickDir) {
      if (this.kickLeft > 0) {
        this.p.holdMove({ x: this.kickDir.x, z: this.kickDir.z, speed: WALL_SKITTER.kickSpeed });
        this.kickLeft--;
      } else {
        this.p.holdMove(null);
        this.kickDir = null;
      }
    }
    if (this.p.grounded()) {
      this.slideTicks = 0;
      this.kicked = false;
      this.easeTo(0);
      return;
    }
    const wall = this.p.wallContact();
    if (!wall || this.slideTicks >= ticksOf(WALL_SKITTER.maxSeconds)) {
      this.easeTo(0);
      return;
    }
    this.slideTicks++;
    this.p.wallSlide(WALL_SKITTER.slideSpeed);
    const n = Math.hypot(wall.normal.x, wall.normal.z);
    if (n < 1e-6) return;
    const nx = wall.normal.x / n;
    const nz = wall.normal.z / n;
    // The wall lies at -normal; the avatar's right is (cos yaw, -sin yaw). Leaning toward the wall is a roll toward its side.
    const yaw = this.p.facingYaw();
    const side = -nx * Math.cos(yaw) + nz * Math.sin(yaw);
    this.easeTo(-WALL_SKITTER.leanRadians * Math.max(-1, Math.min(1, side)));
    if (this.p.jumpPressed() && !this.kicked) {
      this.kicked = true;
      this.p.launch(PLAYER.jumpSpeed);
      this.kickDir = { x: nx, z: nz };
      this.p.holdMove({ x: nx, z: nz, speed: WALL_SKITTER.kickSpeed });
      this.kickLeft = WALL_SKITTER.kickTicks - 1;
      this.p.effect?.();
    }
  }

  reset(): void {
    if (this.slideTicks === 0 && !this.kickDir && !this.kicked && this.roll === 0) return;
    this.slideTicks = 0;
    this.kicked = false;
    this.kickLeft = 0;
    this.kickDir = null;
    this.p.holdMove(null);
    this.roll = 0;
    this.p.lean(0);
  }

  private easeTo(target: number): void {
    if (this.roll === 0 && target === 0) return;
    this.roll += (target - this.roll) * WALL_SKITTER.leanEase;
    if (Math.abs(this.roll) < 1e-3 && target === 0) this.roll = 0;
    this.p.lean(this.roll);
  }
}
