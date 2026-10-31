// Pathfinder tier 5 capstones (Act 3, K11 PR 4): Dragonbane Bolt, Hunter's Web, Skyhawk Strike. Ports-based so the unit tests need
// no game; `capstones.plugin.ts` wires them. Time is the fixed clock's seconds.
import * as THREE from 'three';
import type { DamageRequest, DamageResult } from '../../actors/DamageResolver';
import type { StatusSpec } from '../../actors/status';
import { PLAYER } from '../../config/constants';
import type { AbilityHandlerResult } from '../../hud/ports';
import { AttackYieldFloor, type YieldFloorPorts } from '../capstoneYieldFloor';
import type { ProjectileHit } from '../../spells/Projectile';
import type { BoltLaunchResult, BoltLaunchSpec, BoltTools } from './pathfinder.plugin';
import type { Act3Ports, FoeView } from './skills.act3';
import { PF } from './tuning';

type Stop = () => void;
type V3 = { x: number; y: number; z: number };

const EPS = 1e-9;
const refuse = (reason: string): AbilityHandlerResult => ({ ok: false, reason });
const clean = (f: FoeView): boolean => f.live && (f.mercy === undefined || f.mercy === 'none');

function gate(p: Act3Ports, skillId: string): AbilityHandlerResult | null {
  if (!p.isPathfinder()) return refuse('class');
  if (!p.learned(skillId)) return refuse('not-learned');
  const blocked = p.blockedReason();
  if (blocked) return refuse(blocked);
  return null;
}

/** The capstones' attack ids, for the yield floor. */
export const CAPSTONE_ATTACK_IDS: ReadonlySet<string> = new Set([PF.dragonbane.attackId, PF.huntersWeb.attackId, PF.skyhawk.attackId]);

// ---- Yield floor ------------------------------------------------------------------------------------------------------------

export type { YieldFloorPorts };

/** The Pathfinder capstones' mercy floor: the shared `AttackYieldFloor` keyed to the three capstone attack ids (see there). */
export class YieldFloor extends AttackYieldFloor {
  constructor(p: YieldFloorPorts) {
    super(p, CAPSTONE_ATTACK_IDS);
  }
}

// ---- Dragonbane Bolt ------------------------------------------------------------------------------------------------------

export interface DragonbanePorts extends Act3Ports {
  /** The crossbow's muzzle (the chest when the weapon tip is absent). */
  muzzle(): V3;
  /** Unit direction of the shot from `from`: the lock-on target's chest, else the player's facing. */
  aim(from: V3): V3;
  /** `pathfinder.launchBolt`; null when the Pathfinder service (or the hook) is absent. */
  launch(spec: BoltLaunchSpec): BoltLaunchResult | null;
  /** `actor.mercyState?.()`; undefined reads as 'none'. */
  mercy(actorId: string): string | undefined;
  apply(req: DamageRequest): DamageResult | null;
  shake?(amplitude: number, seconds: number): void;
  /** `ctx.clock.hitStop`, when the clock has one. */
  hitStop?(seconds: number): void;
}

/**
 * Dragonbane Bolt (Bolt capstone; the abilities service charges 40 Ember and the 40 s cooldown on ok). One massive bolt of the
 * Pathfinder along the aim (the lock-on target's chest, else the facing), 60 m, through every hostile in its line, taking one bolt
 * of ammo through `pathfinder.launchBolt` (refused 'no-ammo' with none, nothing spent; a master bolt makes it 10% stronger). Each
 * foe it passes takes 4x the bolt's base damage and poise 60 once, `unblockable` (guards and blocks do not stop it), and a Falcon
 * Eye mark is spent on the first foe struck. A foe in a mercy state is passed through untouched (no hit, no mark). Bosses take it
 * like any hit; the boss registry's shield phase still holds (not touched here). The bolt stops at terrain or a wall.
 *
 * A class change, a load, the player's death and dispose (`reset`) make the bolt in flight do nothing when it lands.
 */
export class DragonbaneBolt {
  private epoch = 0;

  constructor(private readonly p: DragonbanePorts) {}

