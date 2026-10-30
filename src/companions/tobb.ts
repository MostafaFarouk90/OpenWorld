import { COMPANION_STRINGS_EN } from './strings.en';
import { ACT2_TRIGGERS, COMPANION_DOWNED_SECONDS, TOBB_TUNING } from './tuning';
import type { CompanionDef } from './types';
import { ACT3_INTERIOR_ENTRY, ACT3_PLACES, act3Pools, act3Variant } from './act3/banter';

const pool = (prefix: string): string[] =>
  Object.keys(COMPANION_STRINGS_EN).filter((k) => k.startsWith(`companion.tobb.bark.${prefix}.`));

/** Tobb Fenwick (design 8.1): joins at M05, Battle-song, banter; lite this slice (no combat). */
export const TOBB: CompanionDef = {
  id: 'tobb',
  nameKey: 'companion.tobb.name',
  joinFlag: 'story.m05.tobbJoined',
  rankFlag: 'companion.tobb.rank',
  role: 'support',
  downed: { kneelSeconds: COMPANION_DOWNED_SECONDS },
  npcPost: 'npc-post.tobb',
  npcId: 'tobb',
  dialogueId: 'npc-tobb',
  aura: {
    id: 'battle-song',
    buffId: 'companion.tobb.battle-song',
    nameKey: 'companion.tobb.aura.name',
    seconds: TOBB_TUNING.auraSeconds,
    attackSpeed: TOBB_TUNING.auraMultiplier,
  },
  banter: {
    area: {
      hollinFord: pool('area.hollinFord'),
      deadRoad: pool('area.deadRoad'),
      shrine: pool('area.shrine'),
      vault: pool('area.vault'),
      brightwater: pool('area.brightwater'),
      harrowmark: pool('area.harrowmark'),
      bastionYard: pool('area.bastionYard'),
      tiltedAnvil: pool('area.tiltedAnvil'),
      underways: pool('area.underways'),
      cinderreach: pool('area.cinderreach'),
      oldsmoke: pool('area.oldsmoke'),
      dell: pool('area.dell'),
      // Act 3 (K5): the Greyfen, the Dragonspine, the trial, the reveal and the ferry.
      ...act3Pools('tobb'),
    },
    combatStart: pool('combatStart'),
    combatEnd: pool('combatEnd'),
    elapsed: pool('elapsed'),
  },
  places: {
    // Trigger ids from world-layout-and-npcs.md section 6 (thread 4 defines them).
    triggers: {
      'trg.ford.toll-post': 'hollinFord',
      'trg.wardstones.road': 'deadRoad',
      'trg.shrine.basin': 'shrine',
      // Thread 17's Harrowmark layout.
      'trg.harrowmark.bastion-yard': 'bastionYard',
      // Act 2: A9's Kindling Dell.
      [ACT2_TRIGGERS.dell]: 'dell',
      ...ACT3_PLACES.triggers,
    },
    interiors: { 'chapel-vault': 'vault', 'tilted-anvil': 'tiltedAnvil', underways: 'underways', ...ACT3_PLACES.interiors },
    // `harrowmark` is thread 4's region-mask id for the city (to confirm when the mask lands).
    regions: { brightwater: 'brightwater', harrowmark: 'harrowmark', cinderreach: 'cinderreach', oldsmoke: 'oldsmoke', ...ACT3_PLACES.regions },
  },
  // Act 3: Dragonspine places speak differently after the reveal (M32).
  areaVariant: act3Variant,
  // Thread 3a's interior-side anchors (`harrowmark.<id>.entry`).
  interiorEntry: {
    'chapel-vault': 'vault.entry',
    'tilted-anvil': 'harrowmark.tilted-anvil.entry',
    'counting-house': 'harrowmark.counting-house.entry',
    archive: 'harrowmark.archive.entry',
    'keep-hall': 'harrowmark.keep-hall.entry',
    underways: 'harrowmark.underways.entry',
    ...ACT3_INTERIOR_ENTRY,
  },
  // Quest-derived only (review B1; thread 18's liveness windows). Posts: south-gate and keep are thread 17's,
  // tilted-anvil is thread 3a's (the hearth, inside the inn).
  waits: [
    { reason: 'stealth', anchorId: 'npc-post.tobb.tilted-anvil', quest: 'm09', until: 'o4' },
    { reason: 'chase', anchorId: 'npc-post.tobb.tilted-anvil', quest: 'm10', until: 'o3' },
    { reason: 'keep', anchorId: 'npc-post.tobb.keep', interior: 'keep-hall' },
    { reason: 'gate', anchorId: 'npc-post.tobb.south-gate', quest: 'm06', until: 'o2' },
  ],
};
