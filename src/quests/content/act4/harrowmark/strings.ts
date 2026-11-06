// Quest text for the Harrowmark quests before the Council (titles, summaries, one line a step), the prop prompts and the
// director's toasts, in the shape of Act 3's strings.ts. No literal player name and no dashes (the content tests check both).
import { HARROWMARK_A4_PROMPTS } from './props';
import { beatStrings } from './director/beat';
import { HARROWMARK_A4_SCENE_STRINGS } from './scenes';

interface QuestText { title: string; summary: string; o: Record<string, string> }

const QUEST_TEXT: Record<string, QuestText> = {
  m35: {
    title: 'Summons to the Council',
    summary: 'Edric has called the Council of Ash, and Vey holds every gate in the city. Wystan sends the knight for the three House delegations: meet each, see them past one of the Regent\'s checkpoints and walk them to the Keep court.',
    o: {
      brief: 'Hear Wystan out at the Keep', oswin: 'Meet the Oswin delegation at the Counting-House', oswinPass: 'Show the Council writ at the Counting-House checkpoint',
      oswinIn: 'Walk the Oswin delegation to the Keep court', halvard: 'Meet the Halvard delegation at the Bastion', halvardPass: 'Show the Council writ at the Keep Road checkpoint',
      halvardIn: 'Walk the Halvard delegation to the Keep court', grisel: 'Meet the Grisel delegation at the River Gate', chain: 'Raise the River Gate chain',
      griselPass: 'Show the Council writ at the River Gate checkpoint', ambush: 'Put down the masked men in the River Gate lane', search: 'Search the lane and the gate',
      griselIn: 'Walk the Grisel delegation to the Keep court', entered: 'See the delegates into the Keep', report: 'Report to Wystan',
    },
  },
  m36: {
    title: 'Votes and Daggers',
    summary: 'Three delegates have not made up their minds, and the Regent is buying them one at a time. Merrin names them. Win each over or lose him, cross the Rooftop Ward unseen to find who waits at the drop, and chalk the count.',
    o: {
      brief: 'Hear Merrin out at the Counting-House', ledger: 'Read Ser Aldric\'s debt ledger', halvard: 'Speak to Ser Aldric Cole at the Bastion',
      page: 'Read the Archive\'s charter page', oswin: 'Speak to Wilmot Penn', rooftops: 'Cross the Rooftop Ward unseen', dagger: 'Face the daggerman at the drop',
      daggerman: 'Put down the daggerman and his men', drop: 'Search the drop', letters: 'Read the steward\'s letter-case', grisel: 'Speak to the Grisel steward',
      chalk: 'Chalk the vote on the Counting-House board', report: 'Report to Merrin',
    },
  },
  r19: {
    title: 'Halvard Banners',
    summary: 'Four Halvard captains each want their company in the field when the Council sits. Only two can march; the other two must hold the walls. Wystan leaves the choosing to the knight.',
    o: {
      brief: 'Hear Wystan out at the Bastion', roll: 'Read the muster roll', archers: 'Speak to Captain Hesketh of the archers', pikes: 'Speak to Captain Morwen of the pikes',
      deserters: 'Put down the Halvard deserters', bout: 'Win a bout with Captain Bran', horse: 'Speak to Captain Bran of the horse', letter: 'Read Captain Tolly\'s letter',
      engineers: 'Speak to Captain Tolly of the engineers', banners: 'Raise the two banners in the Bastion yard', horn: 'Sound the muster horn', report: 'Report to Wystan',
    },
  },
  r20: {
    title: "Oswin's Silver",
    summary: 'Merrin means to get twelve chests of Oswin silver out of the city before the Regent can freeze them. The cart must pass three of Vey\'s posts, and how it passes them is the knight\'s choice: coin, shadow or steel.',
    o: {
      brief: 'Hear Merrin out at the Counting-House', manifest: 'Read the convoy manifest', load: 'Load the silver on the cart', cp1: 'Get the cart past the River Gate post',
      tally: 'Read the post\'s tally', cp2: 'Get the cart past the first farm-ring hut', cp3: 'Get the cart past the second farm-ring hut',
      through: 'See the cart down the river road', report: 'Report to Merrin',
    },
  },
  r21: {
    title: "Grisel's Daughter",
    summary: 'Wenna\'s loyal miners are hiding in the Guild Quarter cellars, and her father\'s men are hunting them for the Regent. Find the way out through the back lanes, break the patrol and bring the miners to the sewer grate.',
    o: {
      brief: 'Hear Wenna out', keeper: 'Speak to the cellar-keeper', door: 'Open the cellar door', cellar: 'Search the cellar', lanes: 'Scout the back lanes unseen',
      patrol: 'Break the cellar patrol', chalk: 'Read the patrol\'s chalk', grate: 'Lift the sewer grate at the river wall', out: 'Walk the miners out to the grate',
      report: 'Report to Wenna',
    },
  },
  r22: {
    title: "The King's Blade",
    summary: 'Dunstan will forge the boy king a blade of his own, and for that he needs three rare materials from the far reaches of Valdren. Fetch them, work the forge with him and help him choose what kind of blade a king should carry.',
    o: {
      brief: 'Hear Dunstan out at his forge', drawing: 'Look at Dunstan\'s drawing',
      'star-iron.talk': 'Ask after star-iron near Cinderford', 'star-iron.guards': 'Clear the crag where the star-iron lies', 'star-iron.find': 'Take the star-iron',
      'bog-oak.talk': 'Ask after bog-oak near the Mireweather hut', 'bog-oak.guards': 'Clear the peat cut where the bog-oak lies', 'bog-oak.find': 'Cut the bog-oak',
      'rime-iron.talk': 'Ask after rime-iron on Rime Pass', 'rime-iron.guards': 'Clear the cairn where the rime-iron lies', 'rime-iron.find': 'Prise out the rime-iron',
      bring: 'Bring the three materials to Dunstan', bellows: 'Work the bellows', forge1: 'Hammer the blade on the anvil', quench: 'Quench the blade',
      forge2: 'Temper the blade on the anvil', hilt: 'Fit the bog-oak hilt', choose: 'Choose the blade with Dunstan',
    },
  },
  r23: {
    title: 'The Watch Remembers',
    summary: 'Vey purged the city watch and filled the gaps with his own men. Five of the old watchmen still remember what they were ordered to do. Rook wants their testimony, and the sealed orders that prove it.',
    o: {
      brief: 'Hear Rook out', w1: 'Speak to the old watchman at the Barracks', w2: 'Speak to the old watchman at the gatehouse', w3: 'Speak to the old watchman at the stables',
      w4: 'Speak to the old watchman at the chapel', w5: 'Speak to the old watchman in the Tilted Anvil\'s yard', order: 'Find the sealed order he kept',
      forger: 'Put down the forger\'s minders', choose: 'Tell Rook how the orders are exposed', expose: 'Expose the forged orders', report: 'Report to Rook',
    },
  },
  d07: {
    title: "The Regent's Crucible",
    summary: 'Under the old Smelter, behind a gate the city forgot, the Regent has been feeding dragon hearts to a furnace. Rook has the key. Go down, free who is held there, take the ledgers and stop what the hearts were fed to.',
    o: {
      brief: 'Hear Rook out', enter: 'Go down into the Crucible', captive: 'Speak to the captive smith', halls: 'Clear the vat hall and the cradle room',
      stamp: 'Look at the cradle stamps', tally: 'Read the carter\'s tally', forge: 'Clear the forge room', ledgers: 'Take the heart ledgers', log: 'Read the furnace log',
      valves: 'Turn the three vat valves in the right order', boss: 'Destroy the Bellows-Engine', report: 'Report to Rook',
    },
  },
  m37: {
    title: 'The Night Before',
    summary: 'The Council sits tomorrow, and there may be no Harrowmark the day after. Tobb has laid a feast at the Tilted Anvil. Sit with the company, sing the war-song and hear what each of them has to say.',
    o: {
      brief: 'Speak to Tobb at the Tilted Anvil', feast: 'Sit down to the feast', tobb: 'Sit with Tobb', hrolf: 'Sit with Hrolf', aelfreda: 'Sit with Aelfreda',
      song: 'Drum the war-song on the table', gaut: 'Find Gaut by the back stair', toast: 'Raise the last toast',
    },
  },
  m38: {
    title: 'The Council of Houses',
    summary: 'The Council of Ash sits in the Great Chamber. Edric means to lay the whole case before the three Houses and take back his crown by their vote. Vey has come to the chamber too, with more men than a Regent needs.',
    o: {
      brief: 'Speak to Edric before the Council', enter: 'Go into the Great Council Chamber', wystan: 'Speak to Wystan in the chamber',
      merrin: 'Speak to Merrin in the chamber', wenna: 'Speak to Wenna in the chamber', evidence: 'Lay the evidence on the table', case: 'Put the case before the Houses',
      turn: 'Stand by Edric', fight: 'Cut down Vey\'s Footmen in the chamber', search: 'Search the chamber', rally: 'Get Edric on his feet',
    },
  },
  m39: {
    title: 'Gaut\'s Last Stand',
    summary: 'The Keep is Vey\'s. Sir Gaut holds the stairs so the King can get away below. Clear the stair-head, shut the barricade and hold the flights with him.',
    o: {
      gaut: 'Speak to Sir Gaut on the top landing', stairhead: 'Clear the stair-head', barricade: 'Shut the barricade',
      hold: 'Hold the stairs with Gaut', fall: 'Stand with Gaut', token: 'Take up what Gaut left', edric: 'Go down to the King at the stair foot',
    },
  },
  m40: {
    title: 'Flight Through the Underways',
    summary: 'Rook knows a way under the city that Vey does not. Take Edric down through the deep run, past the hounds and the Regent\'s patrol, and up the ladder beyond the north wall.',
    o: {
      brief: 'Speak to Rook at the stair foot', enter: 'Go down into the deep run', den1: 'Clear the first hound den', sluice: 'Turn the sluice wheel',
      den2: 'Clear the second hound den', out: 'Bring Edric and Rook out beyond the north wall',
    },
  },
  m41: {
    title: 'The Boy King Remembers',
    summary: 'Outside the walls, round a fire in the dark, the ones who got out of Harrowmark gather to the King. Edric has lost his city and his oldest knight in one night. Hear him out, and find where the road goes from here.',
    o: {
      gather: 'Wait by the fire as the others come in', edric: 'Speak to Edric', rook: 'Speak to Rook', wystan: 'Speak to Wystan', camp: 'See to the map table and the fire',
      search: 'Read what Edric carried out', ashgate: 'Hear where Edric means to go',
    },
  },
};

