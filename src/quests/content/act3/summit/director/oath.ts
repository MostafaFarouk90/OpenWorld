// M34 (K13 PR 2): the swear and companions scenes, the ledge flag (the updraft's launch), and the rekindle recheck. Ysmeryth's poses are the talk prompt's
// and the load's (reveal.ts).
import type { Kit } from './shared';
import { distanceTo, offerScene, recheck } from './shared';
import { M34_COMPANIONS_NPC, M34_COMPANIONS_SCENE, M34_LEDGE, M34_SWEAR_NPC, M34_SWEAR_SCENE } from '../m34.quest';
import { ysmeryth } from './shared';

export const LEDGE_ANCHOR = 'dragonspine.glide.hearth-updraft.launch';
export const LEDGE_REACH = 8;

export function installM34(k: Kit): void {
  offerScene(k, { quest: 'm34', objective: 'swear', scene: M34_SWEAR_SCENE, npc: M34_SWEAR_NPC });
  offerScene(k, { quest: 'm34', objective: 'companions', scene: M34_COMPANIONS_SCENE, npc: M34_COMPANIONS_NPC });
  k.on('dialogue.ended', (e) => {
    if (e.dialogueId === M34_COMPANIONS_SCENE) k.later(() => ysmeryth(k)?.pose('land'));
  });
  k.every(30, () => {
    if (!k.active('m34') || k.flag(M34_LEDGE) || !k.objCurrent('m34', 'ledge') || distanceTo(k, LEDGE_ANCHOR) > LEDGE_REACH) return;
    k.set(M34_LEDGE);
    k.emit(M34_LEDGE);
    k.later(() => recheck(k));
  });
  // K9 lights the Hearth: a rekindle (or its flag) is read by a recheck
  const again = (): void => void k.later(() => recheck(k));
  k.on('shrine.rekindled', again);
  k.on('flag.changed', (e) => { if (e.key.startsWith('shrine.')) again(); });
  k.on('quest.completed', (e) => { if (e.questId === 'm34') ysmeryth(k)?.pose('perch'); });
}
