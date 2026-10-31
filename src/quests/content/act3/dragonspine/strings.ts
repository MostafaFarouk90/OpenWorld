// Quest text for the seven lower Dragonspine quests (titles, summaries, one line a step) and the prop prompts, in the shape of
// Act 2's strings.ts. No literal player name and no dashes (the content tests check both).
interface QuestText { title: string; summary: string; o: Record<string, string> }

const QUEST_TEXT: Record<string, QuestText> = {
  m28: {
    title: 'Climb to Wyrmwatch',
    summary: 'Thorgar Skyhold keeps the lodge on the first shoulder of the Dragonspine. Before the knight goes higher he must climb the lodge trail to the Hawk Crag, see what hunts the slope and look up at what is above it.',
    o: {
      brief: 'Hear Thorgar Skyhold out', hunter1: 'Talk to the first lodge hunter', hunter2: 'Talk to the second lodge hunter', hunter3: 'Talk to the third lodge hunter',
      hunter4: 'Talk to the fourth lodge hunter', trailhead: 'Reach the trailhead above the lodge', scout: 'Put down the hunter scout on the trail',
      cairns: 'Search the four cairns on the trail', ledge1: 'Stand on the first Leap ledge', ledge2: 'Stand on the second Leap ledge',
      climb: 'Climb on toward the crag', crag: 'Clear the Hawk Crag of its hawks and its ogre', view: 'Look out from the crag',
      report: 'Report to Thorgar at the lodge',
    },
  },
  r15: {
    title: 'Skyhold Supplies',
    summary: 'The hunters on the heights need rope, lamp oil and salt, and the lodge sleds cannot haul themselves. Drag three sleds up the road to the cache while the hawks stoop, then decide where the surplus goes.',
    o: {
      brief: 'Hear Thorgar out', hand1: 'Talk to the first sled-hand', hand2: 'Talk to the second sled-hand',
      hauls: 'Haul the three sleds to the cache', unload: 'Unload the surplus at the cache', choice: 'Choose where the surplus goes', report: 'Report to Thorgar',
    },
  },
  m29: {
    title: 'The Hermit of Rime Pass',
    summary: 'Eadgyth Frostbrow keeps a shelter on Rime Pass and talks to no one. Read what she has hung on her wall, fetch her firewood past the hawks, light her fire and hear why a hunter stopped hunting.',
    o: {
      greet: 'Speak to Eadgyth Frostbrow', trophies: 'Read the five trophies on her wall', hawks: 'Drive the hawks off the woodpile', wood: 'Gather wood at the woodpile',
      fire: 'Light the shelter fire', firetalk: 'Talk with Eadgyth by the fire', confession: 'Hear what Eadgyth did', report: 'Report to Eadgyth',
    },
  },
  r16: {
    title: "Frostbrow's Lost Axe",
    summary: 'Eadgyth left her dragon-axe in a cave forty winters ago and has not forgiven herself. The mouth is guarded, the passage has fallen in, and what she asks after is hers to give away or keep.',
    o: {
      brief: 'Hear Eadgyth out', hunter: 'Speak to the hunter at the cave', pack: 'Clear the pack at the cave mouth', mouth: 'Reach the cave mouth',
      passage: 'Search the passage', rockfall: 'Clear the rockfall', chamber: 'Search the chamber', axe: 'Dig out the axe', lines: 'Take in the chamber',
      choice: 'Settle the axe with Eadgyth', report: 'Report to Eadgyth',
    },
  },
  m30: {
    title: "The Keepers' Rubbings",
    summary: 'The Last Anvil stands cold above the pass, its six carvings worn almost smooth. Brother Ansgar asks the knight to clear the shoulder, wake the Anvil and take rubbings of the carvings before the frost has them.',
    o: {
      brief: 'Hear Brother Ansgar out', lore: 'Hear the lore of the smith shrine', pilgrim: 'Speak to the pilgrim at the shoulder',
      pack: 'Clear the hawks and the ogre from the shoulder', sweep: 'Sweep the Last Anvil', relight: 'Relight the Anvil\'s fire', sound: 'Sound the Anvil',
      rekindle: 'Rekindle the Last Anvil\'s waystone', rise: 'Watch the Anvil wake with Ansgar', rubbings: 'Take the six rubbings', marks: 'Read the two keeper marks',
      carvings: 'Have the carvings read aloud', report: 'Report to Brother Ansgar',
    },
  },
  r17: {
    title: 'Candles for the Last Anvil',
    summary: 'Ansgar has six forge candles for the six wayside shrines along the road from the Anvil, and no one to carry them. Walk them down to shrines three, two and one, and back up past the Anvil to four, five and six.',
    o: {
      brief: 'Hear Brother Ansgar out', take: 'Take the forge-candle bundle at the Anvil', shrine3: 'Light the third wayside shrine', shrine2: 'Light the second wayside shrine',
      pilgrim1: 'Speak to the pilgrim on the road', shrine1: 'Light the first wayside shrine', shrine4: 'Light the fourth wayside shrine',
      shrine5: 'Light the fifth wayside shrine', pilgrim2: 'Speak to the pilgrim at the high shrines', shrine6: 'Light the sixth wayside shrine',
      report: 'Report to Ansgar at the Last Anvil',
    },
  },
  r18: {
    title: 'Rime Hawk Eggs',
    summary: 'An egg thief has been robbing the rime hawks of the Hawk Cliffs, and the parents have turned on the lodge in return. Persuade the thief, search his camp and carry the eggs back up the cliff. If a parent dies the eggs go back to the camp.',
    o: {
      brief: 'Hear Thorgar out', thief: 'Speak to the egg thief at his camp', excuse: 'Hear the thief\'s excuse', camp: 'Search the thief\'s camp',
      nested: 'Carry the three eggs up the cliff and set them in the nest. If a parent dies, the eggs go back to the camp.', report: 'Report to Thorgar',
    },
  },
};

