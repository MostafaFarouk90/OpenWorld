/**
 * Containment under the Phase C flag state, read from the real saves: Cinderreach and the Cinder Road are open, Oldsmoke
 * stays shut until D03 is done, the later acts' faces stay shut. The Phase C hold (`story.phase.oldsmokeOpen`) is retired,
 * so a Phase C complete save loads into Phase D state: D03 alone opens the pass. The grid sweep per flag state is region/containment.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootFromSave, type ChapterHarness } from './chapterHarness';
import { ACT2_C_FIXTURES, readAct2CFixture, type Act2CFixture } from '../save/__fixtures__/act2c';
import { roadPoint } from '../terrain/shape/roadPoint';

let h: ChapterHarness | null = null;
beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  h?.dispose();
  h = null;
  vi.restoreAllMocks();
});

const PHASE_C_FIXTURES: Act2CFixture[] = [
  ACT2_C_FIXTURES.m11Start, ACT2_C_FIXTURES.m14HushedAnvil, ACT2_C_FIXTURES.d03Scorchhold,
];
// Engine coordinates: Cinderreach 15500..22500 x -500..5500, Oldsmoke 17000..22000 x 7000..12000, Greyfen far south-west.
const CINDERREACH = { x: 19000, z: 2500 };
const OLDSMOKE = { x: 19500, z: 9500 };
const GREYFEN = { x: 3500, z: 12500 };
const CALDERA = { x: 12000, z: 9000 };

describe('containment on the Phase C saves', () => {
  for (const name of PHASE_C_FIXTURES) {
    it(`${name}: Cinderreach and the Cinder Road open, Oldsmoke and the later acts shut`, async () => {
      h = await bootFromSave(await readAct2CFixture(name), { models: false, virtualClock: true });
      const c = h.ctx.services.require('containment');
      expect(c.openRegions()).toEqual(['brightwater', 'harrowmark', 'cinderreach']);
      expect(c.isOpen(CINDERREACH.x, CINDERREACH.z)).toBe(true);
      for (const arc of [0, 1500, 3000, 4500, 5000]) {
        const p = roadPoint('cinder-road', arc, 0);
        expect(c.isOpen(p.x, p.z), `cinder-road arc ${arc}`).toBe(true);
      }
      expect(c.isOpen(OLDSMOKE.x, OLDSMOKE.z)).toBe(false);
      expect(c.isOpen(GREYFEN.x, GREYFEN.z)).toBe(false);
      expect(c.isOpen(CALDERA.x, CALDERA.z)).toBe(false);
    }, 60_000);
  }

  for (const name of [ACT2_C_FIXTURES.completeDefeated, ACT2_C_FIXTURES.completeSpared]) {
    it(`${name}: loads into Phase D state, Oldsmoke open on D03 alone and no hold flag, the later acts shut, no Act 2 ending`, async () => {
      h = await bootFromSave(await readAct2CFixture(name), { models: false, virtualClock: true });
      const c = h.ctx.services.require('containment');
      expect(h.ctx.state.getBool('story.d03.complete')).toBe(true);
      expect(h.ctx.state.getFlag('story.phase.oldsmokeOpen')).toBeUndefined();
      expect(c.openRegions()).toEqual(['brightwater', 'harrowmark', 'cinderreach', 'oldsmoke']);
      expect(c.isOpen(OLDSMOKE.x, OLDSMOKE.z)).toBe(true);
      expect(c.isOpen(GREYFEN.x, GREYFEN.z)).toBe(false);
      expect(c.isOpen(CALDERA.x, CALDERA.z)).toBe(false);
      // Loading the save ends nothing: the Act 2 gate is unset and no `act.ended` for act 2 was emitted.
      expect(h.ctx.state.getBool('story.gate.a3')).toBe(false);
      expect(h.of('act.ended').filter((e) => e.act === 2)).toEqual([]);
      expect(h.ctx.services.require('actEndingCard').active()).toBe(false);
    }, 60_000);
  }

  it('D03 done after a Phase C load opens the pass live, with no hold flag to set', async () => {
    h = await bootFromSave(await readAct2CFixture(ACT2_C_FIXTURES.d03Scorchhold), { models: false, virtualClock: true });
    const c = h.ctx.services.require('containment');
    expect(c.isOpen(OLDSMOKE.x, OLDSMOKE.z)).toBe(false);
    h.ctx.state.setFlag('story.d03.complete', true);
    expect(c.isOpen(OLDSMOKE.x, OLDSMOKE.z)).toBe(true);
  }, 60_000);
});
