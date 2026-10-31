// R14, R13, M26, M27 and D05 rules (K12): the choices' favour, the water-song, Hathren's rite, the reed blinds and the Deeps.
import type { Kit, Off } from './shared';
import { distanceTo, offerScene, recheck, toast } from './shared';
import { canStage, SetPiece } from './scenes';
import { BroodFlight, type BroodPlace } from './broodScene';
import type { CameraShot } from '../../../../../rendering/ThirdPersonCamera';
import { heightAt } from '../../../../../terrain/heightfield';
import { GREYFEN_WATER_TABLE } from '../../../../../terrain/shape/greyfen';
import { WaterSong } from './song';
import { createSongBar } from './songBar';
import { R14_CHOICE, R14_FAVOURED } from '../r14.quest';
import {
  R13_ALTAR, R13_CALMED, R13_LESSON, R13_POCKETS, R13_POCKET_FLAG, R13_SONG_NPC, R13_SONG_SCENE, R13_SUNG,
} from '../r13.quest';
import {
  M26_LIT, M26_NETS_CUT, M26_NET_FLAGS, M26_RITE_DONE, M26_SHRINE, M26_VOICE_NPC, M26_VOICE_SCENE, M26_WAKE_NPC, M26_WAKE_RADIUS, M26_WAKE_SCENE,
  M26_WAKE_SEEN, M26_WOKE, M26_WOKE_EVENT,
} from '../m26.quest';
import {
  M27_ALLY_ANCHORS, M27_ALLY_SCENE, M27_ALONE_SCENE, M27_AFTER_NPC, M27_AFTER_SCENE, M27_BLINDS, M27_BLINDS_END, M27_BROOD_BACK, M27_FREE_FLAGS,
  M27_BROOD_NPC, M27_BROOD_SCENE, M27_PACK1_DOWN, M27_SEEN, M27_WITNESSES,
} from '../m27.quest';
import {
  D05_BOSS, D05_OUTCOME_FLAG, D05_OUTCOME_NPC, D05_OUTCOME_SCENE, D05_POCKETS, D05_POCKET_FLAG, D05_UNDERCROFT_NPC, D05_UNDERCROFT_SCENE,
} from '../d05.quest';

export const R13_SCENE_SEEN = 'story.r13.songSeen';
export const R13_FAILS = 'story.r13.songFails';
/** Fixed ticks (60 a second) between the song and the calm, and between the last cage and the brood's return. */
export const R13_CALM_TICKS = 360;
export const M27_BROOD_TICKS = 240;
/** How long a wading player holds the brood scene back before it plays anyway (a diving player holds it for good), in fixed ticks. */
export const M27_BROOD_WADE_PATIENCE = 600;
/** The wake scene's own caps: the dialogue is given up on this long after the scene begins, and nothing outlasts the hard cap unless a dialogue is open. */
export const M26_WAKE_DIALOGUE_GIVEUP = 1200;
export const M26_WAKE_HARD_CAP = 3600;
export const M27_BROOD_HARD_CAP = 3000;
const SHORE_ANCHOR = 'greyfen.mere.shore';
/** How far under her head the wake shot aims (m), so she is framed above the scene's dialogue panel. */
const WAKE_AIM_DROP = 10;
export const DEEPS_INTERIOR = 'greyfen-deeps';
export const M27_PACK1_GROUP = 'greyfen.q.m27.pack1';
export const M27_PACK2_GROUP = 'greyfen.q.m27.pack2';

export function installR14(k: Kit): void {
  // The deserter's fate moves Halvard once (+4 returned, -2 released); the dialogue wrote the choice.
  const favour = (): void => {
    const v = k.str(R14_CHOICE);
    if ((v !== 'returned' && v !== 'released') || k.flag(R14_FAVOURED)) return;
    k.set(R14_FAVOURED);
    k.favour('halvard', v === 'returned' ? 4 : -2);
  };
  k.on('flag.changed', (e) => {
    if (e.key === R14_CHOICE) { favour(); k.later(() => recheck(k)); }
  });
  k.on('save.loaded', favour);
}

