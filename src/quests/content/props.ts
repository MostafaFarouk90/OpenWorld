import type { QuestPropSpec } from '../props';
import type { InteractFlagBridge } from '../bridges';

/**
 * Harrowmark quest props. Anchor ids are thread 17's (harrowmark city ANCHORS.md). A prop whose anchor is missing stays unregistered and its quest cannot progress, so the content test
 * lists these as external ids to confirm before the PR is marked ready.
 */
export const QUEST_PROPS: QuestPropSpec[] = [
  { interactableId: 'pickup:satchel', anchorId: 'm07.satchel', promptKey: 'quest.prompt.satchel', objective: ['m07', 'o3'], give: { itemId: 'stolen-satchel', count: 1 } },
  { interactableId: 'pickup:brewing-copper', anchorId: 'r03.brewing-copper', promptKey: 'quest.prompt.brewingCopper', objective: ['r03', 'o3'], give: { itemId: 'brewing-copper', count: 1 } },
  // R04's first page waits in the Archive stacks (density pass; the second and third come from the sexton and the fence)
  {
    interactableId: 'use:r04-page-1', anchorId: 'r04.stacks-page', promptKey: 'quest.prompt.page', objective: ['r04', 'page1'],
    usedFlag: 'story.r04.page.1', look: 'page', hideWhenUsed: true,
  },

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

  // ---- batch 2: D01's prayer braziers in the vault antechamber (anchors in the vault def) ----
  ...[1, 2, 3].map((n): QuestPropSpec => ({
    interactableId: `use:d01-brazier-${n}`, anchorId: `d01.brazier-${n}`, promptKey: 'quest.prompt.brazier', objective: ['d01', 'braziers'],
    usedFlag: `story.d01.brazier.${n}`, look: 'brazier',
  })),
  // the Prior's censer set on the chapel altar after the vault
  {
    interactableId: 'use:d01-altar', anchorId: 'd01.altar', promptKey: 'quest.prompt.altar', objective: ['d01', 'altar'],
    usedFlag: 'story.d01.censerSet', look: 'candle', lookOnlyUsed: true,
  },

  // ---- batch 3: Harrowmark part 1 (anchors in src/harrowmark/density.layout.ts and the Archive def) ----
  // M06: the Heartshard held to the gate brazier inside the South Gate (thread 17's m06.gate-brazier anchor)
  {
    interactableId: 'use:m06-gate-brazier', anchorId: 'm06.gate-brazier', promptKey: 'quest.prompt.shardBrazier',
    objective: ['m06', 'brazier'], usedFlag: 'story.m06.shardShown', look: 'brazier',
  },
  // M07: the coins the thieves dropped on the way to their alley
  ...[1, 2, 3].map((n): QuestPropSpec => ({
    interactableId: `use:m07-coin-${n}`, anchorId: `m07.coin-${n}`, promptKey: 'quest.prompt.coin', objective: ['m07', 'coins'],
    usedFlag: `story.m07.coin.${n}`, look: 'coin', hideWhenUsed: true,
  })),
  // R04: Whitlock's key in the stacks lock (the lock opens the stacks' gate, src/interiors/harrowmark/locks.ts)
  {
    interactableId: 'use:r04-stacks-lock', anchorId: 'r04.stacks-lock', promptKey: 'quest.prompt.stacksLock',
    objective: ['r04', 'stacks'], usedFlag: 'story.r04.stacksUnlocked',
  },
];

/** Thread 3a places the M09 invoices and disables each once its flag is set; this writes the flag. */
export const INTERACT_FLAGS: InteractFlagBridge[] = [1, 2, 3].map((n) => ({
  interactableId: `use:m09-invoice-${n}`, quest: 'm09', objective: 'o3', flag: `story.m09.invoice.${n}`,
}));
