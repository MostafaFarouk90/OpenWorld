import { flagConditionHolds, type FlagCondition, type FlagReader } from '../core/flagCondition';
import { CLASS_IDS, type ClassId } from '../actors/classes';
import type { ClassBaseStats } from '../progression/classStats';
import type { ClassKit, DrillStepDef } from './types';
import { ACT4_TRAINER_POSTS } from '../economy/refugePosts.act4';
import { ACT5_TRAINER_POSTS } from '../economy/rimCamp.act5';
import { AFTER_KNIGHT_DESK, rowHoldsAfterEnding } from '../afterEnding/posts';

/**
 * Which classes M07 offers (Mostafa's default: all five at tiers 1 and 2). "Knight plus one" is a one-line change here; the
 * others then stay unavailable and their trainers say "come back later" (thread 6's lines).
 */
export const CLASSES_OFFERED: readonly ClassId[] = CLASS_IDS;

/**
 * Design 9 base rows of the four new classes; the Knight's is built into progression. Threads 13 to 16 do not register stats.
 * Base Ember is 100 for every class (the coordinator's Knight ruling applied uniformly, over design 9's per-class column).
 */
export const CLASS_STATS: Readonly<Record<Exclude<ClassId, 'knight'>, ClassBaseStats>> = {
  warden: { health: 150, healthPerLevel: 14, stamina: 90, ember: 100 },
  emberwright: { health: 85, healthPerLevel: 6, stamina: 80, ember: 100 },
  ashblade: { health: 95, healthPerLevel: 7, stamina: 120, ember: 100 },
  pathfinder: { health: 100, healthPerLevel: 8, stamina: 110, ember: 100 },
};

/** The spars of the block and dodge steps (spawnerDefs.ts, the tutorial Replay board's moves). */
export const DRILL_SPARS = {
  blocker: { spawnerId: 'classes.drill.blocker', moves: ['soldier.chop'] },
  dodge: { spawnerId: 'classes.drill.dodge', moves: ['wraith.sweep'] },
} as const;

/**
 * About four minutes (design item 87): keys 1 to 4, block, dodge, a skill and the ability bar. The `skills` step runs only
 * when the class has registered tier skills and the player can buy one; the `ability` step runs only when something sits on
 * the ability bar when it is reached (learning an active skill in the step before slots it). A class with no skills yet, or
 * a player who buys a passive, passes over them; a class thread that wants them always may pass its own `drill` on its kit.
 */
export const DEFAULT_DRILL: readonly DrillStepDef[] = [
  { id: 'attack1', mechanic: 'attack1', action: 'attack1', count: 3 },
  { id: 'attack2', mechanic: 'attack2', action: 'attack2', count: 3 },
  { id: 'attack3', mechanic: 'attack3', action: 'attack3', count: 2 },
  { id: 'attack4', mechanic: 'attack4', action: 'attack4', count: 2 },
  { id: 'block', mechanic: 'block', action: 'block', count: 2, spar: DRILL_SPARS.blocker },
  { id: 'dodge', mechanic: 'dodge', action: 'dodge', count: 3, spar: DRILL_SPARS.dodge },
  { id: 'skills', mechanic: 'skills', action: 'skills', count: 1 },
  { id: 'ability', mechanic: 'ability', action: 'ability1', count: 1 },
];

const kit = (k: ClassKit): ClassKit => k;

/**
 * The reference kits. Knight is complete; the other four are thin defaults (model, the weapons built into their glb,
 * trainer, starter gear) until threads 13 to 16 register theirs. Weapon assets from PR #34 (`axe_2handed.gltf`, `staff.gltf`,
 * `dagger.gltf`, `crossbow_2handed.gltf`) can be named in `asset` once they have manifest entries.
 */
export const DEFAULT_KITS: Readonly<Record<ClassId, ClassKit>> = {
  knight: kit({
    classId: 'knight',
    nameKey: 'classes.name.knight',
    model: 'knight',
    mainhand: { embedded: '1H_Sword', asset: 'sword' },
    offhand: { embedded: 'Round_Shield', asset: 'shieldRound' },
    trainer: { npcId: 'gaut', nameKey: 'classes.trainer.gaut' },
    // The Squire's set from the tutorial; nothing new is granted, the owned pieces are re-equipped.
    starter: { items: [], equip: ['squires-arming-sword', 'wooden-round-shield', 'gauts-spare-tabard'] },
  }),
  warden: kit({
    classId: 'warden',
    nameKey: 'classes.name.warden',
    model: 'barbarian',
    mainhand: { embedded: '2H_Axe' },
    offhand: null,
    trainer: { npcId: 'stane', nameKey: 'classes.trainer.stane' },
    starter: {
      items: [
        { itemId: 'woodcutters-axe', count: 1 },
        { itemId: 'hide-jerkin', count: 1 },
      ],
      equip: ['woodcutters-axe', 'hide-jerkin'],
    },
  }),
  emberwright: kit({
    classId: 'emberwright',
    nameKey: 'classes.name.emberwright',
    model: 'mage',
    mainhand: { embedded: '2H_Staff' },
    offhand: null,
    trainer: { npcId: 'pennard', nameKey: 'classes.trainer.pennard' },
    starter: {
      items: [
        { itemId: 'apprentices-staff', count: 1 },
        { itemId: 'wool-robe', count: 1 },
      ],
      equip: ['apprentices-staff', 'wool-robe'],
    },
  }),
  ashblade: kit({
    classId: 'ashblade',
    nameKey: 'classes.name.ashblade',
    model: 'rogue',
    mainhand: { embedded: 'Knife' },
    offhand: null,
    offhandVisual: { embedded: 'Knife_Offhand' },
    trainer: { npcId: 'gerta', nameKey: 'classes.trainer.gerta' },
    starter: {
      items: [
        { itemId: 'alley-knives', count: 1 },
        { itemId: 'leather-vest', count: 1 },
      ],
      equip: ['alley-knives', 'leather-vest'],
    },
  }),
  pathfinder: kit({
    classId: 'pathfinder',
    nameKey: 'classes.name.pathfinder',
    model: 'rogueHooded',
    mainhand: { embedded: '2H_Crossbow' },
    offhand: null,
    trainer: { npcId: 'ashdown', nameKey: 'classes.trainer.ashdown' },
    starter: {
      // Bolts are thread 6's item; they are added only once it is defined (classes.service.ts), thread 16 confirms the count.
      items: [
        { itemId: 'hunting-crossbow', count: 1 },
        { itemId: 'rangers-cloak', count: 1 },
        { itemId: 'crossbow-bolts', count: 20 },
      ],
      equip: ['hunting-crossbow', 'rangers-cloak'],
    },
  }),
};

