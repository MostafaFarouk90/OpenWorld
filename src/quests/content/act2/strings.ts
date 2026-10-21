
interface QuestText { title: string; summary: string; o: Record<string, string> }

const QUEST_TEXT: Record<string, QuestText> = {
  m11: {
    title: 'Road of Cinders',
    summary: "The waystones along the Cinder Road have gone dark. Gaut will ride out under the Halvard banner to relight the first, and you ride with him.",
    o: {
      brief: 'Hear Gaut out at the Bastion', banner: 'Raise the Halvard banner at the River Gate', ring: 'Ride the Cinder Road to the dark waystone',
      ambush: 'Beat the Footmen who ambush the column', search: 'Search the road for what happened to the courier',
      blooms: 'Cleanse the three blightblooms around the stone', wraiths: 'Put down the wraiths the blooms raise',
      stone: 'Rekindle the Cinder Road waystone', report: 'Report to Gaut',
    },
  },
  m12: {
    title: 'Cinderford Under Siege',
    summary: "Reeve Osgar Thane has a barricade, a militia of farmers and a raid coming down the hill. Help him hold Cinderford, then see to the wounded.",
    o: {
      brief: 'Hear Reeve Osgar out', prep: 'Prepare the barricade', raid: 'Hold Cinderford against the raid',
      carry: 'Carry the wounded to the refuge', tend: 'Tend the wounded who cannot be moved', read: 'Read the militia roll and the cart tally',
      report: 'Report to Osgar',
    },
  },
  r06: {
    title: 'The Cinderford Well',
    summary: "Cinderford's well has turned. Mother Maud asks you to learn what is in it, and then either cleanse it or seal it and evacuate the town.",
    o: {
      brief: 'Hear Mother Maud out', samples: 'Take three samples of the blight', wellhouse: 'Search the well-house',
      keeper: 'Talk to the well-keeper', households: "Hear from Cinderford's four households", choice: 'Decide the well\'s fate with Maud',
      bundles: 'Carry the households\' bundles to the cart', board: 'Board up the well', sealed: 'Tell Maud it is done',
      fire: 'Cleanse the well with your own fire', rite: "Guard Pennard's rite against the wraiths", cleansed: 'Tell Maud the well runs clear',
    },
  },
  r05: {
    title: "Ketta's Lost Flock",
    summary: "Ketta Fellwalker's flock went into the ash-fog and did not come out. Find the sheep and bring them home by whichever road you trust.",
    o: {
      brief: 'Hear Ketta out', hollows: 'Search the three fog hollows', tracks: 'Follow the flock\'s tracks', boy: 'Find the shepherd boy',
      hounds: 'Drive off the hounds in the fog', choice: 'Choose the road home', foxStops: 'Follow the Kindling Fox through its four stops',
      dell: 'Find the stone in the Kindling Dell', herdHome: 'Bring the flock home', report: 'Tell Ketta',
    },
  },
  m13: {
    title: "The Warden's Oath",
    summary: "Hrolf Ironbrow holds Stonefold and will follow no one who has not shown he can stand. Pass the wardens' tests and the trial of strength.",
    o: {
      brief: 'Meet Hrolf Ironbrow at Stonefold', kin: "Talk to Hrolf's kin in the hall", logs: 'Carry the three logs to the ring',
      banter: 'Talk to Hrolf at the ring', heave: 'Heave the boulder to the gate', hall: "Search the brothers' hall",
      duel: "Win Hrolf's trial of strength", oath: 'Take the warden\'s oath',
    },
  },
  r07: {
    title: "Wolf-Mother's Kits",
    summary: "Something has made a den near the pasture and the dogs are gone. Ketta says there are pups in it. Decide what happens to them.",
    o: {
      brief: 'Hear Ketta out', shepherd: 'Talk to the shepherd who lost his dogs', signs: 'Read the den signs', hounds: 'Beat the hounds',
      mother: 'Face the wolf-mother', choice: 'Decide the pups\' fate', pups: 'Cull the pups', report: 'Tell Ketta',
    },
  },
  r11: {
    title: "Hrolf's Brother's Axe",
    summary: "Hrolf's brother went up to a wyrm's den with an axe and never came down. Hrolf wants the axe back. What you do about the wyrm is your own choice.",
    o: {
      brief: "Hear Hrolf's story", widow: "Talk to his brother's widow", camp: "Search the brother's last camp", ledge1: 'Climb the first ledge to the den',
      ledge2: 'Climb the second ledge', den: 'Reach the den', hounds: "Beat the hounds in the wyrm's den", wyrm: 'Face the wyrm',
      axe: "Take the brother's axe", report: 'Return the axe to Hrolf',
    },
  },
  m14: {
    title: 'Hushed Anvil Rites',
    summary: "Sister Aelfreda has found the Hushed Anvil, a shrine gone silent on a ridge above the pass. Climb to it, rekindle it, and learn what a fire can teach a smith.",
    o: {
      brief: 'Hear Aelfreda out', ledge1: 'Climb the ridge ledges', ledge2: 'Climb the ridge ledges', ledge3: 'Climb the ridge ledges',
      golems: "Break the ridge's cinder golems", hounds: 'Drive off the ember hounds', rekindle: 'Rekindle the Hushed Anvil',
      murals: 'Study the three murals', keeper: 'Talk to the lantern-keeper', temper: 'Temper two pieces of gear at the Anvil',
      sings: 'Listen to the Anvil sing', rite: 'Take Aelfreda\'s Hearth Rite',
    },
  },
  m15: {
    title: "The Hunters' Pens",
    summary: "Dragon-hunters have set cages in a camp above Cinderford. Scout the camp, break the hunters and free what they hold.",
    o: {
      brief: "Hear Osgar's scouts out", scout: 'Scout the camp unseen', spearmen: 'Beat the hunters', harpooners: 'Beat the harpooners',
      ledgers: "Read the hunters' papers", keys: 'Take the cage keys', carter: 'Talk to the bound carter', doubter: 'Talk to the hunter who doubts',
      free: 'Free the bound carter', cage: 'Open the wyrmling\'s cage', flight: 'Watch the wyrmling fly', report: 'Report to Osgar',
    },
  },
  d03: {
    title: 'The Fall of Scorchhold',
    summary: "Scorchhold is where the hunters send what they take. Storm the fort, break Hunt-Captain Redmane and learn who is buying.",
    o: {
      brief: "Hear Osgar's siege plan", gate: 'Break the fort gate', court: 'Clear the courtyard', yard: 'Beat the yard harpooners', perch: 'Bring down the wall harpooners',
      keep: "Search the keep's papers", boss: 'Face Hunt-Captain Redmane', prisoners: 'Free the two caged prisoners', testimony: "Hear Redmane's testimony",
      report: 'Report to Osgar',
    },
  },
};

