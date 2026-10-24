// v0.6 `allyMayEngage` (actors-and-damage.md section 11): companions only pick a target that is already fighting the
// player or an ally, so a beast the player means to Calm before its pounce is never provoked by a companion.
import type { GameEvents } from '../core/events';
import type { ActorId } from './Actor';
import type { ActorRegistry } from './ActorRegistry';
import { mercyStateOf } from './DamageResolver';

export interface AllyEngagementService {
  /** True only while `targetId` is alive, in no mercy state and aggroed on the player or an ally. */
  mayEngage(targetId: ActorId): boolean;
  /** Keeps allies off `targetId` (a trial opponent that only Cael may fight) until the returned function is called. */
  exclude?(targetId: ActorId): () => void;
}

export class AllyEngagement implements AllyEngagementService {
  /** Enemy actor id to the actor it is aggroed on (the latest `ai.aggro`). */
  private readonly aggro = new Map<ActorId, ActorId>();
  private readonly excluded = new Map<ActorId, number>();
  private readonly offs: (() => void)[];

  constructor(
    events: GameEvents,
    private readonly actors: ActorRegistry,
  ) {
    const forget = (p: { actorId: ActorId }) => void this.aggro.delete(p.actorId);
    this.offs = [
      events.on('ai.aggro', (p) => void this.aggro.set(p.actorId, p.targetId)),
      events.on('ai.calm', forget),
      events.on('actor.died', forget),
      events.on('actor.despawned', forget),
    ];
  }

  exclude(targetId: ActorId): () => void {
    this.excluded.set(targetId, (this.excluded.get(targetId) ?? 0) + 1);
    let done = false;
    return () => {
      if (done) return;
      done = true;
      const n = (this.excluded.get(targetId) ?? 1) - 1;
      if (n <= 0) this.excluded.delete(targetId);
      else this.excluded.set(targetId, n);
    };
  }

  mayEngage(targetId: ActorId): boolean {
    if (this.excluded.has(targetId)) return false;
    const target = this.actors.get(targetId);
    if (!target || target.dead || mercyStateOf(target) !== 'none') return false;
    const on = this.aggro.get(targetId);
    const team = on ? this.actors.get(on)?.team : undefined;
    return team === 'player' || team === 'ally';
  }

  dispose(): void {
    for (const off of this.offs.splice(0)) off();
    this.aggro.clear();
    this.excluded.clear();
  }
}