/** Interactable id of a trainer (`trainer:<npcId>`). */
export const trainerId = (k: Pick<ClassKit, 'trainer'>): string => `trainer:${k.trainer.npcId}`;
/** The trainer's fixed post (thread 17, about 2.5 m from the NPC's Bastion post). */
export const trainerAnchor = (k: Pick<ClassKit, 'trainer'>): string => `harrowmark.bastion.trainer.${k.trainer.npcId}`;
/** Where the NPC stands while it trains (thread 17). */
export const npcBastionPost = (k: Pick<ClassKit, 'trainer'>): string => `npc-post.${k.trainer.npcId}.bastion`;
export const YARD_ANCHOR = 'harrowmark.bastion.yard';

// ---- v0.8 item 10: trainer posts that move by flag ----

/**
 * A trainer post row. Without `classId`: NPC `npcId` (a shipped trainer) teaches at `post` while `when` holds. With
 * `classId`: that class's desk is taught by `npcId` at `post` while `when` holds (L7: Rook takes the Knight desk at the
 * refuge from M41, after Gaut retires). The desk's interactable is `trainer:<npcId>` and stands at `post`; the NPC must
 * stand within TRAINER_POST_RADIUS of `post` for it to open. The last row that holds wins.
 */
export interface TrainerPostRow {
  classId?: ClassId;
  npcId: string;
  /** The desk's anchor (and the post the NPC must stand at). */
  post: string;
  when: FlagCondition;
  /** The desk's name key; default the class kit's trainer name (with `classId`, give the NPC's own). */
  nameKey?: string;
}

/** Act 4 threads add their rows. L7: the refuge desks from M41, Rook's Knight desk among them (economy/refugePosts.act4.ts). */
export const TRAINER_POSTS: TrainerPostRow[] = [...ACT4_TRAINER_POSTS, ...ACT5_TRAINER_POSTS];

export interface TrainerPlacement {
  npcId: string;
  /** The interactable id, `trainer:<npcId>`. */
  interactableId: string;
  /** Where the desk stands. */
  deskAnchor: string;
  /** Where the NPC must stand (null: no check, as the shipped desks when the NPC post is missing). */
  postAnchor: string;
  nameKey: string;
  /** True for a moved or taken-over desk (a TRAINER_POSTS row), false for the shipped Bastion desk. */
  moved: boolean;
}

/** Where class `id`'s desk is now, for the flags. */
export function trainerPlacement(kit: Pick<ClassKit, 'classId' | 'trainer'>, flags: FlagReader, rows: readonly TrainerPostRow[] = TRAINER_POSTS): TrainerPlacement {
  let hit: TrainerPostRow | null = null;
  for (const r of rows) {
    const mine = r.classId ? r.classId === kit.classId : r.npcId === kit.trainer.npcId;
    // N13 (afterEnding/posts.ts): the refuge and Rim Camp desks go home after the ending.
    if (mine && flagConditionHolds(r.when, flags) && rowHoldsAfterEnding(r.post, r.npcId, flags)) hit = r;
  }
  // N13: Gaut is retired, so after the ending Rook keeps the Knight desk, at Gaut's own Bastion desk.
  if (!hit && kit.classId === AFTER_KNIGHT_DESK.classId && flagConditionHolds(AFTER_KNIGHT_DESK.when, flags)) hit = AFTER_KNIGHT_DESK;
  if (!hit) {
    return { npcId: kit.trainer.npcId, interactableId: trainerId(kit), deskAnchor: trainerAnchor(kit), postAnchor: npcBastionPost(kit), nameKey: kit.trainer.nameKey, moved: false };
  }
  return { npcId: hit.npcId, interactableId: `trainer:${hit.npcId}`, deskAnchor: hit.post, postAnchor: hit.post, nameKey: hit.nameKey ?? kit.trainer.nameKey, moved: true };
}
export const availableFlag = (id: ClassId): string => `classes.available.${id}`;
/** Written by thread 6 at M07 o4: the trainers take pupils. */
export const CLASS_OPEN_FLAG = 'story.m07.classOpen';
/** Mirror of `classes.chosen()` for quest conditions. */
export const CHOSEN_FLAG = 'classes.chosen';
/** Mirror of `classes.drillOutcome(id)`: 'done' | 'skipped'. */
export const drillFlag = (id: ClassId): string => `classes.drill.${id}`;
