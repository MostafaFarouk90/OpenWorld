import { HROLF_LOOK } from './hrolfLook';
import { HROLF_STRINGS_EN } from './strings.hrolf.en';
import { COMPANION_DOWNED_SECONDS, HROLF_TUNING } from './tuning';
import type { CompanionDef } from './types';

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
    },
    combatStart: pool('combatStart'),
    combatEnd: pool('combatEnd'),
    elapsed: pool('elapsed'),
  },
  places: {
    triggers: {},
    interiors: { 'tilted-anvil': 'tiltedAnvil' },
    regions: { harrowmark: 'harrowmark', cinderreach: 'cinderreach' },
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
