/**
 * The Greyfen quests played headless on a fixture-booted game (Phase E). Every objective is done the way a player does it
 * where that is cheap: dialogue by key presses, props and notes by F with their own interactable in focus (through the
 * interior doors when they stand inside one), enemies and quest groups killed as the player through the damage service,
 * dives swum along the routes' polylines with the breath watched, the ferry ridden by its service, the waystone rekindled
 * by holding F and the water-song struck on its beat. What has no cheap driver is named in `trail.scripted`.
 *
 * The recipe follows the Greyfen quest thread's own browser driver (tools/act3-k12-driver) and its rig autoplay
 * (director/autoplay.testkit.ts).
 */
import * as THREE from 'three';
import type { ChapterHarness } from './chapterHarness';
import { describeQuest, ensure, heal, killAsPlayer } from './phaseA';
import { whereIs, type PhaseCTrail } from './phaseC';
import { diveAlong } from './phaseE';
import type { ObjectiveDef } from '../quests/types';
import { GREYFEN_SPAWNERS } from '../quests/content/act3/greyfen/spawners';
import { GREYFEN_GROUP_OBJECTIVES } from '../quests/content/act3/greyfen/groups';
import { GREYFEN_PROPS } from '../quests/content/act3/greyfen/props';
import { DIVE_TUNING } from '../water/types';
import { GREYFEN_DIVE_ROUTES as ROUTES, type GreyfenDiveRoute } from '../greyfen/water';
/** The interiors' routes (K3) and the open M24 pool's (K7). */
const GREYFEN_DIVE_ROUTES = [...(ROUTES as readonly GreyfenDiveRoute[]), m24Route() as GreyfenDiveRoute];
import { M27_BLINDS_END } from '../quests/content/act3/greyfen/m27.quest';
import { R13_ALTAR } from '../quests/content/act3/greyfen/r13.quest';
import { R12_CUTS, R12_PICK, R12_TORCHES } from '../quests/content/act3/greyfen/r12.quest';
import { SONG_TIER } from '../quests/content/act3/greyfen/director/song';
import { patternForTier } from '../gear/rhythm';
import { GEAR_TUNING } from '../gear/tuning';
import { WAYSTONE_TUNING } from '../waystones/tuning';
import { PHASE_E_GIVERS } from './phaseE';
import { m24Route } from '../traversal/sites';

type Vec3Like = { x: number; y: number; z: number };
const arr = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : v === undefined ? [] : [String(v)]);
const qs = (h: ChapterHarness) => h.ctx.services.require('quests');

/** The choices each run takes (dialogue picks by quest and objective, and the branch picks). */
export interface GreyfenChoices {
  r12: 'burned' | 'cut';
  r14: 'returned' | 'released';
}
export const GREYFEN_RUN_A: GreyfenChoices = { r12: 'burned', r14: 'returned' };

interface InteractionLike {
  items: Map<string, { position(out: THREE.Vector3): THREE.Vector3 | void }>;
  focusFor(action: string): { id: string } | null;
}
const interaction = (h: ChapterHarness) => h.ctx.interaction as unknown as InteractionLike;
const focusId = (h: ChapterHarness) => interaction(h).focusFor('interact')?.id;

/** Where an interactable stands now (null when none is registered under `id`). */
export function ipos(h: ChapterHarness, id: string): THREE.Vector3 | null {
  const it = interaction(h).items.get(id);
  if (!it) return null;
  const v = new THREE.Vector3();
  it.position(v);
  return v;
}

interface InteriorsLike {
  current: string | null;
  interiorAt(at: Vec3Like): string | null;
}
const interiors = (h: ChapterHarness) => h.ctx.services.get('interiors') as unknown as InteriorsLike | undefined;