export function installR13(k: Kit, now: () => number = () => performance.now()): () => void {
  k.on('dive.surfaced', (e) => {
    const i = R13_POCKETS.indexOf(e.pocketId ?? '');
    if (i >= 0 && k.active('r13')) { k.set(R13_POCKET_FLAG(i + 1)); k.later(() => recheck(k)); }
  });

  const song = new WaterSong({
    now,
    toast: (key) => toast(k, key),
    lessonDone: () => k.flag(R13_LESSON),
    fails: () => k.num(R13_FAILS),
    failed: () => k.set(R13_FAILS, k.num(R13_FAILS) + 1),
    onLesson: () => { k.set(R13_LESSON); toast(k, 'greyfen.q.r13.lessonDone'); },
    onSung: () => {
      k.set(R13_SUNG);
      k.emit('story.r13.sung');
      k.later(() => recheck(k));
      k.after(R13_CALM_TICKS, calm);
    },
  });
  const calm = (): void => {
    if (!k.active('r13') || k.flag(R13_CALMED) || !k.flag(R13_SUNG)) return;
    k.set(R13_CALMED);
    toast(k, 'greyfen.q.r13.calm');
    k.emit('story.r13.calm');
    k.later(() => recheck(k));
  };
  const live = (): boolean => k.active('r13') && k.objCurrent('r13', 'song');
  k.on('interact', (e) => {
    if (e.interactableId !== R13_ALTAR || e.action !== 'interact' || !live()) return;
    if (!k.flag(R13_SCENE_SEEN)) {
      if (!k.ctx.services.get('dialogue')?.start(R13_SONG_SCENE, R13_SONG_NPC)) k.warn('R13: the song scene could not start');
      return;
    }
    song.press();
  });
  // the teaching scene ends: the lesson bar begins at once
  k.on('dialogue.ended', (e) => {
    if (e.dialogueId === R13_SONG_SCENE && e.reason === 'completed') { k.set(R13_SCENE_SEEN); k.later(() => live() && song.press()); }
  });
  k.every(6, () => song.update());
  // the bar on screen (the tempering strip); a reduced boot without a document or HUD draws nothing
  const hud = (k.ctx as unknown as { hud?: { mount(slot: string, w: unknown): () => void } }).hud;
  const bar = createSongBar(typeof document === 'undefined' ? null : (document as never), () => song.view(), (key) => k.ctx.strings.t(key));
  const unmount = bar && hud ? hud.mount('bottom-center', bar) : () => {};
  k.on('save.loaded', () => {
    song.reset();
    if (k.active('r13') && k.flag(R13_SUNG) && !k.flag(R13_CALMED)) k.after(120, calm);
  });
  return unmount;
}

/** The forward unit vector (x, z) of an anchor's yaw (yaw 0 faces -Z, the game's rule). */
const facing = (yaw: number): { x: number; z: number } => ({ x: -Math.sin(yaw), z: -Math.cos(yaw) });

