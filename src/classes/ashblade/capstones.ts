// Ashblade tier 5 capstones (Act 3, K11 PR 3): Death by a Thousand Sparks, Ghost of the Hearth, Flicker Strike. Ports-based so the
// unit tests need no game; `capstones.plugin.ts` wires them. Time is the fixed clock's seconds.
import * as THREE from 'three';
import type { DamageModifier, DamageRequest, DamageResult } from '../../actors/DamageResolver';
import type { PerceptionModifiers, PerceptionProvider, ObserverPose } from '../../enemies/perceptionHook';
import type { AbilityHandlerResult } from '../../hud/ports';
import type { Act3Ports, FoeView } from './skills.act3';
import type { StealthHooks } from './stealthSkills';
import { AGGROED_STATES, ASH_DRIFT, FLICKER_STRIKE, GHOST_OF_THE_HEARTH, THOUSAND_SPARKS } from './tuning';

type Stop = () => void;
type V3 = { x: number; y: number; z: number };

const EPS = 1e-9;
const refuse = (reason: string): AbilityHandlerResult => ({ ok: false, reason });
const clean = (f: FoeView): boolean => f.live && (f.mercy === undefined || f.mercy === 'none');

function gate(p: Act3Ports, skillId: string): AbilityHandlerResult | null {
  if (!p.isAshblade()) return refuse('class');
  if (!p.learned(skillId)) return refuse('not-learned');
  const blocked = p.blockedReason();
  if (blocked) return refuse(blocked);
  return null;
}

// ---- Death by a Thousand Sparks ---------------------------------------------------------------------------------------

/** A hostile with the direction it faces on the XZ plane (null when it has no root), for the landing behind it. */
export interface SparkFoe extends FoeView {
  facing: { x: number; z: number } | null;
}

export interface SparksPorts extends Act3Ports {
  /** Every live hostile worth a look; the class filters by range, height, space and mercy. */
  foes(): Iterable<SparkFoe>;
  /** Interior id at a point, null outdoors or when interiors are absent. */
  interiorAt(p: V3): string | null;
  /** The interior the player is in (`interiors.current`), null outdoors. */
  currentInterior(): string | null;
  /** `containment.isOpen`; true when the service is absent. */
  isOpen(x: number, z: number): boolean;
  /** Closest solid hit along `dir` (unit) within `max` metres, ignoring the player's own collider. */
  raycast(origin: V3, dir: V3, max: number): { distance: number; point: V3 } | null;
  teleport(feet: V3, yaw: number): void;
  /** Fades the avatar back in at the arrival. */
  arrive(): void;
  /** `combatVerbs.addInvulnerability`; the release is idempotent. Null when the hook is absent. */
  invulnerable(seconds: number): Stop | null;
  apply(req: DamageRequest): DamageResult | null;
  /** The screen stand-in (vignette pulse); best effort. */
  screen?(strength: number, seconds: number, color: number): void;
  warn(message: string): void;
}

/** A safe standing point at `want`: no wall between `from` and it, ground within tolerance of `refY`; null otherwise. Ash-drift's check. */
function landing(p: SparksPorts, from: V3, want: { x: number; z: number }, refY: number, clear: number): V3 | null {
  const dx = want.x - from.x;
  const dz = want.z - from.z;
  const len = Math.hypot(dx, dz);
  if (len > clear + 1e-6) {
    const ux = dx / len;
    const uz = dz / len;
    const wall = p.raycast({ x: from.x + ux * clear, y: refY + ASH_DRIFT.chestHeight, z: from.z + uz * clear }, { x: ux, y: 0, z: uz }, len - clear);
    if (wall) return null;
  }
  const down = p.raycast({ x: want.x, y: refY + ASH_DRIFT.groundProbeUp, z: want.z }, { x: 0, y: -1, z: 0 }, ASH_DRIFT.groundProbeUp + ASH_DRIFT.groundProbeDown);
  if (!down) return null;
  const y = down.point.y;
  if (Math.abs(y - refY) > ASH_DRIFT.groundTolerance) return null;
  return { x: want.x, y, z: want.z };
}

