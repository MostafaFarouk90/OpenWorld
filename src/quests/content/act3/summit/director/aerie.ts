// D06 (K13 PR 2): the glide down and the landing, the keep and the courtyard, K8's Skarl and what follows. K8 owns the fight and its favour (D06 pays no
// Skarl favour); K10 pays the shard-gem from `boss.spared` / `boss.defeated` and again on a load, so D06 does not. The director gives K8's arm gate the
// courtyard flag, stages a spared Skarl and his two lodge hunters, and defines Thorgar's two summit posts.
import { heightAt } from '../../../../../terrain/heightfield';
import { setSkarlArmFlag } from '../../../../../bosses/skarl/armGate';
import type { Kit, Off } from './shared';
import { distanceTo, offerScene, recheck, toast } from './shared';
import {
  D06_COURTYARD_CLEAR, D06_GATE_OPEN, D06_HAWK_FLAG, D06_LANDED, D06_LED_OFF, D06_LINES_NPC, D06_LINES_SCENE, D06_LIP_NPC, D06_LIP_SCENE, D06_OUTCOME_NPC,
  D06_OUTCOME_SCENE, D06_SKARL_OUTCOME,
} from '../d06.quest';
import { D06_SPARED_SCENE } from '../npcs';
import { D06_THORGAR_POST, M34_THORGAR_POST } from '../postRules';

export const LANDING = 'dragonspine.aerie.landing';
export const LEDGE = 'dragonspine.glide.summit-aerie.launch';
export const ARRIVAL_TRIGGER = 'trg.dragonspine.aerie.arrival';
/** Metres (x, z) from the landing mark within which a glide's landing counts. */
export const LAND_RADIUS = 40;
export const LIP_NEAR = 40;
/** Polls (half a second) between Skarl's yield and his escort arriving. */
export const STAGE_POLLS = 6;

export function installD06(k: Kit): Off {
  const { ctx } = k;
  const offs: Off[] = [];

  // K8's Skarl waits for the courtyard (default off: K8 alone arms on `story.d06.started`).
  offs.push(setSkarlArmFlag(D06_COURTYARD_CLEAR));

  // Thorgar's two summit posts (the post rules name them; K4's layout has no anchor for them).
  const define = (id: string, p: { x: number; y: number; z: number }, yaw: number): void => {
    if (!ctx.anchors.find(id)) offs.push(ctx.anchors.define({ id, position: p, yaw, tags: ['npc-post'] }));
  };
  const ledge = ctx.anchors.find(LEDGE);
  if (ledge) {
    const side = { x: Math.cos(ledge.yaw), z: -Math.sin(ledge.yaw) };
    define(D06_THORGAR_POST, { x: ledge.position.x + side.x * 2.4, y: ledge.position.y, z: ledge.position.z + side.z * 2.4 }, ledge.yaw);
  } else k.warn(`summit director: no ${LEDGE} anchor for Thorgar's post`);
  const eadgyth = ctx.anchors.find('dragonspine.hearth.eadgyth');
  if (eadgyth) {
    const x = eadgyth.position.x + 4;
    define(M34_THORGAR_POST, { x, y: heightAt(x, eadgyth.position.z), z: eadgyth.position.z }, eadgyth.yaw);
  } else k.warn("summit director: no hearth anchor for Thorgar's post");

  // ---- Landing: a glide that lands on the shelf, or standing in the arrival volume on foot -------------------------------------
  k.on('glide.landed', (e) => {
    if (!k.active('d06') || k.flag(D06_LANDED)) return;
    const a = ctx.anchors.find(LANDING);
    if (!a || Math.hypot(e.at.x - a.position.x, e.at.z - a.position.z) > LAND_RADIUS) return;
    k.set(D06_LANDED);
    toast(k, 'dragonspine.q.d06.landed');
    k.later(() => recheck(k));
  });
  k.every(30, () => {
    if (!k.active('d06') || k.flag(D06_LANDED)) return;
    if ((ctx.services.get('movementMode')?.current ?? 'walk') !== 'walk' || !ctx.triggers.isInside(ARRIVAL_TRIGGER)) return;
    k.set(D06_LANDED);
    toast(k, 'dragonspine.q.d06.landed');
    k.later(() => recheck(k));
  });

  // ---- Scenes ----------------------------------------------------------------------------------------------------------------------
  offerScene(k, { quest: 'd06', objective: 'lip', scene: D06_LIP_SCENE, npc: D06_LIP_NPC, ready: () => distanceTo(k, LEDGE) <= LIP_NEAR });
  offerScene(k, { quest: 'd06', objective: 'lines', scene: D06_LINES_SCENE, npc: D06_LINES_NPC });
  offerScene(k, { quest: 'd06', objective: 'outcome', scene: D06_OUTCOME_SCENE, npc: D06_OUTCOME_NPC, ready: () => k.str(D06_SKARL_OUTCOME) !== 'spared' || k.flag(D06_SPARED_SCENE) });

  k.on('flag.changed', (e) => {
    if (e.key === D06_GATE_OPEN && e.value === true && k.active('d06')) toast(k, 'dragonspine.q.d06.gate');
    if (e.key === D06_HAWK_FLAG && e.value === true && k.active('d06')) toast(k, 'dragonspine.q.d06.hawk');
    if (e.key === D06_SKARL_OUTCOME || e.key === D06_COURTYARD_CLEAR) k.later(() => recheck(k));
  });
  k.on('boss.spared', (e) => { if (e.bossId === 'corvin-skarl') k.later(() => recheck(k)); });
  k.on('boss.defeated', (e) => { if (e.bossId === 'corvin-skarl') k.later(() => recheck(k)); });

  // ---- A spared Skarl: two lodge hunters lead him off once the scene is done --------------------------------------------------
  let polls = 0;
  k.on('save.loaded', () => { polls = 0; });
  k.every(30, () => {
    if (!k.active('d06') || k.str(D06_SKARL_OUTCOME) !== 'spared' || k.flag(D06_SPARED_SCENE)) { polls = 0; return; }
    if (++polls >= STAGE_POLLS) k.set(D06_SPARED_SCENE);
  });
  k.on('dialogue.ended', (e) => {
    if (e.dialogueId === D06_OUTCOME_SCENE && k.flag(D06_SPARED_SCENE) && !k.flag(D06_LED_OFF)) k.set(D06_LED_OFF);
  });
  return () => { for (const o of offs.splice(0)) o(); };
}
