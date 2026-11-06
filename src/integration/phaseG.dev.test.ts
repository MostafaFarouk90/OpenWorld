// Dev runner (skipped unless PHASE_G_DEV is set): plays one Phase G quest from its ?act4= fixture, for working on the driver.
//   PHASE_G_DEV=m35 [PHASE_G_RUN=b] npx vitest run src/integration/phaseG.dev.test
import { describe, it } from 'vitest';
import { bootFromSave } from './chapterHarness';
import { readAct4Fixture } from '../save/__fixtures__/act4';
import { QuestProps } from '../quests/props';
import { PHASE_G_RUN_A, PHASE_G_RUN_B, type PhaseGQuest } from './phaseG';
import { newWatch, playPhaseGQuest, wantedFlags, watchDialogueRunner, type PhaseGRun } from './phaseGDriver';

const ENV = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};

const ID = ENV.PHASE_G_DEV as PhaseGQuest | undefined;

describe.skipIf(!ID)('Phase G dev runner', () => {
  it(`plays ${ID}`, async () => {
    watchDialogueRunner();
    const propsSeen: unknown[] = [];
    const pu = QuestProps.prototype.update;
    QuestProps.prototype.update = function (this: unknown) { if (!propsSeen.includes(this)) propsSeen.push(this); return pu.call(this as never); };
    const c = ENV.PHASE_G_RUN === 'b' ? PHASE_G_RUN_B : PHASE_G_RUN_A;
    const h = await bootFromSave(await readAct4Fixture(ID!), { models: true, virtualClock: true });
    const r: PhaseGRun = { h, c, want: wantedFlags(c), watch: newWatch(), trail: { talks: [], scripted: [], order: [] }, picks: [], used: new Set() };
    const t0 = h.clock.ms;
    try {
      await playPhaseGQuest(r, ID!);
    } finally {
      QuestProps.prototype.update = pu;
      console.log(JSON.stringify({ id: ID, s: Math.round((h.clock.ms - t0) / 1000), order: r.trail.order, picks: r.picks, scripted: r.trail.scripted, nodes: r.trail.talks.reduce((n, t) => n + t.nodes, 0), talks: r.trail.talks.map((x) => `${x.npc}:${x.nodes}`).join(' '), watch: r.watch }, null, 1));
      if (ENV.PHASE_G_DUMP) {
        const re = new RegExp(ENV.PHASE_G_DUMP!);
        const items = [...(h.ctx.interaction as unknown as { items: Map<string, unknown> }).items.keys()].filter((k) => re.test(k));
        const anchors = (h.ctx.anchors as unknown as { all?(): { id: string; position: { x: number; y: number; z: number } }[] }).all?.()?.filter((a) => re.test(a.id)).map((a) => `${a.id}@${[a.position.x, a.position.y, a.position.z].map(Math.round)}`);
        const pend = propsSeen.map((x) => (x as { pending(): string[]; failed: Set<string> })).map((x) => ({ pending: x.pending().filter((k) => re.test(k)), failed: [...x.failed].filter((k) => re.test(k)) }));
        console.log('DUMP', JSON.stringify({ pend, items, anchors, interior: h.ctx.services.get('interiors')?.current, q: h.ctx.services.require('quests').objectives(ID!).map((o) => `${o.def.id}:${o.done ? 'd' : o.current ? '*' : '-'}`) }));
      }
      h.dispose();
    }
  }, 1_800_000);
});
