import type { Act2Note } from '../../notes';
import { R08_LETTER } from './r08.quest';

const n = (id: string, anchorId: string, speaker: 'note' | 'cael', lines: string[], look: Act2Note['look'] = 'page', codexId?: string): Act2Note =>
  ({ id, anchorId, speaker, lines, look, ...(codexId ? { codexId } : {}) });

/** Readable notes of M17 (two search beats at the shaft head) and R08 (six relics and the widow's letter in the Old Galleries). */
export const M17R08_NOTE_LIST: Act2Note[] = [
  // M17: the shaft head
  n('note-m17-board', 'oldsmoke.shaft.winch.part.1', 'note', [
    'The lift board by the collar door, chalk on slate. "Lift out of service by order. Shaft inspection to follow." The date is the day the strike was voted.',
    'No inspector is named. The chalk has been wiped and rewritten four times, always in the same hand.',
  ]),
  n('note-m17-tally', 'oldsmoke.shaft.winch.part.2', 'cael', [
    'A tally of the last men down before the lift stopped, scratched into the headframe post. Eleven strokes. Two have a small cross beside them.',
    'Nobody has scratched the strokes of those who came up. It was never meant to be a tally of the living.',
  ], 'grave'),
  // R08: the six relics of Pickett's last shift
  n('note-r08-tally', 'oldsmoke.old.relic.1', 'note', [
    'A shift tally board: "Pickett, boss. Pump, cart, prop, bell." Four tasks in his square hand, every one ticked but the last.',
    'The bell line is blank. A man ticks the bell when the shift is over, and his shift never was.',
  ]),
  n('note-r08-lamp', 'oldsmoke.old.relic.2', 'cael', [
    'A safety lamp, the glass cracked, the wick still wet with oil. It is warm. It has no business being warm.',
    'Someone has hung a ribbon of faded blue on its handle: a child\'s ribbon, tied by a child.',
  ], 'box'),
  n('note-r08-tin', 'oldsmoke.old.relic.3', 'cael', [
    'A snap-tin, the lid hinge worn silver. Inside, a crust of bread gone to stone and a folded scrap: "For the walk home."',
    'He packed his supper and never ate it. The lamp was lit for a shift he meant to finish.',
  ], 'box'),
  n('note-r08-wall', 'oldsmoke.old.relic.4', 'note', [
    'Names scratched into the gallery wall at shoulder height, forty or so, each with a day and a pick-mark: the crew\'s own register, kept because the stewards\' never was.',
    'Pickett\'s name is the last. Under it, in another hand, "we heard the bell and ran. forgive us."',
  ], 'grave'),
  n('note-r08-marker', 'oldsmoke.old.relic.5', 'cael', [
    'A boundary marker driven into the floor where the roof came down: a pit-prop, split, with a hat hung on it.',
    'The hat is a shift boss\'s. Whoever set it there meant it as a headstone, and had no time to carve one.',
  ], 'grave'),
  n('note-r08-chit', 'oldsmoke.old.relic.6', 'note', [
    'A pay chit, unclaimed: "Pickett, B. Shift boss. Wages owing, one month." The stewards\' stamp reads "withheld pending inquiry".',
    'The inquiry is dated eleven years ago. It has never reported.',
  ], 'page', 'lore.pickett-chit'),
  // R08: the widow's letter, six lines (a reading dialogue)
  n(R08_LETTER, 'oldsmoke.old.spawn.1', 'note', [
    '"Burel, if this reaches the shaft head I will have paid a carter a week of my wages to carry it, so read it slowly."',
    '"The bairn asks every night if the bell has rung. I tell her the bell rings when da is on the stair. She sleeps better for it, and I do not correct her."',
    '"They say the roof fell and the Old Galleries are sealed and the shift is lost. I do not believe the last part. You never lost a shift in your life."',
    '"If you can hear this where you are: leave the bell for the crew. They are to ring it, not you. Come up. The kettle is on."',
    '"I will not marry again. I have told the girl you are only late."',
    '"Your Maren."',
  ]),
];
