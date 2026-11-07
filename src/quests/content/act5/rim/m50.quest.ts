import type { ObjectiveDef, QuestDef } from '../../../types';
import { reads, story } from '../../act2/helpers';
import { COOL, TCOOL } from './ids';
import { rewardOf } from './rewards';
import { ALRIC } from './m47.quest';

export const M50_CHANNELS = [1, 2, 3] as const;
export type M50Channel = (typeof M50_CHANNELS)[number];
/** N2's flags: a channel routed opens the gate ahead (`cooling.gate.2/.3`); M50 complete opens the forge. Mine to write. */
export const M50_CHANNEL_DONE = (c: M50Channel): string => `story.m50.channel.${c}`;
/** N2's sluice wheel sites, three a channel on the west wall; my props on them. */
export const M50_WHEEL = (c: M50Channel, w: 1 | 2 | 3): string => `use:m50-${c}-${w}`;
export const M50_WHEEL_ANCHOR = (c: M50Channel, w: 1 | 2 | 3): string => `${COOL}.wheel.${c}.${w}`;
/** The chamber's whole-room trigger (N2): entering starts the gauge, leaving resets the channel. */
export const M50_CHAMBER_TRIGGER = (c: M50Channel): string => `${TCOOL}.chan.${c}`;
export const M50_CHECKPOINT = (c: M50Channel): string => `${COOL}.checkpoint.${c}`;
/**
 * The order the stokers' chart shows, wheel numbers west wall south to north (invented, Q6; logged). Each channel differs so a
 * player cannot carry the first order through.
 */
export const M50_ORDER: Readonly<Record<M50Channel, readonly (1 | 2 | 3)[]>> = { 1: [1, 3, 2], 2: [3, 1, 2], 3: [2, 3, 1] };
/** The heat gauge: 60 s to fill; a wrong wheel adds 10 s; a full gauge vents steam (3 m push, 10% health, never below 10%). */
export const M50_GAUGE_S = 60;
export const M50_WRONG_S = 10;
export const M50_STEAM_PUSH_M = 3;
export const M50_STEAM_PCT = 0.1;
/** After this many fails on a channel the chart glows the next wheel (the lesson fallback). */
export const M50_LESSON_AFTER = 2;
/** The gauge's id on the shipped PressureBar (hud.plugin passes it in `ids`). */
export const M50_GAUGE_ID = (c: M50Channel): string => `m50.gauge.${c}`;
export const M50_GOLEMS = (c: 2 | 3 | 4): string => `m50.golems.${c}`;
export const M50_GOLEMS_ARM = (c: 2 | 3 | 4): string => `story.m50.golems${c}Armed`;
export const M50_GOLEMS_DOWN = (c: 2 | 3 | 4): string => `story.m50.golems${c}Down`;
export const M50_GNATS = 'm50.gnats';
export const M50_NOTES = { chart: 'note-m50-chart', key: 'note-m50-key', mark: 'note-m50-mark' } as const;
export const M50_KEEPER = 'm50-keeper-ghost';
export const M50_COOL_SCENE = 'scene-m50-cool';
export const M50_COOLED = 'story.m50.cooled';
/**
 * N2's forge gate (`cooling.forge.gate`) opens on `story.m50.complete`, and the forge holds the last golems and the forge's
 * mark, so the cooled scene writes this flag at its end (the hall has cooled, the forge is open); the quest completes later
 * at Alric's hand-in, and the completion writes it again (harmless). N7's rim anvil reads it the same way.
 */
export const M50_COMPLETE = 'story.m50.complete';

const flagStep = (id: string, key: string, flag: string): ObjectiveDef => story(id, key, flag, { doneWhen: { flag, equals: true } });
const channel = (c: M50Channel): ObjectiveDef => flagStep(`chan${c}`, `quest.m50.chan${c}`, M50_CHANNEL_DONE(c));
const golems = (c: 2 | 3 | 4): ObjectiveDef => flagStep(`golems${c}`, `quest.m50.golems${c}`, M50_GOLEMS_DOWN(c));

/**
 * M50 The Cooling Hall (plan 2.1, 2.7; N2's interior). Alric and the Hall's keeper in the vestibule; the stokers' chart and the
 * valve key; three channels in series, each three sluice wheels turned in the chart's order before the heat gauge fills (the
 * director runs the gauge from N2's chamber trigger; a full gauge vents steam and resets that channel only; after two fails the
 * chart glows the next wheel). Golems wake between channels (chambers 2 and 3, then the forge). The hall cools, the forge opens,
 * the forge's mark; Alric. Completion lights Alric's rim anvil for tier 5 (N7 reads `story.m50.complete`).
 */
export const m50: QuestDef = {
  id: 'm50',
  titleKey: 'quest.m50.title',
  summaryKey: 'quest.m50.summary',
  sequential: true,
  startWhen: { quest: 'm49', state: 'completed' },
  objectives: [
    { id: 'brief', type: 'talk', target: ALRIC, textKey: 'quest.m50.brief' },
    { id: 'keeper', type: 'talk', target: M50_KEEPER, textKey: 'quest.m50.keeper' },
    reads('chart', 'quest.m50.chart', [M50_NOTES.chart]),
    channel(1),
    golems(2),
    reads('key', 'quest.m50.key', [M50_NOTES.key]),
    channel(2),
    golems(3),
    channel(3),
    flagStep('cool', 'quest.m50.cool', M50_COOLED),
    golems(4),
    reads('mark', 'quest.m50.mark', [M50_NOTES.mark]),
    { id: 'report', type: 'talk', target: ALRIC, textKey: 'quest.m50.report' },
  ],
  rewards: rewardOf('m50', 1050),
};
