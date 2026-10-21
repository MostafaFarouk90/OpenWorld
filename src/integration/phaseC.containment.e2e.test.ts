/**
 * Containment under the Phase C flag state, read from the real saves: Cinderreach and the Cinder Road are open, Oldsmoke
 * stays shut even after D03 (the phase hold), the later acts' faces stay shut, and with the hold flag set (what the Phase D
 * PR will make of an emptied `PHASE_HOLDS`) D03 alone opens the pass. The grid sweep per flag state is region/containment.test.ts.
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
  ACT2_C_FIXTURES.m11Start, ACT2_C_FIXTURES.m14HushedAnvil, ACT2_C_FIXTURES.d03Scorchhold, ACT2_C_FIXTURES.completeDefeated, ACT2_C_FIXTURES.completeSpared,
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

  it('after D03 the hold keeps Oldsmoke shut; setting the hold flag (the Phase D PR) opens it on D03 alone', async () => {
    h = await bootFromSave(await readAct2CFixture(ACT2_C_FIXTURES.completeDefeated), { models: false, virtualClock: true });
    const c = h.ctx.services.require('containment');
    expect(h.ctx.state.getBool('story.d03.complete')).toBe(true);
    expect(c.isOpen(OLDSMOKE.x, OLDSMOKE.z)).toBe(false);
    h.ctx.state.setFlag('story.phase.oldsmokeOpen', true);
    expect(c.openRegions()).toContain('oldsmoke');
    expect(c.isOpen(OLDSMOKE.x, OLDSMOKE.z)).toBe(true);
    expect(c.isOpen(GREYFEN.x, GREYFEN.z)).toBe(false);
  }, 60_000);
});
