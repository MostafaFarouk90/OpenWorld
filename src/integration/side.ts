import type { ChapterHarness } from './chapterHarness';
import {
  carryTo, describeQuest, ensure, heal, killAsPlayer, npcPosition, objectiveDone, readNote, spawnedTagged, talkTo, type QuestTrail,
} from './phaseA';
import { enterInterior, killGroup, leaveInterior, useAt as focusUse } from './phaseB';

/**
 * The Act 1 side jobs ("jobs") played headless on a booted chapter game, one function per job, with the same trails and
 * hand-off checks as the main chain (src/integration/phaseA.ts). The jobs are optional: the main chain never plays them.
 * j01 to j04 (Brightwater and the Dead Road), j05 to j10 (Harrowmark) and j11 (the Underways); each has a row in `SIDE_ORDER`,
 * `SIDE_PLAYERS` and SIDE_PLAN (src/integration/timing.ts).
 *
 * Start state of every function: the main quests it needs are done (j01 to j03 after M02, j04 after M05 and its bond scene,
 * j05, j06 and j08 after M06, j07 after M07, j09 after R02 with M06 started, j10 after M07 and j04, j11 after D02). The saves to
 * play them from (src/integration/side.e2e.test.ts): the Phase A end save for j01 to j04, the Act 1 fixtures `m06ThroughGate` for
 * j05, j06 and j08, `m07ClassChosen` for j07, j09 and j10 (j04 first), `complete` for j11.
 */
export type SideJob = 'j01' | 'j02' | 'j03' | 'j04' | 'j05' | 'j06' | 'j07' | 'j08' | 'j09' | 'j10' | 'j11';
export const SIDE_ORDER: readonly SideJob[] = ['j01', 'j02', 'j03', 'j04', 'j05', 'j06', 'j07', 'j08', 'j09', 'j10', 'j11'];
export type SideTrails = Record<SideJob, QuestTrail>;
export const emptySideTrails = (): SideTrails => Object.fromEntries(SIDE_ORDER.map((j) => [j, { talks: [] }])) as unknown as SideTrails;

const quests = (h: ChapterHarness) => h.ctx.services.require('quests');
const flag = (h: ChapterHarness, k: string) => h.ctx.state.getFlag(k);

/** Stands at an anchor and presses F on what is there (a prop, a pickup). */
async function useAt(h: ChapterHarness, anchorId: string, dist = 1.2): Promise<void> {
  heal(h);
  await h.approach(h.anchor(anchorId), dist);
  h.press('KeyF');
  h.run(2);
}

/** Real playing: Edda's farewell is heard first (it precedes her offer), outside the job's own trail. */
async function hearFarewell(h: ChapterHarness): Promise<void> {
  if (flag(h, 'quest.m02.farewellSeen') !== true) await talkTo(h, { talks: [] }, 'edda');
}

// ---------------------------------------------------------------------------------------------------------------
// j01 Hob's Strayed Lambs

export async function playJ01(h: ChapterHarness, t: QuestTrail): Promise<void> {
  const q = quests(h);
  ensure(q.state('j01') === 'inactive', 'j01 not started yet');
  // Hob's offer: ask where the lambs went and why he cannot call them, then accept
  await talkTo(h, t, 'hob', [1, 2, 3]);
  ensure(q.state('j01') === 'active', `Hob offers j01: ${describeQuest(h, 'j01')}`);
  await h.runAsync(30);
  const sites = ['j01.scar', 'j01.scarecrows', 'j01.ford'];
  for (let n = 1; n <= 3; n++) {
    await h.enterTrigger(sites[n - 1]);
    ensure(objectiveDone(h, 'j01', ['scar', 'scarecrows', 'ford'][n - 1]), `site ${sites[n - 1]} reached`);
    await carryTo(h, `j01.lamb-${n}`, 'j01.fold', `story.j01.lamb${n}.delivered`);
  }
  ensure(objectiveDone(h, 'j01', 'lambs'), `three lambs in the fold: ${describeQuest(h, 'j01')}`);
  await talkTo(h, t, 'hob');
  ensure(q.state('j01') === 'completed', `j01 completed: ${describeQuest(h, 'j01')}`);
}

// ---------------------------------------------------------------------------------------------------------------
// j02 Edda's Bread Round

