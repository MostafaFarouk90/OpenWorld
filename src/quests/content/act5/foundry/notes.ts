// The readable search points of the Foundry quests: one note per search beat (plan 7.1; the note convention: a note, page or
// mural counts once as a search, never as dialogue nodes), each on an anchor no NPC or prop shares (the note lint). Prose is
// invented (Q6) and logged under "Act 5 N11" in design/changes-applied.md.
import type { Act2Note } from '../../act2/notes';
import { FA } from './anchors';
import { R27_NOTES } from './r27.quest';
import { R28_NAME_NOTE } from './r28.quest';
import { R30_PAGE } from './r30.quest';
import { M53_NOTES } from './m53.quest';
import { D09_NOTES } from './d09.quest';

const n = (id: string, anchorId: string, speaker: 'note' | 'cael', lines: string[], look: Act2Note['look'] = 'page'): Act2Note =>
  ({ id, anchorId, speaker, lines, look });
const FD = (s: string): string => `caldera.int.foundry.${s}`;

/** R28: the four fallen, one name each (on a shield, a tally-stick, a pick handle, a knot-cord). */
export const R28_FALLEN = ['Ceolwin of the Halvard archers', 'Brother-in-arms Osric, Oswin\'s carter', 'Edda Tallowhand, miner', 'Hrefna, an Ashwalker'] as const;

export const FOUNDRY_A5_NOTE_LIST: Act2Note[] = [
  // R27
  n(R27_NOTES.tally, FA.tunnelNote('tally'), 'note', [
    'Chalk on the shoring, a stoker\'s tally: rows of five strokes, struck through. Under the last row: "Shift ninety-one. Heat in the walls again."',
    'Under that, newer, in a miner\'s square hand: "Wenna\'s crew. We hold here."',
  ]),
  n(R27_NOTES.door, FA.tunnelNote('door'), 'cael', [
    'An iron door is bricked into the wall by the mouth, its hinges the size of my arm. Someone chiselled a hammer over the lintel and then, later, scratched it out.',
    'The bricks are old. The mortar between the bottom rows is not.',
  ], 'box'),
  // R28: the names
  ...[1, 2, 3, 4].map((i) => n(R28_NAME_NOTE(i), FA.name(i), 'cael', [
    [
      'A Halvard shield, its boss dented flat. Painted on the inside where only the bearer would see it: "Ceolwin. Hold the line, then go home."',
      'A carter\'s tally-stick, notched for every crate brought up the rim stairs. Forty notches. The last one is cut deeper: "Osric".',
      'A pick handle worn pale where two hands held it. Burned into the haft: "Edda Tallowhand. Dug Deepdelve. Dug the Rim."',
      'A knot-cord tied to a spear-butt. Wulfhild taught me the count: four turns, a loop, three. "Hrefna walked here."',
    ][i - 1]!,
  ], i === 4 ? 'box' : 'page')),
  // R30: the scattered pages of Tobb's songbook
  n(R30_PAGE(1), FA.r30Page(1), 'cael', ['A page of Tobb\'s songbook, trodden into the ash: "The Road of Kettlewick", every verse crossed out but the last, which is underlined twice.']),
  n(R30_PAGE(2), FA.r30Page(2), 'cael', ['A second page, caught on a tent peg. A tune written as dots and a list of rhymes for "ember": remember, December, dismember (struck through, firmly).']),
  n(R30_PAGE(3), FA.r30Page(3), 'cael', ['The third page, under a broken shield in the court. Only a title: "The Rim Holds". The rest of the page is blank, waiting.']),
  // M53: what the truce leaves at the gate
  n(M53_NOTES.ledger, FA.m53Note('ledger'), 'note', [
    'A Regent\'s ledger, dropped by a herald. Columns of numbers headed "Hearts" and "Heat yielded". The last line: "Three keepers would light the forge for a hundred years."',
  ]),
  n(M53_NOTES.vial, FA.m53Note('vial'), 'cael', [
    'A glass vial in a velvet case. Something inside it still glows, slow as a heartbeat. It is warm through my glove.',
  ], 'box'),
  n(M53_NOTES.seal, FA.m53Note('seal'), 'note', [
    'A wax seal pressed into the truce banner\'s cord: a rearing bear, Aldous Grisel\'s mark. Under it, scratched: "For the boy king. Not for him."',
  ]),
  // D09
  n(D09_NOTES.plate, FA.d09Plate, 'note', [
    'A stokers\' plate bolted to a pillar beside the sluices: three wheels drawn as circles, numbered in the old way. The west wheel first, then the east, then the middle. "Never the middle first," someone has scratched. "It floods the runs."',
  ]),
  n(D09_NOTES.ledgers, FD('ledger.1'), 'note', [
    'The Regent\'s heart ledgers. Each page a name: Corvanth, Ysgaer, Thrane. Each name a weight and a yield. Each one struck through in red.',
    'At the foot of the last page, in Vey\'s own hand: "Enough for the Forge. Enough to burn the blight out of the world. Then no more."',
  ]),
  n(D09_NOTES.vats, FD('ledger.2'), 'cael', [
    'The vats are taller than a man and warm as a hearth. Something moves in the nearest one, very slowly. I do not look for long.',
  ]),
  n(D09_NOTES.orders, FD('ledger.3'), 'note', [
    'The Regent\'s orders to his household: "Hold the Foundry until the third heart is poured. If the knight comes, let him come to me. Nobody else is to touch him."',
  ]),
  n(D09_NOTES.map, FD('map'), 'note', [
    'A map on stoker\'s vellum, older than the Foundry. Seven anvils marked across lands I do not know, each with a hammer drawn beside it. Only one of them is ours.',
    'Alric will want to see this.',
  ]),
];
