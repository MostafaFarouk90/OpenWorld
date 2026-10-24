// What the Cinderreach director's installers share: typed access to the flags, the services and the event bus, so each
// quest's rules read as a short list of "when X happens, do Y". Installers return their unsubscribes.
import type { GameContext } from '../../../../core/Game';
import type { GameEventMap } from '../../../../core/events';
import type { FavourTrack } from '../../../../state/favour';
import type { QuestState } from '../../../types';

export type Off = () => void;

export interface Kit {
  ctx: GameContext;
  flag(key: string): boolean;
  str(key: string): string;
  num(key: string): number;
  set(key: string, value?: boolean | number | string): void;
  clear(key: string): void;
  qstate(id: string): QuestState;
  active(id: string): boolean;
  objDone(q: string, o: string): boolean;
  objCurrent(q: string, o: string): boolean;
  progress(q: string, o: string): number;
  /** A story event the dialogue effects or this director raise; the payload is empty. */
  emit(name: string): void;
  /** Listens to every event with this name (story events are not in the typed map). */
  onNamed(name: string, fn: (payload: unknown) => void): Off;
  /** Listens to a typed event. */
  on<K extends keyof GameEventMap>(type: K, fn: (payload: GameEventMap[K]) => void): Off;
  favour(track: FavourTrack, delta: number): void;
  /** Runs `fn` once from the next fixed tick (a listener must not start a dialogue or a spawn from inside a flush). */
  later(fn: () => void): void;
  /** Runs `fn` once, `ticks` fixed ticks from now. */
  after(ticks: number, fn: () => void): void;
  /** Runs `fn` every `everyTicks` fixed ticks. */
  every(everyTicks: number, fn: () => void): Off;
  /**
   * The spawner group's members still standing: `enemies.alive` keeps a member until its death animation has finished, and
   * a released or spared one until it has dissolved or walked off. Neither counts (review-a #3).
   */
  standing(spawnerId: string): string[];
  /**
   * Runs `fn` whenever a member may have left a group without dying where the caller can see it: an accepted mercy, a
   * despawn, or A2's group-cleared (a dissolve or walk-off that ended). The caller re-checks its group from `later`.
   */
  onMemberLeft(fn: () => void): Off;
  warn(message: string): void;
}

export function makeKit(ctx: GameContext, warn: (m: string) => void, offs: Off[]): { kit: Kit; tick(): void } {
  const pending: Array<() => void> = [];
  const delayed: { left: number; fn: () => void }[] = [];
  const timers: { every: number; n: number; fn: () => void; live: boolean }[] = [];
  const quests = () => ctx.services.get('quests');
  // Fallback for tests that boot without core (the shared `groupStanding` service is used when present).
  // Actors whose mercy was accepted and not revoked: they are leaving, whatever `enemies.alive` says while they go.
  const mercied = new Set<string>();
  offs.push(
    ctx.events.on('mercy', (e) => void (e.actorId && mercied.add(e.actorId))),
    ctx.events.on('mercy.revoked', (e) => void mercied.delete(e.actorId)),
    ctx.events.on('actor.despawned', (e) => void mercied.delete(e.actorId)),
    ctx.events.on('save.loaded', () => {
      mercied.clear();
      // A load replaces the world: a queued callback was written for the world that is gone (review R1-1). The installers'
      // own save.loaded listeners run after this one and queue what the loaded world needs.
      pending.length = 0;
      delayed.length = 0;
    }),
  );
  const kit: Kit = {
    ctx,
    flag: (k) => ctx.state.getBool(k),
    str: (k) => ctx.state.getString(k),
    num: (k) => ctx.state.getNumber(k),
    set: (k, v = true) => ctx.state.setFlag(k, v),
    clear: (k) => ctx.state.clearFlag(k),
    qstate: (id) => quests()?.state(id) ?? 'inactive',
    active: (id) => (quests()?.state(id) ?? 'inactive') === 'active',
    objDone: (q, o) => quests()?.objectiveDone(q, o) ?? false,
    objCurrent: (q, o) => quests()?.isObjectiveCurrent(q, o) ?? false,
    progress: (q, o) => quests()?.objectives(q).find((v) => v.def.id === o)?.progress ?? 0,
    emit: (name) => ctx.events.emit(name as keyof GameEventMap, {} as never),
    onNamed(name, fn) {
      const off = ctx.events.onAny((type, payload) => {
        if ((type as string) === name) fn(payload);
      });
      offs.push(off);
      return off;
    },
    on(type, fn) {
      const off = ctx.events.on(type, fn);
      offs.push(off);
      return off;
    },
    favour: (track, delta) => void ctx.state.addFavour(track, delta, 'quest'),
    later: (fn) => void pending.push(fn),
    after(ticks, fn) {
      const t = { left: Math.max(1, ticks), fn };
      delayed.push(t);
    },
    every(everyTicks, fn) {
      const t = { every: Math.max(1, everyTicks), n: 0, fn, live: true };
      timers.push(t);
      const off = () => void (t.live = false);
      offs.push(off);
      return off;
    },
    standing: (id) => {
      const shared = ctx.services.get('groupStanding');
      if (shared) return shared.standing(id);
      return (ctx.services.get('enemies')?.alive(id) ?? []).filter(
        (a) => !mercied.has(a) && !(ctx as { actors?: { get(id: string): { dead?: boolean } | undefined } }).actors?.get(a)?.dead,
      );
    },
    onMemberLeft(fn) {
      const shared = ctx.services.get('groupStanding');
      if (shared) {
        const off = shared.onMemberLeft(fn);
        offs.push(off);
        return off;
      }
      const own = [
        ctx.events.on('mercy', () => fn()),
        ctx.events.on('actor.despawned', () => fn()),
        ctx.events.on('enemies.groupCleared', () => fn()),
      ];
      const off = () => own.forEach((o) => o());
      offs.push(off);
      return off;
    },
    warn,
  };
  const tick = (): void => {
    for (const fn of pending.splice(0)) {
      try { fn(); } catch (e) { warn(`cinderreach director: ${String(e)}`); }
    }
    for (let i = delayed.length - 1; i >= 0; i--) {
      if (--delayed[i].left > 0) continue;
      const [d] = delayed.splice(i, 1);
      try { d.fn(); } catch (e) { warn(`cinderreach director: ${String(e)}`); }
    }
    for (const t of timers) {
      if (!t.live || ++t.n < t.every) continue;
      t.n = 0;
      try { t.fn(); } catch (e) { warn(`cinderreach director: ${String(e)}`); }
    }
  };
  return { kit, tick };
}