/** Stands near `id` on whichever side gives it the focus, then presses (or holds) F. */
export async function pressAt(h: ChapterHarness, id: string, holdS = 0): Promise<void> {
  const sides = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
  // Doors stay shut for a short cooldown after leaving an interior: wait the focus out before trying every side.
  search: for (const d of [1.1, 0.7, 1.6, 2.2]) {
    for (const [x, z] of sides) {
      const p = ipos(h, id);
      ensure(p, `an interactable ${id}`);
      await h.approach(p, d, { x, z });
      h.run(2);
      if (focusId(h) === id) break search;
    }
  }
  for (let i = 0; i < 300 && focusId(h) !== id; i++) h.run(1);
  ensure(focusId(h) === id, `${id} in focus (focus ${focusId(h) ?? 'none'}; at ${ipos(h, id)?.toArray().map((v) => v.toFixed(1))}, feet ${h.ctx.player.feet.toArray().map((v) => v.toFixed(1))}, water ${h.ctx.services.get('water')?.state}, input ${h.ctx.input.contexts.top()})`);
  if (holdS > 0) h.hold('KeyF', holdS);
  else h.press('KeyF');
  h.run(2);
}

/** Through a door interactable, waiting for the interior transition to land in `expect`. */
async function throughDoor(h: ChapterHarness, doorId: string, expect: string | null): Promise<void> {
  await pressAt(h, doorId);
  const I = interiors(h)!;
  for (let i = 0; i < 1200 && I.current !== expect; i++) await h.runAsync(1);
  ensure(I.current === expect, `through ${doorId} into ${expect ?? 'the open'} (in ${I.current ?? 'the open'})`);
  await h.runAsync(30);
}

/**
 * Moves the player into whichever space (an interior, or the open) holds `at`, through the doors. The door ids follow the
 * Greyfen's interiors (chapel, hut, Deeps), whose main door id is the interior id; another interior would need its spec.
 */
export async function ensureSpace(h: ChapterHarness, at: Vec3Like): Promise<void> {
  const I = interiors(h);
  if (!I) return;
  const cur = I.current ?? null;
  const target = I.interiorAt(at) ?? null;
  if (cur === target) return;
  if (cur) await throughDoor(h, `door:${cur}-exit`, null);
  if (target) await throughDoor(h, `door:${target}`, target);
}

/** Reads through whatever dialogue is open, counting its nodes into the trail (as the player reads it). */
export function readOpen(h: ChapterHarness, trail: PhaseCTrail, who: string, choices: number[] = []): number {
  const dialogue = h.ctx.services.require('dialogue');
  if (!dialogue.active) return 0;
  const picks = [...choices];
  let nodes = 0;
  let chosen = 0;
  const off = h.ctx.events.on('dialogue.choice', () => chosen++);
  for (let i = 0; i < 120 && dialogue.active; i++) {
    nodes++;
    const before = chosen;
    h.press(`Digit${picks[0] ?? 1}`);
    if (chosen !== before) {
      picks.shift();
      continue;
    }
    h.press('KeyF');
  }
  off?.();
  ensure(!dialogue.active, `the dialogue with ${who} closed`);
  trail.talks.push({ npc: who, dialogueId: who, nodes });
  return nodes;
}

/** Uses a prop or reads a note: into its space, F with it in focus, and through any dialogue it opens. */
export async function useProp(h: ChapterHarness, trail: PhaseCTrail, id: string, holdS = 0): Promise<void> {
  const p = ipos(h, id);
  ensure(p, `an interactable ${id}`);
  await ensureSpace(h, p);
  await pressAt(h, id, holdS);
  await h.runAsync(2);
  readOpen(h, trail, id.replace(/^use:/, ''));
  heal(h);
}

/** Talks to an NPC where they stand (inside an interior or out), as Phase C does. */
export async function talkTo(h: ChapterHarness, trail: PhaseCTrail, npc: string, choices: number[] = []): Promise<void> {
  const at = whereIs(h, npc);
  await ensureSpace(h, at);
  await h.approach(whereIs(h, npc), 1.6);
  const dialogueId = `npc-${npc}`;
  const nodes = h.talk(dialogueId, npc, choices);
  trail.talks.push({ npc, dialogueId, nodes });
  await h.runAsync(2);
}

/** Waits (healed) until the game opens a dialogue by itself, then reads it. */
async function awaitScene(h: ChapterHarness, trail: PhaseCTrail, what: string, seconds = 60): Promise<void> {
  const dialogue = h.ctx.services.require('dialogue');
  for (let i = 0; i < seconds * 2 && !dialogue.active; i++) {
    await h.runAsync(30);
    heal(h);
  }
  ensure(dialogue.active, `${what}: the scene opened`);
  readOpen(h, trail, `scene-${what}`);
}

