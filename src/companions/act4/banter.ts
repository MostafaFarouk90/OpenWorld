// Act 4 (L4, plans/act4-L4.md section 1.6): the Ashen Waste bark places, the pools per companion, the event places (a
// storm, the walkers, Ebba, the M37 bond, the mourning) and the mourning swap after M39. The defs (tobb.ts, hrolf.ts,
// aelfreda.ts) spread these in, as they do Act 3's; event places are said through `CompanionController.sayAt`.
import { ACT4_BANTER_TEXT, MOURNING_LINES, act4BarkKey } from './strings.en';

/** Gaut falls in M39 (L10 writes it); from then his lines mourn him. */
export const GAUT_FALLEN_FLAG = 'story.m39.complete';

/** The region id of the Ashen Waste (contracts v0.8 item 1). */
export const WASTE_REGION = 'ashen-waste';

/**
 * Trigger volumes L1 places in the Waste (asked of L1 2026-11-06; a trigger that does not exist yet simply never
 * fires, and the region bark still does).
 */
export const ACT4_TRIGGERS = {
  walkerCamp: 'trg.waste.walker-camp',
  cinderChapel: 'trg.waste.cinder-chapel',
  cathedral: 'trg.waste.husk-cathedral',
  rim: 'trg.waste.rimfoot',
} as const;

/** Places a companion def maps (all prefixed `a4.` so no Act 1 to 3 place id is shadowed). */
export const ACT4_PLACES = {
  triggers: Object.fromEntries(Object.entries(ACT4_TRIGGERS).map(([place, trg]) => [trg, `a4.${place}`])) as Record<string, string>,
  regions: { [WASTE_REGION]: 'a4.waste' } as Record<string, string>,
} as const;

/** Event places (said through `sayAt`), not reached by a trigger or region. */
export const ACT4_EVENT_PLACES = ['a4.storm', 'a4.walkers', 'a4.ebba', 'a4.bond2', 'a4.mourning'] as const;
export type Act4EventPlace = (typeof ACT4_EVENT_PLACES)[number];

/** The Act 4 pools of one companion: place id (`a4.<place>`) to line keys, in order. */
export function act4Pools(companionId: string): Record<string, string[]> {
  const text = ACT4_BANTER_TEXT[companionId] ?? {};
  return Object.fromEntries(Object.entries(text).map(([place, t]) => [`a4.${place}`, t.map((_, i) => act4BarkKey(companionId, place, i + 1))]));
}

/** After Gaut falls a line that names him alive is said in its mourning form; every other line is unchanged. */
export function mourningSwap(lineKey: string, flag: (key: string) => unknown): string {
  const swap = MOURNING_LINES[lineKey];
  return swap && flag(GAUT_FALLEN_FLAG) === true ? swap.key : lineKey;
}

/** Places reached through `sayAt` (the event places) rather than a trigger or region. */
export function isAct4IndirectPool(place: string): boolean {
  return (ACT4_EVENT_PLACES as readonly string[]).includes(place);
}
