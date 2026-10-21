// Hrolf Ironbrow's look (design 8.1 and 14.2): the KayKit Barbarian with his one-handed axe shown, the round shield
// hidden and a red-brown tint for hair and beard. Exported for A3's `hrolf` NpcDef, as `tobbLook` is for Tobb's.
import type * as THREE from 'three';
import type { NpcDef } from '../npcs/types';
import type { CompanionLook } from './types';

export const HROLF_TINT = 0x8a4b2a;
/** Held items shown on Hrolf (the Barbarian rig carries them hidden by default). */
export const HROLF_SHOW: readonly string[] = ['1H_Axe'];
export const HROLF_HIDE: readonly string[] = ['Barbarian_Round_Shield'];

/** Shows the axe and hides the shield; returns whether the axe was found. */
export function applyHrolfGear(model: THREE.Object3D): boolean {
  let axe = false;
  model.traverse((o) => {
    if (HROLF_SHOW.some((n) => o.name === n || o.name.startsWith(`${n}_`))) {
      o.visible = true;
      axe = true;
    } else if (HROLF_HIDE.some((n) => o.name === n || o.name.startsWith(`${n}_`))) {
      o.visible = false;
    }
  });
  return axe;
}

export const HROLF_NPC_DEF: NpcDef = {
  id: 'hrolf',
  nameKey: 'companion.hrolf.name',
  model: 'barbarian',
  scale: 1.05,
  tint: HROLF_TINT,
  dialogueId: 'npc-hrolf',
  idleClip: 'Idle',
  decorate: (m) => void applyHrolfGear(m),
};

export const HROLF_LOOK: CompanionLook = {
  npcDef: HROLF_NPC_DEF,
  clips: { attack: ['1H_Melee_Attack_Chop', '2H_Melee_Attack_Chop'], kneel: ['Sit_Floor_Down'] },
};
