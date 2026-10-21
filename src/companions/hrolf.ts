import { HROLF_LOOK } from './hrolfLook';
import { HROLF_STRINGS_EN } from './strings.hrolf.en';
import { ACT2_TRIGGERS, COMPANION_DOWNED_SECONDS, HROLF_TUNING } from './tuning';
import type { CompanionDef } from './types';

/** A12's R11 writes it: 'spared' or 'slain'. */
export const R11_CHOICE_FLAG = 'story.r11.choice';

const pool = (prefix: string): string[] =>
  Object.keys(HROLF_STRINGS_EN).filter((k) => k.startsWith(`companion.hrolf.bark.${prefix}.`));

/** Hrolf Ironbrow (design 8.1): joins at M13, tank, Stonehide; fights lightly (Q3, contract item 7; plans/act2-A5.md). */
export const HROLF: CompanionDef = {
  id: 'hrolf',
  nameKey: 'companion.hrolf.name',
  // A12's M13 writes it.
  joinFlag: 'story.m13.hrolfJoined',
  rankFlag: 'companion.hrolf.rank',
  role: 'tank',
  combat: {
    damage: HROLF_TUNING.damage,
    range: HROLF_TUNING.range,
    cooldown: HROLF_TUNING.cooldown,
    aggroRadius: HROLF_TUNING.aggroRadius,
  },
  downed: { kneelSeconds: COMPANION_DOWNED_SECONDS },
  vitals: { maxHealth: HROLF_TUNING.maxHealth },
  stonehide: {
    auraId: 'stonehide',
    buffId: 'companion.hrolf.stonehide',
    nameKey: 'companion.hrolf.stonehide.name',
    share: HROLF_TUNING.stonehideShare,
    radius: HROLF_TUNING.stonehideRadius,
  },
  look: HROLF_LOOK,
  // A3 places the NPC (absentWhen the join flag) at Stonefold.
  npcPost: 'npc-post.hrolf',
  npcId: 'hrolf',
  dialogueId: 'npc-hrolf',
  banter: {
    area: {
      harrowmark: pool('area.harrowmark'),
      tiltedAnvil: pool('area.tiltedAnvil'),
      cinderreach: pool('area.cinderreach'),
      oldsmoke: pool('area.oldsmoke'),
      dell: pool('area.dell'),
      'den.spared': pool('area.den.spared'),
      'den.slain': pool('area.den.slain'),
    },
    combatStart: pool('combatStart'),
    combatEnd: pool('combatEnd'),
    elapsed: pool('elapsed'),
  },
  places: {
    triggers: { [ACT2_TRIGGERS.dell]: 'dell', [ACT2_TRIGGERS.den]: 'den' },
    interiors: { 'tilted-anvil': 'tiltedAnvil' },
    regions: { harrowmark: 'harrowmark', cinderreach: 'cinderreach', oldsmoke: 'oldsmoke' },
  },
  // R11 (design 3): at the wyrm den he speaks by how it ended; nothing before the choice.
  areaVariant: (place, flag) => {
    if (place !== 'den') return place;
    const c = flag(R11_CHOICE_FLAG);
    return c === 'spared' || c === 'slain' ? `den.${c}` : null;
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
