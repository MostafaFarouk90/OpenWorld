import * as THREE from 'three';
import { PRIOR, PRIOR_BOSS_ID, PRESENTATION } from '../bosses/prior/tuning';
import { SHRINE_TUNING } from '../shrine/tuning';
import { WAYSTONE_TUNING } from '../waystones/tuning';
import { CLOCK_START_MS, type ChapterHarness } from './chapterHarness';

/**
 * Slice 2 Phase A ("The Dead Road") played on a `bootChapter({ models: true, virtualClock: true })` game, one
 * function per quest, in the order M03 -> M04 -> M05 -> R01 -> R02 -> D01. Every step goes through the real
 * services and input; `ensure` throws at the first hand-off that does not happen, so the generator and other tests
 * can reuse the script without vitest. What is real and what is produced by a service call is listed in
 * src/integration/chapter.e2e.test.ts.
 */

export type PhaseAQuest = 'm03' | 'm04' | 'm05' | 'r01' | 'r02' | 'd01';
/** The Brightwater opening after the tutorial, played by `reachPhaseAStart(h, { play })`. */
export type OpeningQuest = 'm01' | 'm02';
export const PHASE_A_ORDER: readonly PhaseAQuest[] = ['m03', 'm04', 'm05', 'r01', 'r02', 'd01'];

/** What one quest's play visited: dialogue nodes read per talk, for the timing estimate. */
export interface QuestTrail {
  talks: { npc: string; dialogueId: string; nodes: number }[];
}
export type Trails = Record<PhaseAQuest, QuestTrail>;
export const emptyTrails = (): Trails =>
  Object.fromEntries(PHASE_A_ORDER.map((q) => [q, { talks: [] }])) as unknown as Trails;

export class HandOffError extends Error {}
export function ensure(cond: unknown, what: string): asserts cond {
  if (!cond) throw new HandOffError(`Phase A hand-off failed: ${what}`);
}

const v3 = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3());

export function heal(h: ChapterHarness): void {
  const p = h.ctx.player.actor;
  if (!p.dead) p.health = p.maxHealth;
}

/** Ticks with the player kept alive (enemies keep swinging at a player who stands still). */
export function runHealed(h: ChapterHarness, seconds: number): void {
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    h.run(1);
    heal(h);
  }
}

const quests = (h: ChapterHarness) => h.ctx.services.require('quests');
export const objectiveDone = (h: ChapterHarness, q: string, o: string) => quests(h).objectiveDone(q, o);
export const describeQuest = (h: ChapterHarness, q: string) =>
  `${q}=${quests(h).state(q)} [${quests(h).objectives(q).map((o) => `${o.def.id}:${o.progress}${o.current ? '*' : ''}`).join(' ')}]`;

/** Where an NPC stands now: Tobb is the companion actor once he has joined, everyone else their `npc:<id>` actor. */
export function npcPosition(h: ChapterHarness, npc: string): THREE.Vector3 {
  if (npc === 'tobb') {
    const id = h.ctx.services.require('companions').actorId('tobb');
    const a = id ? h.ctx.actors.get(id) : undefined;
    if (a?.root) return v3(a.root);
  }
  const a = [...h.ctx.actors.all()].find((x) => x.kind === `npc:${npc}`);
  ensure(a?.root, `NPC ${npc} has an actor`);
  return v3(a.root);
}

/** Walks up to the NPC (teleport next to where it stands) and plays the dialogue through to its end. */
export async function talkTo(h: ChapterHarness, trail: QuestTrail, npc: string, choices: number[] = []): Promise<number> {
  await h.approach(npcPosition(h, npc), 1.6);
  const dialogueId = `npc-${npc}`;
  const nodes = h.talk(dialogueId, npc, choices);
  trail.talks.push({ npc, dialogueId, nodes });
  await h.runAsync(2);
  return nodes;
}

/** Kills an actor through the damage service, as the player (its `actor.died` carries the real killer and spawn tag). */
export function killAsPlayer(h: ChapterHarness, actorId: string): boolean {
  const r = h.ctx.damage.apply({
    attackerId: h.ctx.player.actor.id, targetId: actorId, amount: 1e5, poise: 1e5, kind: 'melee',
    direction: new THREE.Vector3(0, 0, -1),
  });
  return r?.killed === true;
}

/**
 * Stands 1.2 m from `target` on the `from` side, facing straight at it but shifted 0.45 m to the left, so the
 * Knight's right-handed overhead chop (key 3) comes down on a target as thin as a post: facing its centre, the chop
 * lands about half a metre to the right of it.
 */
export async function standForChop(h: ChapterHarness, target: THREE.Vector3, from: { x: number; z: number }): Promise<void> {
  const l = Math.hypot(from.x, from.z) || 1;
  const dx = from.x / l;
  const dz = from.z / l;
  // Facing is -from; yaw 0 faces -Z, the facing vector is (-sin yaw, -cos yaw); the right hand is (-f.z, f.x).
  const yaw = Math.atan2(dx, dz);
  const right = { x: dz, z: -dx };
  const x = target.x + dx * 1.2 - right.x * 0.45;
  const z = target.z + dz * 1.2 - right.z * 0.45;
  await h.teleport({ x, z }, 3, yaw);
}

