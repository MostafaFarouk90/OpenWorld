// Quest text for the Rim quests (titles, summaries, one line a step), the prop prompts, the director's toasts and the scenes'
// lines. No literal player name and no dashes (the content tests check both).
import { beatStrings } from '../../act4/harrowmark/director/beat';
import { RIM_A5_PROMPTS } from './props';
import { RIM_A5_SCENE_STRINGS } from './scenes';

interface QuestText { title: string; summary: string; o: Record<string, string> }

const QUEST_TEXT: Record<string, QuestText> = {
  m47: {
    title: 'Rim of the World',
    summary: 'The Rim Gate stands at the top of the stairs above the Rimfoot fire, barred by the last stokers of the Sunforge. {name} must climb, open it and find out who is still keeping the fire.',
    o: {
      wulfhild: 'Speak to Wulfhild at the Rimfoot fire', knot1: 'Lay the wraiths below the hairpin to rest', hairpin: 'Climb to the hairpin of the rim stairs',
      journal: 'Read the stoker\'s day-book at the hairpin', knot2: 'Clear the wraiths above the hairpin', inscription: 'Read the words cut in the gate\'s lintel',
      winch: 'Wind the winch on the west tower and open the Rim Gate', alric: 'Speak to the stoker inside the gate', sight: 'Look out over the Caldera',
      edric: 'Speak to Edric, who climbed up behind you', rook: 'Speak to Rook at the gate', brazier: 'Light the stokers\' brazier',
      lamp: 'Light the gatehouse lamp', bell: 'Look at the old bell', stone: 'Rekindle the Rim Camp waystone', report: 'Speak to Alric at the stokers\' post',
    },
  },
  m48: {
    title: 'The Lava Stair',
    summary: 'The only way down into the Caldera is the Lava Stair, cut through six channels of running fire. Alric knows the old wheels and levers that tame them, if {name} can reach them.',
    o: {
      brief: 'Speak to Alric at the head of the Lava Stair',
      vent1: 'Turn the first vent wheel', chan1: 'Cross the first lava channel', marks: 'Read the stokers\' chalk marks',
      lever1: 'Pull the first gantry lever', chan2: 'Cross the second lava channel', golems: 'Break the golems on the terrace',
      vent2: 'Turn the second vent wheel', chan3: 'Cross the third lava channel', ghost: 'Speak to the stoker\'s shade on the landing',
      vent3: 'Turn the third vent wheel', chan4: 'Cross the fourth lava channel', tally: 'Read the vent tally',
      lever2: 'Pull the second gantry lever', chan5: 'Cross the fifth lava channel', gnats: 'Drive off the gnats on the fifth terrace',
      vent4: 'Turn the last vent wheel', roar: 'Listen to the vents roar', chan6: 'Cross the last lava channel',
      cache: 'Search the stoker\'s cache at the foot', report: 'Speak to Alric at the foot of the stair',
    },
  },
  m49: {
    title: 'Allies at the Rim',
    summary: 'Hrolf says the allies are waiting for a signal. Light the rim\'s fire, welcome whoever comes up the stairs, and make the camp ready for Vey\'s Warhost.',
    o: {
      brief: 'Speak to Hrolf at the Rim Camp', signal: 'Light the rim\'s signal fire', arrive: 'Watch the allies come up the stairs',
      wystan: 'Speak to Lord Wystan', merrin: 'Speak to Merrin', wenna: 'Speak to Wenna', wulfhild: 'Speak to Wulfhild', rook: 'Speak to Rook', edric: 'Speak to Edric',
      maud: 'Speak to Mother Maud at her new kitchen', plan: 'Read the gate\'s old defence plan', tally: 'Read the stokers\' stores tally',
      banners: 'Raise the banners at the Rim Gate', rise: 'Watch the banners rise', table: 'Study the war table',
      'post.brace': 'Set the brace beams at the gate', 'post.crates': 'Stack the flask crates by the wall', 'post.wall': 'Mark the archers\' wall',
      report: 'Speak to Hrolf',
    },
  },
  r26: {
    title: 'Oswin\'s Loyalists',
    summary: 'House Oswin\'s last convoy stopped at the Rimfoot fire and will not climb the rim in the open. Merrin asks {name} to bring it up, by the short road or the safe one.',
    o: {
      brief: 'Speak to Merrin', guard: 'Speak to the convoy\'s guard at Rimfoot', manifest: 'Read the convoy\'s manifest',
      master: 'Speak to the convoy master and choose the road', load: 'Load the convoy',
      ambush1: 'Drive off the wraiths on the stairs', ambush2: 'Break the Warhost outriders above the hairpin',
      brake1: 'Set the cart\'s brake at the first halt', halt1: 'Wait out the first storm on the east flank',
      brake2: 'Set the cart\'s brake at the second halt', halt2: 'Wait out the second storm',
      road: 'Bring the convoy to the Rim Camp', in: 'See the convoy in', unload: 'Unload the convoy', waybill: 'Read the convoy master\'s waybill',
      report: 'Speak to Merrin',
    },
  },
  r29: {
    title: 'The Last Gong',
    summary: 'The rim\'s forge gong is silent and the stokers\' dead walk the shelves. Ansgar says it can be hung again, if {name} brings back its three parts from the old stoker posts.',
    o: {
      brief: 'Speak to Ansgar at the camp',
      ghost1: 'Speak to the shade at the stokers\' hut', search1: 'Search the hut\'s doorway', dead1: 'Lay the dead at the hut to rest', carry1: 'Carry the hammer to the gong frame',
      ghost2: 'Speak to the shade on the west shelf', search2: 'Search the west shelf', dead2: 'Lay the dead on the shelf to rest', carry2: 'Carry the rope to the gong frame',
      ghost3: 'Speak to the shade on the tunnel path', search3: 'Search the niche on the path', dead3: 'Lay the dead on the path to rest', carry3: 'Carry the wedge to the gong frame',
      hang: 'Hang the gong\'s parts', strike: 'Strike the gong in Ansgar\'s count', sound: 'Listen to the gong', report: 'Speak to Ansgar',
    },
  },
  m50: {
    title: 'The Cooling Hall',
    summary: 'Below the Lava Stair, the stokers\' Cooling Hall runs hot. Alric needs its three channels routed in the old order, before the heat finds {name} first.',
    o: {
      brief: 'Speak to Alric at the Cooling Hall', keeper: 'Speak to the Hall\'s keeper', chart: 'Read the stokers\' chart',
      chan1: 'Route the first channel', golems2: 'Break the golems in the second chamber', key: 'Read the chart by the valve key',
      chan2: 'Route the second channel', golems3: 'Break the golems in the third chamber', chan3: 'Route the last channel',
      cool: 'Watch the hall cool', golems4: 'Break the golems in the forge', mark: 'Read the forge\'s mark', report: 'Speak to Alric',
    },
  },
  m51: {
    title: 'Dragons Gather',
    summary: 'A horn-stone at the camp has spoken in Ysmeryth\'s voice. The dragons are coming to the Wyrm Terraces, and Vey\'s scouts will not be far behind.',
    o: {
      call: 'Answer the keeper\'s horn-stone', alric: 'Speak to Alric', edric: 'Speak to Edric', stone: 'Rekindle the Wyrm Terraces waystone',
      landed: 'Watch the dragons come', ysmeryth: 'Speak to Ysmeryth', orsk: 'Speak to Orsk', hathren: 'Speak to Hathren',
      fires: 'Look down at the plain', scouts: 'Break the Warhost scouts on the east terraces', captain: 'Speak to the wounded scout captain',
      orders: 'Read the scouts\' orders', bones: 'Look at the old bones on the ledge', report: 'Speak to Ysmeryth',
    },
  },
};

