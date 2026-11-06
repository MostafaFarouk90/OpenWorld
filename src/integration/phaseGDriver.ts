/**
 * Phase G (Harrowmark, M35 to M41) played headless. Every objective is done the way a player does it where that is cheap:
 * dialogue by key presses (a choice picked by what it writes, the run's way), props and notes by F with their own interactable
 * in focus (through the doors and the Keep's links when they stand inside), escorts followed at their lead's shoulder with the
 * junction talks spoken, quest groups and waves killed as the player through the damage service (run B offers the Spare first:
 * a blow that breaks a Footman under half health, then F held on his yield), the anvil and the war-song struck on the beat,
 * and the Bellows-Engine beaten by L6's test helper. What has no cheap driver is named in `trail.scripted`: the stealth
 * sections are walked checkpoint to checkpoint (Phase D's rule).
 */
import * as THREE from 'three';
import type { ChapterHarness } from './chapterHarness';
import { describeQuest, ensure, heal, killAsPlayer } from './phaseA';
import type { PhaseCTrail } from './phaseC';
import type { ObjectiveDef } from '../quests/types';
import type { PhaseGChoices, PhaseGQuest } from './phaseG';
import { DialogueRunner } from '../dialogue/DialogueRunner';
import { ALL_INTERIORS, INTERIOR_LINKS } from '../interiors/interiors.plugin';
import { ALL_SPAWNERS } from '../enemies/allSpawners';
import { patternForTier } from '../gear/rhythm';
import { GEAR_TUNING } from '../gear/tuning';
import { MERCY } from '../enemies/tuning';
import { ENEMY_DEFS } from '../enemies/defs';
import type { EnemyDef } from '../enemies/types';
import { ACT4_GIVERS } from '../quests/act4Jump';
import { HARROWMARK_A4_GROUPS } from '../quests/content/act4/harrowmark/director/tables';
import { Q } from '../quests/content/act4/harrowmark/anchors';
import { M36_DELEGATE } from '../quests/content/act4/harrowmark/m36.quest';
import { R19_MUSTER } from '../quests/content/act4/harrowmark/r19.quest';
import { R20_AT, R20_CHOICE, R20_PASSED, R20_SERGEANT } from '../quests/content/act4/harrowmark/r20.quest';
import { R21_CHOICE } from '../quests/content/act4/harrowmark/r21.quest';
import { R22_ANVIL, R22_CHOICE } from '../quests/content/act4/harrowmark/r22.quest';
import { R23_CHOICE, R23_CLERK, R23_READING } from '../quests/content/act4/harrowmark/r23.quest';
import { D07_VALVE, D07_VALVE_ORDER, D07_VALVES } from '../quests/content/act4/harrowmark/d07.quest';
import { M37_SEAT, M37_TABLE, type M37Companion } from '../quests/content/act4/harrowmark/m37.quest';
import { M40_LEG1_AT } from '../quests/content/act4/harrowmark/director/council';
import { CRUCIBLE_ID } from '../harrowmark/act4/sites';
import { winBellowsForTest } from '../bosses/act4/bellowsEngine/testing';
import { ARENA } from '../bosses/act4/bellowsEngine/tuning';

type Vec3Like = { x: number; y: number; z: number };
const DEBUG = !!((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.PHASE_G_DEBUG);
const qs = (h: ChapterHarness) => h.ctx.services.require('quests');
const flag = (h: ChapterHarness, k: string) => h.ctx.state.getBool(k);
const objDone = (h: ChapterHarness, q: string, o: string) => qs(h).objectiveDone(q, o);
const objCurrent = (h: ChapterHarness, q: string, o: string) => !!qs(h).objectives(q).find((v) => v.def.id === o && v.current && !v.done);
const feetStr = (h: ChapterHarness) => h.ctx.player.feet.toArray().map((v) => v.toFixed(0)).join(',');
const arr = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : v === undefined ? [] : [String(v)]);

// ---- what the run watches as it plays ----------------------------------------------------------------------------------
export interface PhaseGWatch {
  /** Called on every poll (the cap watcher). */
  poll?(h: ChapterHarness): void;
  /** Footmen spared (run B) and those that would not yield and were killed instead. */
  spared: number;
  spareRefused: number;
  /** Interactables that are teleported past (stealth sections) or helped (the boss). */
  notes: string[];
}
export const newWatch = (): PhaseGWatch => ({ spared: 0, spareRefused: 0, notes: [] });

// ---- the dialogue runner, read for its choices ---------------------------------------------------------------------------
/** The live runner (captured as it starts a dialogue): its current node's visible choices, with the effects they run. */
type RawChoice = { id: string; effects?: { setFlag?: string; value?: unknown; startQuest?: string }[] };
let runner: { cur: { node: { id: string }; visible?: RawChoice[] } | null } | null = null;
let patched = false;
/** Captures the game's DialogueRunner (once per process) so the driver can read the choices a node offers. */
export function watchDialogueRunner(): void {
  if (patched) return;
  patched = true;
  const proto = DialogueRunner.prototype as unknown as { start(...a: unknown[]): unknown };
  const orig = proto.start;
  proto.start = function (this: never, ...a: unknown[]) {
    runner = this;
    return orig.apply(this, a);
  };
}