/**
 * Death by a Thousand Sparks (Duskedge capstone). For 3 s the Ashblade flickers from foe to foe: 12 hops, one every 0.25 s, the
 * first on the cast itself. Each hop goes to the next live hostile within 10 m of where the Ashblade stands, round robin by
 * distance (nearest first; every foe is struck once before any is struck again; a foe left alone is struck every hop), and
 * strikes it for 0.6x the base hit (a spell request, so Back-Slit never doubles it) with poise 5. A foe in any mercy state is
 * never chosen. The Ashblade is invulnerable from the cast to the end. Each landing is Ash-drift's (behind the foe, else on the
 * Ashblade's side; no wall in the way, ground within 2 m) and must also be in the open area (`containment.isOpen`) and in the space
 * the cast began in (never into or out of an interior); a foe with no such landing is passed over. The flurry ends early where
 * the Ashblade stands when no foe has a valid landing, and on expiry, death, a class change, a load, a respec and dispose.
 * Refused 'no-target' with no hostile within 10 m and 'no-spot' when none of them has a landing (nothing is spent).
 */
export class ThousandSparks {
  private live = false;
  private until = 0;
  private nextHop = 0;
  private hops = 0;
  private space: string | null = null;
  private readonly visited = new Set<string>();
  private release: Stop | null = null;
  private warned = false;

  constructor(private readonly p: SparksPorts) {}

  get active(): boolean {
    return this.live;
  }

  get hopsDone(): number {
    return this.hops;
  }

  cast(): AbilityHandlerResult {
    const refused = gate(this.p, THOUSAND_SPARKS.skillId);
    if (refused) return refused;
    if (this.live) return refuse('active');
    this.space = this.p.currentInterior();
    this.visited.clear();
    const list = this.candidates();
    if (list.length === 0) return refuse('no-target');
    const pick = this.pick(list);
    if (!pick) return refuse('no-spot');
    const now = this.p.now();
    this.live = true;
    this.hops = 0;
    this.until = now + THOUSAND_SPARKS.seconds;
    this.nextHop = now + THOUSAND_SPARKS.hopSeconds;
    this.release = this.p.invulnerable(THOUSAND_SPARKS.seconds + 0.05);
    if (!this.release && !this.warned) {
      this.warned = true;
      this.p.warn('ashblade: combatVerbs.addInvulnerability is absent, Death by a Thousand Sparks is not invulnerable');
    }
    this.p.screen?.(THOUSAND_SPARKS.screenStrength, THOUSAND_SPARKS.seconds, THOUSAND_SPARKS.screenColor);
    this.hop(pick.foe, pick.to);
    this.p.reportTrigger?.(THOUSAND_SPARKS.skillId);
    return { ok: true };
  }

  /** Once per fixed tick. */
  update(): void {
    if (!this.live) return;
    if (!this.p.isAshblade() || !this.p.learned(THOUSAND_SPARKS.skillId) || this.p.blockedReason() === 'dead') return this.end();
    const now = this.p.now();
    if (now + EPS >= this.until) return this.end();
    while (this.hops < THOUSAND_SPARKS.hops && now + EPS >= this.nextHop) {
      this.nextHop += THOUSAND_SPARKS.hopSeconds;
      const list = this.candidates();
      const pick = list.length > 0 ? this.pick(list) : null;
      if (!pick) return this.end();
      this.hop(pick.foe, pick.to);
    }
  }

  /** Expiry, death, class change, load, respec, dispose: the invulnerability goes; the Ashblade stays where it stands. */
  end(): void {
    this.live = false;
    this.visited.clear();
    this.release?.();
    this.release = null;
  }

  /** Clean hostiles within range, in the cast's space and the height band, nearest first. */
  private candidates(): Array<{ foe: SparkFoe; distance: number }> {
    const me = this.p.feet();
    const out: Array<{ foe: SparkFoe; distance: number }> = [];
    for (const f of this.p.foes()) {
      if (!clean(f)) continue;
      const distance = Math.hypot(f.x - me.x, f.z - me.z);
      if (distance > THOUSAND_SPARKS.range || Math.abs(f.y - me.y) > ASH_DRIFT.maxDy) continue;
      if (this.p.interiorAt(f) !== this.space) continue;
      if (!this.sees(me, f)) continue;
      out.push({ foe: f, distance });
    }
    return out.sort((a, b) => a.distance - b.distance);
  }