  cast(): AbilityHandlerResult {
    const refused = gate(this.p, PF.skillIds.dragonbaneBolt);
    if (refused) return refused;
    const origin = this.p.muzzle();
    const dir = this.p.aim(origin);
    const len = Math.hypot(dir.x, dir.y, dir.z);
    if (!Number.isFinite(len) || len < 1e-6) return refuse('no-aim');
    const d = { x: dir.x / len, y: dir.y / len, z: dir.z / len };
    const flat = Math.hypot(d.x, d.z);
    const horizontal = flat < 1e-6 ? new THREE.Vector3(-Math.sin(this.p.facingYaw()), 0, -Math.cos(this.p.facingYaw())) : new THREE.Vector3(d.x / flat, 0, d.z / flat);
    const yaw = Math.atan2(-d.x, -d.z);
    const pitch = Math.asin(Math.max(-1, Math.min(1, d.y)));
    const epoch = this.epoch;
    const state = { markSpent: false, struck: 0 };
    const strike = (actorId: string, at: V3, tools: BoltTools): void => {
      if (epoch !== this.epoch) return;
      const mercy = this.p.mercy(actorId);
      if (mercy !== undefined && mercy !== 'none') return;
      let poise: number = PF.dragonbane.poise;
      if (!state.markSpent) {
        state.markSpent = true;
        poise += tools.markPoise(actorId);
      }
      state.struck++;
      this.p.apply({
        attackerId: this.p.playerId(),
        targetId: actorId,
        amount: PF.baseDamage * PF.dragonbane.damageScale * (tools.master ? PF.masterBoltScale : 1),
        poise,
        kind: 'melee',
        attackId: PF.dragonbane.attackId,
        unblockable: true,
        point: new THREE.Vector3(at.x, at.y, at.z),
        direction: horizontal.clone(),
      });
    };
    const result = this.p.launch({
      origin,
      direction: d,
      speed: PF.dragonbane.speed,
      lifetime: PF.dragonbane.range / PF.dragonbane.speed,
      radius: PF.dragonbane.radius,
      pierce: PF.dragonbane.pierce,
      ammo: true,
      onPass: (h, tools) => strike(h.actorId, h.point, tools),
      onHit: (r: ProjectileHit, tools) => {
        if (epoch !== this.epoch) return;
        if (r.kind === 'actor') strike(r.actorId, r.point, tools);
        const length = Math.hypot(r.point.x - origin.x, r.point.y - origin.y, r.point.z - origin.z);
        // The ribbon runs to wherever the bolt ended; the shockwave only where it struck something.
        this.p.effect?.(PF.dragonbane.effectId, origin, yaw, { length, pitch });
        if (r.kind !== 'expired') {
          this.p.effect?.(PF.dragonbane.impactEffectId, r.point, yaw, {});
          this.p.shake?.(PF.dragonbane.shakeAmplitude, PF.dragonbane.shakeSeconds);
        }
        if (state.struck > 0) this.p.hitStop?.(PF.dragonbane.hitStopSeconds);
      },
    });
    if (result === null) return refuse('no-launcher');
    if (!result.ok) return refuse(result.reason);
    // The muzzle flare, at release.
    this.p.effect?.(PF.dragonbane.effectId, origin, yaw, { flare: 1, pitch });
    this.p.reportTrigger?.(PF.skillIds.dragonbaneBolt);
    return { ok: true };
  }

  /** Class change, load, death, dispose: a bolt in flight lands as nothing. */
  reset(): void {
    this.epoch++;
  }
}

// ---- Hunter's Web ---------------------------------------------------------------------------------------------------------

export interface HuntersWebPorts extends Act3Ports {
  foes(): Iterable<FoeView>;
  /** `status.apply`; false when refused. */
  status(targetId: string, spec: StatusSpec): boolean;
  apply(req: DamageRequest): DamageResult | null;
  shake?(amplitude: number, seconds: number): void;
  /** Static geometry stands between the two points; absent reads as open. */
  blocked?(from: V3, to: V3): boolean;
  /** The foe's mercy state now (`actor.mercyState?.()`), re-read after the hit; absent skips the re-check. */
  mercy?(actorId: string): string | undefined;
}

