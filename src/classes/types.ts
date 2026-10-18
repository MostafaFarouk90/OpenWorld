import type { ClassId, ClassResult } from '../actors/classes';
import type { ItemStack } from '../core/events';

/** A character model of the KayKit Adventurers pack (an `AssetManifest` id). */
export type ClassModelId = 'knight' | 'barbarian' | 'mage' | 'rogue' | 'rogueHooded';

/** What a kit holds in one hand. */
export interface KitWeapon {
  /** Name of the weapon mesh built into the character glb on that hand slot (three's name, e.g. `2H_Axe`). */
  embedded: string;
  /** Optional separate weapon asset (an `AssetManifest` id, e.g. from PR #34) that replaces the embedded mesh when it loads. */
  asset?: string;
}

/** Mechanics the drill counts through `prompts.count` (the ones combat, skills and abilities report). */
export type DrillMechanic = 'attack1' | 'attack2' | 'attack3' | 'attack4' | 'block' | 'dodge' | 'skills' | 'ability';

export interface DrillStepDef {
  /** Unique in its drill; the default text key is `classes.drill.<classId>.<id>`, falling back to `classes.drill.default.<id>`. */
  id: string;
  mechanic: DrillMechanic;
  /** The input action the prompt names (`attack1`, `block`, `dodge`, `skills`, `ability1`, ...). */
  action: string;
  /** Successes needed (at least 1). */
  count: number;
  textKey?: string;
  /** Spawns this manual spawner (sparring partner) while the step runs; `block` and `dodge` need one. */
  spar?: { spawnerId: string; moves?: readonly string[] };
}

/**
 * One class's kit (design 9): its look, its trainer and starter gear and its M07 drill. The Knight's and the thin default
 * kits of the other four live in `kits.ts`; threads 13 to 16 replace theirs with `classes.registerKit`.
 */
export interface ClassKit {
  classId: ClassId;
  /** Display name of the class (`classes.name.<id>`). */
  nameKey: string;
  model: ClassModelId;
  mainhand: KitWeapon;
  /** Null for two-handed and dual kits (the guard then has no shield). */
  offhand: KitWeapon | null;
  /** Off-hand visuals that are not a shield (the Ashblade's second knife, the Emberwright's book). */
  offhandVisual?: KitWeapon;
  /** Offset of the weapon tip marker from the grip, in the weapon's local space; default: the top of its bounds on +Y. */
  tip?: { x: number; y: number; z: number };
  trainer: {
    /** `trainer:<npcId>`; also the NPC whose post gates the trainer. */
    npcId: string;
    nameKey: string;
  };
  /** Granted once, the first time the player takes this class; the weapon and armour are equipped. */
  starter: { items: readonly ItemStack[]; equip: readonly string[] };
  /** Overrides the default drill. */
  drill?: readonly DrillStepDef[];
}

export type RegisterKitResult = { ok: true; dispose(): void } | { ok: false; reason: 'bad-class' | 'bad-kit' };

export type DrillOutcome = 'done' | 'skipped';

export interface DrillState {
  classId: ClassId;
  /** 0-based index of the current step. */
  step: number;
  steps: number;
  textKey: string;
  /** Successes so far on the current step and how many it needs. */
  progress: number;
  required: number;
}

export type ChangeQuote =
  | { ok: true; free: boolean; gold: number; canAfford: boolean }
  | Exclude<ClassResult, { ok: true }>;

declare module '../actors/classes' {
  /** Thread 12's additions (plans/slice-2-class-system.md section 2). */
  interface ClassesService {
    /** The flag `classes.available.<id>`: open while M07 is active or done. */
    available(id: ClassId): boolean;
    kit(id: ClassId): Readonly<ClassKit> | undefined;
    registerKit(kit: ClassKit): RegisterKitResult;
    /** What `change(id)` would cost now ("free" too when nothing is learned). */
    changeQuote(id: ClassId): ChangeQuote;
    /** The running drill, or null. */
    drill(): DrillState | null;
    /** Starts (or replays) the drill of the current class; false before the choice or while one runs. */
    startDrill(): boolean;
    /** Ends the running drill as `skipped`; false when none runs. */
    skipDrill(): boolean;
    drillOutcome(id: ClassId): DrillOutcome | null;
  }
}

declare module '../core/events' {
  interface GameEventMap {
    /** Thread 6's optional "Train" dialogue choice: opens the trainer menu of that class. */
    'classes.trainer.open': { classId: ClassId };
  }
}
