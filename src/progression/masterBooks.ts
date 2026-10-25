/**
 * K11 (Act 3, Q2): the class masters' books. A master's one-time visit writes `trainer.<classId>.masterBook`; with
 * `story.gate.a3` it opens tiers 4 and 5 of that class (`masterBookGate` in skills.ts). K11 is the only writer of the flag,
 * always through `grantMasterBook`; dialogue and quests call it as the effect `{ grantMasterBook: '<classId>' }`
 * (K5 for Hrolf, K10 for Gaut, Pennard, Gerta and Cenric, K12 for Leofa).
 */
import { masterBookFlag } from './skills';

declare module '../core/events' {
  interface GameEventMap {
    /** A class master's book was given for the first time (never on a repeat grant). */
    'trainer.masterBook': { classId: MasterBookClassId };
  }
}

export const MASTER_BOOK_CLASSES = ['knight', 'warden', 'emberwright', 'ashblade', 'pathfinder'] as const;
export type MasterBookClassId = (typeof MASTER_BOOK_CLASSES)[number];

export const isMasterBookClass = (v: unknown): v is MasterBookClassId =>
  typeof v === 'string' && (MASTER_BOOK_CLASSES as readonly string[]).includes(v);

/**
 * The toast shown on the first grant. Hrolf (K5) can give the Warden's book before Act 3; then the toast says the tiers
 * open in Act 3 instead of "can now be learned", so it never contradicts the menu's `hud.skills.act3` refusal.
 */
export const masterBookToastKey = (classId: MasterBookClassId, act3: boolean): string =>
  `hud.skills.masterBook.${classId}${act3 ? '' : '.early'}`;

export interface MasterBookState {
  getFlag(key: string): unknown;
  setFlag(key: string, value: boolean): void;
}

export interface MasterBookBus {
  emit(type: string, payload?: unknown): void;
}

export type GrantMasterBookResult = { ok: true; granted: boolean } | { ok: false; reason: 'unknown-class' | 'write-failed' };

/**
 * Gives the class master's book. Idempotent: when the flag is already set it writes nothing, emits nothing and returns
 * `granted: false`. It does not check `story.gate.a3`; the dialogue decides when the line is offered, and the skill gate
 * still needs both flags. The flag is read before the write and the events go out only after the write succeeded; a store
 * that throws (an invalid key) yields `write-failed` and no event.
 *
 * The `{ grantMasterBook }` effect is its own effect branch, so it never meets the `{ event }` guard
 * (`EFFECT_EVENT_PATTERN`), and content cannot emit `trainer.masterBook` through `{ event }`: only this function does.
 */
export function grantMasterBook(state: MasterBookState, classId: string, bus?: MasterBookBus | null): GrantMasterBookResult {
  if (!isMasterBookClass(classId)) return { ok: false, reason: 'unknown-class' };
  const flag = masterBookFlag(classId);
  if (state.getFlag(flag) === true) return { ok: true, granted: false };
  try {
    state.setFlag(flag, true);
  } catch {
    return { ok: false, reason: 'write-failed' };
  }
  if (state.getFlag(flag) !== true) return { ok: false, reason: 'write-failed' };
  bus?.emit('trainer.masterBook', { classId });
  bus?.emit('hud.toast', { textKey: masterBookToastKey(classId, state.getFlag('story.gate.a3') === true) });
  return { ok: true, granted: true };
}

/** Whether the class master's book has been given. */
export function hasMasterBook(state: Pick<MasterBookState, 'getFlag'>, classId: string): boolean {
  return isMasterBookClass(classId) && state.getFlag(masterBookFlag(classId)) === true;
}
