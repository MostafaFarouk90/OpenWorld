import type { QuestNoteSpec } from '../../notes';

/** A readable note: one short dialogue (id = the note id, the talk target) read with F. Speaker 'note' is a written page, 'cael' his own reading. */
export interface Act2Note {
  id: string;
  anchorId: string;
  speaker: 'note' | 'cael';
  lines: string[];
  look?: 'page' | 'grave' | 'box';
  codexId?: string;
}

const n = (id: string, anchorId: string, speaker: 'note' | 'cael', lines: string[], look: Act2Note['look'] = 'page', codexId?: string): Act2Note =>
  ({ id, anchorId, speaker, lines, look, ...(codexId ? { codexId } : {}) });

export const ACT2_NOTE_LIST: Act2Note[] = [
  // M11: what happened on the road
  n('note-m11-waypost', 'cinderreach.m11.search.1', 'cael', [
    'The way-post is scorched black on the Harrowmark side. Someone chiselled "STILL 11 MILES" below the old mark, then ran out of time.',
  ]),
  n('note-m11-wreck', 'cinderreach.m11.search.2', 'cael', [
    'A Halvard supply wagon, on its side, wheels burned to iron rims. The grain sacks are empty and not from spilling: the slits are clean.',
    'Footmen did this, then. Whoever pays them wants the road dark.',
  ], 'box'),
  n('note-m11-courier', 'cinderreach.m11.search.3', 'note', [
    'A courier\'s satchel, still strapped to a dead man. The seal on the letter is Halvard grey: "To Reeve Osgar Thane at Cinderford. The waystones north of the Hushed Anvil have gone dark. Hold what you have. Do not send to Harrowmark for help, the road is not safe."',
    'It never reached him. The ink on the last line is smeared where he held it, dying.',
  ], 'page', 'lore.cinder-courier'),
  n('note-m11-scout', 'cinderreach.m11.search.4', 'cael', [
    'A scout in Halvard leather, face down in the dust. His crossbow has not been fired.',
    'In his belt pouch there is a Cooling Draught and a scrap of map. {name} takes the draught.',
  ], 'grave'),
  // M12: the barricade
  n('note-m12-roll', 'cinderreach.cinderford.barricade.1', 'note', [
    'Cinderford militia roll. Thirty-one names. Eleven struck through with a different hand and the word "gone".',
    'Below, in Osgar\'s square writing: "Whoever reads this and is not on the list: you are now."',
  ]),
  n('note-m12-tally', 'cinderreach.cinderford.barricade.4', 'note', [
    'A tally scratched on a cart-bed: one stroke for each brazier cart that came down the hill at the last raid. Seven strokes. Two crossed out, "stopped".',
    'Stopped by what? Someone has written "Shield, then a hammer", and under it, "or run".',
  ]),
  // R06: the well-house
  n('note-r06-rope', 'cinderreach.r06.wellhouse.1', 'cael', [
    'The well rope is dry-rotted to a black thread, and the bucket end has been burned clean through. Heat from below, not above.',
  ]),
  n('note-r06-bucket', 'cinderreach.r06.wellhouse.2', 'cael', [
    'A bucket left on the lip, a skin of ash floating in the last inch of water. It does not move when he tilts it.',
  ], 'box'),
  n('note-r06-tally', 'cinderreach.r06.wellhouse.3', 'note', [
    'The well-keeper\'s tally of the sick: forty-four marks in six days. The first column is labelled "fever". The last is labelled "the sleepers" and has no marks at all, only a drawn line.',
  ], 'page', 'lore.cinderford-well-rolls'),
  n('note-r06-prayer', 'cinderreach.r06.wellhouse.4', 'note', [
    '"Keep our water sweet, keep our fire low, keep the dead where they lie." The prayer-board has forty names pinned under it, some in children\'s hands.',
  ]),
  // M13: the brothers' hall
  n('note-m13-shield', 'cinderreach.m13.hall.1', 'cael', [
    'A shield on the hall wall, split by an axe stroke and mended with a hundred rivets. The hold paints the shields of the dead with the sign of the wearer\'s house. This one has been repainted many times.',
  ]),
  n('note-m13-cairn', 'cinderreach.m13.hall.2', 'cael', [
    'A cairn of river stones, one for every Stonefold warden who held the gate. Hrolf\'s father added the last. There is a space on top.',
  ], 'grave'),
  n('note-m13-rune', 'cinderreach.m13.hall.3', 'note', [
    'The rune-stone says, in the old warden script: "Who stands in the gap is the wall." Someone has scratched a second line under it, newer: "And the wall answers."',
  ], 'grave', 'lore.stonefold-rune'),
  // R11: the brother's last camp
  n('note-r11-camp-1', 'cinderreach.r11.camp.1', 'cael', [
    'A cold fire-ring and a bedroll slept in once. A whetstone, a quarter used. He had meant to come back to it.',
  ], 'box'),
  n('note-r11-camp-2', 'cinderreach.r11.camp.2', 'note', [
    'A page torn from a pocket book: "Day four. It does not come down to the pasture any more, only walks the shelf. I think it is guarding something. I will go up in the morning with the axe, for Hrolf, for the pay, and for the dull sound a sheep makes when it knows."',
  ]),
  n('note-r11-camp-3', 'cinderreach.r11.camp.3', 'cael', [
    'Scorch marks on the rock above, and below them a long groove where something heavy was dragged. One boot. Nothing else.',
  ], 'grave'),
  // M15: the hunters' ledgers
  n('note-m15-ledger', 'cinderreach.m15.search.1', 'note', [
    'A hunters\' ledger. "Ember wyrm, live, sold. Wyrm kit, three. Wyrm egg, none (the beast fought). Buyer\'s mark: a black anvil." Beside each line a price in a clerk\'s hand.',
    'The black anvil again. {name} has seen it on the Regent\'s invoices.',
  ]),
  n('note-m15-tally', 'cinderreach.m15.search.2', 'note', [
    'A tally board: "Hunters out: eleven. In: seven. Four lost to the pasture beasts, three of them dragons\' work." Under it, chalked: "Bonus, one gold per pelt".',
  ], 'box'),
  n('note-m15-map', 'cinderreach.m15.search.3', 'note', [
    'A map of Cinderreach with the wyrm dens marked in red and a route to Scorchhold in black. Every red circle has a little skull on it, and a date. The newest is yesterday.',
  ]),
  // D03: the keep papers
  n('note-d03-ledger', 'cinderreach.d03.keep.1', 'note', [
    'The fort ledger. Wyrmlings sold: nineteen in a season. Adults, two, "for the Deepdelve". Receipts countersigned with the black anvil and, twice, with a hand {name} half knows: Lord Aldous Grisel.',
  ]),
  n('note-d03-seal', 'cinderreach.d03.keep.2', 'cael', [
    'The buyer\'s seal, a black anvil in wax, lies in a locked drawer beside a spent taper. The hunters did not forge it. Someone sent it.',
  ], 'box'),
  n('note-d03-letters', 'cinderreach.d03.keep.3', 'note', [
    'Letters addressed to "Captain Redmane" in three hands. All say the same thing in different words: more, faster, no questions. One ends, "The Council will thank you when it is done," and is unsigned.',
  ]),
  n('note-d03-manifest', 'cinderreach.d03.keep.4', 'note', [
    'The cage manifest: sixteen wyrmlings logged, fourteen crossed through, two circled. "Hold these for the Deepdelve. Do not feed them before the cart comes." A cart date, a week old.',
  ], 'box'),
];

