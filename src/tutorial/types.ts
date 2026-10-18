/**
 * Shared types of the Knighting Day director (plans/knighting-day-integration.md sections 3 and 9).
 * Pure: no three.js, no DOM. The plugin adapts the merged services to `DirectorPorts`.
 */
import type { DialogueEndReason } from '../core/events';

export const BEAT_IDS = [
  't01', 't02', 't03', 't04', 't05', 't06', 't07', 't08', 't09', 't10', 't11', 't12', 't13', 't14', 't15', 'skirmish',
] as const;
export type BeatId = (typeof BEAT_IDS)[number];

/** full = every beat; veteran = T06 to T11 collapse into `skirmish`; kettlewick = replay start at T15. */
export type TutorialMode = 'full' | 'veteran' | 'kettlewick';

export interface Vec2 {
  x: number;
  z: number;
}
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

// ---- events the director routes to goals -----------------------------------------------------------

/** Bus events normalised by the plugin; goals only ever see these. */
export type DirectorEvent =
  | { type: 'trigger'; id: string }
  | { type: 'kill'; actorId: string; kind: string; spawnTag: string | undefined; byPlayer: boolean }
  | { type: 'mercy'; actorId: string | undefined; creature: string; spawnTag: string | undefined }
  | { type: 'groupCleared'; spawnerId: string }
  | { type: 'blocked' }
  | { type: 'dodged' }
  /** A player hit that dealt damage; `slot` 1..4 from the attack clip, 0 for anything else (Surge). */
  | { type: 'hit'; slot: 0 | 1 | 2 | 3 | 4; targetId: string; killed: boolean }
  | { type: 'lockon'; targetId: string | null }
  | { type: 'equipped'; slot: string; itemId: string | null }
  | { type: 'itemUsed'; itemId: string }
  | { type: 'questCompleted'; questId: string }
  | { type: 'learned'; skillId: string }
  | { type: 'abilityUsed'; skillId: string }
  | { type: 'skillTriggered'; skillId: string }
  | { type: 'rekindled'; waystoneId: string }
  | { type: 'fastTravel'; fromId: string; toId: string }
  | { type: 'spellReleased'; spellId: string }
  | { type: 'rest'; waystoneId: string }
  | { type: 'interact'; id: string }
  | { type: 'vowComplete' }
  | { type: 'dialogueEnded'; dialogueId: string; reason: DialogueEndReason | undefined }
  | { type: 'modal'; id: string; open: boolean };

/** Per-tick sample for goals that measure motion or gaze. */
export interface TickSample {
  dt: number;
  feet: Vec3;
  /** Sprint held and the player moving this tick. */
  sprinting: boolean;
  moving: boolean;
  /** Camera world position and unit forward; null headless. */
  camera: { position: Vec3; forward: Vec3 } | null;
}

/** Read-only world state, for goals that consume one-shot changes (review change 2). */
export interface StateQuery {
  equipped(slot: string): string | null;
  learned(skillId: string): boolean;
  isLit(waystoneId: string): boolean;
  flag(key: string): boolean;
  anchor(id: string): Vec3 | null;
  questState(id: string): 'inactive' | 'active' | 'completed' | 'failed';
}

// ---- goal specs (data in beats.ts) ----------------------------------------------------------------

export type GoalSpec =
  /** Player enters the trigger. */
  | { kind: 'trigger'; id: string }
  /** `count` deaths (or mercies) of `creature` with exactly `spawnTag`, killed by the player. */
  | { kind: 'kill'; creature: string; spawnTag: string; count: number }
  /** The flag is true (checked at start and on every tick). */
  | { kind: 'flag'; key: string }
  /** Gaze at each anchor in order: camera forward within `degrees` of it for `dwell` seconds. */
  | { kind: 'gaze'; anchors: string[]; degrees: number; dwell: number }
  /** Count of a simple event. */
  | { kind: 'count'; event: 'blocked' | 'dodged'; count: number }
  /** `count` separate sprint segments of at least `meters` each. */
  | { kind: 'sprint'; meters: number; count: number }
  /** Land each of `slots` once, then a `chain` of player hits each within `window` s of the last. */
  | { kind: 'attacks'; slots: number[]; chain: number; window: number }
  /** Lock on, swap once, then `kills` kills of the lock target at the killing hit. */
  | { kind: 'lockSwap'; kills: number }
  /** Every listed item is equipped in its slot (read from state at start, then events). */
  | { kind: 'equipped'; items: { slot: string; itemId: string }[] }
  /** Any consumable used once. */
  | { kind: 'consume' }
  | { kind: 'quest'; questId: string }
  /** A tier-1 skill learned and then used (active) or triggered (passive). See `passiveSkills`. */
  | { kind: 'skill'; actives: string[]; passives: string[] }
  | { kind: 'lit'; waystoneId: string }
  | { kind: 'travel' }
  | { kind: 'spell'; spellId: string }
  | { kind: 'rest' }
  | { kind: 'interact'; id: string }
  /** The T04 vow: `tutorial.vow.complete`, or `dialogue.ended` of the dialogue with any reason. */
  | { kind: 'vow'; dialogueId: string }
  /** All listed spawner groups cleared (enemies.groupCleared, or nothing alive after a spawn). */
  | { kind: 'cleared'; spawnerIds: string[] };

