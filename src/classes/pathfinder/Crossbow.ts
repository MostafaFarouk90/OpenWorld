import * as THREE from 'three';
import type { ModifiableRequest } from '../../actors/DamageResolver';
import { ProjectileSystem, type ProjectileHit } from '../../spells/Projectile';
import { actorsInRadius } from '../../spells/areas';
import type { ActorsLike, DamageLike, Vec3 } from '../../vfx/ports';
import type { Ammo } from './Ammo';
import type { Marks } from './Marks';
import { PATHFINDER_ATTACKS, PF, SHOTS } from './tuning';

export interface CrossbowFx {
  tracer(from: Vec3, to: Vec3): void;
  shot(at: Vec3): void;
  hit(at: Vec3): void;
}

export interface CrossbowPorts {
  playerId(): string;
  /** World position of the crossbow's muzzle. */
  muzzle(out: THREE.Vector3): THREE.Vector3;
  /** Unit direction a bolt leaves `from` in: lock-on target, else the camera ray, else the player's facing. */
  aim(from: Vec3): Vec3;
  /** The attack-1 key is still down (Steady Shot). */
  attackHeld(): boolean;
  learned(skillId: string): boolean;
  actors: ActorsLike;
  damage: DamageLike;
  projectiles: ProjectileSystem;
  ammo: Ammo;
  marks: Marks;
  fx: CrossbowFx;
  toast(textKey: string): void;
  now(): number;
}

const CLIPS = new Set(PATHFINDER_ATTACKS.map((a) => a.clip));
const HINT_GAP_SECONDS = 6;
const UP = new THREE.Vector3(0, 1, 0);

/**
 * The Pathfinder's four crossbow shots. The attack set is a melee-window model, so a swing is a ranged clip whose window
 * the weapon tracer still sweeps: while bolts remain `cancelMelee` voids those hits (the bolts do the damage), and with none
 * the crossbow's own sweep stands at `PF.dryScale` (the stock-butt rule).
 */
export class Crossbow {
  private index = -1;
  private armed = false;
  private fired = 0;
  private disposed = false;
  private hintAt = -Infinity;
  private readonly tmp = new THREE.Vector3();

  constructor(private readonly p: CrossbowPorts) {}

  /** A shot clip started (`clipStart` of the controller). */
  swingStarted(attackIndex: number): void {
    this.index = attackIndex;
    this.fired = 0;
    this.armed = this.p.ammo.available() > 0;
    if (!this.armed && this.p.now() - this.hintAt >= HINT_GAP_SECONDS) {
      this.hintAt = this.p.now();
      this.p.toast('pathfinder.noBolts');
    }
  }

  swingEnded(): void {
    this.index = -1;
    this.armed = false;
  }

  /** Per tick of the playing shot: releases whose phase this tick crossed. */
  progress(previous: number, current: number): void {
    if (this.index < 0) return;
    const spec = SHOTS[this.index];
    for (let i = this.fired; i < spec.releases.length; i++) {
      const r = spec.releases[i];
      if (previous < r && current >= r) {
        this.fired = i + 1;
        this.release(i);
      }
    }
  }

  /** Damage modifier (attacker band) for the player's melee hits made by the crossbow's tracer. */
  cancelMelee(req: ModifiableRequest): void {
    if (req.attackerId !== this.p.playerId() || req.kind !== 'melee' || !req.attackId || !CLIPS.has(req.attackId)) return;
    if (this.armed) {
      req.outcome = 'immune';
      req.amount = 0;
      req.poise = 0;
    } else {
      req.amount *= PF.dryScale;
      req.poise *= PF.dryScale;
    }
  }

  dispose(): void {
    this.disposed = true;
  }

  private release(k: number): void {
    const spec = SHOTS[this.index];
    if (!this.p.ammo.take()) return;
    const from = this.p.muzzle(this.tmp);
    const origin = { x: from.x, y: from.y, z: from.z };
    const dir = new THREE.Vector3().copy(this.p.aim(origin)).normalize();
    if (this.index === 2) dir.applyAxisAngle(UP, THREE.MathUtils.degToRad((k - 1) * PF.rapidSpreadDegrees));
    const steady = this.index === 0 && this.p.learned(PF.skillIds.steadyShot) && this.p.attackHeld();
    const amount = PF.baseDamage * spec.damage * (steady ? PF.steadyShotScale : 1);
    const attackId = `pathfinder.bolt.${this.index + 1}`;
    const horizontal = new THREE.Vector3(dir.x, 0, dir.z).normalize();
    let passes = 0;
    const pierced = new Set<string>();
    const strike = (targetId: string, at: Vec3, scale: number): void => {
      this.p.damage.apply({
        attackerId: this.p.playerId(),
        targetId,
        amount: amount * scale,
        poise: spec.poise + this.p.marks.consume(targetId),
        kind: 'melee',
        attackId,
        point: new THREE.Vector3(at.x, at.y, at.z),
        direction: horizontal.clone(),
      });
      this.p.fx.hit(at);
    };
    const launched = this.p.projectiles.launch({
      casterId: this.p.playerId(),
      origin,
      direction: dir,
      speed: PF.bolt.speed,
      lifetime: PF.bolt.range / PF.bolt.speed,
      radius: PF.bolt.radius,
      pierce: this.p.learned(PF.skillIds.piercingBolt) ? PF.pierce.extra : 0,
      onPass: (h) => {
        if (this.disposed) return;
        passes++;
        pierced.add(h.actorId);
        strike(h.actorId, h.point, 1);
      },
      onHit: (r: ProjectileHit) => {
        if (this.disposed) return;
        this.p.fx.tracer(origin, r.point);
        if (r.kind === 'actor') strike(r.actorId, r.point, passes > 0 ? PF.pierce.secondScale : 1);
        if (spec.blast) this.blast(r, amount, spec.poise, attackId, pierced);
      },
    });
    if (launched) this.p.fx.shot(origin);
  }

  private blast(r: ProjectileHit, amount: number, poise: number, attackId: string, skip: ReadonlySet<string>): void {
    const direct = r.kind === 'actor' ? r.actorId : null;
    for (const h of actorsInRadius(this.p.actors, r.point, PF.blast.radius, { team: 'hostile', alive: true })) {
      if (h.actor.id === direct || skip.has(h.actor.id)) continue;
      const dx = h.position.x - r.point.x;
      const dz = h.position.z - r.point.z;
      const len = Math.hypot(dx, dz) || 1;
      this.p.damage.apply({
        attackerId: this.p.playerId(),
        targetId: h.actor.id,
        amount: amount * PF.blast.scale,
        poise: poise * PF.blast.scale,
        kind: 'spell',
        attackId: `${attackId}.blast`,
        point: new THREE.Vector3(h.position.x, h.position.y, h.position.z),
        direction: new THREE.Vector3(dx / len, 0, dz / len),
      });
    }
    this.p.fx.hit(r.point);
  }
}
