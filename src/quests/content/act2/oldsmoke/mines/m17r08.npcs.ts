// The minor cast of M17 and R08 (plan section 3.0): additive defs and specs, in the shape of src/oldsmoke/npcDefs.ts. The
// dialogue trees (`npc-<id>`) are in src/dialogue/content/act2/oldsmoke/mines/m17r08.dialogue.ts. Slagg is A4's.
import type { NpcDef, NpcModelId } from '../../../../../npcs/types';
import type { NpcSpec } from '../../../../../region/layoutTypes';
import { R08_LAID_FLAG } from './r08.quest';

const def = (id: string, model: NpcModelId, extra: { scale?: number; tint?: number | null } = {}): NpcDef => ({
  id, nameKey: `npc.${id}.name`, model, scale: extra.scale ?? 1, tint: extra.tint ?? null, dialogueId: `npc-${id}`, idleClip: 'Idle',
});

const GHOST = 0x9fc4d8;
const SOOT = 0x5a5048;

export const M17R08_NPC_DEFS: NpcDef[] = [
  def('winch-wright', 'barbarian', { scale: 1.02, tint: 0x7a6a50 }),
  def('miner-hale', 'barbarian', { scale: 0.98, tint: SOOT }),
  def('miner-brig', 'barbarian', { scale: 1.0, tint: 0x6a5e50 }),
  // The ghosts take a pale tint on existing models; a ghost shader is the integrator's to add where it exists.
  def('pickett', 'barbarian', { scale: 1.04, tint: GHOST }),
  def('shift-crew', 'barbarian', { scale: 0.98, tint: GHOST }),
];

export const M17R08_NPC_STRINGS: Record<string, string> = {
  'npc.winch-wright.name': 'Winch-wright Ansel',
  'npc.miner-hale.name': 'Hale, Trapped Miner',
  'npc.miner-brig.name': 'Brig, Trapped Miner',
  'npc.pickett.name': 'Burel Pickett',
  'npc.shift-crew.name': "Pickett's Crew",
};

/**
 * Layout NPC specs on A4's anchors. The trapped miners stand at the surface only once they have been carried down to the
 * lift (the carry figure is their body below); Pickett's ghost goes when R08 lays him to rest.
 */
export const M17R08_NPCS: NpcSpec[] = [
  { id: 'winch-wright', post: 'oldsmoke.shaft.head' },
  { id: 'miner-hale', post: 'oldsmoke.shaft.door', presentWhen: 'story.m17.miner1.delivered' },
  { id: 'miner-brig', post: 'oldsmoke.shaft.lift.top', presentWhen: 'story.m17.miner2.delivered' },
  { id: 'pickett', post: 'oldsmoke.old.lift', absentWhen: R08_LAID_FLAG },
  { id: 'shift-crew', post: 'oldsmoke.old.task.bell', absentWhen: R08_LAID_FLAG },
];
