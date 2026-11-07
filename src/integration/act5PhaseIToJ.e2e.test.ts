// The Phase I to Phase J save test (N12 PR 2, plan 8): the Phase I chain's end save loads on the final build with the hold
// retired. The Rim card is not shown again, R27, R28, R30 and M53 are offered on M52 alone (M54 is not), the bowl floor is
// shut until M53 completes and opens once it does. A Phase I save that still carries the retired flag loads the same way.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { bootFromSave, type ChapterHarness } from './chapterHarness';
import { evalCondition } from '../quests/conditions';
import { INSIDE_FLOOR_POINT } from './act5Fixtures';
import { readAct5PhaseIBuildEnd, readAct5PhaseIEnd } from '../save/__fixtures__/act5';
import { RIM_CARD_SEEN_FLAG } from './phaseICard';
import { FOUNDRY_OPEN_FLAG, INNER_GATE_FLAG } from '../region/act5Regions';

const PHASE_J_OPENERS = ['r27', 'r28', 'r30', 'm53'] as const;

async function boot(save: Record<string, unknown>): Promise<ChapterHarness> {
  const h = await bootFromSave(save, { models: false, virtualClock: true });
  try {
    await h.runAsync(20);
  } catch (e) {
    h.dispose();
    throw e;
  }
  return h;
}

function read(h: ChapterHarness) {
  const quests = h.ctx.services.require('quests');
  const s = h.ctx.state;
  const offered = (id: string) => quests.state(id) === 'inactive' && evalCondition(quests.get(id)!.startWhen, { state: s as never, quests });
  const card = (globalThis as { __phaseICard?: { readonly active: boolean; readonly visible: boolean } }).__phaseICard;
  h.ctx.hud.update(0.5);
  return {
    m52Done: quests.state('m52') === 'completed',
    cardSeen: s.getBool(RIM_CARD_SEEN_FLAG as never),
    cardUp: card?.active === true || card?.visible === true,
    offered: Object.fromEntries(PHASE_J_OPENERS.map((q) => [q, offered(q)])),
    m54Offered: quests.get('m54') ? offered('m54') : false,
    floorOpen: h.ctx.services.require('containment').isOpen(INSIDE_FLOOR_POINT.x, INSIDE_FLOOR_POINT.z),
  };
}

const withFlag = (save: Record<string, unknown>, k: string): Record<string, unknown> => {
  const out = JSON.parse(JSON.stringify(save)) as { entries: Record<string, { data: { flags: Record<string, unknown> } }> };
  out.entries['world-state']!.data.flags[k] = true;
  return out as unknown as Record<string, unknown>;
};

describe('Phase I end save on the final build', () => {
  beforeAll(() => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  for (const [name, load] of [
    ['the Phase I chain end (run A)', () => readAct5PhaseIEnd('a')],
    ['the same save carrying the retired hold flag', async () => withFlag(await readAct5PhaseIEnd('a'), FOUNDRY_OPEN_FLAG)],
  ] as const) {
    it(`${name}: no card again, the Foundry quests offered, the floor shut until M53`, async () => {
      const h = await boot(await load());
      try {
        const r = read(h);
        expect(r.m52Done).toBe(true);
        expect(r.cardSeen).toBe(true);
        expect(r.cardUp, 'the Rim card is not shown again').toBe(false);
        expect(r.offered).toEqual({ r27: true, r28: true, r30: true, m53: true });
        expect(r.m54Offered, 'M54 waits for D09 and R27').toBe(false);
        expect(r.floorOpen, 'the floor is shut before M53').toBe(false);
        // M53 completes: the Inner Gate's flag alone opens the floor (no hold)
        h.ctx.state.setFlag(INNER_GATE_FLAG as never, true as never);
        await h.runAsync(2);
        expect(read(h).floorOpen, 'the floor opens on M53').toBe(true);
      } finally {
        h.dispose();
      }
    }, 180_000);
  }

  it('the PR 1 build\'s own end save (written on a build with the hold) loads the same way', async () => {
    const h = await boot(await readAct5PhaseIBuildEnd());
    try {
      const r = read(h);
      expect(r.cardUp).toBe(false);
      expect(r.offered).toEqual({ r27: true, r28: true, r30: true, m53: true });
      expect(r.floorOpen).toBe(false);
    } finally {
      h.dispose();
    }
  }, 180_000);
});
