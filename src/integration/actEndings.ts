// The act-ending table (contracts v0.6 item 7): one row per act's mini-ending. Act 1's director (act1Ending.ts) and
// card keep their own constants; this table is what Act 2's (A16) builds on, and what the save alias reads.
// `worldChangeFlag` defaults to `gateFlag`: no act sets a separate "world changed" flag.
import {
  ACT1_CAMP_DIALOGUE,
  ACT1_CAMP_SEEN_FLAG,
  ACT1_CARD_SEEN_FLAG,
  ACT1_CARD_SEEN_FLAG_V06,
  ACT1_ENDING_ID,
  ACT1_ENDING_QUESTS,
  ACT1_GATE_FLAG,
} from './act1Ending';
import type { ActEndingDirectorDef } from './actEndingDirector';

export interface ActEndingDef {
  act: number;
  endingId: string;
  /** Quests whose completion ends the act. */
  requires: readonly string[];
  /** Set once when the act ends; the next act's land opens on it. */
  gateFlag: string;
  /** Strings key of the card's title. */
  cardKey: string;
  /** Set when the card is first shown. */
  cardSeenFlag: string;
  /** Older keys that also count as seen (read, and still written for older readers). */
  legacyCardSeenFlags?: readonly string[];
  campDialogueId: string;
  campSeenFlag: string;
  /** Defaults to `gateFlag`. */
  worldChangeFlag?: string;
  /** When set, the director fades and moves the party to this anchor before the camp scene. */
  campAnchorId?: string;
}

/** The v0.5 seen flag: a save that has it also reads as `codex.actEnding.a1.seen` (WorldState.load). */
export const LEGACY_ACT1_CARD_SEEN_FLAG = ACT1_CARD_SEEN_FLAG;
export { ACT1_CARD_SEEN_FLAG_V06 };

export const ACT_ENDINGS: readonly ActEndingDef[] = [
  {
    act: 1,
    endingId: ACT1_ENDING_ID,
    requires: ACT1_ENDING_QUESTS,
    gateFlag: ACT1_GATE_FLAG,
    cardKey: 'hud.ending.title',
    cardSeenFlag: ACT1_CARD_SEEN_FLAG_V06,
    legacyCardSeenFlags: [LEGACY_ACT1_CARD_SEEN_FLAG],
    campDialogueId: ACT1_CAMP_DIALOGUE,
    campSeenFlag: ACT1_CAMP_SEEN_FLAG,
  },
  {
    act: 2,
    endingId: 'the-houses-stand',
    requires: ['m22', 'd04'],
    gateFlag: 'story.gate.a3',
    cardKey: 'hud.ending.a2.title',
    cardSeenFlag: 'codex.actEnding.a2.seen',
    campDialogueId: 'scene-act2-camp',
    campSeenFlag: 'story.a2.campSeen',
  },
  {
    act: 3,
    endingId: 'the-coal-mothers-oath',
    requires: ['m34', 'd06'],
    gateFlag: 'story.gate.a4',
    cardKey: 'hud.ending.a3.title',
    cardSeenFlag: 'codex.actEnding.a3.seen',
    campDialogueId: 'scene-act3-camp',
    campSeenFlag: 'story.a3.campSeen',
    campAnchorId: 'dragonspine.wyrmwatch.hearth',
  },
];

export function actEnding(act: number): ActEndingDef | undefined {
  return ACT_ENDINGS.find((d) => d.act === act);
}

export function worldChangeFlag(def: ActEndingDef): string {
  return def.worldChangeFlag ?? def.gateFlag;
}

/** Every flag that reads as "this act's card was seen". */
export function cardSeenFlags(def: ActEndingDef): readonly string[] {
  return [def.cardSeenFlag, ...(def.legacyCardSeenFlags ?? [])];
}

/** Save aliases: a loaded legacy key also sets its v0.6 key. Applied by WorldState.load. */
export const FLAG_ALIASES: readonly (readonly [legacy: string, current: string])[] = ACT_ENDINGS.flatMap((d) =>
  (d.legacyCardSeenFlags ?? []).map((legacy) => [legacy, d.cardSeenFlag] as const),
);

/** The director's view of a row (`new ActEndingDirector(directorDef(actEnding(2)!), ports)`). */
export function directorDef(def: ActEndingDef): ActEndingDirectorDef {
  return {
    act: def.act,
    endingId: def.endingId,
    requires: def.requires,
    gateFlag: def.gateFlag,
    cardSeenFlags: cardSeenFlags(def),
    campDialogueId: def.campDialogueId,
    campSeenFlag: def.campSeenFlag,
    ...(def.campAnchorId ? { campAnchorId: def.campAnchorId } : {}),
  };
}