export function installM26(k: Kit): Off {
  const hathren = () => k.ctx.services.get('hathren');
  const dialogue = () => k.ctx.services.get('dialogue');
  let quietSeen = false;

  // The wake step's credit: the flag, the story event (the step's trigger) and a recheck. Idempotent.
  const credit = (): void => {
    if (!k.active('m26') || k.flag(M26_WOKE)) return;
    k.set(M26_WOKE);
    k.emit(M26_WOKE_EVENT);
    k.later(() => recheck(k));
    syncHold();
  };

  // ---- the wake scene: Cael at the shore sees her wake. Staged only where there is a camera rig and a wake hook; elsewhere K6a's
  // own beat (below) credits the step, so a reduced boot never waits on a scene.
  const staged = (): boolean => canStage(k) && typeof hathren()?.wake === 'function';
  let wakeDone = false; // the playback of the scene's wake has settled (or the scene is not running)
  let wakeDialogue: 'idle' | 'open' | 'done' = 'idle';
  let sprayed = false;
  let playback: { skip(): void } | null = null;

  // Hathren is held silent from M26's start (so the 60 m approach cannot start the wake out of frame) and let go the moment the
  // step is credited or M26 is no longer active; K6a also lets go by herself when the quest leaves.
  function syncHold(): void {
    const h = hathren();
    if (!h || typeof h.holdWake !== 'function') return;
    const want = staged() && k.active('m26') && !k.flag(M26_WOKE);
    if (want !== h.wakeHeld) h.holdWake(want);
  }

  const piece = new SetPiece(k, 'greyfen.m26.wake', (reason) => {
    const d = dialogue();
    if (reason === 'skipped') playback?.skip();
    if (wakeDialogue === 'open') d?.close('skip');
    playback = null;
    wakeDialogue = 'done';
    if (reason === 'finished' || reason === 'skipped') k.set(M26_WAKE_SEEN);
    // A finished or skipped scene credits at once; a load credits too when the loaded world has the step current (the wake is not
    // saved, so it would otherwise ask the player to wake her twice).
    if (reason === 'finished' || reason === 'skipped' || (reason === 'load' && k.objCurrent('m26', 'wake'))) credit();
    syncHold();
  });

  const shoreShot = (): CameraShot => {
    const a = k.ctx.anchors.find(SHORE_ANCHOR);
    const f = { ...k.ctx.player.feet };
    const fw = facing(a?.yaw ?? 0);
    return {
      // behind and a little to the side of Cael, looking out over his shoulder at her head
      position: { x: f.x - fw.x * 6 + fw.z * 2.5, y: f.y + 3.6, z: f.z - fw.z * 6 - fw.x * 2.5 },
      // aimed a little below her head so the head rides in the upper third, clear of the dialogue panel
      lookAt: () => {
        const h = hathren()?.headPoint();
        return h ? { x: h.x, y: h.y - WAKE_AIM_DROP, z: h.z } : { x: f.x + fw.x * 55, y: f.y - 1, z: f.z + fw.z * 55 };
      },
      blendIn: 0.8,
      blendOut: 1,
    };
  };

  const beginWake = (): void => {
    const h = hathren();
    if (!h || !piece.begin(shoreShot())) return;
    wakeDone = false;
    wakeDialogue = 'idle';
    sprayed = false;
    const pb = h.wake();
    if (!pb) {
      // she cannot wake in frame (no place, or already awake): credit the step and let go
      piece.end('cancelled');
      credit();
      return;
    }
    playback = pb;
    void pb.done.then(() => { wakeDone = true; });
  };

  k.every(10, () => {
    if (piece.active || !staged()) return;
    if (!k.active('m26') || !k.objCurrent('m26', 'wake') || k.flag(M26_WOKE) || k.flag(M26_WAKE_SEEN)) return;
    if (hathren()?.state !== 'nets') return;
    const d = dialogue();
    if (!d || d.active || k.ctx.hud?.modalOpen) return;
    if (distanceTo(k, SHORE_ANCHOR) > M26_WAKE_RADIUS) return;
    beginWake();
  });
  k.every(1, () => {
    if (!piece.active) return;
    if (!k.active('m26')) return void piece.end('cancelled'); // abandoned, failed or completed under it
    const d = dialogue();
    piece.tick(!!d?.active);
    if (!piece.active) return;
    if (sprayed && wakeDialogue === 'idle' && d && !d.active && d.start(M26_WAKE_SCENE, M26_WAKE_NPC)) wakeDialogue = 'open';
    const given = wakeDialogue === 'idle' && piece.age > M26_WAKE_DIALOGUE_GIVEUP; // the scene never opened (another modal held the floor)
    if (wakeDone && (wakeDialogue === 'done' || given)) return void piece.end('finished');
    if (piece.age > M26_WAKE_HARD_CAP && !d?.active) piece.end('finished');
  });
  k.on('dialogue.ended', (e) => {
    if (e.dialogueId !== M26_WAKE_SCENE || !piece.active) return;
    wakeDialogue = 'done';
    if (e.reason !== 'completed') piece.end('skipped'); // closed early: the scene is over, the wake is credited at once
  });
  k.on('quest.failed', (e) => { if (e.questId === 'm26') { piece.end('cancelled'); syncHold(); } });
  k.on('quest.completed', (e) => { if (e.questId === 'm26') { piece.end('cancelled'); syncHold(); } });
  k.on('quest.started', (e) => { if (e.questId === 'm26') syncHold(); });
  k.every(30, syncHold);

  k.on('wyrm.hathren', (e) => {
    if (e.beat === 'spray' && piece.active) sprayed = true;
    // her own wake beat: inside the scene it only opens it; anywhere else (no camera rig, a dev start) it credits the step
    if (e.beat === 'wake' && !piece.active && k.active('m26')) credit();
    if (e.beat === 'quiet') quietSeen = true;
  });
  // without Hathren (a reduced boot) the wake is credited once the step is current, so the quest never waits on a missing service
  k.every(60, () => {
    if (k.active('m26') && !k.flag(M26_WOKE) && !hathren() && k.objCurrent('m26', 'wake')) credit();
  });

  // Each net cut drops one of her lines; the fourth writes `story.m26.netsCut`.
  k.on('flag.changed', (e) => {
    const i = M26_NET_FLAGS.indexOf(e.key);
    if (i >= 0 && e.value === true && k.active('m26')) {
      hathren()?.netCut(i + 1);
      if (M26_NET_FLAGS.every((f) => k.flag(f))) { k.set(M26_NETS_CUT); rite(); }
    }
  });
  // The rite: the shrine lit with every net down. A shrine lit early waits for the nets, then the calm plays (the flag is the truth after a load).
  const rite = (): void => {
    if (!k.active('m26') || k.flag(M26_RITE_DONE) || !k.flag(M26_NETS_CUT) || !k.flag(M26_LIT)) return;
    k.set(M26_RITE_DONE);
    hathren()?.calm();
    k.later(() => recheck(k));
  };
  k.on('shrine.rekindled', (e) => {
    if (e.shrineId === M26_SHRINE) k.later(rite);
  });
  k.on('save.loaded', () => {
    quietSeen = false;
    piece.end('load');
    k.later(rite);
    k.later(syncHold);
  });
  k.on('quest.objective', (e) => { if (e.questId === 'm26') k.later(rite); });

  // Hathren speaks when she quiets (the calm restarts after a load, so the beat comes again); without her, a few seconds after the rite.
  let riteAt = -1;
  offerScene(k, {
    quest: 'm26', objective: 'voice', scene: M26_VOICE_SCENE, npc: M26_VOICE_NPC,
    ready: () => {
      if (!k.flag(M26_RITE_DONE)) return false;
      if (hathren()) return quietSeen;
      riteAt = riteAt < 0 ? 0 : riteAt + 1;
      return riteAt >= 6;
    },
  });
  // the plugin goes down mid-scene: the camera, the freeze and the cutscene context are released, and Hathren is let go
  return () => {
    piece.end('teardown');
    const h = hathren();
    if (h?.wakeHeld) h.holdWake(false);
  };
}

