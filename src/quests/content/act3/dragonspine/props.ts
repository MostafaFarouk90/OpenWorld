import type { QuestPropSpec } from '../../../props';
import { R15_UNLOAD, R15_UNLOADED } from './r15.quest';
import { M29_FIRE, M29_FIRE_FLAG, M29_WOOD, M29_WOOD_FLAG } from './m29.quest';
import { R16_AXE, R16_AXE_FLAG, R16_AXE_ITEM, R16_ROCKFALL, R16_ROCKFALL_CLEARED_FLAG } from './r16.quest';
import { R17_BUNDLE, R17_BUNDLE_ITEM, R17_TAKEN } from './r17.quest';
import { R18_EGG_ANCHORS, R18_EGG_ITEM, R18_EGG_PROPS, R18_EGG_TAKEN, R18_HOLDING, R18_NEST_ANCHORS, R18_NEST_FLAGS, R18_NEST_PROPS } from './r18.quest';

/** Interactable props of the seven quests (anchors are K4's); each is live only while its objective is current. */
export const DRAGONSPINE_PROPS: QuestPropSpec[] = [
  // R15: the surplus unloaded at the cache
  { interactableId: R15_UNLOAD, anchorId: 'dragonspine.r15.cache', promptKey: 'quest.prompt.unload', objective: ['r15', 'unload'], usedFlag: R15_UNLOADED, look: 'box', hideWhenUsed: false, priority: 1 },
  // M29: the woodpile, then the fire at the shelter
  { interactableId: M29_WOOD, anchorId: 'dragonspine.shelter.woodpile', promptKey: 'quest.prompt.wood', objective: ['m29', 'wood'], usedFlag: M29_WOOD_FLAG, look: 'bucket', priority: 1 },
  { interactableId: M29_FIRE, anchorId: 'dragonspine.shelter.fire', promptKey: 'quest.prompt.fire', objective: ['m29', 'fire'], usedFlag: M29_FIRE_FLAG, look: 'brazier', priority: 1 },
  // R16: the rockfall (its used flag is K4's blocker flag), then the axe
  { interactableId: R16_ROCKFALL, anchorId: 'dragonspine.cave.rockfall', promptKey: 'quest.prompt.rockfall', objective: ['r16', 'rockfall'], usedFlag: R16_ROCKFALL_CLEARED_FLAG, look: 'rubble', hideWhenUsed: true, priority: 1 },
  { interactableId: R16_AXE, anchorId: 'dragonspine.cave.axe', promptKey: 'quest.prompt.axe', objective: ['r16', 'axe'], give: { itemId: R16_AXE_ITEM, count: 1 }, usedFlag: R16_AXE_FLAG, look: 'box', hideWhenUsed: true, priority: 1 },
  // R17: the forge-candle bundle at the Anvil (the first pick-up; a bundle a carry reset left lying is picked up by the director's own interactable)
  { interactableId: R17_BUNDLE, anchorId: 'dragonspine.anvil.shrine', promptKey: 'quest.prompt.bundle', objective: ['r17', 'take'], give: { itemId: R17_BUNDLE_ITEM, count: 1 }, usedFlag: R17_TAKEN, look: 'candle', hideWhenUsed: true, priority: 1 },
  // R18: three eggs in the thief's camp (back in the camp again when a carry reset or a failure returns them), three places in the nest
  ...R18_EGG_PROPS.map((id, i): QuestPropSpec => ({
    interactableId: id, anchorId: R18_EGG_ANCHORS[i], promptKey: 'quest.prompt.egg', objective: ['r18', 'nested'], give: { itemId: R18_EGG_ITEM, count: 1 },
    usedFlag: R18_EGG_TAKEN[i], when: { not: { flag: R18_HOLDING, equals: true } }, look: 'box', hideWhenUsed: true, priority: 1,
  })),
  ...R18_NEST_PROPS.map((id, i): QuestPropSpec => ({
    interactableId: id, anchorId: R18_NEST_ANCHORS[i], promptKey: 'quest.prompt.nest', objective: ['r18', 'nested'],
    when: { all: [{ flag: R18_HOLDING, equals: true }, { not: { flag: R18_NEST_FLAGS[i], equals: true } }] }, look: 'stake', priority: 1,
  })),
];
