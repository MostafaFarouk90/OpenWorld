// Emberwright tier 4 (Act 3, K11 PR 2): Cinder Rain, Temper Weapon, Updraft. Ports-based so the unit tests need no game;
// `act3.plugin.ts` wires them. Time is the fixed clock's seconds; the only scans are the 2 Hz field tick and the cast itself.
// (The tier 3 ports' `apply` type has no `element`, so this file declares its own ports over the real `DamageRequest`.)
import type { DamageModifier, DamageRequest, DamageResult } from '../../actors/DamageResolver';
import type { StatusEntry, StatusSpec } from '../../actors/status';
import type { AbilityHandlerResult } from '../../hud/ports';
import { ATTACKS, CINDER_RAIN, OWN_SPELL_ATTACK_IDS, TEMPER_WEAPON, UPDRAFT } from './tuning';

type Stop = () => void;
type Vec3 = { x: number; y: number; z: number };

const EPS = 1e-9;
const refuse = (reason: string): AbilityHandlerResult => ({ ok: false, reason });

/** A hostile as the skills see it: where it stands and whether it may be hurt. */
export interface FoeView {
  id: string;
  x: number;
  y: number;
  z: number;
  /** Alive, hostile to the player and hittable. */
  live: boolean;
  /** `actor.mercyState?.()`; undefined reads as 'none'. */
  mercy: string | undefined;
}

const clean = (f: FoeView): boolean => f.live && (f.mercy === undefined || f.mercy === 'none');

export interface Act3Ports {
  playerId(): string;
  /** The class is the Emberwright (progression's class and the worn avatar). */
  isEmberwright(): boolean;
  learned(skillId: string): boolean;
  /** Why the player cannot act now ('dead', 'staggered', 'busy'), else null. */
  blockedReason(): string | null;
  /** Fixed-clock seconds. */
  now(): number;
  feet(): Vec3;
  /** The player's facing, with forward (-sin yaw, -cos yaw). */
  facingYaw(): number;
  /** Visual, best effort; the returned function stops it early. `attachTo` rides that actor's root (then `at` is an offset). */
  effect?(id: string, at: Vec3, yaw: number, attachTo: string | null, params: Record<string, number>): Stop | null;
  reportTrigger?(skillId: string): void;
}

function gate(p: Act3Ports, skillId: string): AbilityHandlerResult | null {
  if (!p.isEmberwright()) return refuse('class');
  if (!p.learned(skillId)) return refuse('not-learned');
  const blocked = p.blockedReason();
  if (blocked) return refuse(blocked);
  return null;
}

// ---- Cinder Rain ----------------------------------------------------------------------------------------------------

export interface CinderRainPorts extends Act3Ports {
  /** `lockOn.targetId`, or null. */
  lockTarget(): string | null;
  foe(id: string): FoeView | null;
  foes(): Iterable<FoeView>;
  /** Terrain height at (x, z); absent reads as the anchor's own y. */
  heightAt?(x: number, z: number): number;
  apply(req: DamageRequest): DamageResult | null;
  ignite(targetId: string, spec: StatusSpec): boolean;
}

/**
 * Cinder Rain. A 5 m radius field for 3 s centred on the lock-on target when that is a live hostile within 20 m, else 8 m ahead
 * of the player; grounded with `heightAt` when there is one. Every 0.5 s (six ticks, the last at 3 s) each live hostile inside
 * (horizontal distance <= 5 m, inclusive, and within 3 m of the field's ground) takes 0.35x the base spell damage
 * (`BOLT.damage`, 3.5) as a `spell` request tagged `element: 'fire'` (fire resistance reads it) and, when that hit landed
 * and did not kill, catches `ignite` under the skill's own id. A foe in any mercy state is skipped, and so is a foe that
 * yielded from the hit itself. One field at a time; a recast moves it. The centre is fixed at the cast.
 */
export class CinderRain {
  private live = false;
  private cx = 0;
  private cy = 0;
  private cz = 0;
  private until = 0;
  private nextTick = 0;
  private stopFx: Stop | null = null;

  constructor(private readonly p: CinderRainPorts) {}

  get active(): boolean {
    return this.live;
  }

