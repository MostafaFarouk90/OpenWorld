import type { EnemyHost } from '../ports';
import type { ActorId } from '../ports';
import type { MoveDef } from '../types';
import { areaHit } from './areaHit';
import { EnemyProjectiles, type Shooter } from './EnemyProjectiles';

/**
 * What an enemy move does when its window opens besides the tracer: fire a projectile (`move.ranged`) or hit the circle on
 * the ground (`move.area`). One per manager; `Enemy` calls `windowOpened`, the manager ticks `update`.
 */
export class GroundAttacks {
  readonly projectiles: EnemyProjectiles;

  constructor(private readonly host: EnemyHost) {
    this.projectiles = new EnemyProjectiles(host);
  }

  /** `aim` is where the shooter's target stands (a taunter's feet); absent means the player. */
  windowOpened(shooter: Shooter, move: MoveDef, aim?: { x: number; y: number; z: number }): void {
    if (move.ranged) this.projectiles.fire(shooter, move, aim ?? this.host.player.feet);
    if (move.area) areaHit(this.host, shooter, move);
  }

  /** Applies a move's `area` now (the crawler's landing): once, to the player if inside. */
  hitArea(shooter: Shooter, move: MoveDef): boolean {
    return areaHit(this.host, shooter, move);
  }

  update(dt: number): void {
    this.projectiles.update(dt);
  }

  /** A shooter is gone: its bolts in the air vanish. */
  shooterGone(id: ActorId): void {
    this.projectiles.cancelFor(id);
  }

  /** A save load drops every bolt without a hit. */
  clear(): void {
    this.projectiles.clear();
  }

  dispose(): void {
    this.projectiles.dispose();
  }
}
