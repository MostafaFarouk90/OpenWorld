import * as THREE from 'three';
import { stealthRoute, chaseRoute, makeUndetectable, catchCourierForTest } from '../stealth/testing/headless';
import type { ChapterHarness } from './chapterHarness';
import { describeQuest, ensure, heal, killAsPlayer, npcPosition, objectiveDone, runHealed, talkTo, type QuestTrail } from './phaseA';

/**
 * Slice 2 Phase B (Harrowmark) and the Act 1 ending, played on a `bootFromSave(<Phase A fixture>, { models: true,
 * virtualClock: true })` game, one function per quest in the order M06 -> M07 -> R03 -> R04 -> M08 -> M09 -> M10 ->
 * D02 -> the ending. Same rules as src/integration/phaseA.ts: real services and input, `ensure` throws at the first
 * hand-off that does not happen. What is real and what is a shortcut is listed in src/integration/chapter.e2e.test.ts.
 */

export type PhaseBQuest = 'm06' | 'm07' | 'r03' | 'r04' | 'm08' | 'm09' | 'm10' | 'd02';
export const PHASE_B_ORDER: readonly PhaseBQuest[] = ['m06', 'm07', 'r03', 'r04', 'm08', 'm09', 'm10', 'd02'];
export type PhaseBTrails = Record<PhaseBQuest, QuestTrail>;
export const emptyPhaseBTrails = (): PhaseBTrails =>
  Object.fromEntries(PHASE_B_ORDER.map((q) => [q, { talks: [] }])) as unknown as PhaseBTrails;

export type GateRoute = 'stealth' | 'bribe' | 'persuasion';
export type Stance = 'meek' | 'steady' | 'bold';
export type GrimBranch = 'released' | 'defeated';

export interface PhaseBOptions {
  route: GateRoute;
  /** M07's class (chosen at its trainer). */
  classId: 'knight' | 'warden' | 'emberwright' | 'ashblade' | 'pathfinder';
  debt: 'forgiven' | 'collected';
  steward: 'expose' | 'shield';
  stance: Stance;
  grimtooth: GrimBranch;
  /** Called after each quest completes (fixtures). */
  after?: (quest: PhaseBQuest) => void | Promise<void>;
  /** Inside the Counting-House after the section cleared (o4), before leaving: the mid-M09 fixture. */
  inCountingHouse?: () => Promise<void>;
  /** Inside the Underways, D02 active (o2 done), before the kennels: the D02 fixture. */
  inUnderways?: () => Promise<void>;
}

/** Gold the harness grants for M06's bribe (real play earns it from purses and chests; thread 19 tunes the sources). */
export const HARNESS_BRIBE_GOLD = 50;
/** For the tipped argument: 25 gold and Halvard at Banked. */
export const HARNESS_TIP_GOLD = 25;

const quests = (h: ChapterHarness) => h.ctx.services.require('quests');
const interiors = (h: ChapterHarness) => h.ctx.services.require('interiors');
const v3 = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3());
const living = (h: ChapterHarness, pred: (a: { kind: string; spawnTag?: string }) => boolean) =>
  [...h.ctx.actors.all()].filter((a) => !a.dead && pred(a as { kind: string; spawnTag?: string }));
const gold = (h: ChapterHarness) => h.ctx.services.require('inventory').gold;

/** The harness's dev grant (stated wherever it is used). */
export function grantGold(h: ChapterHarness, amount: number): void {
  h.ctx.services.require('inventory').addGold(amount);
}

const focusOf = (h: ChapterHarness): string | undefined =>
  (h.ctx.interaction as unknown as { focusFor(a: string): { id: string } | null }).focusFor('interact')?.id;

/** Presses F at an anchor, from whichever side puts `interactableId` in focus (a wall or a neighbour can take it). */
async function useAt(h: ChapterHarness, anchorId: string, interactableId: string, dist = 1.1): Promise<void> {
  // Tobb (a talk interactable) follows close behind and can win the focus: try the eight sides, nearer second.
  const sides = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
  search: for (const d of [dist, dist * 0.6]) {
    for (const [x, z] of sides) {
      await h.approach(h.anchor(anchorId), d, { x, z });
      h.run(2);
      if (focusOf(h) === interactableId) break search;
    }
  }
  ensure(focusOf(h) === interactableId, `${interactableId} in focus at ${anchorId} (focus ${focusOf(h) ?? 'none'})`);
  h.press('KeyF');
  h.run(2);
}

