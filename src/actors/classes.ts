/**
 * Player class ids (contracts/actors-and-damage.md section 9, v0.5). The class of record is
 * `progression.classId` (thread 2; null reads as `knight`); thread 12 provides the `classes` service.
 */
export const CLASS_IDS = ['knight', 'warden', 'emberwright', 'ashblade', 'pathfinder'] as const;
export type ClassId = (typeof CLASS_IDS)[number];

/** What a save without a chosen class (every Phase A save) plays as. */
export const DEFAULT_CLASS: ClassId = 'knight';

export function isClassId(v: unknown): v is ClassId {
  return typeof v === 'string' && (CLASS_IDS as readonly string[]).includes(v);
}

export type ClassResult =
  | { ok: true }
  | { ok: false; reason: 'same' | 'not-chosen' | 'already-chosen' | 'no-gold' | 'no-permit' | 'combat' | 'unknown' };

/** Provided by thread 12 under `services.provide('classes', …)`. */
export interface ClassesService {
  /** `progression.classId`, with null read as `knight`. */
  current(): ClassId;
  /** False until M07's choice (and in every Phase A save). */
  chosen(): boolean;
  /** M07 only; calls `progression.setClass` and emits `class.chosen`. */
  choose(id: ClassId): ClassResult;
  /** Calls `progression.respec()` first (progression decides free or paid); emits `class.changed`. */
  change(id: ClassId): ClassResult;
}

declare module '../core/Services' {
  interface GameServices {
    classes: ClassesService;
  }
}
