import type { QuestPropSpec } from '../props';
import type { InteractFlagBridge } from '../bridges';

/**
 * Harrowmark quest props. Anchor ids are thread 17's (harrowmark city ANCHORS.md). A prop whose anchor is missing stays unregistered and its quest cannot progress, so the content test
 * lists these as external ids to confirm before the PR is marked ready.
 */
export const QUEST_PROPS: QuestPropSpec[] = [
  { interactableId: 'pickup:satchel', anchorId: 'm07.satchel', promptKey: 'quest.prompt.satchel', objective: ['m07', 'o3'], give: { itemId: 'stolen-satchel', count: 1 } },
  { interactableId: 'pickup:brewing-copper', anchorId: 'r03.brewing-copper', promptKey: 'quest.prompt.brewingCopper', objective: ['r03', 'o3'], give: { itemId: 'brewing-copper', count: 1 } },
  ...[1, 2, 3].map((n): QuestPropSpec => ({
    interactableId: `use:r04-page-${n}`, anchorId: `r04.page-${n}`, promptKey: 'quest.prompt.page', objective: ['r04', 'o2'], usedFlag: `story.r04.page.${n}`,
  })),

  // ---- Act 1 density pass, batch 1 (anchors in src/region/density.layout.ts) ----
  ...[1, 2].map((n): QuestPropSpec => ({
    interactableId: `use:m02-rubble-${n}`, anchorId: `m02.rubble-${n}`, promptKey: 'quest.prompt.rubble', objective: ['m02', 'rubble'],
    usedFlag: `story.m02.rubble.${n}`, look: 'rubble', hideWhenUsed: true,
  })),
  {
    interactableId: 'use:m02-common-hearth', anchorId: 'm02.common-hearth', promptKey: 'quest.prompt.commonHearth', objective: ['m02', 'hearth'],
    usedFlag: 'story.m02.stoneSet', look: 'hearth',
  },
  {
    interactableId: 'pickup:m03-candle', anchorId: 'm03.candle', promptKey: 'quest.prompt.candle', objective: ['m03', 'candle'],
    usedFlag: 'story.m03.candleTaken', give: { itemId: 'warding-candle', count: 1 }, look: 'candle', hideWhenUsed: true,
  },
  ...[1, 2, 3].map((n): QuestPropSpec => ({
    interactableId: `use:m04-wagon-${n}`, anchorId: `m04.wagon-${n}`, promptKey: 'quest.prompt.wagon', objective: ['m04', 'wagons'],
    usedFlag: `story.m04.wagon.${n}`, look: 'chain', hideWhenUsed: true,
  })),
  // R01's saved field: re-stake three clean scarecrows (the scorched field takes the buckets instead)
  ...[1, 2, 3].map((n): QuestPropSpec => ({
    interactableId: `use:r01-stake-${n}`, anchorId: `r01.stake-${n}`, promptKey: 'quest.prompt.stake', objective: ['r01', 'aftermath'],
    usedFlag: `story.r01.stake.${n}`, look: 'stake', lookOnlyUsed: true, when: { not: { flag: 'story.r01.scorched', equals: true } },
  })),
];

/** Thread 3a places the M09 invoices and disables each once its flag is set; this writes the flag. */
export const INTERACT_FLAGS: InteractFlagBridge[] = [1, 2, 3].map((n) => ({
  interactableId: `use:m09-invoice-${n}`, quest: 'm09', objective: 'o3', flag: `story.m09.invoice.${n}`,
}));
