// Every Phase D quest giver must be reachable when the quest is offered: a giver who stands inside a mine needs that mine's lift
// stop open BEFORE the quest is accepted (mine doors have no outside interaction). Reads the real post rules, NPC specs and mine
// interiors against LIFT_STOPS.
import { describe, expect, it } from 'vitest';
import type { ConditionEnv } from '../../quests/ports';
import type { QuestState } from '../../quests/types';
import { resolvePosts } from '../../quests/posts';
import { OLDSMOKE_POST_RULES } from '../postRules';
import { OLDSMOKE_NPCS } from '../npcDefs';
import { M17R08_NPCS } from '../../quests/content/act2/oldsmoke/mines/m17r08.npcs';
import { M18M19_NPCS } from '../../quests/content/act2/oldsmoke/mines/m18m19.npcs';
import { M20D04_NPCS } from '../../quests/content/act2/oldsmoke/mines/m20d04.npcs';
import { MINE_DEFS } from './index';
import { MINE_IDS, type MineId } from './kit';
import { availableStops, LIFT_ARMED_FLAG } from './liftStops';

const SPECS = [...OLDSMOKE_NPCS, ...M17R08_NPCS, ...M18M19_NPCS, ...M20D04_NPCS];

/** The quest, the NPC who offers it, and the quests that must be done before it is offered (play order). */
const GIVERS: Array<{ quest: string; npc: string; before: string[] }> = [
  { quest: 'm17', npc: 'slagg', before: ['m16'] },
  { quest: 'r08', npc: 'pickett', before: ['m16', 'm17'] },
  { quest: 'm18', npc: 'pike', before: ['m16', 'm17'] },
  { quest: 'm19', npc: 'wenna', before: ['m16', 'm17', 'm18'] },
  { quest: 'm20', npc: 'wenna', before: ['m16', 'm17', 'm18', 'm19'] },
  { quest: 'd04', npc: 'slagg', before: ['m16', 'm17', 'm18', 'm19', 'm20'] },
  { quest: 'r09', npc: 'slagg', before: ['m16', 'm17'] },
  { quest: 'r10', npc: 'slagg', before: ['m16', 'm17'] },
];

/** The world just before the quest is offered: lift armed, earlier quests done (their flags written), the quest itself untouched. */
function envBefore(before: string[]): ConditionEnv {
  const flags = new Set<string>([LIFT_ARMED_FLAG]);
  const states: Record<string, QuestState> = {};
  for (const q of before) {
    states[q] = 'completed';
    flags.add(`story.${q}.started`);
    flags.add(`story.${q}.complete`);
  }
  return {
    state: { getFlag: (k: string) => flags.has(k) || undefined } as never,
    quests: { state: (id) => states[id] ?? 'inactive', objectiveDone: () => false },
  };
}

const mineOfAnchor = (anchorId: string): MineId | null => {
  for (const def of MINE_DEFS) if (def.anchors.some((a) => a.id === anchorId)) return (Object.keys(MINE_IDS) as MineId[]).find((m) => MINE_IDS[m] === def.id) ?? null;
  return null;
};

describe('quest givers against the lift stops', () => {
  it.each(GIVERS)('$quest is offered by $npc where the player can walk up to them', ({ npc, before }) => {
    const env = envBefore(before);
    const resolved = resolvePosts(OLDSMOKE_POST_RULES, env)[npc];
    const anchor = resolved && !resolved.home ? resolved.anchorId : (SPECS.find((s) => s.id === npc)?.post ?? resolved?.anchorId);
    expect(anchor, `${npc} has a post`).toBeTruthy();
    const mine = mineOfAnchor(anchor!);
    if (mine === null) return; // on the surface: reachable
    const stop = availableStops(env).find((s) => s.stop.id === mine)!;
    expect(stop.unlocked, `${npc} stands in the ${mine} mine at ${anchor} but its lift stop is shut before the quest is accepted`).toBe(true);
  });

  it('R08: Pickett stands in the Old Galleries, and that stop opens once M17 is complete, not only when R08 has started', () => {
    const env = envBefore(['m16', 'm17']);
    expect(mineOfAnchor('npc-post.pickett.old')).toBe('old');
    expect(availableStops(env).find((s) => s.stop.id === 'old')!.unlocked).toBe(true);
    // before M17 is done the stop stays shut
    expect(availableStops(envBefore(['m16'])).find((s) => s.stop.id === 'old')!.unlocked).toBe(false);
  });
});
