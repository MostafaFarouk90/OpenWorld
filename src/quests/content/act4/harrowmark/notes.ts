// The readable search points of the Harrowmark quests (PR 1): one note per search beat of plan 7.1, each on an anchor that no NPC
// or prop shares (the note lint). Prose is invented (Q6) and logged in design/changes-applied.md.
import type { Act2Note } from '../../act2/notes';
import { Q } from './anchors';
import { M35_NOTES } from './m35.quest';
import { M36_NOTE_DROP, M36_NOTE_LEDGER, M36_NOTE_LETTERS, M36_NOTE_PAGE } from './m36.quest';
import { R19_NOTES } from './r19.quest';
import { R20_NOTES } from './r20.quest';
import { R21_NOTES } from './r21.quest';
import { R22_NOTES } from './r22.quest';
import { R23_ORDER } from './r23.quest';
import { D07_NOTES, D07_NOTE_ANCHORS } from './d07.quest';
import { M38_NOTES } from './m38.quest';
import { M39_NOTE_TOKEN } from './m39.quest';
import { M41_NOTES } from './m41.quest';

const n = (id: string, anchorId: string, speaker: 'note' | 'cael', lines: string[], look: Act2Note['look'] = 'page'): Act2Note =>
  ({ id, anchorId, speaker, lines, look });

const ORDERS: readonly (readonly [string, string])[] = [
  ['An order on Regent\'s paper, the seal pressed twice: "The night watch of the Barracks is stood down for the week of the Council. The Regent\'s Guard will keep the walls."',
    'Old Cuthred\'s name is on the list of the stood-down. Beside it, in the same ink, someone has written "too loyal".'],
  ['A gate-warden\'s tally of carts in and out, and pinned to it an order: "Carts bearing the black wax pass the South Gate unsearched."',
    'Twenty-three carts in a month, all black wax, all at night. The tally is in Osgood\'s hand; the order is not.'],
  ['A stable-book page torn out and folded small: "Six horses to be kept saddled at all hours for the Regent\'s riders." No riders are named.',
    'On the back, a sketch of the Keep\'s north stair with a cross on it. Someone has been counting the steps.'],
  ['A chapel almoner\'s receipt for bread given to the watch\'s widows, cancelled by an order: "No alms to the households of men struck from the watch."',
    'The order is dated the day after the watch was purged. The almoner kept giving the bread anyway, and wrote down every loaf.'],
  ['An order nailed up in the Tilted Anvil\'s yard and taken down again: "Any man who speaks of the Crucible is to be held at the Regent\'s pleasure."',
    'There was no Crucible in any law of the city. Now there is one in an order, and the order says not to speak of it.'],
];

