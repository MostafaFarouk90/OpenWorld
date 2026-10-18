import type { QuestPropSpec } from '../props';
import type { InteractFlagBridge } from '../bridges';

/**
 * Harrowmark quest props. Anchor ids are requests to the layout threads (17: the alley and the guild hall; 3a: the Archive
 * reading room). A prop whose anchor is missing stays unregistered and its quest cannot progress, so the content test
 * lists these as external ids to confirm before the PR is marked ready.
 */
export const QUEST_PROPS: QuestPropSpec[] = [
  { interactableId: 'pickup:satchel', anchorId: 'harrowmark.quest.satchel', promptKey: 'quest.prompt.satchel', objective: ['m07', 'o3'], give: { itemId: 'stolen-satchel', count: 1 } },
  { interactableId: 'pickup:brewing-copper', anchorId: 'harrowmark.quest.brewing-copper', promptKey: 'quest.prompt.brewingCopper', objective: ['r03', 'o3'], give: { itemId: 'brewing-copper', count: 1 } },
  ...[1, 2, 3].map((n): QuestPropSpec => ({
    interactableId: `use:r04-page-${n}`, anchorId: `archive.page-${n}`, promptKey: 'quest.prompt.page', objective: ['r04', 'o2'], usedFlag: `story.r04.page.${n}`,
  })),
];

/** Thread 3a places the M09 invoices and disables each once its flag is set; this writes the flag. */
export const INTERACT_FLAGS: InteractFlagBridge[] = [1, 2, 3].map((n) => ({
  interactableId: `use:m09-invoice-${n}`, quest: 'm09', flag: `story.m09.invoice.${n}`,
}));
