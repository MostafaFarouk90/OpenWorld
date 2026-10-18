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

// ---------------------------------------------------------------------------------------------------------------
// Start state

/**
 * "Tutorial complete, M01 and M02 completed", reached through real services: the tutorial director's Kettlewick
 * start (every beat before T15 completed with its rewards), T15 skipped with the director's own skip, then
 * `quests.complete` for M01 and M02.
 */
export async function reachPhaseAStart(h: ChapterHarness): Promise<void> {
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
  ensure(q.complete('m01'), 'M01 completes');
  ensure(q.complete('m02'), 'M02 completes');
  await h.runAsync(30);
}

// ---------------------------------------------------------------------------------------------------------------
// M03 Cold Embers

export async function playM03(h: ChapterHarness, t: QuestTrail): Promise<void> {
  const q = quests(h);
  const dialogue = h.ctx.services.require('dialogue');
  // Aelfreda's offer (M02 completed): accept. Ending the offer talk credits o1 (talk to Aelfreda).
  await talkTo(h, t, 'aelfreda', [1]);
  ensure(q.state('m03') === 'active' && objectiveDone(h, 'm03', 'o1'), `M03 offered and o1 credited: ${describeQuest(h, 'm03')}`);
  // o2: the shard study, pressed with F where it stands.
  await h.approach(h.anchor('chapel.shard-study'), 1.2);
  h.press('KeyF');
  h.run(2);
  ensure(objectiveDone(h, 'm03', 'o2'), 'o2 the shard study');
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
  // o5: Burn and Scars, then the `release` node unlocks Release.
  ensure(!h.ctx.state.getBool('enemies.mercy.release'), 'Release still locked before the lesson');
  await talkTo(h, t, 'aelfreda');
  ensure(dialogue.hasSeen('release'), 'the release node ran');
  ensure(h.ctx.state.getBool('enemies.mercy.release') && objectiveDone(h, 'm03', 'o5'), 'o5 and Release unlocked');
  // o6: the churchyard wraiths rise once Release is unlocked; one is killed as the player.
  await h.approach(h.anchor('pile.churchyard.1'), 6);
  let wraith: string | undefined;
  for (let i = 0; i < 10 && !wraith; i++) {
    await h.runAsync(30);
    wraith = actorsOfKind(h, 'ash-wraith').find((a) => (a as { spawnTag?: string }).spawnTag === 'm03.churchyard')?.id;
  }
  ensure(wraith, 'the churchyard wraiths spawned on the Release flag');
  ensure(killAsPlayer(h, wraith), 'churchyard wraith killed');
  h.run(2);
  ensure(objectiveDone(h, 'm03', 'o6'), 'o6 credited by the kill');
  heal(h);
  // o7: report.
  await talkTo(h, t, 'aelfreda');
  ensure(q.state('m03') === 'completed', `M03 completed: ${describeQuest(h, 'm03')}`);
}

// ---------------------------------------------------------------------------------------------------------------
// M04 The Toll at Hollin Ford