const spawnerAt = (h: ChapterHarness, spawnerId: string): THREE.Vector3 => {
  const def = GREYFEN_SPAWNERS.find((s) => s.id === spawnerId);
  ensure(def, `a Greyfen spawner ${spawnerId}`);
  return h.anchor(def.anchor);
};

/** Kills the damage service refused (a leech under the water) and the driver credited to the player instead. */
export const KILLS_FORCED: string[] = [];

interface EnemiesLike {
  alive(spawnerId: string): readonly string[];
}
const alive = (h: ChapterHarness, ids: readonly string[]) => {
  const e = h.ctx.services.get('enemies') as unknown as EnemiesLike;
  return ids.flatMap((id) => e.alive(id)).filter((a) => !h.ctx.actors.get(a)?.dead);
};

/** Goes to each spawner in turn and kills what it raises, until `done()`. */
async function killSpawners(h: ChapterHarness, ids: readonly string[], done: () => boolean, what: string, seen?: () => boolean): Promise<void> {
  ensure(ids.length > 0, `${what}: spawners`);
  let site = 0;
  const forced = { n: 0 };
  const go = async () => {
    const at = spawnerAt(h, ids[site % ids.length]);
    await ensureSpace(h, at);
    await h.approach(at, 6);
  };
  await go();
  for (let i = 0; i < 120 && !done(); i++) {
    await h.runAsync(20);
    heal(h);
    const standing = alive(h, ids);
    // The director credits a group it saw standing on one of its polls: let it see them before they fall.
    if (standing.length && seen && !seen()) continue;
    for (const a of standing) {
      // A leech waits under the water until the player steps up to it: walk up and let it surface before the blow.
      const actor = h.ctx.actors.get(a) as { untargetable?: boolean; root?: THREE.Object3D } | undefined;
      if (actor?.untargetable && actor.root) {
        await h.approach(actor.root.getWorldPosition(new THREE.Vector3()), 2);
        for (let t = 0; t < 240 && actor.untargetable; t += 10) {
          h.run(10);
          heal(h);
        }
      }
      // One still under after four seconds there is credited to the player by the driver (named in KILLS_FORCED).
      if (!killAsPlayer(h, a) && !h.ctx.actors.get(a)?.dead) {
        (h.ctx.damage as unknown as { kill(id: string, by: string): void }).kill(a, h.ctx.player.actor.id);
        forced.n++;
      }
    }
    if (!standing.length && i % 4 === 3) {
      site++;
      await go();
    }
  }
  const why = ids.map((id) => {
    const def = GREYFEN_SPAWNERS.find((s) => s.id === id);
    const act = def?.activation as { flag?: string } | undefined;
    const tagged = [...h.ctx.actors.all()].filter((a) => (a as { spawnTag?: string }).spawnTag === def?.tag);
    const at = def ? h.anchor(def.anchor) : null;
    return `${id}: alive ${alive(h, [id]).length}, tagged ${tagged.map((a) => `${a.kind}${a.dead ? '(dead)' : ''}`).join('/')}, anchor ${at?.toArray().map((v) => v.toFixed(0))}, ${act?.flag ?? '-'}=${act?.flag ? String(h.ctx.state.getBool(act.flag)) : '-'}`;
  });
  ensure(done(), `${what} (${why.join('; ')}; feet ${h.ctx.player.feet.toArray().map((v) => v.toFixed(0))})`);
  if (forced.n) KILLS_FORCED.push(`${what}: ${forced.n}`);
  await h.runAsync(4);
}

const progressOf = (h: ChapterHarness, q: string, o: string) => qs(h).objectives(q).find((v) => v.def.id === o)?.progress ?? 0;
const flag = (h: ChapterHarness, k: string) => h.ctx.state.getBool(k);
const objDone = (h: ChapterHarness, q: string, o: string) => qs(h).objectiveDone(q, o);

