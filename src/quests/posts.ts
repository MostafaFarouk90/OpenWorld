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

// The tutorial leaves Gaut and Aelfreda at the Kettlewick gate (T15) for M01; once M01 is done they go home, so
// Aelfreda gives M03 at the chapel (the tutorial stops re-placing them after M01, TutorialDirector.resumeAfterLoad).
const m01Done: Condition = { quest: 'm01', state: 'completed' };
const live = (q: string): Condition => ({ quest: q, state: ['active', 'completed'] });

/**
 * Quest posts for Brightwater (phase A) and Harrowmark (phase B; anchor ids are thread 17's, Gaut's gate post is
 * thread 4's). First matching entry wins. NPCs a rule names that are not in the world yet are retried until placed.
 */
export const POST_RULES: PostRule[] = [
  {
    npcId: 'gaut', home: 'npc-post.gaut',
    posts: [
      { when: live('m07'), anchorId: 'npc-post.gaut.bastion' },
      { when: { quest: 'm06', state: 'active' }, anchorId: 'npc-post.gaut.south-gate' },
      { when: { quest: 'm04', state: 'active' }, anchorId: 'npc-post.gaut.ford' },
      { when: m01Done, anchorId: 'npc-post.gaut' },
    ],
  },
  {
    npcId: 'aelfreda', home: 'npc-post.aelfreda',
    posts: [
      { when: { quest: 'd01', state: 'active' }, anchorId: 'npc-post.aelfreda.vault' },
      { when: { quest: 'm06', state: 'completed' }, anchorId: 'npc-post.aelfreda.chapel' },
      { when: m01Done, anchorId: 'npc-post.aelfreda' },
    ],
  },
  // Stane trains at the Bastion once the Practice Yard work (R02) is done and the class choice has begun (M07)
  { npcId: 'stane', home: 'npc-post.stane', posts: [{ when: { all: [{ quest: 'r02', state: 'completed' }, live('m07')] }, anchorId: 'npc-post.stane.bastion' }] },
  // Rook offers M06 from the gate while the portcullis is shut, so the gate post is his home; he goes into the city once M06 is done
  { npcId: 'rook', home: 'npc-post.rook.gate', posts: [{ when: { quest: 'm06', state: 'completed' }, anchorId: 'npc-post.rook' }] },
  {
    npcId: 'gerta', home: 'npc-post.gerta.guild',
    posts: [
      { when: { quest: 'm10', state: 'active' }, anchorId: 'npc-post.gerta.guild' },
      { when: live('m07'), anchorId: 'npc-post.gerta.bastion' },
    ],
  },
  // the audience: the Regent's court stands in the Keep hall while M08 runs (inside posts are thread 3a's anchors)
  { npcId: 'edric', home: 'npc-post.edric', posts: [{ when: { quest: 'm08', state: 'active' }, anchorId: 'npc-post.edric.hall' }] },
  { npcId: 'vey', home: 'npc-post.vey.keep', posts: [{ when: { quest: 'm08', state: 'active' }, anchorId: 'npc-post.vey.hall' }] },
  // Merrin waits inside the Counting-House once she has sent the player in
  {
    npcId: 'merrin', home: 'npc-post.merrin',
    posts: [{ when: { all: [{ quest: 'm09', state: 'active' }, { objective: ['m09', 'o1'], done: true }] }, anchorId: 'npc-post.merrin.inside' }],
  },
  { npcId: 'pennard', home: 'npc-post.pennard.archive', posts: [{ when: live('m07'), anchorId: 'npc-post.pennard.bastion' }] },
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
const UNKNOWN = '?';

export class PostDirector {
  private readonly applied = new Map<string, string>();
  private dirty = true;

  constructor(
    private readonly rules: PostRule[],
    private readonly env: () => ConditionEnv,
    private readonly npcs: () => NpcPort | undefined,
    /** true while a dialogue is open: NPCs must not teleport mid-conversation */
    private readonly busy?: () => boolean,
  ) {}

  /** Quest state or a save changed; evaluate on the next update. */
  markDirty(): void { this.dirty = true; }

  /**
   * A save loaded. NPC positions are not saved, and other systems (the tutorial) may re-place an NPC on load, so
   * every NPC a rule ever moved is placed again (`applied` is kept as "unknown" so a home post is re-applied too).
   */
  reset(): void {
    for (const k of this.applied.keys()) this.applied.set(k, UNKNOWN);
    this.dirty = true;
  }

  /** Applies pending posts; stays dirty while one cannot be placed yet (NPC or anchor missing) or a dialogue is open. */
  update(): void {
    if (!this.dirty || this.busy?.()) return;
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
