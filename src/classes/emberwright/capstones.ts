// Emberwright tier 5 capstones (K11 PR 4): Sunfire Nova, Colossus of Slag, Breath of the Keepers. Ports-based so the unit tests need
// no game; `capstones.plugin.ts` wires them. Time is the fixed step's seconds (`update(dt)`); nothing allocates per tick except a cast,
// a slam and a breath tick.
import * as THREE from 'three';
import type { DamageRequest, DamageResult, LethalHandler } from '../../actors/DamageResolver';
import type { StatusEntry, StatusSpec } from '../../actors/status';
import type { AbilityHandlerResult } from '../../hud/ports';
import type { Act3Ports, FoeView } from './skills.act3';
import { AttackYieldFloor, type YieldFloorPorts } from '../capstoneYieldFloor';
import { COLOSSUS, KEEPERS_BREATH, SUNFIRE_NOVA } from './tuning';

type Stop = () => void;
type Vec3 = { x: number; y: number; z: number };

const EPS = 1e-9;
const DEG = Math.PI / 180;
const refuse = (reason: string): AbilityHandlerResult => ({ ok: false, reason });
const clean = (f: FoeView): boolean => f.live && (f.mercy === undefined || f.mercy === 'none');

function gate(p: Act3Ports, skillId: string): AbilityHandlerResult | null {
  if (!p.isEmberwright()) return refuse('class');
  if (!p.learned(skillId)) return refuse('not-learned');
  const blocked = p.blockedReason();
  if (blocked) return refuse(blocked);
  return null;
}

/** True when the foe already burns from an `emberwright.*` ignite (Ember Bolt, Fire Wall, Cinder Rain, Temper, these capstones). */
export function burnsFromEmberwright(statuses: readonly StatusEntry[], prefix: string): boolean {
  return statuses.some((s) => s.kind === 'ignite' && s.id.startsWith(prefix));
}

/**
 * The Sunfire Nova's mercy floor (register as a damage modifier after the other multipliers): the Nova's 30 never carries a foe that can
 * yield from alive to dead; it leaves 1 HP so the poise break reaches the Brain's yield rule. The Breath's ticks (4, no poise) are
 * ordinary chip damage and are not floored; the golem has its own no-kill floor (`colossusNoKill`).
 */
export class NovaYieldFloor extends AttackYieldFloor {
  constructor(p: YieldFloorPorts) {
    super(p, new Set([SUNFIRE_NOVA.attackId]));
  }
}

/** The line a foe is seen along: the caster's chest to the foe's torso, both fixed here so every area skill reads the same. */
export function seen(blocked: ((from: Vec3, to: Vec3) => boolean) | undefined, centre: Vec3, foe: Vec3): boolean {
  return !blocked?.({ x: centre.x, y: centre.y + 1.3, z: centre.z }, { x: foe.x, y: foe.y + 1, z: foe.z });
}

/** The screen and camera cues a capstone fires; all best effort. */
export interface CapstoneFx {
  shake?(amplitude: number, seconds: number): void;
  /** A screen pulse (`vfx.pulseScreen`). */
  pulse?(strength: number, seconds: number, color: number): void;
}

interface IgnitePorts {
  foe(id: string): FoeView | null;
  ignite(targetId: string, spec: StatusSpec): boolean;
  statuses(actorId: string): readonly StatusEntry[];
}

/** Ignites `id` unless it burns from an `emberwright.*` source already, or has gone into a mercy state. */
function igniteOnce(p: IgnitePorts, me: string, id: string, spec: { id: string; seconds: number; dps: number; skip: string }): void {
  const after = p.foe(id);
  if (!after || !clean(after)) return;
  if (burnsFromEmberwright(p.statuses(id), spec.skip)) return;
  p.ignite(id, { id: spec.id, kind: 'ignite', dps: spec.dps, seconds: spec.seconds, sourceId: me });
}

// ---- shared cast state: a charge or a channel that rides out flinches --------------------------------------------------------

interface HeldPorts extends Act3Ports {
  /**
   * The cast was broken: the player died, is staggered, dodged, blocked or began another action. A flinch (a light hit) is NOT a break:
   * the plugin answers false while the controller's action is 'flinch'.
   */
  interrupted(): boolean;
  /** Locks the player's movement; returns the undo. */
  lockMove(): Stop;
  fx?: CapstoneFx;
}

