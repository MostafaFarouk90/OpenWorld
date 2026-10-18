// Narrow structural ports onto the game core (contracts v0.2). Pure logic in src/quests and
// src/dialogue depends only on these, so it is testable without the core; the two *.plugin.ts
// files adapt GameContext to them.
import type {
  Condition, Effect, FavourBand, FavourTrack, FlagValue, QuestState, MercyEventData,
} from './types';

export type Unsubscribe = () => void;

/** The event bus as the quest code sees it (string event names, loosely typed payloads). */
export interface BusPort {
  on(type: string, listener: (payload: any) => void): Unsubscribe;
  emit(type: string, payload?: unknown): void;
}

export interface StatePort {
  getFlag(key: string): FlagValue | undefined;
  setFlag(key: string, value: FlagValue): void; // may throw on an invalid key
  clearFlag(key: string): void;
  favourBand(track: FavourTrack): FavourBand;
  favour(track: FavourTrack): number;
  addFavour(track: FavourTrack, delta: number, source: 'quest' | 'dialogue' | 'mercy' | 'script'): number;
}

export interface StringsPort {
  t(key: string, params?: Record<string, string | number>): string;
  /** true when the key exists in the active or fallback table */
  has(key: string): boolean;
}

/** What conditions need to read about quests. */
export interface QuestReader {
  state(id: string): QuestState;
  objectiveDone(questId: string, objectiveId: string): boolean;
}

/** What effects need to act on quests. */
export interface QuestActions {
  start(id: string): boolean;
  complete(id: string): boolean;
  completeObjective(questId: string, objectiveId: string): boolean;
}

export interface ProgressionPort { grantXp(amount: number, source: string): void; grantSkillPoint?(amount: number, reason: string): void }
export interface InventoryPort { remove(itemId: string, count: number): boolean }

export interface ConditionEnv { state: StatePort; quests: QuestReader; warn?(msg: string): void }

export interface EffectEnv {
  state: StatePort;
  quests: QuestReader & QuestActions;
  bus: BusPort;
  /** optional services; absent means the effect warns once and does nothing */
  progression?: () => ProgressionPort | undefined;
  inventory?: () => InventoryPort | undefined;
  /** id recorded as `sourceId` on loot.granted and as xp source */
  sourceId: string;
  warn?(msg: string): void;
}

export interface EffectResult { effect: Effect; ok: boolean; error?: string }

/** Actor info lookup for kill objectives (spawn tag filter). */
export type ActorMetaPort = (actorId: string) => { spawnTag?: string } | undefined;

export interface TriggerPort { isInside(triggerId: string, actorId: string): boolean }

export type { Condition, Effect, MercyEventData };
