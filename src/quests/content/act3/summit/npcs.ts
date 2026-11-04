// The summit's own cast (K13 PR 2): the Skyhold rigger and handler, the captive hunter in the keep, and the two lodge hunters who lead a spared Skarl
// off. Dialogue trees are `npc-<id>` (src/dialogue/content/act3/summit). K4's layout holds their posts, so the dragonspine plugin does not register them:
// the summit director does, through the npcs service.
import type { NpcDef, NpcModelId } from '../../../../npcs/types';
import type { NpcSpec } from '../../../../region/layoutTypes';
import { D06_LED_OFF } from './d06.quest';

const def = (id: string, model: NpcModelId, extra: { scale?: number; tint?: number | null } = {}): NpcDef => ({
  id, nameKey: `npc.${id}.name`, model, scale: extra.scale ?? 1, tint: extra.tint ?? null, dialogueId: `npc-${id}`, idleClip: 'Idle',
});

const HUNTER = 0x3f6a3c;
/** Set by the director once Skarl is spared and the staging begins: the bound Skarl and his two escorts exist from then to D06's end. */
export const D06_SPARED_SCENE = 'story.d06.sparedStaged';

export const SUMMIT_NPC_DEFS: NpcDef[] = [
  def('skyhold-rigger', 'rogue', { tint: 0x7a6040 }),
  def('skyhold-handler', 'barbarian', { scale: 0.98, tint: 0x6a5a48 }),
  def('captive-hunter', 'rogue', { tint: HUNTER }),
  def('skarl-led', 'rogueHooded', { tint: 0x5a2a2a }),
  def('aerie-escort-1', 'barbarian', { tint: HUNTER }),
  def('aerie-escort-2', 'rogue', { tint: HUNTER }),
];

export const SUMMIT_NPC_STRINGS_EN: Record<string, string> = {
  'npc.skyhold-rigger.name': 'Net-Rigger',
  'npc.skyhold-handler.name': 'Wyrmling Handler',
  'npc.captive-hunter.name': 'Captive Hunter',
  'npc.skarl-led.name': 'Corvin Skarl',
  'npc.aerie-escort-1.name': 'Wyrmwatch Hunter',
  'npc.aerie-escort-2.name': 'Wyrmwatch Hunter',
};

/** Posts are K4's reserved anchors (and the keep's interior anchors, through a post rule). */
export const SUMMIT_NPCS: NpcSpec[] = [
  { id: 'skyhold-rigger', post: 'dragonspine.skyhold.rigger' },
  { id: 'skyhold-handler', post: 'dragonspine.skyhold.handler', presentWhen: 'story.m33.anchor5' },
  { id: 'captive-hunter', post: 'dragonspine.aerie.keep.door', presentWhen: 'story.d06.started' },
  { id: 'skarl-led', post: 'dragonspine.aerie.arena.skarl', presentWhen: D06_SPARED_SCENE, absentWhen: 'story.d06.complete', walkOff: { whenFlag: D06_LED_OFF, to: 'dragonspine.aerie.gate' } },
  { id: 'aerie-escort-1', post: 'dragonspine.aerie.arena.edge.4', presentWhen: D06_SPARED_SCENE, absentWhen: 'story.d06.complete', walkOff: { whenFlag: D06_LED_OFF, to: 'dragonspine.aerie.gate' } },
  { id: 'aerie-escort-2', post: 'dragonspine.aerie.arena.edge.3', presentWhen: D06_SPARED_SCENE, absentWhen: 'story.d06.complete', walkOff: { whenFlag: D06_LED_OFF, to: 'dragonspine.aerie.gate' } },
];