/** Real heavy attacks (key 3) until `done()`, waiting out each swing and the stamina for the next. */
export function chopUntil(h: ChapterHarness, done: () => boolean, tries = 12): boolean {
  for (let i = 0; i < tries && !done(); i++) {
    heal(h);
    h.press('Digit3');
    h.run(70);
  }
  return done();
}

const actorsOfKind = (h: ChapterHarness, kind: string) => [...h.ctx.actors.all()].filter((a) => a.kind === kind && !a.dead);
const tagOf = (a: unknown) => (a as { spawnTag?: string }).spawnTag;

/** Waits for `count` live actors of `kind` from the spawner tagged `tag`, standing near `near` so they load. */
async function spawnedTagged(h: ChapterHarness, kind: string, tag: string, count: number, near?: THREE.Vector3): Promise<string[]> {
  if (near) await h.approach(near, 6);
  let ids: string[] = [];
  for (let i = 0; i < 20 && ids.length < count; i++) {
    await h.runAsync(30);
    heal(h);
    ids = actorsOfKind(h, kind).filter((a) => tagOf(a) === tag).map((a) => a.id);
  }
  ensure(ids.length >= count, `${count} ${kind} from ${tag} spawned (${ids.length})`);
  return ids;
}

/** Kills every live actor of `kind` from spawner `tag` as the player, waiting for `count` of them to rise first. */
async function killTagged(h: ChapterHarness, kind: string, tag: string, count: number, near?: THREE.Vector3): Promise<void> {
  const ids = await spawnedTagged(h, kind, tag, count, near);
  for (const id of ids) ensure(killAsPlayer(h, id), `${kind} ${id} killed`);
  h.run(2);
  heal(h);
}

/** Stands at an anchor and presses F on what is there (a prop, a pickup). */
async function useAt(h: ChapterHarness, anchorId: string, dist = 1.2): Promise<void> {
  heal(h);
  await h.approach(h.anchor(anchorId), dist);
  h.press('KeyF');
  h.run(2);
}

/** Reads a note: F at its anchor opens a short dialogue, read through with F. */
export async function readNote(h: ChapterHarness, trail: QuestTrail, noteId: string, anchorId: string): Promise<void> {
  const dialogue = h.ctx.services.require('dialogue');
  await useAt(h, anchorId);
  ensure(dialogue.active, `the note ${noteId} opened at ${anchorId}`);
  let nodes = 0;
  for (; nodes < 20 && dialogue.active; nodes++) {
    h.press('KeyF');
    h.run(1);
  }
  ensure(!dialogue.active, `the note ${noteId} closed`);
  trail.talks.push({ npc: noteId, dialogueId: noteId, nodes });
  await h.runAsync(2);
}

/** Carries what lies at `anchorId` (F) into `triggerId`. */
async function carryTo(h: ChapterHarness, anchorId: string, triggerId: string, deliveredFlag: string): Promise<void> {
  await useAt(h, anchorId);
  await h.enterTrigger(triggerId);
  h.run(2);
  ensure(h.ctx.state.getBool(deliveredFlag), `${anchorId} carried into ${triggerId}`);
}

// ---------------------------------------------------------------------------------------------------------------
// Start state

/**
 * "Tutorial complete, M01 and M02 completed", reached through real services: the tutorial director's Kettlewick
 * start (every beat before T15 completed with its rewards), T15 skipped with the director's own skip, then
 * `quests.complete` for M01 and M02.
 */
export async function reachPhaseAStart(h: ChapterHarness, opts: { play?: Record<OpeningQuest, QuestTrail> } = {}): Promise<void> {
  await h.flush();
  const director = h.director();
  director.begin('kettlewick');
  for (let n = 0; n < 40 && !director.complete; n++) {
    h.run(5);
    director.skipCurrent();
    await h.runAsync(30);
  }
  ensure(director.complete, 'tutorial completes');
  const q = quests(h);
  ensure(q.state('m01') === 'active', 'the tutorial hands M01 over');
  if (opts.play) {
    await playM01(h, opts.play.m01);
    await playM02(h, opts.play.m02);
  } else {
    ensure(q.complete('m01'), 'M01 completes');
    ensure(q.complete('m02'), 'M02 completes');
  }
  await h.runAsync(30);
}

// ---------------------------------------------------------------------------------------------------------------
// M01 Ash on the Wind (density pass: the Grey Goose door, Tobb, the mill and its miller, Aelfreda at the gate)

