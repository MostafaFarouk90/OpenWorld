import type { Condition, ObjectiveDef } from '../../types';

/** An `event` objective counting distinct `use:` interactions (Act 1's "search" beats: M02 rubble, M09 invoices). */
export function interacts(id: string, textKey: string, interactableIds: readonly string[], extra: Partial<ObjectiveDef> = {}): ObjectiveDef {
  return {
    id, type: 'event', target: 'interact', match: { interactableId: [...interactableIds] }, dedupeBy: 'interactableId',
    required: interactableIds.length, textKey, ...extra,
  };
}

/** An `event` objective the director or a dialogue effect raises (`story.<quest>.<what>`). */
export function story(id: string, textKey: string, eventName: string | string[], extra: Partial<ObjectiveDef> = {}): ObjectiveDef {
  return { id, type: 'event', target: eventName, textKey, ...extra };
}

/** Every listed flag is true. */
export const flagsAll = (flags: readonly string[]): Condition => ({ all: flags.map((f) => ({ flag: f, equals: true })) });

export const nums = (prefix: string, n: number): string[] => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);

/** An `event` objective counting distinct readable notes read to the end (`dialogue.ended`, npc id = note id). */
export function reads(id: string, textKey: string, noteIds: readonly string[], extra: Partial<ObjectiveDef> = {}): ObjectiveDef {
  return {
    id, type: 'event', target: 'dialogue.ended', match: { npcId: [...noteIds], reason: 'completed' }, dedupeBy: 'npcId',
    required: noteIds.length, textKey, ...extra,
  };
}