/** The choices the run wants written (a flag to a value), and the choice ids it prefers when nothing it wants is offered. */
export function wantedFlags(c: PhaseGChoices): Record<string, unknown> {
  const mustered = c.r19;
  const out: Record<string, unknown> = {
    [M36_DELEGATE('halvard')]: c.delegates.halvard, [M36_DELEGATE('oswin')]: c.delegates.oswin, [M36_DELEGATE('grisel')]: c.delegates.grisel,
    [R20_CHOICE]: c.r20, [R21_CHOICE]: c.r21, [R22_CHOICE]: c.r22, [R23_CHOICE]: c.r23,
  };
  for (const id of ['archers', 'pikes', 'horse', 'engineers'] as const) {
    if (mustered.includes(id)) out[R19_MUSTER(id)] = true;
    else out[`story.r19.hold.${id}`] = true;
  }
  return out;
}
const PREFER = ['accept', 'fight', 'ledger', 'page', 'banked', 'pay'];

/** Which numbered choice to press at the current node (1-based), or null at a plain line. */
function pickChoice(want: Record<string, unknown>, log: string[]): number | null {
  const vis = runner?.cur?.visible ?? [];
  if (!vis.length) return null;
  const score = (ch: RawChoice): number => {
    let s = 0;
    for (const f of ch.effects ?? []) {
      if (!f.setFlag || !(f.setFlag in want)) continue;
      s += want[f.setFlag] === (f.value ?? true) ? 10 : -10;
    }
    if (ch.id === 'later') s -= 20;
    const p = PREFER.indexOf(ch.id);
    if (p >= 0) s += 5 - p;
    return s;
  };
  let best = 0;
  vis.forEach((ch, i) => { if (score(ch) > score(vis[best]!)) best = i; });
  log.push(`${runner?.cur?.node.id}:${vis[best]!.id}`);
  return best + 1;
}

// ---- the Phase G run's state -------------------------------------------------------------------------------------------
export interface PhaseGRun {
  h: ChapterHarness;
  c: PhaseGChoices;
  want: Record<string, unknown>;
  watch: PhaseGWatch;
  trail: PhaseCTrail;
  /** Every choice pressed, `node:choice`. */
  picks: string[];
  /** Props of a multi-prop step already pressed. */
  used: Set<string>;
}

/** Reads whatever dialogue is open (the run's choices picked), counting its nodes into the trail. */
export function readOpen(r: PhaseGRun, who: string): number {
  const { h } = r;
  const dialogue = h.ctx.services.require('dialogue');
  if (!dialogue.active) return 0;
  const started = h.of('dialogue.started').at(-1);
  let nodes = 0;
  for (let i = 0; i < 160 && dialogue.active; i++) {
    nodes++;
    const n = pickChoice(r.want, r.picks);
    h.press(n ? `Digit${n}` : 'KeyF');
  }
  ensure(!dialogue.active, `the dialogue with ${who} closed`);
  r.trail.talks.push({ npc: started?.npcId ?? who, dialogueId: started?.dialogueId ?? who, nodes });
  return nodes;
}

/** Polls: ticks, keeps the player alive, reads a dialogue the game opened, runs the watcher. */
export async function tick(r: PhaseGRun, ticks = 30, who = 'scene'): Promise<void> {
  await r.h.runAsync(ticks);
  heal(r.h);
  readOpen(r, who);
  r.watch.poll?.(r.h);
}

export async function waitFor(r: PhaseGRun, done: () => boolean, what: string, seconds: number): Promise<void> {
  for (let i = 0; i < seconds * 2 && !done(); i++) await tick(r, 30, what);
  ensure(done(), `${what} (${seconds} s; feet ${feetStr(r.h)})`);
}

// ---- spaces: the open, the interiors, the Keep's links -------------------------------------------------------------------
interface InteractionLike {
  items: Map<string, { position(out: THREE.Vector3): THREE.Vector3 | void; enabled?: () => boolean }>;
  focusFor(action: string): { id: string } | null;
}
const interaction = (h: ChapterHarness) => h.ctx.interaction as unknown as InteractionLike;
const focusId = (h: ChapterHarness) => interaction(h).focusFor('interact')?.id;

export function ipos(h: ChapterHarness, id: string): THREE.Vector3 | null {
  const it = interaction(h).items.get(id);
  if (!it) return null;
  const v = new THREE.Vector3();
  it.position(v);
  return v;
}

interface InteriorsLike {
  current: string | null;
  transitioning: boolean;
  interiorAt(at: Vec3Like): string | null;
}
const interiors = (h: ChapterHarness) => h.ctx.services.get('interiors') as unknown as InteriorsLike;

/** One move between spaces: the interactable to press and the space it lands in. */
interface Hop { via: string; to: string | null }
function hopsFrom(h: ChapterHarness, from: string | null): Hop[] {
  const out: Hop[] = [];
  for (const d of ALL_INTERIORS) {
    for (const door of d.doors ?? []) {
      if (from === null && door.outsideInteractable !== false && interaction(h).items.has(`door:${door.doorId}`)) out.push({ via: `door:${door.doorId}`, to: d.id });
      if (from === d.id && interaction(h).items.has(`door:${door.doorId}-exit`)) out.push({ via: `door:${door.doorId}-exit`, to: null });
    }
  }
  for (const l of INTERIOR_LINKS) if (l.from.interior === from) out.push({ via: `link:${l.id}`, to: l.to.interior });
  return out;
}

