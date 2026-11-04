import * as THREE from 'three';
import type { ActorId, Vec3 } from '../../vfx/ports';
import { HEARTSHARD_SMITE, SUNFORGE, UNBROKEN_OATH } from './tuning';

type Result = { ok: true } | { ok: false; reason: string };

/** Accepts the Knight's null class before M07 as well as 'knight' (as tiers 3 and 4). */
const isKnight = (c: string | null): boolean => c === null || c === 'knight';

type MercyLike = { mercyState?: () => string };
/** Whether a foe is yielding, calming, leaving or staggered for mercy; a throwing reader counts as none (as the resolver does). */
function inMercy(a: unknown): boolean {
  try {
    return ((a as MercyLike).mercyState?.() ?? 'none') !== 'none';
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Unbroken Oath
// ---------------------------------------------------------------------------------------------------------------------

export interface UnbrokenOathPorts {
  now(): number;
  tick(): number;
  playerId(): ActorId;
  classId(): string | null;
  learned(): boolean;
  dead(): boolean;
  /** Why the Oath cannot be taken right now (dead, staggered, busy), or null. */
  blockedReason(): string | null;
  stamina(): number;
  restoreStamina(n: number): void;
  /** Starts the shell on the player; the returned function ends it. */
  shell(): (() => void) | null;
  /** One heartbeat of the vignette. */
  heartbeat(): void;
  reportTrigger(skillId: string): void;
  skillId: string;
}

/** The slice of a damage result the Oath reads. */
export interface OathResult {
  attackerId: ActorId | null;
  attackId?: string;
  outcome: string;
}

/**
 * Unbroken Oath (Bulwark 5). For 8 s a lethal hit on the Knight leaves 1 health instead, whatever the hit: an attack, a bleed or an
 * ignite tick at 1 health, a fall. Only a `script` hit (drowning, scripted deaths: open point C) still kills, so no script can
 * soft-lock. The handler runs at -140, after the trial duel's floor (-150) and before Second Wind (-100), so Second Wind is not spent and a trial still scores. Counterattacks are free: a parry during the
 * Oath opens the verbs' riposte window, and the stab that lands in it hands back the stamina spent since the parry (the stab itself
 * costs none in this build; a heavy swing chained into it is what the refund covers). Dying, a class change, a load or dispose ends it.
 */
export class UnbrokenOath {
  private until = 0;
  private stopFx: (() => void) | null = null;
  private beats = 0;
  private armedUntilTick = -1;
  private staminaAtParry = 0;

  constructor(private readonly p: UnbrokenOathPorts) {}

  get active(): boolean {
    return this.until > 0;
  }

  /** The ability handler body. */
  cast(): Result {
    if (!isKnight(this.p.classId())) return { ok: false, reason: 'wrong-class' };
    if (!this.p.learned()) return { ok: false, reason: 'not-learned' };
    const blocked = this.p.blockedReason();
    if (blocked) return { ok: false, reason: blocked };
    this.end();
    this.until = this.p.now() + UNBROKEN_OATH.seconds;
    this.beats = 0;
    this.stopFx = this.p.shell();
    this.p.reportTrigger(this.p.skillId);
    return { ok: true };
  }

  /**
   * The lethal handler body (order -140). True keeps the Knight at 1 health. `kind` is the request's kind; 'script' is let through.
   * Other actors, and the Knight with the Oath down, are not touched.
   */
  lethal(targetId: ActorId, kind: string): boolean {
    if (this.until <= 0 || targetId !== this.p.playerId() || kind === 'script') return false;
    // Expiry is by time here too, so the Oath never acts a tick after its 8 s.
    if (!this.live() || this.p.now() >= this.until) {
      this.end();
      return false;
    }
    return true;
  }

  /** `player.parried`: the counterattack window opens. */
  onParried(): void {
    if (this.until <= 0) return;
    this.armedUntilTick = this.p.tick() + UNBROKEN_OATH.counterWindowTicks;
    this.staminaAtParry = this.p.stamina();
  }

  /** `damage.dealt`: the riposte stab landed inside the window. Returns the stamina handed back. */
  onDealt(r: OathResult): number {
    if (this.until <= 0 || this.armedUntilTick < 0) return 0;
    if (r.attackerId !== this.p.playerId() || r.attackId !== UNBROKEN_OATH.stabAttackId || r.outcome !== 'hit') return 0;
    const inWindow = this.p.tick() <= this.armedUntilTick;
    this.armedUntilTick = -1;
    if (!inWindow) return 0;
    const spent = this.staminaAtParry - this.p.stamina();
    if (!(spent > 0)) return 0;
    this.p.restoreStamina(spent);
    return spent;
  }

  /** Once per fixed tick: the 8 s, the heartbeat, and the learned / class / death checks. */
  tick(): void {
    if (this.until <= 0) return;
    if (!this.live() || this.p.now() >= this.until) return this.end();
    const beat = Math.floor((this.p.now() - (this.until - UNBROKEN_OATH.seconds)) / UNBROKEN_OATH.heartbeatSeconds);
    if (beat > this.beats) {
      this.beats = beat;
      this.p.heartbeat();
    }
  }

  /** Drops the Oath (load, class change, death, dispose). */
  clear(): void {
    this.end();
  }

  private live(): boolean {
    return !this.p.dead() && isKnight(this.p.classId()) && this.p.learned();
  }

  private end(): void {
    this.armedUntilTick = -1;
    if (this.until <= 0) return;
    this.until = 0;
    this.stopFx?.();
    this.stopFx = null;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Heartshard Smite
// ---------------------------------------------------------------------------------------------------------------------

/** The Knight's weapon and the two markers the weapon tracer sweeps between (hilt at the grip, tip at the blade end). */
export interface SmiteBlade {
  weapon: THREE.Object3D;
  hilt: THREE.Object3D;
  tip: THREE.Object3D;
}

export interface SmiteRequest {
  attackerId: ActorId | null;
  amount: number;
  kind: string;
  outcome: string;
  element?: 'fire';
}

export interface SmiteResult {
  attackerId: ActorId | null;
  targetId: ActorId;
  kind: string;
  outcome: string;
  dealt: number;
  killed: boolean;
}

export interface SmiteFoe {
  readonly dead: boolean;
  readonly team: string;
}

export interface HeartshardSmitePorts {
  now(): number;
  playerId(): ActorId;
  classId(): string | null;
  learned(): boolean;
  dead(): boolean;
  /** The current avatar's weapon and markers, or null (no avatar). */
  blade(): SmiteBlade | null;
  /** The foe as it is now, or null. */
  foe(id: ActorId): (SmiteFoe & MercyLike) | null;
  ignite(targetId: ActorId, spec: { id: string; kind: 'ignite'; dps: number; seconds: number; sourceId: ActorId }): boolean;
  /** Starts the blade effect on the weapon; the returned function ends it. */
  fx(weapon: THREE.Object3D, reach: number): (() => void) | null;
}

/**
 * Heartshard Smite (Vanguard 5, a passive: open point A). `onReleased` is the Knight's own Surge (`spell.released`). For 8 s the
 * weapon is scaled along its long axis (+Y, grip at the origin: KayKit blades) so the hilt-to-tip distance the weapon tracer
 * sweeps becomes 5 m; the tracer keeps the endpoints in weapon-local space and re-applies the weapon's matrix every step, so the
 * scale alone widens the sweep (no hook). Melee hits of the Knight deal x1.5 and are tagged fire (an attacker-band modifier), and
 * a hit that dealt damage, did not kill and left the foe in no mercy state ignites it (`knight.heartshardSmite.ignite`, 2 a second
 * for 3 s) on the next tick. A second Surge restarts the 8 s on the same scale (never scaled twice). The scale is restored on
 * expiry, an avatar swap, death, a class change, a load, an unlearn and dispose.
 */
export class HeartshardSmite {
  private until = 0;
  private held: { weapon: THREE.Object3D; scale: THREE.Vector3 } | null = null;
  private stopFx: (() => void) | null = null;
  private pending: Array<{ foeId: ActorId }> = [];

  constructor(private readonly p: HeartshardSmitePorts) {}

  get active(): boolean {
    return this.until > 0;
  }

  /** `spell.released`: the Surge of the player. Returns whether the Smite is now on. */
  onReleased(casterId: string, spellId: string): boolean {
    if (casterId !== this.p.playerId() || spellId !== HEARTSHARD_SMITE.surgeSpellId) return false;
    if (this.p.dead() || !isKnight(this.p.classId()) || !this.p.learned()) return false;
    const blade = this.p.blade();
    if (!blade) return false;
    if (this.held && this.held.weapon !== blade.weapon) this.end();
    if (!this.held) {
      const reach = this.reachOf(blade);
      if (!(reach > 0)) return false;
      this.held = { weapon: blade.weapon, scale: blade.weapon.scale.clone() };
      // The blade runs along the weapon's local +Y; only that axis grows, so the hilt and the width stay.
      blade.weapon.scale.y *= HEARTSHARD_SMITE.reach / reach;
      blade.weapon.updateWorldMatrix(true, true);
      this.stopFx = this.p.fx(blade.weapon, HEARTSHARD_SMITE.reach);
    }
    this.until = this.p.now() + HEARTSHARD_SMITE.seconds;
    return true;
  }

  /** The attacker-band modifier body (order -180): x1.5 and fire on the Knight's melee hits that land. */
  modify(req: SmiteRequest): void {
    if (this.until <= 0 || this.p.now() >= this.until) return; // by time, so never a tick past the 8 s
    if (req.attackerId !== this.p.playerId() || req.kind !== 'melee' || req.outcome !== 'hit') return;
    if (!(req.amount > 0)) return;
    req.amount *= HEARTSHARD_SMITE.fireFactor;
    req.element = 'fire';
  }

  /** `damage.dealt`: queues the ignite of a Smite hit that landed. */
  onDealt(r: SmiteResult): void {
    if (this.until <= 0 || r.attackerId !== this.p.playerId() || r.kind !== 'melee' || r.outcome !== 'hit' || !(r.dealt > 0) || r.killed) return;
    if (this.pending.length < 16) this.pending.push({ foeId: r.targetId });
  }

  /** Once per fixed tick: flushes the ignites, then checks the 8 s, the weapon (an avatar swap) and the learned / class / death state. */
  tick(): void {
    if (this.pending.length > 0) this.flush();
    if (this.until <= 0) return;
    if (this.p.dead() || !isKnight(this.p.classId()) || !this.p.learned() || this.p.now() >= this.until) return this.end();
    const blade = this.p.blade();
    if (!blade || blade.weapon !== this.held?.weapon) this.end();
  }

  /** Ends the Smite and puts the scale back (avatar swap, death, class change, load, dispose). */
  clear(): void {
    this.end();
  }

  /** Metres between the hilt and tip markers right now (the tracer's reach), 0 when unusable. */
  private reachOf(b: SmiteBlade): number {
    b.weapon.updateWorldMatrix(true, true);
    const a = new THREE.Vector3().setFromMatrixPosition(b.hilt.matrixWorld);
    const t = new THREE.Vector3().setFromMatrixPosition(b.tip.matrixWorld);
    const d = a.distanceTo(t);
    return Number.isFinite(d) ? d : 0;
  }

  private flush(): void {
    const list = this.pending.splice(0);
    for (const { foeId } of list) {
      const f = this.p.foe(foeId);
      if (!f || f.dead || f.team !== 'hostile' || inMercy(f)) continue;
      this.p.ignite(foeId, {
        id: HEARTSHARD_SMITE.igniteId,
        kind: 'ignite',
        dps: HEARTSHARD_SMITE.igniteDps,
        seconds: HEARTSHARD_SMITE.igniteSeconds,
        sourceId: this.p.playerId(),
      });
    }
  }

  private end(): void {
    this.pending.length = 0;
    if (this.held) {
      // Restored on the weapon it was applied to, even when that avatar has been swapped out.
      this.held.weapon.scale.copy(this.held.scale);
      this.held.weapon.updateWorldMatrix(true, true);
      this.held = null;
    }
    this.until = 0;
    this.stopFx?.();
    this.stopFx = null;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Banner of the Sunforge
// ---------------------------------------------------------------------------------------------------------------------

export interface SunforgePorts {
  playerId(): ActorId;
  classId(): string | null;
  learned(): boolean;
  /** Why the banner cannot be planted right now (dead, staggered, busy), or null. */
  blockedReason(): string | null;
  /** `spells.plantBanner({ radius })`; false when the spells service is missing. */
  plant(radius: number): boolean;
  /** The planted banner (position, aura radius), or null. */
  banner(): { position: Vec3; radius: number } | null;
  dead(): boolean;
  feet(): Vec3;
  /** Draws the dome, beam and embers at the banner. */
  fx(position: Vec3, radius: number, seconds: number): void;
  reportTrigger(skillId: string): void;
  skillId: string;
}

/**
 * Banner of the Sunforge (Standard 5). Plants the Knight's banner with a 20 m radius instead of 8 (its damage cut, its 3 s pulse and
 * Hearthfire Ward all read the banner's own radius), replacing any banner already planted. While the Knight's feet are within 20 m
 * (horizontal, inclusive) of that great banner, Ember regeneration is doubled: `regenFactor` is the multiplier registered with the
 * spells service, 1 everywhere else, 1 once the banner expires or a normal Banner Plant (8 m) replaces it, and 1 for any other class
 * or the dead.
 */
export class BannerOfTheSunforge {
  constructor(private readonly p: SunforgePorts) {}

  /** The ability handler body. */
  cast(): Result {
    if (!isKnight(this.p.classId())) return { ok: false, reason: 'wrong-class' };
    if (!this.p.learned()) return { ok: false, reason: 'not-learned' };
    const blocked = this.p.blockedReason();
    if (blocked) return { ok: false, reason: blocked };
    if (!this.p.plant(SUNFORGE.radius)) return { ok: false, reason: 'unavailable' };
    const b = this.p.banner();
    if (b) this.p.fx(b.position, b.radius, SUNFORGE.seconds);
    this.p.reportTrigger(this.p.skillId);
    return { ok: true };
  }

  /** The Ember regen multiplier (read on every regen step). */
  regenFactor(): number {
    if (this.p.dead() || !isKnight(this.p.classId()) || !this.p.learned()) return 1;
    const b = this.p.banner();
    if (!b || b.radius < SUNFORGE.radius) return 1;
    const f = this.p.feet();
    return Math.hypot(f.x - b.position.x, f.z - b.position.z) <= b.radius ? SUNFORGE.regenFactor : 1;
  }
}
