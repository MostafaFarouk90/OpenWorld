// M32 and Ysmeryth at the Hearth (K13 PR 2): her talk prompt and poses, the vision hold over the keeper-stone, the scene offers, the quest's
// flag written only after the last scene has ended and she has perched, and Keeper's Understanding (Burn cools twice as fast on foot, walking).
import type { Vec3Like } from '../../../../../core/events';
import type { Kit, Off } from './shared';
import { offerScene, toast, ysmeryth } from './shared';
import { m34 } from '../m34.quest';
import type { YsmerythPose } from '../../../../../enemies/wyrm/ysmeryth/scene';
import {
  M32_AXE_NPC, M32_AXE_SCENE, M32_COMPANIONS_NPC, M32_COMPANIONS_SCENE, M32_COMPLETE, M32_RUBBING_NPC, M32_RUBBING_SCENE, M32_TALK, M32_TALK_NPC,
  M32_VISION_NPC, M32_VISION_SCENE,
} from '../m32.quest';

export const YSMERYTH_TREE = 'npc-ysmeryth';
export const TALK_ANCHOR = 'dragonspine.hearth.ysmeryth.land';
export const TALK_RADIUS = 9;
/** Fixed ticks the vision's camera hold lasts at most (the scene normally releases it when it ends). */
export const VISION_HOLD_TICKS = 1200;
/** Ticks between her perching and the quest's flag. */
export const PERCH_SETTLE_TICKS = 45;
/** Burn cools this many times faster while Cael walks on foot with Keeper's Understanding. */
export const KEEPER_DECAY_SCALE = 2;

/** M34 can be offered now: it has not begun and everything it waits on is done (the oath talk itself starts it, so the pose cannot wait for `active`). */
export function m34Offerable(k: Kit): boolean {
  const need = (m34.startWhen as { all: Array<{ quest: string }> }).all;
  return k.qstate('m34') === 'inactive' && need.every((c) => k.qstate(c.quest) === 'completed');
}

/** The pose Ysmeryth should hold while Cael talks to her, from the quests' state; null when she keeps whichever she has. */
export function talkPose(k: Kit): YsmerythPose | null {
  if (m34Offerable(k)) return 'oath';
  if (k.active('m34') && k.objCurrent('m34', 'oath')) return 'oath';
  if (k.active('m34') && k.objCurrent('m34', 'report')) return 'land';
  if (k.qstate('m31') === 'completed' && k.qstate('m32') !== 'completed') return k.active('m32') && !k.objCurrent('m32', 'speak') ? null : 'land';
  return null;
}

/** The pose she holds between scenes, derived from the quests (a load re-poses her). */
export function standingPose(k: Kit): YsmerythPose | null {
  if (k.active('m34') && k.objCurrent('m34', 'oath')) return 'oath';
  if (k.active('m32') && k.objDone('m32', 'speak')) return 'land';
  if (k.active('m34') && k.objDone('m34', 'oath')) return k.objDone('m34', 'companions') ? 'land' : 'oath';
  return null;
}

