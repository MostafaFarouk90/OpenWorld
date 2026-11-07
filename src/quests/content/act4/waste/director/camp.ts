// The camp and the chapel: M43's Pyre Rite and Spear-Dance, M44's music box and the first dream, R25's candles.
// - Pyre Rite: once Aelfgifu has spoken, each unrested pyre has its wraith (a manual group). A wraith killed rises again after
//   8 s (coordinator 18:01: approved); one released within 6 m of its pyre is laid to rest; a Blightbloom burned with the
//   camp-fire torch lays its pyre's wraith to rest too. Three rested: the rite is done.
// - Spear-Dance: Hrodna's offer (a dialogue event) starts a three-break bout on the trials service once no dialogue is open;
//   a loss ends it and Hrodna offers again; a win (or a spare) writes the trial's flag.
// - M44: the music box plays Ebba's tune; the first rest after M44 plays the dream (no lines), under a black veil with the hum.
// - R25: the three candles on the quest's start (quest items stay out of dialogue), one taken at each hearth lit, a spare
//   from Ebba when Cael holds none, and `story.r25.noCandle` for the hearths' prompts and Ebba's tree.
import { Vector3 } from 'three';
import type { Kit, Off } from '../../harrowmark/director/shared';
import { recheck, toast } from '../../harrowmark/director/shared';
import { ensureAct4Sfx } from '../../../../../audio/act4/act4SfxEnsure';
import { L1 } from '../siteIds';
import {
  M43_BLOOM, M43_DANCE_ASKED, M43_DANCE_LOST, M43_DANCE_SPAWNER, M43_DANCE_TRIAL, M43_DONE, M43_MASTER, M43_PYRE_COUNT,
  M43_PYRE_GROUP, M43_PYRE_RADIUS, M43_PYRE_RESTED, M43_RERISE_S, M43_TORCH,
} from '../m43.quest';
import { M44_BOX, M44_DREAM_SCENE, M44_DREAM_SEEN } from '../m44.quest';
import { R25_CANDLE_ITEM, R25_CANDLES_GIVEN, R25_HEARTHS, R25_LIGHT, R25_LIT, R25_NO_CANDLE, R25_SPARE_ASKED } from '../r25.quest';
import { LOG } from './generic';

const PYRES = [1, 2, 3] as const;

/** Pyres laid to rest (pure, for the tests). */
export const restedCount = (rested: (n: number) => boolean): number => PYRES.filter(rested).length;

export function installPyres(k: Kit): void {
  const en = () => k.ctx.services.get('enemies');
  const rested = (n: number): boolean => k.flag(M43_PYRE_RESTED(n));
  const live = (): boolean => k.active('m43') && k.objDone('m43', 'pyresTalk') && !k.flag(M43_DONE.pyres);
  const rising = new Map<number, number>(); // pyre -> ticks until it rises
  const spawned = new Set<number>();

  const spawn = (n: number): void => {
    const e = en();
    if (!e || rested(n)) return;
    e.reset(M43_PYRE_GROUP(n));
    e.spawnGroup(M43_PYRE_GROUP(n));
    spawned.add(n);
  };
  const lay = (n: number, how: 'rested' | 'burned'): void => {
    if (rested(n)) return;
    k.set(M43_PYRE_RESTED(n));
    rising.delete(n);
    k.later(() => en()?.despawnGroup(M43_PYRE_GROUP(n)));
    const c = restedCount(rested);
    k.set(M43_PYRE_COUNT, c);
    toast(k, how === 'burned' ? 'waste.q.m43.burned' : 'waste.q.m43.rested');
    if (c >= PYRES.length) {
      k.set(M43_DONE.pyres);
      toast(k, 'waste.q.m43.rite');
      k.later(() => recheck(k));
    }
  };
  const pyreOf = (actorId: string): number => PYRES.find((n) => (en()?.alive(M43_PYRE_GROUP(n)) ?? []).includes(actorId)) ?? 0;

  k.on('mercy', (e) => {
    if (e.verb !== 'release' || !e.actorId || !live()) return;
    const n = pyreOf(e.actorId);
    if (!n) return;
    const a = k.ctx.actors.get(e.actorId)?.worldPosition(new Vector3(NaN, 0, NaN));
    const p = k.ctx.anchors.find(L1.pyre(n))?.position;
    if (a && p && Number.isFinite(a.x) && Math.hypot(a.x - p.x, a.z - p.z) > M43_PYRE_RADIUS) return;
    lay(n, 'rested');
  });
  k.on('actor.died', (e) => {
    if (!live()) return;
    for (const n of PYRES) {
      if (e.spawnTag !== M43_PYRE_GROUP(n) || rested(n)) continue;
      rising.set(n, M43_RERISE_S * 60);
      toast(k, 'waste.q.m43.rises');
    }
  });
  // the torch and the blooms (the props write their own used flags; the bloom lays its pyre's wraith to rest)
  k.on('interact', (e) => {
    if (e.action !== 'interact' || !live()) return;
    if (e.interactableId === M43_TORCH) toast(k, 'waste.q.m43.torch');
    for (const n of PYRES) if (e.interactableId === M43_BLOOM(n)) lay(n, 'burned');
  });
  const POLL = 30;
  k.every(POLL, () => {
    if (!live()) {
      for (const n of spawned) en()?.despawnGroup(M43_PYRE_GROUP(n));
      spawned.clear();
      rising.clear();
      return;
    }
    for (const n of PYRES) {
      if (rested(n)) continue;
      const t = rising.get(n);
      if (t !== undefined) {
        if (t - POLL > 0) { rising.set(n, t - POLL); continue; }
        rising.delete(n);
        spawn(n);
        continue;
      }
      if (!spawned.has(n) || (en()?.alive(M43_PYRE_GROUP(n)) ?? []).length === 0) spawn(n);
    }
  });
  k.on('save.loaded', () => { rising.clear(); spawned.clear(); });
}

