// Quest text for the nine Greyfen quests (titles, summaries, one line a step) and the prop prompts, in the shape of Act 2's strings.ts.
interface QuestText { title: string; summary: string; o: Record<string, string> }

const QUEST_TEXT: Record<string, QuestText> = {
  m23: {
    title: 'Into the Fen',
    summary: 'Leofa Hartley will not let the knight walk into the Greyfen blind. Follow the Reedgate causeway to Hathren\'s Mere: clear the leech knots, lower the plank bridges and learn what the water is hiding.',
    o: {
      brief: 'Hear Leofa Hartley out', folk1: 'Talk to the Reedgate reed-wife', folk2: 'Talk to the net-mender', folk3: 'Talk to the boy on the walk',
      ranger: 'Speak to the causeway ranger', cart: 'Search the drowned cart', knot1: 'Burn out the first leech knot', marker: 'Read the way-marker',
      bridge1: 'Lower the first plank bridge', pack: 'Search the ranger\'s pack', knot2: 'Clear the second leech knot', bridge2: 'Lower the second plank bridge',
      knot3: 'Clear the third leech knot', sight: 'Come in sight of the Mere', stone: 'Read the song stone on the shore', report: 'Report to Leofa at the Mere',
    },
  },
  m24: {
    title: "The Ferryman's Fee",
    summary: 'Dudda Reedly\'s ferry has stood idle since his horn went into the pool. Find it, blow it at the landing and make the first run.',
    o: {
      brief: 'Hear Dudda Reedly out', hild: 'Speak to Dudda\'s wife Hild', hand1: 'Talk to the first ferry-hand', hand2: 'Talk to the second ferry-hand',
      widow: 'Speak to the ferryman\'s widow', soundings: 'Take five soundings in the mud', leeches: 'Clear the leeches round the wreck',
      dive: 'Dive the fenced pool', horn: 'Raise the horn from the pool floor', surface: 'Surface with the horn', blow: 'Blow the horn at the landing',
      ferry: 'Make the first ferry run', report: 'Report to Dudda',
    },
  },
  r12: {
    title: "Reed-Cutters' Dues",
    summary: 'The reed-cutters cannot pay Dudda what they owe: leeches have fouled their five beds. Choose the torch or the sickle, and treat every bed.',
    o: {
      brief: 'Hear Dudda out and choose the torch or the sickle', cutter1: 'Talk to the first reed-cutter', cutter2: 'Talk to the second reed-cutter',
      search: 'Read what the cutters left behind', choice: 'Settle torch or sickle with Dudda', beds: 'Treat the five reed beds, by torch or by sickle',
      leeches: 'Beat the leeches the work drives out', report: 'Report to Dudda',
    },
  },
  m25: {
    title: "The Peat-Witch's Bargain",
    summary: 'Gytha Mireweather will brew a salve against the Burn if she is brought three herbs from her beds. The beds are not empty.',
    o: {
      brief: 'Hear Gytha Mireweather out', cutter: 'Speak to the herb-cutter', shelf: 'Read Gytha\'s shelf of old salves', lore: 'Hear Gytha\'s herb lore',
      find1: 'Find the bog myrtle', pick1: 'Pick the bog myrtle', find2: 'Find the sundew', pick2: 'Pick the sundew', find3: 'Find the mire lily', pick3: 'Pick the mire lily',
      beds: 'Clear the herb beds of the shambler and the leeches', brew: 'Brew the salve at Gytha\'s cauldron',
      drink: 'Drink the salve', warning: 'Hear Gytha\'s warning', report: 'Report to Gytha',
    },
  },
  r14: {
    title: "Leofa's Lost Patrol",
    summary: 'A Greywatch patrol has not come back. Read the signs at the four posts, find the rangers and the deserter, and decide what becomes of Wybert Fenn.',
    o: {
      brief: 'Hear Leofa out at Greywatch', signs1: 'Read the signs at post 1', ranger1: 'Find the ranger at post 1', signs2: 'Read the signs at post 2',
      ranger2: 'Find the ranger at post 2', signs3: 'Read the signs at post 3', free: 'Free the tied ranger', ranger3: 'Speak to the freed ranger',
      leeches: 'Clear the leeches on the way to post 4', signs4: 'Read the signs at post 4', pack: 'Beat the hunters at post 4',
      deserter: 'Talk to the deserter', choice: 'Decide the deserter\'s fate', report: 'Report to Leofa',
    },
  },
  r13: {
    title: "Hathren's Lullaby",
    summary: 'The monks of the Sunken Chapel sang a water-song to Hathren. Gytha wants it relearned: search the chapel, dive its pockets, clear the nave and sing at the altar.',
    o: {
      brief: 'Hear Gytha out', keeper: 'Speak to the bell keeper', hymns: 'Read the hymn board', font: 'Read the drowned font',
      dive1: 'Dive to the first air pocket', dive2: 'Dive to the second air pocket', dive3: 'Dive to the third air pocket', rope: 'Read the bell rope',
      leeches: 'Clear the leeches from the nave', dive4: 'Dive to the altar pocket', carving: 'Read the altar carving', ledger: 'Read the flood ledger',
      song: 'Sing the water-song at the altar', calm: 'Watch the fen calm', farewell: 'Say goodbye to the bell keeper', report: 'Report to Gytha',
    },
  },
  m26: {
    title: 'Quench-Tongue Wakes',
    summary: 'Hunters have netted Hathren in her own Mere. Cut the nets, pay the rite at her stone and let her go.',
    o: {
      brief: 'Hear Gytha out', mere: 'Speak to Gytha at the Mere', shore: 'Speak to Leofa on the shore', wake: 'Watch Hathren wake',
      guards: 'Clear the hunters and the leeches from the nets',
      search: 'Read what the net-cutters left', nets: 'Cut the four nets', rite: 'Pay the rite at Hathren\'s stone', voice: 'Hear Hathren speak',
      scale: 'Take the scale she leaves', report: 'Report to Gytha',
    },
  },
  m27: {
    title: 'Hunters in the Reeds',
    summary: 'The buyers\' hunters are netting wyrmling broods in the reeds. Creep through the blinds, break the cages and send the young home.',
    o: {
      brief: 'Hear Leofa out', ally: 'Hear who stands with you', keeper: 'Question the brood keeper', nets: 'Read the brood nets',
      blinds: 'Get through the reed blinds', seal: 'Read the buyer\'s seal', map: 'Read the hunters\' map', pack2: 'Clear the hunters at the cages',
      tally: 'Read the cage tally', free: 'Free the three wyrmlings', brood: 'Watch the brood return',
      aftermath: 'Hear the aftermath', report: 'Report to Leofa',
    },
  },
  d05: {
    title: 'Into the Mirewater',
    summary: 'The Mirewater Deeps drowned the monastery that built them, and something there still keeps the dead. Dive the Deeps, turn the sluices and face Murkjaw.',
    o: {
      brief: 'Hear Gytha out at the Deeps door', undercroft: 'Enter the undercroft', dive1: 'Dive to the first air pocket', log: 'Read the monk\'s log',
      cell1: 'Clear the leeches from the first cell', dive2: 'Dive to the second air pocket', echo: 'Speak to the drowned monk\'s echo',
      sluice1: 'Turn the first sluice wheel', room1: 'Clear sluice room 1 of leeches and the shambler',
      reliquary: 'Search the drowned reliquary', dive3: 'Dive to the third air pocket', cell3: 'Clear the leeches from the third cell',
      marks: 'Read the flood marks', dive4: 'Dive to the fourth air pocket', room2: 'Clear sluice room 2 of leeches and the shambler',
      sluice2: 'Turn the second sluice wheel', spoil: 'Read Murkjaw\'s spoil',
      murkjaw: 'Defeat Murkjaw', outcome: 'Hear what the Deeps gives up',
    },
  },
};