export function installM32(k: Kit): Off {
  const { ctx } = k;
  const offs: Off[] = [];
  const dialogue = () => ctx.services.get('dialogue');

  // ---- Her talk prompt ---------------------------------------------------------------------------------------------------------------
  const interaction = (ctx as { interaction?: { register(i: unknown): Off } }).interaction;
  if (interaction) {
    const off = interaction.register({
      id: M32_TALK, kind: 'use', name: 'ysmeryth-talk', radius: TALK_RADIUS, promptKey: 'quest.prompt.ysmeryth',
      position: (out: Vec3Like) => {
        const a = ctx.anchors.find(TALK_ANCHOR);
        if (a) { out.x = a.position.x; out.y = a.position.y; out.z = a.position.z; }
        return out;
      },
      enabled: () => k.qstate('m31') === 'completed' && !dialogue()?.active,
      onInteract: () => {
        const pose = talkPose(k);
        if (pose) ysmeryth(k)?.pose(pose);
        dialogue()?.start(YSMERYTH_TREE, M32_TALK_NPC);
      },
    });
    offs.push(off);
  }

  // ---- The scenes ----------------------------------------------------------------------------------------------------------------------
  let shot: { release(blendOut?: number): void } | null = null;
  let token = 0;
  const release = (): void => { shot?.release(); shot = null; };
  const settle = (): void => { const p = standingPose(k); if (p) ysmeryth(k)?.pose(p); };
  k.on('save.loaded', () => { token++; release(); k.later(settle); });
  // M34 is started by the oath talk itself (its last line), so the pose is also applied when the quest becomes active and as its objectives move
  k.on('quest.started', (e) => { if (e.questId === 'm34') k.later(settle); });
  k.on('quest.objective', (e) => { if (e.questId === 'm34') k.later(settle); });
  k.on('dialogue.ended', (e) => {
    if (e.dialogueId !== M32_VISION_SCENE) return;
    token++;
    release();
    k.later(() => ysmeryth(k)?.pose('land'));
  });
  offerScene(k, {
    quest: 'm32', objective: 'vision', scene: M32_VISION_SCENE, npc: M32_VISION_NPC,
    ready: () => !shot,
    before: () => {
      const stone = ctx.anchors.find('dragonspine.hearth.keeper-stone');
      const look = ctx.anchors.find('dragonspine.hearth.ysmeryth.reveal');
      ysmeryth(k)?.pose('reveal');
      if (stone && look) {
        const p = stone.position;
        shot = ctx.cameraRig?.override({ position: { x: p.x, y: p.y + 3, z: p.z }, lookAt: { x: look.position.x, y: look.position.y + 6, z: look.position.z }, blendIn: 1, blendOut: 1 }) ?? null;
        const mine = ++token;
        k.after(VISION_HOLD_TICKS, () => { if (mine === token) release(); });
      }
    },
  });
  offerScene(k, { quest: 'm32', objective: 'rubbing', scene: M32_RUBBING_SCENE, npc: M32_RUBBING_NPC });
  offerScene(k, { quest: 'm32', objective: 'companions', scene: M32_COMPANIONS_SCENE, npc: M32_COMPANIONS_NPC });
  offerScene(k, { quest: 'm32', objective: 'axe', scene: M32_AXE_SCENE, npc: M32_AXE_NPC });

  // ---- The end: she perches, then the flag ---------------------------------------------------------------------------------------------
  const finish = (): void => {
    if (k.flag(M32_COMPLETE)) return;
    k.set(M32_COMPLETE);
    toast(k, 'dragonspine.q.m32.perk');
  };
  k.on('quest.completed', (e) => {
    if (e.questId !== 'm32') return;
    ysmeryth(k)?.pose('perch');
    k.after(PERCH_SETTLE_TICKS, finish);
  });
  const sync = (): void => { if (k.qstate('m32') === 'completed' && !k.flag(M32_COMPLETE)) k.set(M32_COMPLETE); };
  k.on('save.loaded', sync);
  sync();

  offs.push(installPerk(k));
  return () => { for (const o of offs.splice(0)) o(); };
}

export const KEEPER_PERK_ID = 'keepers-understanding';

/** Keeper's Understanding: the Burn decay scale. Derived from the flag every time it is asked, so a load needs nothing; bound as soon as the spells service answers. */
export function installPerk(k: Kit): Off {
  const { ctx } = k;
  const scale = (): number => {
    if (!k.flag(M32_COMPLETE) || !ctx.player.moving) return 1;
    if ((ctx.services.get('movementMode')?.current ?? 'walk') !== 'walk') return 1;
    if (ctx.services.get('mount')?.mounted()) return 1;
    return KEEPER_DECAY_SCALE;
  };
  // v0.8 item 17: a perk, read live through the perks service; without it (a reduced boot) bound to spells as before.
  const perks = ctx.services.get('perks');
  if (perks) {
    const off = perks.register({ id: KEEPER_PERK_ID, active: () => scale() !== 1, burnDecayScale: scale });
    return () => off();
  }
  // Plugins set up in dependency order, so in a full boot `perks` usually appears after this director: the retry registers
  // the perk then (dropping a spells binding made in the meantime, which the perks plugin has replaced).
  let off: Off | null = null;
  let viaPerks = false;
  const bind = (): void => {
    if (viaPerks) return;
    const p = ctx.services.get('perks');
    if (p) {
      off?.();
      off = p.register({ id: KEEPER_PERK_ID, active: () => scale() !== 1, burnDecayScale: scale });
      viaPerks = true;
      return;
    }
    if (off) return;
    const spells = ctx.services.get('spells');
    if (spells?.setBurnDecayScale) off = spells.setBurnDecayScale(scale);
  };
  bind();
  k.every(60, bind);
  return () => { off?.(); off = null; };
}