export function installM27(k: Kit): Off {
  const act3 = () => k.ctx.services.get('act3Allies');
  const released = (): boolean => k.str('story.r14.choice') === 'released';

  // Who stands with Cael: Wybert if R14 let him go (K5's scene), else Leofa alone.
  offerScene(k, {
    quest: 'm27', objective: 'ally', npc: 'scene.m27.ally',
    scene: () => (released() ? M27_ALLY_SCENE : M27_ALONE_SCENE),
    before: () => { if (released()) act3()?.spawnDeserter(M27_ALLY_ANCHORS[0]); },
  });
  // The deserter holds the blinds until they are through, then the cages; derived from the quest, so a load puts him right.
  let at: string | null = null;
  const wanted = (): string | null => {
    if (!released() || !k.active('m27') || !k.objDone('m27', 'ally')) return null;
    if (!k.objDone('m27', 'blinds')) return M27_ALLY_ANCHORS[0];
    return k.objDone('m27', 'free') ? null : M27_ALLY_ANCHORS[1];
  };
  const placeDeserter = (): void => {
    const w = wanted();
    if (w === at) return;
    if (w) act3()?.spawnDeserter(w);
    else act3()?.despawnDeserter();
    at = w;
  };
  k.every(30, placeDeserter);
  k.on('quest.completed', (e) => { if (e.questId === 'm27') { act3()?.despawnDeserter(); at = null; } });
  k.on('save.loaded', () => { at = null; k.later(placeDeserter); });

  // Spared hunters are witnesses.
  // Only M27's own packs count, one witness per distinct hunter; a spare taken back (`mercy.revoked`) is no witness, and he may be spared again.
  const witnessed = new Set<string>();
  const packMember = (a: string): boolean =>
    [M27_PACK1_GROUP, M27_PACK2_GROUP].some((g) => (k.ctx.services.get('enemies')?.alive(g) ?? []).includes(a));
  k.on('save.loaded', () => witnessed.clear());
  k.on('hunter.spared', (e) => {
    if (!k.active('m27') || witnessed.has(e.actorId) || !packMember(e.actorId)) return;
    witnessed.add(e.actorId);
    k.set(M27_WITNESSES, k.num(M27_WITNESSES) + 1);
  });
  k.on('mercy.revoked', (e) => {
    if (witnessed.delete(e.actorId)) k.set(M27_WITNESSES, Math.max(0, k.num(M27_WITNESSES) - 1));
  });

  // The reed blinds. Unseen to the far end: pack 1 never knew. Seen by pack 1: it fights, and the step credits when it is gone.
  const pack1 = (): readonly string[] => k.standing(M27_PACK1_GROUP);
  const credit = (): void => {
    if (k.flag(M27_BLINDS) || !k.active('m27')) return;
    k.set(M27_BLINDS);
    k.emit('story.m27.blinds');
    k.later(() => recheck(k));
  };
  const spotted = (a: string, t: string): void => {
    if (t === 'player' && k.active('m27') && pack1().includes(a)) k.set(M27_SEEN);
  };
  k.on('ai.spotted', (e) => spotted(e.actorId, e.targetId));
  k.on('ai.aggro', (e) => spotted(e.actorId, e.targetId));
  k.on('trigger.enter', (e) => {
    if (e.actorId === 'player' && e.triggerId === M27_BLINDS_END && k.objCurrent('m27', 'blinds') && !k.flag(M27_SEEN)) credit();
  });
  k.every(30, () => {
    if (!k.active('m27') || !k.objCurrent('m27', 'blinds') || k.flag(M27_BLINDS)) return;
    if (k.flag(M27_PACK1_DOWN)) credit(); // pack 1 was on the field and is gone (persisted by the group rule, so a load cannot strand it)
  });

  // The cages: three opened, then (after a short wait) the brood goes home. Where the scene can be staged it plays: three hatchlings fly
  // to the Mere and dive, Leofa speaks, and the flag is written at its end. Elsewhere (a reduced boot) the flag and a toast stand in.
  const allFreed = (): boolean => M27_FREE_FLAGS.every((f) => k.flag(f));
  const broodBack = (): void => {
    if (!k.active('m27') || k.flag(M27_BROOD_BACK)) return;
    k.set(M27_BROOD_BACK);
    k.emit('story.m27.set');
    k.later(() => recheck(k));
  };
  const home = (): void => {
    if (!k.active('m27') || k.flag(M27_BROOD_BACK)) return;
    toast(k, 'greyfen.q.m27.home');
    broodBack();
  };

  const dialogue = () => k.ctx.services.get('dialogue');
  let flight: BroodFlight | null = null;
  let broodDialogue: 'idle' | 'open' | 'done' = 'idle';
  let waiting = -1; // ticks the scene has been ready and held back by the water, or -1 when it is not due
  const place = (): BroodPlace | null => {
    const cages = [1, 2, 3].map((n) => k.ctx.anchors.find(`greyfen.m27.brood.${n}`));
    const shore = k.ctx.anchors.find(SHORE_ANCHOR);
    const scene = k.ctx.scene;
    if (!shore || !scene || cages.some((c) => !c)) return null;
    const fw = facing(shore.yaw);
    return {
      cages: cages.map((c) => ({ x: c!.position.x, y: c!.position.y, z: c!.position.z })),
      shore: { x: shore.position.x, y: shore.position.y, z: shore.position.z },
      toWater: fw, surface: GREYFEN_WATER_TABLE, heightAt,
    };
  };
  const dispose = (): void => { flight?.dispose(); flight = null; };
  const broodPiece = new SetPiece(k, 'greyfen.m27.brood', (reason) => {
    if (broodDialogue === 'open') dialogue()?.close('skip');
    dispose();
    broodDialogue = 'done';
    waiting = -1;
    if (reason === 'finished' || reason === 'skipped') broodBack();
    // a load: the loaded world's three flags decide; the step completes without a replay
    else if (reason === 'load' && allFreed()) broodBack();
  });
  const broodShot = (p: BroodPlace, f: BroodFlight, second: boolean): CameraShot => {
    const mx = p.cages.reduce((a, c) => a + c.x, 0) / p.cages.length;
    const mz = p.cages.reduce((a, c) => a + c.z, 0) / p.cages.length;
    const dx = p.shore.x - mx;
    const dz = p.shore.z - mz;
    const len = Math.hypot(dx, dz) || 1;
    const ux = dx / len;
    const uz = dz / len;
    const look = () => f.focus();
    if (!second) {
      // behind the cages, a little high and to the side, so the three leave past the lens
      return { position: { x: mx - ux * 9 - uz * 3, y: Math.max(p.cages[0]!.y, p.surface) + 4.2, z: mz - uz * 9 + ux * 3 }, lookAt: look, blendIn: 1, blendOut: 1 };
    }
    // from the shore, low, as they come in and go under
    return { position: { x: p.shore.x - p.toWater.x * 6 - p.toWater.z * 7, y: Math.max(p.shore.y, p.surface) + 2.4, z: p.shore.z - p.toWater.z * 6 + p.toWater.x * 7 }, lookAt: look, blendIn: 1.2, blendOut: 1 };
  };
  let secondShot = false;
  const beginBrood = (): void => {
    const p = place();
    if (!p || !k.ctx.scene) return home();
    let f: BroodFlight;
    try {
      f = new BroodFlight(k.ctx.scene, p);
    } catch (err) {
      k.warn(`the brood scene could not be built (${String(err)})`);
      return home();
    }
    flight = f;
    broodDialogue = 'idle';
    secondShot = false;
    if (!broodPiece.begin(broodShot(p, f, false))) { dispose(); home(); }
  };
  const due = (): void => {
    waiting = 0;
  };
  // After the wait: not while Cael is diving, and not while he is wading until he has stood in the shallows a while (so a cage in the
  // water cannot hold it back for good); no dialogue open.
  k.every(10, () => {
    if (waiting < 0 || broodPiece.active) return;
    if (!k.active('m27') || k.flag(M27_BROOD_BACK)) { waiting = -1; return; }
    if (!canStage(k) || !k.ctx.scene) { waiting = -1; return home(); }
    waiting += 10;
    const state = k.ctx.services.get('water')?.state ?? 'dry';
    if (state === 'diving') return;
    if (state === 'wading' && waiting < M27_BROOD_WADE_PATIENCE) return;
    const d = dialogue();
    if (!d || d.active || k.ctx.hud?.modalOpen) return;
    waiting = -1;
    beginBrood();
  });
  k.every(1, () => {
    if (!broodPiece.active || !flight) return;
    if (!k.active('m27')) return void broodPiece.end('cancelled');
    flight.update(1 / 60);
    const d = dialogue();
    broodPiece.tick(!!d?.active);
    if (!broodPiece.active || !flight) return;
    const p = place();
    if (!secondShot && p && flight.seconds > 5.5) { secondShot = true; broodPiece.reshoot(broodShot(p, flight, true)); }
    if (flight.done && broodDialogue === 'idle' && d && !d.active && d.start(M27_BROOD_SCENE, M27_BROOD_NPC)) broodDialogue = 'open';
    if (flight.done && broodDialogue === 'idle' && flight.seconds > 40) broodPiece.end('finished'); // the line never opened (another modal held the floor)
    if (broodPiece.age > M27_BROOD_HARD_CAP && !d?.active) broodPiece.end('finished');
  });
  k.on('dialogue.ended', (e) => {
    if (e.dialogueId !== M27_BROOD_SCENE || !broodPiece.active) return;
    broodDialogue = 'done';
    broodPiece.end(e.reason === 'completed' ? 'finished' : 'skipped');
  });
  k.on('quest.failed', (e) => { if (e.questId === 'm27') broodPiece.end('cancelled'); });
  k.on('quest.completed', (e) => { if (e.questId === 'm27') broodPiece.end('cancelled'); });
  k.on('flag.changed', (e) => {
    if (M27_FREE_FLAGS.includes(e.key) && e.value === true && allFreed()) k.after(M27_BROOD_TICKS, due);
  });
  k.on('save.loaded', () => {
    const was = broodPiece.active;
    waiting = -1;
    broodPiece.end('load'); // the loaded flags decide: all three freed completes the step, anything less leaves it to the cages
    if (!was && k.active('m27') && !k.flag(M27_BROOD_BACK) && allFreed()) k.after(M27_BROOD_TICKS, due);
  });
  offerScene(k, { quest: 'm27', objective: 'aftermath', scene: M27_AFTER_SCENE, npc: M27_AFTER_NPC });
  return () => {
    broodPiece.end('teardown');
    dispose();
  };
}