/** Presses `id` with it in focus (standing on whichever side gives the focus), or holds F for `holdS`. */
export async function pressAt(h: ChapterHarness, id: string, holdS = 0): Promise<void> {
  const sides = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
  search: for (const d of [1.1, 0.7, 1.6, 2.2]) {
    for (const [x, z] of sides) {
      const p = ipos(h, id);
      ensure(p, `an interactable ${id}`);
      await h.approach(p, d, { x: x!, z: z! });
      h.run(2);
      if (focusId(h) === id) break search;
    }
  }
  for (let i = 0; i < 300 && focusId(h) !== id; i++) h.run(1);
  ensure(focusId(h) === id, `${id} in focus (focus ${focusId(h) ?? 'none'}; at ${ipos(h, id)?.toArray().map((v) => v.toFixed(1))}, feet ${feetStr(h)}, input ${h.ctx.input.contexts.top()})`);
  if (holdS > 0) h.hold('KeyF', holdS);
  else h.press('KeyF');
  h.run(2);
}

/** Moves the player into whichever space holds `at` (the open or an interior), by doors and links, shortest first. */
export async function ensureSpace(h: ChapterHarness, at: Vec3Like): Promise<void> {
  const I = interiors(h);
  const target = I.interiorAt(at) ?? null;
  for (let leg = 0; leg < 4 && (I.current ?? null) !== target; leg++) {
    // breadth first over the spaces (at most four hops: the open, the chamber, the stairs, the deep run)
    const start = I.current ?? null;
    const prev = new Map<string | null, { from: string | null; via: string }>();
    const queue: (string | null)[] = [start];
    const seen = new Set<string | null>([start]);
    while (queue.length) {
      const s = queue.shift()!;
      if (s === target) break;
      for (const hop of hopsFrom(h, s)) {
        if (seen.has(hop.to)) continue;
        seen.add(hop.to);
        prev.set(hop.to, { from: s, via: hop.via });
        queue.push(hop.to);
      }
    }
    ensure(seen.has(target), `a way from ${start ?? 'the open'} to ${target ?? 'the open'}`);
    let s: string | null = target;
    let first = prev.get(s)!;
    while (first.from !== start) { s = first.from; first = prev.get(s)!; }
    await pressAt(h, first.via);
    for (let i = 0; i < 1200 && ((I.current ?? null) === start || I.transitioning); i++) await h.runAsync(1);
    ensure((I.current ?? null) !== start, `through ${first.via} (still in ${start ?? 'the open'}; feet ${feetStr(h)})`);
    await h.runAsync(30);
  }
  ensure((I.current ?? null) === target, `in ${target ?? 'the open'} (in ${I.current ?? 'the open'})`);
}

// ---- people, props, notes ------------------------------------------------------------------------------------------------
/** Where an NPC (or a joined companion) stands now. */
export function whereIs(h: ChapterHarness, npc: string): THREE.Vector3 {
  const companions = h.ctx.services.get('companions');
  const cid = companions?.actorId?.(npc);
  const actor = cid ? h.ctx.actors.get(cid) : [...h.ctx.actors.all()].find((x) => x.kind === `npc:${npc}` && !x.dead);
  ensure(actor?.root, `NPC ${npc} has an actor`);
  return actor.root.getWorldPosition(new THREE.Vector3());
}

/** Walks up to an NPC where they stand (into their space) and talks, picking the run's choices. */
export async function talkTo(r: PhaseGRun, npc: string): Promise<void> {
  const { h } = r;
  const hasActor = [...h.ctx.actors.all()].some((x) => x.kind === `npc:${npc}` && !x.dead) || !!h.ctx.services.get('companions')?.actorId?.(npc);
  if (!hasActor) {
    // An NPC a quest needs who never spawned (a bug the report lists): his talk is started at his Act 4 post, and named.
    const post = h.ctx.anchors.find(`harrowmark.a4.post.${npc}`);
    ensure(post, `NPC ${npc} has an actor (and no Act 4 post to stand in for it)`);
    const at = new THREE.Vector3(post.position.x, post.position.y, post.position.z);
    await ensureSpace(h, at);
    await h.approach(at, 1.6);
    const note = `${npc}: absent, talk started at his post by script`;
    if (!r.watch.notes.includes(note)) r.watch.notes.push(note);
    r.trail.scripted.push(note);
  } else {
    await ensureSpace(h, whereIs(h, npc));
    await h.approach(whereIs(h, npc), 1.6);
  }
  const dialogue = h.ctx.services.require('dialogue');
  ensure(dialogue.start(`npc-${npc}`, npc), `the talk with ${npc} opened (feet ${feetStr(h)})`);
  readOpen(r, npc);
  await h.runAsync(2);
}

/** A prop or a note: into its space, F with it in focus, and through what it opens. */
export async function useProp(r: PhaseGRun, id: string, holdS = 0): Promise<void> {
  // quest props register on the quest plugin's half-second poll once their quest has begun
  for (let i = 0; i < 6 && !ipos(r.h, id); i++) await r.h.runAsync(30);
  const p = ipos(r.h, id);
  ensure(p, `an interactable ${id} (feet ${feetStr(r.h)})`);
  await ensureSpace(r.h, p);
  await pressAt(r.h, id, holdS);
  await r.h.runAsync(2);
  readOpen(r, id.replace(/^use:/, ''));
  heal(r.h);
}