/** Through an interior door (F at its anchor), waiting for the transition. */
async function enterInterior(h: ChapterHarness, door: string, id: string): Promise<void> {
  const i = interiors(h);
  const a = h.ctx.anchors.find(`harrowmark.${door}.door`);
  ensure(a, `door anchor ${door}`);
  // In front of the door, on its facing side (yaw 0 faces -Z).
  await h.approach(a.position, 1.2, { x: -Math.sin(a.yaw), z: -Math.cos(a.yaw) });
  // Doors stay disabled for a short cooldown after leaving any interior.
  const focusOf = () => (h.ctx.interaction as unknown as { focusFor(a: string): { id: string } | null }).focusFor('interact');
  for (let n = 0; n < 600 && focusOf()?.id !== `door:${door}`; n++) h.run(1);
  const focus = (h.ctx.interaction as unknown as { focusFor(a: string): { id: string } | null }).focusFor('interact');
  ensure(focus?.id === `door:${door}`, `the ${door} door in focus (focus ${focus?.id ?? 'none'}, top ${h.ctx.input.contexts.top()}, modal ${h.ctx.hud.modalOpen}, dialogue ${h.ctx.services.require('dialogue').active}, feet ${h.ctx.player.feet.toArray().map((v) => v.toFixed(1))})`);
  h.press('KeyF');
  for (let n = 0; n < 30 && (i.transitioning || i.current !== id); n++) await h.runAsync(30);
  ensure(i.current === id, `inside ${id} (current ${i.current})`);
  await h.runAsync(10);
}

async function leaveInterior(h: ChapterHarness): Promise<void> {
  const i = interiors(h);
  let done = false;
  void i.exit().then(() => (done = true));
  for (let n = 0; n < 30 && !done; n++) await h.runAsync(15);
  await h.runAsync(20);
  ensure(i.current === null, `back outside (current ${i.current})`);
}

/** Kills every member of a spawn group as it appears, until `required` have died. */
async function killGroup(h: ChapterHarness, spawnTag: string, kind: string, required: number, near: string, dist = 8): Promise<void> {
  await h.approach(h.anchor(near), dist);
  let killed = 0;
  for (let i = 0; i < 40 && killed < required; i++) {
    await h.runAsync(20);
    for (const a of living(h, (x) => x.kind === kind && x.spawnTag === spawnTag)) {
      if (killed >= required) break;
      if (killAsPlayer(h, (a as unknown as { id: string }).id)) killed++;
    }
    heal(h);
  }
  ensure(killed >= required, `${required} ${kind} of ${spawnTag} killed (got ${killed})`);
  h.run(2);
}

