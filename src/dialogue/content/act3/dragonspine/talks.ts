import { M28_HUNTER_POSTS } from '../../../../quests/content/act3/dragonspine/m28.quest';
// Which talk each lower Dragonspine talk objective plays: (quest, objective, dialogue tree, segment). The pacing test counts the
// nodes of these segments; the dialogue test checks that the start rules open them in the right state.
export interface TalkRow { quest: string; objective: string; tree: string; seg: string }

const t = (quest: string, objective: string, tree: string, seg: string): TalkRow => ({ quest, objective, tree, seg });

export const DRAGONSPINE_TALKS: readonly TalkRow[] = [
  t('m28', 'brief', 'npc-thorgar', 'm28-brief'),
  ...M28_HUNTER_POSTS.map((post, i) => t('m28', `hunter${i + 1}`, `npc-lodge-hunter-${post}`, 'm28-talk')),
  t('m28', 'climb', 'scene-m28-climb', 'scene'), t('m28', 'view', 'scene-m28-view', 'scene'), t('m28', 'report', 'npc-thorgar', 'm28-report'),
  t('r15', 'brief', 'npc-thorgar', 'r15-brief'), t('r15', 'hand1', 'npc-sled-hand-1', 'r15-talk'), t('r15', 'hand2', 'npc-sled-hand-2', 'r15-talk'),
  t('r15', 'choice', 'scene-r15-cache', 'scene'), t('r15', 'report', 'npc-thorgar', 'r15-report'),
  t('m29', 'greet', 'npc-eadgyth', 'm29-greet'), t('m29', 'firetalk', 'npc-eadgyth', 'm29-firetalk'),
  t('m29', 'confession', 'scene-m29-confession', 'scene'), t('m29', 'report', 'npc-eadgyth', 'm29-report'),
  t('r16', 'brief', 'npc-eadgyth', 'r16-brief'), t('r16', 'hunter', 'npc-lodge-hunter-cave', 'r16-talk'), t('r16', 'lines', 'scene-r16-cave', 'scene'),
  t('r16', 'choice', 'npc-eadgyth', 'r16-choice'), t('r16', 'report', 'npc-eadgyth', 'r16-report'),
  t('m30', 'brief', 'npc-ansgar', 'm30-brief'), t('m30', 'lore', 'npc-ansgar', 'm30-lore'), t('m30', 'pilgrim', 'npc-pilgrim-3', 'talk'),
  t('m30', 'rise', 'npc-ansgar', 'm30-rise'), t('m30', 'carvings', 'npc-ansgar', 'm30-carvings'), t('m30', 'report', 'npc-ansgar', 'm30-report'),
  t('r17', 'brief', 'npc-ansgar', 'r17-brief'), t('r17', 'pilgrim1', 'npc-pilgrim-1', 'talk'), t('r17', 'pilgrim2', 'npc-pilgrim-2', 'talk'),
  t('r17', 'report', 'npc-ansgar', 'r17-report'),
  t('r18', 'brief', 'npc-thorgar', 'r18-brief'), t('r18', 'thief', 'npc-egg-thief', 'r18-thief'), t('r18', 'excuse', 'npc-egg-thief', 'r18-excuse'),
  t('r18', 'report', 'npc-thorgar', 'r18-report'),
];