// ---- fights ------------------------------------------------------------------------------------------------------------
type ActorLike = { id: string; kind: string; team?: string; dead?: boolean; spawnTag?: string; health?: number; maxHealth?: number; root?: THREE.Object3D };
/** States in which an enemy has left the fight (spared, calmed or released and walking off): never struck again. */
const LEFT_FIGHT: ReadonlySet<string> = new Set(['spared', 'calmed', 'released']);
const enemyState = (h: ChapterHarness, id: string): string | undefined =>
  (h.ctx.services.get('enemies') as unknown as { view?(id: string): { state?: string } | null } | undefined)?.view?.(id)?.state;
const hostilesNear = (h: ChapterHarness, at: THREE.Vector3, radius: number): ActorLike[] =>
  ([...h.ctx.actors.all()] as unknown as ActorLike[]).filter((a) => a.team === 'hostile' && !a.dead && a.root
    && !LEFT_FIGHT.has(enemyState(h, a.id) ?? '') && a.root.getWorldPosition(new THREE.Vector3()).distanceTo(at) <= radius);

/** The Spare's hold prompt (`release:<slug>`, verb spare) standing at an enemy's feet, enabled once it yields. */
function mercyFor(h: ChapterHarness, a: ActorLike): string | null {
  const at = a.root!.getWorldPosition(new THREE.Vector3());
  for (const [id, it] of interaction(h).items) {
    if (!id.startsWith('release:') || (it.enabled && !it.enabled())) continue;
    const p = new THREE.Vector3();
    it.position(p);
    if (p.distanceTo(at) < 2.5) return id;
  }
  return null;
}

/** Enemies whose mercy is the Spare (the Footmen, sergeants, veterans, thugs; `kind` is the def's, e.g. blighted-soldier). */
const spareable = (kind: string): boolean => (ENEMY_DEFS as Readonly<Record<string, EnemyDef>>)[kind]?.mercy?.verb === 'spare';

/** Run B's Spare: a blow that leaves him under half health and breaks his poise, then T held beside him on his yield; else the kill. */
async function spareOrKill(r: PhaseGRun, a: ActorLike): Promise<void> {
  const { h } = r;
  if (r.c.spare && spareable(a.kind) && a.health && a.maxHealth) {
    // Two blows, as a fight would land them: the first takes him under half health, the second (a tick later, once his brain has
    // read the new health) breaks his poise, and a broken Footman under half health yields instead of staggering.
    const blow = (amount: number, poise: number) => h.ctx.damage.apply({
      attackerId: h.ctx.player.actor.id, targetId: a.id, amount, poise, kind: 'melee', direction: new THREE.Vector3(0, 0, -1),
    });
    // (small blows: the damage service scales the player's hits by gear and level, so one sized blow can kill him outright)
    for (let i = 0; i < 40 && !a.dead && a.health! > a.maxHealth * 0.45; i++) {
      blow(Math.max(1, a.maxHealth * 0.04), 0);
      h.run(2);
    }
    if (!a.dead) blow(1, 1e5);
    let id: string | null = null;
    for (let i = 0; i < 12 && !(id = mercyFor(h, a)); i++) h.run(5);
    if (DEBUG) console.log(`spare ${a.kind} ${a.id}: hp ${Math.round(a.health ?? 0)}/${a.maxHealth} prompt ${id}`);
    if (id && !a.dead) {
      // step to him for the hold, then back to where the fight was held (a wave set waits while its holder is out of radius)
      const back = h.ctx.player.feet.clone();
      await h.approach(a.root!.getWorldPosition(new THREE.Vector3()), 1.5);
      h.hold('KeyT', MERCY.holdSeconds + 0.3);
      await h.runAsync(10);
      await h.approach(back, 0.3);
      if (h.of('mercy').some((m) => m.actorId === a.id)) { r.watch.spared++; return; }
    }
    r.watch.spareRefused++;
  }
  if (!a.dead) killAsPlayer(h, a.id);
}

const spawnerAnchor = (h: ChapterHarness, spawnerId: string): THREE.Vector3 => {
  const def = ALL_SPAWNERS.find((s) => s.id === spawnerId);
  ensure(def, `a spawner ${spawnerId}`);
  return h.anchor(def.anchor);
};
const aliveIn = (h: ChapterHarness, ids: readonly string[]) => {
  const e = h.ctx.services.get('enemies') as unknown as { alive(id: string): readonly string[] };
  return ids.flatMap((id) => e.alive(id)).filter((a) => !h.ctx.actors.get(a)?.dead);
};

/** Goes to each spawner of `ids` in turn and fights what stands there (and anything hostile close by), until `done()`. */
export async function fightGroups(r: PhaseGRun, ids: readonly string[], done: () => boolean, what: string, seen?: () => boolean): Promise<void> {
  const { h } = r;
  let site = 0;
  const go = async () => {
    const at = spawnerAnchor(h, ids[site % ids.length]!);
    await ensureSpace(h, at);
    await h.approach(at, 6);
  };
  await go();
  for (let i = 0; i < 160 && !done(); i++) {
    await tick(r, 20, what);
    const standing = aliveIn(h, ids);
    if (standing.length && seen && !seen()) continue;
    for (const id of standing) {
      const a = h.ctx.actors.get(id) as unknown as ActorLike | undefined;
      if (a && !a.dead) await spareOrKill(r, a);
    }
    for (const a of hostilesNear(h, h.ctx.player.feet, 25)) await spareOrKill(r, a);
    if (!standing.length && i % 4 === 3) { site++; await go(); }
  }
  ensure(done(), `${what} (${ids.map((id) => `${id}: ${aliveIn(h, [id]).length} alive`).join('; ')}; feet ${feetStr(h)})`);
  await h.runAsync(4);
}

