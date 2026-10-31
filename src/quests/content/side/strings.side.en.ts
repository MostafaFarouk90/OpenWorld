// Act 1 side jobs (j01 to j11): objective lines, prompts, codex lines and dialogue. Registered like the density tables:
// `questStringsSide` is spread into src/quests/strings.en.ts and `dialogueStringsSide` into src/dialogue/strings.en.ts.
// Voice: plain, warm, a little wry; ash, forge and hearth. No em dashes, and the player is {name}.

export const questStringsSide: Record<string, string> = {
  // ---- j01 Hob's Strayed Lambs ----
  'quest.j01.title': "Hob's Strayed Lambs",
  'quest.j01.summary': 'Three of Hob Waygrey\'s lambs went through the fence the night the ash came down. He cannot leave the waystone, so he asks you to bring them back to the fold.',
  'quest.j01.scar': 'Look for a lamb on the scorched stubble east of the barley',
  'quest.j01.scarecrows': 'Look for a lamb among the scarecrows',
  'quest.j01.ford': 'Look for a lamb at the stepping stones of the lane drain',
  'quest.j01.lambs': "Carry the three lambs to Hob's fold",
  'quest.j01.report': 'Tell Hob his lambs are home',
  'quest.prompt.lamb': '{key} Pick up the lamb',

  // ---- j02 Edda's Bread Round ----
  'quest.j02.title': "Edda's Bread Round",
  'quest.j02.summary': "Edda has baked three loaves for the doors that went hungry in the ash: the widow at the lane's end, the miller at the chapel and the chapel sexton. She asks you to carry them round.",
  'quest.j02.basket': "Take the basket from the bakery step",
  'quest.j02.aldwin': 'Take a loaf to Aldwin the miller',
  'quest.j02.orla': "Take a loaf to Orla Pike at the lane's end",
  'quest.j02.osmund': "Take a loaf to Sexton Osmund by the chapel",
  'quest.j02.edda': 'Tell Edda how the round went',
  'quest.prompt.basket': '{key} Take the basket',

  // ---- j03 Waystones of the Dead Road ----
  'quest.j03.title': 'Waystones of the Dead Road',
  'quest.j03.summary': 'Two older waystones stand off the Dead Road, cut by a careful hand: one on a bluff above its western end, one at a barrow further east. Find both and learn what they were for.',
  'quest.j03.bluff': 'Read the stone on the bluff (a Surge Leap reaches it)',
  'quest.j03.wake': 'Lay the barrow wraiths to rest',
  'quest.j03.tablet': 'Read the tablet at the barrow',
  'codex.lore.dead-road-waystones.name': 'The Older Waystones',
  'codex.lore.dead-road-waystones.body': 'Two waystones stand off the Dead Road, older than the road and cut in one careful hand. One watches from a bluff above its western end; the other leans against a barrow. They say the road begins where the living look back, and that the stones were set for the dead who needed telling the way home.',

  // ---- j04 Tobb's First Verse ----
  'quest.j04.title': "Tobb's First Verse",
  'quest.j04.summary': 'Tobb Fenwick has the ends of his ballad and no middle. He wants a line about the knighting, and an old fire ring on the Dead Road to sing it by.',
  'quest.j04.fire': 'Light the old fire ring on the road to the Quenchstone',
  'quest.j04.verse': 'Give Tobb his line about the knighting',
  'quest.prompt.fireRing': '{key} Light the fire ring',

  // ---- j05 Rook's Board: The Guild Hound ----
  'quest.j05.title': "Rook's Board: The Guild Hound",
  'quest.j05.summary': "A notice on Captain Rook's board by the Watch Barracks: Godric the Pie-Man's dog Crumb slipped his rope in the Guild Quarter. Godric will say where he likes to go.",
  'quest.j05.notice': "Read the notice about the lost dog on Rook's board",
  'quest.j05.owner': 'Ask Godric the Pie-Man about his dog',
  'quest.j05.search1': 'Look for Crumb at the west stalls of the market ring',
  'quest.j05.search2': 'Look for Crumb in the yard behind the Guild houses',
  'quest.j05.search3': 'Look for Crumb in the lane by the Guildhall',
  'quest.j05.find': 'Find Crumb',
  'quest.j05.report': 'Tell Godric his dog is home',

  // ---- j06 Rook's Board: The Smith's Crate ----
  'quest.j06.title': "Rook's Board: The Smith's Crate",
  'quest.j06.summary': "Master Smith Dunstan Ironside left a crate of bar iron on a hand-cart by the old smelter yard when the wheel went. The board asks for a strong back.",
  'quest.j06.notice': "Read the smith's notice on Rook's board",
  'quest.j06.smith': 'Ask Dunstan Ironside about the crate',
  'quest.j06.crate': "Carry the crate from the old smelter yard to Dunstan's forge",
  'quest.j06.report': 'Tell Dunstan his iron is home',
  'quest.prompt.crate': '{key} Lift the crate',

  // ---- j07 Rook's Board: Candles for the Chapel ----
  'quest.j07.title': "Rook's Board: Candles for the Chapel",
  'quest.j07.summary': 'The three niches in the Harrowmark chapel wall have gone dark for want of candles, and the sexton cannot leave the door. The chandler keeps a stall at the chapel approach.',
  'quest.j07.notice': "Read the chapel's notice on Rook's board",
  'quest.j07.candles': "Take a bundle of candles from the chandler's stall",
  'quest.j07.niche1': 'Light a candle in the first niche',
  'quest.j07.niche2': 'Light a candle in the second niche',
  'quest.j07.niche3': 'Light a candle in the third niche',
  'quest.j07.report': 'Tell the sexton the niches are lit',
  'quest.prompt.candles': '{key} Take a bundle of candles',
  'quest.prompt.niche': '{key} Light a candle',
  'codex.lore.chapel-niches.name': 'The Niches of the Chapel',
  'codex.lore.chapel-niches.body': "Three niches in the Harrowmark chapel's east wall hold candles for those the city buried, those it could not bury, and those the Ash kept. The sexton lights them when he can afford the wax. A knight with a free evening lit them when he could not.",

  // ---- j08 Watch Patrol ----
  'quest.j08.title': 'Watch Patrol',
  'quest.j08.summary': "Rook's sergeant is short of men for the lane loop, and a pair of purse-lifters is working the Forge Row end. He asks you to walk the loop in the Watch's place.",
  'quest.j08.orders': "Hear the sergeant's orders at Rook's board",
  'quest.j08.lane1': 'Walk to the Main Street lane',
  'quest.j08.lane2': 'Walk to the Forge Row end',
  'quest.j08.bark1': 'Ask the smith what he has seen on the Row',
  'quest.j08.lane3': 'Walk to the Tilted Anvil yard',
  'quest.j08.bark2': 'Ask Aldith what she has seen at the Anvil',
  'quest.j08.lane4': 'Walk to the alley behind the Anvil',
  'quest.j08.cutpurses': 'Break up the cutpurse pair (a Spare counts)',
  'quest.j08.report': 'Report to the sergeant',

  // ---- j09 Stane's Open Board ----
  'quest.j09.title': "Stane's Open Board",
  'quest.j09.summary': 'Marshal Stane keeps an open board in the Halvard Bastion yard: three bouts against yard veterans, a word between each, and a small purse from the house when the third is done.',
  'quest.j09.bout1': 'Spar with the first yard veteran (Spare him when he yields)',
  'quest.j09.word1': 'Hear Stane out',
  'quest.j09.bout2': 'Spar with the second yard veteran',
  'quest.j09.word2': 'Hear Stane out again',
  'quest.j09.bout3': 'Spar with the third yard veteran',
  'quest.j09.close': "Hear Stane's closing word",
  'codex.lore.halvard-open-board.name': "The Bastion's Open Board",
  'codex.lore.halvard-open-board.body': "Marshal Stane keeps an open board in the Halvard Bastion yard: three bouts, no crowd. The house's old teaching is that a yielded man is a student and a spared one remembers it. A veteran beaten fairly goes home to tell the barracks which of the new knights can be taught.",

  // ---- j10 Tobb's Second Verse ----
  'quest.j10.title': "Tobb's Second Verse",
  'quest.j10.summary': 'Tobb has the knighting verse and wants one about Harrowmark. He asks for a line, and the fire ring in the Tilted Anvil yard to sing it by.',
  'quest.j10.fire': 'Light the fire ring in the Tilted Anvil yard',
  'quest.j10.verse': 'Give Tobb his line about Harrowmark',

  // ---- j11 The Crates' Cart Tracks ----
  'quest.j11.title': "The Crates' Cart Tracks",
  'quest.j11.summary': "Rook remembers a spur off the Underways, west of the first kennel, where the carts once turned aside. The Sewer Master Key opens the grate; the tracks lead on.",
  'quest.j11.listen': "Hear Rook's memory of the cart spur",
  'quest.j11.grate': 'Unlock the grate west of the first kennel with the Sewer Master Key',
  'quest.j11.track1': 'Follow the cart tracks to the first mark',
  'quest.j11.track2': 'Follow the cart tracks to the second mark',
  'quest.j11.hounds': 'Put down the hounds at the end of the tracks (a Spare counts)',
  'quest.j11.waybill': 'Read the waybill nailed to the last post',
  'quest.j11.report': 'Tell Rook what the tracks led to',
  'codex.lore.cart-tracks.name': 'The Cart Tracks',
  'codex.lore.cart-tracks.body': "A spur of the Underways keeps a pair of rusted cart tracks that run to a bricked-up door. A waybill nailed to the last post names the Crucible as the consignee, with a count of nine carts and no signature on the receipt.",
};