/**
 * Hunter's Web (Snare capstone; 45 s, 35 Ember on ok). A ring of nets and runes, 12 m in radius (inclusive), centred on the
 * Pathfinder's feet where she stood at the cast, arms for 1 s and then pops at once: every live hostile inside it (within 6 m of
 * her height) that is not in a mercy state takes 0.8x the base hit (a spell, poise 30) and is rooted for 4 s
 * (`pathfinder.huntersWeb.root`); a boss takes the damage and poise and a 0.5 slow for 4 s instead, never the root. The pop reads
 * the foes where they stand at the pop. A foe with no line of sight from the ring's centre (static geometry between the centre and
 * its chest, both at chest height) is skipped. The root or slow is applied only if the foe is still not in a mercy state after the
 * hit (a poise break under half health makes it yield). Not a trap: it is held nowhere in `Traps`, so it never counts against the trap limits.
 * Refused 'no-target' when no live non-mercy hostile is inside the ring at the cast (nothing spent), 'active' while one is armed.
 * The armed ring ends, unpopped, on death, unlearning, a class change, a load and dispose.
 */
export class HuntersWeb {
  private live = false;
  private popAt = 0;
  private cx = 0;
  private cy = 0;
  private cz = 0;
  private stopFx: Stop | null = null;

  constructor(private readonly p: HuntersWebPorts) {}

  get armed(): boolean {
    return this.live;
  }

  /** Where the ring was laid, or null. */
  get centre(): V3 | null {
    return this.live ? { x: this.cx, y: this.cy, z: this.cz } : null;
  }

  cast(): AbilityHandlerResult {
    const refused = gate(this.p, PF.skillIds.huntersWeb);
    if (refused) return refused;
    if (this.live) return refuse('active');
    const f = this.p.feet();
    if (!this.inside(f).some((x) => clean(x) && this.visible(f, x))) return refuse('no-target');
    const now = this.p.now();
    this.live = true;
    this.cx = f.x;
    this.cy = f.y;
    this.cz = f.z;
    this.popAt = now + PF.huntersWeb.armSeconds;
    this.stopFx = this.p.effect?.(PF.huntersWeb.effectId, f, 0, { seconds: PF.huntersWeb.armSeconds, radius: PF.huntersWeb.radius }) ?? null;
    this.p.reportTrigger?.(PF.skillIds.huntersWeb);
    return { ok: true };
  }

  /** Once per fixed tick. */
  update(): void {
    if (!this.live) return;
    if (!this.p.isPathfinder() || !this.p.learned(PF.skillIds.huntersWeb) || this.p.blockedReason() === 'dead') return this.end();
    if (this.p.now() + EPS >= this.popAt) this.pop();
  }

  /** Death, unlearning, class change, load, dispose: the ring goes unpopped. */
  end(): void {
    this.live = false;
    this.stopFx?.();
    this.stopFx = null;
  }

  private visible(centre: V3, f: FoeView): boolean {
    const h = PF.skyhawk.chestHeight;
    return !this.p.blocked?.({ x: centre.x, y: centre.y + h, z: centre.z }, { x: f.x, y: f.y + h, z: f.z });
  }

  private inside(centre: V3): FoeView[] {
    const r2 = PF.huntersWeb.radius * PF.huntersWeb.radius;
    const out: FoeView[] = [];
    for (const f of this.p.foes()) {
      const dx = f.x - centre.x;
      const dz = f.z - centre.z;
      if (dx * dx + dz * dz > r2 + EPS || Math.abs(f.y - centre.y) > PF.huntersWeb.halfHeight) continue;
      out.push(f);
    }
    return out;
  }

  private pop(): void {
    const centre = { x: this.cx, y: this.cy, z: this.cz };
    this.live = false;
    // The ring's own visual has run its second; the pop is a separate effect.
    this.stopFx = null;
    const me = this.p.playerId();
    let n = 0;
    for (const f of this.inside(centre)) {
      if (!clean(f) || !this.visible(centre, f)) continue;
      n++;
      const dx = f.x - centre.x;
      const dz = f.z - centre.z;
      const l = Math.hypot(dx, dz);
      this.p.apply({
        attackerId: me,
        targetId: f.id,
        amount: PF.baseDamage * PF.huntersWeb.damageScale,
        poise: PF.huntersWeb.poise,
        kind: 'spell',
        attackId: PF.huntersWeb.attackId,
        point: new THREE.Vector3(f.x, f.y + 1, f.z),
        direction: l < 1e-6 ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(dx / l, 0, dz / l),
      });
      const after = this.p.mercy?.(f.id);
      if (after !== undefined && after !== 'none') continue;
      this.p.status(
        f.id,
        f.boss
          ? { id: PF.huntersWeb.slowStatusId, kind: 'slow', slow: PF.huntersWeb.bossSlow, seconds: PF.huntersWeb.bossSlowSeconds, sourceId: me }
          : { id: PF.huntersWeb.rootStatusId, kind: 'root', seconds: PF.huntersWeb.rootSeconds, sourceId: me },
      );
    }
    this.p.effect?.(PF.huntersWeb.popEffectId, centre, 0, { radius: PF.huntersWeb.radius, hits: n });
    this.p.shake?.(PF.huntersWeb.shakeAmplitude, PF.huntersWeb.shakeSeconds);
  }
}

