// M13 The Warden's Oath (the duel with Hrolf) and R11 Hrolf's Brother's Axe (the den scene, the wyrm's outcome, the axe).
import type { Kit, Off } from './kit';

const TRIAL_GROUP = 'q12.m13.trial';
const R11_WYRM = 'wyrm.r11.den';

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
  k.on('trigger.enter', (e) => {
    if (e.actorId !== 'player' || e.triggerId !== 'trg.cinderreach.den') return;
    if (!k.active('r11') || !k.objDone('r11', 'ledge2') || k.objDone('r11', 'den')) return;
    k.later(() => void ctx.services.get('dialogue')?.start('scene-r11-den', 'hrolf'));
  });

  // The choice is the outcome: the flag, then the favour, then the group goes (the resting wyrm is A6a's, keyed on the
  // spared flag). A mercy on the den wyrm is a spare; its death is a slaying.
  const resolve = (outcome: 'spared' | 'slain'): void => {
    if (!k.active('r11') || k.str('story.r11.choice')) return;
    k.set('story.r11.choice', outcome);
    k.emit('story.r11.resolved');
    k.favour('dragons', outcome === 'spared' ? 5 : -4);
    k.later(() => ctx.services.get('enemies')?.despawnGroup(R11_WYRM));
  };
  k.on('actor.died', (e) => {
    if (e.spawnTag === 'r11.den') resolve('slain');
  });
  k.on('mercy', (e) => {
    if (e.actorId && ctx.services.get('enemies')?.alive(R11_WYRM).includes(e.actorId)) resolve('spared');
  });

  // The axe on its cairn: its reactions and its power follow the choice.
  k.on('interact', (e) => {
    if (e.interactableId !== 'use:r11-axe' || e.action === 'mercy' || !k.active('r11')) return;
    ctx.services.get('inventory')?.add(k.str('story.r11.choice') === 'spared' ? 'brothers-axe-lesser' : 'brothers-axe-full', 1);
    k.later(() => void ctx.services.get('dialogue')?.start('scene-r11-axe', 'hrolf'));
  });
  return [];
}
