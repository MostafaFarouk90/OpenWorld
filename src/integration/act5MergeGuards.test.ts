// N12's stack merges Act 4's last branch (L13 PR 2) with N0 and wave 1. Two merges conflicted and were resolved by hand
// (plans/act5-N12.md section 0). Each resolution is pinned here, so a slot-time cherry-pick or a later re-merge cannot drop
// either side silently (coordinator change, 2026-11-07).
import { describe, expect, it } from 'vitest';
import { PHASE_HOLDS, phaseHolds } from '../region/regions';
import { dialogueDefs } from '../dialogue/content';
import { SCENE_ACT4_CAMP } from '../dialogue/content/act4/campScene.dialogue';
import { SIEGE_ORDER_TREES } from '../siege/orders.dialogue';

describe('merge guard: PHASE_HOLDS (L13 PR 2 x N0 v0.9)', () => {
  it('holds nothing: the Waste hold stays retired (L13 PR 2) and the Caldera floor hold too (N12 PR 2)', () => {
    expect(PHASE_HOLDS).toEqual({});
    expect(phaseHolds('caldera')).toEqual([]);
    expect(phaseHolds('ashen-waste')).toEqual([]);
  });
});

describe('merge guard: the dialogue index (L13 PR 2 x N4)', () => {
  it("carries both L13's Act 4 camp scene and every one of N4's siege order trees, each once", () => {
    const ids = dialogueDefs.map((d) => d.id);
    const want = [SCENE_ACT4_CAMP.def.id, ...SIEGE_ORDER_TREES.map((t) => t.def.id)];
    expect(want.length).toBeGreaterThanOrEqual(3);
    for (const id of want) expect(ids.filter((x) => x === id), id).toHaveLength(1);
  });
});