/** Swims a dive route from its entry stand to the pocket `pocketId` (or its first pocket), along the route's points. */
async function diveTo(h: ChapterHarness, trail: PhaseCTrail, pocketId: string | null, volumeId?: string): Promise<void> {
  const route = GREYFEN_DIVE_ROUTES.find((r) => (pocketId ? r.airPockets.some((p) => p.id === pocketId) : r.volumeId === volumeId));
  ensure(route, `a dive route for ${pocketId ?? volumeId}`);
  const pocket = pocketId ? route.airPockets.find((p) => p.id === pocketId)! : route.airPockets[0];
  await ensureSpace(h, route.entryStand);
  // From where the player is: the route point nearest them when they stand by the route (a pocket's ledge), else the entry stand.
  const f = h.ctx.player.feet;
  let from = 0;
  let best = Infinity;
  route.points.forEach((p, i) => {
    const d = Math.hypot(p.x - f.x, p.y - f.y, p.z - f.z);
    if (d < best) {
      best = d;
      from = i;
    }
  });
  if (best > 6) {
    await h.teleport(route.entryStand, 4);
    from = 0;
  }
  const to = pocket ? route.points.findIndex((p) => Math.hypot(p.x - pocket.at.x, p.y - pocket.at.y, p.z - pocket.at.z) < 0.05) : route.points.length - 1;
  ensure(to >= 0, `${route.id}: the pocket ${pocket?.id} is a route point`);
  const pts = from <= to ? route.points.slice(from, to + 1) : route.points.slice(to, from + 1).reverse();
  const log = await diveAlong(h, [h.ctx.player.feet.clone(), ...pts], DIVE_TUNING.swimSpeed);
  trail.scripted.push(`dive ${route.id} to ${pocket?.id ?? 'end'}: ${log.metres.toFixed(0)} m, least breath ${log.minBreath.toFixed(1)} s`);
  // Head out at the pocket: stand on its ledge.
  if (pocket) await h.teleport(pocket.stand, 30);
  heal(h);
}