export async function playM01(h: ChapterHarness, t: QuestTrail): Promise<void> {
  const q = quests(h);
  // Gaut's briefing, asking where the missing are and about the crack before setting off (choices loop back)
  if (!h.ctx.state.getBool('quest.m01.briefed')) await talkTo(h, t, 'gaut', [2, 3, 1]);
  ensure(h.ctx.state.getBool('quest.m01.briefed'), 'Gaut briefed M01');
  // o1: the lane wraiths.
  await killTagged(h, 'ash-wraith', 'm01', 5);
  ensure(objectiveDone(h, 'm01', 'o1'), `o1 five wraiths: ${describeQuest(h, 'm01')}`);
  // o2: three villagers to the chapel door.
  for (let n = 1; n <= 3; n++) await carryTo(h, `m01.villager-${n}`, 'm01.chapel-door', `quest.m01.villager${n}.delivered`);
  ensure(objectiveDone(h, 'm01', 'o2'), 'o2 three villagers');
  // tavern: two well buckets to the Grey Goose door; its fire goes out.
  for (let n = 1; n <= 2; n++) await carryTo(h, `m01.bucket-${n}`, 'm01.tavern-door', `story.m01.bucket${n}.delivered`);
  ensure(objectiveDone(h, 'm01', 'tavern') && h.ctx.state.getBool('story.m01.tavernDoused'), 'the Grey Goose door doused');
  await talkTo(h, t, 'tobb');
  ensure(objectiveDone(h, 'm01', 'tobb'), 'Tobb met at the Grey Goose');
  // the mill's wraiths, then the miller (who walks to the chapel)
  await killTagged(h, 'ash-wraith', 'm01.mill', 4, h.anchor('npc-post.aldwin'));
  ensure(objectiveDone(h, 'm01', 'mill'), 'the mill cleared');
  await talkTo(h, t, 'aldwin');
  ensure(objectiveDone(h, 'm01', 'miller') && h.ctx.state.getBool('story.m01.millerSafe'), 'the miller found safe');
  await talkTo(h, t, 'aelfreda');
  ensure(objectiveDone(h, 'm01', 'rescued'), 'Aelfreda at the gate');
  await talkTo(h, t, 'gaut');
  ensure(q.state('m01') === 'completed', `M01 completed: ${describeQuest(h, 'm01')}`);
}

// ---------------------------------------------------------------------------------------------------------------
// M02 A Mother's Bread (density pass: the bakery door, the thatch, the oven yard, the granary, Garrick, the hearth)

export async function playM02(h: ChapterHarness, t: QuestTrail): Promise<void> {
  const q = quests(h);
  await talkTo(h, t, 'edda', [1]);
  ensure(q.state('m02') === 'active', 'Edda offers M02');
  for (let n = 1; n <= 2; n++) await carryTo(h, `m02.bucket-${n}`, 'm02.bakery-door', `story.m02.bucket${n}.delivered`);
  ensure(objectiveDone(h, 'm02', 'door'), 'the bakery door doused');
  await h.enterTrigger('m02.bakery');
  ensure(objectiveDone(h, 'm02', 'o1'), 'o1 the bakery');
  for (let n = 1; n <= 2; n++) await useAt(h, `m02.rubble-${n}`);
  ensure(objectiveDone(h, 'm02', 'rubble'), `the thatch cleared: ${describeQuest(h, 'm02')}`);
  await killTagged(h, 'ash-wraith', 'm02.oven-yard', 3, h.anchor('spawn.m02.oven-3'));
  ensure(objectiveDone(h, 'm02', 'oven'), 'the oven yard');
  await useAt(h, 'kettlewick.bakery-hearth');
  ensure(objectiveDone(h, 'm02', 'o2'), `o2 the hearth-stone: ${describeQuest(h, 'm02')}`);
  await readNote(h, t, 'note-m02-badge', 'm02.badge');
  ensure(objectiveDone(h, 'm02', 'badge'), 'the badge found in the loft');
  await h.enterTrigger('m02.granary');
  ensure(objectiveDone(h, 'm02', 'granary'), 'the granary');
  await talkTo(h, t, 'garrick', [1]);
  ensure(objectiveDone(h, 'm02', 'garrick') && h.ctx.state.getFlag('story.m02.garrick') === 'forgiven', 'Garrick forgiven');
  await talkTo(h, t, 'edda', [1, 2, 3, 4]);
  ensure(objectiveDone(h, 'm02', 'o3'), 'o3 Edda at the granary');
  await useAt(h, 'm02.common-hearth');
  ensure(q.state('m02') === 'completed', `M02 completed: ${describeQuest(h, 'm02')}`);
}

// ---------------------------------------------------------------------------------------------------------------
// M03 Cold Embers

