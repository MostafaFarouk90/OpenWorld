import type { ActorId } from '../actors/Actor';
import type { GameEvents } from '../core/events';
import type { Persistable } from '../core/Persist';
import {
  BOSS_MERCY_MAX,
  CREATURE_MERCY_CAP,
  FAVOUR_MAX,
  FAVOUR_MIN,
  FAVOUR_START,
  FAVOUR_TRACKS,
  MERCY_TIERS,
  MERCY_VERBS,
  bandFor,
  isFavourTrack,
  type FavourBand,
  type FavourSource,
  type FavourTrack,
  type MercyEvent,
} from './favour';

export type FlagValue = boolean | number | string;

/** Namespaced keys: `tutorial.t04.vow1`, `chest.bakery-barrel.opened`. */
export const FLAG_KEY = /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9_-]+)+$/;

export interface WorldStateData {
  flags: Record<string, FlagValue>;
  favour: Record<FavourTrack, number>;
  creatureMercy: Record<FavourTrack, number>;
  mercyCount: number;
}

export const WORLD_STATE_KEY = 'world-state';
export const WORLD_STATE_VERSION = 1;

interface MercyCredit {
  track: FavourTrack | null;
  applied: number;
  /** Creature credit counts against the per-track cap; boss credit does not. */
  capped: boolean;
}

function isFlagValue(v: unknown): v is FlagValue {
  return typeof v === 'boolean' || typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v));
}

function clampFavour(v: number): number {
  return Math.min(FAVOUR_MAX, Math.max(FAVOUR_MIN, v));
}

/**
 * World-state flag store with favour tracks and the mercy ledger (contracts/game-events-and-flags.md
 * section 5, design section 3 "Favour tracks and mercy").
 */
export class WorldState implements Persistable {
  readonly key = WORLD_STATE_KEY;
  readonly version = WORLD_STATE_VERSION;
  private flags = new Map<string, FlagValue>();
  private readonly favourValues = { ...FAVOUR_START } as Record<FavourTrack, number>;
  private readonly creatureMercy = Object.fromEntries(FAVOUR_TRACKS.map((t) => [t, 0])) as Record<FavourTrack, number>;
  private mercies = 0;
  /** Live credit per mercied actor, until struck (revoked) or despawned. */
  private readonly credits = new Map<ActorId, MercyCredit>();

  constructor(
    private readonly events: GameEvents,
    private readonly warn: (message: string) => void = (m) => console.warn(m),
  ) {}

  // ---- flags ----

  getFlag(key: string): FlagValue | undefined {
    return this.flags.get(key);
  }

  hasFlag(key: string): boolean {
    return this.flags.has(key);
  }

  getBool(key: string, fallback = false): boolean {
    const v = this.flags.get(key);
    return typeof v === 'boolean' ? v : fallback;
  }

  getNumber(key: string, fallback = 0): number {
    const v = this.flags.get(key);
    return typeof v === 'number' ? v : fallback;
  }

  getString(key: string, fallback = ''): string {
    const v = this.flags.get(key);
    return typeof v === 'string' ? v : fallback;
  }

  setFlag(key: string, value: FlagValue): void {
    if (!FLAG_KEY.test(key)) throw new Error(`WorldState: invalid flag key "${key}"`);
    if (!isFlagValue(value)) throw new Error(`WorldState: invalid value for "${key}": ${String(value)}`);
    const previous = this.flags.get(key);
    if (previous === value) return;
    this.flags.set(key, value);
    this.events.emit('flag.changed', { key, value, previous });
  }

  clearFlag(key: string): void {
    if (!this.flags.has(key)) return;
    const previous = this.flags.get(key);
    this.flags.delete(key);
    this.events.emit('flag.changed', { key, value: undefined, previous });
  }

  /** Keys with a prefix, e.g. `flagsWith('chest.')`. */
  flagsWith(prefix: string): string[] {
    return [...this.flags.keys()].filter((k) => k.startsWith(prefix));
  }

  // ---- favour ----

  favour(track: FavourTrack): number {
    return isFavourTrack(track) ? this.favourValues[track] : 0;
  }

  favourBand(track: FavourTrack): FavourBand {
    return bandFor(this.favour(track));
  }

  /** Returns the delta actually applied after clamping to 0..100. */
  addFavour(track: FavourTrack, delta: number, source: FavourSource): number {
    if (!isFavourTrack(track)) {
      this.warn(`WorldState: unknown favour track "${String(track)}"`);
      return 0;
    }
    if (!Number.isFinite(delta)) {
      this.warn(`WorldState: non-finite favour delta for "${track}"`);
      return 0;
    }
    const previous = this.favourValues[track];
    const value = clampFavour(previous + delta);
    const applied = value - previous;
    if (applied === 0) return 0;
    this.favourValues[track] = value;
    this.events.emit('favour.changed', { track, value, previous, delta: applied, source, band: bandFor(value) });
    return applied;
  }

