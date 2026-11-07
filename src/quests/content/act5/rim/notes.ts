// The readable search points of the Rim quests: one note per search beat (plan 7.1; a note counts once as a search beat and
// never as dialogue nodes, the Phase H rule), each on an anchor no NPC or prop shares (the note lint). Prose is invented (Q6)
// and logged under "Act 5 N10" in design/changes-applied.md.
import type { Act2Note } from '../../act2/notes';
import { COOL, Q } from './ids';
import { M47_NOTES } from './m47.quest';
import { M48_NOTES } from './m48.quest';
import { M49_NOTES } from './m49.quest';
import { R26_NOTES } from './r26.quest';
import { R29_NOTE, R29_POSTS } from './r29.quest';
import { M50_NOTES } from './m50.quest';
import { M51_NOTES } from './m51.quest';

const n = (id: string, anchorId: string, speaker: 'note' | 'cael', lines: string[], look: Act2Note['look'] = 'page'): Act2Note =>
  ({ id, anchorId, speaker, lines, look });

const R29_TEXT: Record<1 | 2 | 3, string[]> = {
  1: ['A hook on the hut\'s lintel, worn bright where something heavy hung. Below it, scratched in the stone: "The hammer sleeps here."',
    'The stokers kept the gong\'s hammer by their door, so the last one out could strike it. Nobody was left to.'],
  2: ['A coil of rope gone stiff as wire, still knotted to a ring in the rock. The knot is a stoker\'s hitch, the kind that never slips.',
    'Someone cut it from the frame and carried it here to keep it dry. They tied it to the ring and sat down beside it.'],
  3: ['A bronze wedge in a niche above the path, green with age. It fits the gong\'s frame and nothing else.',
    'A child\'s mark beside it, a sun with too many rays. A stoker\'s child, sent up the path with the wedge to keep it safe.'],
};

export const RIM_A5_NOTE_LIST: Act2Note[] = [
  // M47
  n(M47_NOTES.journal, `${Q}.m47.journal`, 'note', [
    'A stoker\'s day-book wedged under a stone: "Third week of the ash. The rim stairs still hold. We carry water up and slag down."',
    'The last page: "The Regent\'s men came to the gate and asked for the forge. Alric barred it. We are nine."',
  ], 'box'),
  n(M47_NOTES.inscription, `${Q}.m47.inscription`, 'cael', [
    'Letters cut deep in the gate\'s lintel, older than any of Harrowmark\'s: "The fire is kept. Those who keep it are kept by it."',
    'Under them, newer and shallower: "Nobody in without the stokers\' word."',
  ], 'grave'),
  n(M47_NOTES.bell, `${Q}.m47.bell`, 'cael', [
    'An old bronze bell on a frame of black iron, its clapper tied off with a strip of leather.',
    'Tied so it would not ring by itself in the hot wind. Or so the stokers could choose when to ring it.',
  ]),
  // M48
  n(M48_NOTES.marks, `${Q}.m48.marks`, 'cael', [
    'Chalk marks on the wall above the first channel: a wheel, a count of six, a crossed-out foot.',
    'Turn the wheel, count six, do not walk after. The stokers wrote for each other in a hurry.',
  ]),
  n(M48_NOTES.tally, `${Q}.m48.tally`, 'note', [
    'A slate hung on a peg: the vents\' names and a tally under each. "Old Mother: 4000. The Sigh: 3100. Grumble: 2950."',
    'The last line is in a different hand: "Grumble stuck open the night the Regent came. We let it run."',
  ]),
  n(M48_NOTES.cache, `${Q}.m48.cache`, 'cael', [
    'A stoker\'s cache under a slab at the stair\'s foot: a flask, a whetstone, a heavy cloth bundle that is warm to the touch.',
    'Inside the cloth, a shard of something that glows like a coal and does not burn the hand. Alric will know what it is.',
  ], 'box'),
  // M49
  n(M49_NOTES.plan, `${Q}.m49.plan`, 'note', [
    'The gate\'s old defence plan, scratched on a hide: archers on the towers, pikes in the cut, braces at the leaf.',
    'Somebody has drawn a dragon over the stairs in charcoal. It looks like a joke. It might not be.',
  ]),
  n(M49_NOTES.tally, `${Q}.m49.tally`, 'cael', [
    'A stoker\'s tally of the camp\'s stores, a line for each barrel. Water, slag-salt, oil, rope. Most lines are crossed through.',
    'Merrin\'s convoy will change that. The last line is "hope", with no count beside it.',
  ]),
  // R26
  n(R26_NOTES.manifest, `${Q}.r26.manifest`, 'note', [
    'House Oswin\'s manifest, sealed with the fox: "Flasks, forty crates. Bandage, twelve bolts. Oil, six casks. Grain, as much as lasts."',
    'A line added in Merrin\'s hand: "Whatever does not reach the rim does not exist."',
  ]),
  n(R26_NOTES.waybill, `${Q}.r26.waybill`, 'cael', [
    'The convoy master\'s waybill, the crates ticked off as they come down from the cart. Every one counted twice.',
    'At the bottom he has written the guards\' names, and next to each the words "came up".',
  ]),
  // R29
  ...R29_POSTS.map((p) => n(R29_NOTE(p), `${Q}.r29.search.${p}`, p === 2 ? 'cael' : 'note', R29_TEXT[p])),
  // M50 (N2's chart sites inside the Hall)
  n(M50_NOTES.chart, `${COOL}.chart.1`, 'note', [
    'The stokers\' chart, painted on the wall: three channels, three wheels each, numbered in an order that is not one, two, three.',
    'Under it: "Turn them in the chart\'s order before the needle reaches red. The hall does not forgive guessing."',
  ]),
  n(M50_NOTES.key, `${COOL}.chart.2`, 'cael', [
    'A valve key on a nail by the second chart, its handle wrapped in rag against the heat.',
    'The second channel\'s order is painted fresher than the first. Someone came back to make sure it was right.',
  ]),
  n(M50_NOTES.mark, `${COOL}.reward`, 'cael', [
    'The forge\'s mark, cut into the cooled stone: an anvil with a sun on it, and a line of names.',
    'Alric\'s is the last, and it has not been crossed out.',
  ], 'grave'),
  // M51
  n(M51_NOTES.orders, `${Q}.m51.orders`, 'note', [
    'Orders in the Regent\'s hand: "Count the dragons. Count the banners. Do not engage." Signed with the black sun.',
    'On the back, in a soldier\'s scrawl: "Three dragons. How many banners does a man need to see?"',
  ]),
  n(M51_NOTES.bones, `${Q}.m51.bones`, 'cael', [
    'Old bones on the ledge, too big for anything living: a rib like a bridge, a tooth as long as an arm.',
    'Ysmeryth\'s kin, once. The dragons have laid stones round them. They come here to remember.',
  ], 'grave'),
];