/** Readable notes of the nine quests before the Council: twenty-five search points. */
export const HARROWMARK_A4_NOTE_LIST: Act2Note[] = [
  // M35
  n(M35_NOTES[0], `${Q}.m35.ledger`, 'note', [
    'The River Gate\'s checkpoint ledger. Every name in and out for a month, and beside each, a mark: a circle, a cross, or a black thumbprint.',
    'Orrin\'s own name is down for this morning, with the thumbprint. Somebody wanted to know when the Grisel steward came through.',
  ], 'box'),
  n(M35_NOTES[1], `${Q}.m35.mask`, 'cael', [
    'A mask of soot-black leather, the eye holes cut ragged, dropped in the lane. Inside, stitched in red: a coal with a crown over it.',
    'The Regent\'s mark, the one he wears on his seal. These were never street thieves.',
  ], 'box'),
  n(M35_NOTES[2], `${Q}.m35.orders`, 'note', [
    'Folded in a dead man\'s glove: "The Grisel party is not to reach the Keep. Make it look like the street."',
    'No seal. The hand is a clerk\'s hand, neat and cold, the kind that writes the same order twice and keeps the copy.',
  ]),
  // M36
  n(M36_NOTE_LEDGER, `${Q}.m36.ledger`, 'note', [
    'Ser Aldric Cole\'s debt ledger: forty crowns owed to a Halvard sergeant, Wulf Garrow, for a horse lost at Cinderford in the old war.',
    'Garrow is dead these twelve years. The debt was bought last month by a broker who works for the Regent, and the interest has tripled.',
  ], 'box'),
  n(M36_NOTE_PAGE, `${Q}.m36.page`, 'note', [
    'The Archive\'s copy of the Oswin charter, page nine: the clause that lets the Oswin seat vote by proxy in a regency.',
    'Wilmot\'s page has the same clause with one word changed: "may not" for "may". The Archive\'s copy is older, and signed.',
  ]),
  n(M36_NOTE_DROP, `${Q}.m36.drop`, 'cael', [
    'At the drop, a knotted rope and a satchel: a dozen blank Council writs, and a list of the three undecided delegates\' houses.',
    'Each house has a time beside it. Tomorrow night. The daggerman was not waiting for me; he was waiting for dark.',
  ], 'box'),
  n(M36_NOTE_LETTERS, `${Q}.m36.letters`, 'note', [
    'Orrin\'s letter-case, left on the gate bench. Letters from his sister in Oldsmoke, and one from Aldous Grisel himself.',
    '"Your sister\'s house stands on Grisel land, Orrin. Vote as your lord bids, and it will go on standing."',
  ], 'box'),
  // R19
  n(R19_NOTES[0], `${Q}.r19.roll`, 'note', [
    'The Bastion\'s muster roll, four companies: Hesketh\'s archers, Morwen\'s pikes, Bran\'s horse, Tolly\'s engineers.',
    'Each company is a third short. Beside the missing names, in Wystan\'s hand: "Gone to the Regent\'s pay. Not cowards. Hungry."',
  ], 'box'),
  n(R19_NOTES[1], `${Q}.r19.letter`, 'note', [
    'A letter from Captain Tolly to his wife, unsent: "If the banners go up, I go with them, whatever it costs."',
    '"If they do not, I will stand on the walls and pretend not to see what comes through the gates. Forgive me either way."',
  ]),
  // R20
  n(R20_NOTES[0], `${Q}.r20.manifest`, 'note', [
    'The convoy\'s manifest: twelve chests of Oswin silver, sealed, bound for the Oswin farms beyond the River Gate before the Regent can freeze them.',
    'Merrin has written at the foot: "If one chest is lost, so be it. If the convoy is lost, the House is."',
  ], 'box'),
  n(R20_NOTES[1], `${Q}.r20.tally.1`, 'note', [
    'The River Gate post\'s tally of tolls taken: far more than the law allows, and the extra marked "for the Regent\'s works".',
    'The works are not named. The tolls are taken in silver, and only in silver.',
  ]),
  n(R20_NOTES[2], `${Q}.r20.tally.2`, 'note', [
    'At the first hut, a tally of carts turned back: every one of them Oswin.',
    'Under it, a sergeant\'s note to his officer: "The farmers are asking why. I have told them the Regent fears plague."',
  ]),
  n(R20_NOTES[3], `${Q}.r20.tally.3`, 'note', [
    'At the second hut, a tally of silver seized: four hundred crowns in a week, sent "to the Keep, the lower door".',
    'The lower door of the Keep has been bricked up since Edric\'s grandfather. Somebody has opened it again.',
  ]),
  // R21
  n(R21_NOTES[0], `${Q}.r21.cellar`, 'cael', [
    'The cellar is full of miners\' gear packed for a journey: picks wrapped in sacking, lamps, a child\'s shoe.',
    'Chalked on the beam: the names of every miner who chose Wenna over Aldous, and a tally of who has already been taken.',
  ], 'box'),
  n(R21_NOTES[1], `${Q}.r21.chalk`, 'note', [
    'On the lane wall, the patrol\'s chalk: a circuit drawn in arrows, with the hours marked. A Grisel mark, not a Regent\'s.',
    'Aldous\'s own men keep this lane for the Regent. They know where his miners hide, because they used to drink with them.',
  ]),
  // R22
  n(R22_NOTES[0], `${Q}.r22.drawing`, 'note', [
    'Dunstan\'s drawing of a blade for a boy: two outlines, one slim and quick, one broad and heavy, the same hilt for both.',
    'Down the margin, three words circled: star-iron, bog-oak, rime-iron. And "the boy decides, not me" underlined twice.',
  ]),
  // R23
  ...ORDERS.map((lines, i) => n(R23_ORDER(i + 1), `${Q}.r23.order.${i + 1}`, 'note', [...lines])),
  // D07
  n(D07_NOTES.stamp, D07_NOTE_ANCHORS.stamp, 'cael', [
    'Each empty cradle is stamped on its rim: a coal with a crown, and a number. The numbers run to forty.',
    'Forty hearts. D02\'s crates under the Underways were marked the same. They were bringing them here.',
  ], 'box'),
  n(D07_NOTES.tally, D07_NOTE_ANCHORS.tally, 'note', [
    'A carter\'s tally, greasy from a glove: "Delivered to the lower door, from the Dragonspine road, under black wax."',
    'Each line ends "one heart, cold", and each is signed for by the same hand that signed the Regent\'s forged orders.',
  ]),
  n(D07_NOTES.ledgers, D07_NOTE_ANCHORS.ledgers, 'note', [
    'The heart ledgers. Every dragon heart taken, where from, who paid for it, and what it fed: the furnaces, and the engine behind the gate.',
    'Three lords\' names are in it as buyers. One of them is Aldous Grisel. The last entry is written in the Regent\'s own hand.',
  ], 'box'),
  n(D07_NOTES.log, D07_NOTE_ANCHORS.log, 'note', [
    'The furnace log. At its foot, chalked for the night shift: "To vent the vats: the middle wheel, then the north, then the south. Never the south first."',
    'Under it, in another hand: "Gerd turned the south first. Gerd is in the vat."',
  ]),
  // M38
  n(M38_NOTES[0], 'harrowmark.a4.chamber.clerk', 'note', [
    'On the clerk\'s table, under the voting roll: a list in Vey\'s own hand. Every delegate\'s name, and beside each, "for" or "against" or "remove".',
    'Edric\'s name is at the bottom. Beside it, one word: "stairs". He knew which way we would run.',
  ]),
  n(M38_NOTES[1], 'harrowmark.a4.chamber.footman.e1', 'cael', [
    'On the Footman by the east door, a writ with the Regent\'s seal, dated a week ago: the order to hold the chamber "when the vote is called".',
    'A week ago. Before the Houses arrived, before a single delegate was walked in. The vote was never going to be counted.',
  ], 'box'),
  // M39
  n(M39_NOTE_TOKEN, 'harrowmark.a4.stairs.sword', 'cael', [
    'Beside the barricade, where he fell, Gaut\'s old knight\'s token: a tin badge on a frayed ribbon, the Kettlewick mill-wheel stamped into it.',
    'He wore it under his mail for forty years. It is warm still. I put it on.',
  ], 'box'),
  // M41
  n(M41_NOTES[0], `${Q}.m41.grandfather`, 'note', [
    'Folded in Edric\'s doublet, worn soft: a note in his grandfather\'s hand. "If the city is ever lost, it is not the crown that is lost. Go to the ash. The Ashgate holds."',
    'Under it, a child\'s copy of the same words, letter by careful letter. Edric learned to write from it.',
  ]),
  n(M41_NOTES[1], `${Q}.m41.tunnel`, 'cael', [
    'On the rock by the deep run\'s grate, a mark cut long ago: a gate with a road running out of it toward the north-east.',
    'Whoever cut it meant someone to come this way in a bad hour, and to know where to go next.',
  ]),
];
