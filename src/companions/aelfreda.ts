import { NPC_DEFS } from '../npcs/npcDefs';
import type { NpcDef } from '../npcs/types';
import { AELFREDA_STRINGS_EN } from './strings.aelfreda.en';
import { ACT2_TRIGGERS, AELFREDA_TUNING, COMPANION_DOWNED_SECONDS } from './tuning';
import type { CompanionDef, CompanionLook } from './types';

const pool = (prefix: string): string[] =>
  Object.keys(AELFREDA_STRINGS_EN).filter((k) => k.startsWith(`companion.aelfreda.bark.${prefix}.`));

/** Her Act 1 NPC (the Mage in a white robe recolour, design 8.1); the companion wears the same look. */
const AELFREDA_NPC_DEF: NpcDef = NPC_DEFS.find((d) => d.id === 'aelfreda')!;

export const AELFREDA_LOOK: CompanionLook = {
  npcDef: AELFREDA_NPC_DEF,
  clips: { kneel: ['Sit_Floor_Down'] },
};

/** The companion talk tree (the Hearth Rite); her Act 1 NPC keeps `npc-aelfreda`. */
export const AELFREDA_COMPANION_DIALOGUE = 'npc-aelfreda-companion';

/** Sister Aelfreda (design 8.1): joins at M14, healer, Calming flame; never attacks (Q3; plans/act2-A5.md section 2). */
export const AELFREDA: CompanionDef = {
  id: 'aelfreda',
  nameKey: 'companion.aelfreda.name',
  // A12's M14 writes it.
  joinFlag: 'story.m14.aelfredaJoined',
  rankFlag: 'companion.aelfreda.rank',
  role: 'healer',
  downed: { kneelSeconds: COMPANION_DOWNED_SECONDS },
  calmingFlame: {
    auraId: 'calming-flame',
    buffId: 'companion.aelfreda.calming-flame',
    nameKey: 'companion.aelfreda.calming-flame.name',
    everySeconds: AELFREDA_TUNING.flameEverySeconds,
    healFraction: AELFREDA_TUNING.flameHealFraction,
  },
  look: AELFREDA_LOOK,
  // A3 moves her NPC to `npc-post.aelfreda.anvil` for M14; the handover falls back to her chapel post.
  npcPost: 'npc-post.aelfreda',
  npcId: 'aelfreda',
  dialogueId: AELFREDA_COMPANION_DIALOGUE,
  banter: {
    area: {
      harrowmark: pool('area.harrowmark'),
      tiltedAnvil: pool('area.tiltedAnvil'),
      cinderreach: pool('area.cinderreach'),
      oldsmoke: pool('area.oldsmoke'),
      dell: pool('area.dell'),
    },
    combatStart: pool('combatStart'),
    combatEnd: pool('combatEnd'),
    elapsed: pool('elapsed'),
  },
  places: {
    triggers: { [ACT2_TRIGGERS.dell]: 'dell' },
    interiors: { 'tilted-anvil': 'tiltedAnvil' },
    regions: { harrowmark: 'harrowmark', cinderreach: 'cinderreach', oldsmoke: 'oldsmoke' },
  },
  interiorEntry: {
    'tilted-anvil': 'harrowmark.tilted-anvil.entry',
    'counting-house': 'harrowmark.counting-house.entry',
    archive: 'harrowmark.archive.entry',
    'keep-hall': 'harrowmark.keep-hall.entry',
    underways: 'harrowmark.underways.entry',
  },
  waits: [],
};
