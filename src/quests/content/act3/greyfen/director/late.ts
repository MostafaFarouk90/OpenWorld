// R14, R13, M26, M27 and D05 rules (K12): the choices' favour, the water-song, Hathren's rite, the reed blinds and the Deeps.
import type { Kit } from './shared';
import { offerScene, recheck, toast } from './shared';
import { WaterSong } from './song';
import { createSongBar } from './songBar';
import { R14_CHOICE, R14_FAVOURED } from '../r14.quest';
import {
  R13_ALTAR, R13_CALMED, R13_LESSON, R13_POCKETS, R13_POCKET_FLAG, R13_SONG_NPC, R13_SONG_SCENE, R13_SUNG,
} from '../r13.quest';
import {
  M26_LIT, M26_NETS_CUT, M26_NET_FLAGS, M26_RITE_DONE, M26_SHRINE, M26_VOICE_NPC, M26_VOICE_SCENE, M26_WOKE,
} from '../m26.quest';
import {
  M27_ALLY_ANCHORS, M27_ALLY_SCENE, M27_ALONE_SCENE, M27_AFTER_NPC, M27_AFTER_SCENE, M27_BLINDS, M27_BLINDS_END, M27_BROOD_BACK, M27_FREE_FLAGS,
  M27_PACK1_DOWN, M27_SEEN, M27_WITNESSES,
} from '../m27.quest';
import {
  D05_BOSS, D05_OUTCOME_FLAG, D05_OUTCOME_NPC, D05_OUTCOME_SCENE, D05_POCKETS, D05_POCKET_FLAG, D05_UNDERCROFT_NPC, D05_UNDERCROFT_SCENE,
} from '../d05.quest';

export const R13_SCENE_SEEN = 'story.r13.songSeen';
export const R13_FAILS = 'story.r13.songFails';
/** Fixed ticks (60 a second) between the song and the calm, and between the last cage and the brood's return. */
export const R13_CALM_TICKS = 360;
export const M27_BROOD_TICKS = 240;
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

export function installM26(k: Kit): void {
  const hathren = () => k.ctx.services.get('hathren');
  let quietSeen = false;

  k.on('wyrm.hathren', (e) => {
    if (e.beat === 'wake' && k.active('m26')) { k.set(M26_WOKE); k.later(() => recheck(k)); }
    if (e.beat === 'quiet') quietSeen = true;
  });
  // without Hathren (a reduced boot) the wake is credited once the step is current, so the quest never waits on a missing service
  k.every(60, () => {
    if (k.active('m26') && !k.flag(M26_WOKE) && !hathren() && k.objCurrent('m26', 'wake')) { k.set(M26_WOKE); recheck(k); }
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
    k.later(rite);
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
}

export function installM27(k: Kit): void {
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

  // The cages: three opened, then the brood goes home (a short wait, then the step's flag and a line on screen).
  const home = (): void => {
    if (!k.active('m27') || k.flag(M27_BROOD_BACK)) return;
    k.set(M27_BROOD_BACK);
    toast(k, 'greyfen.q.m27.home');
    k.emit('story.m27.set');
    k.later(() => recheck(k));
  };
  k.on('flag.changed', (e) => {
    if (M27_FREE_FLAGS.includes(e.key) && e.value === true && M27_FREE_FLAGS.every((f) => k.flag(f))) k.after(M27_BROOD_TICKS, home);
  });
  k.on('save.loaded', () => {
    if (k.active('m27') && !k.flag(M27_BROOD_BACK) && M27_FREE_FLAGS.every((f) => k.flag(f))) k.after(M27_BROOD_TICKS, home);
  });
  offerScene(k, { quest: 'm27', objective: 'aftermath', scene: M27_AFTER_SCENE, npc: M27_AFTER_NPC });
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