/** Prompt text for the props (the key is prefixed). */
const PROMPTS: Record<string, string> = {
  unload: 'Unload the surplus', wood: 'Gather wood', fire: 'Light the fire', rockfall: 'Clear the rockfall', axe: 'Dig out the axe',
  bundle: 'Take the candle bundle', bundleLying: 'Take up the candle bundle', egg: 'Take a hawk egg', nest: 'Set the egg in the nest',
};

/** The director's toasts. */
export const DIRECTOR_TEXT: Record<string, string> = {
  'dragonspine.q.r18.failed': 'The parents took the eggs back to the camp.',
  'dragonspine.q.r18.set1': 'One egg is back in the nest.',
  'dragonspine.q.r18.set2': 'Two eggs are back in the nest.',
  'dragonspine.q.r18.set3': 'All three eggs are back in the nest.',
  'dragonspine.q.r15.delivered': 'The sled is at the cache.',
  'dragonspine.q.r17.switch': 'The first shrine burns. Carry the candles back up the road.',
  'dragonspine.q.r17.lost': 'The candle bundle went back to the last shrine you passed.',
  'dragonspine.q.m28.ledge': 'You are on the ledge.',
  'dragonspine.q.m29.fire': 'The shelter fire catches.',
  'dragonspine.q.r16.rockfall': 'The rockfall shifts and the passage opens.',
};

export const DRAGONSPINE_QUEST_STRINGS: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const [id, q] of Object.entries(QUEST_TEXT)) {
    out[`quest.${id}.title`] = q.title;
    out[`quest.${id}.summary`] = q.summary;
    for (const [oid, text] of Object.entries(q.o)) out[`quest.${id}.${oid}`] = text;
  }
  for (const [k, v] of Object.entries(PROMPTS)) out[`quest.prompt.${k}`] = `{key} ${v}`;
  Object.assign(out, DIRECTOR_TEXT);
  return out;
})();
