import { CLASS_IDS, type ClassId } from '../actors/classes';
import type { ClassBaseStats } from '../progression/classStats';
import type { ClassKit, DrillStepDef } from './types';

/**
 * Which classes M07 offers (Mostafa's default: all five at tiers 1 and 2). "Knight plus one" is a one-line change here; the
 * others then stay unavailable and their trainers say "come back later" (thread 6's lines).
 */
export const CLASSES_OFFERED: readonly ClassId[] = CLASS_IDS;

/** Design 9 base rows of the four new classes; the Knight's is built into progression. Threads 13 to 16 do not register stats. */
export const CLASS_STATS: Readonly<Record<Exclude<ClassId, 'knight'>, ClassBaseStats>> = {
  warden: { health: 150, healthPerLevel: 14, stamina: 90, ember: 20 },
  emberwright: { health: 85, healthPerLevel: 6, stamina: 80, ember: 100 },
  ashblade: { health: 95, healthPerLevel: 7, stamina: 120, ember: 40 },
  pathfinder: { health: 100, healthPerLevel: 8, stamina: 110, ember: 35 },
};

/** The spars of the block and dodge steps (spawnerDefs.ts, the tutorial Replay board's moves). */
export const DRILL_SPARS = {
  blocker: { spawnerId: 'classes.drill.blocker', moves: ['soldier.chop'] },
  dodge: { spawnerId: 'classes.drill.dodge', moves: ['wraith.sweep'] },
} as const;

/** About four minutes (design item 87): keys 1 to 4, block, dodge, a skill and the ability bar. */
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
export const availableFlag = (id: ClassId): string => `classes.available.${id}`;
/** Written by thread 6 at M07 o4: the trainers take pupils. */
export const CLASS_OPEN_FLAG = 'story.m07.classOpen';
/** Mirror of `classes.chosen()` for quest conditions. */
export const CHOSEN_FLAG = 'classes.chosen';
/** Mirror of `classes.drillOutcome(id)`: 'done' | 'skipped'. */
export const drillFlag = (id: ClassId): string => `classes.drill.${id}`;