// ---- Skyhawk Strike -------------------------------------------------------------------------------------------------------

export interface LeapLike {
  readonly active: boolean;
  readonly landed: boolean;
  cancel(): void;
}

export interface SkyhawkPorts extends Act3Ports {
  foes(): Iterable<FoeView>;
  /** The lock-on target's actor id, or null. */
  lockTarget(): string | null;
  /** Terrain stands between the two points (only fixed colliders count). */
  blocked(from: V3, to: V3): boolean;
  /** `movementMode.current`; an absent service reads 'walk'. */
  mode(): string;
  /** The Pathfinder is in the saddle (`mount.mounted()`). */
  mounted(): boolean;
  /** `containment.isOpen`: the open area with every closed hole cut out (containment.ts `isOpen`); true when the service is absent. */
  isOpen(x: number, z: number): boolean;
  /** `containment.clamp`; the point itself when the service is absent. */
  clamp(at: { x: number; z: number }): { x: number; z: number };
  /** Interior id at a point, null outdoors or when interiors are absent. */
  interiorAt(p: V3): string | null;
  /** Closest solid hit along `dir` (unit) within `max` metres, ignoring the player's own collider. */
  raycast(origin: V3, dir: V3, max: number): { distance: number; point: V3 } | null;
  /** Static geometry (never a moving body) stands on the short segment between the two points: one arc segment of the leap. */
  arcBlocked(from: V3, to: V3): boolean;
  /** `ctx.player.leap`; null when refused (airborne, frozen, already leaping). */
  leap(o: { yaw: number; distance: number; apex: number; maxSeconds: number }): LeapLike | null;
  /** `combatVerbs.addInvulnerability`; the release is idempotent. Null when the hook is absent. */
  invulnerable(seconds: number): Stop | null;
  apply(req: DamageRequest): DamageResult | null;
  /** `status.apply`; false when refused. */
  status(targetId: string, spec: StatusSpec): boolean;
  /** A registered boss actor. */
  isBoss(actorId: string): boolean;
  /** The foe's mercy state now (`actor.mercyState?.()`), re-read after the hit; absent skips the re-check. */
  mercy?(actorId: string): string | undefined;
  /** The Kestrel's stoop: its mesh and trail from `from` to `to` over `seconds`. */
  dive?(from: V3, to: V3, seconds: number): void;
  /** Removes the Kestrel's mesh at once. */
  clearDive?(): void;
  /** Visual attached to the player for the carry (feather trail); the returned function stops it. */
  carryEffect?(seconds: number): Stop | null;
  warn(message: string): void;
}

/** A planned carry: where the leap lands and the leap's own numbers. */
interface Plan {
  yaw: number;
  /** Horizontal metres to the landing. */
  distance: number;
  groundY: number;
  /** The leap's apex above the launch point (cleared of every face along the arc). */
  apex: number;
}