// ---- Sunfire Nova -----------------------------------------------------------------------------------------------------------

export interface NovaPorts extends HeldPorts, IgnitePorts {
  /**
   * Plays the cast clip as the ring is released, best effort (the cast does not depend on it). It is NOT played during the charge: a one-shot
   * clip refuses the dodge, and a dodge is one of the things that breaks the charge.
   */
  playClip?(clip: string): void;
  foes(): Iterable<FoeView>;
  apply(req: DamageRequest): DamageResult | null;
  /** True when static geometry lies between the two points; absent means no line-of-sight check. */
  blocked?(from: Vec3, to: Vec3): boolean;
  /** Gives back the Ember the abilities service spent, when the charge is cancelled before the ring. */
  refund?(n: number): void;
}

/**
 * Sunfire Nova (Pyre 5). The press (refused 'no-target' with nothing spent when no live non-mercy hostile stands within 10 m) starts
 * a 0.6 s charge with the movement locked. A flinch is ridden out; death, a stagger, a dodge, a block or another action cancels it
 * and gives the Ember back. Then a ring grows from 0 to 10 m over 0.5 s about the spot where the Emberwright stands; each live
 * hostile is hit once, as the ring reaches it (horizontal distance <= the ring's radius, within 3 m vertically): 3x Ember Bolt's
 * damage (30) as fire `spell`, poise 40, and an ignite (`emberwright.sunfireNova.ignite`, 2 a second for 3 s) unless it already burns
 * from an `emberwright.*` source. A foe in any mercy state is skipped, and so is one the hit itself put into a mercy state. Bosses take it
 * (damage and poise; no stun, root or kill is involved). When the ring has crossed its whole 10 m the ground burns 6 m wide for 6 s, igniting what
 * stands in it every half second under the same rule (a ring broken off before that leaves no ground). A foe the Emberwright cannot see
 * from the ring's centre (static geometry in the way, chest to torso) is skipped. A hit that would kill is left to the damage pipeline
 * (yield and mercy handlers run), and `NovaYieldFloor` keeps it from killing a foe that can yield.
 *
 * A charge cancelled before the ring gives the Ember back but the abilities service has already started the 45 s cooldown, and that is
 * kept on purpose (player friendly, unlike Wyrmbreaker's charge). A dodge or stagger during the ring stops it with no burning ground.
 */
export class SunfireNova {
  private phase: 'idle' | 'charge' | 'ring' = 'idle';
  private elapsed = 0;
  private cx = 0;
  private cy = 0;
  private cz = 0;
  private readonly hit = new Set<string>();
  private unlock: Stop | null = null;
  private stopCharge: Stop | null = null;
  private field: { x: number; y: number; z: number; left: number; nextTick: number } | null = null;
  private stopGround: Stop | null = null;

  constructor(private readonly p: NovaPorts) {}

  get casting(): boolean {
    return this.phase !== 'idle';
  }

  get charging(): boolean {
    return this.phase === 'charge';
  }

  /** The ring's current radius (0 outside the ring phase). */
  get ringRadius(): number {
    return this.phase === 'ring' ? Math.min(SUNFIRE_NOVA.radius, (SUNFIRE_NOVA.radius * this.elapsed) / SUNFIRE_NOVA.expandSeconds) : 0;
  }

  get groundActive(): boolean {
    return this.field !== null;
  }

  cast(): AbilityHandlerResult {
    const refused = gate(this.p, SUNFIRE_NOVA.skillId);
    if (refused) return refused;
    if (this.phase !== 'idle') return refuse('casting');
    if (!this.anyInRange()) return refuse('no-target');
    this.phase = 'charge';
    this.elapsed = 0;
    this.unlock = this.p.lockMove();
    const f = this.p.feet();
    this.stopCharge = this.p.effect?.(SUNFIRE_NOVA.chargeEffect, f, this.p.facingYaw(), this.p.playerId(), { seconds: SUNFIRE_NOVA.chargeSeconds }) ?? null;
    this.p.reportTrigger?.(SUNFIRE_NOVA.skillId);
    return { ok: true };
  }

