import * as THREE from 'three';
import type { ActorId, ActorsLike, Vec3 } from '../../vfx/ports';
import { BOULDER } from './tuning';

export interface BoulderPorts {
  actors: ActorsLike;
  damage: {
    apply(req: {
      attackerId: ActorId | null;
      targetId: ActorId;
      amount: number;
      poise: number;
      kind: 'melee';
      attackId: string;
      unblockable?: boolean;
      direction?: THREE.Vector3;
    }): unknown;
  };
  feet(): Vec3;
  /** Yaw of the player's facing; the player looks along (-sin yaw, -cos yaw). */
  facingYaw(): number;
  /** Why the charge cannot start right now (dead, staggered, busy, a leap), or null. */
  blockedReason(): string | null;
  /** Plays the shoulder clip; false when the controller refuses it. */
  playClip(clip: string): boolean;
  /** Holds (or releases with null) the scripted move in the combat verbs. */
  hold(move: { x: number; z: number; speed: number } | null): void;
  /** The player was staggered, died or dodged: the charge ends early. */
  interrupted(): boolean;
  /** `ability.used` is the abilities service's; the skill's own trigger report for the codex and prompts. */
  reportTrigger(skillId: string): void;
  skillId: string;
}

/**
 * The Warden's shoulder charge (Stonehide 2): 5 m in 0.35 s along the facing; every hostile within reach of the player on the
 * way takes 6 damage and 40 poise once. Poise 40 passes the heavy-blow threshold, so a raised enemy guard breaks.
 * The move itself is held in the combat verbs (`holdForcedMove`), which re-applies it each tick.
 */
export class BoulderShoulder {
  private left = 0;
  private dir = { x: 0, z: 0 };
  private hit = new Set<ActorId>();

  constructor(private readonly p: BoulderPorts, private readonly playerId: () => ActorId) {}

  get charging(): boolean {
    return this.left > 0;
  }

  /** The ability handler body. Ember and the cooldown belong to the abilities service, which charges them only on ok. */
  start(): { ok: true } | { ok: false; reason: string } {
    if (this.left > 0) return { ok: false, reason: 'charging' };
    const blocked = this.p.blockedReason();
    if (blocked) return { ok: false, reason: blocked };
    if (!this.p.playClip(BOULDER.clip)) return { ok: false, reason: 'busy' };
    const yaw = this.p.facingYaw();
    this.dir = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
    this.left = BOULDER.ticks;
    this.hit.clear();
    this.p.hold({ x: this.dir.x, z: this.dir.z, speed: BOULDER.distance / (BOULDER.ticks / 60) });
    this.p.reportTrigger(this.p.skillId);
    return { ok: true };
  }

  /** Once per fixed tick after the verbs have run. */
  tick(): void {
    if (this.left <= 0) return;
    if (this.p.interrupted()) return this.end();
    this.left--;
    const feet = this.p.feet();
    for (const a of this.p.actors.all()) {
      if (a.team !== 'hostile' || a.dead || !a.hittable || this.hit.has(a.id)) continue;
      const pos = a.worldPosition(SCRATCH);
      const dx = pos.x - feet.x;
      const dz = pos.z - feet.z;
      const d = Math.hypot(dx, dz);
      if (d > BOULDER.hitRadius) continue;
      // Only what is ahead: a target the player has already run past is not hit again by the tail of the charge.
      if (d > 1e-6 && (dx * this.dir.x + dz * this.dir.z) / d < 0) continue;
      this.hit.add(a.id);
      this.p.damage.apply({
        attackerId: this.playerId(),
        targetId: a.id,
        amount: BOULDER.damage,
        poise: BOULDER.poise,
        kind: 'melee',
        attackId: BOULDER.attackId,
        unblockable: true,
        direction: new THREE.Vector3(this.dir.x, 0, this.dir.z),
      });
    }
    if (this.left <= 0) this.end();
  }

  /** Ends the charge at once (respec, class change, load, dispose). */
  cancel(): void {
    this.end();
  }

  private end(): void {
    this.left = 0;
    this.hit.clear();
    this.p.hold(null);
  }
}

const SCRATCH = new THREE.Vector3();
