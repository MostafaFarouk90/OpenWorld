// M31 (K13 PR 2): the gate, the three ledges, the hearth, the offer scenes, and the Coal-Mother's trial. The trial restarts on any end that is not an
// outcome (distance, a teleport, a load, a despawn, a stop, or a start that did not take); a loss restarts inside K6a and writes nothing.
import type { Kit } from './shared';
import { distanceTo, offerScene, recheck, toast, ysmeryth } from './shared';
import { trialOutcome } from '../../../../../companions/trials';
import {
  M31_AFTER_NPC, M31_AFTER_SCENE, M31_AT_GATE, M31_BEFORE_NPC, M31_BEFORE_SCENE, M31_CHOICE, M31_CLIMB_NPC, M31_CLIMB_SCENE, M31_FAVOUR, M31_FAVOURED,
  M31_HEARTH, M31_LEDGE_FLAGS, M31_RESPECT, M31_RESPECT_SOURCE, M31_TRIAL_BEGUN,
} from '../m31.quest';

export const TRIAL_ID = 'ysmeryth-trial';
export const ARENA = 'dragonspine.roost.arena.centre';
/** K6a's rule: further than this from the arena centre ends the trial (we wait until Cael is back inside). */
export const ARENA_LEAVE = 80;
export const REACH31 = { gate: 30, ledge: 3.5, hearth: 25, before: 35 };
/** Polls (a second each) the player must stand inside before a trial (re)starts. */
export const RESTART_GRACE_POLLS = 3;

export function installM31(k: Kit): void {
  const { ctx } = k;
  const trials = () => ctx.services.get('trials');

  k.every(30, () => {
    if (!k.active('m31')) return;
    if (!k.flag(M31_AT_GATE) && k.objCurrent('m31', 'gate') && distanceTo(k, 'dragonspine.summit-gate') <= REACH31.gate) {
      k.set(M31_AT_GATE);
      k.emit(M31_AT_GATE);
      k.later(() => recheck(k));
    }
    M31_LEDGE_FLAGS.forEach((f, i) => {
      if (k.flag(f)) return;
      const a = ctx.anchors.find(`dragonspine.roost.leap.${i + 1}`);
      if (!a || distanceTo(k, a.id) > REACH31.ledge || ctx.player.feet.y < a.position.y - 1.5) return;
      k.set(f);
      k.emit(f);
      toast(k, 'dragonspine.q.m31.ledge');
      k.later(() => recheck(k));
    });
    if (k.str(M31_CHOICE) && !k.flag(M31_HEARTH) && k.objCurrent('m31', 'hearth') && distanceTo(k, 'dragonspine.hearth.eadgyth') <= REACH31.hearth) {
      k.set(M31_HEARTH);
      k.emit(M31_HEARTH);
      k.later(() => recheck(k));
    }
  });

  offerScene(k, { quest: 'm31', objective: 'climb', scene: M31_CLIMB_SCENE, npc: M31_CLIMB_NPC });
  offerScene(k, { quest: 'm31', objective: 'before', scene: M31_BEFORE_SCENE, npc: M31_BEFORE_NPC, ready: () => distanceTo(k, ARENA) <= REACH31.before });
  offerScene(k, { quest: 'm31', objective: 'after', scene: M31_AFTER_SCENE, npc: M31_AFTER_NPC });

  // ---- The outcome: favour once, the Surge charge once, Ysmeryth sent away ------------------------------------------------------------------
  let sent = false;
  const settle = (): void => {
    const choice = k.str(M31_CHOICE);
    if (choice !== 'won' && choice !== 'yielded') return;
    if (!k.flag(M31_FAVOURED)) {
      k.set(M31_FAVOURED);
      k.favour('dragons', M31_FAVOUR[choice]);
      toast(k, choice === 'won' ? 'dragonspine.q.m31.respect' : 'dragonspine.q.m31.trust');
    }
    if (choice === 'won' && !k.flag(M31_RESPECT)) {
      const spells = ctx.services.get('spells');
      if (spells) {
        spells.addSurgeCharges(1, M31_RESPECT_SOURCE);
        k.set(M31_RESPECT);
      }
    }
    if (!sent) { sent = true; ysmeryth(k)?.endTrial(); }
  };
  k.on('trial.ended', (e) => {
    if (e.trialId !== TRIAL_ID || !k.active('m31') || k.str(M31_CHOICE)) return;
    const out = trialOutcome(e.reason);
    if (out !== 'won' && out !== 'yielded') return;
    k.set(M31_CHOICE, out);
    settle();
    k.later(() => recheck(k));
  });
  k.on('save.loaded', () => { sent = false; k.later(settle); });
  k.every(60, settle);

  // ---- The restart: one poll a second ------------------------------------------------------------------------------------------------
  let calm = 0;
  k.on('save.loaded', () => { calm = 0; });
  k.every(60, () => {
    const want = k.active('m31') && k.objCurrent('m31', 'trial') && !k.str(M31_CHOICE);
    const running = trials()?.state()?.id === TRIAL_ID;
    if (!want || running || distanceTo(k, ARENA) > ARENA_LEAVE) { calm = 0; return; }
    if (++calm < RESTART_GRACE_POLLS) return;
    const y = ysmeryth(k);
    if (!y) return;
    const first = !k.flag(M31_TRIAL_BEGUN);
    if (y.beginTrial()) {
      k.set(M31_TRIAL_BEGUN);
      if (!first) toast(k, 'dragonspine.q.m31.called');
      calm = 0;
    } else calm = RESTART_GRACE_POLLS - 1; // a false start: try again next second
  });
}
