// Quest text for M17 and R08 (A13), in the shape of ../strings.ts.
interface QuestText { title: string; summary: string; o: Record<string, string> }

const QUEST_TEXT: Record<string, QuestText> = {
  m17: {
    title: 'Down the Oldsmoke Shaft',
    summary: 'The Deepgate lift has hung dead since the strike, and two miners are trapped below. Mend the winch, ride down, clear the vents and bring them up.',
    o: {
      brief: 'Hear Foreman Slagg out', wright: 'Speak to the winch-wright', parts: 'Find the three winch parts', search: 'Read what the shaft head kept',
      winch: 'Mend the winch', ride: 'Ride the lift to the shaft floor', vent1: 'Clear the first choked vent', swarm: 'Beat the crawlers that drop from the roof',
      vents: 'Clear the other three vents', miners: 'Carry the trapped miners to the lift', up: 'Ride the lift to the surface',
      thanks: 'Hear the miners out', report: 'Report to Slagg',
    },
  },
  r08: {
    title: "Pickett's Last Shift",
    summary: 'The ghost of Burel Pickett walks the Old Galleries, still waiting to finish his last shift. Read what he left, finish his four tasks, and lay him to rest.',
    o: {
      brief: "Hear the shift boss's ghost", relics: "Read the relics of Pickett's shift", tasks: 'Finish the four shift tasks, the bell last',
      wraiths: 'Beat the wraith shift the bell raises', crew: 'Speak to the shift crew', letter: "Read the widow's letter", report: 'Lay Pickett to rest',
    },
  },
};

const PROMPTS: Record<string, string> = {
  part: 'Take the winch part', winch: 'Mend the winch', vent: 'Clear the vent', carryMiner: 'Carry the miner',
  r08pump: 'Work the pump', r08cart: 'Set the cart on its rails', r08prop: 'Set the prop', r08bell: 'Toll the bell',
};

export const M17R08_QUEST_STRINGS: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const [id, q] of Object.entries(QUEST_TEXT)) {
    out[`quest.${id}.title`] = q.title;
    out[`quest.${id}.summary`] = q.summary;
    for (const [oid, text] of Object.entries(q.o)) out[`quest.${id}.${oid}`] = text;
  }
  for (const [k, v] of Object.entries(PROMPTS)) out[`quest.prompt.${k}`] = `{key} ${v}`;
  out['codex.lore.pickett-chit.name'] = "Pickett's Unclaimed Chit";
  out['codex.lore.pickett-chit.body'] = 'A month of shift boss wages, withheld by the stewards "pending inquiry". The inquiry is eleven years old and has never reported.';
  return out;
})();
