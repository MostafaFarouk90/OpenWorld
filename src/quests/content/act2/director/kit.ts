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
  /** The spawner group's members still standing: `enemies.alive` keeps a member until its death animation has finished. */
  standing(spawnerId: string): string[];
  warn(message: string): void;
}

export function makeKit(ctx: GameContext, warn: (m: string) => void, offs: Off[]): { kit: Kit; tick(): void } {
  const pending: Array<() => void> = [];
  const delayed: { left: number; fn: () => void }[] = [];
  const timers: { every: number; n: number; fn: () => void; live: boolean }[] = [];
  const quests = () => ctx.services.get('quests');
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
    standing: (id) => (ctx.services.get('enemies')?.alive(id) ?? []).filter((a) => !(ctx as { actors?: { get(id: string): { dead?: boolean } | undefined } }).actors?.get(a)?.dead),
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
