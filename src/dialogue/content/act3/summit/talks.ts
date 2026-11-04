// Which talk each summit talk objective plays: (quest, objective, dialogue tree, segment). The pacing test counts the nodes of these segments; the
// dialogue test checks that the start rules open them in the right state. M31 is counted on its Yield branch (the pacing row's branch).
export interface TalkRow { quest: string; objective: string; tree: string; seg: string }

const t = (quest: string, objective: string, tree: string, seg: string): TalkRow => ({ quest, objective, tree, seg });

export const SUMMIT_TALKS: readonly TalkRow[] = [
  t('m31', 'brief', 'npc-eadgyth', 's31-offer'), t('m31', 'gatetalk', 'npc-eadgyth', 's31-gate'), t('m31', 'climb', 'scene-m31-climb', 'scene'),
  t('m31', 'before', 'scene-m31-before', 'scene'), t('m31', 'after', 'scene-m31-after', 'yielded'), t('m31', 'report', 'npc-eadgyth', 's31-report'),
  t('m32', 'speak', 'npc-ysmeryth', 'm32-account'), t('m32', 'vision', 'scene-m32-vision', 'scene'), t('m32', 'rubbing', 'scene-m32-rubbing', 'scene'),
  t('m32', 'eadgyth', 'npc-eadgyth', 's32-talk'), t('m32', 'companions', 'scene-m32-companions', 'scene'), t('m32', 'axe', 'scene-m32-axe', 'give'),
  t('m33', 'brief', 'npc-thorgar', 's33-brief'), t('m33', 'rigger', 'npc-skyhold-rigger', 'm33-talk'), t('m33', 'handler', 'npc-skyhold-handler', 'm33-talk'),
  t('m33', 'aftermath', 'scene-m33-aftermath', 'scene'), t('m33', 'report', 'npc-thorgar', 's33-report-0'),
  t('m34', 'oath', 'npc-ysmeryth', 'm34-oath'), t('m34', 'swear', 'scene-m34-swear', 'scene'), t('m34', 'companions', 'scene-m34-companions', 'scene'),
  t('m34', 'thorgar', 'npc-thorgar', 's34-talk'), t('m34', 'report', 'npc-ysmeryth', 'm34-report'),
  t('d06', 'brief', 'npc-thorgar', 'd06-brief'), t('d06', 'lip', 'scene-d06-lip', 'scene'), t('d06', 'captive', 'npc-captive-hunter', 'd06-talk'),
  t('d06', 'lines', 'scene-d06-aerie', 'scene'), t('d06', 'outcome', 'scene-d06-outcome', 'spared'), t('d06', 'report', 'npc-thorgar', 'd06-report-spared'),
];