  // ---- mercy ----

  recordMercy(e: MercyEvent): { applied: number; capped: boolean } {
    if (!e || !(MERCY_VERBS as readonly string[]).includes(e.verb) || !(MERCY_TIERS as readonly string[]).includes(e.tier)) {
      this.warn(`WorldState: malformed mercy event ${JSON.stringify(e)}`);
      return { applied: 0, capped: false };
    }
    if (e.track !== null && !isFavourTrack(e.track)) {
      this.warn(`WorldState: mercy for unknown track "${String(e.track)}"`);
      return { applied: 0, capped: false };
    }
    if (e.tier === 'boss') return this.bossMercy(e);

    this.mercies++;
    if (e.track === null) {
      if (e.actorId) this.credits.set(e.actorId, { track: null, applied: 0, capped: true });
      return { applied: 0, capped: false };
    }
    const want = e.tier === 'elite' ? 2 : 1;
    const room = CREATURE_MERCY_CAP - this.creatureMercy[e.track];
    const allowed = Math.max(0, Math.min(want, room));
    const applied = allowed > 0 ? this.addFavour(e.track, allowed, 'mercy') : 0;
    // The cap counts favour actually gained, so mercy at 100 favour does not burn cap room.
    this.creatureMercy[e.track] += applied;
    if (e.actorId) this.credits.set(e.actorId, { track: e.track, applied, capped: true });
    return { applied, capped: allowed < want };
  }

  /** True from a recorded mercy until the actor is struck (revoked) or despawned. */
  isMercied(actorId: ActorId): boolean {
    return this.credits.has(actorId);
  }

  /** Removes the favour that actor's mercy applied and frees the cap room. Returns the favour removed. */
  revokeMercy(actorId: ActorId): number {
    const credit = this.credits.get(actorId);
    if (!credit) return 0;
    this.credits.delete(actorId);
    let removed = 0;
    if (credit.track && credit.applied !== 0) {
      removed = -this.addFavour(credit.track, -credit.applied, 'mercy');
      if (credit.capped) this.creatureMercy[credit.track] = Math.max(0, this.creatureMercy[credit.track] - removed);
    }
    this.events.emit('mercy.revoked', { actorId, track: credit.track, removed });
    return removed;
  }

  /** The actor is gone; its credit can no longer be revoked. */
  forgetMercy(actorId: ActorId): void {
    this.credits.delete(actorId);
  }

  mercyCount(): number {
    return this.mercies;
  }

  creatureMercyFavour(track: FavourTrack): number {
    return this.creatureMercy[track] ?? 0;
  }

  // ---- persistence ----

  serialize(): WorldStateData {
    return {
      flags: Object.fromEntries(this.flags),
      favour: { ...this.favourValues },
      creatureMercy: { ...this.creatureMercy },
      mercyCount: this.mercies,
    };
  }

  /** Replaces all state from `data`; invalid parts are dropped with a warning. Emits no events. */
  load(data: unknown, _version: number = WORLD_STATE_VERSION): void {
    const d = (data ?? {}) as Partial<WorldStateData>;
    const flags = new Map<string, FlagValue>();
    if (d.flags && typeof d.flags === 'object') {
      for (const [k, v] of Object.entries(d.flags)) {
        if (FLAG_KEY.test(k) && isFlagValue(v)) flags.set(k, v);
        else this.warn(`WorldState: dropped invalid saved flag "${k}"`);
      }
    }
    this.flags = flags;
    for (const t of FAVOUR_TRACKS) {
      const v = (d.favour as Record<string, unknown> | undefined)?.[t];
      this.favourValues[t] = typeof v === 'number' && Number.isFinite(v) ? clampFavour(v) : FAVOUR_START[t];
      const m = (d.creatureMercy as Record<string, unknown> | undefined)?.[t];
      this.creatureMercy[t] = typeof m === 'number' && Number.isFinite(m) ? Math.min(CREATURE_MERCY_CAP, Math.max(0, m)) : 0;
    }
    for (const k of Object.keys((d.favour as object) ?? {})) {
      if (!isFavourTrack(k)) this.warn(`WorldState: dropped unknown saved favour track "${k}"`);
    }
    this.mercies = typeof d.mercyCount === 'number' && Number.isFinite(d.mercyCount) ? Math.max(0, Math.floor(d.mercyCount)) : 0;
    this.credits.clear();
  }

  private bossMercy(e: MercyEvent): { applied: number; capped: boolean } {
    const amount = e.amount;
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0 || amount > BOSS_MERCY_MAX) {
      this.warn(`WorldState: boss mercy "${e.creature}" needs an amount from 0 to ${BOSS_MERCY_MAX}`);
      return { applied: 0, capped: false };
    }
    const applied = e.track ? this.addFavour(e.track, amount, 'mercy') : 0;
    if (e.actorId) this.credits.set(e.actorId, { track: e.track, applied, capped: false });
    return { applied, capped: false };
  }
}