  update(dt: number): void {
    if (!(dt > 0) || !Number.isFinite(dt)) return;
    if (this.phase === 'idle' && !this.field) return;
    if (!this.p.isEmberwright() || !this.p.learned(SUNFIRE_NOVA.skillId) || this.p.blockedReason() === 'dead') {
      this.end();
      return;
    }
    if (this.phase !== 'idle') {
      if (this.p.interrupted()) {
        this.cancel();
      } else {
        this.elapsed += dt;
        if (this.phase === 'charge' && this.elapsed + EPS >= SUNFIRE_NOVA.chargeSeconds) this.release(this.elapsed - SUNFIRE_NOVA.chargeSeconds);
        else if (this.phase === 'ring') this.sweep();
      }
    }
    if (this.field) this.burn(dt);
  }

  /** Breaks a cast in progress (a ground already burning stays). A charge gives the Ember back; a ring already out gives nothing. */
  cancel(): void {
    if (this.phase === 'charge') this.p.refund?.(SUNFIRE_NOVA.emberCost);
    this.phase = 'idle';
    this.elapsed = 0;
    this.releaseCharge();
  }

  /** Death, class change, respec, load, dispose: everything goes, the ground included. */
  end(): void {
    this.phase = 'idle';
    this.elapsed = 0;
    this.releaseCharge();
    this.field = null;
    this.stopGround?.();
    this.stopGround = null;
    this.hit.clear();
  }

  private releaseCharge(): void {
    this.unlock?.();
    this.unlock = null;
    this.stopCharge?.();
    this.stopCharge = null;
  }

  private anyInRange(): boolean {
    const f = this.p.feet();
    for (const foe of this.p.foes()) {
      if (!clean(foe)) continue;
      if (Math.hypot(foe.x - f.x, foe.z - f.z) <= SUNFIRE_NOVA.radius + EPS && Math.abs(foe.y - f.y) <= SUNFIRE_NOVA.halfHeight && seen(this.p.blocked, f, foe)) return true;
    }
    return false;
  }

  private release(overshoot: number): void {
    const f = this.p.feet();
    this.cx = f.x;
    this.cy = f.y;
    this.cz = f.z;
    this.phase = 'ring';
    this.elapsed = Math.max(0, overshoot);
    this.hit.clear();
    this.stopCharge?.();
    this.stopCharge = null;
    this.p.playClip?.(SUNFIRE_NOVA.clip);
    this.p.effect?.(SUNFIRE_NOVA.effectId, f, 0, null, { radius: SUNFIRE_NOVA.radius, seconds: SUNFIRE_NOVA.expandSeconds });
    this.p.fx?.shake?.(SUNFIRE_NOVA.shakeAmplitude, SUNFIRE_NOVA.shakeSeconds);
    this.p.fx?.pulse?.(SUNFIRE_NOVA.flashStrength, SUNFIRE_NOVA.flashSeconds, SUNFIRE_NOVA.flashColor);
    this.sweep();
  }

  private sweep(): void {
    const me = this.p.playerId();
    const radius = this.ringRadius;
    // A snapshot: a hit can change the actor set.
    for (const foe of [...this.p.foes()]) {
      if (this.hit.has(foe.id) || !clean(foe)) continue;
      const dx = foe.x - this.cx;
      const dz = foe.z - this.cz;
      if (Math.hypot(dx, dz) > radius + EPS || Math.abs(foe.y - this.cy) > SUNFIRE_NOVA.halfHeight) continue;
      // Seen from the centre; a foe behind a wall is tried again on the next tick only if the ring has not passed it (it has not been marked).
      if (!seen(this.p.blocked, { x: this.cx, y: this.cy, z: this.cz }, foe)) continue;
      this.hit.add(foe.id);
      const d = Math.hypot(dx, dz);
      const r = this.p.apply({
        attackerId: me, targetId: foe.id, amount: SUNFIRE_NOVA.damage, poise: SUNFIRE_NOVA.poise, kind: 'spell', attackId: SUNFIRE_NOVA.attackId, element: 'fire',
        direction: new THREE.Vector3(d > 1e-6 ? dx / d : 0, 0, d > 1e-6 ? dz / d : 1),
      });
      if (r && r.outcome === 'hit' && !r.killed) {
        igniteOnce(this.p, me, foe.id, { id: SUNFIRE_NOVA.igniteId, seconds: SUNFIRE_NOVA.igniteSeconds, dps: SUNFIRE_NOVA.igniteDps, skip: SUNFIRE_NOVA.igniteSkipPrefix });
      }
    }
    if (this.elapsed + EPS >= SUNFIRE_NOVA.expandSeconds) {
      this.phase = 'idle';
      this.elapsed = 0;
      this.releaseCharge();
      this.lightGround();
    }
  }