const PROMPTS: Record<string, string> = {
  horn: 'Raise the horn', blow: 'Blow the horn', torch: 'Put the torch to the bed', cut: 'Cut the reeds', herb1: 'Pick the bog myrtle', herb2: 'Pick the sundew',
  herb3: 'Pick the mire lily', pot1: 'Add the herbs to the pot', pot2: 'Stir the pot', pot3: 'Draw the brew', free: 'Cut the ranger free', altar: 'Sing at the altar',
  net: 'Cut the net', scale: 'Take the scale', cage: 'Open the cage', sluice: 'Turn the sluice wheel',
};

/** The director's toasts. */
export const DIRECTOR_TEXT: Record<string, string> = {
  'greyfen.q.m25.brewed': 'The third pot goes in. The salve is brewed.',
  'greyfen.q.m25.drunk': 'You drink the salve. The Burn eases by 20.',
  'greyfen.q.r13.lesson': 'Lesson: press at the altar in time with the water.',
  'greyfen.q.r13.real': 'Now sing it for real.',
  'greyfen.q.r13.perfect': 'True.',
  'greyfen.q.r13.good': 'Close.',
  'greyfen.q.r13.miss': 'Missed.',
  'greyfen.q.r13.stray': 'Off the beat.',
  'greyfen.q.r13.falter': 'The song falters. Begin again.',
  'greyfen.q.r13.assist': 'The water takes up the song for you.',
  'greyfen.q.r13.bar.count': 'Listen. The water counts you in.',
  'greyfen.q.r13.bar.lesson': 'Press at the altar when the glow reaches a gold cell.',
  'greyfen.q.r13.bar.real': 'Sing it: press on the gold cells.',
  'greyfen.q.r13.bar.wide': 'The water forgives you now. Press near the gold cells.',
  'greyfen.q.r13.lessonDone': 'You have the tune. Sing it for real.',
  'greyfen.q.r13.calm': 'The fen grows calm. The mist begins to lift.',
  'greyfen.q.m27.home': 'The wyrmlings slip into the reeds and are gone.',
};

export const GREYFEN_QUEST_STRINGS: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const [id, q] of Object.entries(QUEST_TEXT)) {
    out[`quest.${id}.title`] = q.title;
    out[`quest.${id}.summary`] = q.summary;
    for (const [oid, text] of Object.entries(q.o)) out[`quest.${id}.${oid}`] = text;
  }
  for (const [k, v] of Object.entries(PROMPTS)) out[`quest.prompt.${k}`] = `{key} ${v}`;
  Object.assign(out, DIRECTOR_TEXT);
  out['codex.lore.fen-song-stone.name'] = 'The Song Stone';
  out['codex.lore.fen-song-stone.body'] = 'A polished stone on Hathren\'s shore, cut with a wave. The fen folk say a dragon once sang here and the stone remembers the tune.';
  out['codex.lore.hathren-lullaby.name'] = 'The Water-Song';
  out['codex.lore.hathren-lullaby.body'] = 'The drowned monks of the Sunken Chapel cut Hathren\'s lullaby into their altar: four steps up, a pause, two steps down. She sang back.';
  out['codex.lore.buyers-seal.name'] = "The Buyer's Seal";
  out['codex.lore.buyers-seal.body'] = 'A black tower over three wavy lines, struck in wax on a hunters\' letter case. A dealer in wyrmlings, paying on delivery and nothing before.';
  return out;
})();
