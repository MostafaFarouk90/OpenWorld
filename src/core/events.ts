import type { Actor, ActorId, Team } from '../actors/Actor';
import type { DamageRequest, DamageResult } from '../actors/DamageResolver';
import type { FavourBand, FavourSource, FavourTrack, MercyEvent } from '../state/favour';
import type { FlagValue } from '../state/WorldState';
import type { ClassId } from '../actors/classes';
import type { StatusKind } from '../actors/status';
import { EventBus } from './EventBus';

/** A plain position in event payloads (copied, never a live vector). */
export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

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
  /** v0.5: a waystone rest carries `waystoneId` (and moves the respawn point); an inn rest carries only `placeId`. */
  rest: { waystoneId?: string; placeId?: string };
  'waystone.rekindled': { waystoneId: string; cause: 'player' | 'script' };
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

  // v0.4 (slice 2). Appended at the end; owners emit these and never redeclare them.
  /** Core: the scripted Surge Leap primitive (`player.leap`). `to` is the landing feet on `land`. */
  'player.leap': { phase: 'start' | 'land' | 'cancel'; from: Vec3Like; to?: Vec3Like };
  /** Core boss registry (actors-and-damage.md section 7); only the registry emits `boss.*`. */
  'boss.started': { bossId: string; actorId: ActorId };
  'boss.phase': { bossId: string; phase: number; previous: number };
  'boss.break': { bossId: string; phase: number; breaks: number; last: boolean };
  'boss.shield': { bossId: string; up: boolean };
  'boss.releaseWindow': { bossId: string; open: boolean };
  'boss.defeated': { bossId: string; actorId: ActorId };
  'boss.released': { bossId: string; actorId: ActorId };
  /** The registration ended without an outcome change (a vault-reload reset, a plugin teardown); clear boss UI and music. */
  'boss.ended': { bossId: string; actorId: ActorId; reason: 'despawned' | 'unregistered' };
  /** Thread 2: an ability granted outside the skill tree (first id `surge-leap`). */
  'ability.learned': { id: string; source: string };
  /** Thread 2: a Scar was added (shard use at Burn 75 or more); `total` is the new count. */
  'scar.added': { total: number; source: string };
  /** Thread 3a. */
  'interior.entered': { interiorId: string; doorId: string };
  'interior.exited': { interiorId: string; doorId: string };
  /** Thread 4b. */
  'companion.joined': { companionId: string; actorId: ActorId };
  'companion.left': { companionId: string; actorId: ActorId };
  'companion.banter': { companionId: string; lineKey: string; trigger: 'area' | 'combatStart' | 'combatEnd' | 'elapsed' };
  'companion.aura': { companionId: string; auraId: string; active: boolean };
  /** Thread 7. */
  'warmth.changed': { tier: number; previous: number };
  'shrine.rekindled': { shrineId: string };
  'wardstone.struck': { index: number; errorMs: number };
  'wardstone.missed': { index: number; reason: 'early' | 'late' | 'order' };
  'wardstones.complete': Record<string, never>;

  // v0.5 (slice 2 Phase B). Appended at the end; owners emit these and never redeclare them.
  /** Core: the player's class kit was attached (`previous: null`) or swapped (`ctx.player.swapAvatar`). */
  'player.avatar': { classId: ClassId; previous: ClassId | null };
  /** Thread 2's `status` service (actors-and-damage.md section 10). */
  'status.applied': { actorId: ActorId; id: string; kind: StatusKind };
  'status.expired': { actorId: ActorId; id: string; kind: StatusKind };
  /** Thread 2: grant an ability outside the tree (quest effects use it as a loose event, like `xp.grant`). */
  'ability.grant': { id: string; source: string };
  /** Thread 12. `class.chosen` is M07's first choice; `class.changed` a later change (progression charged the respec). */
  'class.chosen': { classId: ClassId };
  'class.changed': { classId: ClassId; previous: ClassId; free: boolean; cost: number };
  'class.drill': { classId: ClassId; outcome: 'done' | 'skipped' };
  /** Thread 18 (thread 5's `ai.spotted` maps to `stealth.noticed`). */
  'stealth.section': { sectionId: string; phase: 'entered' | 'cleared' | 'exited' };
  'stealth.noticed': { observerId: ActorId; sectionId: string; level: number };
  'stealth.alert': { observerId: ActorId; sectionId: string; state: 'calm' | 'suspicious' | 'alerted' };
  'stealth.caught': { observerId: ActorId; sectionId: string; checkpointId: string };
  'stealth.checkpoint': { sectionId: string; checkpointId: string };
  'chase.started': { chaseId: string };
  'chase.caught': { chaseId: string; seconds: number };
  'chase.lost': { chaseId: string; reason: 'timer' | 'distance' | 'combat' };
  /** Thread 20. */
  'mount.summoned': { mountId: string };
  'mount.mounted': { mountId: string };
  'mount.dismounted': { mountId: string; reason: 'player' | 'combat' | 'interior' | 'load' | 'script' };
  /** Thread 19. */
  'vendor.bought': { vendorId: string; itemId: string; count: number; price: number };
  'vendor.sold': { vendorId: string; itemId: string; count: number; price: number };
  /** The inventory, from `takeGold(n, reason)` whenever gold was taken; `total` is what remains. */
  'gold.spent': { amount: number; reason: GoldSpendReason; total: number };
  /** Thread 21: the act's mini-ending. */
  'act.ended': { act: number; endingId: string };
}

/** Why gold left the pouch (`inventory.takeGold(n, reason)`, v0.5). */
export type GoldSpendReason = 'bribe' | 'respec' | 'vendor' | 'inn' | 'persuasion' | 'theft' | 'death' | 'script';

export type GameEventType = keyof GameEventMap;
export class GameEvents extends EventBus<GameEventMap> {}
