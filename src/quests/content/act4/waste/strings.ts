// Quest text for the Waste quests (titles, summaries, one line a step), the prop prompts and the director's toasts, in the shape
// of L10's strings.ts. No literal player name and no dashes (the content tests check both).
import { WASTE_A4_PROMPTS } from './props';
import { beatStrings } from '../harrowmark/director/beat';
import { WASTE_A4_SCENE_STRINGS } from './scenes';

interface QuestText { title: string; summary: string; o: Record<string, string> }

const QUEST_TEXT: Record<string, QuestText> = {
  m42: {
    title: 'Gate of Ash',
    summary: 'Wulfhild of the Ashwalkers waits at Ashgate. The only way to her people\'s camp is the rope-line across the Ashen Waste, shelter to shelter, and a storm is coming whether Cael is ready or not.',
    o: {
      brief: 'Speak to Wulfhild at Ashgate', clip: 'Let Hild Ropewright clip you to the rope', gate: 'Go through the gate arch onto the rope-line',
      shelter1: 'Reach the first shelter and wait out the storm wall', striders: 'Drive off the Waste Striders on the line',
      shelter2: 'Reach the second shelter and wait out the wall', pack: 'Search the lost walker\'s pack',
      shelter3: 'Reach the third shelter and wait out the wall', wraiths: 'Lay the husks on the line to rest',
      shelter4: 'Reach the fourth shelter and wait out the wall', knot: 'Read the knot-sign on the last post',
      camp: 'Follow the rope down into the Walker Camp', report: 'Speak to Wulfhild at the camp',
    },
  },
  m43: {
    title: 'What the Walkers Know',
    summary: 'The Ashwalkers do not trust a knight because a queen says so. Wulfhild sets three trials: the Storm Walk, the Pyre Rite and the Spear-Dance. Pass them, in any order, and the camp will call Cael a walker.',
    o: {
      brief: 'Hear Wulfhild\'s trials', walkTalk: 'Ask Osgar Knotwise for the Storm Walk', walk: 'Walk the knotted rope through the storm and count the knots',
      pyresTalk: 'Ask Mother Aelfgifu for the Pyre Rite', pyres: 'Lay three wraiths to rest at the pyres, or burn three Blightblooms',
      danceTalk: 'Ask Hrodna for the Spear-Dance', dance: 'Win the Spear-Dance against Hrodna', lore: 'Read the camp\'s count-stones and Hrodna\'s spear-rack',
      welcome: 'Return to Wulfhild for the tribe\'s welcome',
    },
  },
  m44: {
    title: 'Ebba\'s Song',
    summary: 'Little Ebba of the Cinder Chapel hums a tune she cannot finish. Her family\'s music box is somewhere in the ruined village, past a nest of husks.',
    o: {
      brief: 'Speak to Little Ebba at the chapel', keeper: 'Ask Sister Aedre about Ebba\'s family', house1: 'Search the first ruined house',
      nest: 'Clear the nest in the second house', house2: 'Search the second house', house3: 'Search the third house', box: 'Wind the music box',
      report: 'Bring the music box to Ebba',
    },
  },
  r25: {
    title: 'The Child\'s Candle',
    summary: 'Three families of the chapel village never came back. Ebba cannot go out to their hearths. She asks Cael to light a candle at each.',
    o: {
      brief: 'Take Ebba\'s candles', name1: 'Find the first family\'s name at their hearth', light1: 'Light a candle on the first hearth',
      name2: 'Find the second family\'s name', light2: 'Light a candle on the second hearth', knot: 'Lay the husks at the third hearth to rest',
      name3: 'Find the third family\'s name', light3: 'Light a candle on the third hearth', register: 'Read the chapel register',
      report: 'Tell Ebba the candles are lit',
    },
  },
  r24: {
    title: 'Ashwalker Water-Debt',
    summary: 'The camp\'s cisterns are dry. A cart of rain-casks waits at the Glasslands spring, and Brand the carter needs a guard to bring it home across the dunes. Harrowmark\'s refugees at Ashgate are thirsty too.',
    o: {
      brief: 'Hear Wulfhild out about the water', carter: 'Meet Brand the carter at the spring', spring: 'Read the knot-count at the spring',
      load: 'Load the rain-casks', brake1: 'Wait out the storm at the first shelter with the cart', brake2: 'Wait out the storm at the second shelter',
      arrive: 'Bring the cart to the camp gate', choose: 'Tell Wulfhild where the water goes', unload: 'Unload the casks',
    },
  },
  m45: {
    title: 'Chimes in the Glass',
    summary: 'Ebba\'s tune is the walkers\' chime, the old key to the Caldera road. At the Glasslands the pillars wait to be struck in its pattern.',
    o: {
      brief: 'Hear Wulfhild about the chime', meet: 'Meet Wulfhild at the Glasslands', guard: 'Clear the swarm and the golem at the strike stone',
      plaques: 'Read the three Chime Key plaques', search: 'Search the pillars', chime: 'Strike the pillars in the tune\'s pattern',
      voice: 'Listen', report: 'Speak to Wulfhild',
    },
  },
  d08: {
    title: 'The Cathedral of Husks',
    summary: 'The Husk Cathedral east of the Glasslands tolls the dead out of their ash. Wulfhild asks Cael to go in and silence it, by ending the Archwraith or by letting him go.',
    o: {
      brief: 'Hear Wulfhild about the cathedral', dying: 'Speak to the walker at the cathedral door', enter: 'Enter the Husk Cathedral',
      knights: 'Defeat the Husk Knights in the narthex', bones: 'Search the pilgrim\'s bones', rope: 'Read the marks by the gong-rope',
      boss: 'Face Archwraith Eormen', tablets: 'Read the crypt tablets', niche: 'Search the crown\'s niche',
      report: 'Tell Wulfhild what happened in the cathedral',
    },
  },
  m46: {
    title: 'Road to the Rim',
    summary: 'Every road in the Waste has been walked. Hrolf leads the way up the Cinder Road North to the foot of the Caldera, cairn by cairn, against a column of the dead coming down it.',
    o: {
      brief: 'Tell Hrolf you are ready', keeper1: 'Speak to the first cairn-keeper', wave1: 'Hold the first cairn',
      mark1: 'Lay a stone in the first cairn\'s mark', light1: 'Light the first cairn', keeper2: 'Speak to the second cairn-keeper',
      wave2: 'Hold the second cairn', mark2: 'Lay a stone in the second cairn\'s mark', light2: 'Light the second cairn',
      outriders: 'Break the column\'s outriders', keeper3: 'Speak to the last cairn-keeper', wave3: 'Hold the last cairn',
      lore: 'Read the last cairn and the stone by the fire', rim: 'Climb to the Rimfoot fire', report: 'Sit down with Hrolf at the fire',
    },
  },
};