export async function playM03(h: ChapterHarness, t: QuestTrail): Promise<void> {
  const q = quests(h);
  const dialogue = h.ctx.services.require('dialogue');
  // Aelfreda's offer (M02 completed): accept. Ending the offer talk credits o1 (talk to Aelfreda).
  // accept, then ask about the Hearthkeepers and Ulthred before beginning (a first-time player's questions)
  await talkTo(h, t, 'aelfreda', [1, 1, 2, 3]);
  ensure(q.state('m03') === 'active' && objectiveDone(h, 'm03', 'o1'), `M03 offered and o1 credited: ${describeQuest(h, 'm03')}`);
  // o2: the shard study, pressed with F where it stands.
  await h.approach(h.anchor('chapel.shard-study'), 1.2);
  h.press('KeyF');
  h.run(2);
  ensure(objectiveDone(h, 'm03', 'o2'), 'o2 the shard study');
  // the cracked font and the Kindling Ember (Cael's own reading)
  await readNote(h, t, 'note-m03-font', 'chapel.font');
  await readNote(h, t, 'note-m03-ember', 'chapel.ember-study');
  await readNote(h, t, 'note-m03-record', 'chapel.record');
  ensure(objectiveDone(h, 'm03', 'study'), `the three studies: ${describeQuest(h, 'm03')}`);
  // o3: her `leap` node grants the Surge Leap.
  await talkTo(h, t, 'aelfreda');
  ensure(dialogue.hasSeen('leap'), 'the leap node ran');
  ensure(h.ctx.state.getBool('ability.surge-leap.learned') && objectiveDone(h, 'm03', 'o3'), 'o3 the Leap learned');
  // o4: a real Surge Leap (V) from the launch spot onto the chapel ledge, into its trigger.
  const launch = h.ctx.anchors.find('poi.leap.chapel-ledge.launch');
  ensure(launch, 'leap launch anchor');
  await h.teleport({ x: launch.position.x, z: launch.position.z }, 10, launch.yaw);
  h.press('KeyV');
  for (let i = 0; i < 120 && !objectiveDone(h, 'm03', 'o4'); i++) h.run(1);
  ensure(objectiveDone(h, 'm03', 'o4'), `o4 the ledge reached by a Leap (feet ${h.ctx.player.feet.toArray()})`);
  // the warding candle on the ledge (the player stands on it after the Leap)
  for (let i = 0; i < 30 && !h.ctx.state.getBool('story.m03.candleTaken'); i++) {
    h.press('KeyF');
    h.run(10);
  }
  ensure(objectiveDone(h, 'm03', 'candle'), `the candle taken from the ledge (feet ${h.ctx.player.feet.toArray()}): ${describeQuest(h, 'm03')}`);
  await readNote(h, t, 'note-m03-wulfric', 'm03.grave-wulfric');
  ensure(objectiveDone(h, 'm03', 'grave'), 'Wulfric\'s grave read');
  // o5: Burn and Scars, then the `release` node unlocks Release.
  ensure(!h.ctx.state.getBool('enemies.mercy.release'), 'Release still locked before the lesson');
  await talkTo(h, t, 'aelfreda', [1]);
  ensure(dialogue.hasSeen('release'), 'the release node ran');
  ensure(h.ctx.state.getFlag('story.m03.scarsTold') === 'village', 'the Scars told to the village');
  ensure(h.ctx.state.getBool('enemies.mercy.release') && objectiveDone(h, 'm03', 'o5'), 'o5 and Release unlocked');
  // o6: the four churchyard wraiths rise once Release is unlocked; they are killed as the player.
  await killTagged(h, 'ash-wraith', 'm03.churchyard', 4, h.anchor('pile.churchyard.1'));
  ensure(objectiveDone(h, 'm03', 'o6'), `o6 credited by the kills: ${describeQuest(h, 'm03')}`);
  heal(h);
  // o7: report (the first Release felt warm).
  await talkTo(h, t, 'aelfreda', [1, 1]);
  ensure(h.ctx.state.getFlag('story.m03.firstRelease') === 'warm', 'the first Release told');
  ensure(h.ctx.state.getFlag('story.m03.record') === 'cold', 'the record finished honestly');
  ensure(q.state('m03') === 'completed', `M03 completed: ${describeQuest(h, 'm03')}`);
}

// ---------------------------------------------------------------------------------------------------------------
// M04 The Toll at Hollin Ford

export async function playM04(h: ChapterHarness, t: QuestTrail): Promise<void> {
  const q = quests(h);
  const dialogue = h.ctx.services.require('dialogue');
  await talkTo(h, t, 'gaut', [2, 1]);
  ensure(q.state('m04') === 'active', 'Gaut offers M04 once M03 is completed');
  await h.runAsync(5);
  // The post rule moves Gaut to the ford while M04 is active.
  const ford = h.anchor('npc-post.gaut.ford');
  ensure(npcPosition(h, 'gaut').distanceTo(ford) < 2, 'Gaut waits at the ford');
  await h.enterTrigger('trg.ford.toll-post');
  ensure(objectiveDone(h, 'm04', 'o1'), 'o1 the ford trigger');
  ensure(!h.ctx.state.getBool('enemies.mercy.spare'), 'Spare still locked before the lesson');
  await talkTo(h, t, 'gaut', [1, 2, 3]);
  ensure(dialogue.hasSeen('m04-spare'), 'the m04-spare node ran');
  ensure(h.ctx.state.getBool('enemies.mercy.spare') && objectiveDone(h, 'm04', 'o2'), 'o2 and Spare unlocked');
  // o3: the Footman pairs activate on M04 + the Spare flag; all four are killed as the player.
  for (let round = 0; round < 6 && !objectiveDone(h, 'm04', 'o3'); round++) {
    let soldiers: string[] = [];
    for (let i = 0; i < 10 && !soldiers.length; i++) {
      await h.runAsync(30);
      heal(h);
      soldiers = actorsOfKind(h, 'blighted-soldier').map((a) => a.id);
    }
    for (const id of soldiers) ensure(killAsPlayer(h, id), `soldier ${id} killed`);
    h.run(2);
  }
  ensure(objectiveDone(h, 'm04', 'o3'), `o3 four soldiers: ${describeQuest(h, 'm04')}`);
  // the Toll Sergeant steps onto the bridge
  await killTagged(h, 'toll-sergeant', 'm04.sergeant', 1, h.anchor('spawn.ford.sergeant'));
  ensure(objectiveDone(h, 'm04', 'sergeant') && h.ctx.state.getFlag('story.m04.sergeant') === 'killed', 'the sergeant beaten');
  // o4: the toll post: only a heavy blow breaks it, so real chops (key 3) from the road side.
  const post = actorsOfKind(h, 'toll-post')[0];
  ensure(post?.root, 'the toll post stands');
  const postAt = v3(post.root);
  const gaut = h.anchor('npc-post.gaut.ford');
  await standForChop(h, postAt, { x: gaut.x - postAt.x, z: gaut.z - postAt.z });
  ensure(chopUntil(h, () => objectiveDone(h, 'm04', 'o4'), 30), `the toll post broken by chops (health ${post.health})`);
  ensure(objectiveDone(h, 'm04', 'o4') && h.ctx.state.getBool('world.brightwater.tollPost'), 'o4 and the toll-post flag');
  heal(h);
  await readNote(h, t, 'note-m04-toll-box', 'm04.toll-box');
  ensure(objectiveDone(h, 'm04', 'ledger'), 'the toll ledger read');
  await talkTo(h, t, 'gaut', [2]);
  ensure(objectiveDone(h, 'm04', 'shown') && h.ctx.state.getFlag('story.m04.ledger') === 'cael', 'the ledger shown to Gaut, Cael keeps it');
  for (let n = 1; n <= 3; n++) await useAt(h, `m04.wagon-${n}`);
  ensure(objectiveDone(h, 'm04', 'wagons'), `the wagons unchained: ${describeQuest(h, 'm04')}`);
  await talkTo(h, t, 'carter-2');
  await talkTo(h, t, 'carter-3');
  ensure(objectiveDone(h, 'm04', 'carters'), 'the other two carters heard');
  await talkTo(h, t, 'carter-1');
  ensure(h.ctx.state.getBool('story.m04.cartersFreed') && objectiveDone(h, 'm04', 'o5'), 'o5 the carters freed');
  await talkTo(h, t, 'gaut');
  ensure(q.state('m04') === 'completed', `M04 completed: ${describeQuest(h, 'm04')}`);
  ensure(h.ctx.services.require('inventory').count('ford-guard-shield') >= 1, 'the shield reward');
}

