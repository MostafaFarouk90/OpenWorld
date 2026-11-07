// The Rim Camp's quests: M49 (the allies come up, the banners, the war table's forecast), R29 (the gong's parts and its rhythm
// run) and M51 (the horn-stone, the dragons from their perches, the warhost's fires, the scouts).
import type { Kit, Off } from '../../../act4/harrowmark/director/shared';
import { recheck, toast } from '../../../act4/harrowmark/director/shared';
import { BeatRun } from '../../../act4/harrowmark/director/beat';
import { createSongBar } from '../../../act3/greyfen/director/songBar';
import { ensureAct5Sfx } from '../../../../../audio/act5/act5SfxEnsure';
import { siegeRoster } from '../../../../../siege/roster';
import { snapshotFlag, FAVOUR_TRACKS, type FavourTrack } from '../../../../../state/favour';
import {
  DELEGATE_FLAG, M49_ARRIVAL_SCENE, M49_BANNER, M49_BANNER_RAISED, M49_BANNERS, M49_FORECAST, M49_FORECAST_KEYS, M49_HOUSES, M49_POST,
  M49_POSTS, M49_RISE_SCENE, M49_TABLE, M49_TABLE_DIALOGUE, M49_TABLE_NPC, type M49ForecastKey, type M49House,
} from '../m49.quest';
import { R29_DELIVERED, R29_POSTS, R29_SCENE, R29_STRIKE, R29_STRUCK } from '../r29.quest';
import {
  M51_CALL, M51_CALL_DIALOGUE, M51_CALL_NPC, M51_DRAGONS, M51_DRAGONS_SCENE, M51_FIRES_SCENE, M51_REPORT, M51_SCOUTS_ARM, M51_TALK,
} from '../m51.quest';
import { Q } from '../ids';
import { LOG, playWhenCurrent } from './generic';

// ---- M49 ---------------------------------------------------------------------------------------------------------------------

/** The banners that should fly: each House whose delegate was won at M36, or the camp's own pole when none was. */
export function bannersWanted(k: Kit): (M49House | 'camp')[] {
  const won = M49_HOUSES.filter((h) => k.str(DELEGATE_FLAG(h)) === 'won');
  return won.length ? won : ['camp'];
}

/**
 * The war table's forecast (plan 2.7 point 5): N4's roster on live favour, as if the M52 snapshot were taken now. A proxy answers
 * the snapshot's flags from the live tracks and passes every other flag through, so the forecast and the siege read one table.
 */
export function forecast(k: Kit): Record<M49ForecastKey, boolean> {
  const live = (track: FavourTrack): number => k.ctx.state.favour(track);
  const getFlag = (key: string): unknown => {
    if (key === snapshotFlag('m52', 'taken')) return true;
    for (const t of FAVOUR_TRACKS) if (key === snapshotFlag('m52', t)) return live(t);
    return k.ctx.state.getFlag(key);
  };
  const r = siegeRoster({ getFlag }, 'm52');
  const look = (l: string): boolean => r.squads.some((s) => s.look === l);
  return {
    halvard: look('halvard'), grisel: look('grisel'), ashwalker: look('ashwalker'), watch: look('watch'), named: look('named'),
    dragons: r.dragons.length > 0, sally: r.sally, engineers: r.engineers, storm: r.stormCover, supply: r.supply !== null,
  };
}

export function installM49(k: Kit): void {
  playWhenCurrent(k, { quest: 'm49', objective: 'arrive', scene: M49_ARRIVAL_SCENE });
  const banners = (): void => {
    if (!k.active('m49') || k.flag(M49_BANNERS)) return;
    if (bannersWanted(k).every((h) => k.flag(M49_BANNER_RAISED(h)))) { k.set(M49_BANNERS); k.later(() => recheck(k)); }
  };
  k.on('interact', (e) => {
    if (e.action !== 'interact' || !k.active('m49')) return;
    if ([...M49_HOUSES, 'camp' as const].some((h) => e.interactableId === M49_BANNER(h))) { toast(k, 'rim.q.m49.banner'); k.later(banners); }
    if (M49_POSTS.some((p) => e.interactableId === M49_POST(p))) toast(k, 'rim.q.m49.post');
    if (e.interactableId === M49_TABLE && k.objCurrent('m49', 'table')) {
      const f = forecast(k);
      for (const key of M49_FORECAST_KEYS) k.set(M49_FORECAST(key), f[key]);
      k.later(() => { if (!k.ctx.services.get('dialogue')?.start(M49_TABLE_DIALOGUE, M49_TABLE_NPC)) k.warn(`${LOG} M49: the war table did not open`); });
    }
  });
  k.on('save.loaded', () => k.later(banners));
  playWhenCurrent(k, { quest: 'm49', objective: 'rise', scene: M49_RISE_SCENE });
}

