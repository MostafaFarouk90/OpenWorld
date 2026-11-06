/**
 * The Act 4 `?act4=` fixtures (brief L13, contracts v0.8 item 18). The carried base is the live game at the end of the shipped
 * Phase F run B chain (the whole of Act 3 played headless: the ending, the card, the camp; its own XP, gear, companions and
 * shrines), so no fixture starts from the Act 3 jump's XP floor. Each per-id fixture boots that base, runs only the `?act4=`
 * jump's Act 4 step (inject `ACT4_PREREQS[id]`, Phase H targets set the hold, XP topped to ACT4_START_XP, placement) and
 * saves with the seeded random and the fixed clock of `fixtureDeterminism.ts`, so two runs write identical bytes.
 */
import { bootFromSave, type ChapterHarness } from './chapterHarness';
import { saveFixture } from './fixtureDeterminism';
import { ensure } from './phaseA';
import { ACT4_PREREQS, Act4Jump, WASTE_OPEN_FLAG } from '../quests/act4Jump';
import { act4JumpPorts } from '../quests/act4Jump.plugin';
import { ACT4_BASE_NAME, act4FixtureDefIds, act4FixtureName, type Act4BaseMeta, type Act4FixtureMeta } from './act4FixtureKey';
import { knownQuestDefs } from './act3FixtureKey';
import { runPhaseF } from './phaseF.chain';
import { SPINE_RUN_B } from './phaseFDriver';
import { GREYFEN_RUN_B } from './phaseEDriver';
import { ACT3_JUMP_IDS } from '../quests/act3Jump';

const MAX_TICKS = 3000;
export const ACT4_GEN = 'GEN_FIXTURES=1 npx vitest run src/integration/act4Fixtures.gen';

export interface GeneratedAct4Fixture { save: Record<string, unknown>; meta: Act4FixtureMeta }

const prog = (h: ChapterHarness) => h.ctx.services.require('progression') as unknown as { xp: number; level: number };

/** Plays the shipped Phase F run B chain and saves the live game after the Act 3 camp (about 40 minutes headless). */
export async function generateAct4Base(): Promise<{ save: Record<string, unknown>; meta: Act4BaseMeta }> {
  let out: { save: Record<string, unknown>; meta: Act4BaseMeta } | null = null;
  await runPhaseF('b', SPINE_RUN_B, GREYFEN_RUN_B, async (h) => {
    await h.runAsync(60);
    const save = await saveFixture(h);
    const qs = h.ctx.services.require('quests');
    const p = prog(h);
    out = {
      save,
      meta: {
        fixture: `${ACT4_BASE_NAME}.json`,
        chain: 'phaseF run B (SPINE_RUN_B, GREYFEN_RUN_B): the lower Dragonspine, the Greyfen, the summit, the Act 3 ending and camp',
        level: p.level,
        xp: Math.round(p.xp),
        act3QuestDefs: knownQuestDefs((q) => qs.objectives(q).length > 0, ACT3_JUMP_IDS),
        generatedBy: `${ACT4_GEN} with BASE=1`,
      },
    };
  });
  ensure(out, 'the Phase F chain reached its end and saved the base');
  return out!;
}

/** Boots the carried base and runs `?act4=<id>`'s Act 4 step on it, then saves (the caller seeds `Math.random`). */
export async function generateAct4Fixture(
  base: Record<string, unknown>, baseMeta: Act4BaseMeta, id: string, track?: (h: ChapterHarness) => void,
): Promise<GeneratedAct4Fixture> {
  const h = await bootFromSave(base, { models: false, virtualClock: true });
  track?.(h);
  try {
    ensure(h.loaded, `act4 fixture ${id}: the carried base loaded`);
    const ports = act4JumpPorts(h.ctx);
    const jump = new Act4Jump(id, ports).fromCarriedSave();
    h.ctx.systems.add({ id: 'l13-fixture-jump', fixedPhase: 'rules', order: 900, fixedUpdate: () => jump.tick() });
    for (let i = 0; i < MAX_TICKS && !jump.finished; i += 30) await h.runAsync(30);
    ensure(jump.finished, `act4 fixture ${id}: the jump settled (phase ${jump.phase})`);
    await h.runAsync(60);
    const save = await saveFixture(h);
    const p = prog(h);
    const meta: Act4FixtureMeta = {
      fixture: `${act4FixtureName(id)}.json`,
      id,
      injected: [...(ACT4_PREREQS[id] ?? [])],
      questDefs: knownQuestDefs(ports.hasQuest, act4FixtureDefIds(id)),
      base: { fixture: baseMeta.fixture, level: baseMeta.level, xp: baseMeta.xp },
      xp: Math.round(p.xp),
      level: p.level,
      wasteOpen: h.ctx.state.getBool(WASTE_OPEN_FLAG),
      generatedBy: ACT4_GEN,
      savedAt: 'fixed: Date.now() held at FIXTURE_SAVED_AT while saving',
    };
    return { save, meta };
  } finally {
    h.dispose();
  }
}
