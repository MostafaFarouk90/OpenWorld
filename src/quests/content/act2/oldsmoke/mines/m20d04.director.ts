// The rules M20 and D04 cannot keep in a quest def: Orsk's set piece, the wyrmling chains, the arena's arming and the
// Slagmaw's outcome. Installers take the shared Kit (src/quests/content/act2/director/kit.ts) and are registered by the
// Oldsmoke director plugin; each returns the extra unsubscribes it owns (the kit's own listeners dispose with the plugin).
import type { Kit, Off } from '../../director/kit';
import { D04_BOSS, D04_OUTCOME_FLAG, D04_STARTED } from './d04.quest';
import { M20_ROOF_HEIGHT } from '../../../../../oldsmoke/mines/lowerGalleries';
import { M20_CHAIN_FLAGS, M20_ORSK_GONE } from './m20.quest';
import { M20_CHAIN_ANCHORS, M20_NURSERY_GROUP } from './m20d04.data';
import { installPools } from './m20d04.pools';

/** A4's anchor for Orsk's position (and, by its yaw, his heading); the roof height is A4's `M20_ROOF_HEIGHT`. */
export const M20_ROOF_ANCHOR = 'oldsmoke.m20.roof';
export { M20_ROOF_HEIGHT };
/** A freed wyrmling walks to the Lower Galleries' lift before it fades (A4's landing inside). */
export const M20_EXIT_ANCHOR = 'oldsmoke.lower.lift';
/** Where Wenna stands once M20 is done (A4's hall post; the same anchor the post rules use after M16). */
export const M20_WENNA_HOME = 'oldsmoke.hall.wenna';
/** How often the director asks whether Orsk's turn has come (also the retry while another dialogue holds the floor). */
export const ORSK_CHECK_TICKS = 30;

export function installM20(k: Kit): Off[] {
  const { ctx } = k;
  let playing = false;

  // Each wyrmling is chained at its post until its own chain flag is set (the prop writes it; any order; a load keeps it).
  const wyrms = ctx.services.get('wyrms');
  if (!wyrms) k.warn('M20: no wyrms service; the nursery wyrmlings will not be chained');
  const offs: Off[] = [];
  const untether = wyrms?.tether(M20_NURSERY_GROUP, M20_CHAIN_ANCHORS.map((anchor, i) => ({ anchor, until: { all: [M20_CHAIN_FLAGS[i]] } })), { exitAnchor: M20_EXIT_ANCHOR });
  if (untether) offs.push(untether);

  const allBroken = (): boolean => M20_CHAIN_FLAGS.every((f) => k.flag(f));

  // The set piece plays once: when the fifth chain is down, outside a dialogue, with the scene not already running. A skip
  // emits every remaining beat, `gone` included, so the flag is written the same way on both paths.
  const play = (): void => {
    if (playing || k.flag(M20_ORSK_GONE) || !k.active('m20') || !allBroken()) return;
    if (ctx.services.get('dialogue')?.active) return;
    const svc = ctx.services.get('wyrms');
    const at = ctx.anchors.find(M20_ROOF_ANCHOR);
    if (!svc || !at) {
      // a missing service or anchor must not strand the quest: the beats are credited by the flag
      k.warn(`M20: cannot play Orsk (${svc ? `no anchor ${M20_ROOF_ANCHOR}` : 'no wyrms service'}); marking him gone`);
      k.set(M20_ORSK_GONE);
      return;
    }
    const playback = svc.playOrsk({ position: at.position, yaw: at.yaw, roofHeight: M20_ROOF_HEIGHT });
    if (!playback) return; // one is already playing: the next check tries again
    playing = true;
    void playback.done.then(() => void (playing = false));
  };
  k.every(ORSK_CHECK_TICKS, play);

  k.on('wyrm.orsk', (e) => {
    if (e.beat === 'gone') {
      k.set(M20_ORSK_GONE);
      // `chainsBroken` is credited by a `doneWhen` flag, which only a recheck reads: credit it at once, not at the next load
      ctx.services.get('quests')?.recheck?.();
    }
  });

  // Wenna was seated in the nursery for M19's reveal and stays for the M20 talks; once M20 is done she goes back to the hall
  // (the post rules only move her while M19 is not active or completed). Placed on completion and again on a load.
  const homeWenna = (): void => void ctx.services.get('npcs')?.place('wenna', M20_WENNA_HOME);
  k.on('quest.completed', (e) => {
    if (e.questId === 'm20') homeWenna();
  });
  k.on('save.loaded', () => {
    // a scene that was playing when the game was saved cannot be (saves are refused in cutscenes); a load starts clean
    playing = false;
    if (k.qstate('m20') === 'completed') homeWenna();
  });
  return offs;
}

export function installD04(k: Kit): Off[] {
  const { ctx } = k;

  // The arena trigger arms on this flag, so it is written when the arena objective is current and not before. It is
  // re-checked on a load and on every objective change (the next objective becomes current after the event is raised).
  const arm = (): void => {
    if (!k.flag(D04_STARTED) && k.active('d04') && k.objCurrent('d04', 'slagmaw')) k.set(D04_STARTED);
  };
  k.on('quest.objective', (e) => {
    if (e.questId === 'd04') k.later(arm);
  });
  k.on('quest.started', (e) => {
    if (e.questId === 'd04') k.later(arm);
  });
  k.on('save.loaded', () => k.later(arm));
  k.later(arm);

  // The Slagmaw is defeated or nothing: no Spare, no release window. The quest's own copy of the outcome lets later readers
  // (the act ending, the codex) ask the quest, and the A8 flag is the truth on a load.
  const record = (): void => {
    if (!k.str('story.d04.outcome')) k.set('story.d04.outcome', 'defeated');
  };
  k.on('boss.defeated', (e) => {
    if (e.bossId === D04_BOSS) record();
  });
  const sync = (): void => {
    if (ctx.state.getString(D04_OUTCOME_FLAG) === 'defeated') record();
  };
  sync();
  k.on('save.loaded', sync);

  return installPools(k);
}