/**
 * Skyhawk Strike (Trail capstone; 40 s, 30 Ember on ok). On foot only: refused 'movement' in glide, dive (swimming), ferry and haul,
 * and 'mounted' in the saddle.
 *
 * The target: the lock-on target when it is a live non-mercy hostile within 25 m with a clear line, else the nearest such foe
 * within 25 m inside a 90 degree cone ahead (45 degrees either side of the facing) with a clear line. The Kestrel dives for
 * 0.3 s; as it lands the foe takes 2.5x the base hit (poise 50) and a 1 s `stun`, except a boss, which takes the hit and the
 * poise but never the stun. A foe that died or turned mercy-state in that 0.3 s is left alone.
 *
 * The carry: at the cast the Pathfinder is lifted along `player.leap` to a landing 2 m short of the target on her side (no carry
 * when she is already within 3 m), or, with no foe, to the farthest valid landing up to 20 m ahead (at least 6 m: the gap
 * crossing; that case is never refused for want of a foe). The carry runs only when every 0.5 m sample of the straight path and the
 * landing pass: in the open area (`containment.isOpen`, which cuts every closed hole out), z below 16900 (the summit box edge), in the
 * space the cast began in (never into or out of an interior), and the landing is on ground (a raycast down) at most 12 m above the
 * start and at most 6 m below it, and the clamp does not move it. Otherwise the strike still happens and the carry is skipped; with
 * no foe and no valid carry it is refused 'no-path' (nothing spent). The Pathfinder is invulnerable from the lift to the landing, which
 * ends it at once. The arc is checked too: the ballistic path the leap will fly is marched in 0.5 m segments (feet and head) with
 * static-geometry raycasts, the apex rises (above max(start, landing) plus a margin, up to 4 m more) to clear a face before a higher
 * landing, and the carry is skipped when no apex gets a clear arc; in the gap case the line of sight from her chest to the landing's
 * must also be clear. A foe that turned mercy-state from the hit is not stunned. A death, unlearning, a class change, a load and dispose cancel the leap and release the invulnerability.
 */
export class SkyhawkStrike {
  private leapHandle: LeapLike | null = null;
  private until = 0;
  private release: Stop | null = null;
  private stopCarryFx: Stop | null = null;
  private strikeAt = 0;
  private targetId: string | null = null;
  private warned = false;

  constructor(private readonly p: SkyhawkPorts) {}

  get carrying(): boolean {
    return this.leapHandle !== null;
  }

  get striking(): boolean {
    return this.targetId !== null;
  }

  cast(): AbilityHandlerResult {
    const refused = gate(this.p, PF.skillIds.skyhawkStrike);
    if (refused) return refused;
    const mode = this.p.mode();
    if (mode !== 'walk') return refuse('movement');
    if (this.p.mounted()) return refuse('mounted');
    if (this.leapHandle || this.targetId !== null) return refuse('active');
    const feet = this.p.feet();
    const yaw = this.p.facingYaw();
    const target = this.pick(feet, yaw);
    let plan: Plan | null;
    if (target) {
      const dx = target.x - feet.x;
      const dz = target.z - feet.z;
      const d = Math.hypot(dx, dz);
      plan = d - PF.skyhawk.standOff < PF.skyhawk.minCarry ? null : this.plan(feet, target.x - (dx / d) * PF.skyhawk.standOff, target.z - (dz / d) * PF.skyhawk.standOff);
    } else {
      plan = this.gap(feet, yaw);
      if (!plan) return refuse('no-path');
    }
    if (plan) {
      if (!this.lift(plan, feet)) {
        if (!target) return refuse('no-path');
      }
    }
    if (target) {
      this.targetId = target.id;
      this.strikeAt = this.p.now() + PF.skyhawk.diveSeconds;
      const chest = { x: target.x, y: target.y + PF.skyhawk.chestHeight, z: target.z };
      this.p.dive?.({ x: feet.x, y: feet.y + 9, z: feet.z }, chest, PF.skyhawk.diveSeconds);
    }
    this.p.reportTrigger?.(PF.skillIds.skyhawkStrike);
    return { ok: true };
  }

  /** Once per fixed tick. */
  update(): void {
    if (!this.leapHandle && this.targetId === null) return;
    if (!this.p.isPathfinder() || !this.p.learned(PF.skillIds.skyhawkStrike) || this.p.blockedReason() === 'dead') return this.reset();
    const now = this.p.now();
    if (this.targetId !== null && now + EPS >= this.strikeAt) {
      const id = this.targetId;
      this.targetId = null;
      this.strike(id);
    }
    if (this.leapHandle && (!this.leapHandle.active || now > this.until + EPS)) this.land();
  }

  /** Death, unlearning, class change, load, respec and dispose: no strike, the leap cancelled, the invulnerability released. */
  reset(): void {
    this.targetId = null;
    this.land();
    this.p.clearDive?.();
  }

  // ---- target