// ---- R29 ---------------------------------------------------------------------------------------------------------------------

export const R29_BEAT = 'rim.q.r29.beat';
const R29_FAILS = 'story.r29.beatFails';

function mountBar(k: Kit, run: BeatRun, prefix: string): Off {
  const hud = (k.ctx as unknown as { hud?: { mount(slot: string, w: unknown): () => void } }).hud;
  const bar = createSongBar(typeof document === 'undefined' ? null : (document as never), () => run.view(), (key) => k.ctx.strings.t(key.replace('greyfen.q.r13.bar.', `${prefix}.bar.`)));
  return bar && hud ? hud.mount('bottom-center', { ...bar, id: `${prefix}.bar` }) : () => {};
}

export function installR29(k: Kit, now: () => number = () => performance.now()): Off {
  const play = (key: string): void => {
    ensureAct5Sfx(key);
    try { k.ctx.services.get('audio')?.play(key); } catch { /* a missing sound is silence */ }
  };
  k.on('flag.changed', (e) => {
    if (e.value === true && R29_POSTS.some((n) => e.key === R29_DELIVERED(n)) && k.active('r29')) toast(k, 'rim.q.r29.part');
  });
  const run = new BeatRun({
    now, prefix: R29_BEAT, toast: (key) => toast(k, key),
    fails: () => k.num(R29_FAILS), failed: () => k.set(R29_FAILS, k.num(R29_FAILS) + 1),
    done: () => {
      if (!k.objCurrent('r29', 'strike')) return;
      play('sfx.gong.rim');
      k.set(R29_STRUCK);
      k.set(R29_FAILS, 0);
      k.later(() => recheck(k));
    },
  });
  k.on('interact', (e) => {
    if (e.action !== 'interact' || e.interactableId !== R29_STRIKE || !k.active('r29') || !k.objCurrent('r29', 'strike')) return;
    play('sfx.gong.rim');
    run.press(1);
  });
  k.every(6, () => run.update());
  k.on('save.loaded', () => run.reset());
  playWhenCurrent(k, { quest: 'r29', objective: 'sound', scene: R29_SCENE });
  return mountBar(k, run, R29_BEAT);
}

// ---- M51 ---------------------------------------------------------------------------------------------------------------------

/** The horn-stone before M51 begins (a quest prop is live only while its step is current, so the offer is the director's). */
export const M51_HORN = 'use:m51-horn';

export function installM51(k: Kit): Off {
  const talk = (tree: string, npc: string): void => {
    k.later(() => { if (!k.ctx.services.get('dialogue')?.start(tree, npc)) k.warn(`${LOG} M51: ${tree} did not open`); });
  };
  const offerable = (): boolean => k.qstate('m51') === 'inactive' && k.qstate('m49') === 'completed';
  const interaction = (k.ctx as { interaction?: { register(i: unknown): Off } }).interaction;
  const off = interaction?.register({
    id: M51_HORN, kind: 'use', name: 'm51-horn', radius: 2.5, promptKey: 'quest.prompt.a5r.call',
    position: (out: { x: number; y: number; z: number }) => {
      const a = k.ctx.anchors.find(`${Q}.m51.call`);
      if (a) { out.x = a.position.x; out.y = a.position.y; out.z = a.position.z; }
      return out;
    },
    enabled: () => offerable() && k.ctx.anchors.find(`${Q}.m51.call`) !== undefined,
    onInteract: () => talk(M51_CALL_DIALOGUE, M51_CALL_NPC),
  }) ?? (() => {});
  k.on('interact', (e) => {
    if (e.action !== 'interact') return;
    // after an accept whose talk was cut short, the step's own prop opens the call again
    if (e.interactableId === M51_CALL && k.objCurrent('m51', 'call')) talk(M51_CALL_DIALOGUE, M51_CALL_NPC);
    if (!k.active('m51')) return;
    for (const d of M51_DRAGONS) if (e.interactableId === M51_TALK(d) && k.objCurrent('m51', d)) talk(`npc-${d}`, d);
    if (e.interactableId === M51_REPORT && k.objCurrent('m51', 'report')) talk('npc-ysmeryth', 'ysmeryth');
  });
  playWhenCurrent(k, { quest: 'm51', objective: 'landed', scene: M51_DRAGONS_SCENE });
  playWhenCurrent(k, { quest: 'm51', objective: 'fires', scene: M51_FIRES_SCENE });
  k.on('flag.changed', (e) => { if (e.key === M51_SCOUTS_ARM && e.value === true) toast(k, 'rim.q.m51.scouts'); });
  return off;
}
