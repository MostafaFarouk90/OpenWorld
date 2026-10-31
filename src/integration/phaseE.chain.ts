/**
 * The shared body of the Phase E chain tests (run A and run B each in its own file, so each boot has a worker to itself):
 * the nine Greyfen quests played headless from the run's start fixture through D05, the peaks card shown once, the
 * Dragonspine's hold as the run expects, and the 52% gate on K12's rows with the nodes this run read.
 */
import { expect } from 'vitest';
import { bootPhaseE, measurePhaseE, PHASE_E_ORDER } from './phaseE';
import { KILLS_FORCED, playGreyfenChain, type GreyfenChoices } from './phaseEDriver';
import { act3TimingMarkdown } from './act3Timing';
import { GREYFEN_PACE, paceAt } from '../quests/content/act3/greyfen/pacing';
import { PEAKS_CARD_SEEN_FLAG } from './phaseECard';
import type { PhaseECardHandle } from './phaseE.plugin';
import { fogOpenById } from '../region/fogWall';
import { ACT3_ARRIVAL } from '../quests/act3Jump';
import { DRAGONSPINE_OPEN_FLAG } from '../quests/act3Jump';

/** The shortcuts a run may name: the dives (swum along the routes), the ferry boarded without its menu, the boss's blows. */
const ALLOWED_SCRIPTED = [/^dive dive\.greyfen\./, /^ferry reedgate to mere: boarded by F without the stop menu$/, /^murkjaw: \d+ blows of 70 while hittable/];

export async function runPhaseE(run: 'a' | 'b', choices: GreyfenChoices, dragonspineOpen: boolean): Promise<string> {
  KILLS_FORCED.length = 0;
  const h = await bootPhaseE(run);
  try {
    const trails = await playGreyfenChain(h, PHASE_E_ORDER, choices);
    for (const q of PHASE_E_ORDER) expect(h.ctx.services.require('quests').state(q), q).toBe('completed');
    // The run's branches were the ones taken.
    expect(h.ctx.state.getString('story.r12.pick')).toBe(choices.r12);
    expect(h.ctx.state.getString('story.r14.choice')).toBe(choices.r14);

    // Every shortcut named, and only the known ones; no kill the damage service refused.
    const scripted = Object.values(trails).flatMap((t) => t.scripted);
    expect(scripted.filter((s) => !ALLOWED_SCRIPTED.some((r) => r.test(s)))).toEqual([]);
    expect(KILLS_FORCED).toEqual([]);

    // The card, once, with the line for the hold as it stands.
    const card = (globalThis as { __phaseECard?: PhaseECardHandle }).__phaseECard;
    expect(card?.visible, 'the peaks card is up after D05').toBe(true);
    expect(h.ctx.state.getBool(PEAKS_CARD_SEEN_FLAG)).toBe(true);
    expect(h.ctx.state.getBool(DRAGONSPINE_OPEN_FLAG)).toBe(dragonspineOpen);
    const c = h.ctx.services.require('containment');
    expect(c.isOpen(ACT3_ARRIVAL.spine.x, ACT3_ARRIVAL.spine.z), 'the lodge').toBe(dragonspineOpen);
    expect(fogOpenById('fog.dragonspine', h.ctx.state)).toBe(dragonspineOpen);

    // The 52% gate on the Greyfen rows with the nodes read here.
    const { report, gate } = measurePhaseE(GREYFEN_PACE, trails, paceAt);
    const md = act3TimingMarkdown(report);
    expect(report.failures, md).toEqual([]);
    expect(gate.reasons, md).toEqual([]);
    return `${md}\n\nscripted: ${scripted.join('; ')}`;
  } finally {
    h.dispose();
  }
}