export async function playJ02(h: ChapterHarness, t: QuestTrail, loaf: 'left' | 'kept' = 'left'): Promise<void> {
  const q = quests(h);
  ensure(q.state('j02') === 'inactive', 'j02 not started yet');
  await hearFarewell(h);
  await talkTo(h, t, 'edda', [1]);
  ensure(q.state('j02') === 'active', `Edda offers j02: ${describeQuest(h, 'j02')}`);
  await h.runAsync(30);
  await useAt(h, 'j02.basket');
  ensure(objectiveDone(h, 'j02', 'basket'), `the basket taken: ${describeQuest(h, 'j02')}`);
  await talkTo(h, t, 'orla', [loaf === 'left' ? 1 : 2]);
  ensure(objectiveDone(h, 'j02', 'orla') && flag(h, 'story.j02.loaf') === loaf, `Orla's door (${loaf}): ${describeQuest(h, 'j02')}`);
  await talkTo(h, t, 'aldwin');
  ensure(objectiveDone(h, 'j02', 'aldwin'), 'the miller\'s door');
  await talkTo(h, t, 'osmund');
  ensure(objectiveDone(h, 'j02', 'osmund'), 'the sexton\'s door');
  await talkTo(h, t, 'edda');
  ensure(q.state('j02') === 'completed', `j02 completed: ${describeQuest(h, 'j02')}`);
}

// ---------------------------------------------------------------------------------------------------------------
// j03 Waystones of the Dead Road (no giver: reading either stone starts it)

/** Reads the bluff stone after a real Surge Leap from the launch spot onto the ledge. */
export async function readBluff(h: ChapterHarness, t: QuestTrail): Promise<void> {
  const dialogue = h.ctx.services.require('dialogue');
  ensure(h.ctx.state.getBool('ability.surge-leap.learned'), 'the Surge Leap is learned (M03)');
  const launch = h.ctx.anchors.find('j03.bluff.launch');
  ensure(launch, 'bluff launch anchor');
  await h.teleport({ x: launch.position.x, z: launch.position.z }, 10, launch.yaw);
  h.press('KeyV');
  for (let i = 0; i < 120 && !dialogue.active; i++) {
    h.run(1);
    if (i > 30 && i % 10 === 0) h.press('KeyF'); // standing on the ledge: F reads the stone
  }
  ensure(dialogue.active, `the bluff stone opened (feet ${h.ctx.player.feet.toArray().map((v) => v.toFixed(1))})`);
  let nodes = 0;
  for (; nodes < 20 && dialogue.active; nodes++) {
    h.press('KeyF');
    h.run(1);
  }
  ensure(!dialogue.active, 'the bluff stone closed');
  t.talks.push({ npc: 'note-j03-bluff', dialogueId: 'note-j03-bluff', nodes });
  await h.runAsync(2);
}

/** The barrow: the pair rises once the job has begun; both are put down, then the tablet is read. */
export async function clearBarrow(h: ChapterHarness): Promise<void> {
  const ids = await spawnedTagged(h, 'ash-wraith', 'j03.barrow', 2, h.anchor('spawn.j03.barrow-1'));
  for (const id of ids) ensure(killAsPlayer(h, id), `barrow wraith ${id} killed`);
  h.run(2);
  heal(h);
}

export async function playJ03(h: ChapterHarness, t: QuestTrail, first: 'bluff' | 'tablet' = 'bluff'): Promise<void> {
  const q = quests(h);
  ensure(q.state('j03') === 'inactive', 'j03 not started yet');
  if (first === 'bluff') {
    await readBluff(h, t);
    ensure(q.state('j03') === 'active' && objectiveDone(h, 'j03', 'bluff'), `the bluff stone starts j03: ${describeQuest(h, 'j03')}`);
    await clearBarrow(h);
    await readNote(h, t, 'note-j03-tablet', 'j03.barrow-tablet');
  } else {
    await readNote(h, t, 'note-j03-tablet', 'j03.barrow-tablet');
    ensure(q.state('j03') === 'active' && objectiveDone(h, 'j03', 'tablet'), `the tablet starts j03: ${describeQuest(h, 'j03')}`);
    await clearBarrow(h);
    await readBluff(h, t);
  }
  ensure(objectiveDone(h, 'j03', 'wake'), 'the barrow pair put down');
  ensure(q.state('j03') === 'completed', `j03 completed: ${describeQuest(h, 'j03')}`);
}

// ---------------------------------------------------------------------------------------------------------------
// j04 Tobb's First Verse (Tobb walks with Cael after M05; the fire ring stands on the last stretch to the Quenchstone)