/** The director's toasts and the escort's name. */
export const RIM_A5_DIRECTOR_TEXT: Record<string, string> = {
  'rim.q.m47.gate': 'The winch takes. Somewhere above, chains run and the Rim Gate groans open.',
  'rim.q.m48.vent': 'The vent wheel turns. Steam roars, and the channel below crusts over.',
  'rim.q.m48.ventShut': 'The vent sighs shut. The crust is melting again.',
  'rim.q.m48.lever': 'The gantry swings out over the channel.',
  'rim.q.m49.banner': 'The banner climbs the pole.',
  'rim.q.m49.post': 'Done. One less thing for Vey to find undone.',
  'rim.q.r26.road.fast': 'The convoy takes the rim stairs. Keep it moving.',
  'rim.q.r26.road.long': 'The convoy takes the east flank. Watch the sky.',
  'rim.q.r26.ambush': 'Shapes on the stairs ahead. Guard the cart.',
  'rim.q.r26.wounded': 'A guard is down. The others carry him on.',
  'rim.q.r26.storm': 'A storm wall over the flank. Set the brake and wait it out.',
  'rim.q.r26.passed': 'The storm has passed. The cart rolls on.',
  'rim.q.r26.crates': 'Two crates slid off in the wind. No going back for them.',
  'rim.q.r29.part': 'The part sits in its place on the gong frame.',
  'rim.q.m50.wrong': 'Wrong wheel. The needle jumps.',
  'rim.q.m50.right': 'The sluice opens with a groan.',
  'rim.q.m50.steam': 'The gauge bursts. Steam fills the chamber.',
  'rim.q.m50.lesson': 'The chart\'s next number glows faintly.',
  'rim.q.m50.gauge': 'Heat: {seconds} s before the steam',
  'rim.q.m50.routed': 'The channel runs clear. The gate ahead lifts.',
  'rim.q.m51.scouts': 'Warhost scouts on the east terraces, in a shield line.',
  'escort.a5.r26': 'Oswin\'s convoy',
  ...beatStrings('rim.q.r29.beat', {
    start: 'Ansgar raises his hand. Strike when he counts, one stroke a beat.', lesson: 'Strike on the gold cells.', real: 'Strike the gong: the gold cells.',
    falter: 'The gong clangs out of time. Ansgar counts again.', assist: 'Ansgar counts aloud with you.',
  }),
};

export const RIM_A5_QUEST_STRINGS: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const [id, q] of Object.entries(QUEST_TEXT)) {
    out[`quest.${id}.title`] = q.title;
    out[`quest.${id}.summary`] = q.summary;
    for (const [oid, text] of Object.entries(q.o)) out[`quest.${id}.${oid}`] = text;
  }
  for (const [k, v] of Object.entries(RIM_A5_PROMPTS)) out[`quest.prompt.a5r.${k}`] = `{key} ${v}`;
  for (const part of ['hammer', 'rope', 'wedge']) out[`quest.prompt.a5r.carry.${part}`] = `{key} Pick up the gong's ${part}`;
  Object.assign(out, RIM_A5_DIRECTOR_TEXT, RIM_A5_SCENE_STRINGS);
  return out;
})();
