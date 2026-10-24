// The shared group-cleared helper (contracts v0.7 item 15, the Act 2 lesson of PR #130): whether a spawner group still
// has members standing. `enemies.alive` keeps a member until its death animation ends, and a mercied one (spared,
// calmed, released, or spared after a yield) until it has dissolved or walked off; neither counts as standing. A member
// that yields and is not yet spared still stands (it resumes the fight if the player walks away). Every Act 3 group,
// wave and ambush check uses it; the Cinderreach director kit reads it too. Core provides it as `groupStanding`.
import type { ActorId } from '../actors/Actor';
import type { GameEventMap } from '../core/events';
import './events';

export interface GroupStandingPorts {
  /** `enemies.alive(spawnerId)`: the members still registered in the group. */
  alive(spawnerId: string): readonly ActorId[];
  /** True once the actor is dead (its death animation may still play). */
  isDead(actorId: ActorId): boolean;
  on<K extends keyof GameEventMap>(type: K, fn: (payload: GameEventMap[K]) => void): () => void;
}

export interface GroupStandingService {
  /** The members of `spawnerId` still standing (alive, not dead, not mercied). */
  standing(spawnerId: string): ActorId[];
  /** True when no member stands (an unknown or empty group is cleared). */
  isCleared(spawnerId: string): boolean;
  /** True while the actor's mercy is accepted and not revoked. */
  isMercied(actorId: ActorId): boolean;
  /**
   * Runs `fn` whenever a member may have left a group without dying where the caller can see it: an accepted mercy, a
   * despawn, or a group-cleared. Callers re-check their group (from a later tick when they start dialogue or spawns).
   */
  onMemberLeft(fn: () => void): () => void;
}

export class GroupStanding implements GroupStandingService {
  private readonly mercied = new Set<ActorId>();
  private readonly offs: (() => void)[] = [];

  constructor(private readonly ports: GroupStandingPorts) {
    this.offs.push(
      ports.on('mercy', (e) => void (e.actorId && this.mercied.add(e.actorId))),
      ports.on('mercy.revoked', (e) => void this.mercied.delete(e.actorId)),
      ports.on('actor.despawned', (e) => void this.mercied.delete(e.actorId)),
      ports.on('save.loaded', () => this.mercied.clear()),
    );
  }

  standing(spawnerId: string): ActorId[] {
    return this.ports.alive(spawnerId).filter((a) => !this.mercied.has(a) && !this.ports.isDead(a));
  }

  isCleared(spawnerId: string): boolean {
    return this.standing(spawnerId).length === 0;
  }

  isMercied(actorId: ActorId): boolean {
    return this.mercied.has(actorId);
  }

  onMemberLeft(fn: () => void): () => void {
    const own = [this.ports.on('mercy', () => fn()), this.ports.on('actor.despawned', () => fn()), this.ports.on('enemies.groupCleared', () => fn())];
    return () => own.forEach((o) => o());
  }

  dispose(): void {
    for (const off of this.offs.splice(0)) off();
  }
}
