import type { ObjectiveDef, QuestDef } from '../../../types';
import { reads, story } from '../../act2/helpers';
import { STAIR, TSTAIR } from './ids';
import { rewardOf } from './rewards';
import { ALRIC } from './m47.quest';

/** The six channels on the Lava Stair; vents on 1, 3, 4 and 6, gantry levers on 2 and 5 (ids agreed with N1, 2026-11-07). */
export const M48_CHANNELS = [1, 2, 3, 4, 5, 6] as const;
export const M48_VENT_CHANNELS = [1, 3, 4, 6] as const;
export const M48_LEVER_CHANNELS = [2, 5] as const;
/** Channel n is crossed when Cael reaches its far lip (a trigger of mine on the agreed anchor). */
export const M48_CROSSED = (n: number): string => `story.m48.chan.${n}`;
export const M48_CHAN_ANCHOR = (n: number): string => `${STAIR}.chan.${n}`;
export const M48_CHAN_NEAR = (n: number): string => `${STAIR}.chan.${n}.near`;
export const M48_CHAN_TRIGGER = (n: number): string => `${TSTAIR}.chan.${n}`;
/** Vent wheel v (1..4): my prop `wheel:m48-<v>` on `caldera.stair.vent.<v>`; N1 PR 2's vent is `vent.stair.<v>`. */
export const M48_WHEEL = (v: number): string => `wheel:m48-${v}`;
export const M48_WHEEL_ANCHOR = (v: number): string => `${STAIR}.vent.${v}`;
export const M48_VENT_ID = (v: number): string => `vent.stair.${v}`;
export const M48_VENT_OPENED = (v: number): string => `story.m48.vent.${v}`;
export const M48_LEVER = (l: number): string => `use:m48-lever-${l}`;
export const M48_LEVER_ANCHOR = (l: number): string => `${STAIR}.lever.${l}`;
export const M48_LEVER_PULLED = (l: number): string => `story.m48.lever.${l}`;
export const M48_GROUPS = { golems: 'm48.golems', gnats: 'm48.gnats' } as const;
export const M48_DOWN = { golems: 'story.m48.golemsDown', gnats: 'story.m48.gnatsDown' } as const;
export const M48_NOTES = { marks: 'note-m48-marks', tally: 'note-m48-tally', cache: 'note-m48-cache' } as const;
export const M48_GHOST = 'm48-stoker-ghost';
export const M48_VENTS_SCENE = 'scene-m48-vents';
export const M48_VENTS_ROAR = 'story.m48.ventsRoar';

/** What precedes each crossing: the vent wheel or the gantry lever on that channel. */
function before(n: number): ObjectiveDef {
  const v = (M48_VENT_CHANNELS as readonly number[]).indexOf(n);
  if (v >= 0) {
    const f = M48_VENT_OPENED(v + 1);
    return story(`vent${v + 1}`, `quest.m48.vent${v + 1}`, f, { doneWhen: { flag: f, equals: true } });
  }
  const l = (M48_LEVER_CHANNELS as readonly number[]).indexOf(n) + 1;
  return { id: `lever${l}`, type: 'interact', target: M48_LEVER(l), textKey: `quest.m48.lever${l}` };
}
const cross = (n: number): ObjectiveDef => story(`chan${n}`, `quest.m48.chan${n}`, M48_CROSSED(n), { doneWhen: { flag: M48_CROSSED(n), equals: true } });
const down = (g: keyof typeof M48_DOWN): ObjectiveDef => story(g, `quest.m48.${g}`, M48_DOWN[g], { doneWhen: { flag: M48_DOWN[g], equals: true } });

/**
 * M48 The Lava Stair (plan 2.1, 2.7). Alric at the stair's head; six lava channels down the inner wall, each crossed by a Surge
 * Leap from a marked lip or on the cooled crust while its vent is open; four vent wheels and two gantry levers; golems and gnats
 * on the terraces; a stoker's ghost on the middle landing; the stokers' marks and tally; the vents roar open; the stoker's cache
 * at the foot; Alric. Lava never kills (N3): it throws Cael to the last safe lip. A crossing is the far lip's trigger, so a Leap
 * and a crust walk count the same and nothing locks.
 */
export const m48: QuestDef = {
  id: 'm48',
  titleKey: 'quest.m48.title',
  summaryKey: 'quest.m48.summary',
  sequential: true,
  startWhen: { quest: 'm47', state: 'completed' },
  objectives: [
    { id: 'brief', type: 'talk', target: ALRIC, textKey: 'quest.m48.brief' },
    before(1), cross(1),
    reads('marks', 'quest.m48.marks', [M48_NOTES.marks]),
    before(2), cross(2),
    down('golems'),
    before(3), cross(3),
    { id: 'ghost', type: 'talk', target: M48_GHOST, textKey: 'quest.m48.ghost' },
    before(4), cross(4),
    reads('tally', 'quest.m48.tally', [M48_NOTES.tally]),
    before(5), cross(5),
    down('gnats'),
    before(6),
    story('roar', 'quest.m48.roar', M48_VENTS_ROAR, { doneWhen: { flag: M48_VENTS_ROAR, equals: true } }),
    cross(6),
    reads('cache', 'quest.m48.cache', [M48_NOTES.cache]),
    { id: 'report', type: 'talk', target: ALRIC, textKey: 'quest.m48.report' },
  ],
  rewards: rewardOf('m48', 1000),
};
