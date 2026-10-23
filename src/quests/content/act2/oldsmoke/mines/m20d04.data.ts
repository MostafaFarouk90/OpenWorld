// Props, notes, spawners, triggers and objective flags of M20 and D04. Every anchor is A4's (plans/act2-A4.md section 11);
// the mines are not on this branch yet, so they are referenced by id only.
import { wyrmlingSpawner } from '../../../../../enemies/wyrm/spawners';
import type { SpawnerDef } from '../../../../../enemies/types';
import type { ObjectiveFlag } from '../../../../objectiveFlags';
import type { QuestPropSpec } from '../../../../props';
import type { CarryItemSpec } from '../../../carry';
import type { Act2Note } from '../../notes';
import type { Q13Trigger } from '../triggers';
import { M20_CHAIN_FLAGS, M20_CHAINS, M20_STEWARDS_OUT } from './m20.quest';
import { D04_STAGE_TRIGGERS } from './d04.quest';

const range = (prefix: string, from: number, to: number): string[] => Array.from({ length: to - from + 1 }, (_, i) => `${prefix}${from + i}`);
const common = { band: 'oldsmoke', respawn: 'never' as const };

/** The five chain anchors double as the wyrmlings' tether posts (the chain is broken where it is bolted). */
export const M20_CHAIN_ANCHORS = range('oldsmoke.m20.chain.', 1, 5);
/** The steward posts: two groups of four stand here, and the five searches of the gallery lie among them. */
export const M20_POST_ANCHORS = range('oldsmoke.m20.post.', 1, 5);
export const M20_NURSERY_GROUP = 'q13.m20.nursery';
/**
 * The chained wyrmlings are in the nursery from the day M19 starts (its reveal plays among them) until M20 is done: a flag
 * gate, not a quest activation, which would drop them when M19 completes. `respawn: 'never'` and `ephemeral` keep a freed
 * one from coming back, and the gate closes for good on `story.m20.complete`.
 */
export const M19_STARTED_FLAG = 'story.m19.started';
export const M20_COMPLETE_FLAG = 'story.m20.complete';

export const M20D04_PROPS: QuestPropSpec[] = M20_CHAINS.map((id, i): QuestPropSpec => ({
  interactableId: id, anchorId: M20_CHAIN_ANCHORS[i], promptKey: 'quest.prompt.chain',
  objective: ['m20', 'chains'], usedFlag: M20_CHAIN_FLAGS[i], look: 'chain', hideWhenUsed: true,
}));

/** No carries in M20 or D04 (the export keeps the content shape the same as the other groups). */
export const M20D04_CARRY: CarryItemSpec[] = [];

const n = (id: string, anchorId: string, speaker: 'note' | 'cael', lines: string[], look: Act2Note['look'] = 'page'): Act2Note => ({ id, anchorId, speaker, lines, look });

export const M20D04_NOTE_LIST: Act2Note[] = [
  // M20: what the stewards kept in the gallery
  n('note-m20-ledger', 'oldsmoke.m20.post.1', 'note', [
    'A delivery ledger on a steward\'s stool. "Four wyrmlings, hatched, to the black-anvil buyer, by the winter road. Two for the arena at Saltmere. One kept back: the House has an eye on the elder."',
    'Each line is initialled. The initials are not all Grisel.',
  ]),
  n('note-m20-key', 'oldsmoke.m20.post.2', 'cael', [
    'A ring of iron keys on a nail, every key the same size and every lock on the chains rusted shut. Someone has filed a notch in the biggest.',
    'The keys were never meant to open anything. They are for show: the chains were always meant to stay.',
  ], 'box'),
  n('note-m20-trough', 'oldsmoke.m20.post.3', 'cael', [
    'A trough of grey slop, crusted. The wyrmlings have been fed ash and old slag, nothing that burns. A hungry wyrmling does not breathe fire.',
    'That is the whole method of the place: keep them weak, keep them chained, sell them tame.',
  ], 'box'),
  n('note-m20-tally', 'oldsmoke.m20.post.4', 'note', [
    'A tally chalked on the wall, five columns, one per chain. The first column has eleven strokes, the last has one. Under it: "the old one, still."',
    'Eleven wyrmlings have gone through the first chain. The last chain has held the same prisoner since before the tally.',
  ]),
  n('note-m20-orders', 'oldsmoke.m20.post.5', 'note', [
    'Steward orders, copied fair: "Do not unchain the elder. Do not feed it more than the ash. Do not speak of it above the Lower Galleries. If the roof sings, leave the gallery."',
    'The last line is underlined twice, in a hand that was afraid.',
  ]),
  n('note-m20-board', 'oldsmoke.lower.spawn.1', 'note', [
    'A shift board of steward names, each with a chalk mark for the day they stood the chain-watch. Wenna\'s hand has been added at the bottom: "I stood it once. I never went back."',
  ]),
  n('note-m20-scorch', 'oldsmoke.m20.roof', 'cael', [
    'The floor under the roof is glassed, old fire and a great deal of it. A wyrm\'s length of scorch, and in the middle of it an iron collar as wide as {name}\'s arm-span, bent open, once, and bolted shut again.',
    'Whatever lay here has been tried before.',
  ], 'grave'),
  // D04: the survey (Slagg's map and the marks left by the first survey crews)
  n('note-d04-map', 'oldsmoke.deepdelve.stage.1', 'note', [
    'Slagg\'s survey map, nailed to the lift housing: the Deepdelve in three descents, the two valve rooms marked with a hand-drawn drop of water, and at the bottom a circle with no label.',
    'In the margin, in Slagg\'s blocky hand: "Cool the pools before you go in. Whatever lives in the circle drinks from them."',
  ]),
  n('note-d04-marks-1', 'oldsmoke.deepdelve.stage.2', 'cael', [
    'A survey mark cut into the rock: three bars and an arrow, pointing down. The first crew\'s sign for "clear". The rock beside it is warm to the touch.',
  ], 'grave'),
  n('note-d04-marks-2', 'oldsmoke.deepdelve.valve.room.1', 'cael', [
    'The second crew\'s mark is crossed out. Beside it, scratched with a pick: "SLAG RISING." The date is the day the lift stopped.',
  ], 'grave'),
  n('note-d04-marks-3', 'oldsmoke.deepdelve.valve.room.2', 'cael', [
    'The third mark is a line of tally strokes and then nothing: six strokes, then a handprint in soot. The crew never finished their count.',
  ], 'grave'),
  n('note-d04-ledger', 'oldsmoke.deepdelve.pool.1', 'note', [
    'A coolant ledger kept by the Deepdelve stokers: valve settings by shift, each pool needing every valve on its mark before the vents will open. The marks are written on the wall, and the wall has been scorched.',
    'The last entry is "pressure rising, three of four set". It is not signed.',
  ]),
  n('note-d04-chalk', 'oldsmoke.deepdelve.pool.2', 'cael', [
    'Chalk on the pool\'s rim: a circle, a sun, a crown of spikes. Not a miner\'s mark. Not a steward\'s either.',
    'Something has been counting down the stairs. The count is the pools.',
  ], 'grave'),
];

