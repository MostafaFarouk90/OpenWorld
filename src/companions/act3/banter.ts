// Act 3 (K5): the Greyfen and Dragonspine bark places, the pools per companion, and the reveal variant. The defs
// (tobb.ts, hrolf.ts, aelfreda.ts) spread these in; event barks (trial, reveal, ferry) go through `sayAt` (eventBarks.ts).
import { ACT3_BANTER_TEXT, act3BarkKey } from './strings.en';

/** The flag after which Dragonspine places speak of the dragons as keepers (M32, "Ysmeryth Speaks"; K13 writes it). */
export const REVEAL_FLAG = 'story.m32.complete';

/** Area places (trigger, interior and region ids from K3, K4 and the region mask). The M27 blinds stay silent (stealth). */
export const ACT3_PLACES = {
  triggers: {
    'trg.greyfen.mere.first-sight': 'mere',
    'trg.dragonspine.lodge': 'lodge',
    'trg.dragonspine.shelter': 'shelter',
    'trg.dragonspine.anvil': 'anvil',
    'trg.dragonspine.hawkcliffs.camp': 'hawkCliffs',
    'trg.dragonspine.cave.mouth': 'cave',
    'trg.dragonspine.m28.crag': 'crag',
  },
  // Interior ids from K3 (hutInterior.ts, chapelInterior.ts) and K4 (wyrmwatchHall.ts).
  interiors: { 'greyfen-hut': 'hut', 'greyfen-chapel': 'chapel', 'wyrmwatch-hall': 'hall' },
  regions: { greyfen: 'greyfen', dragonspine: 'dragonspine' },
} as const satisfies { triggers: Record<string, string>; interiors: Record<string, string>; regions: Record<string, string> };

/** Where a companion arrives inside those interiors when no spot on the grid is found (the doors' inside anchors). */
export const ACT3_INTERIOR_ENTRY = {
  'greyfen-hut': 'greyfen.hut.entry',
  'greyfen-chapel': 'greyfen.chapel.entry',
  'wyrmwatch-hall': 'dragonspine.hall.inside',
} as const;

/** Places with a post-reveal pool (`<place>.after`). */
export const REVEAL_PLACES: readonly string[] = ['dragonspine', 'lodge', 'anvil'];

/** Event places (said through `CompanionController.sayAt`). */
export const ACT3_EVENT_PLACES = ['trial.start', 'trial.break', 'trial.won', 'trial.lost', 'reveal', 'ferry'] as const;

/** The Act 3 pools of one companion: place id to line keys, in order. */
export function act3Pools(companionId: string): Record<string, string[]> {
  const text = ACT3_BANTER_TEXT[companionId] ?? {};
  return Object.fromEntries(
    Object.entries(text).map(([place, t]) => [place, t.map((_, i) => act3BarkKey(companionId, place, i + 1))]),
  );
}

/** Pools no place maps to directly: the event places and the post-reveal variants (reached through `act3Variant`). */
export function isAct3IndirectPool(place: string): boolean {
  return (ACT3_EVENT_PLACES as readonly string[]).includes(place) || REVEAL_PLACES.some((p) => place === `${p}.after`);
}

/** After the reveal a Dragonspine place uses its `.after` pool; every other place is unchanged. */
export function act3Variant(place: string, flag: (key: string) => unknown): string {
  return REVEAL_PLACES.includes(place) && flag(REVEAL_FLAG) === true ? `${place}.after` : place;
}
