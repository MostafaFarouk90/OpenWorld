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
  'quest.j02.summary': "Edda has baked three loaves for the doors that went hungry in the ash: the miller, the widow at the lane's end and the chapel sexton. She asks you to carry them round.",
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
};
