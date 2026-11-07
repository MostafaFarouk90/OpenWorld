// The Rim's post rows on the shipped resolver over the real POST_RULES: a world before the Rim moves nobody, the allies come to the
// camp on the arrival (Maud only with F4 Cleanse), Alric follows his quests, and R26's cast reaches the camp once in or wounded.
import { describe, expect, it } from 'vitest';
import { POST_RULES, resolvePosts } from '../../../posts';
import type { ConditionEnv } from '../../../ports';
import type { FlagValue, QuestState } from '../../../types';
import { ALRIC, M47_RIM_GATE_OPEN } from './m47.quest';
import { F4_CLEANSED, M49_ARRIVED } from './m49.quest';
import { R26_GUARD, R26_IN, R26_MASTER, R26_WOUNDED } from './r26.quest';
import { RIM_A5_POST_ROWS } from './npcs';
import { COOL, Q } from './ids';

const RIM = (id: string): string => `npc-post.${id}.rim`;

function at(states: Record<string, QuestState> = {}, flags: Record<string, FlagValue> = {}, done: Record<string, string[]> = {}) {
  const env: ConditionEnv = {
    state: { getFlag: (k: string) => flags[k], setFlag: () => {}, clearFlag: () => {}, favourBand: () => 'neutral' as never, favour: () => 0, addFavour: () => 0 } as never,
    quests: { state: (q: string) => states[q] ?? 'inactive', objectiveDone: (q: string, o: string) => done[q]?.includes(o) ?? false } as never,
  };
  return resolvePosts(POST_RULES, env);
}
const ALLIES = ['wystan', 'merrin', 'wenna', 'wulfhild', 'ansgar', 'edric', 'rook'] as const;

describe('Rim posts', () => {
  it('before the Rim every Rim row resolves to its home', () => {
    const p = at();
    for (const r of RIM_A5_POST_ROWS) {
      const got = p[r.npcId]!.anchorId;
      // a shipped row may still place an ally (Act 4's posts); none of mine does, and my own cast stays home
      if ((ALLIES as readonly string[]).includes(r.npcId) || r.npcId === 'maud') expect(got.startsWith(`${Q}.`) || got === RIM(r.npcId), r.npcId).toBe(false);
      else expect(p[r.npcId], r.npcId).toEqual({ anchorId: r.home, home: true });
    }
    expect(p[ALRIC]).toEqual({ anchorId: RIM(ALRIC), home: true });
  });

  it('Edric and Rook stand inside the gate once it opens, then at the camp from the arrival', () => {
    expect(at({ m47: 'active' }, { [M47_RIM_GATE_OPEN]: true }).edric!.anchorId).toBe(`${Q}.post.edric.gate`);
    const p = at({}, { [M47_RIM_GATE_OPEN]: true, [M49_ARRIVED]: true });
    for (const a of ALLIES) expect(p[a]!.anchorId, a).toBe(RIM(a));
  });

  it('Maud comes up only with F4 Cleanse', () => {
    expect(at({}, { [M49_ARRIVED]: true }).maud!.home).toBe(true);
    expect(at({}, { [M49_ARRIVED]: true, [F4_CLEANSED]: true }).maud!.anchorId).toBe(RIM('maud'));
  });

  it('Alric: the gate in M47, the stair from M47\'s end until the M48 brief, the foot after it, the Cooling Hall in M50, the camp otherwise', () => {
    expect(at({ m47: 'active' })[ALRIC]!.anchorId).toBe(`${Q}.post.alric.gate`);
    expect(at({ m47: 'completed' })[ALRIC]!.anchorId).toBe(`${Q}.post.alric.stair`);
    expect(at({ m48: 'active' })[ALRIC]!.anchorId).toBe(`${Q}.post.alric.stair`);
    expect(at({ m48: 'active' }, {}, { m48: ['brief'] })[ALRIC]!.anchorId).toBe(`${Q}.post.alric.foot`);
    expect(at({ m50: 'active' })[ALRIC]!.anchorId).toBe(`${COOL}.alric`);
    expect(at({ m47: 'completed', m48: 'completed' })[ALRIC]).toEqual({ anchorId: RIM(ALRIC), home: true });
    // M51's word with him is at the camp, even with M50 under way
    expect(at({ m50: 'active', m51: 'active' }, {}, { m51: ['call'] })[ALRIC]!.anchorId).toBe(RIM(ALRIC));
    expect(at({ m50: 'active', m51: 'active' }, {}, { m51: ['call', 'alric'] })[ALRIC]!.anchorId).toBe(`${COOL}.alric`);
  });

  it('R26: a wounded guard reaches the camp at once; the master and the other guard when the convoy is in', () => {
    const w = at({ r26: 'active' }, { [R26_WOUNDED(1)]: true });
    expect(w[R26_GUARD(1)]!.anchorId).toBe(`${Q}.post.r26.guard.1.camp`);
    expect(w[R26_GUARD(2)]!.home).toBe(true);
    expect(w[R26_MASTER]!.home).toBe(true);
    const i = at({ r26: 'active' }, { [R26_IN]: true });
    expect(i[R26_MASTER]!.anchorId).toBe(`${Q}.post.r26.master.camp`);
    expect(i[R26_GUARD(2)]!.anchorId).toBe(`${Q}.post.r26.guard.2.camp`);
  });

  it('M52: Wystan stands at the war post from the brief until the gate holds, then back at the camp', () => {
    const arrived = { [M49_ARRIVED]: true };
    expect(at({ m52: 'active' }, arrived)['wystan']!.anchorId).toBe(RIM('wystan'));
    expect(at({ m52: 'active' }, arrived, { m52: ['brief'] })['wystan']!.anchorId).toBe('caldera.siege.orders');
    expect(at({ m52: 'active' }, { ...arrived, 'story.m52.gateHeld': true }, { m52: ['brief'] })['wystan']!.anchorId).toBe(RIM('wystan'));
  });
});
