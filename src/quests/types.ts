// Quest and dialogue data types. Shapes follow contracts/quests-and-dialogue.md v0.2 plus the
// review additions (xp, skillPoints, take effects; spawnTag; objective `when`).

export type FlagValue = boolean | number | string;
export type FavourTrack = 'halvard' | 'oswin' | 'grisel' | 'dragons' | 'ashwalkers';
export type FavourBand = 'cold' | 'banked' | 'stoked' | 'hearthbound';
export type QuestState = 'inactive' | 'active' | 'completed' | 'failed';

export interface MercyEventData {
  verb: 'spare' | 'calm' | 'release' | 'warmHand';
  tier: 'normal' | 'elite' | 'boss';
  track: FavourTrack | null;
  creature: string;
  actorId?: string;
  amount?: number;
}

export type Condition =
  | { flag: string; equals?: FlagValue }
  | { favour: FavourTrack; band?: FavourBand | FavourBand[]; atLeast?: number; below?: number }
  | { quest: string; state: QuestState | QuestState[] }
  | { objective: [questId: string, objectiveId: string]; done: boolean }
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition };

export type Effect =
  | { setFlag: string; value: FlagValue }
  | { clearFlag: string }
  | { favour: FavourTrack; delta: number }
  | { mercy: MercyEventData }
  | { startQuest: string }
  | { completeObjective: [string, string] }
  | { completeQuest: string }
  | { give: { itemId: string; count: number }[] }
  | { take: string | { itemId: string; count: number }[] }
  | { xp: number }
  | { skillPoints: number }
  | { giveGold: number }
  | { if: Condition; then: Effect[]; else?: Effect[] }
  | { placeNpc: { npcId: string; anchorId: string } }
  | { unlockMercy: MercyUnlockVerb }
  | { grantAbility: string }
  | { event: string; payload?: unknown };

/** Mercy verbs a quest can unlock (the flags `enemies.mercy.<verb>`). */
export type MercyUnlockVerb = 'release' | 'spare' | 'calm';

/** `if` effects may nest this deep. */
export const MAX_IF_DEPTH = 3;

export type ObjectiveType = 'goTo' | 'interact' | 'kill' | 'collect' | 'carry' | 'talk' | 'event';

export interface ObjectiveDef {
  id: string;
  type: ObjectiveType;
  textKey: string;
  /** default 1 */
  required?: number;
  /**
   * trigger id (goTo, carry destination), interactable id, actor kind (kill), item id (collect), npc id (talk),
   * bus event name (event; an array means any of these names)
   */
  target: string | string[];
  /** event only: every listed top-level payload key must equal the value */
  match?: Record<string, FlagValue>;
  /** event only: credited as soon as the objective is current (and on load) when this already holds */
  doneWhen?: Condition;
  /** event only: payload key whose string value counts once per distinct value */
  dedupeBy?: string;
  optional?: boolean;
  /** objective is only credited (and, for props, enabled) while this holds */
  when?: Condition;
  /** kill only: credit only actors whose spawn tag equals this */
  spawnTag?: string;
}

export interface QuestDef {
  id: string;
  titleKey: string;
  summaryKey: string;
  objectives: ObjectiveDef[];
  sequential?: boolean;
  /** start() and complete() from inactive are refused until this holds */
  startWhen?: Condition;
  onStart?: Effect[];
  onComplete?: Effect[];
  rewards?: Effect[];
}

export interface DialogueChoice {
  id: string;
  textKey: string;
  when?: Condition;
  effects?: Effect[];
  next: string | null;
}

export interface DialogueNode {
  id: string;
  /** npc id (gaut, edda, stane, aelfreda) or 'cael' */
  speaker: string;
  textKey: string;
  portrait?: string;
  /** at most 4 */
  choices?: DialogueChoice[];
  effects?: Effect[];
  next?: string | null;
  when?: Condition;
}

export interface DialogueDef {
  id: string;
  start: string | { when: Condition; node: string }[];
  nodes: DialogueNode[];
}

export interface ObjectiveRuntime { progress: number }
export interface QuestRuntime { state: QuestState; objectives: Record<string, number> }

/** Persisted data for the `quests` Persistable (the Persistable carries the only version). */
export interface QuestsSaveData { quests: Record<string, QuestRuntime> }
/** Persisted data for the `dialogue` Persistable. */
export interface DialogueSaveData { seen: string[] }

/** Effect `event` names are limited to these namespaces so data cannot forge combat events. */
export const EFFECT_EVENT_PATTERN = /^(tutorial|cutscene|reward|story|npc)\.[a-zA-Z0-9_.-]+$/;
