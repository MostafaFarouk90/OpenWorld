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
  /** While this holds the director does not place the NPC at all (a walk-off or another system owns it). */
  leaveWhen?: Condition;
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
      // Act 2 (A3, additive): the Act 1 rows below stay true for the rest of the game, so these go first. Gaut waits on the
      // Cinder Road for M11 (A5's escort hides his figure while he rides) and then holds Cinderford.
      { when: { quest: 'm11', state: 'active' }, anchorId: 'npc-post.gaut.cinder-road' },
      { when: { quest: 'm11', state: 'completed' }, anchorId: 'npc-post.gaut.cinderford' },
      { when: live('m07'), anchorId: 'npc-post.gaut.bastion' },
      { when: { quest: 'm06', state: 'active' }, anchorId: 'npc-post.gaut.south-gate' },
      { when: { quest: 'm04', state: 'active' }, anchorId: 'npc-post.gaut.ford' },
      { when: m01Done, anchorId: 'npc-post.gaut' },
    ],
  },
  {
    npcId: 'aelfreda', home: 'npc-post.aelfreda',
    posts: [
      // Act 2 (A3, additive): M13 opens M14, which Aelfreda gives at the Hushed Anvil; once it is done she is A5's companion.
      { when: { all: [{ quest: 'm13', state: 'completed' }, { not: { quest: 'm14', state: 'completed' } }] }, anchorId: 'npc-post.aelfreda.anvil' },
      { when: { quest: 'd01', state: 'active' }, anchorId: 'npc-post.aelfreda.vault' },
      { when: { quest: 'm06', state: 'completed' }, anchorId: 'npc-post.aelfreda.chapel' },
      { when: m01Done, anchorId: 'npc-post.aelfreda' },
    ],
  },
  // Stane runs his board in the Halvard Bastion yard from M06 on, R02 included whatever its state (density pass; he
  // trains Wardens there from M07). Before M06 he keeps the Practice Yard.
  { npcId: 'stane', home: 'npc-post.stane', posts: [{ when: live('m06'), anchorId: 'npc-post.stane.bastion' }] },
  // Rook offers M06 from the gate while the portcullis is shut, waits at the gate brazier inside once Cael is through
  // (density pass) and goes into the city once M06 is done. The gate is a post, not his home: the NPC spawns at
  // npc-post.rook and a home post is never applied to an NPC no rule has moved.
  {
    npcId: 'rook', home: 'npc-post.rook',
    posts: [
      { when: { all: [{ quest: 'm06', state: 'active' }, { objective: ['m06', 'o2'], done: true }] }, anchorId: 'npc-post.rook.inner' },
      { when: { not: { quest: 'm06', state: 'completed' } }, anchorId: 'npc-post.rook.gate' },
    ],
  },
  // the gate refugees come inside once the brazier may judge them (M06, density pass)
  { npcId: 'refugee-1', home: 'harrowmark.gate.south.queue.1', posts: [{ when: { flag: 'story.m06.queueTested' }, anchorId: 'npc-post.refugee-1.inside' }] },
  { npcId: 'refugee-2', home: 'harrowmark.gate.south.queue.3', posts: [{ when: { flag: 'story.m06.queueTested' }, anchorId: 'npc-post.refugee-2.inside' }] },
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
  // Merrin waits her turn in the Keep hall during the audience (density pass), then inside the Counting-House once
  // Cael has the side-door key (the clerk's, density pass)
  {
    npcId: 'merrin', home: 'npc-post.merrin',
    posts: [
      { when: { all: [{ quest: 'm08', state: 'active' }, { objective: ['m08', 'o3'], done: false }] }, anchorId: 'npc-post.merrin.hall' },
      { when: { all: [{ quest: 'm09', state: 'active' }, { objective: ['m09', 'key'], done: true }] }, anchorId: 'npc-post.merrin.inside' },
    ],
  },
  // Lord Grisel waits in the Keep hall while M08 runs, then outside the Keep (density pass)
  { npcId: 'grisel', home: 'npc-post.grisel', posts: [{ when: { quest: 'm08', state: 'active' }, anchorId: 'npc-post.grisel.hall' }] },
  {
    npcId: 'pennard', home: 'npc-post.pennard.archive',
    posts: [
      // Act 2 (A3, additive): Magister Pennard rides out to Cinderford's refuge from R06's start, unless the well is sealed (a sealed well closes the refuge).
      { when: { all: [{ quest: 'r06', state: ['active', 'completed'] }, { not: { flag: 'story.r06.choice', equals: 'sealed' } }] }, anchorId: 'npc-post.pennard.cinderford' },
      { when: live('m07'), anchorId: 'npc-post.pennard.bastion' },
    ],
  },
  // Density pass: Edda waits at the granary once the hearth-stone is out of the bakery, until M02 ends; Aldwin walks to
  // the chapel when he is found safe (his walk-off) and is back at the mill once M01 is done.
  {
    npcId: 'edda', home: 'npc-post.edda',
    posts: [{ when: { all: [{ quest: 'm02', state: 'active' }, { objective: ['m02', 'o2'], done: true }] }, anchorId: 'npc-post.edda.granary' }],
  },
  {
    npcId: 'aldwin', home: 'npc-post.aldwin',
    // while M01 runs after he was found, his walk-off owns him (a load mid-M01 must not snap him back to the mill)
    leaveWhen: { all: [{ quest: 'm01', state: 'active' }, { flag: 'story.m01.millerSafe' }] },
    posts: [{ when: m01Done, anchorId: 'npc-post.aldwin' }],
  },
  // Act 2 (A3, additive): Osgar holds the Cinderford barricade, then the hunters' camp for M15, then Scorchhold for D03.
  {
    npcId: 'osgar', home: 'npc-post.osgar.barricade',
    posts: [
      { when: live('d03'), anchorId: 'npc-post.osgar.scorchhold' },
      { when: live('m15'), anchorId: 'npc-post.osgar.camp' },
    ],
  },
  // Ketta keeps the pasture while R05 can still be offered or is open (M12 opens R05 and M13 together); she gives R07 at
  // Stonefold once M13 and R05 are both done (or R07 is already live), and her shop moves with her.
  {
    npcId: 'ketta', home: 'npc-post.ketta.pasture',
    posts: [
      {
        when: { any: [live('r07'), { all: [{ quest: 'm13', state: 'completed' }, { quest: 'r05', state: 'completed' }] }] },
        anchorId: 'npc-post.ketta.stonefold',
      },
    ],
  },
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
    const env = this.env();
    const left = new Set(this.rules.filter((r) => r.leaveWhen && evalCondition(r.leaveWhen, env)).map((r) => r.npcId));
    for (const [npcId, want] of Object.entries(resolvePosts(this.rules, env))) {
      if (left.has(npcId)) continue;
      const had = this.applied.get(npcId);
      if (want.home && had === undefined) continue;
      if (had === want.anchorId) continue;
      if (npcs.place(npcId, want.anchorId)) this.applied.set(npcId, want.anchorId);
      else pending = true;
    }
    this.dirty = pending;
  }
}