/**
 * Quest-scoped groups. The steward posts hold two groups of four (the fight is required, no persuasion shortcut). The
 * wyrmlings are one chained group of five on the chain anchors (the director's tether). D04's groups wake one after the
 * other on the objective flags below, so a kill is only ever counted on the objective that wants it.
 */
export const M20D04_SPAWNERS: readonly SpawnerDef[] = [
  ...[
    { n: 1, anchor: 'oldsmoke.m20.post.1', members: range('oldsmoke.m20.post.', 1, 4) },
    { n: 2, anchor: 'oldsmoke.m20.post.5', members: undefined },
  ].map(({ n: group, anchor, members }): SpawnerDef => ({
    id: `q13.m20.stewards-${group}`, tag: 'm20.stewards', enemy: 'steward-guard', count: 4, anchor,
    ...(members ? { memberAnchors: members } : {}), activation: { quest: 'm20', flag: M20_STEWARDS_OUT }, leash: true, ...common,
  })),
  wyrmlingSpawner(M20_NURSERY_GROUP, M20_CHAIN_ANCHORS[0], 5, {
    tag: 'm20.wyrmlings', memberAnchors: M20_CHAIN_ANCHORS, activation: { flag: M19_STARTED_FLAG, until: M20_COMPLETE_FLAG }, ephemeral: true, peaceful: true, band: 'oldsmoke',
  }),
  {
    id: 'q13.d04.crawlers-a', tag: 'd04.crawlers-a', enemy: 'slag-crawler', count: 10, anchor: 'oldsmoke.deepdelve.stage.2',
    activation: { quest: 'd04', flag: 'story.d04.crawlersOut' }, leash: true, ...common,
  },
  {
    id: 'q13.d04.golem', tag: 'd04.golem', enemy: 'cinder-golem', count: 1, anchor: 'oldsmoke.deepdelve.stage.2',
    activation: { quest: 'd04', flag: 'story.d04.golemOut' }, leash: true, ...common,
  },
  {
    id: 'q13.d04.crawlers-b', tag: 'd04.crawlers-b', enemy: 'slag-crawler', count: 3, anchor: 'oldsmoke.deepdelve.valve.room.1',
    activation: { quest: 'd04', flag: 'story.d04.crawlersBOut' }, leash: true, ...common,
  },
];

/** D04's two lift descents: spheres on the stage anchors (prefix `trg.q13.`, so no clash with A4's `trg.oldsmoke.`). */
export const M20D04_TRIGGERS: Q13Trigger[] = [
  { id: D04_STAGE_TRIGGERS[0], anchorId: 'oldsmoke.deepdelve.stage.1', radius: 8 },
  { id: D04_STAGE_TRIGGERS[1], anchorId: 'oldsmoke.deepdelve.stage.2', radius: 8 },
];

/**
 * Story flags set when an objective is done. `story.d04.started` is deliberately not here: the common quest-level row
 * would set it on accept and burn A8's one-shot arena. The director writes it when the arena objective becomes current.
 */
export const M20D04_OBJECTIVE_FLAGS: ObjectiveFlag[] = [
  { quest: 'm20', flag: 'story.m20.started' },
  // M20: the stewards come out once Wenna has briefed Cael
  { quest: 'm20', objective: 'brief', flag: M20_STEWARDS_OUT },
  // D04: each fight wakes when the one before it is done
  { quest: 'd04', objective: 'stage2', flag: 'story.d04.crawlersOut' },
  { quest: 'd04', objective: 'crawlersA', flag: 'story.d04.golemOut' },
  { quest: 'd04', objective: 'golem', flag: 'story.d04.crawlersBOut' },
];
