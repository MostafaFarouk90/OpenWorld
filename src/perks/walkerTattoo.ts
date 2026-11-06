// Act 4 L7 (Q13, plans/act4-L7.md section 5): the Walker Tattoo. From M43 a Release on a regular undead costs 5 Burn
// instead of 10; a boss Release keeps its cost (Eormen 20). `story.m43.complete` is the authority; the inventory's
// `key.walker-tattoo` is only for show, so nothing new is persisted.
import type { FlagReader } from '../core/flagCondition';
import type { PerkDef } from './types';

export const WALKER_TATTOO = { id: 'walker-tattoo', flag: 'story.m43.complete', regularReleaseCost: 5 } as const;

export function walkerTattoo(state: FlagReader): PerkDef {
  return {
    id: WALKER_TATTOO.id,
    active: () => state.getFlag(WALKER_TATTOO.flag) === true,
    releaseBurnCost: (base, ctx) => (ctx.isBoss ? base : Math.min(base, WALKER_TATTOO.regularReleaseCost)),
  };
}