const P = (id: string, k: string) => `dialogue.${id}.${k}`;

export const dialogueStringsSide: Record<string, string> = {
  // ---- Hob: j01 ----
  [P('npc-hob', 'j01-offer')]: "{name} Brannoc. Good. You have a hand free and I have not. Three of my lambs went through the fence the night the ash came down, and I cannot leave the stone untended.",
  [P('npc-hob', 'j01-offer.where')]: 'Where would a lamb run to?',
  [P('npc-hob', 'j01-offer.why')]: 'Why not call them in?',
  [P('npc-hob', 'j01-offer.accept')]: 'I will bring them home.',
  [P('npc-hob', 'j01-offer.later')]: 'Not just now.',
  [P('npc-hob', 'j01-where')]: 'To whatever is warm, same as folk. The stubble scar east of the barley still holds the day. Another will be among the scarecrows, where the grass is greenest. The third will be at the stepping stones on the lane drain, bleating at its own face.',
  [P('npc-hob', 'j01-why')]: 'I have whistled my throat raw. A lamb that has had a fright goes deaf to the one voice it knows. It will take somebody else\'s arms.',
  [P('npc-hob', 'j01-yes')]: 'Bring them to the fold, east of the stone. They weigh nothing to a knight, but they have my whole winter in them.',
  [P('npc-hob', 'j01-later')]: 'They will not get cleverer by waiting, mind.',
  [P('npc-hob', 'j01-remind')]: 'Three lambs, {name}: the scar, the scarecrows, the drain stones. The fold is east of the stone.',
  [P('npc-hob', 'j01-back')]: 'Three, and all of them sulking. You did what a whistle could not.',
  [P('npc-hob', 'j01-back-2')]: 'There is a little coin in it for you. The stone will keep, but nobody should walk the road hungry.',

  // ---- Edda: j02 ----
  [P('npc-edda', 'j02-offer')]: "{name}, you have an hour and I have bread going cold. Three loaves for three doors, the way my mother did after a burning: Aldwin at the mill, Orla Pike at the lane's end, and Sexton Osmund by the chapel.",
  [P('npc-edda', 'j02-offer.accept')]: 'I will walk it round.',
  [P('npc-edda', 'j02-offer.later')]: 'Later, Mother.',
  [P('npc-edda', 'j02-yes')]: 'The basket is on the step. Say little and listen well. Folk pay for bread in news.',
  [P('npc-edda', 'j02-later')]: 'Bread keeps better than promises. Come back when you can.',
  [P('npc-edda', 'j02-remind')]: 'Mind the basket, {name}. Aldwin, Orla, the sexton, and back here while it is still warm in your head.',
  [P('npc-edda', 'j02-back')]: 'Back with an empty basket and a full face. Good. Did they eat?',
  [P('npc-edda', 'j02-left')]: 'Orla kept the spare, did she? She will not say so, but she will talk of it till Midwinter. That is how a hearth is kept, {name}.',
  [P('npc-edda', 'j02-kept')]: 'You kept the extra. Well. A loaf is a loaf, and you have a long road. I will bake Orla another, and she can have it with a sermon.',

  // ---- the three doors ----
  [P('npc-aldwin', 'j02-visit')]: "Edda's bread, and still warm! Set it on the sack. Flour is the one thing this mill has plenty of, and I have mouths to match. Tell her the stones are turning, and the first of the new wheat is hers.",
  [P('npc-orla', 'j02-visit')]: "Bread from Edda, and a spare wrapped in the cloth. For me? I only have myself to feed these days. My Piers used to say a hearth is not lit until someone comes up the lane with something warm. Give the spare to a door with children.",
  [P('npc-orla', 'j02-visit.leave')]: "Keep it, Orla. Edda baked it for the lane's end.",
  [P('npc-orla', 'j02-visit.take')]: 'You are right. I will find a hungrier door.',
  [P('npc-orla', 'j02-left')]: 'Then it goes on the sill, for whoever passes. The lane end should have something warm in it.',
  [P('npc-orla', 'j02-kept')]: 'Take it, then. Hunger is rarely quiet. Tell Edda her crust is as good as her mother\'s, which I never said while her mother lived.',
  [P('npc-orla', 'idle')]: "The lane's quiet since the ash went. I sit out on the step. Someone has to be seen to be waiting.",
  [P('npc-osmund', 'j02-visit')]: 'From Edda? Then the chapel candles will have bread to burn by. I will set it on the altar rail until the Sister is done with the ash-folk. Tell her the sexton says her crust is better than his sermons.',
  [P('npc-osmund', 'idle')]: 'The candles want trimming and the pews want sweeping. Between the two, a sexton gets through the day.',

  // ---- j03 notes ----
  [P('note-j03-bluff', '1')]: 'A waystone, older than the road, set on the bluff to watch it. Cut into its foot in a careful hand: THE DEAD ROAD BEGINS WHERE THE LIVING LOOK BACK.',
  [P('note-j03-bluff', '2')]: 'Below the line, scratched smaller by many different knives, are names. Pilgrims. Carters. A child\'s name with a wheel drawn beside it.',
  [P('note-j03-bluff', '3')]: 'The newest cut has no name yet, only a W and half an A. Somebody ran out of time. The stone is warm under your hand, as if someone had been sitting against it.',
  [P('note-j03-tablet', '1')]: 'A grave tablet leans against the mound, its face worn nearly smooth. The carving is deep enough to read by touch: HERE LIE THOSE THE ROAD KEPT. DO NOT WALK THEM HOME.',
  [P('note-j03-tablet', '2')]: 'Beneath it, in the same careful hand as the bluff stone: THE WAYSTONES ARE NOT FOR THE LIVING. THEY ARE FOR THOSE WHO NEED TELLING THE WAY.',
  [P('note-j03-tablet', '3')]: 'The mound shifts. Something under the earth heard you reading.',

  // ---- Tobb: j04 ----
  [P('npc-tobb', 'j04-offer')]: '{name}. Since the Quenchstone caught, my hands have not stopped. I wrote the ends of the ballad on the road, sleeping in ditches, and I have not got a middle.',
  [P('npc-tobb', 'j04-offer-2')]: 'There is an old fire ring up the road where the carters used to stop. Sit with me a while? A song comes easier when somebody else is staring at the same flames.',
  [P('npc-tobb', 'j04-offer-2.accept')]: 'Lead the way, bard.',
  [P('npc-tobb', 'j04-offer-2.later')]: 'Another time, Tobb.',
  [P('npc-tobb', 'j04-yes')]: 'Good. Light the ring when you reach it, and I will tune.',
  [P('npc-tobb', 'j04-later')]: 'The verse will keep. The ash will not, but the verse will.',
  [P('npc-tobb', 'j04-remind')]: 'The fire ring is up the road, {name}, past the black stones. I have tuned twice already.',
  [P('npc-tobb', 'j04-verse')]: 'Right. The fire is lit, the lute is in tune, and I am stuck. The knighting. One line. What do I sing?',
  [P('npc-tobb', 'j04-verse.ash')]: 'He knelt in ash and stood up lit.',
  [P('npc-tobb', 'j04-verse.grain')]: 'He would not burn the grain.',
  [P('npc-tobb', 'j04-verse.bread')]: "He left with his mother's bread.",
  [P('npc-tobb', 'j04-ash')]: 'He knelt in ash and stood up lit. Oh, that scans. Do not tell me where you got it, I will only argue.',
  [P('npc-tobb', 'j04-grain')]: 'He would not burn the grain. Plain as a loaf. The kind of line a village sings back without being asked.',
  [P('npc-tobb', 'j04-bread')]: "He left with his mother's bread. Ha. Every hall from here to the Keep will cry at that one. Into the notebook it goes.",

  [P('npc-tobb', 'j04-sung')]: 'Sit still. I want to hear how it sounds with the fire behind it. ...There. That is a hearth song now, and you are in it. Do not let it go to your head.',

  // ---- the camp, if the verse was given (src/dialogue/content/scene-act1-camp.dialogue.ts) ----
  [P('scene-act1-camp', 'verse-ash')]: 'And one verse I did not have to write. "He knelt in ash and stood up lit." Somebody gave it to me by a fire, and it has been true ever since.',
  [P('scene-act1-camp', 'verse-grain')]: 'And a verse I did not have to write. "He would not burn the grain." Plain as a loaf, and every word of it true.',
  [P('scene-act1-camp', 'verse-bread')]: 'And a verse I did not have to write. "He left with his mother\'s bread." I sing it at every hearth now, and nobody keeps dry eyes.',

  // ---- Rook's board notices (j05 to j07) ----
  [P('note-j05-notice', '1')]: "LOST. One brown dog, answers to Crumb, or to the sound of a pie-cart bell. Last seen in the Guild Quarter with a crust in his teeth and nowhere to be.",
  [P('note-j05-notice', '2')]: 'Owner: Godric, pie stall, the market ring. Reward in pies. The Watch has not the men; whoever has legs may ask at the stall.',
  [P('note-j06-notice', '1')]: 'WANTED. A strong back, and a free afternoon. One crate of bar iron, left on a hand-cart by the old smelter yard when the wheel went.',
  [P('note-j06-notice', '2')]: 'Dunstan Ironside, Forge Row, wants it home before it rusts or walks. Pay in coin. No questions about the wheel.',
  [P('note-j07-notice', '1')]: 'THE CHAPEL WANTS CANDLES. Three niches in the east wall burn dark, and the sexton cannot leave the door to buy them.',
  [P('note-j07-notice', '2')]: "Apply to Sexton Elric. Candles may be had of Cedric the chandler, where Main Street meets the chapel way. The Watch asks only that they are lit, not that they are paid for twice.",

  // ---- j05: Godric and Crumb ----
  [P('npc-stallholder-1', 'j05-brief')]: "You've read the board, then. Crumb, my dog. Brown, one ear up, wrong about every cat in Harrowmark. He bolts whenever a pie-cart bell goes, and the ring is full of pie-carts.",
  [P('npc-stallholder-1', 'j05-brief-2')]: 'Try the west stalls first, then the yard behind the Guild houses, then the lane by the Hall. He likes anywhere warm and anywhere somebody is eating.',
  [P('npc-stallholder-1', 'j05-remind')]: 'West stalls, the Guild house yard, the lane by the Hall. A brown streak with one ear up: that is him.',
  [P('npc-stallholder-1', 'j05-back')]: 'Crumb! Look at him, grinning as if he did the finding. He has been to the Hall lane before, you know. They give him the rinds.',
  [P('npc-stallholder-1', 'j05-back-2')]: 'Here, a coin for the walking. A pie-man pays in what he has, and today it is silver.',
  [P('npc-crumb', 'found')]: 'Crumb is under a handcart, a pie crust beneath one paw. His tail thumps the cobbles twice. He is not sorry in the slightest.',
  [P('npc-crumb', 'found-2')]: 'Come on, then. Godric has been hoarse since the bell.',
  [P('npc-crumb', 'idle')]: 'Crumb leans against your boot. He is warm, and smells of onions.',

  // ---- j06: Dunstan ----
  [P('npc-dunstan', 'j06-brief')]: 'Rook\'s board brought you? Good. One crate of bar iron, ten good ingots, on a hand-cart by the old smelter yard. The wheel went and so did my patience.',
  [P('npc-dunstan', 'j06-brief-2')]: 'Rust is the only thing that comes for iron without being asked. The yard is down the Row, west, by the Underways gatehouse. Fetch it, and I will have the coal ready.',
  [P('npc-dunstan', 'j06-remind')]: 'The old smelter yard, west end of the Row, by the gatehouse. Iron does not rust slower for being looked at.',
  [P('npc-dunstan', 'j06-back')]: 'Ten ingots, and not one of them walked off. You carry like a smith\'s boy.',
  [P('npc-dunstan', 'j06-back-2')]: 'Take this for the back. And tell the sergeant the board can lose the notice.',
  [P('npc-dunstan', 'j08-bark')]: 'The Watch, walking the Row? About time. Two lads have been sniffing round my coal bin since the bell, quick hands and slow feet. You will find them at the alley end, behind the Anvil.',
  [P('npc-dunstan', 'idle')]: 'The forge is warm, the prices are fair and the coal is mine. What can I do for you?',

  // ---- j07: the sexton and the chandler ----
  [P('npc-sexton', 'j07-remind')]: 'A bundle from Cedric at the corner, then the three niches in the east wall. I will keep the door.',
  [P('npc-sexton', 'j07-back')]: 'Three small lights in the dark wall. The chapel has not looked like that since the Ash came.',
  [P('npc-sexton', 'j07-back-2')]: 'Take this. It is little, but the chapel is poorer than it looks, and I would rather it went to a pair of hands that lit something.',
  [P('npc-chandler', 'j07-sell')]: 'Candles for the chapel niches? Elric\'s order, and the chapel pays late and never haggles. That is what makes it dear to me.',
  [P('npc-chandler', 'j07-sell-2')]: 'There is a bundle on the board, tallow and wax, three to a niche. Take it. Tell him Cedric trimmed the wicks.',
  [P('npc-chandler', 'j07-after')]: 'Three niches, three candles each. Mind the draught by the door, it likes to put them out.',
  [P('npc-chandler', 'idle')]: 'Tallow, wax, wicks and wishes. Not in that order, and the wishes are free.',

  // ---- j08: the sergeant and the two barks ----
  [P('npc-sergeant', 'j08-offer')]: 'Ulf Marrick, Watch-Sergeant. Captain Rook keeps the board; I keep the Captain\'s patience. I am four lanes short, {name}, and a purse-lifter is working the Forge Row end. Walk the loop for me: Main Street, the Row end, the Anvil yard and the alley behind it. Folk will talk to a man in a Halvard coat. Some of what they say is useful.',
  [P('npc-sergeant', 'j08-offer.accept')]: 'I will walk it.',
  [P('npc-sergeant', 'j08-offer.later')]: 'Not just now.',
  [P('npc-sergeant', 'j08-yes')]: 'Good. Eyes up, and stay to the lanes. If you meet the lifters I would rather have them breathing. I will not weep if they are not.',
  [P('npc-sergeant', 'j08-later')]: 'The lifters will keep. Folk\'s purses, I am less sure of.',
  [P('npc-sergeant', 'j08-remind')]: 'Main Street, the Row end, the Anvil yard, the alley. Ask the smith and Aldith what they have seen on the way. Back here when the lifters are dealt with.',
  [P('npc-sergeant', 'j08-back')]: 'Two lifters off the Row, and nobody short a finger? That is the quietest report I have had all week. The Watch\'s thanks, and a little coin it can ill spare. The loop is a good walk once it is yours.',
  [P('npc-sergeant', 'after')]: 'The lanes have been quieter since. The Captain says you did well, which from him is a speech.',
  [P('npc-sergeant', 'idle')]: 'The board is the Captain\'s. I only hold the chalk.',
  [P('npc-aldith', 'j08-bark')]: 'Cutpurses? I serve them ale; I do not ask their trade. But I counted two sets of boots in the alley this morning, and neither pair paid.',

  // ---- j09: Stane's open board ----
  [P('npc-stane', 'j09-offer')]: '{name}. The yard has been quiet since the drill. I keep an open board for whoever has the stomach: three bouts against my veterans, no crowd, and a little house coin when the third is done. They fight to yield, not to bury. Beat each fairly and I will tell you what the board is for. Well?',
  [P('npc-stane', 'j09-offer.accept')]: 'I will take the board.',
  [P('npc-stane', 'j09-offer.later')]: 'Not today.',
  [P('npc-stane', 'j09-yes')]: 'The first is in the yard. Spare him when he yields; those are my friends, and I would like them walking home.',
  [P('npc-stane', 'j09-later')]: 'The board is open as long as I am. Come when your arm is.',
  [P('npc-stane', 'j09-ok')]: 'Understood.',
  [P('npc-stane', 'j09-remind')]: 'Your veteran is in the yard, {name}. Spare him when he yields.',
  [P('npc-stane', 'j09-word1')]: 'One down. He will tell the others you fight clean. Take a breath; the next is shorter in temper and longer in reach.',
  [P('npc-stane', 'j09-word2')]: 'Two. The last of them used to teach the others. Do not mistake patience for weakness.',
  [P('npc-stane', 'j09-close')]: 'Three. That is the board, {name}, and the bouts themselves paid nothing: it is only the house that adds a coin at the end. Halvard\'s yard was never about winning: a soldier who cannot yield cannot be taught. There is a little coin in it, from the house, because even a yard has to eat.',
  [P('npc-stane', 'j09-again')]: 'If you want one more, there is a veteran in the yard. No purse and no coin; nobody will remember who won.',
  [P('npc-stane', 'j09-again.again')]: 'One more bout.',
  [P('npc-stane', 'j09-again.later')]: 'Not now.',
  [P('npc-stane', 'j09-again-yes')]: 'He is in the yard. Same terms: spare him when he yields.',
  [P('npc-stane', 'j09-again-later')]: 'It will keep.',

  // ---- j10: Tobb's second verse ----
  [P('npc-tobb', 'j10-offer')]: '{name}. Harrowmark has more verses in it than I have fingers. The fire on the road gave me the knighting. I want one for the city: forge-smoke, the gate, whatever it is that makes a person stay. There is a ring in the Anvil yard, east of the inn, where the carters light their pipes. Sit with me?',
  [P('npc-tobb', 'j10-offer.accept')]: 'Lead the way, bard.',
  [P('npc-tobb', 'j10-offer.later')]: 'Another time, Tobb.',
  [P('npc-tobb', 'j10-yes')]: 'Good. Light the ring when you reach it, and I will tune.',
  [P('npc-tobb', 'j10-later')]: 'A city does not go anywhere. The verse will keep.',
  [P('npc-tobb', 'j10-remind')]: 'The ring is in the Anvil yard, east of the inn. I have tuned twice already, {name}.',
  [P('npc-tobb', 'j10-verse')]: 'The fire is lit, the lute is in tune, and I am stuck again. One line about Harrowmark. What do I sing?',
  [P('npc-tobb', 'j10-verse.forge')]: 'Every forge in Harrowmark is still lit.',
  [P('npc-tobb', 'j10-verse.gate')]: 'The gate was shut, and then it was not.',
  [P('npc-tobb', 'j10-verse.window')]: 'Someone kept a light in the window.',
  [P('npc-tobb', 'j10-forge')]: 'Every forge in Harrowmark is still lit. Hammers for a chorus. Oh, I could weep.',
  [P('npc-tobb', 'j10-gate')]: 'The gate was shut, and then it was not. That is the whole of every story I have ever heard, in nine syllables.',
  [P('npc-tobb', 'j10-window')]: 'Someone kept a light in the window. Plain as a loaf, and true. Into the notebook with it.',
  [P('npc-tobb', 'j10-sing-a')]: 'Listen. Both lines, side by side. First the road: "He knelt in ash and stood up lit."',
  [P('npc-tobb', 'j10-sing-b')]: 'Listen. Both lines, side by side. First the road: "He would not burn the grain."',
  [P('npc-tobb', 'j10-sing-c')]: 'Listen. Both lines, side by side. First the road: "He left with his mother\'s bread."',
  [P('npc-tobb', 'j10-sing-d')]: 'And then the city: "Every forge in Harrowmark is still lit."',
  [P('npc-tobb', 'j10-sing-e')]: 'And then the city: "The gate was shut, and then it was not."',
  [P('npc-tobb', 'j10-sing-f')]: 'And then the city: "Someone kept a light in the window."',
  [P('npc-tobb', 'j10-sung')]: 'Two verses and a knight between them. The ballad has a middle now. Do not let it go to your head.',

  // ---- the camp, if the second verse was given (src/dialogue/content/scene-act1-camp.dialogue.ts) ----
  [P('scene-act1-camp', 'verse2-forge')]: 'And the second, from the city: "Every forge in Harrowmark is still lit." Somebody gave me that one by an inn fire, too.',
  [P('scene-act1-camp', 'verse2-gate')]: 'And the second, from the city: "The gate was shut, and then it was not." I have yet to sing it without somebody nodding.',
  [P('scene-act1-camp', 'verse2-window')]: 'And the second, from the city: "Someone kept a light in the window." That one makes the innkeepers cry. I only sing it for free.',

  // ---- Rook: j11 ----
  [P('npc-rook', 'j11-offer')]: '{name}. You carry the Sewer Master Key now, which I never did. East of the first kennel there is a spur with a grate across it, and a smell that is not hounds.',
  [P('npc-rook', 'j11-offer-2')]: 'Carts used to turn off down there. I want to know where they went and what is left of the tracks. Will you look?',
  [P('npc-rook', 'j11-offer-2.accept')]: 'I will look.',
  [P('npc-rook', 'j11-offer-2.later')]: 'Not now, Captain.',
  [P('npc-rook', 'j11-yes')]: 'Mind the hounds past the grate. Somebody has been feeding them, and it was not me.',
  [P('npc-rook', 'j11-later')]: 'The spur is not going anywhere. Neither, I think, are the tracks.',
  [P('npc-rook', 'j11-remind')]: 'The grate is west of the first kennel. The key does the rest. Two marks on the tracks, then whatever waits at the end.',
  [P('npc-rook', 'j11-back')]: 'A post at the end of the tracks, with the Crucible\'s name on it again. Under my city, and nobody on my Watch told me.',
  [P('npc-rook', 'j11-back-2')]: 'I will keep it with the other things I do not say aloud. Take this, {name}, and thank you for the look.',

  // ---- j11 waybill ----
  [P('note-j11-waybill', '1')]: 'A waybill, nailed to the last post of the tracks, the nail rusted into the wood. Cart numbers run down one side, with tally strokes in a smelter hand.',
  [P('note-j11-waybill', '2')]: "CONSIGNEE: THE CRUCIBLE. BY THE OLD WAY AT THE NEW MOON. RECEIPT UNSIGNED. CARTS COUNTED AT THE GATE: NINE.",
  [P('note-j11-waybill', '3')]: 'The tracks end at a wall that was a door once. Whatever the carts carried, it went a long way to be signed for.',
};