export async function playM04(h: ChapterHarness, t: QuestTrail): Promise<void> {
  const q = quests(h);
  const dialogue = h.ctx.services.require('dialogue');
  await talkTo(h, t, 'gaut', [1]);
  ensure(q.state('m04') === 'active', 'Gaut offers M04 once M03 is completed');
  await h.runAsync(5);
  // The post rule moves Gaut to the ford while M04 is active.
  const ford = h.anchor('npc-post.gaut.ford');
  ensure(npcPosition(h, 'gaut').distanceTo(ford) < 2, 'Gaut waits at the ford');
  await h.enterTrigger('trg.ford.toll-post');
  ensure(objectiveDone(h, 'm04', 'o1'), 'o1 the ford trigger');
  ensure(!h.ctx.state.getBool('enemies.mercy.spare'), 'Spare still locked before the lesson');
  await talkTo(h, t, 'gaut');
  ensure(dialogue.hasSeen('m04-spare'), 'the m04-spare node ran');
  ensure(h.ctx.state.getBool('enemies.mercy.spare') && objectiveDone(h, 'm04', 'o2'), 'o2 and Spare unlocked');
  // o3: the Footman pairs activate on M04 + the Spare flag; two are killed as the player.
  let soldiers: string[] = [];
  for (let i = 0; i < 10 && soldiers.length < 2; i++) {
    await h.runAsync(30);
    soldiers = actorsOfKind(h, 'blighted-soldier').map((a) => a.id);
  }
  ensure(soldiers.length >= 2, 'the ford soldiers spawned');
  for (const id of soldiers.slice(0, 2)) ensure(killAsPlayer(h, id), `soldier ${id} killed`);
  h.run(2);
  ensure(objectiveDone(h, 'm04', 'o3'), 'o3 two soldiers');
  // o4: the toll post: only a heavy blow breaks it, so real chops (key 3) from the road side.
  const post = actorsOfKind(h, 'toll-post')[0];
  ensure(post?.root, 'the toll post stands');
  const postAt = v3(post.root);
  const gaut = h.anchor('npc-post.gaut.ford');
  await standForChop(h, postAt, { x: gaut.x - postAt.x, z: gaut.z - postAt.z });
  ensure(chopUntil(h, () => objectiveDone(h, 'm04', 'o4'), 30), `the toll post broken by chops (health ${post.health})`);
  ensure(objectiveDone(h, 'm04', 'o4') && h.ctx.state.getBool('world.brightwater.tollPost'), 'o4 and the toll-post flag');
  heal(h);
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
  // o2: rekindle the Quenchstone waystone by holding F; the shrine lights with it.
  heal(h);
  await h.approach(h.anchor('waystone.quenchstone'), 1.5);
  h.hold('KeyF', WAYSTONE_TUNING.rekindleHoldSeconds + 0.2);
  await h.runAsync(10);
  ensure(h.ctx.state.getBool('shrine.quenchstone.lit') && objectiveDone(h, 'm05', 'o2'), 'o2 the Quenchstone rekindled');
  // o3: Tobb has followed; talk to him where he stands.
  await talkTo(h, t, 'tobb');
  ensure(q.state('m05') === 'completed' && h.ctx.state.getBool('story.m05.complete'), 'M05 completed, story.m05.complete set');
}

// ---------------------------------------------------------------------------------------------------------------
// R01 Wynn's Scarecrows

export type FieldBranch = 'saved' | 'scorched';

/** Rests at the nearest lit waystone (hold F): Burn clears. */
async function restNearest(h: ChapterHarness): Promise<void> {
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
  h.hold('KeyF', WAYSTONE_TUNING.restHoldSeconds + 0.2);
  await h.runAsync(30);
}

export async function playR01(h: ChapterHarness, t: QuestTrail, field: FieldBranch): Promise<void> {
  const q = quests(h);
  await talkTo(h, t, 'wynn', [1]);
  ensure(q.state('r01') === 'active' && objectiveDone(h, 'r01', 'o1'), 'R01 offered, o1 credited');
  await h.runAsync(30);
  const crows = actorsOfKind(h, 'ash-scarecrow');
  ensure(crows.length === 6, `six ash scarecrows while R01 is active (${crows.length})`);
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
    // A purifying Surge (G) next to each scarecrow; rest when the Burn runs high.
    const spells = h.ctx.services.require('spells');
    for (const c of crows) {
      for (let i = 0; i < 12 && !cleared(c.id) && c.root; i++) {
        if (spells.burn >= 50) await restNearest(h);
        heal(h);
        await h.approach(v3(c.root), 1.5);
        h.press('KeyG');
        runHealed(h, 1);
      }
      ensure(cleared(c.id), `scarecrow ${c.id} cleared by the Surge`);
    }
    // Cool off before handing in, as a player would after six Surges.
    if (spells.burn > 0) await restNearest(h);
    ensure(!h.ctx.state.getBool('story.r01.torchUsed'), 'no torch used');
  }
  ensure(objectiveDone(h, 'r01', 'o2'), 'o2 six scarecrows');
  await talkTo(h, t, 'wynn');
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
  await talkTo(h, t, 'aelfreda', [1]);
  ensure(q.state('d01') === 'active', 'Aelfreda offers D01 once M03 and M05 are completed');
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
  // Out through the vault exit (F); Aelfreda waits at the door.
  await h.approach(h.anchor('vault.exit'), 1.2);
  h.press('KeyF');
  for (let i = 0; i < 20 && (interiors.transitioning || interiors.current !== null); i++) await h.runAsync(30);
  ensure(interiors.current === null, 'out of the vault');
  await talkTo(h, t, 'aelfreda');
  ensure(h.ctx.services.require('dialogue').hasSeen(prior === 'released' ? 'd01-released' : 'd01-defeated'), 'her outcome node');
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