  get centre(): Vec3 {
    return { x: this.cx, y: this.cy, z: this.cz };
  }

  cast(): AbilityHandlerResult {
    const refused = gate(this.p, CINDER_RAIN.skillId);
    if (refused) return refused;
    this.end();
    const f = this.p.feet();
    let x: number;
    let z: number;
    let y: number;
    const lock = this.p.lockTarget();
    const foe = lock ? this.p.foe(lock) : null;
    if (foe && foe.live && Math.hypot(foe.x - f.x, foe.z - f.z) <= CINDER_RAIN.lockRange + EPS) {
      x = foe.x;
      z = foe.z;
      y = foe.y;
    } else {
      const yaw = this.p.facingYaw();
      x = f.x - Math.sin(yaw) * CINDER_RAIN.ahead;
      z = f.z - Math.cos(yaw) * CINDER_RAIN.ahead;
      y = f.y;
    }
    const ground = this.p.heightAt?.(x, z);
    if (typeof ground === 'number' && Number.isFinite(ground)) y = ground;
    this.cx = x;
    this.cy = y;
    this.cz = z;
    const now = this.p.now();
    this.live = true;
    this.until = now + CINDER_RAIN.seconds;
    this.nextTick = now + CINDER_RAIN.tickSeconds;
    this.stopFx = this.p.effect?.(CINDER_RAIN.effectId, { x, y, z }, 0, null, { seconds: CINDER_RAIN.seconds, radius: CINDER_RAIN.radius }) ?? null;
    this.p.reportTrigger?.(CINDER_RAIN.skillId);
    return { ok: true };
  }

  update(): void {
    if (!this.live) return;
    if (!this.p.isEmberwright() || !this.p.learned(CINDER_RAIN.skillId) || this.p.blockedReason() === 'dead') {
      this.end();
      return;
    }
    const now = this.p.now();
    while (this.live && this.nextTick <= this.until + EPS && now + EPS >= this.nextTick) {
      this.nextTick += CINDER_RAIN.tickSeconds;
      this.rain();
    }
    if (this.live && now + EPS >= this.until) this.end();
  }

  /** Expiry, a class change, a respec, a load, the player's death and dispose. */
  end(): void {
    this.live = false;
    this.stopFx?.();
    this.stopFx = null;
  }

  private rain(): void {
    const me = this.p.playerId();
    const r2 = CINDER_RAIN.radius * CINDER_RAIN.radius;
    for (const f of this.p.foes()) {
      if (!clean(f)) continue;
      const dx = f.x - this.cx;
      const dz = f.z - this.cz;
      if (dx * dx + dz * dz > r2 + EPS || Math.abs(f.y - this.cy) > CINDER_RAIN.halfHeight) continue;
      const r = this.p.apply({ attackerId: me, targetId: f.id, amount: CINDER_RAIN.damage, poise: 0, kind: 'spell', attackId: CINDER_RAIN.attackId, element: 'fire' });
      const after = r && r.outcome === 'hit' && !r.killed ? this.p.foe(f.id) : null;
      if (after && clean(after)) {
        this.p.ignite(f.id, { id: CINDER_RAIN.igniteId, kind: 'ignite', dps: CINDER_RAIN.igniteDps, seconds: CINDER_RAIN.igniteSeconds, sourceId: me });
      }
    }
  }
}

// ---- Temper Weapon --------------------------------------------------------------------------------------------------

/** A candidate companion: an ally-team actor that is alive and is not the Iron Familiar (the plugin filters; the class re-checks the distance). */
export interface CompanionView {
  id: string;
  x: number;
  y: number;
  z: number;
}

export interface TemperWeaponPorts extends Act3Ports {
  /** Every live ally-team actor except the player and the familiar. */
  companions(): Iterable<CompanionView>;
  /** The tempered companion is still in the world and in the party (alive, not despawned, not left). */
  companionHere(actorId: string): boolean;
  foe(id: string): FoeView | null;
  statuses(actorId: string): readonly StatusEntry[];
  ignite(targetId: string, spec: StatusSpec): boolean;
}

