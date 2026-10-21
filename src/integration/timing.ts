import type { ChapterHarness } from './chapterHarness';
import type { OpeningQuest, PhaseAQuest, QuestTrail, Trails } from './phaseA';
import type { PhaseBQuest } from './phaseB';

/**
 * Phase A play-time estimate (formula and table in src/integration/TIMING.md):
 *
 *   minutes = ( travel_m / WALK_MPS  +  TALK_NODE_S x nodes read  +  sum(beat seconds) ) / 60
 *
 * travel_m sums straight horizontal (x, z) distances between consecutive route points: the giver's post anchor,
 * each objective's anchor or trigger centre, back to the giver (where the giver stands for the hand-in). A door
 * between the world and the vault is a load, so the leg across it counts 0 (`DOOR`). Nodes read are the dialogue
 * nodes the chain test actually visited per quest (one key press each); a readable note counts as one `note` beat
 * instead of its nodes. `from` is the leg from where the previous quest in the same area ended to this quest's giver
 * (in-area giver-to-giver legs, density pass). A point marked `ride` is reached on horseback (RIDE_MPS).
 */
export const WALK_MPS = 4.5;
/** mounted legs (the Ashmare at a canter) */
export const RIDE_MPS = 9;
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
  /** the Ashen Prior, intro to outcome; Gaffer Grimtooth likewise */
  boss: 360,
  /** one stealth section walked (sneaking, waiting out patrols, hiding) from start to exit */
  stealthSection: 240,
  /** the M10 courier chase, start box to catch, one attempt */
  chase: 150,
  /** choosing a class at the trainer desk */
  classChoice: 60,
  /** the class drill (design 3: skippable, about 4 minutes; counted as played) */
  drill: 240,
  /** one carry: picking it up and setting it down (the walk with it is in the route) */
  carry: 15,
  /** one readable note, found and read (replaces its dialogue nodes) */
  note: 20,
  /** one sparring opponent on the Replay board */
  bout: 90,
  /** one pass of the lock-on pole drill */
  pole: 30,
} as const;

/**
 * Act 2 additions (plan Part 7). Seconds per beat unit for the beats Act 2 adds; the Act 1 table above is unchanged.
 * `structure` is the heavier Act 2 kind (a brazier cart, the boulder); Act 1's 20 s toll post stays in `BEAT_S`.
 */
export const ACT2_BEAT_S = {
  ...BEAT_S,
  /** a readable search point (a body, a ledger, a way-post) */
  search: 20,
  /** a wave enemy of A7's raid */
  waveEnemy: 45,
  /** a sheep walked home */
  herd: 45,
  /** one round of the trial duel */
  duelRound: 90,
  /** one rhythm run at an anvil */
  rhythm: 60,
  /** a valve puzzle attempt */
  puzzle: 120,
  /** one ride of the Deepgate lift */
  lift: 30,
  /** a counted set piece (the ride-out, the Anvil's song, the first flight) */
  set: 60,
  /** a heavy structure (a cart, the boulder) */
  structure: 65,
} as const;
/** Following a route-bound NPC (Wenna's route) walks at this pace. */
export const ROUTE_FOLLOW_MPS = 2;
/** Act 2 counts travel at most this share of the talk-and-beats time, so riding alone can never meet a floor. Opt-in: Act 1's numbers keep their uncapped travel. */
export const ACT2_TRAVEL_CAP = 3 / 7;
/** The travel seconds an Act 2 quest may count. */
export const cappedTravelS = (travelS: number, talkAndBeatsS: number): number => Math.min(travelS, ACT2_TRAVEL_CAP * talkAndBeatsS);

/** A route point: an anchor, a trigger centre, or the door marker (no travel across it). `ride`: reached mounted. */
type Point = { anchor: string; ride?: boolean } | { trigger: string; ride?: boolean } | 'DOOR';
const A = (anchor: string): Point => ({ anchor });
const T = (trigger: string): Point => ({ trigger });

export interface QuestPlan {
  design: number;
  /** where the previous quest in the same area ended (its giver or hand-in); the leg to this route's start counts */
  from?: Point;
  route: Point[];
  beats: Partial<Record<keyof typeof BEAT_S, number>>;
  note: string;
}