  /** The ring has crossed its whole 10 m: the ground it crossed burns for 6 s from here. (A ring broken off leaves no ground.) */
  private lightGround(): void {
    const at = { x: this.cx, y: this.cy, z: this.cz };
    this.field = { ...at, left: SUNFIRE_NOVA.groundSeconds, nextTick: 0 };
    this.stopGround?.();
    this.stopGround = this.p.effect?.(SUNFIRE_NOVA.groundEffect, at, 0, null, { radius: SUNFIRE_NOVA.groundRadius, seconds: SUNFIRE_NOVA.groundSeconds }) ?? null;
  }

  private burn(dt: number): void {
    const g = this.field;
    if (!g) return;
    // The first tick is the moment the ground is lit; it then ticks every half second until it is out.
    g.left -= dt;
    g.nextTick -= dt;
    if (g.nextTick <= EPS) {
      g.nextTick += SUNFIRE_NOVA.groundTick;
      this.ignite(g);
    }
    if (g.left <= EPS) {
      this.field = null;
      this.stopGround?.();
      this.stopGround = null;
    }
  }

  private ignite(g: { x: number; y: number; z: number }): void {
    const me = this.p.playerId();
    const r2 = SUNFIRE_NOVA.groundRadius * SUNFIRE_NOVA.groundRadius;
    for (const foe of this.p.foes()) {
      if (!clean(foe)) continue;
      const dx = foe.x - g.x;
      const dz = foe.z - g.z;
      if (dx * dx + dz * dz > r2 + EPS || Math.abs(foe.y - g.y) > SUNFIRE_NOVA.halfHeight) continue;
      igniteOnce(this.p, me, foe.id, { id: SUNFIRE_NOVA.igniteId, seconds: SUNFIRE_NOVA.igniteSeconds, dps: SUNFIRE_NOVA.igniteDps, skip: SUNFIRE_NOVA.igniteSkipPrefix });
    }
  }
}

// ---- Breath of the Keepers --------------------------------------------------------------------------------------------------

/** An ally-team actor that may be healed. */
export interface AllyView {
  id: string;
  x: number;
  y: number;
  z: number;
}

export interface BreathPorts extends HeldPorts, IgnitePorts {
  foes(): Iterable<FoeView>;
  /** Every live ally-team actor (the player is healed separately). */
  allies(): Iterable<AllyView>;
  apply(req: DamageRequest): DamageResult | null;
  /** Heals `id` by `fraction` of its own maximum health. */
  heal(id: string, fraction: number): number;
  /** True when a static collider lies between the two points; absent means no line-of-sight check. */
  blocked?(from: Vec3, to: Vec3): boolean;
}

/**
 * Breath of the Keepers (Bellowsbreath 5). A 2 s channel (movement locked, no clip so the dodge stays open, flinches ridden out; death, a stagger, a dodge, a block or
 * another action, another ability or a spell ends it, with the ticks already breathed kept) of an 8 m cone, 35 degrees either side of the facing, that ticks every
 * 0.25 s (eight ticks): each live hostile in it takes 0.4x Ember Bolt's damage (4) as fire `spell` and an ignite
 * (`emberwright.breath.ignite`, 2 a second for 3 s) unless it already burns from an `emberwright.*` source; the Emberwright and every ally in
 * the cone recover 3% of their maximum health. A foe in any mercy state is skipped, and so is one that cannot be seen from the Emberwright
 * (a wall in the way). Nothing here controls or kills outright; a hit that would kill is left to the damage pipeline.
 */
export class BreathOfTheKeepers {
  private live = false;
  private elapsed = 0;
  private nextTick = 0;
  private ticks = 0;
  private unlock: Stop | null = null;
  private stopFx: Stop | null = null;

  constructor(private readonly p: BreathPorts) {}

  get active(): boolean {
    return this.live;
  }

  get ticksDone(): number {
    return this.ticks;
  }

