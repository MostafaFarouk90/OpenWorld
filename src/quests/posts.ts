// NPC quest posts. NpcManager.place does not persist, so every quest-driven post is derived from quest
// state here and re-applied after a load. Tobb is not in the table: once he joins, thread 4b owns him.
import type { Condition } from './types';
import type { ConditionEnv, NpcPort } from './ports';
import { evalCondition } from './conditions';

export interface PostRule {
  npcId: string;
  /** the layout post; restoring it is only needed after a quest post was applied */
  home: string;
  /** first matching entry wins; none matching means home */
  posts: { when: Condition; anchorId: string }[];
}

/** Brightwater posts (slice 2 phase A). Phase B appends the Harrowmark rules. */
export const BRIGHTWATER_POST_RULES: PostRule[] = [
  { npcId: 'gaut', home: 'npc-post.gaut', posts: [{ when: { quest: 'm04', state: 'active' }, anchorId: 'npc-post.gaut.ford' }] },
  { npcId: 'aelfreda', home: 'npc-post.aelfreda', posts: [{ when: { quest: 'd01', state: 'active' }, anchorId: 'npc-post.aelfreda.vault' }] },
];

/** The anchor each NPC should stand at now. */
export function resolvePosts(rules: PostRule[], env: ConditionEnv): Record<string, { anchorId: string; home: boolean }> {
  const out: Record<string, { anchorId: string; home: boolean }> = {};
  for (const r of rules) {
    const hit = r.posts.find((p) => evalCondition(p.when, env));
    out[r.npcId] = hit ? { anchorId: hit.anchorId, home: false } : { anchorId: r.home, home: true };
  }
  return out;
}

/**
 * Applies resolved posts. An NPC that should be at home and was never moved by a rule is left alone, because
 * the tutorial moves some of them. `reset()` on load forgets what was applied so quest posts are re-placed.
 */
export class PostDirector {
  private readonly applied = new Map<string, string>();
  private dirty = true;

  constructor(
    private readonly rules: PostRule[],
    private readonly env: () => ConditionEnv,
    private readonly npcs: () => NpcPort | undefined,
  ) {}

  /** Quest state or a save changed; evaluate on the next update. */
  markDirty(): void { this.dirty = true; }

  reset(): void { this.applied.clear(); this.dirty = true; }

  /** True while some post could not be placed yet (the NPC or its anchor does not exist), so retry. */
  update(): void {
    if (!this.dirty) return;
    const npcs = this.npcs();
    if (!npcs) return;
    let pending = false;
    for (const [npcId, want] of Object.entries(resolvePosts(this.rules, this.env()))) {
      const had = this.applied.get(npcId);
      if (want.home && had === undefined) continue;
      if (had === want.anchorId) continue;
      if (npcs.place(npcId, want.anchorId)) this.applied.set(npcId, want.anchorId);
      else pending = true;
    }
    this.dirty = pending;
  }
}
