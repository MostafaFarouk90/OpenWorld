// R26's convoy on L4's real member table: the engine builds every npc member with `memberSpec` and refuses the whole escort on an
// unknown one (N12's Phase I chain found the master missing, 2026-11-07), so each road's members must build.
import { describe, expect, it } from 'vitest';
import { memberSpec } from '../../../../../escort/allies';
import { r26Escort } from './convoy';

describe('R26 convoy members', () => {
  it.each(['fast', 'long'] as const)('every npc member of the %s road is one L4 can build', (road) => {
    const def = r26Escort(road);
    const npcs = def.members.filter((m) => m.kind === 'npc');
    expect(npcs.length).toBeGreaterThan(0);
    for (const m of npcs) expect(memberSpec(m.id, null, () => undefined), m.id).not.toBeNull();
  });
});
