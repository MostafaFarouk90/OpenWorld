import type { ChapterHarness } from './chapterHarness';
import type { PhaseAQuest, Trails } from './phaseA';

/**
 * Phase A play-time estimate (formula and table in src/integration/TIMING.md):
 *
 *   minutes = ( travel_m / WALK_MPS  +  TALK_NODE_S x nodes read  +  sum(beat seconds) ) / 60
 *
 * travel_m sums straight horizontal (x, z) distances between consecutive route points: the giver's post anchor,
 * each objective's anchor or trigger centre, back to the giver (where the giver stands for the hand-in). A door
 * between the world and the vault is a load, so the leg across it counts 0 (`DOOR`). Nodes read are the dialogue
 * nodes the chain test actually visited per quest (one key press each).
 */
export const WALK_MPS = 4.5;
export const TALK_NODE_S = 20;
/** Seconds per beat unit (all assumptions, chosen before comparing). */
export const BEAT_S = {
  /** one enemy of a kill objective (or the fight around it) */
  killUnit: 45,
  /** an interact (study, brazier, door, rekindle) */
  interact: 10,
  /** a Surge Leap attempt including lining it up */
  leap: 15,
  /** a breakable structure (the toll post) */
  structure: 20,
  /** one wardstone phrase (walk-up, listen, three beats) */
  wardstone: 30,
  /** one scarecrow knocked down and cleared */
  scarecrow: 30,
  /** one counted drill event on the blocking dummies (hit, parry, guard break) */
  drillEvent: 15,
  /** the Ashen Prior, intro to outcome */
  boss: 360,
} as const;

/** A route point: an anchor, a trigger centre, or the door marker (no travel across it). */
type Point = { anchor: string } | { trigger: string } | 'DOOR';
const A = (anchor: string): Point => ({ anchor });
const T = (trigger: string): Point => ({ trigger });

interface QuestPlan {
  design: number;
  route: Point[];
  beats: Partial<Record<keyof typeof BEAT_S, number>>;
  note: string;
}

export const PHASE_A_PLAN: Record<PhaseAQuest, QuestPlan> = {
  m03: {
    design: 40,
    route: [
      A('npc-post.aelfreda'), A('chapel.shard-study'), A('npc-post.aelfreda'), A('poi.leap.chapel-ledge.launch'),
      A('poi.leap.chapel-ledge'), A('npc-post.aelfreda'), A('pile.churchyard.1'), A('npc-post.aelfreda'),
    ],
    // o6 asks for one wraith, but all four rise together: the fight is the pack.
    beats: { interact: 1, leap: 1, killUnit: 4 },
    note: 'four churchyard wraiths rise together',
  },
  m04: {
    design: 45,
    route: [
      A('npc-post.gaut'), T('trg.ford.toll-post'), A('npc-post.gaut.ford'), A('spawn.ford.pair-1'), A('spawn.ford.pair-2'),
      A('ford.toll-post'), A('npc-post.carter-1'), A('npc-post.gaut.ford'),
    ],
    beats: { killUnit: 4, structure: 1 },
    note: 'o3 needs two, both pairs (four) aggro at the ford; Gaut hands in at the ford post',
  },
  m05: {
    design: 40,
    route: [
      A('npc-post.tobb'), A('wardstone.1'), A('wardstone.2'), A('wardstone.3'), A('wardstone.4'), A('wardstone.5'),
      A('waystone.quenchstone'),
    ],
    // The Dead Road patrols (2 x 3 wraiths) stand on the route until the stones are done.
    beats: { wardstone: 5, interact: 1, killUnit: 6 },
    note: 'Tobb walks with the player: no return leg; two road patrols (6 wraiths)',
  },
  r01: {
    design: 35,
    route: [
      A('npc-post.wynn'), A('r01.brazier.1'), A('r01.scarecrow.1'), A('r01.scarecrow.2'), A('r01.scarecrow.3'),
      A('r01.scarecrow.6'), A('r01.scarecrow.5'), A('r01.scarecrow.4'), A('npc-post.wynn'),
    ],
    beats: { interact: 1, scarecrow: 6 },
    note: 'torch route (brazier first)',
  },
  r02: {
    design: 30,
    route: [A('npc-post.stane'), A('yard.blocking-dummy-1'), A('yard.blocking-dummy-2'), A('yard.blocking-dummy-3'), A('npc-post.stane')],
    beats: { drillEvent: 8 },
    note: '3 open hits + 3 parries + 2 guard breaks',
  },
  d01: {
    design: 55,
    route: [
      A('npc-post.aelfreda'), A('vault.door'), 'DOOR', A('vault.entry'), T('trg.vault.arena'), A('vault.arena.centre'),
      A('vault.exit'), 'DOOR', A('vault.door'), A('npc-post.aelfreda.vault'),
    ],
    // The corridor's three wraiths and the Blightbloom, then the Prior.
    beats: { interact: 2, killUnit: 4, boss: 1 },
    note: 'vault: 3 wraiths + Blightbloom, then the Prior',
  },
};