/**
 * Notes on the spot an NPC stands on (Ealdred, Wynne, Corwin; focus ties go to `npc:`). Each outranks its NPC only while
 * its read objective is current and it has not been read, and never while the NPC has a live talk objective (M13 `kin`
 * and R11 `widow` come before the reads): QuestNotes drops the priority otherwise (playtest NOTES_UNDER_NPCS).
 */
export const NOTES_UNDER_NPCS: ReadonlyMap<string, NonNullable<QuestNoteSpec['outranks']>> = new Map([
  ['note-m13-shield', { npcId: 'ealdred', quest: 'm13', objective: 'hall' }],
  ['note-r11-camp-1', { npcId: 'wynne', quest: 'r11', objective: 'camp' }],
  ['note-m15-map', { npcId: 'corwin', quest: 'm15', objective: 'ledgers' }],
]);

export const ACT2_QUEST_NOTES: QuestNoteSpec[] = ACT2_NOTE_LIST.map((x) => {
  const under = NOTES_UNDER_NPCS.get(x.id);
  return {
    interactableId: `use:${x.id}`, anchorId: x.anchorId, ...(x.codexId ? { codexId: x.codexId } : {}),
    ...(under ? { priority: 1, outranks: under } : {}),
  };
});

export const ACT2_NOTE_LOOKS: Record<string, 'page' | 'grave' | 'box'> = Object.fromEntries(
  ACT2_NOTE_LIST.map((x) => [`use:${x.id}`, x.look ?? 'page']),
);

/** The lore entries the Act 2 notes unlock (registered with the codex beside Act 1's). */
export const ACT2_NOTE_CODEX: string[] = [...new Set(ACT2_NOTE_LIST.flatMap((n) => (n.codexId ? [n.codexId] : [])))];
