// Dev only: one Phase F quest from its own fixture (Q=m28 ORDER=greyfen RUN=a npx vitest run src/integration/phaseF.quest.dev).
import { it } from 'vitest';
import { bootFromSave } from './chapterHarness';
import { readAct3Fixture } from '../save/__fixtures__/act3';
import { emptyPhaseCTrail } from './phaseC';
import { KILLS_FORCED } from './phaseEDriver';
import { SPINE_RUN_A, SPINE_RUN_B, playSpineQuest } from './phaseFDriver';

declare const process: { env: Record<string, string | undefined> };
const Q = process.env.Q;
it.skipIf(!Q)(`plays ${Q} headless`, async () => {
  const h = await bootFromSave(await readAct3Fixture((process.env.ORDER as 'greyfen') ?? 'greyfen', Q!), { models: true, virtualClock: true });
  KILLS_FORCED.length = 0;
  const trail = emptyPhaseCTrail();
  const t0 = Date.now();
  try {
    await playSpineQuest(h, trail, Q!, process.env.RUN === 'b' ? SPINE_RUN_B : SPINE_RUN_A);
  } finally {
    console.log(JSON.stringify({ wall: Date.now() - t0, virt: h.clock.ms, forced: KILLS_FORCED, order: trail.order, scripted: trail.scripted, talks: trail.talks.map((t) => `${t.npc}:${t.nodes}`) }));
  }
}, 900_000);