export async function playJ04(h: ChapterHarness, t: QuestTrail, verse: 'ash' | 'grain' | 'bread' = 'ash'): Promise<void> {
  const q = quests(h);
  ensure(q.state('j04') === 'inactive', 'j04 not started yet');
  ensure(flag(h, 'story.m05.tobbBond') === true, 'the bond scene is told');
  npcPosition(h, 'tobb');
  await talkTo(h, t, 'tobb', [1]);
  ensure(q.state('j04') === 'active', `Tobb offers j04: ${describeQuest(h, 'j04')}`);
  await h.runAsync(30);
  await useAt(h, 'j04.fire-ring');
  ensure(objectiveDone(h, 'j04', 'fire') && flag(h, 'story.j04.fireLit') === true, `the fire ring lit: ${describeQuest(h, 'j04')}`);
  await talkTo(h, t, 'tobb', [['ash', 'grain', 'bread'].indexOf(verse) + 1]);
  ensure(flag(h, 'story.j04.verse') === verse, `the verse is ${verse}`);
  ensure(q.state('j04') === 'completed', `j04 completed: ${describeQuest(h, 'j04')}`);
}

// ---------------------------------------------------------------------------------------------------------------
// j05 to j07 Rook's board (the board by the Watch Barracks; after M06, j07 after M07)

const xp = (h: ChapterHarness) => h.ctx.services.require('progression').xp;

export async function playJ05(h: ChapterHarness, t: QuestTrail): Promise<void> {
  const q = quests(h);
  ensure(q.state('j05') === 'inactive', 'j05 not started yet');
  await readNote(h, t, 'note-j05-notice', 'j05.notice');
  ensure(q.state('j05') === 'active' && objectiveDone(h, 'j05', 'notice'), `the notice starts j05: ${describeQuest(h, 'j05')}`);
  await talkTo(h, t, 'stallholder-1');
  ensure(objectiveDone(h, 'j05', 'owner'), `Godric's brief: ${describeQuest(h, 'j05')}`);
  for (const n of [1, 2, 3]) {
    await h.enterTrigger(`j05.search-${n}`);
    ensure(objectiveDone(h, 'j05', `search${n}`), `search point ${n}: ${describeQuest(h, 'j05')}`);
  }
  // the dog waits at the last point (the conditional post), and goes home once found
  await h.runAsync(30);
  const wait = h.anchor('npc-post.crumb.wait');
  ensure(Math.hypot(npcPosition(h, 'crumb').x - wait.x, npcPosition(h, 'crumb').z - wait.z) < 3, 'Crumb waits at the last search point');
  await talkTo(h, t, 'crumb');
  ensure(objectiveDone(h, 'j05', 'find'), `Crumb found: ${describeQuest(h, 'j05')}`);
  await h.runAsync(60);
  const home = h.anchor('npc-post.crumb.home');
  ensure(Math.hypot(npcPosition(h, 'crumb').x - home.x, npcPosition(h, 'crumb').z - home.z) < 3, 'Crumb went home to the stall');
  await talkTo(h, t, 'stallholder-1');
  ensure(q.state('j05') === 'completed', `j05 completed: ${describeQuest(h, 'j05')}`);
}

export async function playJ06(h: ChapterHarness, t: QuestTrail): Promise<void> {
  const q = quests(h);
  ensure(q.state('j06') === 'inactive', 'j06 not started yet');
  await readNote(h, t, 'note-j06-notice', 'j06.notice');
  ensure(q.state('j06') === 'active', `the notice starts j06: ${describeQuest(h, 'j06')}`);
  await talkTo(h, t, 'dunstan');
  ensure(objectiveDone(h, 'j06', 'smith'), `Dunstan's brief: ${describeQuest(h, 'j06')}`);
  await carryTo(h, 'j06.crate', 'j06.forge', 'story.j06.crate.delivered');
  ensure(objectiveDone(h, 'j06', 'crate'), `the crate carried: ${describeQuest(h, 'j06')}`);
  await talkTo(h, t, 'dunstan');
  ensure(q.state('j06') === 'completed', `j06 completed: ${describeQuest(h, 'j06')}`);
}

export async function playJ07(h: ChapterHarness, t: QuestTrail): Promise<void> {
  const q = quests(h);
  ensure(q.state('j07') === 'inactive', 'j07 not started yet');
  await readNote(h, t, 'note-j07-notice', 'j07.notice');
  ensure(q.state('j07') === 'active', `the notice starts j07: ${describeQuest(h, 'j07')}`);
  await talkTo(h, t, 'chandler');
  await focusUse(h, 'j07.candles', 'use:j07-candles');
  ensure(objectiveDone(h, 'j07', 'candles'), `the candles taken: ${describeQuest(h, 'j07')}`);
  for (const n of [1, 2, 3]) {
    await focusUse(h, `j07.niche-${n}`, `use:j07-niche-${n}`);
    ensure(objectiveDone(h, 'j07', `niche${n}`), `niche ${n} lit: ${describeQuest(h, 'j07')}`);
  }
  await talkTo(h, t, 'sexton');
  ensure(q.state('j07') === 'completed', `j07 completed: ${describeQuest(h, 'j07')}`);
  ensure(h.ctx.services.require('codex').has('lore.chapel-niches'), 'the niches entry is in the codex');
}