  /** Line of sight from the Ashblade's chest to the foe's chest over static geometry: a foe behind a wall or a gate is never a hop target. */
  private sees(me: V3, f: V3): boolean {
    const o = { x: me.x, y: me.y + ASH_DRIFT.chestHeight, z: me.z };
    const dx = f.x - o.x;
    const dy = f.y + ASH_DRIFT.chestHeight - o.y;
    const dz = f.z - o.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-6) return true;
    // Stop short of the foe so its own body (a kinematic collider) never counts as the wall.
    const hit = this.p.raycast({ ...o }, { x: dx / len, y: dy / len, z: dz / len }, Math.max(0, len - THOUSAND_SPARKS.losMargin));
    return !hit;
  }

  /** The next foe of the round with a landing; foes without one are passed over, and a finished round starts again. */
  private pick(list: Array<{ foe: SparkFoe; distance: number }>): { foe: SparkFoe; to: V3 } | null {
    if (this.p.currentInterior() !== this.space) return null;
    const me = this.p.feet();
    const fresh = list.filter((c) => !this.visited.has(c.foe.id));
    for (const c of [...fresh, ...list.filter((c) => this.visited.has(c.foe.id))]) {
      const to = this.land(me, c.foe);
      if (!to) continue;
      this.visited.add(c.foe.id);
      if (list.every((x) => this.visited.has(x.foe.id))) this.visited.clear();
      return { foe: c.foe, to };
    }
    return null;
  }

  /** Behind the foe, else on the Ashblade's side of it; open, in the cast's space. */
  private land(from: V3, h: SparkFoe): V3 | null {
    const tx = h.x - from.x;
    const tz = h.z - from.z;
    const tl = Math.hypot(tx, tz) || 1;
    const away = { x: tx / tl, z: tz / tl };
    const behind = h.facing
      ? { x: h.x - h.facing.x * ASH_DRIFT.behind, z: h.z - h.facing.z * ASH_DRIFT.behind }
      : { x: h.x + away.x * ASH_DRIFT.behind, z: h.z + away.z * ASH_DRIFT.behind };
    const near = { x: h.x - away.x * ASH_DRIFT.behind, z: h.z - away.z * ASH_DRIFT.behind };
    const feet = { x: h.x, y: h.y, z: h.z };
    for (const want of [behind, near]) {
      const to = landing(this.p, feet, want, h.y, ASH_DRIFT.clearOfTarget);
      if (to && this.p.isOpen(to.x, to.z) && this.p.interiorAt(to) === this.space) return to;
    }
    return null;
  }

  private hop(foe: SparkFoe, to: V3): void {
    const at = { x: foe.x, y: foe.y, z: foe.z };
    this.p.teleport(to, Math.atan2(-(foe.x - to.x), -(foe.z - to.z)));
    this.p.arrive();
    this.hops++;
    const dx = at.x - to.x;
    const dz = at.z - to.z;
    const l = Math.hypot(dx, dz);
    this.p.apply({
      attackerId: this.p.playerId(),
      targetId: foe.id,
      amount: THOUSAND_SPARKS.damage,
      poise: THOUSAND_SPARKS.poise,
      kind: 'spell',
      attackId: THOUSAND_SPARKS.attackId,
      point: new THREE.Vector3(at.x, at.y + 1, at.z),
      direction: l < 1e-6 ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(dx / l, 0, dz / l),
    });
    this.p.effect?.(THOUSAND_SPARKS.hopEffectId, to, Math.atan2(-dx, -dz), null, {});
  }
}

// ---- Ghost of the Hearth ----------------------------------------------------------------------------------------------

export interface GhostPorts extends Act3Ports {
  /** Thread 18's stealth hooks; absent until that service is there. */
  stealth(): Pick<StealthHooks, 'addNoiseScale'> | undefined;
  /** `enemies.perception`; absent until that service is there. */
  perception(): { register(p: PerceptionProvider): Stop } | undefined;
  /** The Ashblade is in an attack or a one-shot skill clip (`controller.state`); the rising edge is the start of an attack. */
  swinging(): boolean;
  /** A registered boss actor (`ctx.bosses.active()` with `ctx.bosses.state(id).actorId`). */
  isBoss(actorId: string): boolean;
  /**
   * The foe would yield (kneel) on a poise break below half health: its def says `mercy.when === 'yielding'` and Spare is
   * unlocked. Yield is the Brain's reaction to `actor.staggered`, not a lethal handler, so the strike must leave such a foe alive
   * at 1 HP with its poise broken. Absent (or false) means the foe simply dies of the hit.
   */
  canYield?(actorId: string): boolean;
  warn(message: string): void;
}

