// Dev runner (skipped unless PHASE_H_DEV is set): plays one Phase H quest from its ?act4= fixture, for working on the driver.
//   PHASE_H_DEV=m42 [PHASE_H_RUN=b] npx vitest run src/integration/phaseH.dev.test
import { describe, it } from 'vitest';
import { bootFromSave } from './chapterHarness';
import { readAct4Fixture } from '../save/__fixtures__/act4';
import { PHASE_G_RUN_A, PHASE_G_RUN_B } from './phaseG';
import { newWatch, wantedFlags, watchDialogueRunner } from './phaseGDriver';
import { PHASE_H_RUN_A, PHASE_H_RUN_B, PHASE_H_MERCY_B, playPhaseHQuest, wantedFlagsH, type PhaseHQuest, type PhaseHRun } from './phaseHDriver';

const ENV = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const ID = ENV.PHASE_H_DEV as PhaseHQuest | undefined;

describe.skipIf(!ID)('Phase H dev runner', () => {
  it(`plays ${ID}`, async () => {
    watchDialogueRunner();
    const b = ENV.PHASE_H_RUN === 'b';
    const c = b ? PHASE_G_RUN_B : PHASE_G_RUN_A;
    const hc = b ? PHASE_H_RUN_B : PHASE_H_RUN_A;
    const h = await bootFromSave(await readAct4Fixture(ID!), { models: true, virtualClock: true });
    const r: PhaseHRun = {
      h, c, hc, want: { ...wantedFlags(c), ...wantedFlagsH(hc) }, watch: newWatch(), trail: { talks: [], scripted: [], order: [] }, picks: [], used: new Set(),
      ...(b ? { mercy: PHASE_H_MERCY_B } : {}),
    };
    const t0 = h.clock.ms;
    try {
      await playPhaseHQuest(r, ID!);
    } finally {
      const q = h.ctx.services.require('quests');
      console.log(JSON.stringify({
        id: ID, s: Math.round((h.clock.ms - t0) / 1000), order: r.trail.order, picks: r.picks, scripted: r.trail.scripted,
        nodes: r.trail.talks.reduce((n, t) => n + t.nodes, 0), talks: r.trail.talks.map((x) => `${x.npc}:${x.nodes}`).join(' '), watch: r.watch,
        objectives: q.objectives(ID!).map((o) => `${o.def.id}:${o.done ? 'd' : o.current ? '*' : '-'}`).join(' '),
        feet: h.ctx.player.feet.toArray().map(Math.round), level: (h.ctx.services.require('progression') as unknown as { level: number }).level,
      }, null, 1));
      h.dispose();
    }
  }, 1_800_000);
});