// ---------------------------------------------------------------------------------------------------------------
// M05 Wardstones for the Dead Road

const BEAT_MS = 60000 / SHRINE_TUNING.wardstones.bpm;

/** Presses key 1 exactly on the next metronome beat (the shrine's headless clock started at `CLOCK_START_MS`). */
function strikeOnBeat(h: ChapterHarness): void {
  const k = Math.ceil((h.clock.ms + 20 - CLOCK_START_MS) / BEAT_MS);
  const beat = CLOCK_START_MS + k * BEAT_MS;
  while (h.clock.ms + 1000 / 60 < beat) h.run(1);
  h.clock.ms = beat;
  h.key('keydown', 'Digit1');
  h.run(1);
  h.key('keyup', 'Digit1');
  h.run(1);
}

export async function playM05(h: ChapterHarness, t: QuestTrail): Promise<void> {
  const q = quests(h);
  const companions = h.ctx.services.require('companions');
  ensure(companions.active().length === 0, 'nobody follows before M05');
  // Tobb's intro: the join choice starts M05.
  await talkTo(h, t, 'tobb', [1]);
  ensure(q.state('m05') === 'active' && h.ctx.state.getBool('story.m05.tobbJoined'), 'M05 started by the join choice');
  await h.runAsync(10);
  ensure(companions.active().includes('tobb') && companions.actorId('tobb'), 'Tobb joined as a companion');
  // the pilgrim's journal under the toppled milestone (density pass, batch 2)
  await readNote(h, t, 'note-m05-journal', 'm05.journal');
  ensure(objectiveDone(h, 'm05', 'journal'), 'the pilgrim\'s journal');
  // o1: five wardstones, west to east, three strikes each on consecutive beats.
  const shrine = h.ctx.services.require('shrine');
  for (let n = 1; n <= SHRINE_TUNING.wardstones.count; n++) {
    heal(h);
    await h.approach(h.anchor(`wardstone.${n}`), 1.6);
    await h.runAsync(3);
    for (let i = 0; i < SHRINE_TUNING.wardstones.phraseLength; i++) strikeOnBeat(h);
    ensure(h.ctx.state.getBool(`world.deadroad.wardstone.${n}`), `wardstone ${n} struck (next: ${shrine.nextWardstone()})`);
  }
  ensure(h.ctx.state.getBool('world.deadroad.wardstones.done') && objectiveDone(h, 'm05', 'o1'), 'o1 the wardstones');
  // the dead's last push at the Quenchstone
  await killTagged(h, 'ash-wraith', 'm05.shrine', 4, h.anchor('spawn.m05.shrine-1'));
  ensure(objectiveDone(h, 'm05', 'push'), 'the shrine held');
  // o2: rekindle the Quenchstone waystone by holding F; the shrine lights with it.
  heal(h);
  await h.approach(h.anchor('waystone.quenchstone'), 1.5);
  h.hold('KeyF', WAYSTONE_TUNING.rekindleHoldSeconds + 0.2);
  await h.runAsync(10);
  ensure(h.ctx.state.getBool('shrine.quenchstone.lit') && objectiveDone(h, 'm05', 'o2'), 'o2 the Quenchstone rekindled');
  // o3: Tobb has followed; talk to him where he stands (the bond scene: sing the road's dead).
  await talkTo(h, t, 'tobb', [3]);
  ensure(h.ctx.state.getFlag('story.m05.tobbBond') === true && h.ctx.state.getFlag('story.m05.ballad') === 'names', 'the bond scene');
  ensure(q.state('m05') === 'completed' && h.ctx.state.getBool('story.m05.complete'), 'M05 completed, story.m05.complete set');
}