  cast(): AbilityHandlerResult {
    const refused = gate(this.p, KEEPERS_BREATH.skillId);
    if (refused) return refused;
    if (this.live) return refuse('casting');
    this.live = true;
    this.elapsed = 0;
    this.nextTick = KEEPERS_BREATH.tickSeconds;
    this.ticks = 0;
    this.unlock = this.p.lockMove();
    this.stopFx = this.p.effect?.(KEEPERS_BREATH.effectId, this.p.feet(), this.p.facingYaw(), null, { seconds: KEEPERS_BREATH.seconds, range: KEEPERS_BREATH.range, halfAngle: KEEPERS_BREATH.halfAngleDeg }) ?? null;
    this.p.reportTrigger?.(KEEPERS_BREATH.skillId);
    return { ok: true };
  }

  update(dt: number): void {
    if (!this.live || !(dt > 0) || !Number.isFinite(dt)) return;
    if (!this.p.isEmberwright() || !this.p.learned(KEEPERS_BREATH.skillId) || this.p.blockedReason() === 'dead' || this.p.interrupted()) {
      this.end();
      return;
    }
    this.elapsed += dt;
    while (this.live && this.nextTick <= KEEPERS_BREATH.seconds + EPS && this.elapsed + EPS >= this.nextTick) {
      this.nextTick += KEEPERS_BREATH.tickSeconds;
      this.tick();
    }
    if (this.live && this.elapsed + EPS >= KEEPERS_BREATH.seconds) this.end();
  }

  /** `ability.used`: any skill but the Breath's own ends the channel. */
  onSkillUsed(skillId: string): void {
    if (this.live && skillId !== KEEPERS_BREATH.skillId) this.end();
  }

  /** `spell.cast` by the player: ends the channel. */
  onSpellCast(): void {
    if (this.live) this.end();
  }

  /** The channel ends (expiry, an interrupt, death, class change, respec, load, dispose). */
  end(): void {
    this.live = false;
    this.elapsed = 0;
    this.unlock?.();
    this.unlock = null;
    this.stopFx?.();
    this.stopFx = null;
  }

  /** Whether the point is in the cone about the player's facing (forward is -sin yaw, -cos yaw). */
  private inCone(f: Vec3, yaw: number, x: number, y: number, z: number): boolean {
    const dx = x - f.x;
    const dz = z - f.z;
    const d = Math.hypot(dx, dz);
    if (d > KEEPERS_BREATH.range + EPS || Math.abs(y - f.y) > KEEPERS_BREATH.halfHeight) return false;
    if (d < 1e-6) return true;
    const cos = (dx * -Math.sin(yaw) + dz * -Math.cos(yaw)) / d;
    return Math.acos(Math.min(1, Math.max(-1, cos))) <= KEEPERS_BREATH.halfAngleDeg * DEG + 1e-9;
  }

  private tick(): void {
    this.ticks++;
    const me = this.p.playerId();
    const f = this.p.feet();
    const yaw = this.p.facingYaw();
    const chest = { x: f.x, y: f.y + 1.3, z: f.z };
    for (const foe of [...this.p.foes()]) {
      if (!clean(foe) || !this.inCone(f, yaw, foe.x, foe.y, foe.z)) continue;
      if (this.p.blocked?.(chest, { x: foe.x, y: foe.y + 1, z: foe.z })) continue;
      const r = this.p.apply({ attackerId: me, targetId: foe.id, amount: KEEPERS_BREATH.damage, poise: 0, kind: 'spell', attackId: KEEPERS_BREATH.attackId, element: 'fire' });
      if (r && r.outcome === 'hit' && !r.killed) {
        igniteOnce(this.p, me, foe.id, { id: KEEPERS_BREATH.igniteId, seconds: KEEPERS_BREATH.igniteSeconds, dps: KEEPERS_BREATH.igniteDps, skip: KEEPERS_BREATH.igniteSkipPrefix });
      }
    }
    this.p.heal(me, KEEPERS_BREATH.healFraction);
    for (const a of this.p.allies()) {
      if (a.id === me || !this.inCone(f, yaw, a.x, a.y, a.z)) continue;
      this.p.heal(a.id, KEEPERS_BREATH.healFraction);
      // A gold-green pulse on the ally once a second, not every tick.
      if (this.ticks % 4 === 1) this.p.effect?.(KEEPERS_BREATH.healEffect, { x: 0, y: 0, z: 0 }, 0, a.id, {});
    }
  }
}

// ---- Colossus of Slag -------------------------------------------------------------------------------------------------------

