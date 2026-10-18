import type { Actor, ActorId, Team } from '../actors/Actor';
import type { DamageRequest, DamageResult } from '../actors/DamageResolver';
import type { FavourBand, FavourSource, FavourTrack, MercyEvent } from '../state/favour';
import type { FlagValue } from '../state/WorldState';
import { EventBus } from './EventBus';

export interface ItemStack {
  itemId: string;
  count: number;
}

/**
 * Shared game events (contracts/game-events-and-flags.md section 4). Threads add events of their own
 * namespace by module augmentation: `declare module '../core/events' { interface GameEventMap { ... } }`.
 */
export interface GameEventMap {
  'actor.spawned': { actor: Actor };
  'actor.despawned': { actorId: ActorId };
  'damage.dealt': DamageResult;
  'actor.staggered': { actorId: ActorId; byId: ActorId | null };
  'actor.died': {
    actorId: ActorId;
    killerId: ActorId | null;
    kind: string;
    team: Team;
    level: number;
    spawnTag: string | undefined;
  };
  'actor.revived': { actorId: ActorId; reason: 'respawn' | 'script'; health: number };
  'actor.saved': { actorId: ActorId; handlerId: string; request: DamageRequest };
  'attack.window': { actorId: ActorId; attackId: string; swingId: number; phase: 'open' | 'close' };
  'ai.aggro': { actorId: ActorId; targetId: ActorId };
  'ai.calm': { actorId: ActorId };
  /** `attackId` is the clip, equal to the coming `attack.window.attackId`; `swingId` matches it too. */
  telegraph: {
    actorId: ActorId;
    kind: 'block' | 'dodge';
    attackId: string;
    moveId: string;
    swingId: number;
    leadSeconds: number;
  };
  /** The telegraphed window will not open (the attacker was staggered, killed or retargeted). */
  'telegraph.cancelled': { actorId: ActorId; swingId: number };
  /** Keyboard lock (fullscreen) state for the Ctrl dodge mitigations. */
  'input.keyboardLock': { supported: boolean; locked: boolean };
  mercy: MercyEvent;
  'mercy.revoked': { actorId: ActorId; track: FavourTrack | null; removed: number };
  interact: { interactableId: string; kind: string; actorId: ActorId; action: 'interact' | 'mercy' };
  'interact.cancelled': { interactableId: string; reason: 'released' | 'focus-lost' | 'damaged' | 'context' | 'dead'; action: 'interact' | 'mercy' };
  'loot.granted': { sourceId: string; items: ItemStack[] };
  'trigger.enter': { triggerId: string; actorId: ActorId };
  'trigger.exit': { triggerId: string; actorId: ActorId };
  discover: { placeId: string; kind: 'region' | 'poi' | 'waystone' };
  'quest.started': { questId: string };
  'quest.completed': { questId: string };
  'quest.failed': { questId: string };
  'quest.objective': { questId: string; objectiveId: string; progress: number; required: number; done: boolean };
  'dialogue.started': { dialogueId: string; npcId: string };
  'dialogue.ended': { dialogueId: string; npcId: string };
  'dialogue.choice': { dialogueId: string; nodeId: string; choiceId: string };
  rest: { waystoneId: string };
  'waystone.rekindled': { waystoneId: string };
  fastTravel: { fromId: string; toId: string };
  'flag.changed': { key: string; value: FlagValue | undefined; previous: FlagValue | undefined };
  'favour.changed': {
    track: FavourTrack;
    value: number;
    previous: number;
    delta: number;
    source: FavourSource;
    band: FavourBand;
  };
  'save.loaded': { slot: string };
  'burn.changed': { value: number; previous: number };
  'cutscene.started': { cutsceneId: string };
  'cutscene.ended': { cutsceneId: string };
  'tutorial.beat': { beatId: string; state: 'started' | 'completed' | 'skipped' };
  'spell.cast': { casterId: ActorId; spellId: string };
  'spell.released': { casterId: ActorId; spellId: string };
  'ui.modal': { id: string; open: boolean };
}

export type GameEventType = keyof GameEventMap;
export class GameEvents extends EventBus<GameEventMap> {}