/** Fights everything hostile within `radius` of the player as it comes (waves, the chamber's six), until `done()`. */
export async function holdGround(r: PhaseGRun, done: () => boolean, what: string, radius = 60, seconds = 600): Promise<void> {
  for (let i = 0; i < seconds * 2 && !done(); i++) {
    await tick(r, 30, what);
    for (const a of hostilesNear(r.h, r.h.ctx.player.feet, radius)) await spareOrKill(r, a);
    if (DEBUG && i % 60 === 59) {
      const w = r.h.ctx.services.get('waves') as unknown as { current: unknown; wave?: { members: string[]; cursor: number; items: unknown[] }; run?: { phase?: string } };
      const mem = (w.wave?.members ?? []).map((id) => `${id}:${r.h.ctx.actors.get(id)?.dead ? 'dead' : enemyState(r.h, id)}`);
      const flags = ['story.m39.wavesDone', 'story.m39.guardSpawned', 'story.m39.held'].map((f) => `${f}=${r.h.ctx.state.getBool(f)}`);
      console.log(`hold ${what} ${i / 2}s: waves ${JSON.stringify(w.current)} run ${JSON.stringify(w.run && { ...w.run, def: undefined })?.slice(0, 200)} cursor ${w.wave?.cursor}/${w.wave?.items.length} members ${mem.join(',')} ${flags.join(' ')}`);
    }
  }
  ensure(done(), `${what} (${seconds} s; feet ${feetStr(r.h)})`);
}

// ---- escorts -----------------------------------------------------------------------------------------------------------
interface EscortsLike { active(): string | null; state(id: string): { junction: string | null; arrived: boolean } | null }
const escorts = (h: ChapterHarness) => h.ctx.services.get('escortsAct4') as unknown as EscortsLike | undefined;

/** Walks at the escort lead's shoulder (four metres back), speaks at each junction, fights what comes, until `done()`. */
export async function followEscort(r: PhaseGRun, done: () => boolean, what: string, seconds = 900): Promise<void> {
  const { h } = r;
  let junctions = 0;
  for (let i = 0; i < seconds && !done(); i++) {
    const id = escorts(h)?.active();
    const talkId = id ? [...interaction(h).items.keys()].find((k) => k.startsWith('escort:')) : undefined;
    const lead = talkId ? ipos(h, talkId) : null;
    if (lead) {
      if ((interiors(h).interiorAt(lead) ?? null) !== (interiors(h).current ?? null)) await ensureSpace(h, lead);
      const f = h.ctx.player.feet;
      if (Math.hypot(lead.x - f.x, lead.z - f.z) > 5) await h.approach(lead, 3.5);
      const st = id ? escorts(h)?.state(id) : null;
      if (st?.junction && talkId) {
        await pressAt(h, talkId);
        junctions++;
        readOpen(r, `junction-${st.junction}`);
      }
    }
    for (const a of hostilesNear(h, h.ctx.player.feet, 25)) await spareOrKill(r, a);
    await tick(r, 60, what);
    if (DEBUG && i % 20 === 0) console.log(`[phaseG] ${what} t${i}: escort ${id} ${JSON.stringify(id ? escorts(h)?.state(id) : null)} lead ${lead?.toArray().map((v) => v.toFixed(0))} feet ${feetStr(h)}`);
  }
  ensure(done(), `${what} (escort ${escorts(h)?.active() ?? 'none'}; feet ${feetStr(h)})`);
  if (junctions) r.trail.scripted.push(`${what}: ${junctions} junction talks`);
}

// ---- beats -------------------------------------------------------------------------------------------------------------
/** One rhythm bar on prop `id` at `tier`: the press starts it, the pattern is struck on the virtual clock. */
async function strikeBar(h: ChapterHarness, id: string, tier: number): Promise<void> {
  const stepMs = 60000 / GEAR_TUNING.rhythm.bpm / GEAR_TUNING.rhythm.divisions;
  const before = h.clock.ms;
  await pressAt(h, id);
  const t0 = before + (h.clock.ms - before) - (1000 / 60) * 4;
  const barStart = GEAR_TUNING.rhythm.countInSteps;
  for (const s of patternForTier(tier)) {
    const at = t0 + (barStart + s) * stepMs;
    while (h.clock.ms + 1000 / 60 < at) h.run(1);
    h.key('keydown', 'KeyF');
    h.run(1);
    h.key('keyup', 'KeyF');
  }
  while (h.clock.ms < t0 + (barStart + 16 + 3) * stepMs) h.run(1);
  h.run(12);
}

async function playBeat(r: PhaseGRun, id: string, tier: number, done: () => boolean, what: string): Promise<void> {
  let bars = 0;
  await ensureSpace(r.h, ipos(r.h, id)!);
  for (; bars < 6 && !done(); bars++) {
    await strikeBar(r.h, id, tier);
    await tick(r, 10, what);
  }
  ensure(done(), `${what}: the bar struck (${bars} bars)`);
  r.trail.scripted.push(`${what}: ${bars} bar${bars === 1 ? '' : 's'} struck on the beat`);
}