/** Sight 0 and hearing 0, the cone untouched. One shared result, so a provider call allocates nothing. */
const GHOST_VIEW: Readonly<PerceptionModifiers> = Object.freeze({
  sightRangeScale: 0,
  coneScale: 1,
  hearingQuietScale: 0,
  hearingLoudScale: 0,
});

/**
 * Ghost of the Hearth (Smokecloak capstone). For up to 12 s an `enemies.perception` provider gives sight 0 and hearing 0 to
 * every observer of the player whose AI state is not yet an aggro one (`AGGROED_STATES`), and `stealth.addNoiseScale` gives
 * noise 0: watchers not yet alerted neither see nor hear the Ashblade, and alerted foes keep fighting. Refused 'no-stealth'
 * when neither service is there. A recast restarts it.
 *
 * It ends, in full, at 12 s, on the use of any other skill (`onSkillUsed`), on a spell cast (`onSpellCast`), on death, a class
 * change, a respec, a load and dispose. The first attack ends the vanishing at once (the rising edge of `swinging()`): the
 * provider and the noise scale are released that tick. The swing keeps its strike for `strikeGraceSeconds` (a swing that hits
 * nothing wastes it, and the 12 s cap still holds).
 *
 * The strike: the first melee hit the player lands on a foe that is not a boss and in no mercy state raises the hit's amount to
 * the foe's current health, as an attacker-band modifier after every other multiplier, so it goes down the normal damage path
 * (`damage.apply`, never `kill`). A foe that can yield (`canYield`: a yielding def with Spare unlocked) is left at exactly 1 HP
 * with its poise broken instead, so the Brain's own poise-break rule makes it kneel and its mercy credit is kept; any other foe
 * dies of the hit. The Ghost ends when that hit lands (`damage.dealt`). A hit on a boss or a mercy-state foe does not
 * spend it. Nothing here outlives its release: no state is left on a foe, so an unalerted watcher's perception is normal after.
 */
export class GhostOfTheHearth {
  private live = false;
  private visible = false;
  private visibleUntil = 0;
  private strikeUntil = 0;
  private wasSwinging = false;
  private pending: string | null = null;
  private yieldTarget: string | null = null;
  private releaseNoise: Stop | null = null;
  private unregister: Stop | null = null;
  private stopFx: Stop | null = null;
  private warned = false;
  private readonly provider: PerceptionProvider = {
    modifiers: (target: string, o: ObserverPose) => {
      if (!this.visible || target !== this.p.playerId()) return null;
      return AGGROED_STATES.has(o.state) ? null : GHOST_VIEW;
    },
  };

  constructor(private readonly p: GhostPorts) {}

  /** Unseen right now (the provider and the noise scale are up). */
  get hidden(): boolean {
    return this.visible;
  }

  /** The first-blow strike is still available. */
  get armed(): boolean {
    return this.live && this.p.now() < this.strikeUntil + EPS;
  }

  cast(): AbilityHandlerResult {
    const refused = gate(this.p, GHOST_OF_THE_HEARTH.skillId);
    if (refused) return refused;
    const stealth = this.p.stealth();
    const perception = this.p.perception();
    const quiets = typeof stealth?.addNoiseScale === 'function';
    if (!quiets && !perception) return refuse('no-stealth');
    this.end();
    const now = this.p.now();
    this.live = true;
    this.visible = true;
    this.visibleUntil = now + GHOST_OF_THE_HEARTH.seconds;
    this.strikeUntil = this.visibleUntil;
    this.wasSwinging = this.p.swinging();
    if (quiets) this.releaseNoise = stealth!.addNoiseScale!(GHOST_OF_THE_HEARTH.noiseSource, GHOST_OF_THE_HEARTH.noiseScale);
    if (perception) this.unregister = perception.register(this.provider);
    else if (!this.warned) {
      this.warned = true;
      this.p.warn('ashblade: enemies.perception is absent, so the Ghost of the Hearth only silences your noise and does not blind watchers');
    }
    this.stopFx = this.p.effect?.(GHOST_OF_THE_HEARTH.effectId, { x: 0, y: 0, z: 0 }, 0, this.p.playerId(), { seconds: GHOST_OF_THE_HEARTH.seconds }) ?? null;
    this.p.reportTrigger?.(GHOST_OF_THE_HEARTH.skillId);
    return { ok: true };
  }