  private pick(feet: V3, yaw: number): FoeView | null {
    const from = { x: feet.x, y: feet.y + PF.skyhawk.chestHeight, z: feet.z };
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const cos = Math.cos((PF.skyhawk.coneHalfDeg * Math.PI) / 180);
    const reach = (f: FoeView): number | null => {
      if (!clean(f)) return null;
      const dx = f.x - feet.x;
      const dz = f.z - feet.z;
      const d = Math.hypot(dx, f.y - feet.y, dz);
      if (d > PF.skyhawk.range + EPS) return null;
      if (this.p.blocked(from, { x: f.x, y: f.y + PF.skyhawk.chestHeight, z: f.z })) return null;
      return d;
    };
    const lock = this.p.lockTarget();
    const all = [...this.p.foes()];
    if (lock !== null) {
      const f = all.find((x) => x.id === lock);
      if (f && reach(f) !== null) return f;
    }
    let best: FoeView | null = null;
    let bestD = Infinity;
    for (const f of all) {
      const dx = f.x - feet.x;
      const dz = f.z - feet.z;
      const h = Math.hypot(dx, dz);
      if (h > 1e-6 && (dx * fx + dz * fz) / h < cos - EPS) continue;
      const d = reach(f);
      if (d !== null && d < bestD) {
        best = f;
        bestD = d;
      }
    }
    return best;
  }

  private strike(id: string): void {
    const f = [...this.p.foes()].find((x) => x.id === id);
    if (!f || !clean(f)) return;
    const feet = this.p.feet();
    const dx = f.x - feet.x;
    const dz = f.z - feet.z;
    const l = Math.hypot(dx, dz);
    const me = this.p.playerId();
    this.p.apply({
      attackerId: me,
      targetId: f.id,
      amount: PF.baseDamage * PF.skyhawk.damageScale,
      poise: PF.skyhawk.poise,
      kind: 'melee',
      attackId: PF.skyhawk.attackId,
      point: new THREE.Vector3(f.x, f.y + 1, f.z),
      direction: l < 1e-6 ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(dx / l, 0, dz / l),
    });
    const after = this.p.mercy?.(f.id);
    const calm = after === undefined || after === 'none';
    if (calm && !this.p.isBoss(f.id)) this.p.status(f.id, { id: PF.skyhawk.stunStatusId, kind: 'stun', seconds: PF.skyhawk.stunSeconds, sourceId: me });
    this.p.effect?.(PF.skyhawk.impactEffectId, { x: f.x, y: f.y, z: f.z }, 0, {});
  }

  // ---- carry

  /** The farthest valid landing ahead, from 20 m down to 6 m. */
  private gap(feet: V3, yaw: number): Plan | null {
    const dx = -Math.sin(yaw);
    const dz = -Math.cos(yaw);
    for (let d = PF.skyhawk.gapDistance; d >= PF.skyhawk.gapMin - EPS; d -= PF.skyhawk.probeStep) {
      const x = feet.x + dx * d;
      const z = feet.z + dz * d;
      const plan = this.plan(feet, x, z);
      // A wall between her chest and the landing's chest rules the landing out, as it does a target.
      if (plan && !this.p.blocked({ x: feet.x, y: feet.y + PF.skyhawk.chestHeight, z: feet.z }, { x, y: plan.groundY + PF.skyhawk.chestHeight, z })) return plan;
    }
    return null;
  }

  /** The carry to (x, z), or null when a sample, the landing or its ground fails (see the class comment). */
  private plan(feet: V3, x: number, z: number): Plan | null {
    const dx = x - feet.x;
    const dz = z - feet.z;
    const distance = Math.hypot(dx, dz);
    if (distance < PF.skyhawk.minCarry) return null;
    const space = this.p.interiorAt(feet);
    const up = PF.skyhawk.maxRise + PF.skyhawk.groundProbeAbove;
    const down = this.p.raycast({ x, y: feet.y + up, z }, { x: 0, y: -1, z: 0 }, up + PF.skyhawk.maxDrop + 0.5);
    if (!down) return null;
    const groundY = down.point.y;
    if (groundY - feet.y > PF.skyhawk.maxRise + EPS || feet.y - groundY > PF.skyhawk.maxDrop + EPS) return null;
    const apex = this.clearApex(feet, groundY, distance, dx, dz);
    if (apex === null) return null;
    const steps = Math.ceil(distance / PF.skyhawk.probeStep - EPS);
    for (let i = 1; i <= steps; i++) {
      const t = Math.min(1, (i * PF.skyhawk.probeStep) / distance);
      const sx = feet.x + dx * t;
      const sz = feet.z + dz * t;
      if (!this.p.isOpen(sx, sz) || sz >= PF.skyhawk.maxZ || this.p.interiorAt({ x: sx, y: feet.y + (groundY - feet.y) * t, z: sz }) !== space) return null;
    }
    const clamped = this.p.clamp({ x, z });
    if (Math.hypot(clamped.x - x, clamped.z - z) > 0.01) return null;
    return { yaw: Math.atan2(-dx, -dz), distance, groundY, apex };
  }

