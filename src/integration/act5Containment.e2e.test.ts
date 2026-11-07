// Act 5 containment across the Act 5 states (N12 PR 1): each `?act5=` fixture booted as a save, the live containment service
// read at the places plan 3.2 names, checked against the conditions that should hold them. In Phase I, the bowl floor is shut
// by `story.phase.foundryOpen` even where the Inner Gate's own flag is set, and the Anvil until D10 starts. The Rim Camp, the
// court and the Waste stay open throughout. The soft-lock extra is an old save standing inside the floor while the hold stands:
// it loads outside the floor.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { bootFromSave, type ChapterHarness } from './chapterHarness';
import { INSIDE_FLOOR_POINT } from './act5Fixtures';
import { readAct5Extra, readAct5Fixture } from '../save/__fixtures__/act5';
import { ACT5_JUMP_IDS, act5PhaseOf } from '../quests/act5Jump';
import { ANVIL_OPEN_WHEN, INNER_GATE_OPEN_WHEN } from '../region/act5Containment';
import { CALDERA_CENTRE } from '../region/act5Regions';
import { flagConditionHolds } from '../core/flagCondition';
import { RIM_CAMP, RIM_GATE_SITE } from '../caldera/calderaSites';
import { PHASE_HOLDS } from '../region/regions';

const ANVIL = { x: CALDERA_CENTRE.x, z: CALDERA_CENTRE.z };
const CAMP = { x: RIM_CAMP.fire[0], z: RIM_CAMP.fire[1] };
const COURT = { x: RIM_GATE_SITE.court[0], z: RIM_GATE_SITE.court[1] };
/** Rimfoot, on the Waste side below the stairs. */
const RIMFOOT = { x: RIM_GATE_SITE.landing[0], z: RIM_GATE_SITE.landing[1] - 120 };

interface Read { floor: boolean; anvil: boolean; camp: boolean; court: boolean; rimfoot: boolean; floorWhen: boolean; anvilWhen: boolean; hold: boolean }

async function read(save: Record<string, unknown>): Promise<{ r: Read; h: ChapterHarness }> {
  const h = await bootFromSave(save, { models: false, virtualClock: true });
  try {
    await h.runAsync(10);
  } catch (e) {
    h.dispose();
    throw e;
  }
  const c = h.ctx.services.require('containment');
  const s = h.ctx.state as never;
  return {
    h,
    r: {
      floor: c.isOpen(INSIDE_FLOOR_POINT.x, INSIDE_FLOOR_POINT.z),
      anvil: c.isOpen(ANVIL.x, ANVIL.z),
      camp: c.isOpen(CAMP.x, CAMP.z),
      court: c.isOpen(COURT.x, COURT.z),
      rimfoot: c.isOpen(RIMFOOT.x, RIMFOOT.z),
      floorWhen: flagConditionHolds(INNER_GATE_OPEN_WHEN, s),
      anvilWhen: flagConditionHolds(ANVIL_OPEN_WHEN, s) && flagConditionHolds(INNER_GATE_OPEN_WHEN, s),
      hold: PHASE_HOLDS.caldera!.every((f) => h.ctx.state.getBool(f as never)),
    },
  };
}

describe('Act 5 containment on every ?act5= fixture', () => {
  beforeAll(() => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  for (const id of ACT5_JUMP_IDS) {
    it(`${id}: the floor and the Anvil follow their conditions, the camp, court and Waste stay open`, async () => {
      const { r, h } = await read(await readAct5Fixture(id));
      try {
        expect(r.camp, 'Rim Camp').toBe(true);
        expect(r.court, 'the court').toBe(true);
        expect(r.rimfoot, 'Rimfoot').toBe(true);
        expect(r.floor, 'the bowl floor').toBe(r.floorWhen);
        expect(r.anvil, 'the Anvil').toBe(r.anvilWhen);
        if (act5PhaseOf(id) === 'I') {
          // PR 1: the Phase I hold stands on every Phase I save, so the floor is shut whatever M53's flag says
          expect(r.hold, 'the Phase I hold is not met').toBe(false);
          expect(r.floor).toBe(false);
          expect(r.anvil).toBe(false);
        }
      } finally {
        h.dispose();
      }
    }, 120_000);
  }

  it('an old save inside the floor while the hold stands loads outside the floor', async () => {
    const h = await bootFromSave(await readAct5Extra('inside-floor-phase-i'), { models: false, virtualClock: true });
    try {
      await h.runAsync(120);
      const c = h.ctx.services.require('containment');
      const f = h.ctx.player.feet;
      expect(c.isOpen(INSIDE_FLOOR_POINT.x, INSIDE_FLOOR_POINT.z)).toBe(false);
      expect(c.isOpen(f.x, f.z), `feet ${f.toArray().map((v) => v.toFixed(0))}`).toBe(true);
    } finally {
      h.dispose();
    }
  }, 120_000);
});