/** The water-song: a press at the altar starts the bar, then a strike on each step of the pattern, on the virtual clock. */
async function singBar(h: ChapterHarness, tier: number, startedAt?: number): Promise<void> {
  const stepMs = 60000 / GEAR_TUNING.rhythm.bpm / GEAR_TUNING.rhythm.divisions;
  // A bar the player starts begins on the press's keydown tick (pressAt's press is keydown, a tick, keyup, a tick).
  let t0 = startedAt;
  if (t0 === undefined) {
    const before = h.clock.ms;
    await pressAt(h, R13_ALTAR);
    t0 = before + (h.clock.ms - before) - (1000 / 60) * 4;
  }
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

type GreyfenHandler = (h: ChapterHarness, trail: PhaseCTrail, q: string, o: ObjectiveDef, c: GreyfenChoices) => Promise<void>;

/** Objectives keyed `quest.objective` (or an event name) that need more than the generic player. */
const HANDLERS: Record<string, GreyfenHandler> = {
  'm23.sight': async (h, trail) => {
    // The layout's sphere is `once` (it may have fired on the walk in): stand at its centre, as the director measures it.
    const c = h.triggerCentre('trg.greyfen.mere.first-sight');
    ensure(c, 'the first-sight trigger');
    await h.teleport(c, 4);
    await awaitScene(h, trail, 'm23.sight');
  },
  'story.r12.picked': async (h, trail, _q, _o, c) => talkTo(h, trail, 'dudda', [c.r12 === 'burned' ? 1 : 2]),
  'story.r12.bedsDone': async (h, trail) => {
    const cut = h.ctx.state.getString(R12_PICK) === 'cut';
    for (const id of cut ? R12_CUTS : R12_TORCHES) {
      const p = GREYFEN_PROPS.find((x) => x.interactableId === id);
      if (p?.usedFlag && flag(h, p.usedFlag)) continue;
      await useProp(h, trail, id);
    }
  },
  'story.r12.leechesDown': async (h, _trail, q, o) => {
    const cut = h.ctx.state.getString(R12_PICK) === 'cut';
    const ids = GREYFEN_SPAWNERS.filter((s) => s.id.startsWith(cut ? 'greyfen.q.r12.cut' : 'greyfen.q.r12.burn')).map((s) => s.id);
    await killSpawners(h, ids, () => objDone(h, q, o.id), `${q}.${o.id}`);
  },
  'story.m25.drink': async (h, _t, q, o) => waitFor(h, () => objDone(h, q, o.id), `${q}.${o.id}`, 30),
  'story.r14.chosen': async (h, trail, _q, _o, c) => talkTo(h, trail, 'deserter', [c.r14 === 'returned' ? 1 : 2]),
  'story.r13.sung': async (h, trail, q, o) => {
    await pressAt(h, R13_ALTAR); // the first press plays the teaching scene
    await h.runAsync(4);
    // The scene's end begins the lesson bar: read it a node at a time and note the tick it closed on.
    const dialogue = h.ctx.services.require('dialogue');
    ensure(dialogue.active, `${q}.${o.id}: the song's scene opened at the altar`);
    let nodes = 0;
    let closedAt = h.clock.ms;
    for (; nodes < 40 && dialogue.active; nodes++) {
      h.key('keydown', 'KeyF');
      h.run(1);
      closedAt = h.clock.ms;
      h.key('keyup', 'KeyF');
      if (dialogue.active) h.run(1);
    }
    ensure(!dialogue.active, `${q}.${o.id}: the song's scene closed`);
    trail.talks.push({ npc: 'scene-r13.song', dialogueId: 'scene-r13.song', nodes });
    await singBar(h, SONG_TIER.lesson, closedAt - 1000 / 60);
    for (let i = 0; i < 4 && !objDone(h, q, o.id); i++) await singBar(h, SONG_TIER.real);
    const fails = h.ctx.state.getNumber('story.r13.songFails');
    ensure(objDone(h, q, o.id), `${q}.${o.id}: sung (fails ${fails})`);
    // Struck on the beat, the song never needs the widened window.
    ensure(fails === 0, `${q}.${o.id}: sung without a failed bar (fails ${fails})`);
    trail.scripted.push(`r13 song: struck on the virtual clock, ${fails} failed bars`);
  },
  'story.r13.calm': async (h, _t, q, o) => waitFor(h, () => objDone(h, q, o.id), `${q}.${o.id}`, 20),
  'wyrm.hathren': async (h, _t, q, o) => {
    await h.approach(h.anchor('greyfen.mere.shore'), 3);
    await waitFor(h, () => objDone(h, q, o.id), `${q}.${o.id}`, 120);
  },
  'shrine.rekindled': async (h, trail, q, o) => {
    await pressAt(h, 'waystone:hathrens-mere', WAYSTONE_TUNING.rekindleHoldSeconds + 0.2);
    await h.runAsync(4);
    readOpen(h, trail, 'scene-m26.rite');
    await waitFor(h, () => objDone(h, q, o.id), `${q}.${o.id}`, 30);
  },
  'm26.voice': async (h, trail) => awaitScene(h, trail, 'm26.voice', 180),
  'm27.ally': async (h, trail) => awaitScene(h, trail, 'm27.ally'),
  'm27.aftermath': async (h, trail) => awaitScene(h, trail, 'm27.aftermath'),
  'story.m27.blinds': async (h, trail, q, o) => {
    // Unseen through the four blinds to the far end (the quiet reading of plan 2.1); a pack that sees the player is fought.
    // Sneaking, in 1.5 m steps at the sneak pace (a step's ticks at about 2 m/s), so the pack sees every stretch walked.
    h.key('keydown', 'AltLeft');
    const end = h.triggerCentre(M27_BLINDS_END);
    ensure(end, 'the blinds end trigger');
    const points = [1, 2, 3, 4].map((n) => h.anchor(`greyfen.m27.blind.${n}`)).concat([end]);
    let metres = 0;
    for (const p of points) {
      for (let guard = 0; guard < 400; guard++) {
        const f = h.ctx.player.feet;
        const d = Math.hypot(p.x - f.x, p.z - f.z);
        if (d < 0.6) break;
        const step = Math.min(d, 1.5);
        h.ctx.player.teleport({ x: f.x + ((p.x - f.x) / d) * step, y: Math.max(f.y, p.y), z: f.z + ((p.z - f.z) / d) * step }, h.ctx.cameraRig?.yaw ?? 0);
        await h.runAsync(Math.round((step / 2) * 60));
        metres += step;
        if (objDone(h, q, o.id) || flag(h, 'story.m27.seen')) break;
      }
      if (objDone(h, q, o.id) || flag(h, 'story.m27.seen')) break;
    }
    h.key('keyup', 'AltLeft');
    if (!objDone(h, q, o.id) && !flag(h, 'story.m27.seen')) await h.enterTrigger(M27_BLINDS_END);
    await h.runAsync(10);
    trail.scripted.push(`m27 blinds: stepped ${metres.toFixed(0)} m sneaking, ${flag(h, 'story.m27.seen') ? 'seen, pack fought' : 'unseen'}`);
    if (!objDone(h, q, o.id)) {
      const g = GREYFEN_GROUP_OBJECTIVES.find((x) => x.quest === q && x.objective === o.id)!;
      await killSpawners(h, g.groups, () => objDone(h, q, o.id), `${q}.${o.id} (seen)`, () => flag(h, g.seen));
    }
  },
  'story.m27.set': async (h, _t, q, o) => waitFor(h, () => objDone(h, q, o.id), `${q}.${o.id}`, 20),
  'd05.undercroft': async (h, trail) => {
    await ensureSpace(h, ipos(h, 'door:greyfen-deeps') ?? h.ctx.player.feet);
    await throughDoor(h, 'door:greyfen-deeps', 'greyfen-deeps');
    await awaitScene(h, trail, 'd05.undercroft');
  },
  'd05.outcome': async (h, trail) => awaitScene(h, trail, 'd05.outcome'),
  'boss.defeated': async (h, trail, q, o) => {
    await fightMurkjaw(h, trail);
    await waitFor(h, () => objDone(h, q, o.id), `${q}.${o.id}`, 30);
  },
};

async function waitFor(h: ChapterHarness, done: () => boolean, what: string, seconds: number): Promise<void> {
  for (let i = 0; i < seconds * 2 && !done(); i++) {
    await h.runAsync(30);
    heal(h);
  }
  ensure(done(), `${what} (${seconds} s)`);
}

/** The arena: in through the hall's gap, then a blade's blows whenever he can be hit, until he is down. */
async function fightMurkjaw(h: ChapterHarness, trail: PhaseCTrail): Promise<void> {
  await h.approach(h.anchor('greyfen.d05.arena.centre'), 4);
  let hits = 0;
  const t0 = h.clock.ms;
  for (let i = 0; i < 3600 && h.ctx.state.getString('boss.murkjaw.outcome') !== 'defeated'; i++) {
    await h.runAsync(30);
    heal(h);
    readOpen(h, trail, 'scene-d05.murkjaw');
    const boss = [...h.ctx.actors.all()].find((a) => a.kind === 'murkjaw') as
      | { id: string; dead?: boolean; hittable?: boolean; untargetable?: boolean }
      | undefined;
    if (!boss || boss.dead || boss.hittable === false || boss.untargetable) continue;
    h.ctx.damage.apply({
      attackerId: h.ctx.player.actor.id, targetId: boss.id, amount: 70, poise: 35, kind: 'melee', direction: new THREE.Vector3(0, 0, -1),
    });
    hits++;
  }
  trail.scripted.push(`murkjaw: ${hits} blows of 70 while hittable, ${((h.clock.ms - t0) / 1000).toFixed(0)} s of fight`);
  ensure(h.ctx.state.getString('boss.murkjaw.outcome') === 'defeated', `Murkjaw defeated after ${hits} blows`);
}

/** One current objective of a Greyfen quest, played. */
async function playObjective(h: ChapterHarness, trail: PhaseCTrail, q: string, o: ObjectiveDef, c: GreyfenChoices): Promise<void> {
  const key = `${q}.${o.id}`;
  // A scene the game opened by itself (Hathren's voice comes as she quiets) is read where it opens; a set piece (Hathren
  // rising) holds the player in a cutscene until it ends.
  readOpen(h, trail, `scene-${key}`);
  for (let i = 0; i < 7200 && h.ctx.input.contexts.top() === 'cutscene'; i += 30) {
    await h.runAsync(30);
    readOpen(h, trail, `scene-${key}`);
  }
  await h.runAsync(2);
  if (objDone(h, q, o.id)) return;
  const target = arr(o.target);
  const match = (o.match ?? {}) as Record<string, unknown>;
  const handler = HANDLERS[key] ?? (o.type === 'event' ? HANDLERS[target[0]!] : undefined);
  if (handler) return handler(h, trail, q, o, c);
  switch (o.type) {
    case 'talk':
      if (target[0]!.startsWith('scene.')) return awaitScene(h, trail, target[0]!.slice(6));
      return talkTo(h, trail, target[0]!);
    case 'interact':
      return useProp(h, trail, target[0]!);
    case 'collect': {
      const prop = GREYFEN_PROPS.find((p) => p.objective?.[0] === q && p.objective?.[1] === o.id);
      ensure(prop, `a prop for ${key}`);
      return useProp(h, trail, prop.interactableId);
    }
    case 'kill': {
      const ids = GREYFEN_SPAWNERS.filter((s) => s.tag === o.spawnTag).map((s) => s.id);
      return killSpawners(h, ids, () => progressOf(h, q, o.id) >= (o.required ?? 1), `${key}: ${o.required} of ${o.spawnTag}`);
    }
    case 'event':
      break;
    default:
      ensure(false, `${key}: objective type ${o.type}`);
  }
  const ev = target[0]!;
  const group = GREYFEN_GROUP_OBJECTIVES.find((g) => g.quest === q && g.objective === o.id);
  if (group) return killSpawners(h, group.groups, () => objDone(h, q, o.id), key, () => flag(h, group.seen));
  if (ev === 'dialogue.ended') {
    const unread = arr(match.npcId).filter((n) => !trail.talks.some((t) => t.npc === n));
    ensure(unread.length > 0, `${key}: an unread note`);
    return useProp(h, trail, `use:${unread[0]}`);
  }
  if (ev === 'interact') {
    const ids = arr(match.interactableId);
    const next = ids.find((id) => {
      const p = GREYFEN_PROPS.find((x) => x.interactableId === id);
      return !(p?.usedFlag && flag(h, p.usedFlag));
    });
    ensure(next, `${key}: an unused prop`);
    return useProp(h, trail, next);
  }
  if (ev === 'flag.changed') {
    const k = String(match.key);
    const prop = GREYFEN_PROPS.find((p) => p.usedFlag === k);
    const bridge = /bridge\.(\d)\.down/.exec(k);
    const id = prop?.interactableId ?? (bridge ? `use:greyfen-bridge-${bridge[1]}-near` : undefined);
    ensure(id, `${key}: a prop that sets ${k}`);
    return useProp(h, trail, id);
  }
  if (ev === 'dive.started') return diveTo(h, trail, null, String(match.volumeId));
  if (ev === 'dive.surfaced') {
    if (match.pocketId) return diveTo(h, trail, String(match.pocketId));
    // M24: back up from the horn to the pool's entry.
    const route = GREYFEN_DIVE_ROUTES.find((r) => r.volumeId === match.volumeId);
    ensure(route, `${key}: a route in ${String(match.volumeId)}`);
    const f = h.ctx.player.feet;
    const near = Math.min(...route.points.map((p) => Math.hypot(p.x - f.x, p.y - f.y, p.z - f.z)));
    ensure(near < 3, `${key}: in the water by the route (${near.toFixed(1)} m off)`);
    const log = await diveAlong(h, [f.clone(), ...[...route.points].reverse()], DIVE_TUNING.swimSpeed);
    trail.scripted.push(`dive ${route.id} back to the entry: ${log.metres.toFixed(0)} m, least breath ${log.minBreath.toFixed(1)} s`);
    await h.teleport(route.entryStand, 30);
    return;
  }
  if (ev === 'ferry.arrived') return rideFerryFrom(h, trail, 'reedgate', 'mere');
  ensure(false, `${key}: a driver (event ${ev})`);
}

/** Boards at `from`'s stop and rides to `to` through the ferry service, waiting for the arrival. */
async function rideFerryFrom(h: ChapterHarness, trail: PhaseCTrail, from: string, to: string): Promise<void> {
  const ferry = h.ctx.services.get('ferry') as unknown as { ride(a: string, b: string): unknown; riding?: boolean };
  ensure(ferry, 'the ferry service');
  const before = h.of('ferry.arrived').length;
  const boarded = h.of('ferry.boarded').length;
  // The stop menu (K15) hears its keys on the browser window, which a headless game has none of: unhook it, so the stop's
  // F boards its default leg (K7's own behaviour without the menu; from Reedgate the only leg is the Mere).
  // The menu is not put back: the K15 HUD hook takes a function this driver never sees, and the chain rides once.
  (ferry as { setMenu?(m: null): void }).setMenu?.(null);
  await pressAt(h, `ferry:${from}`);
  await h.runAsync(4);
  await h.runAsync(4);
  ensure(h.of('ferry.boarded').length > boarded, `the F at ferry:${from} boarded`);
  trail.scripted.push(`ferry ${from} to ${to}: boarded by F without the stop menu`);
  const leg = h.of('ferry.boarded').at(-1);
  ensure(leg?.from === from && leg.to === to, `boarded ${from} to ${to} (${JSON.stringify(leg)})`);
  for (let i = 0; i < 1200 && h.of('ferry.arrived').length === before; i++) await h.runAsync(30);
  ensure(h.of('ferry.arrived').length > before, `the ferry from ${from} arrived (boarded ${JSON.stringify(h.of('ferry.boarded'))}, input ${h.ctx.input.contexts.top()}, feet ${h.ctx.player.feet.toArray().map((v) => v.toFixed(0))})`);
  await h.runAsync(10);
}

/** Plays one Greyfen quest from its giver's offer to its hand-in. */
export async function playGreyfenQuest(h: ChapterHarness, trail: PhaseCTrail, q: string, c: GreyfenChoices = GREYFEN_RUN_A): Promise<void> {
  const quests = qs(h);
  if (quests.state(q) === 'inactive') {
    const giver = (PHASE_E_GIVERS as Record<string, string>)[q];
    // R13 is offered on the giver's second line, M26 on the first (K12's dialogue).
    await talkTo(h, trail, giver, q === 'r13' ? [2] : []);
    ensure(quests.state(q) === 'active', `${q} offered by ${giver} (${describeQuest(h, q)})`);
  }
  for (let guard = 0; guard < 80 && quests.state(q) === 'active'; guard++) {
    const cur = quests.objectives(q).find((v) => v.current && !v.done);
    if (!cur) {
      await h.runAsync(10);
      continue;
    }
    const before = describeQuest(h, q);
    await playObjective(h, trail, q, cur.def, c);
    await h.runAsync(4);
    trail.order.push(`${q}.${cur.def.id}`);
    // A multi-step objective (soundings, notes, nets) advances its progress; a step that moves nothing is stuck.
    if (describeQuest(h, q) === before && quests.state(q) === 'active') await h.runAsync(60);
    ensure(describeQuest(h, q) !== before || quests.state(q) !== 'active', `${q}.${cur.def.id} advanced (${before})`);
  }
  readOpen(h, trail, 'scene');
  ensure(quests.state(q) === 'completed', `${q} completed (${describeQuest(h, q)})`);
}

/** Run B takes the other branch of each choice (R12 cut, R14 released). */
export const GREYFEN_RUN_B: GreyfenChoices = { r12: 'cut', r14: 'released' };

/** Plays the nine Greyfen quests in plan 2.1's order on a booted run, one trail each; lets the card's wait settle. */
export async function playGreyfenChain(
  h: ChapterHarness, order: readonly string[], c: GreyfenChoices,
): Promise<Record<string, PhaseCTrail>> {
  const trails: Record<string, PhaseCTrail> = {};
  for (const q of order) {
    trails[q] = { talks: [], scripted: [], order: [] };
    await playGreyfenQuest(h, trails[q], q, c);
  }
  // The peaks card waits behind any dialogue or modal: read what the game still has open, then give it a few seconds.
  // The HUD's widgets update on the render frame, which a headless game never draws: call the layer's frame update as the
  // render loop would, half a second at a time.
  const hud = h.ctx.hud as unknown as { update?(frameTime: number): void };
  // Anything still open after D05's hand-in is read into a trail of its own, never measured.
  const after: PhaseCTrail = { talks: [], scripted: [], order: [] };
  for (let i = 0; i < 10; i++) {
    readOpen(h, after, 'scene-after');
    await h.runAsync(30);
    hud.update?.(0.5);
  }
  return trails;
}