  /** Once per fixed tick. */
  update(): void {
    if (!this.live) return;
    if (!this.p.isAshblade() || !this.p.learned(GHOST_OF_THE_HEARTH.skillId) || this.p.blockedReason() === 'dead') return this.end();
    const now = this.p.now();
    if (now + EPS >= this.visibleUntil) return this.end();
    const swinging = this.p.swinging();
    const edge = swinging && !this.wasSwinging;
    this.wasSwinging = swinging;
    if (edge) this.expose(now);
    if (!this.visible && now >= this.strikeUntil) this.end();
  }

  /** The attacker-band modifier (register at `GHOST_OF_THE_HEARTH.order`). */
  modifier: DamageModifier = (req, target) => {
    if (!this.live || this.p.now() >= this.strikeUntil + EPS) return;
    if (req.attackerId !== this.p.playerId() || req.kind !== 'melee' || req.outcome !== 'hit') return;
    if (this.p.isBoss(target.id)) return;
    let mercy: string | undefined;
    try {
      mercy = target.mercyState?.();
    } catch {
      mercy = undefined;
    }
    if (mercy !== undefined && mercy !== 'none') return;
    if (!(target.health > 0)) return;
    if (this.p.canYield?.(target.id) === true && target.health > 1) {
      // Leave 1 HP and break the poise: `actor.staggered` fires under half health and the Brain yields the foe.
      req.amount = target.health - 1;
      req.poise = Math.max(req.poise, target.poise);
      this.yieldTarget = target.id;
    } else {
      req.amount = Math.max(req.amount, target.health);
    }
    this.pending = target.id;
  };

  /**
   * The last word for a yield-capable foe (register at `GHOST_OF_THE_HEARTH.clampOrder`): a later multiplier such as the
   * Wyrmbreaker crack must not turn the 1 HP strike into a kill.
   */
  clamp: DamageModifier = (req, target) => {
    if (this.yieldTarget !== target.id) return;
    this.yieldTarget = null;
    if (req.outcome === 'hit' && target.health > 1) req.amount = Math.min(req.amount, target.health - 1);
  };

  /** `damage.dealt`: the boosted hit landed, so the Ghost is spent. */
  onDealt(r: DamageResult): void {
    if (this.pending === null || r.targetId !== this.pending) return;
    this.pending = null;
    if (r.outcome !== 'hit' || !this.live) return;
    this.p.effect?.(GHOST_OF_THE_HEARTH.flashEffectId, { x: 0, y: 0, z: 0 }, 0, r.targetId, {});
    this.end();
  }

  /** `ability.used`: any skill but the Ghost's own ends it. */
  onSkillUsed(skillId: string): void {
    if (this.live && skillId !== GHOST_OF_THE_HEARTH.skillId) this.end();
  }

  /** `spell.cast` by the player (the Surge): ends it. */
  onSpellCast(): void {
    if (this.live) this.end();
  }

  /** Death, class change, respec, load, dispose, expiry. */
  end(): void {
    this.live = false;
    this.visible = false;
    this.pending = null;
    this.yieldTarget = null;
    this.strikeUntil = 0;
    this.releaseNoise?.();
    this.unregister?.();
    this.stopFx?.();
    this.releaseNoise = this.unregister = this.stopFx = null;
  }

  /** Seen again at once; the swing keeps its strike for the grace time (never past the 12 s cap). */
  private expose(now: number): void {
    this.visible = false;
    this.strikeUntil = Math.min(this.visibleUntil, now + GHOST_OF_THE_HEARTH.strikeGraceSeconds);
    this.releaseNoise?.();
    this.unregister?.();
    this.stopFx?.();
    this.releaseNoise = this.unregister = this.stopFx = null;
  }
}

// ---- Flicker Strike ---------------------------------------------------------------------------------------------------

export interface FlickerPorts extends Act3Ports {
  foes(): Iterable<FoeView>;
  /** `containment.isOpen`; true when the service is absent. */
  isOpen(x: number, z: number): boolean;
  /** Interior id at a point, null outdoors or when interiors are absent. */
  interiorAt(p: V3): string | null;
  /** `combatVerbs.holdForcedMove` (null releases). */
  hold(move: { x: number; z: number; speed: number } | null): void;
  /** `combatVerbs.addInvulnerability`; the release is idempotent. Null when the hook is absent. */
  invulnerable(seconds: number): Stop | null;
  /** Closest solid hit along `dir` (unit) within `max` metres, ignoring the player's own collider; for the ground probe. Absent: no probe. */
  raycast?(origin: V3, dir: V3, max: number): { distance: number; point: V3 } | null;
  /** The controller's action is the dodge (rising edge = a dodge press that started). */
  dodging(): boolean;
  /** Dead or staggered or dodging: the running dash ends. */
  interrupted(): boolean;
  apply(req: DamageRequest): DamageResult | null;
  warn(message: string): void;
}

