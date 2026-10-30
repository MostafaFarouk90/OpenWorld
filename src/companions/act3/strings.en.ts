// Act 3 (K5): companion barks for the Greyfen, the Dragonspine, Ysmeryth's trial, the reveal and the ferry, plus the
// Quenched aura's toast. Invented lines, logged in design/changes-applied.md. Voices follow design 8.1: Tobb narrates the
// party's heroics wrongly and edits the ballad, Aelfreda is deadpan and practical about stew, Hrolf bribes monsters
// with food. Before M32 the dragons stay wild and frightened (design 3): no line before `.after` or `reveal` spoils it.

/** The line key of an Act 3 bark: the shipped area-pool pattern (`companion.<id>.bark.area.<place>.<n>`). */
export const act3BarkKey = (id: string, place: string, n: number): string => `companion.${id}.bark.area.${place}.${n}`;

const lines = (id: string, place: string, texts: readonly string[]): Record<string, string> =>
  Object.fromEntries(texts.map((t, i) => [act3BarkKey(id, place, i + 1), t]));

const TOBB: Record<string, readonly string[]> = {
  greyfen: [
    'The Greyfen! Where the bold knight strode through waist-deep... knee-deep... ankle-deep peril. I will fix it in the second verse.',
    'Nothing rhymes with "bog". Fog. Log. Frog. Oh, that is quite a lot, actually.',
    'Mind the reeds, they whisper. Or that is my stomach. Hard to tell out here.',
  ],
  dragonspine: [
    'The Dragonspine. In the ballad it is taller. In real life it is also taller. I underestimated it twice.',
    'My lute strings have gone stiff with cold. So have my fingers. So has my verse.',
    'Every peak up here looks like the last one, and every one of them is lying.',
  ],
  'dragonspine.after': [
    'I am rewriting the whole Dragonspine canto. The dragons were the heroes. The knight was mostly lost.',
    'Keepers of the Forge. I had them down as "terrible beasts". I have crossed that out very firmly.',
  ],
  mere: [
    'Hathren\'s Mere. Ripples with no wind. I am going to call that "atmospheric" and stand further back.',
    'They say something sleeps under the water. I say we let it.',
  ],
  lodge: [
    'Wyrmwatch Lodge! A fire, a roof, and hunters who look at my lute as if it owes them money.',
    'Warm at last. Somebody hold my boots, I am never putting them on again.',
  ],
  'lodge.after': [
    'The hunters stand watch with the dragons now. Same faces, different song. I prefer this one.',
    'The lodge hearth is lit again. I may write a whole verse about a fire. A long one.',
  ],
  shelter: [
    'Rime Pass shelter. Four walls and a woodpile. In the ballad it is a palace. Please do not correct me.',
    'Somebody kept this fire for strangers. That is a better story than anything I have written.',
  ],
  anvil: [
    'The Last Anvil. It rings without anyone striking it. I am trying very hard not to be frightened by that.',
    'Old carvings everywhere. I cannot read a word, but the pictures have a lot of wings in them.',
  ],
  'anvil.after': [
    'Now I can see it. The carvings are not hunts, they are oaths. I had the whole thing backwards.',
    'The anvil rings like a bell for a friend. I am putting that line in. It is mine now.',
  ],
  hawkCliffs: [
    'Rime hawks. The ballad says the knight laughed at them. The knight should duck instead.',
    'If an egg falls on me, I want it known that I was being heroic at the time.',
  ],
  cave: [
    'A collapsed cave. My favourite kind of cave is the kind I am outside of.',
    'Something was buried here on purpose. Those are the stories that bite.',
  ],
  crag: [
    'Up the crag, said nobody sensible. And yet here we are, climbing.',
    'From up here Harrowmark is a smudge. I have written whole songs about that smudge.',
  ],
  hut: [
    'Mireweather Hut. Smells of moss, smoke and someone who knows a hundred ways to poison a stew.',
    'Touch nothing on those shelves. I mean it. Some of those jars are looking at me.',
  ],
  chapel: [
    'A chapel underwater. Half a chapel. The bell still hangs. I will not ring it, do not ask.',
    'Even sunk in the fen, somebody kept candles here. Faith is stubborn stuff.',
  ],
  hall: [
    'Wyrmwatch Hall. Antlers, pelts and a map with too many red marks on it.',
    'Thorgar\'s hall. Nobody sings in here. I will fix that, quietly, later, when nobody is armed.',
  ],
  ferry: [
    'Dry land! I take back everything I said about the boat. Almost everything.',
    'The ferryman did not laugh at one joke the whole way. A tough room, the Greyfen.',
    'Off we get. Mind the plank, it is wetter than it looks. Everything here is.',
  ],
  'trial.start': [
    'Knight, she is the size of a church. I am writing this down in case I need to read it at your funeral.',
    'Stand straight! Look brave! I will describe it as both, whatever happens.',
  ],
  'trial.break': [
    'Yes! That one goes in the ballad!',
    'Careful! I have already rhymed "knight" with "won the fight" and I want it to stay true.',
  ],
  'trial.won': [
    'You stood against a dragon and you are still standing! I need a longer song.',
    'Victory! Polite, respectful victory. The best kind. The rarest kind.',
  ],
  'trial.lost': [
    'Nobody beats a dragon on the first try. In the ballad it was your third try. Second. We will see.',
    'You are alive and she is not angry. In my trade, that is called a happy ending.',
  ],
  reveal: [
    'Keepers. Not monsters. Keepers. I have to burn three verses and I have never been happier to do it.',
    'Everything we were told was wrong. That is the best kind of song. The kind that changes.',
  ],
};

