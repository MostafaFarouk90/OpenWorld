// Interactable props of the Harrowmark quests (PR 1); each is live only while its objective is current. Prompt keys are
// `quest.prompt.a4.<name>`, so they never share a key with another act's table.
import type { QuestPropSpec } from '../../../props';
import { Q } from './anchors';
import { M35_CHAIN, M35_CHAIN_FLAG } from './m35.quest';
import { M36_CHALK, M36_CHALK_FLAG } from './m36.quest';
import { R19_BANNERS, R19_HORN } from './r19.quest';
import { R20_LOAD, R20_LOADED } from './r20.quest';
import { R21_DOOR, R21_GRATE, R21_GRATE_FLAG } from './r21.quest';
import { R22_ANVIL, R22_BELLOWS, R22_FIND, R22_FORGED, R22_FOUND, R22_HILT, R22_QUENCH, R22_SITES } from './r22.quest';
import { R23_CHOICE, R23_EXPOSED, R23_READING } from './r23.quest';
import { D07_VALVE, D07_VALVE_ANCHOR, D07_VALVES } from './d07.quest';
import { M37_COMPANIONS, M37_FEAST, M37_FEAST_FLAG, M37_SEAT, M37_SUNG, M37_TABLE } from './m37.quest';

export const HARROWMARK_A4_PROPS: QuestPropSpec[] = [
  // M35: the River Gate chain, raised so the Grisel party can pass
  { interactableId: M35_CHAIN, anchorId: `${Q}.m35.chain`, promptKey: 'quest.prompt.a4.chain', objective: ['m35', 'chain'], usedFlag: M35_CHAIN_FLAG, look: 'chain', priority: 1 },
  // M36: the vote chalked on the Counting-House board
  { interactableId: M36_CHALK, anchorId: `${Q}.m36.chalk`, promptKey: 'quest.prompt.a4.chalk', objective: ['m36', 'chalk'], usedFlag: M36_CHALK_FLAG, priority: 1 },
  // R19: the two banners raised at the Bastion, then the muster horn
  ...R19_BANNERS.map((id, i): QuestPropSpec => ({
    interactableId: id, anchorId: `${Q}.r19.banner.${i + 1}`, promptKey: 'quest.prompt.a4.banner', objective: ['r19', 'banners'], usedFlag: `story.r19.banner.${i + 1}`, look: 'stake', lookOnlyUsed: true, priority: 1,
  })),
  { interactableId: R19_HORN, anchorId: `${Q}.r19.horn`, promptKey: 'quest.prompt.a4.horn', objective: ['r19', 'horn'], usedFlag: 'story.r19.horn', priority: 1 },
  // R20: the silver loaded on the cart
  { interactableId: R20_LOAD, anchorId: `${Q}.r20.load`, promptKey: 'quest.prompt.a4.load', objective: ['r20', 'load'], usedFlag: R20_LOADED, look: 'box', hideWhenUsed: true, priority: 1 },
  // R21: the cellar door and the sewer grate
  { interactableId: R21_DOOR, anchorId: `${Q}.r21.door`, promptKey: 'quest.prompt.a4.cellar', objective: ['r21', 'door'], usedFlag: 'story.r21.doorOpen', priority: 1 },
  { interactableId: R21_GRATE, anchorId: `${Q}.r21.grate`, promptKey: 'quest.prompt.a4.grate', objective: ['r21', 'grate'], usedFlag: R21_GRATE_FLAG, look: 'chain', priority: 1 },
  // R22: each material where it lies, then the forge
  ...R22_SITES.map((s): QuestPropSpec => ({
    interactableId: R22_FIND(s), anchorId: `${s.region}.q.r22.find`, promptKey: `quest.prompt.a4.${s.id}`, objective: ['r22', `${s.id}Find`],
    give: { itemId: s.item, count: 1 }, usedFlag: R22_FOUND(s), look: 'box', hideWhenUsed: true, priority: 1,
  })),
  { interactableId: R22_BELLOWS, anchorId: `${Q}.r22.bellows`, promptKey: 'quest.prompt.a4.bellows', objective: ['r22', 'bellows'], usedFlag: 'story.r22.bellows', priority: 1 },
  ...([1, 2] as const).map((n): QuestPropSpec => ({ interactableId: R22_ANVIL(n), anchorId: `${Q}.r22.anvil`, promptKey: 'quest.prompt.a4.anvil', objective: ['r22', `forge${n}`], when: { not: { flag: R22_FORGED(n), equals: true } }, priority: 1 })),
  { interactableId: R22_QUENCH, anchorId: `${Q}.r22.quench`, promptKey: 'quest.prompt.a4.quench', objective: ['r22', 'quench'], usedFlag: 'story.r22.quench', look: 'bucket', priority: 1 },
  { interactableId: R22_HILT, anchorId: `${Q}.r22.hilt`, promptKey: 'quest.prompt.a4.hilt', objective: ['r22', 'hilt'], usedFlag: 'story.r22.hilt', priority: 1 },
  // R23 public: the reading in the watch yard (the private way is the clerk's talk)
  { interactableId: R23_READING, anchorId: `${Q}.r23.reading`, promptKey: 'quest.prompt.a4.reading', objective: ['r23', 'expose'], usedFlag: R23_EXPOSED, when: { flag: R23_CHOICE, equals: 'public' }, look: 'page', priority: 1 },
  // D07: the three vat valves (the director judges the order; no used flag, so a wrong wheel can be turned again)
  ...[1, 2, 3].map((n): QuestPropSpec => ({
    interactableId: D07_VALVE(n), anchorId: D07_VALVE_ANCHOR(n), promptKey: 'quest.prompt.a4.valve', objective: ['d07', 'valves'],
    when: { not: { flag: D07_VALVES, equals: true } }, priority: 1,
  })),
  // M37: the feast table, a seat for each bond scene, the war-song table top
  { interactableId: M37_FEAST, anchorId: `${Q}.m37.feast`, promptKey: 'quest.prompt.a4.feast', objective: ['m37', 'feast'], usedFlag: M37_FEAST_FLAG, priority: 1 },
  ...M37_COMPANIONS.map((c): QuestPropSpec => ({
    interactableId: M37_SEAT(c), anchorId: `${Q}.m37.seat.${c}`, promptKey: `quest.prompt.a4.seat.${c}`, objective: ['m37', c], priority: 1,
  })),
  { interactableId: M37_TABLE, anchorId: `${Q}.m37.table`, promptKey: 'quest.prompt.a4.table', objective: ['m37', 'song'], when: { not: { flag: M37_SUNG, equals: true } }, priority: 1 },
];

export const HARROWMARK_A4_PROMPTS: Record<string, string> = {
  chain: 'Raise the chain', chalk: 'Chalk the vote', banner: 'Raise the banner', horn: 'Sound the muster horn',
  load: 'Load the silver', cellar: 'Open the cellar door', grate: 'Lift the sewer grate',
  'star-iron': 'Take the star-iron', 'bog-oak': 'Cut the bog-oak', 'rime-iron': 'Prise out the rime-iron',
  bellows: 'Work the bellows', anvil: 'Strike on the beat', quench: 'Quench the blade', hilt: 'Fit the hilt', reading: 'Read the orders aloud',
  valve: 'Turn the valve wheel', feast: 'Sit down to the feast', 'seat.tobb': 'Sit with Tobb', 'seat.hrolf': 'Sit with Hrolf',
  'seat.aelfreda': 'Sit with Aelfreda', table: 'Drum the war-song on the table',
};
