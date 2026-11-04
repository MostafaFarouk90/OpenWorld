import type { Act2Note } from '../../act2/notes';
import { M23_CART, M23_MARKER, M23_PACK, M23_STONE } from './m23.quest';
import { M24_SOUNDINGS } from './m24.quest';
import { R12_NOTES } from './r12.quest';
import { M25_FIND, M25_SHELF } from './m25.quest';
import { R13_SEARCHES } from './r13.quest';
import { M26_SEARCHES } from './m26.quest';
import { M27_SEARCHES } from './m27.quest';
import { D05_SEARCHES } from './d05.quest';

const n = (id: string, anchorId: string, speaker: 'note' | 'cael', lines: string[], look: Act2Note['look'] = 'page', codexId?: string): Act2Note =>
  ({ id, anchorId, speaker, lines, look, ...(codexId ? { codexId } : {}) });

/** The ranger signs of R14: two a post, eight in all (they are K3's `greyfen.r14.sign.<post>.<n>`). */
const SIGNS: ReadonlyArray<readonly [string, string]> = [
  ['A ranger blaze cut into a post: three notches and a downward slash. The slash means "turned back". The knife that cut it was in a hurry.', 'A cold fire ring beside it, scattered by a boot. Somebody put it out before it had burned the supper.'],
  ['A bootprint pressed deep in the mud, toe turned toward the water. Two sets, one dragging.', 'A snapped bow-stave in the reeds, the string still tied. The wood is dry; it broke a week ago, not in the damp.'],
  ['A strip of green ranger cloth knotted on a reed, the knot a sailor\'s, not a ranger\'s. Someone was taught a trick in the dark.', 'Wax on the plank where a candle was stood and stolen again. The drips are still soft in the lee of the post.'],
  ['Three bolts stuck in the platform rail in a line, fletching up. A pattern: "danger north, hold fast".', 'Below, scratched small: "W. went to the fire. Do not follow. L., I am sorry."'],
  ['A water-skin hung on a nail, full. A ranger does not leave water behind unless he means to be fetched.', 'The knot on its cord is a ranger\'s hitch, tied by someone left-handed, which the patrol list says is Garrick.'],
  ['A ladder rung snapped and mended with reed-twine. The mending is neat. Whoever did it meant to stay.', 'Pressed into the mud under the platform, a ring of pale stones set to mark a camp that was never lit.'],
  ['A tally carved into the rail, thirty-one notches, the last seven struck through. The patrol was seven.', 'Under it, in charcoal: "The reeds have stopped moving. Listen for that."'],
  ['A sack of hard bread, untouched, tied to the rail with a ranger\'s knot and a scrap of green. A gift for whoever is sent.', 'A track runs from here to the east, a single set of boots, one heavy and one that favours a knee. It does not look chased.'],
];