/** The golem's body as the class sees it: an ally-team actor and a rig it places and animates. */
export interface ColossusBody {
  actor: { id: string; dead: boolean };
  /** Places the rig; `rise` 0..1 is how far it has come up out of the floor (0 is hidden below it). */
  place(x: number, y: number, z: number, yaw: number, rise: number): void;
  play(clip: 'Idle' | 'Walk' | 'Slam'): void;
  /** Advances the rig's animation by one fixed step; `speed` is its ground speed (m/s) for the walk cycle. */
  step(dt: number, speed: number): void;
  /** Despawns the actor and frees the rig. */
  dispose(): void;
}

export interface ColossusPorts extends Act3Ports {
  /** The hostile `id` as it is now, or null. */
  foe(id: string): FoeView | null;
  /** An actor with this id exists already (a golem id is never reused while one is live). */
  taken(id: string): boolean;
  /** Creates the ally-team actor `id` at `at`; null when the world refuses. */
  spawn(id: string, at: Vec3): ColossusBody | null;
  /** The actor `id` is still the golem's own (not despawned by someone else). */
  stillThere(id: string, body: ColossusBody): boolean;
  foes(): Iterable<FoeView>;
  /**
   * The ground height under (x, z), found by a raycast down from `fromY`; null when there is none. Absent (or null) falls back to the
   * player's own height.
   */
  groundY?(x: number, z: number, fromY: number): number | null;
  /** `allyEngagement.mayEngage`: alive, no mercy state, aggroed on the player or an ally. Absent service: false. */
  mayEngage(targetId: string): boolean;
  apply(req: DamageRequest): DamageResult | null;
  fx?: CapstoneFx;
}

/**
 * Colossus of Slag (Anvilcraft 5). A Cinder Golem at scale 2 (an ally-team actor, not hittable and not targetable, a taunter, no Enemy
 * and no Brain) rises from the floor beside the Emberwright over 1.5 s and stays 30 s. It follows her (staying within 4.5 to 6 m) and,
 * from 1 s after it has risen and then every 3 s, picks the nearest live hostile that `allyEngagement.mayEngage` allows (already
 * fighting the player or an ally, in no mercy state) within 14 m of itself and 20 m of her, walks to within 3.5 m of it and slams: 0.8 s
 * later every such hostile within 4 m of the foe takes 1.5x Ember Bolt's damage (15) with poise 40, attacker the golem. It never hits a
 * foe in a mercy state (the resolver also drops an ally's hit on a yielding or calming one), and the plugin's no-kill floor
 * (`colossusNoKill`) keeps any foe it hits at 1 HP, so it never finishes a foe and takes no kill, experience or mercy credit from the
 * player. One at a time; a recast replaces it. It ends on expiry, the player's death, a class change, a respec, a load, dispose, and if
 * its actor is despawned by someone else. It stands on the ground under itself (`groundY` at its own x/z, smoothed; the player's height
 * when there is none), not at the player's height.
 */
export class ColossusOfSlag {
  private body: ColossusBody | null = null;
  private id: string | null = null;
  private serial = 0;
  private x = 0;
  private y = 0;
  private z = 0;
  private yaw = 0;
  private left = 0;
  private risen = 0;
  private slamIn = 0;
  /** A slam in progress: its foe and the point it will land on. */
  private slam: { foeId: string; x: number; y: number; z: number; left: number } | null = null;
  private clip: 'Idle' | 'Walk' | 'Slam' = 'Idle';
  private speed = 0;
  /** Walking back to the player (it stops at `followStop`, not at `followMax`). */
  private trailing = false;

  constructor(private readonly p: ColossusPorts) {}

  get active(): boolean {
    return this.body !== null;
  }

  get actorId(): string | null {
    return this.id;
  }

  get slamming(): boolean {
    return this.slam !== null;
  }

  /** Seconds of rise done, 0..riseSeconds. */
  get riseDone(): number {
    return this.risen;
  }

  get position(): Vec3 {
    return { x: this.x, y: this.y, z: this.z };
  }