export function installD05(k: Kit): void {
  k.on('dive.surfaced', (e) => {
    const i = D05_POCKETS.indexOf(e.pocketId ?? '');
    if (i >= 0 && k.active('d05')) { k.set(D05_POCKET_FLAG(i + 1)); k.later(() => recheck(k)); }
  });
  // the undercroft: the scene plays when Cael is inside the Deeps
  offerScene(k, {
    quest: 'd05', objective: 'undercroft', scene: D05_UNDERCROFT_SCENE, npc: D05_UNDERCROFT_NPC,
    ready: () => k.ctx.services.get('interiors')?.current === DEEPS_INTERIOR,
  });
  // Murkjaw is defeated or nothing: the quest keeps its own copy of the outcome (the boss flag is the truth after a load).
  const record = (): void => {
    if (!k.str('story.d05.outcome') && k.str(D05_OUTCOME_FLAG) === 'defeated') k.set('story.d05.outcome', 'defeated');
  };
  k.on('boss.defeated', (e) => { if (e.bossId === D05_BOSS) { k.later(record); k.later(() => recheck(k)); } });
  k.on('flag.changed', (e) => { if (e.key === D05_OUTCOME_FLAG) { record(); k.later(() => recheck(k)); } });
  k.on('save.loaded', () => k.later(() => { record(); recheck(k); }));
  // what the Deeps gives up: once the boss step is done and nothing else holds the floor
  offerScene(k, { quest: 'd05', objective: 'outcome', scene: D05_OUTCOME_SCENE, npc: D05_OUTCOME_NPC });
}
