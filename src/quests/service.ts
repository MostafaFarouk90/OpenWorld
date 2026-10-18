import type { QuestDef, QuestState } from './types';
import type { ObjectiveView } from './QuestManager';

/** `quests` service (contracts/quests-and-dialogue.md section 2, plus the additions thread 3 listed). */
export interface QuestsService {
  register(def: QuestDef): void;
  get(id: string): QuestDef | undefined;
  state(id: string): QuestState;
  start(id: string): boolean;
  /** Runs onComplete and rewards exactly once; also used to complete a skipped beat. */
  complete(id: string): boolean;
  fail(id: string): boolean;
  completeObjective(questId: string, objectiveId: string): boolean;
  objectiveDone(questId: string, objectiveId: string): boolean;
  isObjectiveCurrent(questId: string, objectiveId: string): boolean;
  objectives(id: string): ObjectiveView[];
  active(): string[];
  onChange(listener: () => void): () => void;
}

/** `dialogue` service. */
export interface DialogueService {
  /** False (and nothing changes) when a dialogue or modal is already open, or the id is unknown. */
  start(dialogueId: string, npcId: string): boolean;
  readonly active: boolean;
  close(reason?: 'skip' | 'death' | 'load' | 'dispose' | 'script'): void;
  hasSeen(nodeId: string): boolean;
}

declare module '../core/Services' {
  interface GameServices {
    quests: QuestsService;
    dialogue: DialogueService;
  }
}

declare module '../core/events' {
  interface GameEventMap {
    'carry.picked': { carryId: string };
    'carry.dropped': { carryId: string; reason: string };
    'carry.delivered': { carryId: string; destinationId: string };
  }
}
