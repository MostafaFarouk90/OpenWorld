import type { ChapterHarness } from './chapterHarness';
import {
  carryTo, describeQuest, ensure, heal, killAsPlayer, npcPosition, objectiveDone, readNote, spawnedTagged, talkTo, type QuestTrail,
} from './phaseA';

/**
 * The Act 1 side jobs ("jobs") played headless on a booted chapter game, one function per job, with the same trails and
 * hand-off checks as the main chain (src/integration/phaseA.ts). The jobs are optional: the main chain never plays them.
 * This round: j01 to j04 (Brightwater and the Dead Road); the Harrowmark jobs j05 to j10 and the Underways job j11 add
 * their `play` functions here and a row in `SIDE_ORDER`, `SidePlayers` and SIDE_PLAN (src/integration/timing.ts).
 *
 * Start state of every function: the main quests it needs are done (j01 to j03 after M02, j04 after M05 and its bond scene).
 * The Phase A end save is the usual place to play them from (src/integration/side.e2e.test.ts).
 */
export type SideJob = 'j01' | 'j02' | 'j03' | 'j04';
export const SIDE_ORDER: readonly SideJob[] = ['j01', 'j02', 'j03', 'j04'];
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

export const SIDE_PLAYERS: Record<SideJob, (h: ChapterHarness, t: QuestTrail) => Promise<void>> = {
  j01: playJ01,
  j02: playJ02,
  j03: playJ03,
  j04: playJ04,
};

/** Plays the listed jobs (default all, in order). */
export async function playSideJobs(h: ChapterHarness, trails: SideTrails, jobs: readonly SideJob[] = SIDE_ORDER): Promise<void> {
  for (const j of jobs) await SIDE_PLAYERS[j](h, trails[j]);
}

