import { COMPANION_STRINGS_EN } from './strings.en';
import { TOBB_TUNING } from './tuning';
import type { CompanionDef } from './types';

const pool = (prefix: string): string[] =>
  Object.keys(COMPANION_STRINGS_EN).filter((k) => k.startsWith(`companion.tobb.bark.${prefix}.`));

/** Tobb Fenwick (design 8.1): joins at M05, Battle-song, banter; lite this slice (no combat). */
export const TOBB: CompanionDef = {
  id: 'tobb',
  nameKey: 'companion.tobb.name',
  joinFlag: 'story.m05.tobbJoined',
  rankFlag: 'companion.tobb.rank',
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
    },
    interiors: { 'chapel-vault': 'vault' },
    regions: { brightwater: 'brightwater' },
  },
  interiorEntry: { 'chapel-vault': 'vault.entry' },
};