const PROMPTS: Record<string, string> = {
  banner: 'Raise the banner', bloom: 'Cleanse the blightbloom', prep: 'Prepare', tend: 'Tend the wounded', sample: 'Take a sample', boardWell: 'Board up the well',
  cleanseWell: 'Cleanse the well', hollow: 'Search the hollow', track: 'Read the tracks', dellStone: 'Touch the stone', heave: 'Heave (hold)',
  sign: 'Read the sign', cullPup: 'Cull the pup', axe: 'Take the axe', cageKeys: 'Take the keys', freeCarter: 'Cut the bonds', openCage: 'Open the cage',
  charge: 'Set a charge (hold)', freePrisoner: 'Free the prisoner', carryWounded: 'Carry the wounded', carryBundle: 'Carry the bundle', carryLog: 'Carry the log',
};

export const ACT2_QUEST_STRINGS: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const [id, q] of Object.entries(QUEST_TEXT)) {
    out[`quest.${id}.title`] = q.title;
    out[`quest.${id}.summary`] = q.summary;
    for (const [oid, text] of Object.entries(q.o)) out[`quest.${id}.${oid}`] = text;
  }
  for (const [k, v] of Object.entries(PROMPTS)) out[`quest.prompt.${k}`] = `{key} ${v}`;
  out['codex.lore.cinder-courier.name'] = "The Courier's Letter";
  out['codex.lore.cinder-courier.body'] = 'A Halvard courier died on the Cinder Road with a warning for Reeve Osgar: the waystones north of the Hushed Anvil have gone dark, and the road is not safe.';
  out['codex.lore.cinderford-well-rolls.name'] = "Cinderford's Well-Rolls";
  out['codex.lore.cinderford-well-rolls.body'] = "The well-keeper's tally of the sick: forty-four in six days, and a last column of \"sleepers\" that was never counted.";
  out['codex.lore.stonefold-rune.name'] = "The Warden's Rune";
  out['codex.lore.stonefold-rune.body'] = 'Cut into the brothers\' hall at Stonefold: "Who stands in the gap is the wall." A newer line beneath: "And the wall answers."';
  return out;
})();
