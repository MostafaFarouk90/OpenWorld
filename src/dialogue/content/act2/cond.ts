import type { Condition } from '../../../quests/types';

/** Short forms for dialogue start rules and node conditions. */
export const qActive = (q: string): Condition => ({ quest: q, state: 'active' });
export const qDone = (q: string): Condition => ({ quest: q, state: 'completed' });
export const qIdle = (q: string): Condition => ({ quest: q, state: 'inactive' });
export const objDone = (q: string, o: string): Condition => ({ objective: [q, o], done: true });
export const objOpen = (q: string, o: string): Condition => ({ objective: [q, o], done: false });
export const flagIs = (f: string, v: boolean | number | string = true): Condition => ({ flag: f, equals: v });
export const all = (...c: Condition[]): Condition => ({ all: c });
export const any = (...c: Condition[]): Condition => ({ any: c });
export const not = (c: Condition): Condition => ({ not: c });
/** `a` finished, `b` still open, the quest active: `b` is the current step of a sequential quest. */
export const step = (q: string, prev: string | null, o: string): Condition =>
  prev === null ? all(qActive(q), objOpen(q, o)) : all(qActive(q), objDone(q, prev), objOpen(q, o));
