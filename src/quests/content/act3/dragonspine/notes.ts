import type { Act2Note } from '../../act2/notes';
import { M28_CLIMBER, M28_MARKER, M28_PACK, M28_ROPE } from './m28.quest';
import { M29_TROPHIES } from './m29.quest';
import { R16_CHAMBER_NOTES, R16_PASSAGE_NOTES } from './r16.quest';
import { M30_MARKS } from './m30.quest';
import { R18_CAMP_NOTES } from './r18.quest';

const n = (id: string, anchorId: string, speaker: 'note' | 'cael', lines: string[], look: Act2Note['look'] = 'page', codexId?: string): Act2Note =>
  ({ id, anchorId, speaker, lines, look, ...(codexId ? { codexId } : {}) });

/** Readable notes of the seven lower Dragonspine quests: twenty-one search points, each on a K4 anchor no NPC or prop shares. */
export const DRAGONSPINE_NOTE_LIST: Act2Note[] = [
  // M28: the four cairns on the trail to the Hawk Crag
  n(M28_CLIMBER, 'dragonspine.m28.cairn.1', 'cael', [
    'A climber, sitting upright against the cairn, frozen the way a candle freezes. His pack is still on, his hands still tucked in his sleeves.',
    'No wound on him. He sat down to rest on the way up, and the cold finished the thought for him.',
  ], 'grave'),
  n(M28_ROPE, 'dragonspine.m28.cairn.2', 'cael', [
    'An iron rope anchor driven into the rock, the rope gone to a rind of frost. The knot at the ring is a hunter\'s, tied fast and untied by no one.',
    'Whoever hung from it did not fall. The rope was cut from above, close and clean. Knife work.',
  ]),
  n(M28_PACK, 'dragonspine.m28.cairn.3', 'cael', [
    'A hunter\'s pack, torn open along the seam. Every ration is gone, pecked to crumbs and scattered, and the bone-white feathers in the snow are not a crow\'s.',
    'Rime hawks. They go for food first, and for whoever carries it second.',
  ], 'box'),
  n(M28_MARKER, 'dragonspine.m28.cairn.4', 'note', [
    'A rime marker, a flat stone cut with the lodge\'s sign: a hawk, a spear and a line pointing up. Under it a hunter\'s hand has scratched, "Last good ground. The crag is worse than it looks."',
    'Frost has crept into the letters and made them softer. Someone has been leaving a coin here for luck, one for every year.',
  ], 'grave'),
  // M29: the five trophies on Eadgyth's wall
  n(M29_TROPHIES[0], 'dragonspine.shelter.trophy.1', 'cael', [
    'A dragon\'s tooth the length of a forearm, ridged and yellow, mounted on a nail. The tag under it is in a neat hand: "Winter of the long ice. Mine."',
    'The root is chipped. Something bit down on a spear and broke the tooth to save the spear.',
  ], 'box'),
  n(M29_TROPHIES[1], 'dragonspine.shelter.trophy.2', 'cael', [
    'An old harpoon on two pegs, its head dull with years. The line is rotted to a few strands, but the barbs are bright where someone has oiled them every spring.',
    'There is a notch in the shaft for every hunter who held it. Seven notches. The eighth has been filed smooth.',
  ]),
  n(M29_TROPHIES[2], 'dragonspine.shelter.trophy.3', 'cael', [
    'A child\'s drawing, pinned in a rough frame: a stick figure with a large axe beside a red shape with wings, both smiling. The paper has gone brown at the edges.',
    'It is signed with a name in a child\'s round letters, and it has been kept out of the wet for a very long time.',
  ], 'page'),
  n(M29_TROPHIES[3], 'dragonspine.shelter.trophy.4', 'note', [
    'A map of old roosts, drawn in charcoal on tanned hide: twelve small circles on the ridge, each crossed out but one. The one left standing sits above the lodge, on the peak.',
    'In the margin, in the same hand: "They do not come down any more. Do not go up."',
  ], 'page'),
  n(M29_TROPHIES[4], 'dragonspine.shelter.trophy.5', 'cael', [
    'A hunting tally, a plank scored with fives, season after season of them. At the bottom the scoring stops mid-row, as if the knife was put down and not picked up again.',
    'There are more marks than a single hunter could make. They are mostly hers. Beside the last, in a thin hand: "No more."',
  ]),
  // R16: the collapsed cave, two before the rockfall and four past it
  n(R16_PASSAGE_NOTES[0], 'dragonspine.cave.search.1', 'cael', [
    'Cave-in markers: three blazes of red paint on the wall, each crossed through, and a hunter\'s warning chalked beneath. "Roof has talked twice. Do not breathe loud."',
    'The passage ahead narrows to a crawl. Whoever painted these walked in knowing it might bring the roof down.',
  ]),
  n(R16_PASSAGE_NOTES[1], 'dragonspine.cave.search.2', 'cael', [
    'A hunter\'s bones against the wall, the leather long since gone. His hand still rests on his belt, and on the belt is an empty scabbard for a longer blade than any hunter carries.',
    'He was not killed here. He lay down and was not found. Eadgyth never said she had left anyone behind.',
  ], 'grave'),
  n(R16_CHAMBER_NOTES[0], 'dragonspine.cave.search.3', 'cael', [
    'A scabbard, hide over wood, lying where it was dropped. The sling is cut. The mouth is stretched wide, the way a scabbard stretches when a blade is pulled out in a hurry.',
    'There is a stamp on the throat: a frost-brow and three lines. The axe was drawn here and not sheathed again.',
  ], 'box'),
  n(R16_CHAMBER_NOTES[1], 'dragonspine.cave.search.4', 'cael', [
    'A scratch in the stone wall, four furrows each a hand wide and as deep as a finger. At the end of each, the rock has been burned to glass.',
    'It is not a bear\'s. It is not a hawk\'s. It is the shape the old hunters drew when they drew the wyrm\'s claw.',
  ]),
  n(R16_CHAMBER_NOTES[2], 'dragonspine.cave.search.5', 'cael', [
    'An old campfire, three stones and a ring of soot. The fuel is hide, not wood. Someone burned their gear to stay warm and stay hidden.',
    'The ash is cold. Under it, a bone needle and a tin cup bent flat, as though sat upon in the dark.',
  ]),
  n(R16_CHAMBER_NOTES[3], 'dragonspine.cave.search.6', 'note', [
    'Cut into the rock with a knife point, small and careful: an E, and beside it an F, and a date forty winters gone. The F is a sharp, hurried stroke.',
    'Under them, in the same hand, scratched much later: "I left it in the dark. It is where it should be."',
  ], 'grave'),
  // M30: the two keeper marks at the Last Anvil
  n(M30_MARKS[0], 'dragonspine.anvil.mark.1', 'note', [
    'A keeper\'s mark in the stone beside the Anvil: a circle, a bar through it, and three dots over. Ansgar calls it "the open door".',
    'The edges are crisp. This one was cut in the last hundred years, by someone who was told what it meant and cut it anyway.',
  ], 'grave'),
  n(M30_MARKS[1], 'dragonspine.anvil.mark.2', 'note', [
    'A second mark, older, worn almost smooth: the same circle, the bar through it, and a hammer where the dots should be.',
    'Ansgar says the keepers cut them in pairs, an old one and a new one, so that anyone reading the stone knows the work has not stopped.',
  ], 'grave'),
  // R18: the thief's camp
  n(R18_CAMP_NOTES[0], 'dragonspine.hawk.camp.search.1', 'cael', [
    'A grain sack lined with straw, three feathers caught in the weave. Inside, a leather strap and a coil of fine cord, cut to fit an egg.',
    'He did not take eggs for sale. He was careful. Whatever he wanted them for, he wanted them whole.',
  ], 'box'),
  n(R18_CAMP_NOTES[1], 'dragonspine.hawk.camp.search.3', 'cael', [
    'A bed of straw laid out in a ring, with a worn hollow in the middle. A nest, made by hand, and made well.',
    'The hollow is still faintly warm from the body that sat in it. He has been trying to hatch them himself.',
  ], 'box'),
  n(R18_CAMP_NOTES[2], 'dragonspine.hawk.climb.1', 'cael', [
    'Boot tracks in the snow, going up toward the cliff and down again, always the same path. Beside each print is a small neat mark where a stick was set.',
    'He climbed it forty times or more. He has gone up that path in the dark, and the hawks have let him.',
  ]),
  n(R18_CAMP_NOTES[3], 'dragonspine.hawk.camp.search.4', 'cael', [
    'A broken shell, pale blue and speckled grey, no bigger than two cupped hands. The inside is clean, with no yolk and no chick.',
    'It cracked in his pack. He kept the pieces, wrapped in cloth, and laid them where he could see them.',
  ], 'box'),
];
