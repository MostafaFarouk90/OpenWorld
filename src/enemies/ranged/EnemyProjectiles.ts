import * as THREE from 'three';
import { ProjectileSystem, type ProjectileHit, type ProjectileHost } from '../../spells/Projectile';
import type { ActorsLike } from '../../vfx/ports';
import type { ActorId, EnemyHost } from '../ports';
import type { MoveDef, RangedSpec } from '../types';
import { AIM_HEIGHT, GLOB_BURN, PROJECTILE_CAPACITY, RANGED_ATTACK_PREFIX, SHAPE_LOOK } from './tuning';

/** What a shooter tells the projectile adapter; `Enemy` implements it. */
export interface Shooter {
  readonly id: ActorId;
  readonly damageScale: number;
  /** Feet position now. */
  readonly feet: { x: number; y: number; z: number };
  /** Yaw (0 faces -Z). */
  readonly yaw: number;
}

interface Launched {
  readonly shooter: ActorId;
  mesh: THREE.Mesh | null;
  origin: THREE.Vector3;
  dir: THREE.Vector3;
  speed: number;
  age: number;
  cancelled: boolean;
}

/** The core's projectile host, rebuilt from the narrow enemy host (the class threads build theirs from the whole context). */
export function projectileHostFrom(host: EnemyHost): ProjectileHost {
  return {
    actors: host.actors as unknown as ActorsLike,
    heightAt: host.heightAt,
    rayCast: host.physics
      ? (origin, dir, maxDist) => {
          const hit = host.physics!.raycast(origin, dir, maxDist, host.player.collider as never);
          return hit ? { point: hit.point } : null;
        }
      : undefined,
  };
}

/**
 * Enemy projectiles: the rock throw, the slag glob, the hunters' net and harpoon. A thin adapter over the shared
 * `ProjectileSystem` (src/spells/Projectile.ts): it launches on a move's window opening, draws the shape, and maps the hit
 * to a `kind: 'melee'` damage request (so blocks, parries, i-frames and the Act 1 modifiers apply unchanged) plus the
 * move's effect on an outcome `hit` only: `root` through the status service, `pull` on the request (the core applies it).
 * A bolt hits the player and allies; actors with `hittable: false` (the fox and sheep) are skipped by the sweep.
 */
export class EnemyProjectiles {
  private readonly system: ProjectileSystem;
  private readonly launched = new Set<Launched>();
  private readonly tmp = new THREE.Vector3();

  constructor(
    private readonly host: EnemyHost,
    capacity: number = PROJECTILE_CAPACITY,
  ) {
    this.system = new ProjectileSystem(projectileHostFrom(host), capacity);
  }

  get liveCount(): number {
    return this.system.liveCount;
  }

  /** Fires `move.ranged` from the shooter toward `aimAt` (feet position of the target). False when nothing was launched. */
  fire(shooter: Shooter, move: MoveDef, aimAt: { x: number; y: number; z: number }): boolean {
    const spec = move.ranged;
    if (!spec) return false;
    const origin = new THREE.Vector3(shooter.feet.x, shooter.feet.y + spec.originHeight, shooter.feet.z);
    const dir = new THREE.Vector3(aimAt.x - origin.x, aimAt.y + AIM_HEIGHT - origin.y, aimAt.z - origin.z);
    if (!(dir.lengthSq() > 1e-6)) return false;
    dir.normalize();
    // Start a hand's length ahead, so the shooter's own body never blocks the first sweep.
    origin.addScaledVector(dir, 0.5);
    const rec: Launched = { shooter: shooter.id, mesh: null, origin: origin.clone(), dir: dir.clone(), speed: spec.speed, age: 0, cancelled: false };
    const ok = this.system.launch({
      casterId: shooter.id,
      origin,
      direction: dir,
      speed: spec.speed,
      lifetime: spec.maxRange / spec.speed,
      radius: spec.radius,
      onHit: (hit) => this.finished(rec, move, spec, shooter.damageScale, hit),
    });
    if (!ok) return false;
    rec.mesh = this.makeMesh(spec, dir);
    rec.mesh.position.copy(origin);
    this.host.scene.add(rec.mesh);
    this.launched.add(rec);
    return true;
  }