// ---- stealth -----------------------------------------------------------------------------------------------------------
async function sneak(r: PhaseGRun, label: string, anchors: string[], done: () => boolean): Promise<void> {
  r.trail.scripted.push(`${label}: teleported checkpoint to checkpoint (the watch loop not played)`);
  for (const id of anchors) {
    const a = r.h.anchor(id);
    await ensureSpace(r.h, a);
    await r.h.teleport({ x: a.x, y: a.y, z: a.z }, 2);
    await tick(r, 30, label);
  }
  await waitFor(r, done, `${label} cleared`, 10);
}

// ---- scenes ------------------------------------------------------------------------------------------------------------
const scenes = (h: ChapterHarness) => (h.ctx.services as unknown as { get(n: string): { active: unknown } | undefined }).get('scenes');

/** Waits through a set piece on L0's sequencer (lines on the subtitle, then its talk) until `done()`. */
export async function sitThrough(r: PhaseGRun, done: () => boolean, what: string, seconds = 240): Promise<void> {
  const t0 = r.h.clock.ms;
  let seen = false;
  for (let i = 0; i < seconds * 2 && !done(); i++) {
    if (scenes(r.h)?.active) seen = true;
    await tick(r, 30, what);
  }
  ensure(done(), `${what} (scene ${seen ? 'played' : 'never began'}; ${seconds} s; feet ${feetStr(r.h)})`);
  r.trail.scripted.push(`${what}: the scene ${seen ? 'played' : 'was not seen'}, ${((r.h.clock.ms - t0) / 1000).toFixed(0)} s`);
}

// ---- the objectives ----------------------------------------------------------------------------------------------------
type Handler = (r: PhaseGRun, q: string, o: ObjectiveDef) => Promise<void>;
const groupOf = (q: string, o: string) => HARROWMARK_A4_GROUPS.find((g) => g.quest === q && g.objective === o);

/** Goes to an anchor (into its space) and waits for the scene the director offers there. */
const sceneAt = (anchor: string, radius = 4): Handler => async (r, q, o) => {
  // the offer measures across the ground only, so a scene placed indoors may already open at the door: let it
  for (let i = 0; i < 4 && !objDone(r.h, q, o.id); i++) await tick(r, 30, `${q}.${o.id}`);
  if (objDone(r.h, q, o.id)) return;
  const a = r.h.anchor(anchor);
  await ensureSpace(r.h, a);
  await r.h.approach(a, radius);
  await waitFor(r, () => objDone(r.h, q, o.id), `${q}.${o.id}`, 60);
};

const seat = (c: M37Companion): Handler => async (r, q, o) => {
  await useProp(r, M37_SEAT(c));
  await waitFor(r, () => objDone(r.h, q, o.id), `${q}.${o.id}`, 30);
};

/** R20's post `n`: the leg walked to the post, then the way chosen (the sergeant paid, the watch slipped, the post broken). */
const r20Post = (n: number): Handler => async (r, q, o) => {
  const { h } = r;
  await followEscort(r, () => flag(h, R20_AT(n)), `r20 leg ${n}`);
  const way = h.ctx.state.getString(R20_CHOICE);
  if (way === 'bribe') await talkTo(r, R20_SERGEANT(n));
  else if (way === 'stealth') {
    await sneak(r, `r20 post ${n}`, [`${Q}.r20.cp${n}.start`, `${Q}.r20.cp${n}.exit`], () => flag(h, R20_PASSED(n)));
  } else {
    const g = groupOf(q, o.id)!;
    await fightGroups(r, g.groups, () => flag(h, g.down), `${q}.${o.id}`, () => flag(h, g.seen));
  }
  await waitFor(r, () => objDone(h, q, o.id), `${q}.${o.id}`, 30);
};