const AELFREDA: Record<string, readonly string[]> = {
  greyfen: [
    'The Greyfen. Damp feet, damp bread, damp everything. I will make a stew that forgives it.',
    'Leeches in the shallows. Keep your hands out of the water and your boots laced tight.',
    'Marsh herbs grow thick here. Half of them heal and half of them kill. I know which half.',
  ],
  dragonspine: [
    'Thin air. Breathe slowly, walk slowly, complain slowly. You will last longer.',
    'Cold enough to keep meat a month. Cold enough to keep us too, if we stand still.',
    'Snow on black stone. The mountain looks burnt and frozen at once. I do not like it.',
  ],
  'dragonspine.after': [
    'Keepers of the Forge. The old texts at the convent had it right, and we called them heresy.',
    'The mountain feels less like a threat now. More like a house where someone is still awake.',
  ],
  mere: [
    'Still water and no birds. Something below is listening. We should be quiet guests.',
    'The mist tastes of iron. Cover your mouth if your chest tightens.',
  ],
  lodge: [
    'A lodge with a cook-fire. I am going to see what they put in their stew, and then fix it.',
    'Sit by the fire and let your hands thaw before you hold a blade again.',
  ],
  'lodge.after': [
    'The hearth is lit and the watch has changed sides. Men can turn, after all.',
    'Thorgar\'s hunters have stopped counting dragon heads. A good day for this lodge.',
  ],
  shelter: [
    'Someone stacked this wood for the next traveller. We should do the same before we leave.',
    'Rest here. A short rest now is worth a long one in a sickbed later.',
  ],
  anvil: [
    'The Last Anvil. It hums in my bones. I will pray here, briefly, and then we keep moving.',
    'These carvings were cut by careful hands. People do not carve what they hate.',
  ],
  'anvil.after': [
    'The rubbings make sense now. They were written to be read by the next keeper.',
    'An anvil that remembers. I would like to sit with it a while. Not long. There is stew.',
  ],
  hawkCliffs: [
    'Rime hawks guard their nests fiercely. As they should. We are the thieves here.',
    'If you are cut by a talon, show me at once. Cold wounds hide how deep they are.',
  ],
  cave: [
    'A rockfall. Step where the stone is grey, not where it is white. White means it moved recently.',
    'Buried things are buried for a reason. Sometimes the reason is shame.',
  ],
  crag: [
    'Climb with three points on the rock. Your fourth point can be your pride.',
    'From up here everything looks small. Including our troubles, if only for a moment.',
  ],
  hut: [
    'Gytha keeps her jars in a sensible order. I approve, which surprises me.',
    'Bogbean, sweet flag, marsh woundwort. A good hut. I could stay a week.',
  ],
  chapel: [
    'A drowned chapel. The candles were lit by someone who still believed. Do not disturb them.',
    'Water in the nave and faith in the walls. The fen took the floor, not the prayers.',
  ],
  hall: [
    'Thorgar keeps a hard hall. Cold beds, warm swords. We will not stay long.',
    'Too many trophies on these walls. Every one of them was somebody\'s child once.',
  ],
  ferry: [
    'Solid ground. My stomach thanks it.',
    'The boatman poled well. I have left him a heel of bread. He looked hungry.',
    'Step off carefully. A wet hem is a cold leg all afternoon.',
  ],
  'trial.start': [
    'She is testing you, not hunting you. Keep your temper and your feet.',
    'Breathe. If she wanted you dead, we would not be talking.',
  ],
  'trial.break': [
    'Good. Again, but calmer.',
    'Watch her wings. They move before she does.',
  ],
  'trial.won': [
    'Well done. Now bow. Winning is the easy half of respect.',
    'You held. I will check you for burns in a moment. Do not argue.',
  ],
  'trial.lost': [
    'Yielding to a wiser creature is not defeat. It is manners.',
    'Sit down, you are shaking. Nothing is broken that a meal will not mend.',
  ],
  reveal: [
    'Keepers. The convent burned the books that said so. I will write them again myself.',
    'We came to fight a fire and found it was guarding us. I need to sit down.',
  ],
};