// ---------------------------------------------------------------------------------------------------------------
// j08 Watch Patrol

export async function playJ08(h: ChapterHarness, t: QuestTrail): Promise<void> {
  const q = quests(h);
  ensure(q.state('j08') === 'inactive', 'j08 not started yet');
  ensure(flag(h, 'story.side.boardOpen') === true, 'the sergeant has the board (M06 done)');
  await talkTo(h, t, 'sergeant', [1]);
  ensure(q.state('j08') === 'active' && objectiveDone(h, 'j08', 'orders'), `the sergeant's orders: ${describeQuest(h, 'j08')}`);
  for (const n of [1, 2]) {
    await h.enterTrigger(`j08.lane-${n}`);
    ensure(objectiveDone(h, 'j08', `lane${n}`), `lane point ${n}: ${describeQuest(h, 'j08')}`);
  }
  await talkTo(h, t, 'dunstan');
  ensure(objectiveDone(h, 'j08', 'bark1'), `the smith's remark: ${describeQuest(h, 'j08')}`);
  await h.enterTrigger('j08.lane-3');
  await talkTo(h, t, 'aldith');
  ensure(objectiveDone(h, 'j08', 'bark2') && flag(h, 'story.j08.alleyWoke') === true, `Aldith's remark wakes the alley: ${describeQuest(h, 'j08')}`);
  await h.enterTrigger('j08.lane-4');
  const ids = await spawnedTagged(h, 'alley-cutpurse', 'j08.cutpurse', 2, h.anchor('spawn.j08.cutpurse-1'));
  for (const id of ids) ensure(killAsPlayer(h, id), `cutpurse ${id} down`);
  h.run(2);
  heal(h);
  ensure(objectiveDone(h, 'j08', 'cutpurses'), `the pair dealt with: ${describeQuest(h, 'j08')}`);
  await talkTo(h, t, 'sergeant');
  ensure(q.state('j08') === 'completed', `j08 completed: ${describeQuest(h, 'j08')}`);
}

// ---------------------------------------------------------------------------------------------------------------
// j09 Stane's Open Board (three bouts on R02's Bastion anchors)

/** One bout: the veteran rises from its tag at the R02 spot and is put down (a kill; the Spare path is covered at logic level). */
async function bout(h: ChapterHarness, tag: string): Promise<void> {
  const ids = await spawnedTagged(h, 'yard-veteran', tag, 1, h.anchor('spawn.r02.bastion-bout'));
  for (const id of ids) ensure(killAsPlayer(h, id), `veteran ${id} down`);
  h.run(2);
  heal(h);
}

export async function playJ09(h: ChapterHarness, t: QuestTrail): Promise<void> {
  const q = quests(h);
  ensure(q.state('j09') === 'inactive' && q.state('r02') === 'completed', 'j09 not started, R02 done');
  const before = xp(h);
  await talkTo(h, t, 'stane', [1]);
  ensure(q.state('j09') === 'active', `Stane offers j09: ${describeQuest(h, 'j09')}`);
  await bout(h, 'j09.b1');
  ensure(objectiveDone(h, 'j09', 'bout1'), `bout 1: ${describeQuest(h, 'j09')}`);
  await talkTo(h, t, 'stane');
  await bout(h, 'j09.b2');
  ensure(objectiveDone(h, 'j09', 'bout2'), `bout 2: ${describeQuest(h, 'j09')}`);
  await talkTo(h, t, 'stane');
  await bout(h, 'j09.b3');
  ensure(objectiveDone(h, 'j09', 'bout3'), `bout 3: ${describeQuest(h, 'j09')}`);
  await talkTo(h, t, 'stane');
  ensure(q.state('j09') === 'completed', `j09 completed: ${describeQuest(h, 'j09')}`);
  ensure(xp(h) - before === 50, `the bouts paid no kill XP, the job paid its 50 (paid ${xp(h) - before})`);
  ensure(h.ctx.services.require('codex').has('lore.halvard-open-board'), 'the Halvard entry is in the codex');
}