const HANDLERS: Record<string, Handler> = {
  // M35: the three walks, the lane ambush, the beat as the delegates go in
  'm35.oswinIn': async (r, q, o) => followEscort(r, () => objDone(r.h, q, o.id), `${q}.${o.id}`),
  'm35.halvardIn': async (r, q, o) => followEscort(r, () => objDone(r.h, q, o.id), `${q}.${o.id}`),
  'm35.ambush': async (r, q, o) => {
    await followEscort(r, () => flag(r.h, 'story.m35.ambushSprung') || objDone(r.h, q, o.id), `${q}.${o.id} (the lane)`);
    const g = groupOf(q, o.id)!;
    await fightGroups(r, g.groups, () => objDone(r.h, q, o.id), `${q}.${o.id}`, () => flag(r.h, g.seen));
  },
  'm35.griselIn': async (r, q, o) => followEscort(r, () => objDone(r.h, q, o.id), `${q}.${o.id}`),
  'm35.entered': async (r, q, o) => waitFor(r, () => objDone(r.h, q, o.id), `${q}.${o.id}`, 30),
  // M36: the roofs, the daggerman's talk at the drop
  'm36.rooftops': async (r, q, o) => sneak(r, 'm36 rooftops', [`${Q}.m36.roof.start`, `${Q}.m36.roof.mid`, `${Q}.m36.roof.end`], () => objDone(r.h, q, o.id)),
  'm36.dagger': sceneAt(`${Q}.m36.drop`),
  // Orrin is won by the M21 letter or by Wenna's word, which she gives in a talk while M36 runs (her `a4-m36-word`)
  'm36.grisel': async (r) => {
    if (r.c.delegates.grisel === 'won' && r.h.ctx.state.getString('story.m21.branch') !== 'spy' && !flag(r.h, 'story.m36.wennaWord')) await talkTo(r, 'wenna');
    await talkTo(r, 'grisel-steward');
  },
  // R19: Bran's bout (his challenge, then breaks through the damage service until the trial is won)
  'r19.bout': async (r, q, o) => {
    const { h } = r;
    await talkTo(r, 'captain-bran');
    const t0 = h.clock.ms;
    let blows = 0;
    for (let i = 0; i < 600 && !objDone(h, q, o.id); i++) {
      await tick(r, 20, `${q}.${o.id}`);
      const opp = aliveIn(h, ['r19.bout'])[0];
      // the trial ends on a teleport of the player (its jump rule): the blows land from where Cael stands
      if (!opp || !h.ctx.services.get('trials')?.state()) continue;
      h.ctx.damage.apply({ attackerId: h.ctx.player.actor.id, targetId: opp, amount: 1e5, poise: 1e5, kind: 'melee', direction: new THREE.Vector3(0, 0, -1) });
      blows++;
    }
    ensure(objDone(h, q, o.id), `${q}.${o.id}: the bout won (${blows} blows)`);
    r.trail.scripted.push(`r19 bout: won in ${blows} blows, ${((h.clock.ms - t0) / 1000).toFixed(0)} s`);
  },
  // R20: the posts and the last leg
  'r20.cp1': r20Post(1),
  'r20.cp2': r20Post(2),
  'r20.cp3': r20Post(3),
  'r20.through': async (r, q, o) => followEscort(r, () => objDone(r.h, q, o.id), `${q}.${o.id}`),
  // R21: the lanes, the miners out
  'r21.lanes': async (r, q, o) => sneak(r, 'r21 lanes', [`${Q}.r21.lanes.start`, `${Q}.r21.lanes.mid`, `${Q}.r21.lanes.exit`], () => objDone(r.h, q, o.id)),
  'r21.out': async (r, q, o) => followEscort(r, () => objDone(r.h, q, o.id), `${q}.${o.id}`),
  // R22: the two anvil runs
  'r22.forge1': async (r, q, o) => playBeat(r, R22_ANVIL(1), 1, () => objDone(r.h, q, o.id), `${q}.${o.id}`),
  'r22.forge2': async (r, q, o) => playBeat(r, R22_ANVIL(2), 2, () => objDone(r.h, q, o.id), `${q}.${o.id}`),
  // R23: the exposure, the run's way
  'r23.expose': async (r, q, o) => {
    if (r.h.ctx.state.getString(R23_CHOICE) === 'public') await useProp(r, R23_READING);
    else await talkTo(r, R23_CLERK);
    await waitFor(r, () => objDone(r.h, q, o.id), `${q}.${o.id}`, 30);
  },
  // D07: in through the Crucible's door, the valves in the furnace log's order, the Bellows-Engine
  'd07.enter': async (r, q, o) => {
    const door = ipos(r.h, `door:${CRUCIBLE_ID}`);
    ensure(door, 'the Crucible door');
    await ensureSpace(r.h, r.h.anchor('harrowmark.a4.crucible.entry'));
    await waitFor(r, () => objDone(r.h, q, o.id), `${q}.${o.id}`, 10);
  },
  'd07.valves': async (r, q, o) => {
    for (const n of D07_VALVE_ORDER) if (!flag(r.h, D07_VALVES)) await useProp(r, D07_VALVE(n));
    await waitFor(r, () => objDone(r.h, q, o.id), `${q}.${o.id}`, 10);
  },
  'd07.boss': async (r, q, o) => {
    const { h } = r;
    await ensureSpace(h, h.anchor('harrowmark.a4.crucible.arena.entry'));
    await h.enterTrigger(ARENA.trigger);
    const res = winBellowsForTest({ ctx: h.ctx, step: () => h.run(1) });
    r.trail.scripted.push(`d07 Bellows-Engine: beaten through L6's winBellowsForTest (each phase's live valve shut after a full bar), ${res.seconds.toFixed(0)} s`);
    await waitFor(r, () => objDone(h, q, o.id), `${q}.${o.id}`, 30);
  },
  // M37: the seats, the war-song, the toast at the feast
  'm37.tobb': seat('tobb'),
  'm37.hrolf': seat('hrolf'),
  'm37.aelfreda': seat('aelfreda'),
  'm37.song': async (r, q, o) => playBeat(r, M37_TABLE, 2, () => objDone(r.h, q, o.id), `${q}.${o.id}`),
  'm37.toast': sceneAt(`${Q}.m37.feast`),
  // M38: the case from the podium, the betrayal, the six
  'm38.case': async (r, q, o) => waitFor(r, () => objDone(r.h, q, o.id), `${q}.${o.id}`, 60),
  'm38.turn': async (r, q, o) => sitThrough(r, () => objDone(r.h, q, o.id), `${q}.${o.id}`),
  'm38.fight': async (r, q, o) => holdGround(r, () => objDone(r.h, q, o.id), `${q}.${o.id}`),
  // M39: the stair-head, the waves and the champion's guard, Gaut's fall
  'm39.hold': async (r, q, o) => holdGround(r, () => objDone(r.h, q, o.id), `${q}.${o.id}`, 80, 900),
  'm39.fall': async (r, q, o) => sitThrough(r, () => objDone(r.h, q, o.id), `${q}.${o.id}`),
  // M40: the column's first leg (the first den on its way), the second den, the second leg out
  'm40.enter': async (r, q, o) => {
    await ensureSpace(r.h, r.h.anchor('harrowmark.a4.deeprun.entry'));
    await waitFor(r, () => objDone(r.h, q, o.id), `${q}.${o.id}`, 10);
  },
  'm40.den1': async (r, q, o) => {
    await followEscort(r, () => flag(r.h, M40_LEG1_AT) || objDone(r.h, q, o.id), `${q}.${o.id} (leg 1)`);
    const g = groupOf(q, o.id)!;
    if (!objDone(r.h, q, o.id)) await fightGroups(r, g.groups, () => objDone(r.h, q, o.id), `${q}.${o.id}`, () => flag(r.h, g.seen));
  },
  'm40.out': async (r, q, o) => followEscort(r, () => objDone(r.h, q, o.id), `${q}.${o.id}`),
  // M41: the camp
  'm41.gather': sceneAt('harrowmark.a4.m41.camp', 6),
};

