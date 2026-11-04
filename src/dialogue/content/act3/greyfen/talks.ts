// Which talk each Greyfen talk objective plays: (quest, objective, dialogue tree, segment). The pacing test counts the nodes of
// these segments; the dialogue test checks that the start rules open them in the right state.
export interface TalkRow { quest: string; objective: string; tree: string; seg: string }

const t = (quest: string, objective: string, tree: string, seg: string): TalkRow => ({ quest, objective, tree, seg });

export const GREYFEN_TALKS: readonly TalkRow[] = [
  t('m23', 'brief', 'npc-leofa', 'm23-brief'), t('m23', 'folk1', 'npc-reedgate-folk-1', 'm23-folk'), t('m23', 'folk2', 'npc-reedgate-folk-2', 'm23-folk'),
  t('m23', 'folk3', 'npc-reedgate-folk-3', 'm23-folk'), t('m23', 'ranger', 'npc-causeway-ranger', 'm23-ranger'), t('m23', 'sight', 'scene-m23-sight', 'scene'),
  t('m23', 'report', 'npc-leofa', 'm23-report'),
  t('m24', 'brief', 'npc-dudda', 'm24-brief'), t('m24', 'hild', 'npc-hild', 'm24-hild'), t('m24', 'hand1', 'npc-ferry-hand-1', 'm24-hand'),
  t('m24', 'hand2', 'npc-ferry-hand-2', 'm24-hand'), t('m24', 'widow', 'npc-widow', 'm24-widow'), t('m24', 'report', 'npc-dudda', 'm24-report'),
  t('r12', 'brief', 'npc-dudda', 'r12-brief'), t('r12', 'cutter1', 'npc-reed-cutter-1', 'r12-cutter'), t('r12', 'cutter2', 'npc-reed-cutter-2', 'r12-cutter'),
  t('r12', 'choice', 'npc-dudda', 'r12-choice'), t('r12', 'report', 'npc-dudda', 'r12-report'),
  t('m25', 'brief', 'npc-gytha', 'm25-brief'), t('m25', 'herb-cutter', 'npc-herb-cutter', 'm25-cutter'), t('m25', 'lore', 'npc-gytha', 'm25-lore'),
  t('m25', 'warning', 'npc-gytha', 'm25-warning'), t('m25', 'report', 'npc-gytha', 'm25-report'),
  t('r14', 'brief', 'npc-leofa', 'r14-brief'), t('r14', 'ranger1', 'npc-greywatch-ranger-1', 'r14-ranger'), t('r14', 'ranger2', 'npc-greywatch-ranger-2', 'r14-ranger'),
  t('r14', 'ranger3', 'npc-greywatch-ranger-3', 'r14-ranger'), t('r14', 'deserter', 'npc-deserter', 'r14-deserter'), t('r14', 'choice', 'npc-deserter', 'r14-choice'),
  t('r14', 'report', 'npc-leofa', 'r14-report'),
  t('r13', 'brief', 'npc-gytha', 'r13-brief'), t('r13', 'keeper', 'npc-bell-keeper', 'r13-keeper'), t('r13', 'song', 'scene-r13-song', 'scene'),
  t('r13', 'farewell', 'npc-bell-keeper', 'r13-farewell'), t('r13', 'report', 'npc-gytha', 'r13-report'),
  t('m26', 'brief', 'npc-gytha', 'm26-brief'), t('m26', 'mere', 'npc-gytha', 'm26-mere'), t('m26', 'shore', 'npc-leofa', 'm26-shore'),
  t('m26', 'voice', 'scene-m26-voice', 'scene'), t('m26', 'report', 'npc-gytha', 'm26-report'),
  t('m27', 'brief', 'npc-leofa', 'm27-brief'), t('m27', 'ally', 'scene-m27-leofa', 'scene'), t('m27', 'keeper', 'npc-brood-keeper', 'm27-keeper'),
  t('m27', 'aftermath', 'scene-m27-aftermath', 'scene'), t('m27', 'report', 'npc-leofa', 'm27-report'),
  t('d05', 'brief', 'npc-gytha', 'd05-brief'), t('d05', 'undercroft', 'scene-d05-undercroft', 'scene'), t('d05', 'echo', 'npc-monk-echo', 'd05-echo'),
  t('d05', 'outcome', 'scene-d05-outcome', 'scene'),
];