/** The Brightwater opening after the tutorial (density pass; played headless since batch 1). */
export const OPENING_PLAN: Record<OpeningQuest, QuestPlan> = {
  m01: {
    design: 40,
    // Gaut and Aelfreda stand at the Kettlewick gate (the tutorial's T15 spot) through M01.
    route: [
      A('beat.t15.start'), A('spawn.m01.wraith-4'), A('spawn.m01.wraith-3'), A('spawn.m01.wraith-5'), A('spawn.m01.wraith-2'),
      A('spawn.m01.wraith-1'), A('m01.villager-3'), T('m01.chapel-door'), A('m01.villager-2'), T('m01.chapel-door'),
      A('m01.villager-1'), T('m01.chapel-door'), A('m01.bucket-1'), T('m01.tavern-door'), A('m01.bucket-2'), T('m01.tavern-door'),
      A('npc-post.tobb'), A('spawn.m01.mill-1'), A('npc-post.aldwin'), A('beat.t15.start'),
    ],
    beats: { killUnit: 9, carry: 5 },
    note: 'five lane wraiths, three villagers, two buckets, Tobb, the mill (four wraiths) and the miller, Aelfreda',
  },
  m02: {
    design: 35,
    from: A('beat.t15.start'),
    route: [
      A('npc-post.edda'), A('m02.bucket-1'), T('m02.bakery-door'), A('m02.bucket-2'), T('m02.bakery-door'), T('m02.bakery'),
      A('m02.rubble-1'), A('m02.rubble-2'), A('spawn.m02.oven-3'), A('kettlewick.bakery-hearth'), A('m02.badge'), T('m02.granary'),
      A('npc-post.garrick'), A('npc-post.edda.granary'), A('m02.common-hearth'),
    ],
    beats: { carry: 2, interact: 4, killUnit: 3, note: 1 },
    note: 'two buckets, the thatch (2), the oven yard (3), the stone, the badge, the granary, Garrick, Edda, the hearth',
  },
};

export const PHASE_A_PLAN: Record<PhaseAQuest, QuestPlan> = {
  m03: {
    design: 40,
    from: A('m02.common-hearth'),
    route: [
      A('npc-post.aelfreda'), A('chapel.shard-study'), A('chapel.font'), A('chapel.ember-study'), A('chapel.record'), A('npc-post.aelfreda'),
      A('poi.leap.chapel-ledge.launch'), A('m03.candle'), A('m03.grave-wulfric'), A('npc-post.aelfreda'), A('pile.churchyard.1'),
      A('npc-post.aelfreda'),
    ],
    // all four churchyard wraiths now count (they rise together)
    beats: { interact: 2, leap: 1, killUnit: 4, note: 4 },
    note: 'four studies, the Leap and the candle, Wulfric\'s grave, four churchyard wraiths, the record',
  },
  m04: {
    design: 45,
    from: A('npc-post.aelfreda'),
    route: [
      A('npc-post.gaut'), T('trg.ford.toll-post'), A('npc-post.gaut.ford'), A('spawn.ford.pair-1'), A('spawn.ford.pair-2'),
      A('spawn.ford.sergeant'), A('ford.toll-post'), A('m04.toll-box'), A('npc-post.gaut.ford'), A('m04.wagon-1'), A('m04.wagon-2'), A('m04.wagon-3'),
      A('npc-post.carter-2'), A('npc-post.carter-3'), A('npc-post.carter-1'), A('npc-post.gaut.ford'),
    ],
    // the four Footmen and the Toll Sergeant (counted as one unit, though an elite)
    beats: { killUnit: 5, structure: 1, interact: 3, note: 1 },
    note: 'four Footmen, the Toll Sergeant, the post, the ledger, three wagons, three carters; Gaut hands in at the ford',
  },
  m05: {
    design: 40,
    from: A('npc-post.gaut.ford'),
    route: [
      A('npc-post.tobb'), A('wardstone.1'), A('wardstone.2'), A('m05.journal'), A('wardstone.3'), A('wardstone.4'), A('wardstone.5'),
      A('spawn.m05.shrine-1'), A('waystone.quenchstone'),
    ],
    // The Dead Road patrols (2 x 3 wraiths) stand on the route until the stones are done; then the shrine push (4).
    beats: { wardstone: 5, interact: 1, killUnit: 10, note: 1 },
    note: 'Tobb walks with the player: no return leg; the journal, two road patrols (6 wraiths), the shrine push (4), the bond scene',
  },
  r01: {
    design: 35,
    // M05 ends at the Quenchstone, outside Brightwater: no giver leg
    route: [
      A('npc-post.wynn'), A('r01.shawl'), A('r01.brazier.1'), A('r01.scarecrow.1'), A('r01.scarecrow.2'), A('r01.scarecrow.3'),
      A('r01.scarecrow.6'), A('r01.scarecrow.5'), A('r01.scarecrow.4'), A('r01.scarecrow.7'), A('r01.scarecrow.8'),
      A('spawn.r01.root-1'), A('r01.bucket-1'), T('r01.stubble'), A('r01.bucket-2'), T('r01.stubble'), A('npc-post.wynn'),
    ],
    beats: { interact: 1, scarecrow: 8, killUnit: 3, carry: 2, note: 1 },
    note: 'torch route (brazier first), eight scarecrows, the root (3), the stubble fire (two buckets)',
  },
  r02: {
    design: 30,
    from: A('npc-post.wynn'),
    // the chain plays R02 in the Practice Yard before Harrowmark (from M06 on it runs in the Bastion yard)
    route: [
      A('npc-post.stane'), A('yard.blocking-dummy-1'), A('yard.blocking-dummy-2'), A('yard.blocking-dummy-3'), A('npc-post.stane'),
      A('spawn.r02.yard-bout'), A('npc-post.stane'), A('spawn.r02.yard-pair-1'), A('npc-post.stane'),
    ],
    beats: { drillEvent: 8, bout: 3 },
    note: '3 open hits + 3 parries + 2 guard breaks, two stories, a bout with one yard veteran and one with two',
  },
  d01: {
    design: 55,
    from: A('npc-post.stane'),
    route: [
      A('npc-post.aelfreda'), A('vault.door'), 'DOOR', A('vault.entry'), A('d01.tablet-1'), A('d01.tablet-2'), A('d01.tablet-3'),
      A('d01.tablet-4'), A('d01.brazier-1'), A('d01.brazier-2'), A('d01.brazier-3'), T('trg.vault.arena'), A('vault.arena.centre'),
      A('d01.censer'), A('vault.exit'), 'DOOR', A('vault.door'), A('npc-post.aelfreda.vault'), A('d01.altar'), A('npc-post.aelfreda.vault'),
    ],
    // The corridor's three wraiths and the Blightbloom, the antechamber's four, then the Prior.
    beats: { interact: 6, killUnit: 8, boss: 1, note: 5 },
    note: 'vault: 3 wraiths + Blightbloom, four tablets, three braziers, four wall wraiths, the Prior, his censer, the altar vigil',
  },
};

