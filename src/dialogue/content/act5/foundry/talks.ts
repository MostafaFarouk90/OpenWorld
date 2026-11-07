// Which talks each Foundry quest plays on its shorter branch: (quest, tree, segment, the world it is read in). The pacing test
// walks each one on the real tree (skipping a node whose `when` fails, taking the first offered choice) and checks the sum
// against the pacing rows' node counts. Readable notes are never here (one search beat each).
export interface TalkRow { quest: string; tree: string; seg: string; flags?: Record<string, boolean | number | string>; favour?: 'cold' | 'banked' }
const t = (quest: string, tree: string, seg: string, flags: TalkRow['flags'] = {}, favour: TalkRow['favour'] = 'cold'): TalkRow => ({ quest, tree, seg, flags, favour });

/** The shorter branch's world: F1 Spy, F5 compromise, F6 All, F8 Half, no pyre lit, Vey spared, Eormen destroyed, light Scars. */
const SHORT = { 'story.m21.choice': 'spy', 'story.r10.choice': 'compromise', 'story.r21.choice': 'all', 'story.r24.choice': 'half', 'story.m53.scarBand': 'light', 'boss.vey.outcome': 'spared', 'story.d09.turned': 2 };

export const FOUNDRY_A5_TALKS: readonly TalkRow[] = [
  t('r27', 'npc-wenna', 'a5f-r27-brief', SHORT),
  t('r27', 'npc-tunnel-captain', 'r27-captain', SHORT),
  t('r27', 'npc-tunnel-captain', 'r27-ready', SHORT),
  t('r27', 'npc-tunnel-captain', 'r27-choose', SHORT),
  t('r27', 'npc-wenna', 'a5f-r27-report', { ...SHORT, 'story.r27.choice': 'keep' }),
  t('r28', 'npc-wulfhild', 'a5f-r28-brief', SHORT),
  ...[1, 2, 3, 4].map((n) => t('r28', `npc-r28-mourner-${n}`, 'r28-mourner', SHORT)),
  t('r28', 'npc-wulfhild', 'a5f-r28-farewell', SHORT),
  t('r30', 'npc-tobb', 'a5f-r30-brief', SHORT),
  ...(['wystan', 'merrin', 'wenna', 'wulfhild', 'rook', 'edric', 'hrolf', 'aelfreda', 'ansgar', 'ysmeryth'] as const).map((a) =>
    t('r30', a === 'aelfreda' ? 'npc-aelfreda-companion' : `npc-${a}`, `a5f-r30-line-${a}`, SHORT)),
  t('r30', 'npc-tobb', 'a5f-r30-verse', SHORT),
  t('m53', 'npc-edric', 'a5f-m53-brief', SHORT),
  t('m53', 'npc-rook', 'a5f-m53-rook', SHORT),
  t('m53', 'npc-vey-truce', 'm53-truce', SHORT),
  t('m53', 'npc-edric', 'a5f-m53-decide', SHORT),
  t('d09', 'npc-alric', 'a5f-d09-brief', SHORT),
  t('d09', 'npc-captive-stoker', 'd09-stoker', SHORT),
  t('d09', 'npc-wenna', 'a5f-d09-wenna', SHORT),
  t('d09', 'npc-alric', 'a5f-d09-after', SHORT),
];
