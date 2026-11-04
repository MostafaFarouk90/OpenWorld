import type { QuestDef } from '../../../types';
import { reads } from '../../act2/helpers';

/** Written once, after the scene (K5's reveal bark, K9's rubbing lock, K10's vendor, K15's tab and K4's axe on the hoard read it). */
export const M32_COMPLETE = 'story.m32.complete';
/** The shard laid on the keeper-stone (the prop's used flag). */
export const M32_LAID = 'story.m32.laid';
export const M32_LAY = 'use:keeper-stone-lay';
/** The deferred R16 give: dragons +6, paid once here, and the axe taken. */
export const M32_AXE_GIVEN = 'story.m32.axeGiven';
export const M32_AXE_FAVOUR = 6;
export const M32_HOARD = ['note-m32-hammer', 'note-m32-chain', 'note-m32-gold'];
export const M32_TALK_NPC = 'ysmeryth';
export const M32_TALK = 'use:ysmeryth-talk';
export const M32_VISION_SCENE = 'scene-m32-vision';
export const M32_VISION_NPC = 'scene.m32.vision';
export const M32_RUBBING_SCENE = 'scene-m32-rubbing';
export const M32_RUBBING_NPC = 'scene.m32.rubbing';
export const M32_COMPANIONS_SCENE = 'scene-m32-companions';
export const M32_COMPANIONS_NPC = 'scene.m32.companions';
export const M32_AXE_SCENE = 'scene-m32-axe';
export const M32_AXE_NPC = 'scene.m32.axe';

/**
 * M32 Ysmeryth Speaks. She lands at the Hearth and tells the Keepers' account; at the keeper-stone she shows the vision and Cael lays
 * the shard on it; three hoard searches; she reads a rubbing aloud (K9's lock opens with the quest); Eadgyth; the companions; and the axe
 * scene, which reads R16's choice (`give` pays the deferred +6 and takes the axe, `keep` is her cold line with no favour). The quest's
 * flag is written by the director after the last scene has ended. Cael walks away with Keeper's Understanding.
 */
export const m32: QuestDef = {
  id: 'm32',
  titleKey: 'quest.m32.title',
  summaryKey: 'quest.m32.summary',
  sequential: true,
  startWhen: { quest: 'm31', state: 'completed' },
  objectives: [
    { id: 'speak', type: 'talk', target: M32_TALK_NPC, textKey: 'quest.m32.speak' },
    { id: 'vision', type: 'talk', target: M32_VISION_NPC, textKey: 'quest.m32.vision' },
    { id: 'lay', type: 'event', target: 'interact', match: { interactableId: M32_LAY }, textKey: 'quest.m32.lay', doneWhen: { flag: M32_LAID, equals: true } },
    reads('hoard', 'quest.m32.hoard', M32_HOARD),
    { id: 'rubbing', type: 'talk', target: M32_RUBBING_NPC, textKey: 'quest.m32.rubbing' },
    { id: 'eadgyth', type: 'talk', target: 'eadgyth', textKey: 'quest.m32.eadgyth' },
    { id: 'companions', type: 'talk', target: M32_COMPANIONS_NPC, textKey: 'quest.m32.companions' },
    { id: 'axe', type: 'talk', target: M32_AXE_NPC, textKey: 'quest.m32.axe' },
  ],
  rewards: [{ xp: 700 }],
};

