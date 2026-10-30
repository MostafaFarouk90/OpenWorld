// Ashblade tier 4 (Act 3, K11 PR 1): Cinder Mark, Decoy Footprints, Phoenix Roll. Ports-based so the unit tests need no game;
// `act3.plugin.ts` wires them. Time is the fixed clock's seconds; nothing here allocates per tick except the 2 Hz patch scan.
import type { DamageModifier, DamageRequest, DamageResult } from '../../actors/DamageResolver';
import type { StatusEntry, StatusSpec } from '../../actors/status';
import type { ObserverPose, PerceptionModifiers, PerceptionProvider } from '../../enemies/perceptionHook';
import type { AbilityHandlerResult } from '../../hud/ports';
import type { StealthHooks } from './stealthSkills';
import { AGGROED_STATES, CINDER_MARK, DECOY_FOOTPRINTS, PHOENIX_ROLL } from './tuning';

type Stop = () => void;
type Vec3 = { x: number; y: number; z: number };

const EPS = 1e-9;
const refuse = (reason: string): AbilityHandlerResult => ({ ok: false, reason });

/** A hostile as the skills see it: where it stands and whether it may be marked or burnt. */
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
/** Mercy states that end a running mark. 'staggered' is not one: a poise break on a mercy-capable foe leaves the mark up. */
const MARK_ENDING_MERCY: ReadonlySet<string> = new Set(['yielding', 'calming', 'releasing', 'leaving']);

export interface Act3Ports {
  playerId(): string;
  /** The class is the Ashblade. */
  isAshblade(): boolean;
  learned(skillId: string): boolean;
  /** Why the player cannot act now ('dead', 'staggered', 'busy'), else null. */
  blockedReason(): string | null;
  /** Fixed-clock seconds. */
  now(): number;
  feet(): Vec3;
  /** The player's facing, with forward (-sin yaw, -cos yaw). */
  facingYaw(): number;
  /** Visual, best effort; the returned function stops it early. */
  effect?(id: string, at: Vec3, yaw: number, attachTo: string | null, params: Record<string, number>): Stop | null;
  reportTrigger?(skillId: string): void;
}

function gate(p: Act3Ports, skillId: string): AbilityHandlerResult | null {
  if (!p.isAshblade()) return refuse('class');
  if (!p.learned(skillId)) return refuse('not-learned');
  const blocked = p.blockedReason();
  if (blocked) return refuse(blocked);
  return null;
}

// ---- Cinder Mark ----------------------------------------------------------------------------------------------------

export interface CinderMarkPorts extends Act3Ports {
  /** `lockOn.targetId`, or null. */
  lockTarget(): string | null;
  /** The foe with this id, or null when it is gone. */
  foe(id: string): FoeView | null;
  /** Every foe worth a look (live hostiles); the cone search filters. */
  foes(): Iterable<FoeView>;
}

/**
 * Cinder Mark. Marks the lock-on target when it is a live hostile (any distance the lock-on allows), else the nearest live
 * hostile within 12 m inside a 60 degree front cone (30 degrees either side of the facing); 'no-target' otherwise. A foe in any
 * mercy state is never a target. For 10 s every hit the player lands on it (kind melee or spell, outcome 'hit') deals x1.5,
 * as an attacker-band modifier at order -149: one past Back-Slit (-150), so a back stab on a marked foe is 2 x 1.5 = 3x
 * and Twin Fangs' stored base is untouched. Bosses can be marked. The mark ends on expiry, on the foe dying, despawning,
 * being calmed or yielding, calming, releasing or leaving (not on 'staggered': the player's own hits on it are allowed), on a class change, a respec, a save load, the
 * player's death and dispose. A new cast replaces the mark (the old effect is stopped).
 */
export class CinderMark {
  private id: string | null = null;
  private until = 0;
  private stopFx: Stop | null = null;

  constructor(private readonly p: CinderMarkPorts) {}

  get target(): string | null {
    return this.id;
  }

  cast(): AbilityHandlerResult {
    const refused = gate(this.p, CINDER_MARK.skillId);
    if (refused) return refused;
    const foe = this.pick();
    if (!foe) return refuse('no-target');
    this.end();
    this.id = foe.id;
    this.until = this.p.now() + CINDER_MARK.seconds;
    this.stopFx = this.p.effect?.(CINDER_MARK.effectId, { x: 0, y: 0, z: 0 }, 0, foe.id, { seconds: CINDER_MARK.seconds }) ?? null;
    this.p.reportTrigger?.(CINDER_MARK.skillId);
    return { ok: true };
  }

  /** The attacker-band modifier (register at `CINDER_MARK.order`). */
  modifier: DamageModifier = (req) => {
    if (this.id === null || req.targetId !== this.id || req.attackerId !== this.p.playerId()) return;
    if (req.kind !== 'melee' && req.kind !== 'spell') return;
    if (req.outcome !== 'hit') return;
    req.amount *= CINDER_MARK.multiplier;
  };