/**
 * Flicker Strike (Flicker capstone). A forced dash of 6 m in 0.25 s (15 fixed ticks, `holdForcedMove`), invulnerable for its
 * length, striking every live hostile it passes (within 1.4 m of the feet, ahead, within 2 m of height) once per dash for 1.2x
 * the base hit; a foe in any mercy state is skipped. Containment: the path is sampled every 0.5 m before the dash and shortened
 * to the last point that is in the open area and in the same space (never out of the open area, never into or out of an
 * interior) and to the last point before a drop: at each sample a ground probe reads the ground, and a sample with no ground or
 * more than `FLICKER_STRIKE.maxDrop` below the last ground ends the path. A path shorter than 1 m is refused 'blocked' (nothing
 * spent). Back stab: a dash through a foe's back counts as a back stab (Back-Slit applies, the request being 'melee' with the dash
 * direction), unlike the Sparks. A per-tick check ends a dash whose next step would leave.
 *
 * The refresh: if a dash hit anything, a dodge press (the rising edge of the controller's dodge action) within 1.5 s of the
 * dash's end dashes again, with no extra cost, up to 5 dashes in all. The press cannot be suppressed cleanly (the dodge starts in
 * the combat verbs from the raw input and there is no hook to cancel it), so the dodge happens alongside: it plays and spends its
 * stamina as usual, and the next dash starts the moment it ends (the dodge owns the forced move while it runs). A queued dash
 * is dropped if the Ashblade cannot start it within a second of the window closing. A dash that hits nothing, a stagger, a death,
 * a dodge during a dash, a class change, a load and dispose end the chain.
 */
export class FlickerStrike {
  private left = 0;
  private dir = { x: 0, z: -1 };
  private speed = 0;
  private space: string | null = null;
  private readonly hit = new Set<string>();
  private hitAny = false;
  private release: Stop | null = null;
  private dashes = 0;
  private windowEnd = 0;
  private queued = false;
  private wasDodging = false;

  constructor(private readonly p: FlickerPorts) {}

  get dashing(): boolean {
    return this.left > 0;
  }

  /** Dashes started in this chain. */
  get dashCount(): number {
    return this.dashes;
  }

  /** A refresh dash is waiting for the dodge to end. */
  get pending(): boolean {
    return this.queued;
  }

  /** A dodge press now would queue a re-dash. */
  get windowOpen(): boolean {
    return this.left === 0 && this.windowEnd > 0 && this.p.now() <= this.windowEnd + EPS && this.dashes < FLICKER_STRIKE.maxDashes;
  }

  cast(): AbilityHandlerResult {
    const refused = gate(this.p, FLICKER_STRIKE.skillId);
    if (refused) return refused;
    if (this.left > 0) return refuse('active');
    this.reset();
    this.wasDodging = this.p.dodging();
    if (!this.start()) return refuse('blocked');
    this.p.reportTrigger?.(FLICKER_STRIKE.skillId);
    return { ok: true };
  }

  /** Once per fixed tick, after the verbs have run. */
  update(): void {
    const dodging = this.p.dodging();
    const edge = dodging && !this.wasDodging;
    this.wasDodging = dodging;
    if (!this.p.isAshblade() || !this.p.learned(FLICKER_STRIKE.skillId) || this.p.blockedReason() === 'dead') {
      this.reset();
      return;
    }
    if (this.left > 0) {
      this.step();
      return;
    }
    const now = this.p.now();
    if (edge && !this.queued && this.windowOpen) this.queued = true;
    if (!this.queued) return;
    if (now > this.windowEnd + FLICKER_STRIKE.queueGraceSeconds + EPS) {
      this.queued = false;
      return;
    }
    if (dodging || this.p.blockedReason() !== null) return;
    this.queued = false;
    if (this.start()) this.p.effect?.(FLICKER_STRIKE.pingEffectId, this.p.feet(), 0, null, {});
    else this.windowEnd = 0;
  }

