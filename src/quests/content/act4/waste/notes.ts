// The readable search points of the Waste quests: one note per search beat (plan 7.1), each on an anchor that no NPC or prop
// shares (the note lint). Prose is invented (Q6) and logged under "Act 4 L11" in design/changes-applied.md.
import type { Act2Note } from '../../act2/notes';
import { W } from './ids';
import { M42_NOTES } from './m42.quest';
import { M43_NOTES } from './m43.quest';
import { M44_NOTES } from './m44.quest';
import { R25_NAME_NOTE, R25_REGISTER } from './r25.quest';
import { R24_SPRING_NOTE } from './r24.quest';
import { M45_PLAQUES, M45_SEARCHES } from './m45.quest';
import { D08_NOTES } from './d08.quest';
import { M46_LORE, M46_MARKS } from './m46.quest';

const n = (id: string, anchorId: string, speaker: 'note' | 'cael', lines: string[], look: Act2Note['look'] = 'page'): Act2Note =>
  ({ id, anchorId, speaker, lines, look });

const FAMILIES: readonly (readonly [string, string])[] = [
  ['A hearthstone with names scratched round its rim: Oswy, Hereswith, and three small marks with no names, only lines for heights.',
    'The Wardens of the north well. Ebba\'s list has them second. Someone swept this hearth not long ago.'],
  ['The lintel of the burned door is carved: "Cynric Fletcher and his house. We keep the arrows straight."',
    'The house of the arrow-makers. There are still fletchings in the ash, grey goose feathers turned to lace.'],
  ['A child\'s slate on the hearth, the letters half rubbed away: "EADBURH CAN COUNT TO A HUNDRED".',
    'The last of Ebba\'s three. The slate is warm. The ash round it is not.'],
];