  /**
   * The apex for a carry to (groundY, distance): the lowest of the escalating margins above max(start, landing) whose whole arc
   * (the ballistic path `player.leap` flies: constant horizontal speed, gravity `PLAYER.gravity`) is free of static geometry,
   * marched in `probeStep` segments at the feet (+0.3 m) and the head (+1.5 m); null when none is.
   */
  private clearApex(feet: V3, groundY: number, distance: number, dx: number, dz: number): number | null {
    const rise = groundY - feet.y;
    const top = Math.max(0, rise);
    for (const extra of [0, 2, 4]) {
      const apex = Math.max(PF.skyhawk.apexMin, top + PF.skyhawk.apexMargin + extra);
      if (this.arcFree(feet, rise, apex, distance, dx / distance, dz / distance)) return apex;
    }
    return null;
  }

  private arcFree(feet: V3, rise: number, apex: number, distance: number, ux: number, uz: number): boolean {
    const g = PLAYER.gravity;
    const v = Math.sqrt(2 * g * apex);
    const landTime = (v + Math.sqrt(Math.max(0, v * v - 2 * g * rise))) / g;
    const hSpeed = distance / landTime;
    const n = Math.min(600, Math.ceil((landTime * Math.max(hSpeed, v)) / PF.skyhawk.probeStep));
    const at = (t: number, lift: number): V3 => ({ x: feet.x + ux * hSpeed * t, y: feet.y + v * t - 0.5 * g * t * t + lift, z: feet.z + uz * hSpeed * t });
    for (const lift of [0.3, 1.5]) {
      let prev = at(0, lift);
      for (let i = 1; i <= n; i++) {
        const next = at((landTime * i) / n, lift);
        const sx = next.x - prev.x;
        const sy = next.y - prev.y;
        const sz = next.z - prev.z;
        const len = Math.hypot(sx, sy, sz);
        if (len > 1e-6 && this.p.arcBlocked(prev, next)) return false;
        prev = next;
      }
    }
    return true;
  }

  /** Starts the leap and the invulnerability; false when the leap is refused. */
  private lift(plan: Plan, feet: V3): boolean {
    const g = PLAYER.gravity;
    const rise = plan.groundY - feet.y;
    const apex = plan.apex;
    const v = Math.sqrt(2 * g * apex);
    const airtime = (2 * v) / g;
    // The leap's horizontal speed is distance / airtime for a landing at the launch height; a landing at `rise` above or below it
    // comes sooner or later, so the leap's distance is scaled for the landing to be at the planned metre.
    const landTime = (v + Math.sqrt(Math.max(0, v * v - 2 * g * rise))) / g;
    const maxSeconds = landTime + PF.skyhawk.landSlackSeconds;
    const handle = this.p.leap({ yaw: plan.yaw, distance: (plan.distance * airtime) / landTime, apex, maxSeconds });
    if (!handle) return false;
    this.leapHandle = handle;
    this.until = this.p.now() + maxSeconds;
    this.release = this.p.invulnerable(maxSeconds + 0.05);
    if (!this.release && !this.warned) {
      this.warned = true;
      this.p.warn('pathfinder: combatVerbs.addInvulnerability is absent, Skyhawk Strike is not invulnerable');
    }
    this.stopCarryFx = this.p.carryEffect?.(maxSeconds) ?? null;
    return true;
  }

  /** Landed, cancelled or timed out: the leap is cancelled if it still runs, the invulnerability and the trail go. */
  private land(): void {
    const h = this.leapHandle;
    this.leapHandle = null;
    if (h?.active) h.cancel();
    this.release?.();
    this.release = null;
    this.stopCarryFx?.();
    this.stopCarryFx = null;
  }
}
