/**
 * Local "port" interfaces for thread 5 (HUD, inventory, skills, prompts).
 *
 * The pure logic in src/inventory, src/progression, src/prompts and src/hud depends only on these
 * shapes, never on the core PR, so it compiles and tests before thread 0 lands. The *.plugin.ts adapters
 * map the real GameContext onto them. Contract shapes: plans/hud-inventory-skills.md sections 3, 4 and v2.
 */

export type EquipSlot = 'weapon' | 'offhand' | 'armour' | 'trinket';
export const EQUIP_SLOTS: readonly EquipSlot[] = ['weapon', 'offhand', 'armour', 'trinket'];

export interface ItemDef {
  id: string;
  nameKey: string;
  descKey: string;
  kind: 'weapon' | 'offhand' | 'armour' | 'trinket' | 'consumable' | 'quest';
  slot?: EquipSlot;
  /** 1 for gear. */
  stackMax: number;
  stats?: { attack?: number; defense?: number };
  use?: { healFraction?: number; healFlat?: number; drinkSeconds?: number };
  /** v0.6 (A10): gear tier 1..5; absent for non-gear. */
  gearTier?: 1 | 2 | 3 | 4 | 5;
}

export type EquipResult =
  | { ok: true; replaced?: string }
  | { ok: false; reason: 'not-owned' | 'unknown-item' | 'not-equippable' };

export type UseResult =
  | { ok: true; healed: number }
  | { ok: false; reason: 'not-owned' | 'unknown-item' | 'not-usable' | 'no-charges' | 'full-health' | 'busy' | 'dead' };

export interface InventoryKit {
  items: Record<string, number>;
  equipped: Partial<Record<EquipSlot, string>>;
}

export interface InventoryService {
  count(id: string): number;
  has(id: string): boolean;
  /** Returns the amount actually added (clamped by stackMax). Unknown ids add 0. */
  add(id: string, n: number): number;
  remove(id: string, n: number): boolean;
  equip(id: string): EquipResult;
  unequip(slot: EquipSlot): boolean;
  equipped(slot: EquipSlot): string | null;
  equippedStat(stat: 'attack' | 'defense'): number;
  use(id: string): UseResult;
  reset(kit: InventoryKit): void;
  items(): readonly { id: string; count: number }[];
  readonly gold: number;
  addGold(n: number): void;
  /** v0.5: emits `gold.spent { amount, reason, total }` when anything was taken (`reason` defaults to `'script'`). */
  takeGold(n: number, reason?: 'bribe' | 'respec' | 'vendor' | 'inn' | 'persuasion' | 'theft' | 'death' | 'script'): number;
  /** v0.6: an item's tempering (temper 0 when never tempered). */
  gear(itemId: string): { temper: number; affix?: string };
  /** v0.6: sets temper 0..5 (clamped) on a held item; false when unknown or not held. Does not emit (A10 emits `gear.tempered`). */
  setTemper(itemId: string, level: number, affix?: string): boolean;
}

export type LearnCheck =
  | { ok: true }
  | {
      ok: false;
      reason:
        | 'unknown-skill'
        | 'locked-tier'
        | 'no-points'
        | 'already-learned'
        | 'missing-prereq'
        | 'excluded'
        | 'unavailable';
    };

export type NextUnlock =
  | { kind: 'level'; remaining: number; level: number }
  | { kind: 'skill'; remaining: number; skillId: string }
  | { kind: 'none' };

export interface ProgressionService {
  readonly xp: number;
  readonly level: number;
  readonly skillPoints: number;
  xpToNext(): number;
  grantXp(amount: number, source: string): number;
  grantSkillPoint(n: number, reason: string): void;
  pauseKillXp(source: string): () => void;
  canLearn(id: string): LearnCheck;
  learn(id: string): LearnCheck;
  learned(id: string): boolean;
  bar(): readonly (string | null)[];
  assign(slot: number, skillId: string | null): boolean;
  addMaxHealthModifier(id: string, fn: () => number): () => void;
  baseMaxHealth(): number;
  /** Re-evaluates the max-health modifiers; call after a Burn or Scar change. */
  refreshMaxHealth(): void;
  /** The chosen class; null until the M07 choice (plays as the Knight). */
  readonly classId: string | null;
  /** Silent; thread 12's `classes.choose` emits `class.chosen`. */
  setClass(classId: string | null): void;
  /** Abilities granted outside the tree (the Leap): the flag `ability.<id>.learned` is the single source. */
  hasAbility(id: string): boolean;
  grantAbility(id: string, source: string): boolean;
  /** The only respec definition (thread 7 holds the permit, thread 8 shows the quote, thread 12 calls `respec` on a class change). */
  allowRespec(source: string): () => void;
  respecQuote(): { free: boolean; gold: number; canAfford: boolean };
  respec():
    | { ok: true; refunded: number; cost: number }
    | { ok: false; reason: 'no-permit' | 'no-gold' | 'nothing-learned' };
  /** Thread 12's M07 choice: refunds every learned skill silently, only while no class is chosen; returns the points. */
  refundForClassChoice(): number;
  /** Skills learned, in order. */
  learnedSkills(): readonly string[];
  nextUnlock(): NextUnlock;
}

export interface AbilityCaster {
  id: string;
}
export interface AbilityHandlerArgs<Ctx = unknown> {
  skillId: string;
  slot: number;
  caster: AbilityCaster;
  ctx: Ctx;
}
export type AbilityHandlerResult = { ok: true } | { ok: false; reason: string };
export type AbilityHandler<Ctx = unknown> = (args: AbilityHandlerArgs<Ctx>) => AbilityHandlerResult;

export type UseAbilityResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'empty-slot' | 'bad-slot' | 'cooldown' | 'no-ember' | 'dead' | 'handler-failed' | 'passive';
      detail?: string;
    };

export interface AbilitiesService {
  use(slot: number): UseAbilityResult;
  cooldown(slot: number): { remaining: number; total: number };
  registerHandler(skillId: string, handler: AbilityHandler): { ok: true; dispose(): void } | { ok: false; reason: 'duplicate' };
  reportTrigger(skillId: string): boolean;
}

/** Thread 7's spells service, reduced to what thread 5 reads. All optional: absent = no Ember rules. */
export interface SpellsPort {
  readonly burn: number;
  readonly scars?: number;
  readonly ember: number;
  readonly maxEmber: number;
  spendEmber(n: number): boolean;
}

/** The slice of Actor thread 5 reads or writes. */
export interface ActorPort {
  readonly id: string;
  readonly kind: string;
  readonly team: string;
  level: number;
  health: number;
  maxHealth: number;
  stamina: number;
  maxStamina: number;
  readonly dead: boolean;
  restoreStamina(n: number): void;
}

/** Event emitter port: the real bus satisfies this structurally. */
export interface EmitterPort {
  emit(type: string, payload: unknown): void;
}

/** Fixed-tick clock port: `tick` increases by 1 per simulated fixed tick (pauses and hit-stop do not advance it). */
export interface ClockPort {
  readonly tick: number;
}

export const FIXED_DT = 1 / 60;

export interface Logger {
  warn(msg: string): void;
}
export const consoleLogger: Logger = { warn: (m) => console.warn(m) };
