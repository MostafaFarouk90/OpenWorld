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
  // v0.8 item 14. L13 builds the director plugin, the camp scene and the anchor (L1 places `waste.rimfoot.fire`).
  {
    act: 4,
    endingId: 'the-road-to-the-rim',
    requires: ['m46', 'd08'],
    gateFlag: 'story.gate.a5',
    cardKey: 'hud.ending.a4.title',
    cardSeenFlag: 'codex.actEnding.a4.seen',
    campDialogueId: 'scene-act4-camp',
    campSeenFlag: 'story.a4.campSeen',
    campAnchorId: 'waste.rimfoot.fire',
  },
];

/**
 * v0.9 item 9: the final ending (Act 5, plan Part 3.8). Its own row type: it has no camp scene, and it ends on a choice
 * (`story.m56.choice`) with one cutscene per choice, the cards, the epilogue and the credits, then the world after the
 * ending (`world.afterEnding`, Q1 (a)). The camp rows of acts 1 to 4 keep `ActEndingDef` unchanged. No director runs it
 * until N12 PR 2. Deviation from the plan's "optional camp fields" (routine): a separate type keeps every shipped reader
 * of the camp rows typed as before.
 */
export interface FinalEndingDef {
  act: 5;
  endingId: string;
  requires: readonly string[];
  /** Set when M56 completes; the epilogue and credits run from it. */
  gateFlag: string;
  /** The choice flag and its values (`M56_CHOICES`). */
  choiceFlag: string;
  /** One cutscene per choice value. */
  cutscenes: Readonly<Record<'rekindle' | 'let-it-die', string>>;
  /** The ending cards (id to strings key); N12 picks which show from the choice and the snapshot. */
  cards: Readonly<Record<string, string>>;
  /** Set when the first card is shown. */
  cardSeenFlag: string;
  epilogueId: string;
  creditsId: string;
  /** Set once the ending has played out: the world after the ending (N13). */
  afterState: string;
}

export const ACT5_ENDING: FinalEndingDef = {
  act: 5,
  endingId: 'embers-or-dawn',
  requires: ['m56'],
  gateFlag: 'story.gate.end',
  choiceFlag: 'story.m56.choice',
  cutscenes: { rekindle: 'scene-ending-rekindle', 'let-it-die': 'scene-ending-let-it-die' },
  cards: { 'last-ember': 'hud.ending.a5.lastEmber', 'last-bearer': 'hud.ending.a5.lastBearer', 'long-dawn': 'hud.ending.a5.longDawn' },
  cardSeenFlag: 'codex.actEnding.a5.seen',
  epilogueId: 'scene-epilogue',
  creditsId: 'credits-main',
  afterState: 'world.afterEnding',
};

/** v0.9: the final ending's row. */
export function finalEnding(): FinalEndingDef {
  return ACT5_ENDING;
}

/** The camp row of acts 1 to 4 (the final ending is `finalEnding()`). */
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
