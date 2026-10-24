// M13 The Warden's Oath (the duel with Hrolf) and R11 Hrolf's Brother's Axe (the den scene, the wyrm's outcome, the axe).
import type { Kit, Off } from './kit';

const TRIAL_GROUP = 'q12.m13.trial';
const R11_WYRM = 'wyrm.r11.den';
/** The plan's ledger (Part 2.1, row R11): the total dragons favour of each outcome, creature mercy included. */
export const R11_FAVOUR = { spared: 5, slain: -4 } as const;

export function installM13(k: Kit): Off[] {
  const { ctx } = k;
  const stop = (): void => ctx.services.get('enemies')?.despawnGroup(TRIAL_GROUP);

  // Hrolf's last line before the ring raises the event: his double steps out and the trial begins.
  k.onNamed('story.m13.duelStart', () => {
    if (!k.active('m13') || !k.objCurrent('m13', 'duel')) return;
    k.later(() => {
      const en = ctx.services.get('enemies');
      const trials = ctx.services.get('trials');
      if (!en || !trials) return k.warn('M13: no enemies or trials service');
      stop();
      const [opponentId] = en.spawnGroup(TRIAL_GROUP);
      if (!opponentId) return k.warn('M13: the trial double did not spawn');
      if (!trials.start({ id: 'm13', opponentId, breaksToWin: 3, standInNpcId: 'hrolf' })) {
        stop();
        k.warn('M13: the trial did not start');
      }
    });
  });
  // However it ends the double goes back to the NPC; the duel objective stays open until the trial is won, and Hrolf
  // offers the ring again.
  k.on('trial.ended', (e) => {
    if (e.trialId === 'm13') k.later(stop);
  });
  k.on('trial.won', (e) => {
    if (e.trialId === 'm13') k.later(stop);
  });
  return [];
}

export function installR11(k: Kit): Off[] {
  const { ctx } = k;

  // The den scene plays once, on the shelf, after both ledges are climbed.
  const denDue = (): boolean => k.active('r11') && k.objDone('r11', 'ledge2') && !k.objDone('r11', 'den');
  const denScene = (): boolean => ctx.services.get('dialogue')?.start('scene-r11-den', 'hrolf') ?? false;
  k.on('trigger.enter', (e) => {
    if (e.actorId !== 'player' || e.triggerId !== 'trg.cinderreach.den' || !denDue()) return;
    k.later(() => void denScene());
  });
  // `trigger.enter` fires only on a crossing: a player already on the shelf when `ledge2` completes, or who loads there,
  // gets the scene too (review-a #9). Checked two ticks on (the inside test can be stale in the tick of a load). While
  // another dialogue holds the screen the scene waits for `dialogue.ended` and tries again, however long that dialogue
  // runs (a fixed count of tries gave up after about 0.7 s; review-fixes-review F2).
  let denWaiting = false;
  const denIfInside = (): void => {
    k.after(2, () => {
      if (!denDue() || !ctx.triggers.isInside('trg.cinderreach.den')) {
        denWaiting = false;
        return;
      }
      denWaiting = !denScene();
    });
  };
  k.on('dialogue.ended', () => {
    if (denWaiting) {
      denWaiting = false;
      denIfInside();
    }
  });
  k.on('quest.objective', (e) => {
    if (e.questId === 'r11' && e.objectiveId === 'ledge2' && e.done) denIfInside();
  });
  k.on('save.loaded', () => {
    denWaiting = false;
    denIfInside();
  });

  // The choice is the outcome: the flag, then the favour, then the group goes (the resting wyrm is A6a's, keyed on the
  // spared flag). A mercy on the den wyrm is a spare; its death is a slaying.
  // The ledger pays dragons +5 for the spare in all. The Calm itself already went through WorldState's creature mercy
  // (+2 for an elite, less at the cap), so the director pays only the rest (review-a #4). The core's `mercy` listener
  // (core.plugin, set up before this one) has recorded that credit by the time this listener runs, and the credit is
  // forgotten when the wyrm despawns, so it is read here and not a tick later.
  const resolve = (outcome: 'spared' | 'slain', actorId?: string): void => {
    if (!k.active('r11') || k.str('story.r11.choice')) return;
    k.set('story.r11.choice', outcome);
    k.emit('story.r11.resolved');
    const credited = outcome === 'spared' && actorId ? ctx.state.mercyApplied(actorId) : 0;
    const rest = R11_FAVOUR[outcome] - credited;
    if (rest !== 0) k.favour('dragons', rest);
    k.later(() => ctx.services.get('enemies')?.despawnGroup(R11_WYRM));
  };
  k.on('actor.died', (e) => {
    if (e.spawnTag === 'r11.den') resolve('slain');
  });
  k.on('mercy', (e) => {
    if (e.actorId && ctx.services.get('enemies')?.alive(R11_WYRM).includes(e.actorId)) resolve('spared', e.actorId);
  });

  // The axe on its cairn: its reactions and its power follow the choice.
  k.on('interact', (e) => {
    if (e.interactableId !== 'use:r11-axe' || e.action === 'mercy' || !k.active('r11')) return;
    ctx.services.get('inventory')?.add(k.str('story.r11.choice') === 'spared' ? 'brothers-axe-lesser' : 'brothers-axe-full', 1);
    k.later(() => void ctx.services.get('dialogue')?.start('scene-r11-axe', 'hrolf'));
  });
  return [];
}
