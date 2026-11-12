// Interactable props of the Waste quests; each is live only while its objective is current. Prompt keys are
// `quest.prompt.a4w.<name>`, so they never share a key with another block's table.
import type { QuestPropSpec } from '../../../props';
import { W } from './ids';
import { L1 } from './siteIds';
import { M42_FLAP, M42_FLAP_USED } from './m42.quest';
import { M43_BLOOM, M43_BLOOM_BURNED, M43_COUNT, M43_KNOT, M43_KNOTS, M43_TORCH } from './m43.quest';
import { M44_BOX, M44_BOX_FLAG } from './m44.quest';
import { R25_LIGHT, R25_LIT, R25_NO_CANDLE } from './r25.quest';
import { R24_BRAKE, R24_BRAKED, R24_LOAD, R24_LOADED, R24_UNLOAD, R24_UNLOADED } from './r24.quest';
import { M46_LIGHT, M46_LIT } from './m46.quest';

/** The torch is lit at the camp fire (the Blightbloom path of the Pyre Rite). */
export const M43_TORCH_LIT = 'story.m43.torchLit';
/** The cart stands at R24's shelter n with its storm blowing (the brake is set then). */
export const R24_AT_SHELTER = (n: 1 | 2): string => `story.r24.atShelter${n}`;

const p = (name: string, interactableId: string, anchorId: string, objective: [string, string], usedFlag: string, extra: Partial<QuestPropSpec> = {}): QuestPropSpec =>
  ({ interactableId, anchorId, promptKey: `quest.prompt.a4w.${name}`, objective, usedFlag, priority: 1, ...extra });

export const WASTE_A4_PROPS: QuestPropSpec[] = [
  // M42: the flap at each shelter starts the storm-wall wait
  ...[1, 2, 3, 4].map((n) => p('flap', M42_FLAP(n), `${W}.m42.flap.${n}`, ['m42', `shelter${n}`], M42_FLAP_USED(n))),
  // M43: the torch at the camp fire, the three Blightblooms, the knot-count at the walk's end
  p('torch', M43_TORCH, `${W}.m43.torch`, ['m43', 'pyres'], M43_TORCH_LIT, { look: 'brazier' }),
  ...[1, 2, 3].map((n) => p('bloom', M43_BLOOM(n), `${W}.m43.bloom.${n}`, ['m43', 'pyres'], M43_BLOOM_BURNED(n), { when: { flag: M43_TORCH_LIT, equals: true }, look: 'stake', hideWhenUsed: true })),
  { interactableId: M43_COUNT, anchorId: `${W}.m43.count`, promptKey: 'quest.prompt.a4w.count', objective: ['m43', 'walk'], when: { flag: M43_KNOT, equals: M43_KNOTS }, priority: 1 },
  // M44: Ebba's music box in the third house
  p('box', M44_BOX, L1.musicBox, ['m44', 'box'], M44_BOX_FLAG, { look: 'box' }),
  // R25: a candle at each hearth
  ...[1, 2, 3].map((n) => p('candle', R25_LIGHT(n), L1.r25Hearth(n), ['r25', `light${n}`], R25_LIT(n), { look: 'candle', lookOnlyUsed: true, when: { not: { flag: R25_NO_CANDLE, equals: true } } })),
  // R24: the casks loaded at the spring, the brake at each storm shelter, the casks unloaded at the camp gate
  p('load', R24_LOAD, `${W}.r24.load`, ['r24', 'load'], R24_LOADED, { look: 'box', hideWhenUsed: true }),
  ...([1, 2] as const).map((n) => p('brake', R24_BRAKE(n), `${W}.r24.brake.${n}`, ['r24', `brake${n}`], R24_BRAKED(n), { when: { flag: R24_AT_SHELTER(n), equals: true } })),
  p('unload', R24_UNLOAD, `${W}.r24.unload`, ['r24', 'unload'], R24_UNLOADED),
  // M46: cairns 1 and 2 lit
  ...([1, 2] as const).map((n) => p('cairn', M46_LIGHT(n), `${W}.m46.light.${n}`, ['m46', `light${n}`], M46_LIT(n), { look: 'brazier', lookOnlyUsed: true })),
];

export const WASTE_A4_PROMPTS: Record<string, string> = {
  flap: 'Pull the shelter flap shut', torch: 'Light a torch at the fire', bloom: 'Burn the Blightbloom', count: 'Count the knots',
  box: 'Wind the music box', candle: 'Light a candle on the hearth', load: 'Load the rain-casks', brake: 'Set the cart\'s brake',
  unload: 'Unload the casks', cairn: 'Light the cairn',
};
