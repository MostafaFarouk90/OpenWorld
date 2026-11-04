import type { Act2Note } from '../../act2/notes';
import { M31_RELICS } from './m31.quest';
import { M32_HOARD } from './m32.quest';
import { M33_CAMP } from './m33.quest';
import { M34_CARVINGS, M34_MARKERS } from './m34.quest';
import { D06_AERIE, D06_FEED_LOG, D06_KEEP } from './d06.quest';

const n = (id: string, anchorId: string, speaker: 'note' | 'cael', lines: string[], look: Act2Note['look'] = 'page'): Act2Note =>
  ({ id, anchorId, speaker, lines, look });

/** Readable notes of the five summit quests: twenty search points, each on a K4 anchor no NPC or prop shares. */
export const SUMMIT_NOTE_LIST: Act2Note[] = [
  // M31: the roost climb
  n(M31_RELICS[0]!, 'dragonspine.roost.claw-ledge', 'cael', [
    'The ledge is scored with four long furrows, each as wide as my hand and deep enough to lose a finger in. Something very large landed here, and held on.',
    'The scoring is old and weathered smooth. She has been landing on this stone for longer than the lodge has had a roof.',
  ]),
  n(M31_RELICS[1]!, 'dragonspine.roost.horn', 'cael', [
    'A hunter\'s horn lies in the scree beside what is left of its owner. The mouthpiece is split. He blew it once, I think, and it was the last thing he did.',
    'There is no burn on him, and no bite. The bones lie as if he sat down on the ledge to look at the view. Perhaps she let him.',
  ], 'grave'),
  n(M31_RELICS[2]!, 'dragonspine.roost.scale', 'note', [
    'A single shed scale lies on the arena\'s lip, the size of a shield and the colour of cooled slag. It is warm when I lay my palm on it, though the wind here would freeze a river.',
    'The edge is not broken. It was let go, the way a tree lets go of a leaf. I will carry it down; I do not think she would mind.',
  ], 'box'),
  // M32: the hoard
  n(M32_HOARD[0]!, 'dragonspine.hearth.hoard.search.1', 'cael', [
    'A smith\'s hammer, its haft long since burnt to a stub, lies at the foot of the heap. The head is stamped with the sign of the Forge: a crown above two crossed anvils.',
    'Whoever swung it was a crown-smith, and a good one. The face is worn to a mirror from working metal that no mortal furnace could melt.',
  ]),
  n(M32_HOARD[1]!, 'dragonspine.hearth.hoard.search.2', 'cael', [
    'A broken chain, every link as thick as my wrist, lies coiled in the gold like a sleeping snake. The last link is not snapped. It is opened, cleanly, with a smith\'s tool.',
    'This was not taken from a prisoner. It was taken off by someone who had the right to unlock it, and who left it here for her to find.',
  ]),
  n(M32_HOARD[2]!, 'dragonspine.hearth.hoard.search.3', 'note', [
    'The old gold. Coins the Council has never minted, bars stamped with a dead king\'s mark, a heap of rings and clasps with their gems prised out. Not a single piece is clean.',
    'Every coin has been warmed, one at a time, by someone lying on them. It is not a dragon\'s greed. It is a dragon\'s keeping.',
  ], 'box'),
  // M33: Skyhold's camp
  n(M33_CAMP[0]!, 'dragonspine.skyhold.search.1', 'note', [
    'The rigging plan, inked on a table-sized hide: six anchor points across the spur, a net of tarred rope between them, and a note in a clerk\'s hand. "Dead wyrmlings pay by weight. Take them in the net. Do not damage the scale."',
    'At the foot, a second hand has written, "Anchor six first, or the whole span sags." The anchors are the way in.',
  ]),
  n(M33_CAMP[1]!, 'dragonspine.skyhold.search.2', 'cael', [
    'A wax seal pressed into a lead tag: Vey\'s crest, a rose with a thorn through it. The same seal is on the tally, on the rope and on the crate of bolts beside it.',
    'The Council did not hire these hunters. The Lord-Regent did, and the Council signed to say it had not noticed.',
  ]),
  n(M33_CAMP[2]!, 'dragonspine.skyhold.search.3', 'note', [
    'A map of the Aerie, scratched on a flat stone with a hunting knife: the landing, the gate, the courtyard, and a keep with its door drawn open. A cross marks the courtyard.',
    'Beside the cross someone has written a single word: "Skarl." He is the one they take their orders from.',
  ]),
  n(M33_CAMP[3]!, 'dragonspine.skyhold.search.4', 'cael', [
    'A coil of Vey rope, new, black with tar, still tagged with the Greyfen rope-walk\'s mark. It has not been near the mountain a month.',
    'Somebody bought a great deal of it. The ropes at the anchors were cut to length from this very coil.',
  ], 'box'),
  n(M33_CAMP[4]!, 'dragonspine.skyhold.search.5', 'note', [
    'A net-maker\'s tally, sixty-one strokes in five columns. The first columns are rope. The last two columns are headed "small" and "large", and each stroke under them is a wyrmling.',
    'The small column ends at nineteen. Someone has underlined the figure and drawn a very small, very sad face beside it.',
  ]),
  // M34: the Hearth's carvings and the glide markers
  n(M34_CARVINGS[0]!, 'dragonspine.hearth.carving.1', 'cael', [
    'A keeper carved in the ring: a wyrm bent over a small flame, her wing curled round it like a hand round a candle. The old tongue beneath reads, "Tend what you did not light."',
  ], 'grave'),
  n(M34_CARVINGS[1]!, 'dragonspine.hearth.carving.2', 'cael', [
    'A second carving, a smith and a wyrm side by side at a single anvil. Neither is above the other. The old tongue reads, "The hammer and the coal are one craft."',
  ], 'grave'),
  n(M34_CARVINGS[2]!, 'dragonspine.hearth.carving.3', 'cael', [
    'The third shows the Hearth itself, lit, with many wyrms at its rim, wings folded, heads bowed. The old tongue reads, "Kneel to nothing but the work."',
  ], 'grave'),
  n(M34_CARVINGS[3]!, 'dragonspine.hearth.carving.4', 'cael', [
    'The fourth is the last, and the stone is worn flat where a hand has rubbed it for centuries. I can read only a few words. "When the fire is low, call the one who carries the shard."',
  ], 'grave'),
  n(M34_MARKERS[0]!, 'dragonspine.hearth.glide-marker.1', 'note', [
    'A glide marker: a pole of pale wood with a pennant of rime-grass tied at its head, set where the updraft begins. A keeper\'s mark, and a hunter\'s: someone has hung a cloth ribbon on it for luck.',
    'The wind on the pennant stands straight up. The air here wants to carry a body into the sky.',
  ]),
  n(M34_MARKERS[1]!, 'dragonspine.hearth.glide-marker.2', 'note', [
    'The second marker stands at the far lip of the basin, above the drop. Its pennant has been mended three times in three different threads.',
    'The updraft off the Hearth is steady enough to trust. The markers are for the ones who do not know how to read the air.',
  ]),
  // D06: Skarl's keep and the Aerie
  n(D06_KEEP[0]!, 'dragonspine.keep.search.1', 'note', [
    'Skarl\'s orders, written on the desk in a hunter\'s block hand. "The drake stays chained until the last roost is cleared. Take no prisoners from the lodge. Burn the maps."',
    'The last line is underlined. "The Hunt-Marshal answers to Vey, and to no one else."',
  ]),
  n(D06_KEEP[1]!, 'dragonspine.keep.search.2', 'note', [
    'The buyer\'s ledger lies open on the map table. A column of dates, a column of weights and a column of names, each name a house in the Greyfen or the south. The largest sums go to Vey.',
    'Beside the last entry, a dead wyrm\'s scale is pinned to the page as a receipt.',
  ]),
  n(D06_KEEP[2]!, 'dragonspine.keep.search.3', 'note', [
    'A letter in Vey\'s hand, sealed and opened again. "Marshal, the north is yours. Do what you must with the dragons. The Council will hear that there were none."',
    'It is not signed, but it does not need to be. Nobody else writes the word "none" like that.',
  ]),
  n(D06_AERIE[0]!, 'dragonspine.aerie.search.1', 'note', [
    'A list of nests, scored on a plank nailed to the wall: forty-one marks, a third of them crossed out. Each mark is a roost the hunters found. Each cross is one they burned.',
    'Under the list, in charcoal, a single line has been added by a different hand: "How many did we make?"',
  ]),
  n(D06_AERIE[1]!, 'dragonspine.aerie.search.2', 'cael', [
    'A tally board by the courtyard wall: names, wages, the number of days a man has served the Marshal. Some of the names have been struck through, with the word "deserted" beside each.',
    'Most of the entries are young. The last name added has not been struck through yet. It has a small, uncertain tick beside it.',
  ]),
  n(D06_FEED_LOG[0]!, 'dragonspine.aerie.chain-post', 'note', [
    'The drake\'s feed log, hung on the chain post. A hunter\'s hand: "Fed half. Fed none. Fed half." The scribbles go back a year and a half, and the entries grow smaller.',
    'Under the last, scratched into the wood where the chain bites: "Sorry." The writer\'s name is not given.',
  ]),
];