/** One current objective, played. */
async function playObjective(r: PhaseGRun, q: string, o: ObjectiveDef): Promise<void> {
  const { h } = r;
  const key = `${q}.${o.id}`;
  for (let i = 0; i < 7200 && (h.ctx.input.contexts.top() === 'cutscene' || scenes(h)?.active); i += 30) await tick(r, 30, key);
  await h.runAsync(2);
  readOpen(r, key);
  if (objDone(h, q, o.id)) return;
  const handler = HANDLERS[key];
  if (handler) return handler(r, q, o);
  const target = arr(o.target);
  const match = (o.match ?? {}) as Record<string, unknown>;
  switch (o.type) {
    case 'talk':
      if (target[0]!.startsWith('scene.')) return waitFor(r, () => objDone(h, q, o.id), key, 60);
      return talkTo(r, target[0]!);
    case 'interact':
      return useProp(r, target[0]!);
    case 'event':
      break;
    default:
      ensure(false, `${key}: objective type ${o.type}`);
  }
  const ev = target[0]!;
  if (ev === 'interior.entered') {
    const def = ALL_INTERIORS.find((d) => d.id === match.interiorId);
    ensure(def?.doors[0], `${key}: the interior ${String(match.interiorId)}`);
    await ensureSpace(h, h.anchor(def.doors[0].inside));
    return waitFor(r, () => objDone(h, q, o.id), key, 10);
  }
  const g = groupOf(q, o.id);
  if (g) return fightGroups(r, g.groups, () => objDone(h, q, o.id), key, () => flag(h, g.seen));
  if (ev === 'dialogue.ended') {
    const unread = arr(match.npcId).filter((n) => !r.trail.talks.some((t) => t.npc === n || t.dialogueId === n));
    ensure(unread.length > 0, `${key}: an unread note`);
    return useProp(r, `use:${unread[0]}`);
  }
  if (ev === 'interact') {
    const ids = arr(match.interactableId);
    const next = ids.find((id) => !r.trail.talks.some((t) => t.npc === id.replace(/^use:/, '')) && !r.used.has(id));
    ensure(next, `${key}: an unused prop`);
    r.used.add(next);
    return useProp(r, next);
  }
  ensure(false, `${key}: a driver (event ${ev})`);
}

/** Plays one Phase G quest from its giver's offer (or the director's start) to its hand-in. */
export async function playPhaseGQuest(r: PhaseGRun, q: PhaseGQuest): Promise<void> {
  const { h } = r;
  const quests = qs(h);
  // M39 and M41 follow their quest at once (no offer); the others are offered by their giver
  for (let i = 0; i < 20 && quests.state(q) === 'inactive' && (q === 'm39' || q === 'm41'); i++) await tick(r, 30, q);
  // the sequencer scenes' subtitle lines are read like dialogue nodes (L10's node pins count them the same way)
  const lines0 = h.of('scene.line').length;
  if (quests.state(q) === 'inactive') {
    const giver = ACT4_GIVERS[q]!;
    await talkTo(r, giver);
    ensure(quests.state(q) === 'active', `${q} offered by ${giver} (${describeQuest(h, q)})`);
  }
  for (let guard = 0; guard < 80 && quests.state(q) === 'active'; guard++) {
    const cur = quests.objectives(q).find((v) => v.current && !v.done);
    if (!cur) { await tick(r, 10, q); continue; }
    const before = describeQuest(h, q);
    await playObjective(r, q, cur.def);
    await tick(r, 4, q);
    r.trail.order.push(`${q}.${cur.def.id}`);
    if (describeQuest(h, q) === before && quests.state(q) === 'active') await tick(r, 60, q);
    ensure(describeQuest(h, q) !== before || quests.state(q) !== 'active', `${q}.${cur.def.id} advanced (${before}; feet ${feetStr(h)})`);
  }
  ensure(quests.state(q) === 'completed', `${q} completed (${describeQuest(h, q)})`);
  const lines = h.of('scene.line').length - lines0;
  if (lines) r.trail.talks.push({ npc: 'scene-lines', dialogueId: 'scene-lines', nodes: lines });
}

export { objCurrent };
