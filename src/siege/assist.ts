// Kill credit in the siege (Q4, plans/act5-N4.md section 7): only a foe Cael damaged in the last 8 s pays Cael. Allies,
// dragons and the sally may land the blow; when Cael assisted, the foe is held at 1 health and killed for the player on
// the next tick, so the shipped Progression.onKill pays and every counter sees a player kill. Otherwise it dies as an
// ally kill and pays nothing (the shipped rule).
import type { ActorId } from '../actors/Actor';
import type { GameContext } from '../core/Game';
import { ASSIST_WINDOW_S } from './tuning';

export type AssistHost = Pick<GameContext, 'actors' | 'damage' | 'events'>;

export class AssistRule {
  private readonly lastHit = new Map<ActorId, number>();
  private readonly queue: ActorId[] = [];
  private readonly forPlayer = new Set<ActorId>();
  private now = 0;
  private readonly offs: Array<() => void> = [];

  constructor(
    private readonly host: AssistHost,
    opts: { handlerId: string; isSiegeFoe(id: ActorId): boolean },
  ) {
    const playerId = host.actors.player.id;
    this.offs.push(
      host.events.on('damage.dealt', (r) => {
        if (r.attackerId === playerId && r.dealt > 0 && opts.isSiegeFoe(r.targetId)) this.lastHit.set(r.targetId, this.now);
      }),
      host.events.on('actor.died', (p) => void this.lastHit.delete(p.actorId)),
      host.events.on('actor.despawned', (p) => void this.lastHit.delete(p.actorId)),
      host.damage.addLethalHandler(opts.handlerId, (target, r) => {
        if (this.forPlayer.has(target.id)) return false; // our own deferred kill
        if (r.attackerId === playerId || !opts.isSiegeFoe(target.id)) return false;
        if (!this.assisted(target.id)) return false; // an ally kill: no XP
        target.health = Math.min(1, target.maxHealth);
        if (!this.queue.includes(target.id)) this.queue.push(target.id);
        return true;
      }),
    );
  }

  /** Siege clock seconds (the runner advances it). */
  get time(): number {
    return this.now;
  }

  /** Cael damaged `id` within the assist window. */
  assisted(id: ActorId): boolean {
    const t = this.lastHit.get(id);
    return t !== undefined && this.now - t <= ASSIST_WINDOW_S + 1e-9;
  }

  /** Seconds since Cael last hit `id` (Infinity when never). */
  sinceCael(id: ActorId): number {
    const t = this.lastHit.get(id);
    return t === undefined ? Infinity : this.now - t;
  }

  fixedUpdate(dt: number): void {
    this.now += dt;
    while (this.queue.length > 0) {
      const id = this.queue.shift()!;
      const a = this.host.actors.get(id);
      if (!a || a.dead) continue;
      this.forPlayer.add(id);
      try {
        this.host.damage.kill(id, this.host.actors.player.id);
      } finally {
        this.forPlayer.delete(id);
      }
    }
  }

  dispose(): void {
    for (const off of this.offs.splice(0)) off();
    this.lastHit.clear();
    this.queue.length = 0;
  }
}