/**
 * Phase B (Harrowmark), on run A's trails (src/integration/chapter.e2e.test.ts). Doors into interiors are loads (no
 * travel across them); travel inside an interior is not counted (its rooms are small next to the city legs).
 */
export const PHASE_B_PLAN: Record<PhaseBQuest, QuestPlan> = {
  m06: {
    design: 45,
    route: [
      A('npc-post.rook.gate'), A('harrowmark.gate.south.queue.1'), A('harrowmark.gate.south.queue.3'), A('npc-post.rook.gate'),
      A('stealth.m06.start'), A('stealth.m06.cp.inside'), A('stealth.m06.end'), A('m06.gate-brazier'), A('npc-post.rook.inner'),
      A('harrowmark.gate.south.queue.1'), T('trg.harrowmark.anvil-sign'),
    ],
    beats: { stealthSection: 1, interact: 1 },
    note: 'the queue (two refugees), the stealth route (the bribe and the argument skip the section), the brazier, Rook\'s districts, the word to the queue, the Anvil',
  },
  m07: {
    design: 40,
    from: T('trg.harrowmark.anvil-sign'),
    route: [
      A('npc-post.aldith'), A('npc-post.stallholder-1'), A('npc-post.stallholder-2'), A('m07.coin-1'), A('m07.coin-2'), A('m07.coin-3'),
      A('m07.thieves.1'), A('m07.satchel'), A('npc-post.aldith'), T('trg.harrowmark.bastion-yard'),
    ],
    beats: { killUnit: 3, interact: 4, classChoice: 1, drill: 1 },
    note: 'two stallholders, three coins, three cutpurses, the satchel, the class choice and its drill',
  },
  r03: {
    design: 40,
    from: T('trg.harrowmark.bastion-yard'),
    route: [
      A('npc-post.aldith'), A('npc-post.guild-doorman'), A('r03.guildhall.1'), A('npc-post.pellam'), A('r03.brewing-copper'),
      A('spawn.r03.snatch-1'), A('npc-post.aldith'),
    ],
    beats: { killUnit: 5, interact: 1 },
    note: 'the doorman, three guildhall thugs, Pellam\'s plea, the copper, the two snatchers',
  },
  r04: {
    design: 40,
    from: A('npc-post.aldith'),
    route: [
      A('npc-post.whitlock'), A('harrowmark.archive.door'), 'DOOR', A('harrowmark.archive.door'), A('npc-post.sexton'),
      A('npc-post.fence'), A('npc-post.crabbe'), A('npc-post.whitlock'),
    ],
    beats: { interact: 4 },
    note: 'the stacks lock and the page behind it (two doors), the sexton, the fence, Crabbe, Whitlock reads the pages',
  },
  m08: {
    design: 50,
    from: A('npc-post.whitlock'),
    route: [
      A('npc-post.wystan'), A('npc-post.armourer'), A('npc-post.keep-guard'), A('harrowmark.keep-hall.door'), 'DOOR',
      A('harrowmark.keep-hall.door'), A('npc-post.wystan'),
    ],
    beats: { interact: 2, note: 1 },
    note: 'the fitting, the warden, Merrin and Grisel waiting, the audience (three questions and the king\'s own), the screen; doors in and out',
  },
  m09: {
    design: 55,
    from: A('npc-post.wystan'),
    route: [
      A('npc-post.merrin'), A('npc-post.clerk'), A('m09.clerk-key'), A('harrowmark.counting-house.door'), 'DOOR',
      A('harrowmark.counting-house.door'), A('npc-post.clerk'), A('harrowmark.counting-house.door'),
    ],
    beats: { stealthSection: 1, interact: 9, note: 1 },
    note: 'the clerk and his key, the day-book, one stealth section, three invoices and the strongbox, the key back, four doors (Merrin reports inside)',
  },
  m10: {
    design: 45,
    from: A('npc-post.merrin'),
    route: [
      A('npc-post.gerta.guild'), A('chase.m10.0'), 'DOOR', A('chase.m10.15'), A('m10.courier-orders'), A('spawn.m10.ambush-1'),
      A('npc-post.gerta.guild'), A('npc-post.wace'), A('harrowmark.stables.yard'), T('trg.harrowmark.m10-ride'),
    ],
    beats: { chase: 1, note: 1, killUnit: 2 },
    note: 'the chase line itself is the chase beat (no travel counted along it); the orders, Vey\'s two men, Wace, the first ride',
  },
  d02: {
    design: 60,
    from: T('trg.harrowmark.m10-ride'),
    route: [
      A('npc-post.rook'), A('spawn.d02.stray-1'), A('npc-post.rook'), A('harrowmark.underways.door'), 'DOOR',
      A('harrowmark.underways.door'), A('npc-post.rook'),
    ],
    beats: { interact: 4, killUnit: 9, boss: 1, note: 2 },
    note: 'two strays and Rook\'s word, kennels (4 of 6 hounds), the tally, two valves and three sluice hounds, Grimtooth, his den; doors in and out',
  },
};

