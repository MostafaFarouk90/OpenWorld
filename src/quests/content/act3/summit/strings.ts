// Quest text for the five summit quests (titles, summaries, one line a step), the prop prompts and the director's toasts, in the shape
// of the lower block's strings.ts. No literal player name and no dashes (the content tests check both).
interface QuestText { title: string; summary: string; o: Record<string, string> }

const QUEST_TEXT: Record<string, QuestText> = {
  m31: {
    title: "The Coal-Mother's Trial",
    summary: 'Eadgyth Frostbrow says the Keeper of the Hearth will not speak to anyone she has not tested. Ride with her to the summit gate, climb the roost past the hawks, and face Ysmeryth in a trial where nobody is meant to die.',
    o: {
      brief: 'Hear Eadgyth out about the Keeper', gate: 'Ride to the summit gate', gatetalk: 'Speak with Eadgyth at the gate', ledge1: 'Stand on the first Leap ledge of the roost climb',
      ledge2: 'Stand on the second Leap ledge', ledge3: 'Stand on the third Leap ledge', climb: 'Take the last of the climb', hawks: 'Drive off the roost hawks',
      relics: 'Search the claw ledge, the dead hunter\'s horn and the shed scale', before: 'Listen to Ysmeryth', trial: 'Face the Coal-Mother\'s trial. Break her three times, or yield after two breaks.',
      after: 'Hear what Ysmeryth has to say', hearth: 'Walk down to the Wyrm\'s Hearth', report: 'Report to Eadgyth at the Hearth',
    },
  },
  m32: {
    title: 'Ysmeryth Speaks',
    summary: 'The Coal-Mother has agreed to talk. She will tell the Keepers\' account, show the vision in the keeper-stone, and ask the knight to lay the Heartshard on it. What she shows will change what the old rubbings say, and what the knight carries.',
    o: {
      speak: 'Speak with Ysmeryth at the Hearth', vision: 'Watch the vision at the keeper-stone', lay: 'Lay the shard on the keeper-stone', hoard: 'Search the hoard',
      rubbing: 'Hear Ysmeryth read a rubbing', eadgyth: 'Speak with Eadgyth', companions: 'Speak with your companions', axe: 'Settle the matter of the axe',
    },
  },
  m33: {
    title: "The Hunters' Net",
    summary: 'Thorgar Skyhold says Vey\'s hunters have strung a net of tarred rope across the Skyhold spur, and are taking wyrmlings in it. Cut its six anchors, deal with the hunters who guard them, free the handler and set the wyrmlings flying.',
    o: {
      brief: 'Hear Thorgar out at Skyhold', rigger: 'Speak with the net-rigger', camp: 'Search the camp', anchors: 'Cut the six net anchors', packs: 'Deal with the hunters at the anchors',
      handler: 'Speak with the freed wyrmling handler', flight: 'Watch the wyrmlings fly', aftermath: 'See what is left of the camp', report: 'Report to Thorgar',
    },
  },
  m34: {
    title: 'Fire Sworn',
    summary: 'Ysmeryth takes her oath, and the dragons of the summit swear to the Forge through the one who carries its shard. Kindle the Wyrm\'s Hearth, read what the keepers carved, and walk to the first glide ledge.',
    o: {
      oath: 'Hear Ysmeryth\'s oath', swear: 'Witness the dragons swear', companions: 'Speak with your companions', thorgar: 'Speak with Thorgar', carvings: 'Read two of the carvings round the Hearth',
      markers: 'Read the two glide markers', rekindle: 'Rekindle the Wyrm\'s Hearth', ledge: 'Walk to the first glide ledge', report: 'Report to Ysmeryth',
    },
  },
  d06: {
    title: 'Wings of Frostfang',
    summary: 'Hunt-Marshal Corvin Skarl holds the Frostfang Aerie and keeps a drake in chains. Glide over the chasm, learn what the keep knows, open the gate and face the Marshal.',
    o: {
      brief: 'Hear Thorgar out at the chasm ledge', lip: 'Make ready at the lip', land: 'Glide to the Frostfang Aerie', captive: 'Speak with the captive hunter in the keep',
      keep: 'Search the keep', aerie: 'Search the Aerie', hawk: 'Free the caged hawk', winch: 'Turn the gate winch', courtyard: 'Clear the courtyard',
      lines: 'Take stock of the Aerie', skarl: 'Face Hunt-Marshal Corvin Skarl', outcome: 'See what comes of the Marshal', feed: 'Read the drake\'s feed log', report: 'Report to Thorgar at the landing',
    },
  },
};

const PROMPTS: Record<string, string> = {
  lay: 'Lay the shard on the stone', netAnchor: 'Cut the net anchor', hawkCage: 'Open the cage', winch: 'Turn the winch', ysmeryth: 'Speak with Ysmeryth',
};

/** The director's toasts. */
export const SUMMIT_DIRECTOR_TEXT: Record<string, string> = {
  'dragonspine.q.m31.called': 'Ysmeryth calls you back.',
  'dragonspine.q.m31.respect': "Dragon's Respect: an extra charge of the Surge.",
  'dragonspine.q.m31.trust': "Keeper's Trust: the dragons will remember.",
  'dragonspine.q.m31.ledge': 'You are on the ledge.',
  'dragonspine.q.m32.perk': "Keeper's Understanding: your Burn cools twice as fast while you walk.",
  'dragonspine.q.m32.axe': 'The dragons will remember the axe.',
  'dragonspine.q.m33.cut': 'The net sags.',
  'dragonspine.q.m33.witness': 'A hunter saw you spare another.',
  'dragonspine.q.m34.lit': 'The Wyrm\'s Hearth burns again.',
  'dragonspine.q.d06.landed': 'You have come down at the Frostfang Aerie.',
  'dragonspine.q.d06.gate': 'The gate groans open.',
  'dragonspine.q.d06.hawk': 'The hawk flies free.',
};

export const SUMMIT_QUEST_STRINGS: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const [id, q] of Object.entries(QUEST_TEXT)) {
    out[`quest.${id}.title`] = q.title;
    out[`quest.${id}.summary`] = q.summary;
    for (const [oid, text] of Object.entries(q.o)) out[`quest.${id}.${oid}`] = text;
  }
  for (const [k, v] of Object.entries(PROMPTS)) out[`quest.prompt.${k}`] = `{key} ${v}`;
  Object.assign(out, SUMMIT_DIRECTOR_TEXT);
  return out;
})();
