// K10 socket numbers (invented, Q6 list; logged in design/changes-applied.md).
export const SOCKET_TUNING = {
  fitGold: 50,
  removeGold: 25,
  recutGold: 40,
  /** Steadyhand's range. */
  farMetres: 15,
  /** The summed Act 3 outgoing bonus (gems, Frostbrow's knife, the R16 dragonkin bonus) never exceeds this; high enough that R16 keep always adds over the keen knife. */
  outCap: 0.4,
  /** The summed Act 3 damage-taken reduction never exceeds this. */
  inCap: 0.25,
  /** R16 keep: the player's hits on dragonkin. */
  dragonkinBonus: 0.15,
  /** Frostbrow's Hunting Knife, then its R15 hut upgrade; Eadgyth's plain knife. */
  knifeBonus: 0.08,
  knifeKeenBonus: 0.15,
  plainKnifeBonus: 0.04,
  /** Ember-Mother's Scale (Ysmeryth at Hearthbound): damage taken. */
  motherScaleReduce: 0.05,
} as const;

/**
 * Every row is paid on a later load if its live drop could not be (a full stack): the load reads the boss outcome flag,
 * or the dungeon quest's completed state (the shipped Act 2 fixtures have D04 completed but no Slagmaw outcome).
 */
export const GEM_BOSSES: readonly { bossId: string; variant: 'a' | 'b'; questId: string }[] = [
  { bossId: 'ashen-prior', variant: 'a', questId: 'd01' },
  { bossId: 'gaffer-grimtooth', variant: 'b', questId: 'd02' },
  { bossId: 'thrandil-redmane', variant: 'a', questId: 'd03' },
  { bossId: 'the-slagmaw', variant: 'b', questId: 'd04' },
  { bossId: 'murkjaw', variant: 'a', questId: 'd05' },
  { bossId: 'corvin-skarl', variant: 'b', questId: 'd06' },
];

export const grantedFlag = (bossId: string): string => `gear.shardgem.granted.${bossId}`;