/** One goal's live tracker (goals.ts). `progress` is a single number so it can be saved. */
export interface GoalTracker {
  readonly spec: GoalSpec;
  readonly done: boolean;
  readonly progress: number;
  onEvent(e: DirectorEvent): void;
  tick(s: TickSample, q: StateQuery): void;
  /** Re-reads state at (re)start; called after `restore`. */
  sync(q: StateQuery): void;
  restore(progress: number): void;
  /**
   * Goal-specific detail: `gaze` the anchor id currently targeted, `skill` the learned skill id
   * (so the director can tell a pending passive), otherwise null.
   */
  detail(): string | null;
}

// ---- beat definitions (data in beats.ts) -----------------------------------------------------------

export interface SpawnSpec {
  spawnerId: string;
  moves?: string[];
  healthScale?: number;
  aggro?: boolean;
}

export interface PromptSpec {
  /** Mechanic name of the prompts service (PromptManager MECHANICS). */
  mechanic: string;
  action: string;
  textKey: string;
}

export interface BeatDef {
  id: BeatId;
  /** Beat quest registered or owned by thread 3. */
  questId: string;
  startAnchor: string;
  /** NPC id -> anchor id. */
  npcs?: Record<string, string>;
  /** Crisis beats re-arm Second Wind and may spawn enemies. */
  crisis?: boolean;
  /** Verbs unlocked from this beat on (the lock set shrinks as beats start). */
  unlocks?: string[];
  /** Verbs locked only during this beat (T05: attack 1 only). */
  extraLocks?: string[];
  prompts?: PromptSpec[];
  /** Spawn waves; wave i spawns when step `waveSteps[i]` begins (default: wave i at step i). */
  waves?: SpawnSpec[][];
  waveSteps?: number[];
  /**
   * Steps run in order; every goal of a step must be done. A combat beat ends with a
   * `cleared` step; if its groups clear before the earlier steps are done, they refill.
   */
  steps: GoalSpec[][];
  /** Subtitle line keys shown at start. */
  lines?: string[];
  /** Whether this beat starts inside the cutscene. */
  cutscene?: 'knighting' | 'crack';
}

// ---- ports ----------------------------------------------------------------------------------------

export interface SkipRewardsCtx {
  /** True when this reward was already given (idempotent skips, review change 9). */
  has(rewardId: string): boolean;
}

/** Everything the director does to the world; every call is optional-service safe in the plugin. */
export interface DirectorPorts {
  readonly state: StateQuery;
  warn(message: string): void;
  now(): number;

  // flags
  setFlag(key: string, value: boolean | string | number): void;

  // quests and dialogue
  startQuest(id: string): void;
  completeQuest(id: string): void;
  completeObjective(questId: string, objectiveId: string): void;
  startVow(): boolean;
  closeVow(): void;
  vowOpen(): boolean;

  // world
  teleport(anchorId: string): void;
  placeNpc(npcId: string, anchorId: string): void;
  spawn(spec: SpawnSpec): string[];
  despawn(spawnerId: string): void;
  resetGroup(spawnerId: string): void;
  alive(spawnerId: string): number;
  /** The player is inside the trigger volume as of the last fixed update. */
  playerInTrigger(triggerId: string): boolean;

  // player
  setLocks(actions: readonly string[]): void;
  reArm(charges: number): void;
  playerHealthFraction(): number;
  /** Non-lethal unblockable script hit of `fraction` of max health (T12 smoke). */
  smokeHit(fraction: number): void;
  healFull(): void;
  /** Fade, teleport to the anchor, fade in; resolves when done. */
  fadeTeleport(anchorId: string): Promise<void>;

  // progression and items
  /** `reason` names the kill-XP pause: 'tutorial' for the run, 'tutorial.replay' for Replay drills. */
  holdKillXp(on: boolean, reason?: string): void;
  level(): number;
  grantLevelTwo(): void;
  grantItems(sourceId: string, items: { itemId: string; count: number }[]): void;
  equip(itemId: string): void;
  resetToStarterKit(): void;
  hasConsumable(): boolean;
  rekindle(waystoneId: string): void;

  // presentation
  showPrompt(p: PromptSpec): void;
  /** Successes so far of a prompt mechanic (veteran skirmish shows only unused verbs). */
  promptCount(mechanic: string): number;
  hidePrompts(): void;
  showLine(key: string): void;
  toast(key: string): void;
  cutscene(kind: 'knighting' | 'crack' | null): void;
  crackEffects(): void;
  emitBeat(beatId: BeatId, state: 'started' | 'completed' | 'skipped'): void;
  recordCompletion(): void;
}

export interface DirectorSave {
  mode: TutorialMode;
  beat: BeatId | null;
  finished: BeatId[];
  skipped: BeatId[];
  /** Goal progress of the current beat, keyed `<step>.<goal>`, plus `step` and `wave`. */
  progress: Record<string, number>;
  /** A passive learned at T13 that has not triggered yet. */
  t13PendingPassive: string | null;
  kitGranted: boolean;
  complete: boolean;
}