// ---------------------------------------------------------------------------------------------------------------
// R01 Wynn's Scarecrows

export type FieldBranch = 'saved' | 'scorched';

/** Rests at the nearest lit waystone (hold F): Burn clears. */
async function restNearest(h: ChapterHarness): Promise<boolean> {
  const ways = h.ctx.services.require('waystones');
  const f = h.ctx.player.feet;
  let best: THREE.Vector3 | null = null;
  for (const id of ways.litIds()) {
    const a = h.ctx.anchors.find(`waystone.${id}`);
    if (!a) continue;
    const p = new THREE.Vector3(a.position.x, a.position.y, a.position.z);
    if (!best || p.distanceTo(f) < best.distanceTo(f)) best = p;
  }
  ensure(best, 'a lit waystone to rest at');
  await h.approach(best, 1.5);
  // A Surge still casting locks interact; wait it out.
  for (let i = 0; i < 40 && h.moveModifiers.isActionLocked('interact'); i++) runHealed(h, 0.25);
  const before = h.of('rest').length;
  h.hold('KeyF', WAYSTONE_TUNING.restHoldSeconds + 0.2);
  await h.runAsync(30);
  return h.of('rest').length > before;
}

export async function playR01(h: ChapterHarness, t: QuestTrail, field: FieldBranch): Promise<void> {
  const q = quests(h);
  await talkTo(h, t, 'wynn', [1, 1, 2, 3]);
  ensure(q.state('r01') === 'active' && objectiveDone(h, 'r01', 'o1'), 'R01 offered, o1 credited');
  await readNote(h, t, 'note-r01-shawl', 'r01.shawl');
  ensure(objectiveDone(h, 'r01', 'shawl'), 'the shawl read');
  await h.runAsync(30);
  let crows = actorsOfKind(h, 'ash-scarecrow');
  for (let i = 0; i < 10 && crows.length < 8; i++) {
    await h.approach(h.anchor('r01.scarecrow.8'), 6);
    await h.runAsync(30);
    crows = actorsOfKind(h, 'ash-scarecrow');
  }
  ensure(crows.length === 8, `eight ash scarecrows while R01 is active (${crows.length})`);
  const cleared = (id: string) => h.of('scarecrow.cleared').some((e) => e.actorId === id);
  if (field === 'scorched') {
    // Light the torch at a brazier (F), then carry it into each scarecrow: it burns for 4 s and clears.
    await h.approach(h.anchor('r01.brazier.1'), 1.2);
    h.press('KeyF');
    ensure(q.torch(), 'the torch is lit and carried');
    for (const c of crows) {
      for (let i = 0; i < 3 && !cleared(c.id) && c.root; i++) {
        heal(h);
        await h.approach(v3(c.root), 0.5);
        await h.runAsync(270);
      }
      ensure(cleared(c.id), `scarecrow ${c.id} burned by the torch`);
    }
    ensure(h.ctx.state.getBool('story.r01.torchUsed'), 'story.r01.torchUsed set by the torch bridge');
  } else {
    // A purifying Surge (G) next to each scarecrow. No rest in between: an aggroed scarecrow never calms, so the
    // waystones refuse a rest until the field is clear, and Burn climbs to 100 (with Scars) over six Surges.
    const spells = h.ctx.services.require('spells');
    for (const c of crows) {
      for (let i = 0; i < 40 && !cleared(c.id) && c.root; i++) {
        heal(h);
        await h.approach(v3(c.root), 1.5);
        h.press('KeyG');
        runHealed(h, 1);
      }
      ensure(cleared(c.id), `scarecrow ${c.id} cleared by the Surge`);
    }
    // Field clear: rest at the nearest lit waystone (hold F) to clear the Burn, as a player would.
    const ways = h.ctx.services.require('waystones');
    for (let i = 0; i < 20 && ways.hostileAggro; i++) runHealed(h, 0.5);
    ensure(await restNearest(h), `rested after the field (aggro ${ways.hostileAggro})`);
    ensure(spells.burn === 0, `Burn cleared by the rest (${spells.burn})`);
    ensure(!h.ctx.state.getBool('story.r01.torchUsed'), 'no torch used');
  }
  ensure(objectiveDone(h, 'r01', 'o2'), 'o2 eight scarecrows');
  ensure(h.ctx.state.getBool('story.r01.scorched') === (field === 'scorched'), `the field decided ${field}`);
  // the root wakes under the barley
  await killTagged(h, 'ash-wraith', 'r01.root', 3, h.anchor('spawn.r01.root-1'));
  ensure(objectiveDone(h, 'r01', 'root'), 'the root driven off');
  if (field === 'scorched') {
    for (let n = 1; n <= 2; n++) await carryTo(h, `r01.bucket-${n}`, 'r01.stubble', `story.r01.bucket${n}.delivered`);
  } else {
    for (let n = 1; n <= 3; n++) await useAt(h, `r01.stake-${n}`);
  }
  h.run(5);
  ensure(objectiveDone(h, 'r01', 'aftermath'), `the ${field} field set right: ${describeQuest(h, 'r01')}`);
  await talkTo(h, t, 'wynn', [1]);
  ensure(h.ctx.state.getFlag('story.r01.clothes') === 'chapel', 'the mourning clothes go back to the chapel');
  ensure(q.state('r01') === 'completed', `R01 completed: ${describeQuest(h, 'r01')}`);
  ensure(h.ctx.state.getFlag('world.brightwater.barley') === field, `the field is ${field}`);
}

