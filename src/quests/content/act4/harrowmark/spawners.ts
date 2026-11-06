// The Harrowmark quests' own spawner groups (all others are L2's, in src/harrowmark/act4/spawners.ts): R21's lane watch for the
// stealth section, and R22's three small guards at the material sites in Acts 2 and 3 land. Every group activates on a flag the
// director writes when its step is current, never refills, and keeps its region's own band (R22 is not under the Act 4 cap).
import type { SpawnerDef } from '../../../../enemies/types';
import { Q, R21_WATCH_PATROL } from './anchors';
import { R10_DUEL_ENEMY } from '../../act2/r10duels/r10Duels';
import { R22_ARM, R22_GROUP, R22_GUARD_TAG, R22_SITES } from './r22.quest';

/** R19: Bran's sparring second for the bout (the R10 duel's yard veteran, spawned by the director in the ring by the stables). */
export const R19_BOUT_SPAWNER = 'r19.bout';
export const R21_WATCH_GROUP = 'r21.lanes.watch';
export const R21_WATCH_FLAG = 'story.r21.watch';

const guards: Readonly<Record<string, Pick<SpawnerDef, 'enemy' | 'band' | 'block' | 'count'>>> = {
  cinderreach: { enemy: 'hunter-spearman', band: 'cinderreach', count: 3 },
  greyfen: { enemy: 'hunter-spearman', band: 'greyfen', block: 'greyfen', count: 3 },
  dragonspine: { enemy: 'hunter-spearman', band: 'dragonspine', block: 'dragonspine-lower', count: 2 },
};

export const HARROWMARK_A4_Q_SPAWNERS: readonly SpawnerDef[] = [
  {
    id: R19_BOUT_SPAWNER, tag: R19_BOUT_SPAWNER, enemy: R10_DUEL_ENEMY, count: 1, anchor: `${Q}.r19.bout`,
    activation: 'manual', ephemeral: true, untauntable: true, leash: false, band: 'harrowmark', respawn: 'never',
  },
  // R21: three masked watch observers walk the back lanes (the shipped stealth system; being seen sends Cael back to the start)
  {
    id: R21_WATCH_GROUP, tag: R21_WATCH_GROUP, enemy: 'watch-guard', count: 3, anchor: R21_WATCH_PATROL[0]!, memberAnchors: R21_WATCH_PATROL.slice(0, 3),
    patrol: [...R21_WATCH_PATROL], skin: 'watch-masked', band: 'harrowmark', activation: { quest: 'r21', flag: R21_WATCH_FLAG }, respawn: 'never', leash: false,
  },
  // R22: a small hunters' guard at each site
  ...R22_SITES.map((s): SpawnerDef => {
    const g = guards[s.region]!;
    const anchors = [1, 2, 3].slice(0, g.count).map((n) => `${s.region}.q.r22.guard.${n}`);
    return {
      id: R22_GROUP(s), tag: R22_GUARD_TAG(s), ...g, anchor: anchors[0]!, memberAnchors: anchors,
      activation: { quest: 'r22', flag: R22_ARM(s) }, respawn: 'never', leash: true,
    };
  }),
];