/** After j09: one more bout on Stane's offer pays no XP and no gold. */
export async function playJ09Repeat(h: ChapterHarness, t: QuestTrail): Promise<{ xp: number; gold: number }> {
  ensure(quests(h).state('j09') === 'completed', 'j09 done');
  const inv = h.ctx.services.require('inventory');
  const before = { xp: xp(h), gold: inv.gold };
  await talkTo(h, t, 'stane', [1]);
  ensure(flag(h, 'story.j09.repeat') === true, 'Stane called the repeat bout');
  await bout(h, 'j09.repeat');
  return { xp: xp(h) - before.xp, gold: inv.gold - before.gold };
}

// ---------------------------------------------------------------------------------------------------------------
// j10 Tobb's Second Verse (Tobb walks with Cael; the ring stands in the Tilted Anvil yard)

export async function playJ10(h: ChapterHarness, t: QuestTrail, verse: 'forge' | 'gate' | 'window' = 'forge'): Promise<void> {
  const q = quests(h);
  ensure(q.state('j10') === 'inactive' && q.state('j04') === 'completed', 'j10 not started, j04 done');
  await talkTo(h, t, 'tobb', [1]);
  ensure(q.state('j10') === 'active', `Tobb offers j10: ${describeQuest(h, 'j10')}`);
  await focusUse(h, 'j10.fire-ring', 'use:j10-fire');
  ensure(objectiveDone(h, 'j10', 'fire') && flag(h, 'story.j10.fireLit') === true, `the ring lit: ${describeQuest(h, 'j10')}`);
  await talkTo(h, t, 'tobb', [['forge', 'gate', 'window'].indexOf(verse) + 1]);
  ensure(flag(h, 'story.j10.verse') === verse, `the verse is ${verse}`);
  ensure(q.state('j10') === 'completed', `j10 completed: ${describeQuest(h, 'j10')}`);
}

// ---------------------------------------------------------------------------------------------------------------
// j11 The Crates' Cart Tracks (the Underways spur; after D02, with the Sewer Master Key)

export async function playJ11(h: ChapterHarness, t: QuestTrail): Promise<void> {
  const q = quests(h);
  ensure(q.state('j11') === 'inactive' && q.state('d02') === 'completed', 'j11 not started, D02 done');
  ensure(h.ctx.services.require('inventory').count('sewer-master-key') >= 1, 'the Sewer Master Key is in the pack');
  await talkTo(h, t, 'rook', [1]);
  ensure(q.state('j11') === 'active' && objectiveDone(h, 'j11', 'listen'), `Rook offers j11: ${describeQuest(h, 'j11')}`);
  await enterInterior(h, 'underways', 'underways');
  await focusUse(h, 'j11.grate', 'use:j11-grate');
  ensure(objectiveDone(h, 'j11', 'grate') && flag(h, 'world.underways.cartway') === true, `the key turned: ${describeQuest(h, 'j11')}`);
  await h.enterTrigger('trg.underways.j11-track-1');
  await h.enterTrigger('trg.underways.j11-track-2');
  ensure(objectiveDone(h, 'j11', 'track2'), `the tracks followed: ${describeQuest(h, 'j11')}`);
  await killGroup(h, 'j11.hounds', 'ember-hound', 2, 'j11.spawn.hound-1', 1.5);
  ensure(objectiveDone(h, 'j11', 'hounds'), `the hounds: ${describeQuest(h, 'j11')}`);
  await readNote(h, t, 'note-j11-waybill', 'j11.waybill');
  ensure(objectiveDone(h, 'j11', 'waybill'), `the waybill read: ${describeQuest(h, 'j11')}`);
  await leaveInterior(h);
  await talkTo(h, t, 'rook');
  ensure(q.state('j11') === 'completed', `j11 completed: ${describeQuest(h, 'j11')}`);
  ensure(h.ctx.services.require('codex').has('lore.cart-tracks'), 'the cart-tracks entry is in the codex');
}

export const SIDE_PLAYERS: Record<SideJob, (h: ChapterHarness, t: QuestTrail) => Promise<void>> = {
  j01: playJ01,
  j02: playJ02,
  j03: playJ03,
  j04: playJ04,
  j05: playJ05,
  j06: playJ06,
  j07: playJ07,
  j08: playJ08,
  j09: playJ09,
  j10: playJ10,
  j11: playJ11,
};

/** The Brightwater and Dead Road jobs, playable together from the Phase A end save. */
export const SIDE_BRIGHTWATER: readonly SideJob[] = ['j01', 'j02', 'j03', 'j04'];

/** Plays the listed jobs (default the Brightwater four, in order; the Harrowmark ones start from other saves, see above). */
export async function playSideJobs(h: ChapterHarness, trails: SideTrails, jobs: readonly SideJob[] = SIDE_BRIGHTWATER): Promise<void> {
  for (const j of jobs) await SIDE_PLAYERS[j](h, trails[j]);
}