// ---------------------------------------------------------------------------------------------------------------
// R02 The Marshal's Last Drill

export async function playR02(h: ChapterHarness, t: QuestTrail): Promise<void> {
  const q = quests(h);
  await talkTo(h, t, 'stane', [1]);
  ensure(q.state('r02') === 'active' && objectiveDone(h, 'r02', 'o1'), 'R02 offered, o1 credited');
  await h.runAsync(3);
  const dummies = actorsOfKind(h, 'blocking-dummy');
  ensure(dummies.length === 3, 'the yard dummies stand while R02 is active');
  const front = async (d: (typeof dummies)[number], dist = 1.3) => {
    const yaw = d.root!.rotation.y; // dummies face +Z at yaw 0
    await h.approach(v3(d.root!), dist, { x: Math.sin(yaw), z: Math.cos(yaw) });
  };
  // o2: real sword swings (key 1) until three land on an open guard.
  await front(dummies[0]);
  for (let i = 0; i < 30 && !objectiveDone(h, 'r02', 'o2'); i++) {
    heal(h);
    h.press('Digit1');
    h.run(40);
  }
  ensure(objectiveDone(h, 'r02', 'o2'), 'o2 three open hits with the sword');
  // o3: real parries: block (right mouse) pressed just before each telegraphed swing lands.
  await front(dummies[1]);
  let telegraphs = 0;
  const off = h.ctx.events.on('telegraph', (e) => {
    if (e.actorId === dummies[1].id) telegraphs++;
  });
  for (let i = 0; i < 2400 && !objectiveDone(h, 'r02', 'o3'); i++) {
    const before = telegraphs;
    h.run(1);
    if (telegraphs === before) continue;
    h.run(22);
    h.mouse('mousedown', 2);
    h.run(20);
    h.mouse('mouseup', 2);
    heal(h);
  }
  off();
  ensure(objectiveDone(h, 'r02', 'o3'), 'o3 three parries');
  // o4: two guard breaks: real heavy chops (key 3) on a raised guard.
  for (const d of [dummies[2], dummies[0], dummies[1]]) {
    if (objectiveDone(h, 'r02', 'o4')) break;
    const yaw = d.root!.rotation.y;
    await standForChop(h, v3(d.root!), { x: Math.sin(yaw), z: Math.cos(yaw) });
    chopUntil(h, () => objectiveDone(h, 'r02', 'o4') || h.of('dummy.guardBroken').some((e) => e.dummyId === d.id));
  }
  ensure(objectiveDone(h, 'r02', 'o4'), `o4 two guard breaks (${h.of('dummy.guardBroken').length})`);
  await talkTo(h, t, 'stane');
  ensure(q.state('r02') === 'completed', `R02 completed: ${describeQuest(h, 'r02')}`);
  h.run(2);
  ensure(actorsOfKind(h, 'blocking-dummy').length === 0, 'the yard dummies are gone after R02');
}

// ---------------------------------------------------------------------------------------------------------------
// D01 Prayers in the Vault

export type PriorBranch = 'released' | 'defeated';

/** Offer, the vault door (F), o1 on entering. Leaves the player inside the vault at its entry. */
export async function enterVaultForD01(h: ChapterHarness, t: QuestTrail): Promise<void> {
  const q = quests(h);
  // the vault door refuses before D01 is taken (density pass, batch 2)
  ensure(!h.ctx.state.getBool('story.d01.vaultOpen'), 'the vault is locked before D01');
  await h.approach(h.anchor('vault.door'), 1.2);
  h.press('KeyF');
  await h.runAsync(30);
  ensure(h.ctx.services.require('interiors').current === null, 'the locked vault door did not open');
  await talkTo(h, t, 'aelfreda', [1]);
  ensure(q.state('d01') === 'active', 'Aelfreda offers D01 once M03 and M05 are completed');
  ensure(h.ctx.state.getBool('story.d01.vaultOpen'), 'taking D01 opens the vault');
  await h.runAsync(5);
  ensure(npcPosition(h, 'aelfreda').distanceTo(h.anchor('npc-post.aelfreda.vault')) < 2, 'Aelfreda waits at the vault door');
  const interiors = h.ctx.services.require('interiors');
  await h.approach(h.anchor('vault.door'), 1.2);
  h.press('KeyF');
  for (let i = 0; i < 20 && (interiors.transitioning || interiors.current === null); i++) await h.runAsync(30);
  ensure(interiors.current === 'chapel-vault', `inside the vault (current ${interiors.current})`);
  ensure(objectiveDone(h, 'd01', 'o1'), 'o1 interior.entered');
  await h.runAsync(30);
}