  cast(): AbilityHandlerResult {
    const refused = gate(this.p, COLOSSUS.skillId);
    if (refused) return refused;
    this.end();
    const f = this.p.feet();
    const yaw = this.p.facingYaw();
    // Beside the player, on the right of the facing (cos yaw, -sin yaw).
    const x = f.x + Math.cos(yaw) * COLOSSUS.spawnSide;
    const z = f.z - Math.sin(yaw) * COLOSSUS.spawnSide;
    let id: string;
    do id = `${COLOSSUS.idPrefix}${++this.serial}`;
    while (this.p.taken(id));
    const gy = this.p.groundY?.(x, z, f.y + COLOSSUS.groundProbeAbove) ?? f.y;
    const body = this.p.spawn(id, { x, y: gy, z });
    if (!body) return refuse('no-room');
    this.body = body;
    this.id = id;
    this.x = x;
    this.y = gy;
    this.z = z;
    this.yaw = yaw;
    this.left = COLOSSUS.seconds;
    this.risen = 0;
    this.slamIn = COLOSSUS.firstSlamSeconds;
    this.slam = null;
    this.clip = 'Idle';
    this.speed = 0;
    this.trailing = false;
    body.place(x, gy, z, yaw, 0);
    body.play('Idle');
    this.p.effect?.(COLOSSUS.riseEffect, { x, y: gy, z }, 0, null, { seconds: COLOSSUS.riseSeconds, radius: 4 });
    this.p.fx?.shake?.(COLOSSUS.riseShakeAmplitude, COLOSSUS.riseShakeSeconds);
    this.p.reportTrigger?.(COLOSSUS.skillId);
    return { ok: true };
  }

  update(dt: number): void {
    const body = this.body;
    if (!body || !(dt > 0) || !Number.isFinite(dt)) return;
    const id = this.id!;
    if (!this.p.isEmberwright() || !this.p.learned(COLOSSUS.skillId) || this.p.blockedReason() === 'dead' || !this.p.stillThere(id, body)) {
      this.end();
      return;
    }
    this.left -= dt;
    if (this.left <= 0) {
      this.end();
      return;
    }
    const f = this.p.feet();
    const ground = this.p.groundY?.(this.x, this.z, this.y + COLOSSUS.groundProbeAbove) ?? f.y;
    this.y += (ground - this.y) * Math.min(1, COLOSSUS.ySmoothing * dt);
    this.speed = 0;
    if (this.risen < COLOSSUS.riseSeconds) {
      this.risen = Math.min(COLOSSUS.riseSeconds, this.risen + dt);
      body.place(this.x, this.y, this.z, this.yaw, this.risen / COLOSSUS.riseSeconds);
      body.step(dt, 0);
      return;
    }
    if (this.slam) this.advanceSlam(dt);
    else this.move(dt);
    body.place(this.x, this.y, this.z, this.yaw, 1);
    body.step(dt, this.speed);
  }

  /** Expiry, death, class change, respec, load, dispose. */
  end(): void {
    const body = this.body;
    this.body = null;
    this.id = null;
    this.left = 0;
    this.slam = null;
    body?.dispose();
  }

  private setClip(c: 'Idle' | 'Walk' | 'Slam'): void {
    if (this.clip === c) return;
    this.clip = c;
    this.body?.play(c);
  }

  private face(dx: number, dz: number): void {
    if (Math.hypot(dx, dz) > 1e-6) this.yaw = Math.atan2(-dx, -dz);
  }

  private stepToward(tx: number, tz: number, stop: number, dt: number): number {
    const dx = tx - this.x;
    const dz = tz - this.z;
    const d = Math.hypot(dx, dz);
    if (d <= stop + EPS) return d;
    const step = Math.min(COLOSSUS.speed * dt, d - stop);
    this.x += (dx / d) * step;
    this.z += (dz / d) * step;
    this.face(dx, dz);
    this.speed = step / dt;
    return d - step;
  }

  /** Follows the player, or walks to the foe it means to slam. */
  private move(dt: number): void {
    const f = this.p.feet();
    this.slamIn -= dt;
    if (this.slamIn <= 0) {
      const foe = this.pick(f);
      if (foe) {
        const left = this.stepToward(foe.x, foe.z, COLOSSUS.engageDistance, dt);
        if (left <= COLOSSUS.engageDistance + EPS) this.startSlam(foe);
        this.setClip(this.slam ? 'Slam' : 'Walk');
        return;
      }
      this.slamIn = COLOSSUS.retrySeconds;
    }
    const dx = f.x - this.x;
    const dz = f.z - this.z;
    const d = Math.hypot(dx, dz);
    if (d > COLOSSUS.snapDistance) {
      // Fast travel, an interior, a long fall or a gallop: rejoin at the spawn offset instead of walking across the map.
      const yaw = this.p.facingYaw();
      this.x = f.x + Math.cos(yaw) * COLOSSUS.spawnSide;
      this.z = f.z - Math.sin(yaw) * COLOSSUS.spawnSide;
      this.setClip('Idle');
    } else if (d > COLOSSUS.followMax || (this.trailing && d > COLOSSUS.followStop + EPS)) {
      // It sets off past 6 m and walks on until it is 4.5 m away, so it does not stop at the edge of the band.
      this.trailing = true;
      this.stepToward(f.x, f.z, COLOSSUS.followStop, dt);
      this.setClip('Walk');
    } else {
      this.trailing = false;
      this.setClip('Idle');
    }
  }