  update(): void {
    if (this.id === null) return;
    if (!this.p.isAshblade() || !this.p.learned(CINDER_MARK.skillId) || this.p.now() >= this.until) {
      this.end();
      return;
    }
    const f = this.p.foe(this.id);
    if (!f || !f.live || (f.mercy !== undefined && MARK_ENDING_MERCY.has(f.mercy))) this.end();
  }

  /** `actor.died`, `actor.despawned`, `ai.calm`: the mark's foe is gone for the mark's purposes. */
  onGone(actorId: string): void {
    if (actorId === this.id) this.end();
  }

  end(): void {
    this.id = null;
    this.stopFx?.();
    this.stopFx = null;
  }

  private pick(): FoeView | null {
    const lock = this.p.lockTarget();
    if (lock) {
      const f = this.p.foe(lock);
      if (f && clean(f)) return f;
    }
    const me = this.p.feet();
    const yaw = this.p.facingYaw();
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const minDot = Math.cos((CINDER_MARK.coneDegrees / 2) * (Math.PI / 180));
    let best: FoeView | null = null;
    let bestD = Infinity;
    for (const f of this.p.foes()) {
      if (!clean(f)) continue;
      const dx = f.x - me.x;
      const dz = f.z - me.z;
      const d = Math.hypot(dx, dz);
      if (d > CINDER_MARK.range || d < EPS) continue;
      if ((dx * fx + dz * fz) / d < minDot) continue;
      if (d < bestD) {
        bestD = d;
        best = f;
      }
    }
    return best;
  }
}

// ---- Decoy Footprints -----------------------------------------------------------------------------------------------

export interface DecoyFootprintsPorts extends Act3Ports {
  /** Thread 18's stealth hooks; absent until that service is there. */
  stealth(): Pick<StealthHooks, 'addNoiseScale'> | undefined;
  /** `enemies.perception`; absent until that service is there. */
  perception(): { register(p: PerceptionProvider): Stop } | undefined;
  warn(message: string): void;
}

/** Sight 60%, nothing else changed. One shared result, so a provider call allocates nothing. */
const FOOTPRINT_VIEW: Readonly<PerceptionModifiers> = Object.freeze({
  sightRangeScale: DECOY_FOOTPRINTS.sightRangeScale,
  coneScale: 1,
  hearingQuietScale: 1,
  hearingLoudScale: 1,
});

/**
 * Decoy Footprints (perception-only, a logged taste call: the enemy AI has no lure state). For 6 s the player's own noise
 * is silenced (`stealth.addNoiseScale('ashblade.decoyFootprints', 0)`) and an `enemies.perception` provider gives
 * sightRangeScale 0.6 to every observer of the player whose AI state is not yet an aggro one (`AGGROED_STATES`: notice,
 * chase, telegraph, attack, recover, stagger). A foe already alerted or fighting is therefore unaffected, so the skill is no
 * way out of an open fight. Caveat: the noise scale of 0 also mutes the Ashblade to foes that are already alerted; that is harmless
 * today because the chase leash is sight-only (enemies/ai/Brain.ts around lines 628-633), but a later hearing-based leash would
 * quietly break the "alerted foes are unaffected" promise. Both are released together on expiry, a class change, a respec, a save load, the player's death
 * and dispose. Refused 'no-stealth' when neither service is there, since the cast would do nothing. A recast restarts it.
 */
export class DecoyFootprints {
  private live = false;
  private until = 0;
  private releaseNoise: Stop | null = null;
  private unregister: Stop | null = null;
  private stopFx: Stop | null = null;
  private warned = false;
  private readonly provider: PerceptionProvider = {
    modifiers: (target: string, o: ObserverPose) => {
      if (!this.live || target !== this.p.playerId()) return null;
      return AGGROED_STATES.has(o.state) ? null : FOOTPRINT_VIEW;
    },
  };

  constructor(private readonly p: DecoyFootprintsPorts) {}

  get active(): boolean {
    return this.live;
  }

  cast(): AbilityHandlerResult {
    const refused = gate(this.p, DECOY_FOOTPRINTS.skillId);
    if (refused) return refused;
    const stealth = this.p.stealth();
    const perception = this.p.perception();
    const quiets = typeof stealth?.addNoiseScale === 'function';
    if (!quiets && !perception) return refuse('no-stealth');
    this.end();
    this.live = true;
    this.until = this.p.now() + DECOY_FOOTPRINTS.seconds;
    if (quiets) this.releaseNoise = stealth!.addNoiseScale!(DECOY_FOOTPRINTS.noiseSource, DECOY_FOOTPRINTS.noiseScale);
    if (perception) this.unregister = perception.register(this.provider);
    else if (!this.warned) {
      this.warned = true;
      this.p.warn('ashblade: enemies.perception is absent, so Decoy Footprints only silences your noise and does not shorten sight range');
    }
    this.stopFx = this.p.effect?.(DECOY_FOOTPRINTS.effectId, this.p.feet(), this.p.facingYaw(), null, { seconds: DECOY_FOOTPRINTS.seconds }) ?? null;
    this.p.reportTrigger?.(DECOY_FOOTPRINTS.skillId);
    return { ok: true };
  }

  update(): void {
    if (!this.live) return;
    if (!this.p.isAshblade() || !this.p.learned(DECOY_FOOTPRINTS.skillId) || this.p.now() >= this.until) this.end();
  }