  /** One fixed tick: the sweep, then the visuals. */
  update(dt: number): void {
    this.system.update(dt);
    for (const r of this.launched) {
      r.age += dt;
      if (r.mesh) r.mesh.position.copy(r.origin).addScaledVector(r.dir, r.speed * r.age);
    }
  }

  /** Drops every bolt a shooter has in the air without a hit (the shooter died or despawned). */
  cancelFor(shooter: ActorId): void {
    for (const r of this.launched) if (r.shooter === shooter) this.drop(r);
  }

  /** Drops every bolt silently (a save load). */
  clear(): void {
    this.system.clear(true);
    for (const r of [...this.launched]) this.drop(r);
  }

  dispose(): void {
    this.clear();
  }

  private finished(rec: Launched, move: MoveDef, spec: RangedSpec, damageScale: number, hit: ProjectileHit): void {
    const wasCancelled = rec.cancelled;
    this.drop(rec);
    if (wasCancelled || hit.kind !== 'actor') return;
    this.applyHit(rec, move, spec, damageScale, hit.actorId, hit.point);
  }

  private applyHit(rec: Launched, move: MoveDef, spec: RangedSpec, damageScale: number, targetId: ActorId, point: { x: number; y: number; z: number }): void {
    const apply = this.host.damage.apply;
    if (!apply) return;
    const target = this.host.actors.get(targetId);
    if (!target) return;
    const direction = new THREE.Vector3(rec.dir.x, 0, rec.dir.z);
    if (direction.lengthSq() < 1e-8) direction.set(0, 0, -1);
    direction.normalize();
    const result = apply.call(this.host.damage, {
      attackerId: rec.shooter,
      targetId,
      amount: move.damage * damageScale,
      poise: move.poise,
      kind: 'melee',
      attackId: RANGED_ATTACK_PREFIX + move.id,
      direction,
      unblockable: move.telegraph === 'dodge',
      ...(move.parryable === false ? { parryable: false as const } : {}),
      ...(move.element ? { element: move.element } : {}),
      point: this.tmp.set(point.x, point.y, point.z).clone(),
      ...(spec.pull ? { pull: { distance: spec.pull } } : {}),
    });
    if (!result || result.outcome !== 'hit') return;
    const status = this.host.services.get('status');
    if (!status) return;
    if (spec.root) status.apply(targetId, { id: `${move.id}.root`, kind: 'root', seconds: spec.root, sourceId: rec.shooter });
    if (spec.ignite) status.apply(targetId, { id: GLOB_BURN.id, kind: 'ignite', dps: GLOB_BURN.dps * damageScale, seconds: spec.ignite, sourceId: rec.shooter });
  }

  private drop(rec: Launched): void {
    rec.cancelled = true;
    if (rec.mesh) {
      rec.mesh.removeFromParent();
      rec.mesh.geometry.dispose();
      (rec.mesh.material as THREE.Material).dispose();
      rec.mesh = null;
    }
    this.launched.delete(rec);
  }

  private makeMesh(spec: RangedSpec, dir: THREE.Vector3): THREE.Mesh {
    const look = SHAPE_LOOK[spec.shape];
    const geometry =
      spec.shape === 'harpoon'
        ? new THREE.CylinderGeometry(look.size, look.size, look.length, 6)
        : spec.shape === 'net'
          ? new THREE.CircleGeometry(look.size, 8)
          : new THREE.IcosahedronGeometry(look.size, 0);
    const material = new THREE.MeshStandardMaterial({ color: look.color, emissive: look.emissive, emissiveIntensity: look.emissive ? 0.8 : 0, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = false;
    // Cylinders and discs point along +Y; turn them onto the flight direction.
    if (spec.shape === 'harpoon' || spec.shape === 'net') mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    return mesh;
  }
}
