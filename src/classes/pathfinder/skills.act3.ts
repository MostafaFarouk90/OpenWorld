// Pathfinder tier 4 (Act 3, K11 PR 2): Triple Shot, Caltrop Field, Sure Foot. Ports-based so the unit tests need no game;
// `act3.plugin.ts` wires them. Time is the fixed clock's seconds.
import type { StatusSpec } from '../../actors/status';
import type { AbilityHandlerResult } from '../../hud/ports';
import { PF } from './tuning';

type Stop = () => void;
type Vec3 = { x: number; y: number; z: number };

const EPS = 1e-9;
const refuse = (reason: string): AbilityHandlerResult => ({ ok: false, reason });

export interface Act3Ports {
  playerId(): string;
  /** The class is the Pathfinder (a null class is not). */
  isPathfinder(): boolean;
  learned(skillId: string): boolean;
  /** Why the player cannot act now ('dead', 'staggered', 'busy'), else null. */
  blockedReason(): string | null;
  /** Fixed-clock seconds. */
  now(): number;
  feet(): Vec3;
  /** The player's facing, with forward (-sin yaw, -cos yaw). */
  facingYaw(): number;
  /** Visual, best effort; the returned function stops it early. */
  effect?(id: string, at: Vec3, yaw: number, params: Record<string, number>): Stop | null;
  reportTrigger?(skillId: string): void;
}

// ---- Triple Shot ----------------------------------------------------------------------------------------------------------

/** The crossbow's side bolts: a yaw offset in degrees and a damage scale. */
export type SideBolt = { yawDeg: number; scale: number };

/** Frozen, so a volley allocates nothing. */
const TRIPLE: readonly SideBolt[] = Object.freeze([
  Object.freeze({ yawDeg: -PF.tripleShot.yawDeg, scale: PF.tripleShot.sideScale }),
  Object.freeze({ yawDeg: PF.tripleShot.yawDeg, scale: PF.tripleShot.sideScale }),
]);

/**
 * Triple Shot (passive). The `Crossbow.spread` port: for the single shot (index 0) of a learned Pathfinder it names two side
 * bolts at plus and minus 7.5 degrees and x0.6 damage; every other shot, class or state answers null so the crossbow fires as
 * shipped. The crossbow takes one bolt of ammo for the volley, keeps attack id `pathfinder.bolt.1` for all three, applies
 * Steady Shot and the master-bolt scale to all three, spends a Falcon Eye mark on the centre bolt only and lets the side
 * bolts neither pierce nor blast, and both their damage and their poise are x0.6 (so a point-blank volley on one wide body deals
 * up to 2.2x damage and 2.2x poise, not 3x). A side bolt never hits a foe in a mercy state. The volley's visual is the two SIDE
 * tracers only (the crossbow draws the centre tracer and the flare), spawned by `sidesLaunched` for the side bolts that actually
 * launched, as long as the launch range.
 */
export class TripleShot {
  constructor(private readonly p: Act3Ports) {}

  /** `CrossbowPorts.spread`. */
  spread = (shotIndex: number, _origin: Vec3, _direction: Vec3): readonly SideBolt[] | null => {
    if (shotIndex !== 0 || !this.p.isPathfinder() || !this.p.learned(PF.skillIds.tripleShot)) return null;
    this.p.reportTrigger?.(PF.skillIds.tripleShot);
    return TRIPLE;
  };

  /** `CrossbowPorts.sidesLaunched`: draws a tracer for each side bolt that launched. */
  sidesLaunched = (shotIndex: number, origin: Vec3, direction: Vec3, yawDegs: readonly number[], range: number): void => {
    if (shotIndex !== 0 || yawDegs.length === 0) return;
    // yaw 0 faces -Z, so forward is (-sin yaw, -cos yaw).
    const yaw = Math.atan2(-direction.x, -direction.z);
    const pitch = Math.asin(Math.max(-1, Math.min(1, direction.y)));
    this.p.effect?.(PF.tripleShot.effectId, origin, yaw, {
      pitch,
      degrees: PF.tripleShot.yawDeg,
      length: range,
      plus: yawDegs.some((d) => d > 0) ? 1 : 0,
      minus: yawDegs.some((d) => d < 0) ? 1 : 0,
    });
  };
}

// ---- Caltrop Field --------------------------------------------------------------------------------------------------------

/** A hostile as the field sees it. */
export interface FoeView {
  id: string;
  x: number;
  y: number;
  z: number;
  /** Alive, hostile to the player and hittable. */
  live: boolean;
  /** `actor.mercyState?.()`; undefined reads as 'none'. */
  mercy: string | undefined;
  /** A registered boss actor (`ctx.bosses.active()` with `ctx.bosses.state(id).actorId`, as EnemyManager.isBoss reads it). */
  boss: boolean;
}

export interface CaltropFieldPorts extends Act3Ports {
  foes(): Iterable<FoeView>;
  /** `status.apply`; false when refused. */
  slow(targetId: string, spec: StatusSpec): boolean;
  /** Ground height at a point; absent reads the player's feet. */
  heightAt?(x: number, z: number): number;
}

/**
 * Caltrop Field (active; the abilities service charges 15 Ember and the 18 s cooldown on ok). A disc of caltrops, radius 4 m
 * (inclusive), centred 3 m ahead of the player on the ground (`heightAt`), for 10 s. From the cast and every 0.5 s after, each
 * live hostile inside that is not in a mercy state gets `slow` 0.5 for 1 s under one status id, so it lapses a second after the
 * foe leaves; a boss gets 0.25. No damage and no damage request. One field at a time; a recast moves it. It is not a trap and
 * is held nowhere in `Traps`, so it never counts against the Tripwire or Cinder Trap caps. Ends on expiry, unlearning, a class
 * change, a save load, the player's death and dispose.
 */