  /** Death, class change, respec, load, dispose: the dash and the chain go; the hold is released. */
  reset(): void {
    this.finish(false);
    this.dashes = 0;
    this.queued = false;
    this.windowEnd = 0;
    this.wasDodging = false;
  }

  private start(): boolean {
    const yaw = this.p.facingYaw();
    const dir = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
    const feet = this.p.feet();
    const space = this.p.interiorAt(feet);
    const length = this.reach(feet, dir, space);
    if (length < FLICKER_STRIKE.minDistance) return false;
    const seconds = FLICKER_STRIKE.ticks / 60;
    this.dir = dir;
    this.space = space;
    this.speed = length / seconds;
    this.left = FLICKER_STRIKE.ticks;
    this.hit.clear();
    this.hitAny = false;
    this.dashes++;
    this.windowEnd = 0;
    this.release = this.p.invulnerable(seconds + 0.05);
    this.p.hold({ x: dir.x, z: dir.z, speed: this.speed });
    this.p.effect?.(FLICKER_STRIKE.dashEffectId, feet, yaw, null, { length });
    return true;
  }

  /** How far the dash may go: the last 0.5 m sample (up to 6 m) that is open and in the starting space. */
  private reach(feet: V3, dir: { x: number; z: number }, space: string | null): number {
    let ok = 0;
    let groundY = feet.y;
    for (let d = FLICKER_STRIKE.probeStep; d <= FLICKER_STRIKE.distance + EPS; d += FLICKER_STRIKE.probeStep) {
      const x = feet.x + dir.x * d;
      const z = feet.z + dir.z * d;
      if (!this.p.isOpen(x, z) || this.p.interiorAt({ x, y: feet.y, z }) !== space) break;
      if (this.p.raycast) {
        const down = this.p.raycast({ x, y: groundY + FLICKER_STRIKE.groundProbeUp, z }, { x: 0, y: -1, z: 0 }, FLICKER_STRIKE.groundProbeUp + FLICKER_STRIKE.groundProbeDown);
        if (!down || groundY - down.point.y > FLICKER_STRIKE.maxDrop + EPS) break;
        groundY = down.point.y;
      }
      ok = d;
    }
    return ok;
  }

  private step(): void {
    if (this.p.interrupted()) return this.finish(false);
    const feet = this.p.feet();
    const stride = this.speed / 60;
    const nx = feet.x + this.dir.x * stride;
    const nz = feet.z + this.dir.z * stride;
    if (!this.p.isOpen(nx, nz) || this.p.interiorAt({ x: nx, y: feet.y, z: nz }) !== this.space) return this.finish(true);
    this.left--;
    for (const f of this.p.foes()) {
      if (!clean(f) || this.hit.has(f.id)) continue;
      const dx = f.x - feet.x;
      const dz = f.z - feet.z;
      const d = Math.hypot(dx, dz);
      if (d > FLICKER_STRIKE.hitRadius || Math.abs(f.y - feet.y) > FLICKER_STRIKE.halfHeight) continue;
      if (d > 1e-6 && (dx * this.dir.x + dz * this.dir.z) / d < 0) continue;
      this.hit.add(f.id);
      this.hitAny = true;
      this.p.apply({
        attackerId: this.p.playerId(),
        targetId: f.id,
        amount: FLICKER_STRIKE.damage,
        kind: 'melee',
        attackId: FLICKER_STRIKE.attackId,
        point: new THREE.Vector3(f.x, f.y + 1, f.z),
        direction: new THREE.Vector3(this.dir.x, 0, this.dir.z),
      });
      this.p.effect?.(FLICKER_STRIKE.hitEffectId, { x: f.x, y: f.y, z: f.z }, 0, null, {});
    }
    if (this.left <= 0) this.finish(true);
  }

  /** Ends the dash. `chain`: it ran its course (or the edge stopped it), so a hit dash opens the refresh window. */
  private finish(chain: boolean): void {
    const was = this.left > 0 || this.release !== null;
    this.left = 0;
    this.hit.clear();
    if (was) this.p.hold(null);
    this.release?.();
    this.release = null;
    if (chain && this.hitAny && this.dashes < FLICKER_STRIKE.maxDashes) this.windowEnd = this.p.now() + FLICKER_STRIKE.refreshSeconds;
    else this.windowEnd = 0;
    this.hitAny = false;
  }
}
