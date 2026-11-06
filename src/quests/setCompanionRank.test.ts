// v0.8 item 7: the `setCompanionRank` effect, through the effect runner, the quest and dialogue validators, and the real
// companions service's rank rule (never lower, joined only, `companion.bond` with its source only when the rank rose).
import { describe, expect, it, vi } from 'vitest';
import { COMPANION_DEFS, MAX_RANK } from '../companions/companions.plugin';
import { COMPANION_IDS, COMPANION_MAX_RANK } from '../companions/ids';
import { validateDialogueEffects } from '../dialogue/validate';
import { createEffectRunner } from './effects';
import type { CompanionsRankPort, EffectEnv } from './ports';
import type { Effect } from './types';
import { validateEffects } from './validate';

/** The shipped rule (companions.plugin.ts setRank), on a fake joined set. */
function fakeCompanions(joined: Record<string, number>) {
  const bonds: unknown[] = [];
  const port: CompanionsRankPort = {
    setRank(id, rank, source) {
      if (!(id in joined) || !Number.isInteger(rank) || rank < 1 || rank > MAX_RANK) return false;
      if (rank <= joined[id]) return false;
      joined[id] = rank;
      bonds.push(source ? { companionId: id, rank, source } : { companionId: id, rank });
      return true;
    },
  };
  return { port: vi.fn(() => port), bonds, joined };
}

function run(effects: Effect[], companions?: () => CompanionsRankPort | undefined) {
  const warns: string[] = [];
  const env: EffectEnv = {
    state: { getFlag: () => undefined, setFlag: () => undefined, clearFlag: () => undefined, favour: () => 0, favourBand: () => 'cold', addFavour: () => 0 } as never,
    quests: { state: () => 'inactive', objectiveDone: () => false, start: () => true, complete: () => true, completeObjective: () => true } as never,
    bus: { on: () => () => undefined, emit: () => undefined },
    companions,
    sourceId: 'quest:test',
    warn: (m) => warns.push(m),
  };
  return { results: createEffectRunner(env).run(effects), warns };
}

const fx = (id: string, rank: number, source = 'm36'): Effect => ({ setCompanionRank: { id: id as never, rank, source } });

describe('setCompanionRank (v0.8 item 7)', () => {
  it('the light id list matches the companions plugin', () => {
    expect([...COMPANION_IDS].sort()).toEqual(COMPANION_DEFS.map((d) => d.id).sort());
    expect(COMPANION_MAX_RANK).toBe(MAX_RANK);
  });

  it('raises a joined companion and emits companion.bond with the source', () => {
    const c = fakeCompanions({ hrolf: 2 });
    const { results } = run([fx('hrolf', 3)], c.port);
    expect(results[0].ok).toBe(true);
    expect(c.joined.hrolf).toBe(3);
    expect(c.bonds).toEqual([{ companionId: 'hrolf', rank: 3, source: 'm36' }]);
  });

  it('a repeat and an attempt to lower do nothing and emit nothing', () => {
    const c = fakeCompanions({ tobb: 4 });
    run([fx('tobb', 4), fx('tobb', 2)], c.port);
    expect(c.joined.tobb).toBe(4);
    expect(c.bonds).toEqual([]);
  });

  it('an unknown id or a rank above the top fails the effect at run time', () => {
    const c = fakeCompanions({ tobb: 1 });
    const { results } = run([fx('gaut', 2), fx('tobb', COMPANION_MAX_RANK + 1)], c.port);
    expect(results.map((r) => r.ok)).toEqual([false, false]);
    expect(c.bonds).toEqual([]);
  });

  it('with no companions service it warns once and does nothing', () => {
    const { results, warns } = run([fx('tobb', 2), fx('tobb', 3)]);
    expect(results.every((r) => !r.ok)).toBe(true);
    expect(warns.filter((w) => w.includes('companions service absent'))).toHaveLength(1);
  });

  it('the quest validator rejects an unknown id, a bad rank and a missing source', () => {
    expect(validateEffects([fx('aelfreda', 5)])).toEqual([]);
    expect(validateEffects([fx('gaut', 2)]).join()).toMatch(/companion id/);
    expect(validateEffects([fx('tobb', 6)]).join()).toMatch(/rank/);
    expect(validateEffects([fx('tobb', 0)]).join()).toMatch(/rank/);
    expect(validateEffects([fx('tobb', 2.5)]).join()).toMatch(/rank/);
    expect(validateEffects([fx('tobb', 2, '')]).join()).toMatch(/source/);
  });

  it('a dialogue line can carry it, and the dialogue validator checks it the same way', () => {
    expect(validateDialogueEffects([fx('hrolf', 4)], 'line')).toEqual([]);
    expect(validateDialogueEffects([fx('nobody', 4)], 'line').join()).toMatch(/setCompanionRank needs a companion id/);
  });
});