export class CaltropField {
  private live = false;
  private cx = 0;
  private cy = 0;
  private cz = 0;
  private until = 0;
  private nextTick = 0;
  private stopFx: Stop | null = null;
  /** Foes slowed on the previous tick: a dust puff shows when one newly enters. */
  private slowed = new Set<string>();
  private nowSlowed = new Set<string>();

  constructor(private readonly p: CaltropFieldPorts) {}

  get active(): boolean {
    return this.live;
  }

  get centre(): Vec3 | null {
    return this.live ? { x: this.cx, y: this.cy, z: this.cz } : null;
  }

  cast(): AbilityHandlerResult {
    if (!this.p.isPathfinder()) return refuse('class');
    if (!this.p.learned(PF.skillIds.caltropField)) return refuse('not-learned');
    const blocked = this.p.blockedReason();
    if (blocked) return refuse(blocked);
    this.end();
    const f = this.p.feet();
    const yaw = this.p.facingYaw();
    this.cx = f.x - Math.sin(yaw) * PF.caltropField.ahead;
    this.cz = f.z - Math.cos(yaw) * PF.caltropField.ahead;
    const ground = this.p.heightAt?.(this.cx, this.cz);
    this.cy = typeof ground === 'number' && Number.isFinite(ground) ? ground : f.y;
    const now = this.p.now();
    this.live = true;
    this.until = now + PF.caltropField.seconds;
    this.nextTick = now;
    this.stopFx = this.p.effect?.(PF.caltropField.effectId, { x: this.cx, y: this.cy, z: this.cz }, 0, { seconds: PF.caltropField.seconds, radius: PF.caltropField.radius }) ?? null;
    this.p.reportTrigger?.(PF.skillIds.caltropField);
    this.scan(now);
    return { ok: true };
  }

  update(): void {
    if (!this.live) return;
    if (!this.p.isPathfinder() || !this.p.learned(PF.skillIds.caltropField) || this.p.blockedReason() === 'dead') {
      this.end();
      return;
    }
    this.scan(this.p.now());
    if (this.p.now() + EPS >= this.until) this.end();
  }

  /** Save load, death, class change, dispose, recast and expiry: the field goes. */
  end(): void {
    this.live = false;
    this.stopFx?.();
    this.stopFx = null;
    this.slowed.clear();
    this.nowSlowed.clear();
  }

  private scan(now: number): void {
    // A tick every 0.5 s of the field's life; a long frame gap catches up with one scan (the slow lasts 1 s regardless).
    if (now + EPS < this.nextTick || now + EPS >= this.until) return;
    while (this.nextTick <= now + EPS) this.nextTick += PF.caltropField.tickSeconds;
    const r2 = PF.caltropField.radius * PF.caltropField.radius;
    const me = this.p.playerId();
    this.nowSlowed.clear();
    for (const f of this.p.foes()) {
      if (!f.live || (f.mercy !== undefined && f.mercy !== 'none')) continue;
      const dx = f.x - this.cx;
      const dz = f.z - this.cz;
      if (dx * dx + dz * dz > r2 + EPS || Math.abs(f.y - this.cy) > PF.caltropField.halfHeight) continue;
      const ok = this.p.slow(f.id, {
        id: PF.caltropField.statusId,
        kind: 'slow',
        slow: f.boss ? PF.caltropField.bossSlow : PF.caltropField.slow,
        seconds: PF.caltropField.slowSeconds,
        sourceId: me,
      });
      if (!ok) continue;
      this.nowSlowed.add(f.id);
      if (!this.slowed.has(f.id)) this.p.effect?.(PF.caltropField.effectId, { x: f.x, y: f.y, z: f.z }, 0, { dust: 1 });
    }
    [this.slowed, this.nowSlowed] = [this.nowSlowed, this.slowed];
  }
}

// ---- Sure Foot ------------------------------------------------------------------------------------------------------------

export interface SureFootPorts extends Act3Ports {
  /** `ctx.player.moving`: a move key is held. */
  moving(): boolean;
  /** `movementMode.current`; an absent service reads 'walk'. */
  mode(): string;
}

/**
 * Sure Foot (passive). The `CombatVerbs` knockback filter: for a learned Pathfinder who is moving on foot (`walk`), the
 * knockback of a stagger or a break is cancelled (it answers false: not kept). The stagger animation, its ticks, the poise
 * and the damage are not touched here, and neither are the wade modifier, deep water's push-back, pulls or the sled drop,
 * which are not knockback. Standing still, or in dive, ferry, haul or glide, keeps the shipped knockback.
 */
export class SureFoot {
  constructor(private readonly p: SureFootPorts) {}

  /** `CombatVerbsService.addKnockbackFilter`: true keeps the knockback. */
  keep = (): boolean => {
    if (!this.p.isPathfinder() || !this.p.learned(PF.skillIds.sureFoot)) return true;
    if (!this.p.moving() || this.p.mode() !== 'walk') return true;
    this.p.effect?.(PF.sureFoot.effectId, this.p.feet(), this.p.facingYaw(), {});
    this.p.reportTrigger?.(PF.skillIds.sureFoot);
    return false;
  };
}