/** The director's toasts. */
export const HARROWMARK_A4_DIRECTOR_TEXT: Record<string, string> = {
  'harrowmark.a4.q.m35.entering': 'The delegates go up the Keep steps. The doors close behind them.',
  'harrowmark.a4.q.r20.halt': 'The cart halts at the post.',
  'harrowmark.a4.q.r20.passed': 'The cart is through the post.',
  'harrowmark.a4.q.r21.firstOut': 'The first miners are through the grate. Go back for the rest.',
  'harrowmark.a4.q.d07.valveWrong': 'The wheel shrieks and the pressure climbs back. Start again.',
  'harrowmark.a4.q.d07.valveRight': 'The wheel turns and a vat sighs.',
  'harrowmark.a4.q.d07.valves': 'The vats are vented. The engine gate grinds open.',
  // the escort bars' titles (L4's EscortBar)
  'escort.a4.m35.oswin': 'The Oswin delegation', 'escort.a4.m35.halvard': 'The Halvard delegation', 'escort.a4.m35.grisel': 'The Grisel delegation',
  'escort.a4.r20': 'The Oswin silver', 'escort.a4.r21': "Wenna's miners", 'escort.a4.m40': 'The King and Rook',
  'harrowmark.a4.q.m38.stairsOpen': 'The door behind the dais is open. The Keep stairs.',
  'harrowmark.a4.q.m39.guard': 'Heavy boots on the last flight. The champion\'s guard is coming down.',
  'harrowmark.a4.q.m39.oathblade': 'Gaut\'s Oathblade is yours.',
  'harrowmark.a4.q.m39.bagFull': 'Your pack is full. Make room for Gaut\'s sword.',
  'harrowmark.a4.q.m40.gate': 'The sluice gate is shut across the tunnel. Turn the wheel.',
  ...beatStrings('harrowmark.a4.q.r22.beat', {
    start: 'Dunstan lifts the hammer. Strike with him on the beat.', lesson: 'Draw the blade: strike on the gold cells.', real: 'Temper it: strike on the gold cells.',
    falter: 'The steel cools out of true. Heat it and strike again.', assist: 'Dunstan takes the beat and guides your arm.',
  }),
  ...beatStrings('harrowmark.a4.q.m37.beat', {
    start: 'Tobb drums the count. Join in on the table.', lesson: 'Drum on the gold cells.', real: 'Drum the war-song: hit the gold cells.',
    falter: 'The table loses the beat in laughter. Again.', assist: 'The whole table takes up the song with you.',
  }),
};

export const HARROWMARK_A4_QUEST_STRINGS: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const [id, q] of Object.entries(QUEST_TEXT)) {
    out[`quest.${id}.title`] = q.title;
    out[`quest.${id}.summary`] = q.summary;
    for (const [oid, text] of Object.entries(q.o)) out[`quest.${id}.${oid}`] = text;
  }
  for (const [k, v] of Object.entries(HARROWMARK_A4_PROMPTS)) out[`quest.prompt.a4.${k}`] = `{key} ${v}`;
  Object.assign(out, HARROWMARK_A4_DIRECTOR_TEXT, HARROWMARK_A4_SCENE_STRINGS);
  return out;
})();