export function installDance(k: Kit, offs: Off[]): void {
  let pending = false;
  let bout: { opponentId: string } | null = null;
  const begin = (): void => {
    const en = k.ctx.services.get('enemies');
    const trials = k.ctx.services.get('trials');
    if (!en || !trials || trials.state()) return k.warn(`${LOG} M43: no trial can start now`);
    en.despawnGroup(M43_DANCE_SPAWNER);
    const [opponentId] = en.spawnGroup(M43_DANCE_SPAWNER, { aggro: true });
    if (!opponentId) return k.warn(`${LOG} M43: Hrodna's stand-in did not spawn`);
    bout = { opponentId };
    k.clear(M43_DANCE_LOST);
    if (!trials.start({ id: M43_DANCE_TRIAL, opponentId, breaksToWin: 3, onLoss: 'end', standInNpcId: M43_MASTER.dance })) {
      bout = null;
      en.despawnGroup(M43_DANCE_SPAWNER);
    }
  };
  const win = (): void => {
    if (k.flag(M43_DONE.dance)) return;
    k.set(M43_DONE.dance);
    toast(k, 'waste.q.m43.danceWon');
    k.later(() => recheck(k));
  };
  const clear = (): void => {
    bout = null;
    k.later(() => k.ctx.services.get('enemies')?.despawnGroup(M43_DANCE_SPAWNER));
  };
  const open = (): boolean => k.active('m43') && k.objDone('m43', 'danceTalk') && !k.flag(M43_DONE.dance);
  // Hrodna's "Now." fires while her talk (danceTalk) is still open: take the ask then, and start the bout once the
  // conversation has closed and danceTalk is done (L13 Phase H M2: the first ask was dropped)
  const askable = (): boolean => k.active('m43') && !k.flag(M43_DONE.dance) && (k.objDone('m43', 'danceTalk') || k.objCurrent('m43', 'danceTalk'));
  offs.push(k.onNamed(M43_DANCE_ASKED, () => { if (askable() && !bout) pending = true; }));
  k.on('trial.won', (e) => { if (e.trialId === M43_DANCE_TRIAL && bout) win(); });
  k.on('trial.lost', (e) => {
    if (e.trialId !== M43_DANCE_TRIAL || !bout) return;
    k.set(M43_DANCE_LOST);
    toast(k, 'waste.q.m43.danceLost');
  });
  k.on('trial.ended', (e) => { if (e.trialId === M43_DANCE_TRIAL && bout) clear(); });
  k.on('mercy', (e) => {
    if (!bout || e.actorId !== bout.opponentId || e.verb !== 'spare') return;
    win();
    k.ctx.services.get('trials')?.stop(M43_DANCE_TRIAL);
    clear();
  });
  k.on('save.loaded', () => { pending = false; if (bout) { k.ctx.services.get('trials')?.stop(M43_DANCE_TRIAL); clear(); } });
  k.every(6, () => {
    if (!pending || k.ctx.services.get('dialogue')?.active) return;
    if (!open()) { if (!askable()) pending = false; return; } // danceTalk completes as the talk ends: wait for it
    pending = false;
    begin();
  });
}