  /** The nearest live hostile the engagement rules allow, near the golem and not too far from the player. */
  private pick(f: Vec3): FoeView | null {
    let best: FoeView | null = null;
    let bestD = COLOSSUS.pickRange + EPS;
    for (const foe of this.p.foes()) {
      if (!clean(foe)) continue;
      const d = Math.hypot(foe.x - this.x, foe.z - this.z);
      if (d > bestD || Math.hypot(foe.x - f.x, foe.z - f.z) > COLOSSUS.leashRange + EPS) continue;
      if (!this.p.mayEngage(foe.id)) continue;
      bestD = d;
      best = foe;
    }
    return best;
  }

  private startSlam(foe: FoeView): void {
    this.slam = { foeId: foe.id, x: foe.x, y: foe.y, z: foe.z, left: COLOSSUS.impactSeconds };
    this.face(foe.x - this.x, foe.z - this.z);
    this.speed = 0;
  }

  private advanceSlam(dt: number): void {
    const s = this.slam!;
    this.setClip('Slam');
    const before = s.left;
    s.left -= dt;
    if (before > 0 && s.left <= EPS) this.impact(s);
    if (s.left <= -COLOSSUS.recoverSeconds + EPS) {
      this.slam = null;
      this.slamIn = COLOSSUS.slamSeconds - COLOSSUS.impactSeconds - COLOSSUS.recoverSeconds;
      this.setClip('Idle');
    }
  }

  private impact(s: { foeId: string; x: number; y: number; z: number }): void {
    const me = this.id;
    if (!me) return;
    // The blow lands where the foe stands now when it is still a valid target, else where it stood.
    const now = this.p.foe(s.foeId);
    const cx = now && clean(now) ? now.x : s.x;
    const cy = now && clean(now) ? now.y : s.y;
    const cz = now && clean(now) ? now.z : s.z;
    this.p.effect?.(COLOSSUS.slamEffect, { x: cx, y: cy, z: cz }, 0, null, { radius: COLOSSUS.slamRadius });
    this.p.fx?.shake?.(COLOSSUS.slamShakeAmplitude, COLOSSUS.slamShakeSeconds);
    const r2 = COLOSSUS.slamRadius * COLOSSUS.slamRadius;
    for (const foe of [...this.p.foes()]) {
      if (!clean(foe)) continue;
      const dx = foe.x - cx;
      const dz = foe.z - cz;
      if (dx * dx + dz * dz > r2 + EPS || Math.abs(foe.y - cy) > COLOSSUS.halfHeight) continue;
      // Re-check each: an earlier hit of this slam can have put a neighbour into a mercy state.
      if (!this.p.mayEngage(foe.id)) continue;
      const d = Math.hypot(dx, dz);
      this.p.apply({
        attackerId: me, targetId: foe.id, amount: COLOSSUS.damage, poise: COLOSSUS.poise, kind: 'melee', attackId: COLOSSUS.attackId,
        direction: new THREE.Vector3(d > 1e-6 ? dx / d : 0, 0, d > 1e-6 ? dz / d : 1),
      });
    }
  }
}

/**
 * The golem's no-kill floor, a lethal handler (register at `Number.MIN_SAFE_INTEGER + 1`, as the companions do): a hit whose attacker
 * is a golem leaves the target at 1 HP instead of killing it, so the golem never finishes a foe and never takes a kill, experience or
 * mercy credit from the player. The foe's poise break still reaches the Brain, which may yield it.
 */
export function colossusNoKill(isColossus: (attackerId: string | null) => boolean): LethalHandler {
  return (target, r) => {
    if (!isColossus(r.attackerId)) return false;
    target.health = Math.min(1, target.maxHealth);
    return true;
  };
}