  end(): void {
    this.live = false;
    this.releaseNoise?.();
    this.unregister?.();
    this.stopFx?.();
    this.releaseNoise = this.unregister = this.stopFx = null;
  }
}

// ---- Phoenix Roll -------------------------------------------------------------------------------------------------------

export interface PhoenixRollPorts extends Act3Ports {
  /** `status.list(playerId)`; absent service reads empty. */
  statuses(actorId: string): readonly StatusEntry[];
  clearStatus(actorId: string, id: string): void;
  /** The controller's action is the dodge (rising edge = dodge start, whether or not it avoids a hit). */
  dodging(): boolean;
  foes(): Iterable<FoeView>;
  /** The foe with this id, or null when it is gone (re-read after a hit, which may have made it yield). */
  foe(id: string): FoeView | null;
  apply(req: DamageRequest): DamageResult | null;
  ignite(targetId: string, spec: StatusSpec): boolean;
}

/**
 * Phoenix Roll. On the rising edge of the dodge action (`player.dodged` only fires when a hit was avoided, so it is not the
 * signal), a player with any `ignite` status entry (any id, any source) has every such entry cleared and leaves a 4 m wide
 * fire patch at the dodge start for 4 s: every 0.5 s each live hostile inside takes 0.25x the base hit (2.5, fire, attack
 * id 'ashblade.phoenixRoll', a spell request from the player) and catches `ignite` under the skill's own status id. A foe in
 * any mercy state is skipped. No ignite on the player, no roll effect. At most once per 4 s. It never touches the
 * Heartshard Burn meter or Scars: only the `status` service is written. Ends on expiry, a class change, a respec, a load,
 * the player's death and dispose.
 */
export class PhoenixRoll {
  private wasDodging = false;
  private live = false;
  private cx = 0;
  private cy = 0;
  private cz = 0;
  private until = 0;
  private nextTick = 0;
  private readyAt = -Infinity;
  private stopFx: Stop | null = null;

  constructor(private readonly p: PhoenixRollPorts) {}

  get patchActive(): boolean {
    return this.live;
  }

  update(): void {
    const dodging = this.p.dodging();
    const edge = dodging && !this.wasDodging;
    this.wasDodging = dodging;
    if (!this.p.isAshblade() || !this.p.learned(PHOENIX_ROLL.skillId) || this.p.blockedReason() === 'dead') {
      this.end();
      return;
    }
    const now = this.p.now();
    if (edge && now + EPS >= this.readyAt) this.roll(now);
    if (!this.live) return;
    while (this.nextTick <= this.until + EPS && now + EPS >= this.nextTick) {
      this.nextTick += PHOENIX_ROLL.tickSeconds;
      this.burn();
    }
    if (now + EPS >= this.until) this.end();
  }

  /** Save load, death, class change, dispose: the patch goes; the once-per-4-s counter stands. */
  end(): void {
    this.live = false;
    this.stopFx?.();
    this.stopFx = null;
  }

  /** A load or a death also forgets the dodge in progress, so the next dodge is a fresh edge. */
  reset(): void {
    this.end();
    this.wasDodging = false;
  }

  private roll(now: number): void {
    const me = this.p.playerId();
    const burning = this.p.statuses(me).filter((s) => s.kind === 'ignite');
    if (burning.length === 0) return;
    for (const s of burning) this.p.clearStatus(me, s.id);
    this.readyAt = now + PHOENIX_ROLL.cooldownSeconds;
    this.end();
    const f = this.p.feet();
    this.cx = f.x;
    this.cy = f.y;
    this.cz = f.z;
    this.live = true;
    this.until = now + PHOENIX_ROLL.seconds;
    this.nextTick = now + PHOENIX_ROLL.tickSeconds;
    this.stopFx = this.p.effect?.(PHOENIX_ROLL.effectId, f, 0, null, { seconds: PHOENIX_ROLL.seconds, radius: PHOENIX_ROLL.radius }) ?? null;
    this.p.reportTrigger?.(PHOENIX_ROLL.skillId);
  }

  private burn(): void {
    const me = this.p.playerId();
    const r2 = PHOENIX_ROLL.radius * PHOENIX_ROLL.radius;
    for (const f of this.p.foes()) {
      if (!clean(f)) continue;
      const dx = f.x - this.cx;
      const dz = f.z - this.cz;
      if (dx * dx + dz * dz > r2 || Math.abs(f.y - this.cy) > PHOENIX_ROLL.halfHeight) continue;
      const r = this.p.apply({ attackerId: me, targetId: f.id, amount: PHOENIX_ROLL.damage, poise: 0, kind: 'spell', attackId: PHOENIX_ROLL.attackId });
      const after = r && r.outcome === 'hit' && !r.killed ? this.p.foe(f.id) : null;
      if (after && clean(after)) {
        this.p.ignite(f.id, { id: PHOENIX_ROLL.igniteId, kind: 'ignite', dps: PHOENIX_ROLL.igniteDps, seconds: PHOENIX_ROLL.igniteSeconds, sourceId: me });
      }
    }
  }
}