/**
 * Temper Weapon. Enchants the nearest live companion within 10 m (the plugin hands over ally-team actors that are not dead and
 * not the Iron Familiar); with none near, the Emberwright's own staff. For 20 s a hit of that actor's own attacks, outcome 'hit',
 * deals x1.3 and is tagged `element: 'fire'` (an attacker-band modifier at -148). A companion's own attacks have an attack id
 * starting 'companion.'; the Emberwright's are her spells 1 to 4 (`OWN_SPELL_ATTACK_IDS`) and the staff tap of those four clips
 * (kind melee, attack id the clip). Skills, statuses and ignite ticks are none of them. After such a hit that dealt damage, did not
 * kill and left the foe in no mercy state, the foe is ignited (`emberwright.temperWeapon.ignite`, 2 a second for 3 s), unless it
 * already burns from any `emberwright.*` ignite (Ember Bolt, Fire Wall, Cinder Rain, this skill's own). The check runs on the
 * next tick, not inside the damage event, because Ember Bolt applies its own ignite just after its hit resolves. One at a time;
 * a recast moves it. Candidates are the active party only (never a wave defender). Ends on expiry, on the companion dying, despawning, being downed (companions are immortal, so `companion.downed` is the signal) or leaving the party, a class change, a respec, a load,
 * the player's death and dispose.
 */
export class TemperWeapon {
  private id: string | null = null;
  private until = 0;
  private stopFx: Stop | null = null;
  private pending: Array<{ foeId: string; sourceId: string }> = [];

  constructor(private readonly p: TemperWeaponPorts) {}

  /** The tempered actor's id (the player's own for the staff), or null. */
  get target(): string | null {
    return this.id;
  }

  cast(): AbilityHandlerResult {
    const refused = gate(this.p, TEMPER_WEAPON.skillId);
    if (refused) return refused;
    const me = this.p.playerId();
    const pick = this.nearestCompanion()?.id ?? me;
    this.stopTarget();
    this.id = pick;
    this.until = this.p.now() + TEMPER_WEAPON.seconds;
    this.stopFx = this.p.effect?.(TEMPER_WEAPON.effectId, { x: 0, y: 0, z: 0 }, 0, pick, { seconds: TEMPER_WEAPON.seconds }) ?? null;
    this.p.reportTrigger?.(TEMPER_WEAPON.skillId);
    return { ok: true };
  }

  /** Whether `req` is one of the tempered actor's own attacks. */
  private ownAttack(req: Pick<DamageRequest, 'kind' | 'attackId'>): boolean {
    const a = req.attackId;
    if (typeof a !== 'string') return false;
    if (this.id !== this.p.playerId()) return (req.kind === 'melee' || req.kind === 'spell') && a.startsWith(TEMPER_WEAPON.companionAttackPrefix);
    if (req.kind === 'spell') return OWN_SPELL_ATTACK_IDS.includes(a);
    return req.kind === 'melee' && ATTACKS.some((x) => x.clip === a);
  }

  /** The attacker-band modifier (register at `TEMPER_WEAPON.order`). */
  modifier: DamageModifier = (req) => {
    if (this.id === null || req.attackerId !== this.id || req.outcome !== 'hit' || !this.ownAttack(req)) return;
    req.amount *= TEMPER_WEAPON.multiplier;
    req.element = 'fire';
  };

  /** `damage.dealt`: queues the ignite of a tempered hit that landed. */
  onDealt(r: Readonly<DamageResult>): void {
    if (this.id === null || r.attackerId !== this.id || r.outcome !== 'hit' || !(r.dealt > 0) || r.killed || !this.ownAttack(r)) return;
    if (this.pending.length < 16) this.pending.push({ foeId: r.targetId, sourceId: this.id });
  }

  update(): void {
    if (this.pending.length > 0) this.flush();
    if (this.id === null) return;
    if (!this.p.isEmberwright() || !this.p.learned(TEMPER_WEAPON.skillId) || this.p.now() >= this.until) {
      this.end();
      return;
    }
    if (this.id !== this.p.playerId() && !this.p.companionHere(this.id)) this.end();
  }

