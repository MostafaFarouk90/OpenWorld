// Act 4 (L4): companion lines for the Ashen Waste, the M37 bond (rank 2) and the mourning for Sir Gaut after M39.
// Invented lines (Q6), logged in design/changes-applied.md. Voices follow design 8.1 and Act 3's: Tobb narrates the
// party's heroics wrongly and edits the ballad, Aelfreda is deadpan and practical, Hrolf bribes monsters with food.
// Nothing here is said before its flag (the Waste opens at M42, Gaut falls at M39).

/** The line key of an Act 4 bark: the shipped area-pool pattern with an `a4.` place prefix. */
export const act4BarkKey = (id: string, place: string, n: number): string => `companion.${id}.bark.area.a4.${place}.${n}`;

const lines = (id: string, place: string, texts: readonly string[]): Record<string, string> =>
  Object.fromEntries(texts.map((t, i) => [act4BarkKey(id, place, i + 1), t]));

const TOBB: Record<string, readonly string[]> = {
  waste: [
    'The Ashen Waste. In the ballad it is grey. In real life it is also grey. I had hoped for a surprise.',
    'Ash in my lute, ash in my boots, ash in my verses. The verses were already a bit ashy.',
    'Nothing grows here. Not even applause.',
  ],
  walkerCamp: [
    'The Ashwalkers! They sing to the dunes. I sing to taverns. We are practically cousins.',
    'They tie their dead to the rope so they never walk alone. I will not put that in a drinking song.',
  ],
  cinderChapel: [
    'A chapel with no roof and a child who still lights candles. I am going to need a slower tune.',
    'Mind the houses. The ash remembers the people even if the walls do not.',
  ],
  cathedral: [
    'The Cathedral of Husks. The name alone ruins the chorus. Nothing rhymes with husks. Dusks? Tusks. No.',
    'Quietly, please. Something in there is still praying, and it does not sound happy about it.',
  ],
  rim: [
    'The rim of the Caldera. Write this down: the knight did not look back. I looked back. Twice.',
    'From here the whole sky is a forge. I always wanted to see the end of the song. Not this close.',
  ],
  storm: [
    'Storm! Hold the rope! The ballad says I was brave here. Hold the rope anyway!',
    'I cannot see my own hand. Is that my hand? That is your hand. Keep it on the rope.',
  ],
  walkers: ['They walk the storms on purpose. Remind me never to ask what they do for fun.'],
  ebba: ['A little girl alone in the Waste, humming. I know that tune. I do not know how I know it.'],
  bond2: ['Before you ride out tomorrow: I meant every verse. Even the wrong ones. Especially the wrong ones.'],
  mourning: ['I wrote Sir Gaut a song about being quiet once. I think I will sing it now. Quietly.'],
};

const AELFREDA: Record<string, readonly string[]> = {
  waste: [
    'Cover your mouth. Ash in the lungs is a slow wound, and I have not packed for slow wounds.',
    'Nothing lives here but the dead and us. Let us keep it that way round.',
    'Drink when you are not thirsty. Out here, thirst arrives all at once.',
  ],
  walkerCamp: [
    'Rain-casks under every awning. These people treat water the way the Church treats relics. Rightly.',
    'They bury no one. They give the ash back to the wind. I find I do not mind it.',
  ],
  cinderChapel: [
    'A hearth-chapel, like mine. Someone kept it after the roof went. That is faith, or stubbornness. Often the same.',
    'Three houses, three hearths. Light them for the families. It costs us a minute.',
  ],
  cathedral: [
    'The husks still kneel in their rows. Grief that has forgotten what it was grieving.',
    'If he can be released, release him. If not, do it quickly. Either is a mercy.',
  ],
  rim: [
    'The Caldera. The Church called it the end of the world. It looks more like a beginning that has not finished.',
    'Rest before you climb. I will not carry you, and I will not let you fall.',
  ],
  storm: [
    'Rope. Hand. Step. Do not let go to help me; I will be holding on to you.',
    'Close your eyes if the ash stings. Your feet know the rope better than your eyes do.',
  ],
  walkers: ['They walk into storms by choice. I respect anyone with fewer sensible options than I have.'],
  ebba: ['That child has been alone a long time and is very calm about it. Calmer than I would be.'],
  bond2: ['You asked once why I kept the Hushed Anvil burning. I think it was so someone like you would find it.'],
  mourning: ['Sir Gaut never asked me to pray for him. I am doing it anyway. He can complain later.'],
};