export interface TimingRow {
  quest: PhaseAQuest;
  travelM: number;
  travelS: number;
  nodes: number;
  talkS: number;
  beatS: number;
  estimateMin: number;
  designMin: number;
  deltaPct: number;
  flagged: boolean;
  note: string;
}

export function estimateTiming(h: ChapterHarness, trails: Trails): TimingRow[] {
  const at = (p: Exclude<Point, 'DOOR'>): { x: number; z: number } => {
    if ('anchor' in p) return h.anchor(p.anchor);
    const c = h.triggerCentre(p.trigger);
    if (!c) throw new Error(`timing: trigger ${p.trigger} is not registered`);
    return c;
  };
  return (Object.keys(PHASE_A_PLAN) as PhaseAQuest[]).map((quest) => {
    const plan = PHASE_A_PLAN[quest];
    let travelM = 0;
    let prev: { x: number; z: number } | null = null;
    for (const p of plan.route) {
      if (p === 'DOOR') {
        prev = null;
        continue;
      }
      const cur = at(p);
      if (prev) travelM += Math.hypot(cur.x - prev.x, cur.z - prev.z);
      prev = cur;
    }
    const nodes = trails[quest].talks.reduce((n, t) => n + t.nodes, 0);
    const beatS = Object.entries(plan.beats).reduce((s, [k, n]) => s + BEAT_S[k as keyof typeof BEAT_S] * (n ?? 0), 0);
    const travelS = travelM / WALK_MPS;
    const talkS = nodes * TALK_NODE_S;
    const estimateMin = (travelS + talkS + beatS) / 60;
    const deltaPct = ((estimateMin - plan.design) / plan.design) * 100;
    return {
      quest, travelM, travelS, nodes, talkS, beatS, estimateMin, designMin: plan.design, deltaPct,
      flagged: Math.abs(deltaPct) > 25, note: plan.note,
    };
  });
}

export function timingMarkdown(rows: TimingRow[]): string {
  const f = (n: number, d = 1) => n.toFixed(d);
  const lines = [
    '| quest | travel m | travel min | nodes | talk min | beats min | estimate min | design min | delta % | |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |',
  ];
  for (const r of rows) {
    lines.push(
      `| ${r.quest.toUpperCase()} | ${f(r.travelM, 0)} | ${f(r.travelS / 60)} | ${r.nodes} | ${f(r.talkS / 60)} | ${f(r.beatS / 60)} | ${f(r.estimateMin)} | ${r.designMin} | ${r.deltaPct >= 0 ? '+' : ''}${f(r.deltaPct, 0)} | ${r.flagged ? '**>25% off**' : ''} |`,
    );
  }
  const est = rows.reduce((s, r) => s + r.estimateMin, 0);
  const design = rows.reduce((s, r) => s + r.designMin, 0);
  const d = ((est - design) / design) * 100;
  lines.push(`| **total** | | | | | | **${f(est)}** | **${design}** | **${d >= 0 ? '+' : ''}${f(d, 0)}** | ${Math.abs(d) > 25 ? '**>25% off**' : ''} |`);
  return lines.join('\n');
}
