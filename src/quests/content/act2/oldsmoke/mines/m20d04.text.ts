// Items and quest text of M20 and D04 (A13).
import type { ItemDef } from '../../../../../hud/ports';
import { registerItems } from '../../../../../inventory/items';

const def = (id: string, kind: ItemDef['kind']): ItemDef => ({ id, nameKey: `item.${id}.name`, descKey: `item.${id}.desc`, kind, stackMax: 1 });

export const M20D04_ITEMS: readonly ItemDef[] = [def('orsks-cinder', 'quest'), def('slag-core', 'quest')];

export const M20D04_ITEM_STRINGS: Record<string, string> = {
  'item.orsks-cinder.name': "Orsk's Cinder",
  'item.orsks-cinder.desc': 'A coal the size of a fist, still faintly warm, found in the glassed floor where the chained elder lay. It does not go out.',
  'item.slag-core.name': 'Slag Core',
  'item.slag-core.desc': 'The cooled heart of the Slagmaw: a lump of black glass with an ember at its centre. Slagg says it will heat a forge for a hundred years.',
};

registerItems(M20D04_ITEMS);

interface QuestText { title: string; summary: string; o: Record<string, string> }

const QUEST_TEXT: Record<string, QuestText> = {
  m20: {
    title: 'Chain and Ember',
    summary: 'Under the Lower Galleries the Grisel stewards keep chained wyrmlings, and behind them an elder wyrm. Beat the stewards, break the chains, and see what is let go.',
    o: {
      brief: 'Hear Lady Wenna out', stewards: 'Beat the stewards who guard the gallery', captain: 'Hear the steward-captain',
      chains: 'Break the five chains', search: 'Search the gallery for what the stewards kept', keeper: 'Speak to the wyrmling-keeper',
      chainsBroken: 'See the last chain give way', gone: 'Watch what rises through the roof', aftermath: 'Talk with Lady Wenna',
    },
  },
  d04: {
    title: 'The Deepdelve Descent',
    summary: "The Deepdelve has run hot since the lift stopped. Go down in two stages, clear the crawlers and the cinder golem, cool the two pools, and face what lives at the bottom.",
    o: {
      brief: 'Hear Foreman Slagg out', stage1: 'Ride the lift to the first stage', stage2: 'Ride on to the second stage',
      crawlersA: 'Clear the slag crawlers', golem: 'Bring down the cinder golem', crawlersB: 'Clear the crawlers from the valve rooms',
      survey: "Read Slagg's map and the survey marks", pool1: 'Cool the first pool', pool2: 'Cool the second pool',
      slagmaw: 'Defeat the Slagmaw', report: 'Report to Slagg',
    },
  },
};

const PROMPTS: Record<string, string> = { chain: 'Break the chain' };

export const M20D04_QUEST_STRINGS: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const [id, q] of Object.entries(QUEST_TEXT)) {
    out[`quest.${id}.title`] = q.title;
    out[`quest.${id}.summary`] = q.summary;
    for (const [oid, text] of Object.entries(q.o)) out[`quest.${id}.${oid}`] = text;
  }
  for (const [k, v] of Object.entries(PROMPTS)) out[`quest.prompt.${k}`] = `{key} ${v}`;
  // the pool puzzles' toasts (the valve prompt itself is A9's `puzzle.valve.turn`)
  out['d04.pool.pressure'] = 'The pool is boiling. Set the valves before the pressure peaks.';
  out['d04.pool.routed'] = 'The valves hold. The vents open.';
  out['d04.pool.failed'] = 'The pressure breaks and the valves spring back.';
  out['d04.pool.solved'] = 'The pool settles and goes dark.';
  return out;
})();