/** Readable notes of the nine Greyfen quests: forty-two search points, each on a K3 anchor (or one of the extras) no NPC or prop shares. */
export const GREYFEN_NOTE_LIST: Act2Note[] = [
  // M23: the causeway and the shore
  n(M23_CART, 'greyfen.m23.search.1', 'cael', [
    'A hay-cart on its side in the causeway ditch, one wheel gone. The load is not hay: reed bundles, tied for a roof, and a child\'s bright ribbon on the tailboard.',
    'The axle snapped clean. Something heavy took the wheel and left the cart. Whatever it was did not take the ribbon.',
  ], 'box'),
  n(M23_MARKER, 'greyfen.m23.search.2', 'note', [
    'A causeway way-marker, carved with the fen\'s three signs: reed, heron, water. A fourth has been scratched in below, fresh: a ring with a line through it.',
    'It is a ranger\'s mark for "do not stop here". Whoever left it left it running.',
  ], 'grave'),
  n(M23_PACK, 'greyfen.m23.search.3', 'cael', [
    'A ranger\'s pack in the reeds, the straps cut rather than undone. Inside are a whetstone, a dry pair of socks and a half-written report.',
    '"Eleven nights at the Mere and the water has never been still. Not wind. Something is turning in it." The last line is a thumbprint of mud.',
  ], 'box'),
  n(M23_STONE, 'greyfen.m23.search.4', 'note', [
    'A waist-high stone on the shore, polished by water, cut with a long wavering line like a wave seen from the side. Moss has filled it green.',
    'The old people of the fen say a dragon once sang here and the stone remembers the tune. It is warm under the hand, as warm as a loaf.',
  ], 'grave', 'lore.fen-song-stone'),
  // M24: five mud soundings round the wreck
  ...M24_SOUNDINGS.map((id, i) => n(id, `greyfen.m24.sound.${i + 1}`, i % 2 ? 'note' : 'cael', [
    [
      'The pole goes in to the second mark and stops. Hard bottom, pebbled, with a long groove running toward the wreck.',
      'The pole goes in to the third mark. Soft silt, a hand deep, and under it ribs of a boat that is not the wreck.',
      'The pole slides in to the grip. A hole, not a bed. The water over it is warmer than the water around it.',
      'The pole comes up with weed wrapped round it and a rusted ferry-pin caught in the weed. Dudda\'s mark is stamped on the head.',
      'The pole strikes wood at the first mark, flat and wide: the lid of a chest, silted over. The hasp is shut.',
    ][i],
    [
      'Dudda will want the groove. A keel dragged it, a long time ago, toward the pool.',
      'It is an old wreck under the new one. The fen eats boats and does not forget them.',
      'Warm water rising from a hole in the bed. Hathren\'s breath, or the Mere\'s own heat finding a way out.',
      'The pin is a good one. He is going to be glad of it and sorry about where it was.',
      'Nothing inside that will open for a pole. It will keep until the ferry runs again.',
    ][i],
  ].slice(0, 2), i === 4 ? 'box' : 'page')),
  // R12: the cutters' leavings
  n(R12_NOTES[0], 'greyfen.r12.search.1', 'note', [
    'The cutters\' tally, chalked on a slate under a lean-to: "Bed one, ninety bundles. Bed two, ninety. Bed three, owed." Under the last, someone has scratched out "owed" and written "leeches".',
    'The sums are honest. The cutters did the work; it was the work that fought back.',
  ]),
  n(R12_NOTES[1], 'greyfen.r12.search.2', 'cael', [
    'A sickle cache under a floor of planks: six long reed-hooks, oiled and wrapped, hung where the damp cannot reach. One is missing from the row.',
    'The hooks are bright with use. Whatever is wrong with the beds, nobody put these down without a reason.',
  ], 'box'),
  n(R12_NOTES[2], 'greyfen.r12.search.3', 'cael', [
    'A leech nest at the bed\'s edge: a mound of black slime laced through the roots, humming faintly with the sound of too many small mouths.',
    'It stinks of old blood. They are not feeding on the reeds. They are feeding on the cutters who come to cut them.',
  ], 'grave'),
  // M25: three herbs where they grow, and Gytha's shelf
  n(M25_FIND[0], 'greyfen.m25.herb.1', 'cael', [
    'Bog myrtle: a grey-green shrub with a smell like crushed pepper and rain. Gytha called it the fen\'s honesty. It bruises the nose and clears the head.',
    'Leaves in pairs, not threes. The threes look the same and leave a rash. Pick it by the pairs.',
  ]),
  n(M25_FIND[1], 'greyfen.m25.herb.2', 'cael', [
    'Sundew: round red leaves thick with sticky dew, each bead holding a drowned gnat like a pearl. It closes slowly round what it catches.',
    'Gytha said to pick it before dawn, when it is slow. It is past dawn, and it is not slow.',
  ]),
  n(M25_FIND[2], 'greyfen.m25.herb.3', 'cael', [
    'Mire lily: a cup of pale petals on a dark stalk, floating the way a lamp floats on a dark room. It closes if shadowed.',
    'The root is the part that is wanted, so it must come up whole and wet. Gytha wants it before the light turns.',
  ]),
  n(M25_SHELF, 'greyfen.m25.shelf', 'note', [
    'Gytha\'s shelf of old salves: jars with wax lids, labelled in a hand that grows shakier with each year. "For burns of the wood. For burns of the iron. For burns of the sun."',
    'The last jar has no label and no lid, and nothing in it but a scraped ring where something once was. She has put a clean cloth over it, as one covers a face.',
  ], 'box'),
  // R14: the eight ranger signs
  ...SIGNS.map(([a, b], i) => n(`note-r14-sign-${Math.floor(i / 2) + 1}-${(i % 2) + 1}`, `greyfen.r14.sign.${Math.floor(i / 2) + 1}.${(i % 2) + 1}`, i % 2 ? 'cael' : 'note', [a, b])),
  // R13: the chapel
  n(R13_SEARCHES[0], 'greyfen.r13.search.1', 'note', [
    'The hymn board by the porch, the numbers still hung on their hooks. Four hymns for a flood, none for a calm.',
    'The last number is "7". Under it, scratched small: "7 is the water-song. The monks sang it to the mother of the fen. She sang back."',
  ]),
  n(R13_SEARCHES[1], 'greyfen.r13.search.2', 'cael', [
    'The font is full to the brim of black water that does not move. On its rim is a pewter cup chained to the stone, and a knotted rope tied round the stem.',
    'Eleven knots. One for each night the nave stood dry after the flood, if the chalk on the wall is right.',
  ], 'box'),
  n(R13_SEARCHES[2], 'greyfen.r13.search.3', 'cael', [
    'The bell rope hangs from a beam into the water, its end frayed to a brush. The bell it called is in the tower above, which no one has climbed since.',
    'The rope is tied off in a lover\'s knot. A bell-keeper tied it, meaning to be back.',
  ], 'grave'),
  n(R13_SEARCHES[3], 'greyfen.r13.search.4', 'note', [
    'A carving on the altar front, sunk deep: a long creature coiled in water, its mouth open on a single line of notes. The notes are cut in a key as plain as a ladder.',
    'Four steps up, a pause, two steps down. The carver has put a small figure at the side beating it out on his knee.',
  ], 'grave', 'lore.hathren-lullaby'),
  n(R13_SEARCHES[4], 'greyfen.r13.search.5', 'note', [
    'The flood ledger, its pages swollen and stuck. The last entry is a day\'s date and "Water at the second step. The bell is rung."',
    'The next page is blank, and under it, in a different hand: "We did not stay for the third step."',
  ]),
  // M26: five things on the shore
  ...M26_SEARCHES.map((id, i) => n(id, `greyfen.m26.search.${i + 1}`, i % 2 ? 'note' : 'cael', [
    [
      'The knots on the net-ropes are not fen knots. They are tied in the hunters\' hitch, four turns and a tuck, cinched by someone who has done it ten thousand times.',
      'A sack of lead weights, new, the lead still bright. Enough to sink a net and hold a dragon\'s neck down.',
      'A hunters\' tally on a plank: "Quench-Tongue. Long. Heavy. Buyer pays double for the scale." The plank is signed with a seal, half burnt off.',
      'A harpoon snapped at the barb, the head lodged in a net-rope. The wood is split from the inside, as if the weapon had been bitten in half.',
      'The bed where Hathren lay: a hollow in the shingle, wide as a barn floor, the stones polished and warm. A single scale is wedged in the gravel, grey-green, big as a shield.',
    ][i],
    [
      'The bowline is a fisherman\'s. This is a hunter\'s knot, trained into an apprentice to hold a rope against a living weight.',
      'They meant to keep her down. Nobody brings so much lead to net a fish.',
      'A buyer, then. Somewhere south, someone has been told a number for a dragon\'s scale.',
      'She bit it. Gytha was right: she is not only grief, she is awake.',
      'It is warm and faintly humming. Taking it would feel like taking a coin from the dead. Leaving it would feel worse.',
    ][i],
  ], i === 4 ? 'grave' : i === 1 ? 'box' : 'page')),
  // M27: four things in the reeds
  n(M27_SEARCHES[0], 'greyfen.m27.search.1', 'cael', [
    'Brood nets staked in the shallows, each loop sized for a wyrmling\'s neck. Fresh stakes, shaved bright, cut with a hand-axe.',
    'No dragon fights these. They are for the young, who cannot fight them.',
  ], 'box'),
  n(M27_SEARCHES[1], 'greyfen.m27.search.2', 'note', [
    'The buyer\'s seal, struck in wax on a letter case: a black tower over three wavy lines. A dealer\'s mark, pressed in a hurry.',
    '"Brood of five, live, before the Feast of Ash. Payment on delivery, nothing before. Do not damage the scale." The ink has dried to rust.',
  ], 'page', 'lore.buyers-seal'),
  n(M27_SEARCHES[2], 'greyfen.m27.search.3', 'note', [
    'The hunters\' map, pinned to a stake and weighted with a stone. The Mere is drawn as a fat blue coin; the reeds as green dashes; the cages as three small squares.',
    'A fourth square is inked in beside the third, newly, and left unlabelled. A fourth cage will be needed.',
  ]),
  n(M27_SEARCHES[3], 'greyfen.m27.search.4', 'cael', [
    'A cage tally nailed to a post: five strokes, three crossed out. Beside each crossed stroke, a small drawing of a wyrmling\'s eye.',
    'Three of five already gone to the south. Two left in the cages, and one more that was never counted.',
  ], 'grave'),
  // D05: four things in the Deeps
  n(D05_SEARCHES[0], 'greyfen.d05.search.1', 'note', [
    'The monk\'s log, bound in oiled skin, the water only a few drops through the cover. "The abbot says the sluices were built to drown a dragon. I said a dragon is not so easily kept."',
    'The last entry: "She has gone. We were wrong about her. The water keeps singing and nobody is there to hear it."',
  ]),
  n(D05_SEARCHES[1], 'greyfen.d05.search.2', 'cael', [
    'A drowned reliquary, its lid half off, full of silt and small brass keys. Each key is labelled with a gate: "first", "second", "arena".',
    'A rusted chain hangs from the roof, and from the chain a lantern with the flame still guttering under the water. It should not be possible.',
  ], 'box'),
  n(D05_SEARCHES[2], 'greyfen.d05.search.3', 'note', [
    'Flood marks on the wall: three lines, each with a date and a name. The third is the lowest and the newest, and the name beside it has been scratched out and carved again.',
    'The carving says "Murkjaw". The date is not a date. It is a word: "still".',
  ], 'grave'),
  n(D05_SEARCHES[3], 'greyfen.d05.search.4', 'cael', [
    'Murkjaw\'s spoil, piled against the arena wall: broken spears, a monk\'s staff, a child\'s toy boat. All of it picked clean of flesh.',
    'He keeps what the Deeps gives up. He has kept it a long time. He has been waiting for something to put in the pile that fights back.',
  ], 'grave'),
];
