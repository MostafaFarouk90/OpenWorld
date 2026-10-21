// v0.6 pull (actors-and-damage.md section 11): a hit with `pull` moves its target up to `distance` toward the attacker
// over PULL_SECONDS. This is the player's half; the enemy mover applies its own (Enemy.pulledToward).
import type { ActorId } from './Actor';

export const PULL_SECONDS = 0.25;
/** The pulled actor stops this far short of the source's root (never pulled into it). */
export const PULL_STOP_SHORT = 1;
/** A step down greater than this ends the pull at the ledge. */
export const PULL_MAX_DROP = 1;

export interface PullPorts {
  playerId(): ActorId;
  /** True while the player has i-frames (a dodge, Ash-drift): the pull is ignored. */
  invulnerable(): boolean;
  playerFeet(): { x: number; y: number; z: number };
  /** The source actor's root, or null when it is gone. */
  sourcePosition(id: ActorId): { x: number; z: number } | null;
  heightAt(x: number, z: number): number;
  /** The combat verbs' held forced move (walls stop it: it goes through the controller). */
  hold(move: { x: number; z: number; speed: number } | null): void;
}

export class PlayerPull {
  private active: { x: number; z: number; speed: number; ticks: number } | null = null;

  constructor(
    private readonly ports: PullPorts,
    private readonly fixedStep: number,
  ) {}

  get pulling(): boolean {
    return this.active !== null;
  }

  /** `actor.pulled`. */
  onPulled(e: { actorId: ActorId; fromId: ActorId; distance: number }): void {
    if (e.actorId !== this.ports.playerId() || !(e.distance > 0) || this.ports.invulnerable()) return;
    const src = this.ports.sourcePosition(e.fromId);
    if (!src) return;
    const f = this.ports.playerFeet();
    const dx = src.x - f.x;
    const dz = src.z - f.z;
    const len = Math.hypot(dx, dz);
    const metres = Math.min(e.distance, len - PULL_STOP_SHORT);
    if (!(metres > 0) || !(len > 1e-6)) return;
    const ticks = Math.max(1, Math.round(PULL_SECONDS / this.fixedStep));
    this.active = { x: dx / len, z: dz / len, speed: metres / (ticks * this.fixedStep), ticks };
  }

  /** Each fixed tick, before the verbs apply their movement. */
  fixedUpdate(): void {
    const a = this.active;
    if (!a) return;
    const f = this.ports.playerFeet();
    const step = a.speed * this.fixedStep;
    const ahead = this.ports.heightAt(f.x + a.x * step, f.z + a.z * step);
    if (a.ticks <= 0 || this.ports.invulnerable() || this.ports.heightAt(f.x, f.z) - ahead > PULL_MAX_DROP) {
      this.stop();
      return;
    }
    this.ports.hold({ x: a.x, z: a.z, speed: a.speed });
    a.ticks--;
  }

  stop(): void {
    if (!this.active) return;
    this.active = null;
    this.ports.hold(null);
  }
}