export async function finishD01(h: ChapterHarness, t: QuestTrail, prior: PriorBranch): Promise<void> {
  const q = quests(h);
  const interiors = h.ctx.services.require('interiors');
  heal(h);
  // Prior Aldhelm's three prayer tablets, the three braziers, and what the walls give up (density pass, batch 2)
  for (const n of [1, 2, 3, 4]) await readNote(h, t, `note-d01-tablet-${n}`, `d01.tablet-${n}`);
  ensure(objectiveDone(h, 'd01', 'tablets'), 'the four tablets');
  ensure(!h.ctx.state.getBool('story.d01.antechamberClear'), 'the arena gate is shut');
  for (const n of [1, 2, 3]) await useAt(h, `d01.brazier-${n}`);
  ensure(objectiveDone(h, 'd01', 'braziers'), 'the three braziers');
  await killTagged(h, 'ash-wraith', 'd01.antechamber', 4, h.anchor('d01.spawn.wall-1'));
  ensure(objectiveDone(h, 'd01', 'wake') && h.ctx.state.getBool('story.d01.antechamberClear'), 'the antechamber clear, the gate open');
  heal(h);
  await h.enterTrigger('trg.vault.arena');
  ensure(objectiveDone(h, 'd01', 'o2'), 'o2 the arena trigger');
  const boss = () => [...h.ctx.actors.all()].find((a) => a.kind === 'ashen-prior') ?? null;
  const state = () => h.ctx.bosses.state(PRIOR_BOSS_ID);
  runHealed(h, PRESENTATION.introSeconds + 1);
  ensure(boss() && state(), 'the Prior registered after his intro');
  runHealed(h, PRIOR.summonCastSeconds + 2);
  const hit = (amount: number, poise: number) =>
    h.ctx.damage.apply({ attackerId: h.ctx.player.actor.id, targetId: boss()!.id, amount, poise, kind: 'melee' });
  /** A real Surge (G) next to him until his shield drops. */
  const surgeShield = async () => {
    for (let i = 0; i < 20 && state()!.shield; i++) {
      await h.approach(v3(boss()!.root!), 2);
      h.press('KeyG');
      runHealed(h, 1);
    }
    ensure(!state()!.shield, 'a Surge dropped the shield');
  };
  await surgeShield();
  // Phase 2: one big hit that also breaks; the shielded opening; Surge again.
  const s = state()!;
  hit(s.health - s.maxHealth * 0.5 + 1, PRIOR.maxPoise);
  ensure(state()!.phase === 2, 'phase 2');
  runHealed(h, PRIOR.breakSeconds + 1.2 + PRIOR.summonCastSeconds + 0.3);
  await surgeShield();
  // Phase-2 breaks until the release window opens.
  for (let i = 0; i < 4 && !state()!.releaseOpen; i++) {
    hit(1, PRIOR.maxPoise);
    if (!state()!.releaseOpen) runHealed(h, 2.5);
  }
  ensure(state()!.releaseOpen, 'the release window opened');
  if (prior === 'released') {
    // The real mercy hold: T next to him, facing him.
    await h.approach(v3(boss()!.root!), 1.5);
    h.hold('KeyT', 0.6);
  } else {
    hit(1e6, 0);
  }
  h.run(2);
  ensure(h.ctx.state.getFlag('boss.ashen-prior.outcome') === prior, `boss.ashen-prior.outcome is ${prior}`);
  ensure(objectiveDone(h, 'd01', 'o3'), 'o3 the outcome');
  runHealed(h, PRESENTATION.deathClipSeconds + PRESENTATION.deathDissolveSeconds + 1);
  // his censer where he fell (density pass, batch 2)
  await readNote(h, t, 'note-d01-censer', 'd01.censer');
  ensure(objectiveDone(h, 'd01', 'censer'), 'the censer found');
  // Out through the vault exit (F); Aelfreda waits at the door.
  await h.approach(h.anchor('vault.exit'), 1.2);
  h.press('KeyF');
  for (let i = 0; i < 20 && (interiors.transitioning || interiors.current !== null); i++) await h.runAsync(30);
  ensure(interiors.current === null, 'out of the vault');
  await talkTo(h, t, 'aelfreda');
  ensure(h.ctx.services.require('dialogue').hasSeen(prior === 'released' ? 'd01-released' : 'd01-defeated'), 'her outcome node');
  // the censer on the altar, then the vigil with Aelfreda: his name goes in the record
  await useAt(h, 'd01.altar');
  ensure(objectiveDone(h, 'd01', 'altar'), 'the censer on the altar');
  await talkTo(h, t, 'aelfreda', [1]);
  ensure(h.ctx.state.getFlag('story.d01.prior') === 'name', 'his name goes in the record');
  ensure(q.state('d01') === 'completed', `D01 completed: ${describeQuest(h, 'd01')}`);
}

export interface PhaseAOptions {
  field: FieldBranch;
  prior: PriorBranch;
  /** Called inside the vault right after entering (D01 active), e.g. to save the mid-D01 fixture. */
  inVault?: () => Promise<void>;
  /** Called after each quest completes. */
  after?: (quest: PhaseAQuest) => void | Promise<void>;
}

/** The whole chapter from the Phase A start state. */
export async function playPhaseA(h: ChapterHarness, opts: PhaseAOptions): Promise<Trails> {
  const trails = emptyTrails();
  await playM03(h, trails.m03);
  await opts.after?.('m03');
  await playM04(h, trails.m04);
  await opts.after?.('m04');
  await playM05(h, trails.m05);
  await opts.after?.('m05');
  await playR01(h, trails.r01, opts.field);
  await opts.after?.('r01');
  await playR02(h, trails.r02);
  await opts.after?.('r02');
  await enterVaultForD01(h, trails.d01);
  await opts.inVault?.();
  await finishD01(h, trails.d01, opts.prior);
  await opts.after?.('d01');
  return trails;
}
