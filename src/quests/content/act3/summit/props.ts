import type { QuestPropSpec } from '../../../props';
import { M32_LAID, M32_LAY } from './m32.quest';
import { M33_ANCHOR_ANCHORS, M33_ANCHOR_FLAGS, M33_ANCHOR_PROPS } from './m33.quest';
import { D06_GATE_OPEN, D06_HAWK_FLAG, D06_HAWK_PROP, D06_WINCH_PROP } from './d06.quest';

/** Interactable props of the five summit quests (anchors are K4's); each is live only while its objective is current. */
export const SUMMIT_PROPS: QuestPropSpec[] = [
  // M32: the shard laid on the keeper-stone
  { interactableId: M32_LAY, anchorId: 'dragonspine.hearth.keeper-stone', promptKey: 'quest.prompt.lay', objective: ['m32', 'lay'], usedFlag: M32_LAID, look: 'candle', hideWhenUsed: false, priority: 1 },
  // M33: Skyhold's six net anchors (each used flag is the anchor flag K4's net reads)
  ...M33_ANCHOR_PROPS.map((id, i): QuestPropSpec => ({
    interactableId: id, anchorId: M33_ANCHOR_ANCHORS[i]!, promptKey: 'quest.prompt.netAnchor', objective: ['m33', 'anchors'], usedFlag: M33_ANCHOR_FLAGS[i]!,
    look: 'stake', hideWhenUsed: true, priority: 1,
  })),
  // D06: the caged hawk, then the gate winch (its used flag is K4's gate blocker flag)
  { interactableId: D06_HAWK_PROP, anchorId: 'dragonspine.aerie.hawk-cage', promptKey: 'quest.prompt.hawkCage', objective: ['d06', 'hawk'], usedFlag: D06_HAWK_FLAG, look: 'box', hideWhenUsed: false, priority: 1 },
  { interactableId: D06_WINCH_PROP, anchorId: 'dragonspine.aerie.gate.winch', promptKey: 'quest.prompt.winch', objective: ['d06', 'winch'], usedFlag: D06_GATE_OPEN, look: 'brazier', hideWhenUsed: false, priority: 1 },
];