export const WASTE_A4_NOTE_LIST: Act2Note[] = [
  // M42
  n(M42_NOTES.pack, `${W}.m42.pack`, 'note', [
    'A walker\'s pack, half buried, the strap cut clean. Inside: a rope-hook, two rain flasks, both empty, and a knotted cord.',
    'The cord is a message in knots. Three, a gap, three: "wall coming, hold the line". He did not hold it.',
  ], 'box'),
  n(M42_NOTES.knot, `${W}.m42.knot`, 'cael', [
    'A knot-sign tied to the post: four turns and a loop. Hild said four turns means "camp near".',
    'Someone has added a twist of red thread. Wulfhild\'s colour, Hild said. She came this way ahead of me.',
  ]),
  // M43
  n(M43_NOTES[0], `${W}.m43.count-stones`, 'note', [
    'A ring of flat stones, each scratched with tally marks. Hundreds of marks. Thousands.',
    'Every mark a wraith laid to rest, the walkers say. The oldest stones are worn smooth, the marks long gone.',
  ], 'grave'),
  n(M43_NOTES[1], `${W}.m43.spear-rack`, 'cael', [
    'Hrodna\'s spears: ash-wood shafts, glass points knapped from the Glasslands. No two the same length.',
    'Notches on each shaft. Not kills. Dances lost, the walker beside me says. Hrodna keeps count of those, not the others.',
  ]),
  // M44
  n(M44_NOTES.book, `${W}.m44.house.1`, 'note', [
    'A family book, the cover burned through: "Ebba, daughter of Eafa and Wiglaf, born in the thaw."',
    'Below it, in a different hand: "The tune is her grandmother\'s. Nobody knows where the grandmother had it from."',
  ]),
  n(M44_NOTES.cradle, `${W}.m44.house.2`, 'cael', [
    'A cradle, the wicker burned black, rocking very slightly in the wind through the wall.',
    'The nest was round it. The wraiths do not sleep, but they gather where people did.',
  ]),
  n(M44_NOTES.sampler, `${W}.m44.house.3`, 'note', [
    'A sampler in a cracked frame: a row of notes stitched in red, with words under them nobody wrote down in full.',
    '"...and the king beneath the anvil hums it too..." The rest of the line is scorched away.',
  ]),
  // R25
  ...FAMILIES.map(([a, b], i) => n(R25_NAME_NOTE(i + 1), `${W}.r25.name.${i + 1}`, i === 1 ? 'note' : 'cael', [a, b], 'grave')),
  n(R25_REGISTER, `${W}.r25.register`, 'note', [
    'The chapel register, kept by Sister Aedre since the blight came. Three pages are folded down at the corner.',
    'The Wardens, the Fletchers, the house of Eadburh. Beside each, today, in a child\'s hand: "candle lit".',
  ]),
  // R24
  n(R24_SPRING_NOTE, `${W}.r24.spring`, 'note', [
    'A cairn of glass over the spring, and a cord of knots round it: the walkers\' water-debt, counted cask by cask.',
    'The last knot is old and frayed. Nobody has brought water home from here since the storms came early.',
  ], 'grave'),
  // M45
  n(M45_PLAQUES[0], `${W}.m45.plaque.1`, 'note', [
    'The first Chime Key plaque: a row of marks in the walkers\' dust-chant, dots and strokes, with a pillar cut beside each.',
    'Four strikes. The same four notes Ebba hums before she loses the tune.',
  ]),
  n(M45_PLAQUES[1], `${W}.m45.plaque.2`, 'note', [
    'The second plaque: five strikes, the third one doubled. A diagonal stroke over the doubled mark.',
    'A diagonal stroke. Wulfhild says that is the second key: strike across, not down.',
  ]),
  n(M45_PLAQUES[2], `${W}.m45.plaque.3`, 'note', [
    'The third plaque: six strikes, and under them a line of old script: "Sing it whole and the glass will answer."',
    'The end of the tune. The part Ebba could never remember.',
  ]),
  n(M45_SEARCHES[0], `${W}.m45.search.1`, 'cael', [
    'A walker\'s chalk tally on a pillar\'s foot: tries, and failures. Dozens. The last line says "it answered, then stopped".',
    'Someone heard the voice before me. They stopped coming here after.',
  ]),
  n(M45_SEARCHES[1], `${W}.m45.search.2`, 'cael', [
    'A shard of the glass, fallen from a pillar. It rings faintly when I pick it up, though nothing struck it.',
    'Warm. Like the Heartshard is warm. I put it back where it lay.',
  ]),
  n(M45_SEARCHES[2], `${W}.m45.search.3`, 'note', [
    'A fourth plaque, cracked in two and left face down. On the back: "Do not answer it."',
    'The walkers did not carve this. The letters are older than the camp.',
  ], 'grave'),
  // D08
  n(D08_NOTES.bones, `${W}.d08.bones`, 'note', [
    'A pilgrim\'s bones by the narthex wall, still in a pilgrim\'s cloak, a candle stub in the hand.',
    'The cathedral took them all at once, the walkers say. Prayers at noon; ash by evening.',
  ], 'grave'),
  n(D08_NOTES.rope, `${W}.d08.rope`, 'note', [
    'The gong-rope, rotted through, and scratched on the stone beneath it in a walker\'s hand:',
    '"When he tolls, strike the Last Gong while it still hums. The bell answers the bell. Walkers who waited are with him now."',
  ]),
  n(D08_NOTES.tablets, `${W}.d08.tablets`, 'note', [
    'The crypt tablets: the priest-kings of the cathedral, eleven of them. The twelfth has no name, only a crown cut in the stone.',
    '"He would not lie down when the ash came. He tolled the dead up instead, and called it a congregation."',
  ], 'grave'),
  n(D08_NOTES.niche, `${W}.d08.niche`, 'cael', [
    'The crown\'s niche, empty, its velvet rotted to dust. He wore it out of here and never brought it back.',
    'The stone round it is scored with the same tune as Ebba\'s box. Even here.',
  ]),
  // M46
  n(M46_MARKS[0], `${W}.m46.mark.1`, 'cael', [
    'The cairn mark: a hand pressed into wet ash long ago, then fired hard. Each walker who passes lays a stone in the palm.',
    'I lay mine. The cairn-keeper nods once.',
  ], 'grave'),
  n(M46_MARKS[1], `${W}.m46.mark.2`, 'cael', [
    'The second cairn\'s mark has two hands, one small. A walker and a child, the keeper says. Nobody knows which.',
    'The small hand has a stone in it already. A new one.',
  ], 'grave'),
  n(M46_LORE[0], `${W}.m46.lore.1`, 'note', [
    'Cut into the last cairn: "Here the road ends that the first walkers walked. Above it is the fire that made us."',
    '"Go up only if you mean to put it out, or to feed it. There is no third thing to do at the rim."',
  ], 'grave'),
  n(M46_LORE[1], `${W}.m46.lore.2`, 'note', [
    'A stone by the Rimfoot fire, sooted black, with a line of the dust-chant scratched on it.',
    'Ebba\'s tune again, the whole of it, all three phrases. It was here all along, at the foot of the rim.',
  ]),
];