/** The dream's black veil: a full-screen dark that fades in and out (absent without a document). */
function veil(): { show(): void; hide(): void; dispose(): void } {
  const doc = typeof document === 'undefined' ? null : document;
  if (!doc?.body) return { show() {}, hide() {}, dispose() {} };
  const el = doc.createElement('div');
  el.setAttribute('data-waste-dream-veil', '');
  Object.assign(el.style, { position: 'fixed', inset: '0', background: '#000', opacity: '0', pointerEvents: 'none', transition: 'opacity 1.5s ease', zIndex: '40' });
  doc.body.appendChild(el);
  return {
    show() { el.style.opacity = '1'; },
    hide() { el.style.opacity = '0'; },
    dispose() { el.remove(); },
  };
}

export function installM44(k: Kit): Off {
  const audio = () => k.ctx.services.get('audio');
  const play = (key: string): void => {
    ensureAct4Sfx(key);
    try { audio()?.play(key); } catch { /* a missing sound is silence */ }
  };
  k.on('interact', (e) => { if (e.action === 'interact' && e.interactableId === M44_BOX && k.active('m44')) play('sfx.ebba.musicbox'); });

  // the first rest after M44: the dream (once; a skipped or interrupted dream is offered again at the next rest)
  let asked = false;
  k.on('rest', () => {
    if (k.qstate('m44') !== 'completed' || k.flag(M44_DREAM_SEEN) || asked) return;
    const s = k.ctx.services.get('scenes');
    if (!s || s.active !== null) return;
    asked = true;
    k.later(() => void s.play(M44_DREAM_SCENE).then(() => { asked = false; }));
  });
  k.on('save.loaded', () => { asked = false; });
  const v = veil();
  k.on('scene.started', (e) => { if (e.id === M44_DREAM_SCENE) { v.show(); play('sfx.dream.hum'); } });
  k.on('scene.ended', (e) => { if (e.id === M44_DREAM_SCENE) v.hide(); });
  return () => v.dispose();
}

export function installR25(k: Kit, offs: Off[]): void {
  const inv = () => k.ctx.services.get('inventory');
  const held = (): number => inv()?.count(R25_CANDLE_ITEM) ?? 0;
  const give = (): void => {
    if (!k.active('r25') || k.flag(R25_CANDLES_GIVEN) || !inv()) return;
    if (inv()!.add(R25_CANDLE_ITEM, R25_HEARTHS.length) > 0) k.set(R25_CANDLES_GIVEN);
  };
  k.on('quest.started', (e) => { if (e.questId === 'r25') k.later(give); });
  k.on('save.loaded', () => k.later(give));
  k.on('interact', (e) => {
    if (e.action !== 'interact' || !k.active('r25')) return;
    for (const n of R25_HEARTHS) if (e.interactableId === R25_LIGHT(n)) inv()?.remove(R25_CANDLE_ITEM, 1);
  });
  offs.push(k.onNamed(R25_SPARE_ASKED, () => { if (k.active('r25') && held() === 0) inv()?.add(R25_CANDLE_ITEM, 1); }));
  k.every(20, () => {
    give();
    const none = k.active('r25') && k.flag(R25_CANDLES_GIVEN) && held() === 0 && R25_HEARTHS.some((n) => !k.flag(R25_LIT(n)));
    if (none && !k.flag(R25_NO_CANDLE)) { k.set(R25_NO_CANDLE); toast(k, 'waste.q.r25.noCandle'); }
    if (!none && k.flag(R25_NO_CANDLE)) k.clear(R25_NO_CANDLE);
  });
}
