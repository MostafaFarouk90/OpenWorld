// Quest text for the Oldsmoke and return quests built so far (A13): M16, R09, R10, M21, M22. The mine quests (M17 to M20, R08, D04) join
// when A4's mines are on main.
interface QuestText { title: string; summary: string; o: Record<string, string> }

const QUEST_TEXT: Record<string, QuestText> = {
  m16: {
    title: "Grisel's Invitation",
    summary: 'Lord Aldous Grisel has sent word from Deepgate: he will ally with Halvard if you can prove the shard is real. Ride the pass, and show his court a dead brazier burning.',
    o: {
      ride: 'Ride the Oldsmoke pass to Deepgate', search: 'Search the pass road', ambush: 'Beat the hounds that hunt the pass',
      gate: "Pass the stewards' gate check", court: "Hear Lord Aldous in the Grisel forecourt", brazier: 'Light the dead brazier before the court',
      silence: 'Speak to Lord Aldous as the court falls silent', wenna: 'Hear Lady Wenna out', report: 'Take the answer to Lord Aldous',
    },
  },
  r09: {
    title: 'Sooty Coin',
    summary: "Slag crawlers have nested in the market cellars and dragged the miners' payroll chests down with them. Recover the chests, then decide who gets the coin.",
    o: {
      brief: 'Hear Foreman Slagg out', nests: 'Clear the three crawler nests', chests: 'Carry the payroll chests to the paymaster',
      office: "Read the paymaster's office", clerk: "Hear the stewards' clerk", miners: "Hear the miners' side",
      choice: 'Decide where the coin goes', report: 'Report to Slagg',
    },
  },
  r10: {
    title: "The Miners' Strike",
    summary: 'The miners have downed tools and the stewards will not budge. Hear both halls, read what each side has hidden, and settle it.',
    o: {
      brief: 'Hear Slagg out', miners: "Hear the miners' delegate", stewards: "Hear the stewards' lead", read: 'Read the evidence both sides have kept',
      choice: 'Decide how the strike ends', ruling: 'Post the ruling', keys: 'Return the keys to the hall', talks: 'Win over all three parties',
      report: 'Report to Slagg',
    },
  },
  m21: {
    title: 'Parley at Deepgate',
    summary: "Aldous Grisel has sold what he should not. Gather proof, face him in Grisel Hall, and decide whether to confront him or read his papers while he talks.",
    o: {
      counsel: "Hear Wenna's counsel", escort: "Follow the steward's escort", evidence: 'Gather the proof of the sale', audience: 'Face Lord Aldous in the hall',
      branched: 'Choose how to meet him', persuade: 'Press your case', loyalists: "Beat the loyalists at the hall door",
      stealth: "Slip past the hall's watch", letters: "Read Aldous's letters in the study", aftermath: 'Hear what Aldous has to say', report: 'Report to Wenna',
    },
  },
  m22: {
    title: 'Return to the Capital',
    summary: 'The dragon-heart is proven, the Houses divided. Take the news to Harrowmark, stand before the Council and see who pledges.',
    o: {
      keep: 'Enter the Keep hall', council: 'Stand before the Council', refusal: "Hear Lord Grisel's steward read his refusal", edric: 'Speak to King Edric',
      fountain: 'Look at the dry Silver Fountain', stalls: 'Look at the shuttered market stalls', banner: 'Raise the House Pledge Banner',
      raised: 'See the banner rise', report: 'Report to Lord Wystan',
    },
  },
};

const PROMPTS: Record<string, string> = {
  brazier: 'Light the brazier (hold)', ruling: 'Post the ruling', keys: 'Return the keys', letter: 'Read the letter', evidence: 'Take the proof', banner: 'Raise the banner',
};

export const OLDSMOKE_QUEST_STRINGS: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const [id, q] of Object.entries(QUEST_TEXT)) {
    out[`quest.${id}.title`] = q.title;
    out[`quest.${id}.summary`] = q.summary;
    for (const [oid, text] of Object.entries(q.o)) out[`quest.${id}.${oid}`] = text;
  }
  for (const [k, v] of Object.entries(PROMPTS)) out[`quest.prompt.${k}`] = `{key} ${v}`;
  out['quest.prompt.carryChest'] = '{key} Carry the chest';
  out['codex.lore.deepgate-toll.name'] = 'The Deepgate Toll Ledger';
  out['codex.lore.deepgate-toll.body'] = 'The pass toll is entered twice: once in the stewards\' ledger, once in a second, smaller hand. The second column adds to far more than the first.';
  out['codex.lore.grisel-sale-orders.name'] = 'The Sale Orders';
  out['codex.lore.grisel-sale-orders.body'] = 'Orders for wyrmlings, countersigned in Aldous Grisel\'s own hand, with delivery dates. The buyer\'s seal is a black anvil.';
  return out;
})();
