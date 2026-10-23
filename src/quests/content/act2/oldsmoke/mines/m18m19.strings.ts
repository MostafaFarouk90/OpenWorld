// Quest text for M18 and M19 (A13), in the shape of ../strings.ts. The guide's wait barks are toasts, keyed `quest.m19.guide.*`.
interface QuestText { title: string; summary: string; o: Record<string, string> }

const QUEST_TEXT: Record<string, QuestText> = {
  m18: {
    title: 'Breath for the Bellows',
    summary: 'Fire-tender Pike has found the Weeping Bellows cold and choked. Read the plaque, clear the crawlers that nested in the cavern, route the six valves true and kindle the shrine.',
    o: {
      brief: 'Hear Fire-tender Pike out', plaque: 'Read the plaque in the cavern', pipes: 'Read the pipe run', apprentice: "Hear Pike's apprentice",
      lore: 'Hear what Pike knows of the valves', crawlers: 'Clear the crawlers from the cavern', solve: 'Route the valves and breathe life into the Bellows',
      rekindle: 'Kindle the Bellows shrine', breathe: 'Hear the Bellows breathe', report: 'Report to Pike',
    },
  },
  m19: {
    title: 'What Grisel Hides',
    summary: 'Lady Wenna will show you what her father keeps in the Lower Galleries. Follow her down, slip past the stewards\' watch, break the sealed door and look at what lies behind it.',
    o: {
      confession: "Hear Lady Wenna's confession", route: 'Follow Lady Wenna into the Lower Galleries', stealth: "Slip past the stewards' watch",
      doors: 'Break the three locks of the sealed door', reveal: 'See what the sealed door hid', nursery: 'Speak to Lady Wenna in the nursery', report: 'Hear Lady Wenna out',
    },
  },
};

const PROMPTS: Record<string, string> = { m19lock: 'Pick the lock', m19seal: 'Break the seal', m19key: "Take the steward's key" };

export const M18M19_QUEST_STRINGS: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const [id, q] of Object.entries(QUEST_TEXT)) {
    out[`quest.${id}.title`] = q.title;
    out[`quest.${id}.summary`] = q.summary;
    for (const [oid, text] of Object.entries(q.o)) out[`quest.${id}.${oid}`] = text;
  }
  for (const [k, v] of Object.entries(PROMPTS)) out[`quest.prompt.${k}`] = `{key} ${v}`;
  // Wenna's wait barks while the player lags behind her, and while she stands before the sealed door
  out['quest.m19.guide.wait.1'] = 'Wenna: Keep close. The galleries are no place to wander.';
  out['quest.m19.guide.wait.2'] = 'Wenna: I will wait. Not for long.';
  out['quest.m19.guide.wait.3'] = 'Wenna: Knight, this way.';
  out['quest.m19.guide.limit.1'] = 'Wenna: The door is sealed. There are three locks, and the stewards left them where they could see them.';
  out['quest.m19.guide.limit.2'] = 'Wenna: Look along the wall. Lock, seal and key, each in its own place.';
  return out;
})();
