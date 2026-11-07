import type { Condition, ObjectiveDef, QuestDef } from '../../../types';
import { reads, story } from '../../act2/helpers';
import { rewardOf } from './rewards';

/** F-row of plan 2.5: `story.r26.choice` = `fast` (Oswin -3) or `long` (Oswin +3); N4's siege reads it for the crates. */
export const R26_CHOICE = 'story.r26.choice';
export const R26_FAST = 'fast';
export const R26_LONG = 'long';
export const R26_MASTER = 'r26-convoy-master';
export const R26_GUARD = (n: 1 | 2): string => `r26-guard-${n}`;
export const R26_ESCORT = 'r26.convoy';
export const R26_LOAD = 'use:r26-load';
export const R26_LOADED = 'story.r26.loaded';
export const R26_UNLOAD = 'use:r26-unload';
export const R26_UNLOADED = 'story.r26.unloaded';
/** The cart is out (Brand's R24 pattern): the master walks with it, his Rimfoot post is empty. */
export const R26_CART_OUT = 'story.r26.cartOut';
/** A guard walks with the cart (his post is empty); cleared when he is carried off wounded or the convoy is in. */
export const R26_GUARD_OUT = (n: 1 | 2): string => `story.r26.guard${n}Out`;
export const R26_ARRIVED = 'story.r26.arrived';
/** Fast road: two ambushes, each followed by a guard carried off wounded (seen recovering at the camp's aid tent). */
export const R26_AMBUSH = ['r26.ambush.1', 'r26.ambush.2'] as const;
export const R26_AMBUSH_ARM = (n: 1 | 2): string => `story.r26.ambush${n}Armed`;
export const R26_AMBUSH_DOWN = (n: 1 | 2): string => `story.r26.ambush${n}Down`;
export const R26_WOUNDED = (n: 1 | 2): string => `story.r26.wounded.${n}`;
/** Long road: two storm halts, the brake set at each, and two of six crates left at the second. */
export const R26_BRAKE = (n: 1 | 2): string => `use:r26-brake-${n}`;
export const R26_BRAKED = (n: 1 | 2): string => `story.r26.brake${n}`;
export const R26_AT_HALT = (n: 1 | 2): string => `story.r26.atHalt${n}`;
export const R26_WAITED = (n: 1 | 2): string => `story.r26.waited${n}`;
export const R26_CRATES_LEFT = 'story.r26.cratesLeft';
export const R26_HALT_S = 30;
export const R26_NOTES = { manifest: 'note-r26-manifest', waybill: 'note-r26-waybill' } as const;
export const R26_SCENE = 'scene-r26-convoy';
export const R26_IN = 'story.r26.in';

const done = (o: string): Condition => ({ objective: ['r26', o], done: true });
const FAST: Condition = { flag: R26_CHOICE, equals: R26_FAST };
const LONG: Condition = { flag: R26_CHOICE, equals: R26_LONG };
const flagDone = (id: string, key: string, flag: string, when: Condition, optional = false): ObjectiveDef =>
  story(id, key, flag, { doneWhen: { flag, equals: true }, when, ...(optional ? { optional: true } : {}) });

/**
 * R26 Oswin's Loyalists (plan 2.1, 2.7; reading logged under "Act 5 N10"). Merrin at the camp: the last convoy stopped at the
 * Rimfoot fire and will not climb the rim in the open. The convoy master, a guard and the manifest at Rimfoot; the road is chosen
 * at the master's talk (`story.r26.choice`, written at the choice, so a load mid-road keeps it); load the cart (L4's escort, the
 * cart never dies). Fast: straight up the rim stairs, two ambushes, a guard carried off wounded after each, every crate arrives.
 * Long: the east flank and round by the hairpin, two storm halts with the brake set, no ambush, two crates left at the second
 * halt. The convoy comes in, the cart is unloaded and the waybill read; Merrin. The branch steps are optional and the step after
 * them waits on either branch, so neither branch can stall the other.
 */
const objectives: ObjectiveDef[] = [
  { id: 'brief', type: 'talk', target: 'merrin', textKey: 'quest.r26.brief' },
  { id: 'guard', type: 'talk', target: R26_GUARD(1), textKey: 'quest.r26.guard', when: done('brief') },
  reads('manifest', 'quest.r26.manifest', [R26_NOTES.manifest], { when: done('brief') }),
  { id: 'master', type: 'talk', target: R26_MASTER, textKey: 'quest.r26.master', when: { all: [done('guard'), done('manifest')] } },
  { id: 'load', type: 'interact', target: R26_LOAD, textKey: 'quest.r26.load', when: done('master') },
  // the fast road's ambushes
  ...([1, 2] as const).map((n) => flagDone(`ambush${n}`, `quest.r26.ambush${n}`, R26_AMBUSH_DOWN(n), { all: [done('load'), FAST] }, true)),
  // the long road's two storm halts (the brake, then the wall passes)
  ...([1, 2] as const).flatMap((n) => [
    { id: `brake${n}`, type: 'interact' as const, target: R26_BRAKE(n), textKey: `quest.r26.brake${n}`, optional: true, when: { all: [done('load'), LONG, { flag: R26_AT_HALT(n), equals: true }] } },
    flagDone(`halt${n}`, `quest.r26.halt${n}`, R26_WAITED(n), { all: [done('load'), LONG] }, true),
  ]),
  flagDone('road', 'quest.r26.road', R26_ARRIVED, done('load')),
  flagDone('in', 'quest.r26.in', R26_IN, done('road')),
  { id: 'unload', type: 'interact', target: R26_UNLOAD, textKey: 'quest.r26.unload', when: done('in') },
  reads('waybill', 'quest.r26.waybill', [R26_NOTES.waybill], { when: done('unload') }),
  { id: 'report', type: 'talk', target: 'merrin', textKey: 'quest.r26.report', when: done('waybill') },
];

export const r26: QuestDef = {
  id: 'r26',
  titleKey: 'quest.r26.title',
  summaryKey: 'quest.r26.summary',
  startWhen: { quest: 'm49', state: 'completed' },
  objectives,
  rewards: rewardOf('r26', 700),
};
