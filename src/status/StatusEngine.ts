import type { ActorId, Team } from '../actors/Actor';
import type { DamageRequest } from '../actors/DamageResolver';
import type { StatusEntry, StatusKind, StatusSpec } from '../actors/status';
import { STATUS } from './tuning';
import type { ActorStatusView } from './view';

/** The slice of the game the engine needs; the plugin fills it from the real context. */
export interface StatusPorts {
  actor(id: ActorId): { readonly dead: boolean; readonly hittable: boolean; readonly invulnerable?: boolean; readonly team: Team } | undefined;
  /** Applies a tick; returns false when the request was dropped. */
  tick(req: DamageRequest): boolean;
  applied(actorId: ActorId, id: string, kind: StatusKind): void;
  expired(actorId: ActorId, id: string, kind: StatusKind): void;
  /** The actor's effective stun and slow changed, or their remaining times moved. */
  view(actorId: ActorId, view: ActorStatusView | null): void;
}

interface Entry extends StatusEntry {
  dps: number;
  slow: number;
  /** Seconds until the next tick (bleed and ignite). */
  untilTick: number;
  /** The source was on the player's side when applied; a mercy on the target clears these. */
  playerSourced: boolean;
}

const KINDS: readonly StatusKind[] = ['bleed', 'ignite', 'stun', 'slow'];

/**
 * Pure bookkeeping for status effects: validation, refresh, strongest-wins, ticks and expiry. It owns no
 * game state beyond its entries; every effect on the world goes through `StatusPorts`.
 */
export class StatusEngine {
  private readonly entries = new Map<ActorId, Entry[]>();

  constructor(private readonly ports: StatusPorts) {}

  apply(actorId: ActorId, spec: StatusSpec): boolean {
    if (!spec || typeof spec.id !== 'string' || spec.id === '' || !KINDS.includes(spec.kind)) return false;
    if (!Number.isFinite(spec.seconds) || spec.seconds <= 0) return false;
    const dps = spec.dps ?? 0;
    if (!Number.isFinite(dps) || dps < 0) return false;
    let slow = 0;
    if (spec.kind === 'slow') {
      if (spec.slow === undefined || !Number.isFinite(spec.slow) || spec.slow <= 0) return false;
      slow = Math.min(STATUS.maxSlow, spec.slow);
    }
    const actor = this.ports.actor(actorId);
    // An immune actor (a boss in an invulnerable phase) refuses; the player's i-frames do not, since ticks ignore a dodge.
    if (!actor || actor.dead || !actor.hittable || (actor.invulnerable && actor.team !== 'player')) return false;

    const list = this.entries.get(actorId) ?? [];
    const sourceId = spec.sourceId ?? null;
    const source = sourceId ? this.ports.actor(sourceId) : undefined;
    const playerSourced = source?.team === 'player' || source?.team === 'ally';
    const existing = list.find((e) => e.id === spec.id);
    if (existing) {
      // Same id: refresh to the longer remaining time; dps and slow never stack, the stronger one is kept.
      existing.remaining = Math.max(existing.remaining, spec.seconds);
      existing.dps = Math.max(existing.dps, dps);
      existing.slow = Math.max(existing.slow, slow);
      existing.sourceId = sourceId;
      existing.playerSourced = playerSourced;
      this.publish(actorId);
      return true;
    }
    if (list.length >= STATUS.maxEntriesPerActor) return false;
    list.push({
      id: spec.id, kind: spec.kind, remaining: spec.seconds, sourceId,
      dps, slow, untilTick: STATUS.tickSeconds, playerSourced,
    });
    this.entries.set(actorId, list);
    this.ports.applied(actorId, spec.id, spec.kind);
    this.publish(actorId);
    return true;
  }

  clear(actorId: ActorId, id?: string): void {
    this.remove(actorId, (e) => id === undefined || e.id === id);
  }

  /** Death, despawn and load. */
  clearAll(): void {
    for (const actorId of [...this.entries.keys()]) this.clear(actorId);
  }

  /** A mercy on the actor ends the statuses the player's side put on it. */
  clearPlayerSourced(actorId: ActorId): void {
    this.remove(actorId, (e) => e.playerSourced);
  }

  has(actorId: ActorId, kind: StatusKind): boolean {
    return (this.entries.get(actorId) ?? []).some((e) => e.kind === kind);
  }

  list(actorId: ActorId): readonly StatusEntry[] {
    return (this.entries.get(actorId) ?? []).map((e) => ({ id: e.id, kind: e.kind, remaining: e.remaining, sourceId: e.sourceId }));
  }

  /** The strongest stun and slow in effect on the actor. */
  view(actorId: ActorId): ActorStatusView {
    const view: ActorStatusView = { stunned: false, stunRemaining: 0, slow: 0 };
    for (const e of this.entries.get(actorId) ?? []) {
      if (e.kind === 'stun') {
        view.stunned = true;
        view.stunRemaining = Math.max(view.stunRemaining, e.remaining);
      } else if (e.kind === 'slow') view.slow = Math.max(view.slow, e.slow);
    }
    return view;
  }

  get actorCount(): number {
    return this.entries.size;
  }

  update(dt: number): void {
    for (const actorId of [...this.entries.keys()]) {
      const actor = this.ports.actor(actorId);
      if (!actor || actor.dead) {
        this.clear(actorId);
        continue;
      }
      const list = this.entries.get(actorId);
      if (!list) continue;
      for (const e of [...list]) {
        // A tick's damage can end entries (a mercy, a death) while we iterate.
        if (!this.entries.get(actorId)?.includes(e)) continue;
        e.remaining -= dt;
        if (e.kind === 'bleed' || e.kind === 'ignite') {
          e.untilTick -= dt;
          // A tick that falls due inside the last partial second is lost, so a 2.5 s bleed ticks twice.
          if (e.untilTick <= STATUS.epsilon && e.remaining >= -STATUS.epsilon) {
            e.untilTick += STATUS.tickSeconds;
            if (e.dps > 0) this.tickOne(actorId, e);
          }
        }
      }
      if (!this.entries.has(actorId)) continue;
      this.remove(actorId, (e) => e.remaining <= STATUS.epsilon);
      if (this.entries.has(actorId)) this.publish(actorId);
    }
  }

  private tickOne(actorId: ActorId, e: Entry): void {
    const ok = this.ports.tick({
      attackerId: e.sourceId, targetId: actorId, amount: e.dps, poise: 0, kind: 'status',
      statusId: e.id, statusKind: e.kind, unblockable: true,
    });
    // A dropped tick on a living target (the team rule, a source that cannot hurt it) would repeat forever.
    const actor = this.ports.actor(actorId);
    if (!ok && actor && !actor.dead) e.remaining = 0;
  }

  private remove(actorId: ActorId, pick: (e: Entry) => boolean): void {
    const list = this.entries.get(actorId);
    if (!list) return;
    const gone = list.filter(pick);
    if (gone.length === 0) return;
    const keep = list.filter((e) => !pick(e));
    if (keep.length > 0) this.entries.set(actorId, keep);
    else this.entries.delete(actorId);
    for (const e of gone) this.ports.expired(actorId, e.id, e.kind);
    this.publish(actorId);
  }

  private publish(actorId: ActorId): void {
    this.ports.view(actorId, this.entries.has(actorId) ? this.view(actorId) : null);
  }
}
