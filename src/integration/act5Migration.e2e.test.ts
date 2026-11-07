// Save migration onto the final build (N12 PR 2, plan 13): every committed Act 4 save loads with every Act 5 state at its
// default (no Act 5 quest started or flagged, no Act 5 snapshot) and the Caldera shut, since `story.gate.a5` is unset; the
// carried Act 4 ends (gate a5 set) load at Rimfoot with the Rim Gate still shut. Every Act 5 fixture's load is the
// containment test's (act5Containment.e2e.test.ts) and the format test's (src/save/act2Migration.test.ts).
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { bootFromSave } from './chapterHarness';
import { ACT5_QUEST_IDS } from '../quests/lint/act5Ids';
import { ACT5_GATE_FLAG, CALDERA_CENTRE, RIM_CAMP_POINT, RIMFOOT_POINT, RIM_GATE_OPEN_FLAG } from '../region/act5Regions';
import { readAct5Base } from '../save/__fixtures__/act5';

const ACT4 = import.meta.glob<Record<string, unknown>>('../save/__fixtures__/act4/act4-*.json', { import: 'default' });
const names = Object.keys(ACT4).filter((k) => !k.endsWith('.meta.json')).sort();

const flagsOf = (save: Record<string, unknown>) =>
  (save.entries as Record<string, { data: { flags: Record<string, unknown> } }>)['world-state']!.data.flags;
const act5Keys = (flags: Record<string, unknown>) =>
  Object.keys(flags).filter((k) => ACT5_QUEST_IDS.some((q) => k.startsWith(`story.${q}.`)) || /^favour\.snapshot\.(m52|d09|m56)\./.test(k) || k === 'story.gate.end' || k === 'world.afterEnding');

describe('Act 4 saves on the final build', () => {
  beforeAll(() => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('covers every committed Act 4 save', () => expect(names.length).toBeGreaterThanOrEqual(25));

  for (const name of names) {
    const short = name.split('/').pop()!.replace('.json', '');
    it(`${short}: Act 5 at its defaults and the Caldera shut`, async () => {
      const save = await ACT4[name]!();
      const flags = flagsOf(save);
      expect(flags[ACT5_GATE_FLAG], 'no Act 4 per-id save carries gate a5').not.toBe(true);
      const h = await bootFromSave(save, { models: false, virtualClock: true });
      try {
        await h.runAsync(10);
        const s = h.ctx.state.serialize() as { flags: Record<string, unknown> };
        expect(act5Keys(s.flags), 'no Act 5 state').toEqual([]);
        const quests = h.ctx.services.require('quests');
        for (const q of ACT5_QUEST_IDS) if (quests.get(q)) expect(quests.state(q), q).toBe('inactive');
        const c = h.ctx.services.require('containment');
        expect(c.isOpen(RIM_CAMP_POINT.x, RIM_CAMP_POINT.z), 'the Rim Camp').toBe(false);
        expect(c.isOpen(CALDERA_CENTRE.x, CALDERA_CENTRE.z), 'the Anvil').toBe(false);
      } finally {
        h.dispose();
      }
    }, 120_000);
  }

  for (const run of ['a', 'b'] as const) {
    it(`the carried Act 4 end ${run.toUpperCase()} (gate a5): lands at Rimfoot, the Rim Gate still shut`, async () => {
      const h = await bootFromSave(await readAct5Base(run), { models: false, virtualClock: true });
      try {
        await h.runAsync(10);
        expect(h.ctx.state.getBool(ACT5_GATE_FLAG as never)).toBe(true);
        expect(h.ctx.state.getBool(RIM_GATE_OPEN_FLAG as never)).toBe(false);
        const f = h.ctx.player.feet;
        expect(Math.hypot(f.x - RIMFOOT_POINT.x, f.z - RIMFOOT_POINT.z), 'by the Rimfoot fire').toBeLessThan(150);
        const c = h.ctx.services.require('containment');
        expect(c.isOpen(f.x, f.z)).toBe(true);
        expect(c.isOpen(CALDERA_CENTRE.x, CALDERA_CENTRE.z), 'the Anvil').toBe(false);
        // M47 starts on gate a5 (N10); nothing past it has
        const quests = h.ctx.services.require('quests');
        for (const q of ACT5_QUEST_IDS) if (q !== 'm47' && quests.get(q)) expect(quests.state(q), q).toBe('inactive');
      } finally {
        h.dispose();
      }
    }, 120_000);
  }
});