export const WASTE_A4_DIRECTOR_TEXT: Record<string, string> = {
  'waste.q.m42.storm': 'The ash comes up like a wall. Stay on the rope.',
  'waste.q.m42.wall': 'A storm wall is passing. Stay under the flap until it is gone.',
  'waste.q.m42.paused': 'Back under the flap. The wall has not passed.',
  'waste.q.m42.passed': 'The wall has passed. On to the next shelter.',
  'waste.q.m42.camp': 'Lights in the basin below: the Walker Camp.',
  'waste.q.m43.walk': 'Osgar\'s storm rises. Follow the knots.',
  'waste.q.m43.knot': 'A knot on the rope. Keep going.',
  'waste.q.m43.stray': 'You lost the rope. Back to the last knot.',
  'waste.q.m43.lee': 'A lee cairn. Wait out the wall here.',
  'waste.q.m43.end': 'The end of the rope. Osgar wants the count.',
  'waste.q.m43.rested': 'The wraith lies down in the pyre\'s ash.',
  'waste.q.m43.rises': 'The wraith rises again from the pyre. The rite wants rest, not death.',
  'waste.q.m43.torch': 'The torch catches. Burn the Blightblooms by the pyres.',
  'waste.q.m43.burned': 'The Blightbloom burns white and is gone.',
  'waste.q.m43.rite': 'The three pyres are quiet. Mother Aelfgifu nods.',
  'waste.q.m43.danceLost': 'Hrodna lowers her spear. Speak to her to dance again.',
  'waste.q.m43.danceWon': 'Hrodna laughs and plants her spear. The camp cheers.',
  'waste.q.r25.noCandle': 'You have no candle left. Ebba has more.',
  'waste.q.r24.storm': 'A storm wall rolls over the dunes. Set the brake and wait it out.',
  'waste.q.r24.passed': 'The wall has passed. The cart rolls on.',
  'waste.q.r24.attack': 'Something moves on the dunes. Guard the cart.',
  'waste.q.d08.crypt': 'The nave is silent. Behind you, the crypt gate grinds open.',
  'waste.q.m46.wave': 'The column comes up the road. Hold the cairn.',
  'waste.q.m46.held': 'The cairn holds.',
  'escort.a4.r24': 'The rain-casks',
  ...beatStrings('waste.q.m43.beat', {
    start: 'Osgar raps the rope. Count the knots with him, one tap a knot.', lesson: 'Tap on the gold cells.', real: 'Count the knots: tap the gold cells.',
    falter: 'Osgar shakes his head. Count again.', assist: 'Osgar counts aloud with you.',
  }),
};

export const WASTE_A4_QUEST_STRINGS: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const [id, q] of Object.entries(QUEST_TEXT)) {
    out[`quest.${id}.title`] = q.title;
    out[`quest.${id}.summary`] = q.summary;
    for (const [oid, text] of Object.entries(q.o)) out[`quest.${id}.${oid}`] = text;
  }
  for (const [k, v] of Object.entries(WASTE_A4_PROMPTS)) out[`quest.prompt.a4w.${k}`] = `{key} ${v}`;
  Object.assign(out, WASTE_A4_DIRECTOR_TEXT, WASTE_A4_SCENE_STRINGS);
  return out;
})();