  /** `actor.died`, `actor.despawned`, `companion.left`, `party.changed`: re-read whether the companion is still there. */
  onGone(actorId: string): void {
    if (actorId === this.id && actorId !== this.p.playerId()) this.end();
  }

  end(): void {
    this.stopTarget();
    this.pending.length = 0;
  }

  private stopTarget(): void {
    this.id = null;
    this.stopFx?.();
    this.stopFx = null;
  }

  private flush(): void {
    const list = this.pending.splice(0);
    for (const { foeId, sourceId } of list) {
      const f = this.p.foe(foeId);
      if (!f || !clean(f)) continue;
      if (this.p.statuses(foeId).some((s) => s.kind === 'ignite' && s.id.startsWith(TEMPER_WEAPON.igniteSkipPrefix))) continue;
      this.p.ignite(foeId, { id: TEMPER_WEAPON.igniteId, kind: 'ignite', dps: TEMPER_WEAPON.igniteDps, seconds: TEMPER_WEAPON.igniteSeconds, sourceId });
    }
  }

  private nearestCompanion(): CompanionView | null {
    const me = this.p.feet();
    let best: CompanionView | null = null;
    let bestD = Infinity;
    for (const c of this.p.companions()) {
      const d = Math.hypot(c.x - me.x, c.z - me.z);
      if (d > TEMPER_WEAPON.range + EPS) continue;
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }
}

// ---- Updraft --------------------------------------------------------------------------------------------------------

export interface UpdraftPorts extends Act3Ports {
  foes(): Iterable<FoeView>;
  /** The foe as it is now (re-read after the poise hit, as Cinder Rain does). */
  foe(id: string): FoeView | null;
  apply(req: DamageRequest): DamageResult | null;
  /** `status.apply`. */
  stun(targetId: string, spec: StatusSpec): boolean;
  /** The boss predicate: a registered boss actor (`bosses.active()` with `bosses.state(id).actorId`). */
  isBoss(actorId: string): boolean;
}

/**
 * Updraft. Every live hostile within 4 m (horizontal distance <= 4, inclusive, and within 3 m vertically) is hit for 0 damage
 * and 30 poise (a `spell` request, attack id `emberwright.updraft`, so a foe with 30 poise or less staggers) and, when that
 * hit landed, is stunned for 1.5 s under `emberwright.updraft.stun`, unless it is a boss (poise only) or the poise hit itself put it
 * into a mercy state (re-read after the hit). A foe in any mercy state before the hit is skipped. The player is never touched and no movement mode is set; the lift is drawn by the VFX column (open point A).
 * Nothing it owns starts with 'updraft.', which is the glide thermals' prefix.
 */
export class Updraft {
  constructor(private readonly p: UpdraftPorts) {}

  cast(): AbilityHandlerResult {
    const refused = gate(this.p, UPDRAFT.skillId);
    if (refused) return refused;
    const me = this.p.playerId();
    const f = this.p.feet();
    const r2 = UPDRAFT.radius * UPDRAFT.radius;
    for (const foe of this.p.foes()) {
      if (!clean(foe)) continue;
      const dx = foe.x - f.x;
      const dz = foe.z - f.z;
      if (dx * dx + dz * dz > r2 + EPS || Math.abs(foe.y - f.y) > UPDRAFT.halfHeight) continue;
      const r = this.p.apply({ attackerId: me, targetId: foe.id, amount: 0, poise: UPDRAFT.poise, kind: 'spell', attackId: UPDRAFT.attackId });
      // Re-read the foe: the poise hit may have put a mercy-on-stagger foe into a mercy state, and a yielding foe is never controlled.
      const after = r && r.outcome === 'hit' && !this.p.isBoss(foe.id) ? this.p.foe(foe.id) : null;
      if (after && clean(after)) {
        this.p.stun(foe.id, { id: UPDRAFT.stunId, kind: 'stun', seconds: UPDRAFT.stunSeconds, sourceId: me });
      }
    }
    this.p.effect?.(UPDRAFT.effectId, f, 0, null, { radius: UPDRAFT.radius, lift: UPDRAFT.liftMetres, seconds: UPDRAFT.liftSeconds });
    this.p.reportTrigger?.(UPDRAFT.skillId);
    return { ok: true };
  }
}
