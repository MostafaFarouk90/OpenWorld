/**
 * The Act 5 `?act5=` fixtures (brief N12 PR 1). The carried base is the live game at the end of L13's Phase H run A chain
 * (the whole of Act 4 played headless: the ending, the card, the Rimfoot camp; its own XP, gear, companions, Scars and
 * favour), so no fixture starts from a jump's XP floor. Each per-id fixture boots that base, runs only the `?act5=` jump's
 * Act 5 step (`Act5Jump.fromCarriedSave()`: the Rim Gate flag after M47, the Phase J hold flag for Phase J targets,
 * `ACT5_PREREQS[id]` injected, XP topped to ACT5_START_XP, the landing) and saves with the seeded random and fixed clock of
 * `fixtureDeterminism.ts`, so two runs write identical bytes. No favour preset is stored: the jump applies one on load.
 */
import { bootFromSave, type ChapterHarness } from './chapterHarness';
import { saveFixture } from './fixtureDeterminism';
import { ensure } from './phaseA';
import { settleScenes } from './act4Fixtures';
import { ACT5_PREREQS, Act5Jump } from '../quests/act5Jump';
import { act5JumpPorts } from '../quests/act5Jump.plugin';
import { FOUNDRY_OPEN_FLAG, RIM_GATE_OPEN_FLAG, CALDERA_CENTRE } from '../region/act5Regions';
import { knownQuestDefs } from './act3FixtureKey';
import { act5FixtureDefIds, act5FixtureName, type Act5BaseMeta, type Act5FixtureMeta } from './act5FixtureKey';
import { LAVA_STAIR } from '../caldera/calderaSites';

const MAX_TICKS = 3000;
export const ACT5_GEN = 'GEN_FIXTURES=1 npx vitest run src/integration/act5Fixtures.gen';

export interface GeneratedAct5Fixture { save: Record<string, unknown>; meta: Act5FixtureMeta }

const prog = (h: ChapterHarness) => h.ctx.services.require('progression') as unknown as { xp: number; level: number };

/** Boots the carried base and runs `?act5=<id>`'s Act 5 step on it, then saves (the caller seeds `Math.random`). */
export async function generateAct5Fixture(
  base: Record<string, unknown>, baseMeta: Pick<Act5BaseMeta, 'fixture' | 'level' | 'xp'>, id: string,
): Promise<GeneratedAct5Fixture> {
  const h = await bootFromSave(base, { models: false, virtualClock: true });
  try {
    ensure(h.loaded, `act5 fixture ${id}: the carried base loaded`);
    const ports = act5JumpPorts(h.ctx);
    const jump = new Act5Jump(id, ports).fromCarriedSave();
    h.ctx.systems.add({ id: 'n12-fixture-jump', fixedPhase: 'rules', order: 900, fixedUpdate: () => jump.tick() });
    for (let i = 0; i < MAX_TICKS && !jump.finished; i += 30) await h.runAsync(30);
    ensure(jump.finished, `act5 fixture ${id}: the jump settled (phase ${jump.phase})`);
    // M47 starts by itself on the gate; a quest may open a scene on the landing: read it through, as a player would.
    await settleScenes(h);
    // The base is the chain's last moment; a jump starts rested (the camp is a night's rest).
    const a = h.ctx.player.actor;
    h.ctx.damage.heal(a.id, a.maxHealth);
    a.restoreStamina(a.maxStamina);
    await h.runAsync(60);
    const save = await saveFixture(h);
    const p = prog(h);
    const meta: Act5FixtureMeta = {
      fixture: `${act5FixtureName(id)}.json`,
      id,
      injected: [...(ACT5_PREREQS[id] ?? [])],
      questDefs: knownQuestDefs(ports.hasQuest, act5FixtureDefIds(id)),
      base: { fixture: baseMeta.fixture, level: baseMeta.level, xp: baseMeta.xp },
      xp: Math.round(p.xp),
      level: p.level,
      rimGateOpen: h.ctx.state.getBool(RIM_GATE_OPEN_FLAG),
      foundryOpen: h.ctx.state.getBool(FOUNDRY_OPEN_FLAG),
      generatedBy: ACT5_GEN,
      savedAt: 'fixed: Date.now() held at FIXTURE_SAVED_AT while saving',
    };
    return { save, meta };
  } finally {
    h.dispose();
  }
}

/** Extra fixtures for the soft-lock guards: each boots a per-id fixture, sets one state up and saves (no meta). */
export interface Act5Extra {
  name: string;
  from: string;
  setUp(h: ChapterHarness): Promise<void>;
}

async function standAt(h: ChapterHarness, x: number, z: number): Promise<void> {
  const { heightAt } = await import('../terrain/heightfield');
  h.ctx.player.teleport({ x, y: heightAt(x, z) + 0.05, z }, 0);
  await h.runAsync(2);
}

/** A point well inside the bowl floor (held in Phase I), between the floor wall and the lava ring. */
export const INSIDE_FLOOR_POINT = { x: CALDERA_CENTRE.x + 380, z: CALDERA_CENTRE.z } as const;

export const ACT5_EXTRAS: readonly Act5Extra[] = [
  {
    // An old save standing inside the bowl floor while the Phase I hold stands: the load must land outside the floor.
    name: 'inside-floor-phase-i',
    from: 'm51',
    setUp: (h) => standAt(h, INSIDE_FLOOR_POINT.x, INSIDE_FLOOR_POINT.z),
  },
  {
    // A save on the Lava Stair between channels during M48: the load lands where it was made, on safe ground.
    name: 'lava-stair-lip',
    from: 'm48',
    setUp: (h) => standAt(h, LAVA_STAIR.mid[0], LAVA_STAIR.mid[1]),
  },
];

/** Boots `extra.from`'s committed fixture, runs its set-up and saves (the caller seeds `Math.random`). */
export async function generateAct5Extra(fromSave: Record<string, unknown>, extra: Act5Extra): Promise<Record<string, unknown>> {
  const h = await bootFromSave(fromSave, { models: false, virtualClock: true });
  try {
    ensure(h.loaded, `act5 extra ${extra.name}: act5-${extra.from} loaded`);
    await extra.setUp(h);
    return await saveFixture(h);
  } finally {
    h.dispose();
  }
}