export interface TimingRow {
  quest: string;
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
  return estimateTimingFor(h, PHASE_A_PLAN, trails);
}

/** The same estimate for any plan table and the trails one run of it visited. */
export function estimateTimingFor<Q extends string>(h: ChapterHarness, planTable: Record<Q, QuestPlan>, trails: Record<Q, QuestTrail>): TimingRow[] {
  const at = (p: Exclude<Point, 'DOOR'>): { x: number; z: number } => {
    if ('anchor' in p) return h.anchor(p.anchor);
    const c = h.triggerCentre(p.trigger);
    if (!c) throw new Error(`timing: trigger ${p.trigger} is not registered`);
    return c;
  };
  return (Object.keys(planTable) as Q[]).map((quest) => {
    const plan = planTable[quest];
    let travelM = 0;
    let travelS = 0;
    let prev: { x: number; z: number } | null = null;
    for (const p of plan.from ? [plan.from, ...plan.route] : plan.route) {
      if (p === 'DOOR') {
        prev = null;
        continue;
      }
      const cur = at(p);
      if (prev) {
        const m = Math.hypot(cur.x - prev.x, cur.z - prev.z);
        travelM += m;
        travelS += m / (p.ride ? RIDE_MPS : WALK_MPS);
      }
      prev = cur;
    }
    // a note is one `note` beat, not its nodes
    const nodes = trails[quest].talks.filter((t) => !t.npc.startsWith('note-')).reduce((n, t) => n + t.nodes, 0);
    const beatS = Object.entries(plan.beats).reduce((s, [k, n]) => s + BEAT_S[k as keyof typeof BEAT_S] * (n ?? 0), 0);
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