const HROLF: Record<string, readonly string[]> = {
  waste: [
    'Nothing up here worth eating, and nothing that wants to eat us. That second part I do not trust.',
    'My brother crossed a waste like this once. He said: walk slowly, and keep the bread dry.',
    'Striders. Big legs, small manners. Bring them something wet and they forget they were angry.',
  ],
  walkerCamp: [
    'Ashwalkers. Good folk. They share water, and they do not ask what you did to earn it.',
    'I traded a whole ham for a coil of rope here. Best trade of my life. The ham agrees.',
  ],
  cinderChapel: [
    'A wraith nest in the second house. I will go first. They do not like the smell of Warden.',
    'Children should not be this brave. Someone should have been here to be brave for her.',
  ],
  cathedral: [
    'Husk Knights. Hit the ember in the chest. If that fails, offer it nothing, it has eaten enough.',
    'This place was holy once. You can feel where it was and where it stopped.',
  ],
  rim: [
    'The Caldera. The old Wardens said the mountain here breathes. I can hear it. Steady, like a sleeper.',
    'From here on we look after each other first and the road second.',
  ],
  storm: [
    'Down, and hold the rope! The storm does not care how strong you are. Neither does the rope, but it holds.',
    'Count your steps. Forty, then a knot. Forty, then a knot. That is how my brother taught me.',
  ],
  walkers: ['Walkers carry their dead on the rope. My brother would have liked them. He liked anyone who carried things.'],
  ebba: ['Little one, take the bread. No, all of it. I have more. I always have more.'],
  bond2: ['My brother would have liked you. That is the most I can say of anyone, and I say it of you.'],
  mourning: ['Sir Gaut held the stairs so the boy could live. A Warden could not ask for a better death. I still wanted him to live.'],
};

export const ACT4_BANTER_TEXT: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> = {
  tobb: TOBB,
  aelfreda: AELFREDA,
  hrolf: HROLF,
};

/**
 * Lines that change after `story.m39.complete`: the shipped key on the left speaks of Gaut as alive, the key on the
 * right mourns him. Every companion line that names Gaut is listed (Tobb's elapsed.5 is the only one in the pools).
 */
export const MOURNING_LINES: Readonly<Record<string, { key: string; text: string }>> = {
  'companion.tobb.bark.elapsed.5': {
    key: 'companion.tobb.bark.elapsed.5.mourning',
    text: 'Sir Gaut once told me to be quiet. I have been, a little, since the stairs. He would have enjoyed that.',
  },
};

/** One companion's Act 4 strings (its barks and its mourning swaps); spread into that companion's own table. */
export function act4BarkStrings(id: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [place, texts] of Object.entries(ACT4_BANTER_TEXT[id] ?? {})) Object.assign(out, lines(id, place, texts));
  for (const [from, swap] of Object.entries(MOURNING_LINES)) if (from.startsWith(`companion.${id}.`)) out[swap.key] = swap.text;
  return out;
}

/** Every Act 4 companion string (the three tables together; for tests). */
export function companionAct4Strings(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [id, places] of Object.entries(ACT4_BANTER_TEXT)) {
    for (const [place, texts] of Object.entries(places)) Object.assign(out, lines(id, place, texts));
  }
  for (const swap of Object.values(MOURNING_LINES)) out[swap.key] = swap.text;
  return out;
}
