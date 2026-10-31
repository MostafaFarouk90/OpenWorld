/**
 * The Act 3 `?act3=` fixtures (brief K16, contracts v0.7 item 22): one save per Act 3 quest id and block order, written
 * right after K0's jump settles on a fresh game, so a fixture is exactly the jump's order semantics frozen. Each is
 * generated on its own fresh boot with the seeded random and the fixed clock of `fixtureDeterminism.ts`, so two runs
 * write identical bytes. Regenerate with `GEN_FIXTURES=1 npx vitest run src/integration/act3Fixtures.gen.test.ts`
 * whenever a quest thread's defs land (they change what the injection writes; `?act3=` then sees the fixture as stale).
 */
import { bootChapter, type ChapterHarness } from './chapterHarness';
import { saveFixture } from './fixtureDeterminism';
import { ensure } from './phaseA';
import { ACT3_PREREQS, Act3Jump, type Act3Order } from '../quests/act3Jump';
import { act3JumpPorts } from '../quests/act3Jump.plugin';
import { ACT3_BLOCKS, type Act3BlockId } from '../enemies/level';
import { act3FixtureName, fixtureDefIds, knownQuestDefs, type Act3FixtureMeta } from './act3FixtureKey';
import { blockLevelFlag } from '../shrine/warmthBlocks';

/** Ticks the jump may take (the replay of Acts 1 and 2 is a few hundred; placement retries are bounded by the plugin). */
const MAX_TICKS = 6000;

export interface GeneratedAct3Fixture { save: Record<string, unknown>; meta: Act3FixtureMeta }

/** Plays `?act3=<id>&order=<order>` on a fresh headless game (the caller seeds `Math.random`) and saves it. */
export async function generateAct3Fixture(id: string, order: Act3Order, track?: (h: ChapterHarness) => void): Promise<GeneratedAct3Fixture> {
  const h = await bootChapter({ models: false, virtualClock: true });
  track?.(h);
  try {
    const ports = act3JumpPorts(h.ctx);
    const jump = new Act3Jump(id, order, ports);
    h.ctx.systems.add({ id: 'k16-fixture-jump', fixedPhase: 'rules', order: 900, fixedUpdate: () => jump.tick() });
    for (let i = 0; i < MAX_TICKS && !jump.finished; i += 30) await h.runAsync(30);
    ensure(jump.finished, `act3 fixture ${order} ${id}: the jump settled (phase ${jump.phase})`);
    // Let the placement, the locks and any toast settle before saving.
    await h.runAsync(60);
    const save = await saveFixture(h);
    const blocks: Partial<Record<Act3BlockId, number>> = {};
    for (const b of Object.keys(ACT3_BLOCKS) as Act3BlockId[]) {
      const v = h.ctx.state.getFlag(blockLevelFlag(b));
      if (typeof v === 'number') blocks[b] = v;
    }
    const meta: Act3FixtureMeta = {
      fixture: `${act3FixtureName(order, id)}.json`,
      id,
      order,
      injected: [...(ACT3_PREREQS[order][id] ?? [])],
      questDefs: knownQuestDefs(ports.hasQuest, fixtureDefIds(id, order)),
      lockedBlocks: blocks,
      generatedBy: 'GEN_FIXTURES=1 npx vitest run src/integration/act3Fixtures.gen.test.ts',
      savedAt: 'fixed: Date.now() held at FIXTURE_SAVED_AT while saving',
    };
    return { save, meta };
  } finally {
    h.dispose();
  }
}
