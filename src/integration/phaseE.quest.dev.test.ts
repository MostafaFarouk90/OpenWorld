// Dev only: one Greyfen quest from its own fixture (Q=m24 npx vitest run src/integration/phaseE.quest.dev).
import { it } from 'vitest';
import { bootFromSave } from './chapterHarness';
import { readAct3Fixture } from '../save/__fixtures__/act3';
import { emptyPhaseCTrail } from './phaseC';
import { GREYFEN_RUN_A, GREYFEN_RUN_B, KILLS_FORCED, playGreyfenQuest } from './phaseEDriver';

declare const process: { env: Record<string, string | undefined> };
const Q = process.env.Q;
it.skipIf(!Q)(`plays ${Q} headless`, async () => {
  const h = await bootFromSave(await readAct3Fixture((process.env.ORDER as 'greyfen') ?? 'greyfen', Q!), { models: true, virtualClock: true });
  const trail = emptyPhaseCTrail();
  try {
    await playGreyfenQuest(h, trail, Q!, process.env.RUN === 'b' ? GREYFEN_RUN_B : GREYFEN_RUN_A);
  } finally {
    console.log(JSON.stringify({ forced: KILLS_FORCED, order: trail.order, scripted: trail.scripted, talks: trail.talks.map((t) => `${t.npc}:${t.nodes}`) }));
  }
}, 900_000);