/** Walks a scripted route by short steps (sneaking: left Alt held), each step a teleport onto the ground. */
async function walkRoute(h: ChapterHarness, route: { x: number; y: number; z: number }[], opts: { step?: number; sneak?: boolean; until?: () => boolean } = {}): Promise<void> {
  const step = opts.step ?? 2;
  if (opts.sneak) h.key('keydown', 'AltLeft');
  try {
    for (let i = 1; i < route.length; i++) {
      const a = route[i - 1];
      const b = route[i];
      const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / step));
      const yaw = Math.atan2(-(b.x - a.x), -(b.z - a.z));
      for (let k = 1; k <= n; k++) {
        const x = a.x + ((b.x - a.x) * k) / n;
        const z = a.z + ((b.z - a.z) * k) / n;
        const y = a.y + ((b.y - a.y) * k) / n;
        h.ctx.player.teleport({ x, y: y + 0.05, z }, yaw);
        h.run(6);
        heal(h);
        if (opts.until?.()) return;
      }
    }
  } finally {
    if (opts.sneak) h.key('keyup', 'AltLeft');
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The road's end

/** From the Phase A end (outside the chapel vault) to the end of the Dead Road, south of the South Gate. */
export async function reachSouthGate(h: ChapterHarness): Promise<void> {
  await h.teleport({ x: 8500, z: 1205 }, 30, 0);
  await h.runAsync(60);
}

// ---------------------------------------------------------------------------------------------------------------
// M06 Gates of Harrowmark

export async function playM06(h: ChapterHarness, t: QuestTrail, route: GateRoute): Promise<void> {
  const q = quests(h);
  const gate = () => h.ctx.services.require('harrowmark').southGate.state();
  ensure(gate() === 'closed', `the South Gate is closed before M06 (${gate()})`);
  // Choice order on m06-choose: sneak, bribe (50+ gold), argue-free (Stoked+), argue-tip (Banked and 25+ gold).
  let pick = 1;
  if (route === 'bribe') {
    grantGold(h, HARNESS_BRIBE_GOLD);
    pick = 2;
  } else if (route === 'persuasion') {
    ensure(gold(h) < HARNESS_BRIBE_GOLD, 'the persuasion run holds less than the bribe');
    grantGold(h, Math.max(0, HARNESS_TIP_GOLD - gold(h)));
    pick = 2;
  }
  const goldBefore = gold(h);
  await talkTo(h, t, 'rook', [1, pick]);
  ensure(q.state('m06') !== 'inactive' && objectiveDone(h, 'm06', 'o1'), `M06 offered and o1 credited: ${describeQuest(h, 'm06')}`);
  if (route === 'stealth') {
    await h.runAsync(5);
    ensure(gate() === 'guarded', `the gate is guarded once M06 starts (${gate()})`);
    const path = stealthRoute('m06.south-gate', (id) => h.ctx.anchors.find(id));
    const off = makeUndetectable(h.ctx);
    try {
      await h.teleport(path[0], 10);
      await walkRoute(h, path, { sneak: true, until: () => objectiveDone(h, 'm06', 'o2') });
      for (let i = 0; i < 60 && !objectiveDone(h, 'm06', 'o2'); i++) h.run(1);
    } finally {
      off();
    }
    ensure(objectiveDone(h, 'm06', 'o2'), `o2 the section cleared (${describeQuest(h, 'm06')})`);
  } else {
    const spent = goldBefore - gold(h);
    ensure(spent === (route === 'bribe' ? HARNESS_BRIBE_GOLD : HARNESS_TIP_GOLD), `${route} paid ${spent}`);
  }
  await h.runAsync(5);
  ensure(q.state('m06') === 'completed', `M06 completed: ${describeQuest(h, 'm06')}`);
  ensure(h.ctx.state.getFlag('story.m06.route') === route, `route ${String(h.ctx.state.getFlag('story.m06.route'))}`);
  ensure(gate() === 'open', `the gate is open after M06 (${gate()})`);
}

// ---------------------------------------------------------------------------------------------------------------
// M07 The Tilted Anvil

export async function playM07(h: ChapterHarness, t: QuestTrail, classId: PhaseBOptions['classId']): Promise<void> {
  const q = quests(h);
  await talkTo(h, t, 'aldith', [1]);
  ensure(q.state('m07') === 'active' && objectiveDone(h, 'm07', 'o1'), `M07 offered: ${describeQuest(h, 'm07')}`);
  await killGroup(h, 'm07.thieves', 'alley-cutpurse', 3, 'm07.thieves.1');
  ensure(objectiveDone(h, 'm07', 'o2'), `o2 three cutpurses (${describeQuest(h, 'm07')})`);
  await useAt(h, 'm07.satchel', 'pickup:satchel');
  ensure(objectiveDone(h, 'm07', 'o3'), `o3 the satchel (${describeQuest(h, 'm07')})`);
  await talkTo(h, t, 'aldith');
  ensure(objectiveDone(h, 'm07', 'o4') && h.ctx.state.getBool('story.m07.classOpen'), 'o4 and the trainers open');
  await h.enterTrigger('trg.harrowmark.bastion-yard');
  ensure(objectiveDone(h, 'm07', 'o5'), 'o5 the Bastion yard');
  const classes = h.ctx.services.require('classes') as ReturnType<ChapterHarness['ctx']['services']['require']> & {
    choose(id: string): { ok: boolean }; skipDrill(): boolean; current(): string;
  };
  ensure(h.ctx.state.getBool(`classes.available.${classId}`), `${classId} trainer open`);
  // The trainer desk is a DOM modal; headless, the choice goes through the classes service the desk calls.
  ensure(classes.choose(classId).ok, `${classId} chosen`);
  h.run(2);
  ensure(objectiveDone(h, 'm07', 'o6'), 'o6 class.chosen');
  ensure(classes.skipDrill(), 'the drill skipped');
  await h.runAsync(5);
  ensure(q.state('m07') === 'completed', `M07 completed: ${describeQuest(h, 'm07')}`);
  ensure(classes.current() === classId, `playing as ${classes.current()}`);
}

// ---------------------------------------------------------------------------------------------------------------
// R03 The Brewer's Debt

export async function playR03(h: ChapterHarness, t: QuestTrail, debt: PhaseBOptions['debt']): Promise<void> {
  const q = quests(h);
  await talkTo(h, t, 'aldith', [1]);
  ensure(q.state('r03') === 'active', `R03 offered: ${describeQuest(h, 'r03')}`);
  await killGroup(h, 'r03.guildhall', 'guildhall-thug', 3, 'r03.guildhall.1');
  ensure(objectiveDone(h, 'r03', 'o2'), `o2 the thugs (${describeQuest(h, 'r03')})`);
  await useAt(h, 'r03.brewing-copper', 'pickup:brewing-copper');
  ensure(objectiveDone(h, 'r03', 'o3'), 'o3 the copper');
  const before = gold(h);
  await talkTo(h, t, 'aldith', [debt === 'forgiven' ? 1 : 2]);
  ensure(q.state('r03') === 'completed', `R03 completed: ${describeQuest(h, 'r03')}`);
  ensure(h.ctx.state.getFlag('world.harrowmark.inn.price') === debt, 'the inn price');
  ensure((gold(h) > before) === (debt === 'collected'), `the coin (${before} -> ${gold(h)})`);
}

// ---------------------------------------------------------------------------------------------------------------
// R04 The Archivist's Missing Pages

export async function playR04(h: ChapterHarness, t: QuestTrail, steward: PhaseBOptions['steward']): Promise<void> {
  const q = quests(h);
  await talkTo(h, t, 'whitlock', [1]);
  ensure(q.state('r04') === 'active', `R04 offered: ${describeQuest(h, 'r04')}`);
  for (const n of [1, 2, 3]) await useAt(h, `r04.page-${n}`, `use:r04-page-${n}`);
  ensure(objectiveDone(h, 'r04', 'o2'), `o2 three pages (${describeQuest(h, 'r04')})`);
  await talkTo(h, t, 'whitlock', [steward === 'expose' ? 1 : 2]);
  ensure(q.state('r04') === 'completed', `R04 completed: ${describeQuest(h, 'r04')}`);
  ensure(h.ctx.state.getFlag('story.r04.choice') === steward, 'the steward choice');
}

// ---------------------------------------------------------------------------------------------------------------
// M08 Kneel Before the Boy

export async function playM08(h: ChapterHarness, t: QuestTrail, stance: Stance): Promise<void> {
  const q = quests(h);
  await talkTo(h, t, 'wystan', [1]);
  ensure(q.state('m08') === 'active' && h.ctx.state.getBool('story.m08.favourTab'), `M08 offered, the Favour tab open: ${describeQuest(h, 'm08')}`);
  await h.runAsync(10);
  await enterInterior(h, 'keep-hall', 'keep-hall');
  for (let i = 0; i < 30 && !objectiveDone(h, 'm08', 'o2'); i++) h.run(1);
  if (!objectiveDone(h, 'm08', 'o2')) await h.enterTrigger('trg.harrowmark.keep-hall');
  ensure(objectiveDone(h, 'm08', 'o2'), `o2 the Keep hall (${describeQuest(h, 'm08')})`);
  await h.runAsync(10);
  const pick = stance === 'meek' ? 1 : stance === 'steady' ? 2 : 3;
  await talkTo(h, t, 'edric', [pick, pick, pick]);
  ensure(objectiveDone(h, 'm08', 'o3') && h.ctx.state.getFlag('story.m08.stance') === stance, `o3 the audience (${String(h.ctx.state.getFlag('story.m08.stance'))})`);
  await leaveInterior(h);
  await talkTo(h, t, 'wystan');
  ensure(q.state('m08') === 'completed', `M08 completed: ${describeQuest(h, 'm08')}`);
}

// ---------------------------------------------------------------------------------------------------------------
// M09 Oswin's Ledger

export async function playM09(h: ChapterHarness, t: QuestTrail, inside?: () => Promise<void>): Promise<void> {
  const q = quests(h);
  await talkTo(h, t, 'merrin', [1]);
  ensure(q.state('m09') === 'active' && h.ctx.state.getBool('story.m09.houseOpen'), `M09 offered, the door open: ${describeQuest(h, 'm09')}`);
  await h.runAsync(10);
  await enterInterior(h, 'counting-house', 'counting-house');
  ensure(objectiveDone(h, 'm09', 'o2'), 'o2 inside the Counting-House');
  const path = stealthRoute('m09.counting-house', (id) => h.ctx.anchors.find(id));
  const invoices = ['m09.invoice-1', 'm09.invoice-2', 'm09.invoice-3'].map((id) => h.anchor(id));
  const off = makeUndetectable(h.ctx);
  try {
    await walkRoute(h, path.slice(0, 4), { sneak: true, step: 1.5 });
    for (let n = 0; n < 3; n++) {
      await h.approach(invoices[n], 1.0);
      h.key('keydown', 'AltLeft');
      h.press('KeyF');
      h.key('keyup', 'AltLeft');
      h.run(2);
    }
    ensure(objectiveDone(h, 'm09', 'o3'), `o3 three invoices (${describeQuest(h, 'm09')})`);
    await walkRoute(h, path.slice(5), { sneak: true, step: 1.5, until: () => objectiveDone(h, 'm09', 'o4') });
    for (let i = 0; i < 60 && !objectiveDone(h, 'm09', 'o4'); i++) h.run(1);
  } finally {
    off();
  }
  ensure(objectiveDone(h, 'm09', 'o4'), `o4 out clean (${describeQuest(h, 'm09')})`);
  await inside?.();
  await talkTo(h, t, 'merrin');
  ensure(q.state('m09') === 'completed', `M09 completed: ${describeQuest(h, 'm09')}`);
  if (interiors(h).current) await leaveInterior(h);
}

// ---------------------------------------------------------------------------------------------------------------
// M10 Smoke Over the Rooftops

export async function playM10(h: ChapterHarness, t: QuestTrail): Promise<void> {
  const q = quests(h);
  await talkTo(h, t, 'gerta', [1]);
  ensure(q.state('m10') === 'active' && objectiveDone(h, 'm10', 'o1'), `M10 offered: ${describeQuest(h, 'm10')}`);
  await h.runAsync(10);
  const path = chaseRoute((id) => h.ctx.anchors.find(id));
  await h.teleport(path[0], 5);
  for (let i = 0; i < 120 && !objectiveDone(h, 'm10', 'o2'); i++) h.run(1);
  ensure(objectiveDone(h, 'm10', 'o2'), `o2 the chase started (${describeQuest(h, 'm10')})`);
  // The real line until the courier is caught; if the walk ends with him still running, the catch goes through the
  // normal chase.caught path (thread 18's test hook).
  await walkRoute(h, path, { step: 3, until: () => !h.ctx.services.require('chase').active() });
  if (h.ctx.services.require('chase').active()) ensure(catchCourierForTest(), 'the courier caught by the test hook');
  ensure(h.of('chase.caught').length === 1, `chase events ${JSON.stringify(h.events.filter((e) => String(e.type).startsWith('chase.')).map((e) => e.type))}`);
  h.run(5);
  ensure(objectiveDone(h, 'm10', 'o3'), `o3 caught (${describeQuest(h, 'm10')})`);
  await h.runAsync(30);
  await talkTo(h, t, 'gerta');
  ensure(q.state('m10') === 'completed' && h.ctx.state.getBool('story.m10.ashmare'), `M10 completed, the Ashmare unlocked: ${describeQuest(h, 'm10')}`);
}

// ---------------------------------------------------------------------------------------------------------------
// D02 Hounds of the Underways

/** The test-only Grimtooth stand-in (until thread 3b lands): see grimtoothStub.ts. */
export type GrimtoothDriver = (h: ChapterHarness, branch: GrimBranch) => Promise<void>;

export async function playD02(h: ChapterHarness, t: QuestTrail, branch: GrimBranch, fightGrimtooth: GrimtoothDriver, inside?: () => Promise<void>): Promise<void> {
  const q = quests(h);
  await talkTo(h, t, 'rook', [1]);
  ensure(q.state('d02') === 'active', `D02 offered: ${describeQuest(h, 'd02')}`);
  ensure(h.ctx.state.getBool('story.d02.underwaysOpen') && h.ctx.state.getBool('enemies.mercy.calm'), 'the Underways open and Calm taught');
  ensure(h.ctx.services.require('inventory').count('hearth-bread') >= 5, 'the Hearth Bread');
  await enterInterior(h, 'underways', 'underways');
  ensure(objectiveDone(h, 'd02', 'o2'), 'o2 into the Underways');
  await inside?.();
  const kennel = h.ctx.anchors.find('underways.spawn.hound-1');
  ensure(kennel, 'the kennel anchors');
  await killGroup(h, 'd02.kennels', 'ember-hound', 4, 'underways.spawn.hound-1', 1.5);
  ensure(objectiveDone(h, 'd02', 'o3'), `o3 the hounds (${describeQuest(h, 'd02')})`);
  await fightGrimtooth(h, branch);
  ensure(h.ctx.state.getFlag('boss.gaffer-grimtooth.outcome') === branch, `Grimtooth ${String(h.ctx.state.getFlag('boss.gaffer-grimtooth.outcome'))}`);
  ensure(objectiveDone(h, 'd02', 'o4'), 'o4 the outcome');
  runHealed(h, 3);
  await leaveInterior(h);
  await talkTo(h, t, 'rook');
  ensure(q.state('d02') === 'completed', `D02 completed: ${describeQuest(h, 'd02')}`);
}

// ---------------------------------------------------------------------------------------------------------------
// The ending

/**
 * After D02: the gate and `act.ended` (thread 21), the card (thread 8; headless it has no key target, so its
 * dismissal is emitted on its behalf once it was shown), the camp scene read to its end.
 */
export async function playEnding(h: ChapterHarness, t: QuestTrail): Promise<number> {
  ensure(h.ctx.state.getBool('story.gate.a2'), 'story.gate.a2 set');
  ensure(h.of('act.ended').length === 1, `act.ended once (${h.of('act.ended').length})`);
  // HUD widgets update per render frame; headless, the frames are driven here.
  for (let i = 0; i < 5; i++) {
    h.run(1);
    h.ctx.hud.update(1 / 60);
  }
  ensure(h.ctx.state.getBool('codex.actEndingSeen'), 'the ending card was shown');
  const wc = (h.ctx.services.require('harrowmark') as unknown as { worldChange(): { active: boolean; banners: number; braziers: number } }).worldChange();
  ensure(wc.active && wc.banners === 10 && wc.braziers === 21, `the world change (${JSON.stringify(wc)})`);
  const dialogue = h.ctx.services.require('dialogue');
  h.run(10);
  ensure(!dialogue.active, 'no camp before the card closes');
  ensure(h.ctx.services.require('actEndingCard').active(), 'the card is up');
  h.ctx.services.require('actEndingCard').dismiss();
  for (let i = 0; i < 30 && !dialogue.active; i++) h.run(1);
  ensure(dialogue.active, 'the camp scene started after the card');
  let nodes = 0;
  for (let guard = 0; guard < 100 && dialogue.active; guard++) {
    nodes++;
    h.press('KeyF');
  }
  ensure(!dialogue.active && h.ctx.state.getBool('story.d02.campSeen'), 'the camp scene ran to its end');
  t.talks.push({ npc: 'camp', dialogueId: 'scene-act1-camp', nodes });
  await h.runAsync(10);
  return nodes;
}

/** All of Phase B and the ending from a loaded Phase A end save. */
export async function playPhaseB(h: ChapterHarness, opts: PhaseBOptions, fightGrimtooth: GrimtoothDriver): Promise<PhaseBTrails & { ending: QuestTrail }> {
  const t = { ...emptyPhaseBTrails(), ending: { talks: [] } as QuestTrail };
  await reachSouthGate(h);
  await playM06(h, t.m06, opts.route);
  await opts.after?.('m06');
  await playM07(h, t.m07, opts.classId);
  await opts.after?.('m07');
  await playR03(h, t.r03, opts.debt);
  await opts.after?.('r03');
  await playR04(h, t.r04, opts.steward);
  await opts.after?.('r04');
  await playM08(h, t.m08, opts.stance);
  await opts.after?.('m08');
  await playM09(h, t.m09, opts.inCountingHouse);
  await opts.after?.('m09');
  await playM10(h, t.m10);
  await opts.after?.('m10');
  await playD02(h, t.d02, opts.grimtooth, fightGrimtooth, opts.inUnderways);
  await opts.after?.('d02');
  await playEnding(h, t.ending);
  return t;
}

export { npcPosition, v3 };