const HROLF: Record<string, readonly string[]> = {
  greyfen: [
    'Mud to the knee and reeds to the ear. In Stonefold we would call this a bath.',
    'I offered the leeches a sausage. They wanted my leg instead. Rude.',
    'Wet country makes wet bread. Remind me to keep the oatcakes inside my shirt.',
  ],
  dragonspine: [
    'Real mountains at last. These ones do not care who you are. I like them.',
    'Cold enough to freeze a stew in the pot. I know, because I tried to eat one.',
    'My brother climbed a spine like this once. He came down with a beard full of ice and a grin.',
  ],
  'dragonspine.after': [
    'Keepers, not beasts. My brother would have laughed. He always said the wyrms were only lonely.',
    'I will still bring food when we meet a dragon. Now it is a gift, not a bribe.',
  ],
  mere: [
    'Something big sleeps under that water. I have a whole ham in my pack, just in case.',
    'The water is too still. Still water hides deep things. Walk light.',
  ],
  lodge: [
    'Wyrmwatch Lodge. A fire, a roof and a cook who looked at my pack like a wolf. Good man.',
    'Hunters. They count heads and skins. I count loaves. We will get along badly.',
  ],
  'lodge.after': [
    'The lodge keeps watch with the dragons now. I brought them a cheese. They were very polite about it.',
    'A hearth lit again. In Stonefold we would feast for three days. Here, one will do. Two.',
  ],
  shelter: [
    'A woodpile and a roof. Sit, eat, and do not tell the mountain we stopped.',
    'Whoever keeps this shelter keeps it well. I will leave a crust as thanks.',
  ],
  anvil: [
    'An anvil on a mountain. Somebody carried that up here. I respect them more than any king.',
    'It hums. My grandmother said a humming anvil means a smith is thinking of you.',
  ],
  'anvil.after': [
    'Dragon-work and smith-work in one stone. My people forgot half of what we knew.',
    'I will bring the anvil a gift. What does an anvil eat? Coal. I have no coal. Bread then.',
  ],
  hawkCliffs: [
    'Hawks! I have jerky. Hawks like jerky. Everybody likes jerky.',
    'Stand behind me when they dive. I am wider, and they are not used to me.',
  ],
  cave: [
    'A collapsed cave. I could lift some of this. Some. Not that one. Not that one either.',
    'If the roof comes down, get under me. I am a very good roof.',
  ],
  crag: [
    'A crag. My legs remember these. My knees would rather not.',
    'At the top I will eat. That is the rule of climbing. That is the only rule.',
  ],
  hut: [
    'The witch of the hut gave me tea. I am fairly sure it was tea.',
    'Every jar here has a label I cannot read. I will not touch any of them. Except that one. No.',
  ],
  chapel: [
    'A chapel with fish in it. The fen does what it likes.',
    'I will light a candle for my brother. He never set foot in a chapel. He would find this funny.',
  ],
  hall: [
    'Thorgar\'s hall. Hard men, cold beer. The beer is the better of the two.',
    'Pelts on every wall. I wonder how many of these beasts were offered bread first. None, I think.',
  ],
  ferry: [
    'A boat that does not sink is a good boat. I have been fair to it.',
    'Back on land. A Warden belongs where his feet can find the ground.',
    'I offered the ferryman a pie. He took it. The Greyfen has some sense after all.',
  ],
  'trial.start': [
    'I tried bread. She did not want it. Then this is yours, little knight. Stand your ground.',
    'Remember the logs at Stonefold. Same fight, bigger log. Much bigger.',
  ],
  'trial.break': [
    'Ha! Like that! Again!',
    'Lean into it! She tests weight, not speed!',
  ],
  'trial.won': [
    'You won a trial against a dragon. I will tell this in every hall from here to the sea.',
    'Good fight. Now offer her something. No, not that. Respect. Then food.',
  ],
  'trial.lost': [
    'To yield to a mountain is no shame. Even I sit down when the mountain asks.',
    'You lost, and you are whole. My brother lost his first trial too. He became a fine Warden.',
  ],
  reveal: [
    'Keepers of the Forge. My brother died believing they were monsters. I will carry the truth for him.',
    'All this time we sharpened axes. We should have been bringing them supper.',
  ],
};

export const ACT3_BANTER_TEXT: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> = {
  tobb: TOBB,
  aelfreda: AELFREDA,
  hrolf: HROLF,
};

/** One companion's Act 3 bark strings; spread into that companion's own table (strings.en.ts, strings.hrolf.en.ts, ...). */
export function act3BarkStrings(id: string): Record<string, string> {
  return Object.assign({}, ...Object.entries(ACT3_BANTER_TEXT[id] ?? {}).map(([place, t]) => lines(id, place, t)));
}

/** Strings the `companions-act3` plugin registers itself. */
export const COMPANION_ACT3_STRINGS_EN: Record<string, string> = {
  'hud.aura.quenched.on': "Hathren's Quenched aura: Burn builds a quarter slower.",
};
