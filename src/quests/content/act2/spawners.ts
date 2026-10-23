import { wyrmlingSpawner } from '../../../enemies/wyrm/spawners';
import { WATCH_GUARD_BAND } from '../../../enemies/level';
import type { LevelBand, SpawnerDef } from '../../../enemies/types';

const range = (prefix: string, from: number, to: number): string[] => Array.from({ length: to - from + 1 }, (_, i) => `${prefix}${from + i}`);
const common = { band: 'cinderreach', respawn: 'never' as const };
/** R05's fog hounds: levels 9 to 11 (the Knight is 11 when R05 starts on the headless chain). */
export const R05_FOG_BAND: LevelBand = { min: 9, max: 11 };

/** Quest-scoped ground groups (the ambient ones are A6b's, src/enemies/act2Spawners.ts). Anchors are A3's. */
export const ACT2_SPAWNERS_A12: readonly SpawnerDef[] = [
  // M11: two Footman ambushes (manual: the director spawns each after the column has dismounted) and the bloom's wraiths
  ...[1, 2].map((n): SpawnerDef => ({
    id: `q12.m11.ambush-${n}`, tag: 'm11.ambush', enemy: 'blighted-soldier', count: 3, anchor: `cinderreach.m11.ambush.${n}`,
    activation: 'manual', ephemeral: true, leash: true, ...common,
  })),
  {
    id: 'q12.m11.wraiths', tag: 'm11.wraith', enemy: 'ash-wraith', count: 5, anchor: 'cinderreach.m11.wraith.1',
    memberAnchors: range('cinderreach.m11.wraith.', 1, 5), activation: { quest: 'm11', flag: 'story.m11.wraithsOut' }, leash: true, ...common,
  },
  // R05: the hounds in the fog, once the tracks are read. The band is the carried-over Knight's level at R05 (11, from the
  // headless census) and the two below it, not the whole region's 8 to 14: a level-11 Knight dies to three level-14 pounces
  // (64 damage each on a head hit, of 164 health) before he can kill one hound (src/integration/difficulty.test.ts).
  {
    id: 'q12.r05.fog', tag: 'r05.fog', enemy: 'ember-hound', count: 3, anchor: 'cinderreach.r05.track.1',
    memberAnchors: range('cinderreach.r05.track.', 1, 3), activation: { quest: 'r05', flag: 'story.r05.tracksFound' }, leash: true,
    ...common, band: R05_FOG_BAND,
  },
  // R06: Pennard's rite draws two waves of wraiths from the well (manual, the director starts each)
  ...[1, 2].map((n): SpawnerDef => ({
    id: `q12.r06.rite-${n}`, tag: 'r06.rite', enemy: 'ash-wraith', count: 4, anchor: 'cinderreach.r06.wraith.1',
    memberAnchors: range('cinderreach.r06.wraith.', 1, 4), activation: 'manual', ephemeral: true, leash: false, ...common,
  })),
  // M13: Hrolf's trial double (A5's duel service starts the fight)
  {
    id: 'q12.m13.trial', tag: 'm13.trial', enemy: 'hrolf-trial', count: 1, anchor: 'cinderreach.stonefold.ring.hrolf',
    memberAnchors: ['cinderreach.stonefold.ring.hrolf'], activation: 'manual', ephemeral: true, leash: false, ...common,
  },
  // R07: the den wakes at the last sign; the mother is her own group so her kill matches its own tag
  {
    id: 'q12.r07.den', tag: 'r07.den', enemy: 'ember-hound', count: 3, anchor: 'cinderreach.spawn.houndden.1',
    memberAnchors: range('cinderreach.spawn.houndden.', 1, 3), activation: { quest: 'r07', flag: 'story.r07.denWoke' }, leash: true, ...common,
  },
  {
    id: 'q12.r07.mother', tag: 'r07.mother', enemy: 'ember-hound', count: 1, anchor: 'cinderreach.spawn.houndden.4',
    memberAnchors: ['cinderreach.spawn.houndden.4'], activation: { quest: 'r07', flag: 'story.r07.motherHere' }, leash: true, ...common,
  },
  // R11: four hounds ringed about the wyrm's rest; they wake with the den scene (A6a spawns the wyrm itself)
  {
    id: 'q12.r11.hounds', tag: 'r11.hounds', enemy: 'ember-hound', count: 4, anchor: 'cinderreach.den.wyrm.rest',
    activation: { quest: 'r11', flag: 'story.r11.denSeen' }, leash: true, ...common,
  },
  // M14: the ridge's golems once the ledges are climbed, then its hounds (a kill counts only on the current objective)
  {
    id: 'q12.m14.golems', tag: 'm14.golems', enemy: 'cinder-golem', count: 2, anchor: 'cinderreach.m14.golem.1',
    memberAnchors: range('cinderreach.m14.golem.', 1, 2), activation: { quest: 'm14', flag: 'story.m14.golemsOut' }, leash: true, ...common,
  },
  {
    id: 'q12.m14.hounds', tag: 'm14.hounds', enemy: 'ember-hound', count: 3, anchor: 'cinderreach.spawn.anvil.1',
    activation: { quest: 'm14', flag: 'story.m14.houndsOut' }, leash: true, ...common,
  },
  // M15: two hunter packs of spearmen at the pens, then the two harpooners once the spearmen are down (A6b's ambient camp pack is separate)
  {
    id: 'q12.m15.pack-a', tag: 'm15.pack', enemy: 'hunter-spearman', count: 3, anchor: 'cinderreach.spawn.huntercamp.5',
    memberAnchors: range('cinderreach.spawn.huntercamp.', 5, 7), activation: { quest: 'm15', flag: 'story.m15.scouted' }, leash: true, ...common,
  },
  {
    id: 'q12.m15.pack-b', tag: 'm15.pack', enemy: 'hunter-spearman', count: 3, anchor: 'cinderreach.spawn.huntercamp.8',
    activation: { quest: 'm15', flag: 'story.m15.scouted' }, leash: true, ...common,
  },
  {
    id: 'q12.m15.harps', tag: 'm15.pack', enemy: 'hunter-harpooner', count: 2, anchor: 'cinderreach.spawn.huntercamp.5',
    activation: { quest: 'm15', flag: 'story.m15.harpsOut' }, leash: true, ...common,
  },
  // M15 stealth section: three observer-only watch guards on a loop round the camp, live while the scout objective is open
  {
    id: 'stealth.m15.watch', enemy: 'watch-guard', count: 3, anchor: 'cinderreach.spawn.m15.watch.1', memberAnchors: range('cinderreach.spawn.m15.watch.', 1, 3),
    patrol: range('cinderreach.patrol.m15.camp.', 1, 4), band: WATCH_GUARD_BAND, activation: { quest: 'm15' }, respawn: 'never', leash: false,
  },
  // M15: the caged wyrmling at the pen (tethered by the director; unchained and sent flying when the cage is opened)
  wyrmlingSpawner('q12.m15.cage', 'cinderreach.m15.cage', 1, { tag: 'm15.cage', activation: { quest: 'm15' }, ephemeral: true, peaceful: true }),
  // D03: the courtyard spearmen once the gate is down, the courtyard harpooners once they are dead, then the wall harpooners
  {
    id: 'q12.d03.court', tag: 'd03.court', enemy: 'hunter-spearman', count: 6, anchor: 'cinderreach.spawn.scorchhold.1',
    memberAnchors: range('cinderreach.spawn.scorchhold.', 1, 6), activation: { quest: 'd03', flag: 'story.d03.gateDown' }, leash: true, ...common,
  },
  {
    id: 'q12.d03.yard', tag: 'd03.court', enemy: 'hunter-harpooner', count: 2, anchor: 'cinderreach.spawn.scorchhold.1',
    memberAnchors: range('cinderreach.spawn.scorchhold.', 1, 2), activation: { quest: 'd03', flag: 'story.d03.yardOut' }, leash: true, ...common,
  },
  {
    id: 'q12.d03.perch', tag: 'd03.perch', enemy: 'hunter-harpooner', count: 3, anchor: 'cinderreach.spawn.scorchhold.perch.1',
    memberAnchors: range('cinderreach.spawn.scorchhold.perch.', 1, 3), activation: { quest: 'd03', flag: 'story.d03.perchOut' }, leash: true, ...common,
  },
];
