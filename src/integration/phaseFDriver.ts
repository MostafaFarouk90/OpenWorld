/**
 * The lower Dragonspine and summit quests played headless on a fixture-booted game (Phase F, K16 PR 2). The same recipe as the
 * Greyfen's (phaseEDriver.ts): dialogue by key presses, props, notes and rubbings by F with their own interactable in focus (held
 * where the game holds), quest groups killed as the player through the damage service, the sleds, the candle bundle and the eggs
 * taken by F and walked along their K4 carry routes a step at a time, the waystones held. The directors credit the reach steps
 * (the trailhead, the ledges, the gate, the hearth) on distance, so the player is moved onto the anchors they read.
 * What has no cheap headless driver is named in `trail.scripted`; the e2e tests allow only the known ones.
 *
 * The recipe follows K13's rig autoplay (dragonspine/ and summit/director/autoplay.testkit.ts) and its real-game run
 * (plans/act3-K13-pr2-realgame.md).
 */
import * as THREE from 'three';
import type { ChapterHarness } from './chapterHarness';
import { describeQuest, ensure, heal } from './phaseA';
import type { PhaseCTrail } from './phaseC';
import {
  ensureSpace, flag, ipos, killSpawners, objDone, pressAt, progressOf, readOpen, talkTo, useProp as useNow, waitFor,
} from './phaseEDriver';
import type { ObjectiveDef } from '../quests/types';
import { DRAGONSPINE_GROUP_OBJECTIVES } from '../quests/content/act3/dragonspine/groups';
import { SUMMIT_GROUP_OBJECTIVES } from '../quests/content/act3/summit/groups';
import { DRAGONSPINE_PROPS } from '../quests/content/act3/dragonspine/props';
import { SUMMIT_PROPS } from '../quests/content/act3/summit/props';
import { R15_DELIVER_RADIUS, routeById } from '../quests/content/act3/dragonspine/director/climb';
import { R15_SLEDS, R15_SLED_FLAGS } from '../quests/content/act3/dragonspine/r15.quest';
import { R17_LEG_ROUTES } from '../quests/content/act3/dragonspine/director/candles';
import { R18_EGG_PROPS, R18_NEST_PROPS, R18_NEST_FLAGS } from '../quests/content/act3/dragonspine/r18.quest';
import { ARENA, TRIAL_ID } from '../quests/content/act3/summit/director/trial';
import { M31_CHOICE } from '../quests/content/act3/summit/m31.quest';
import { M32_TALK } from '../quests/content/act3/summit/m32.quest';
import { D06_SKARL_OUTCOME } from '../quests/content/act3/summit/d06.quest';
import { SKARL_KIND } from '../bosses/skarl/tuning';
/** The D06 launch at the chasm lip (K7's glide id for K4's `dragonspine.glide.summit-aerie.launch`). */
const D06_GLIDE = 'glide:summit-aerie';
import { YIELD_HOLD_SECONDS } from '../hud/act3/YieldPrompt';
import { FLIGHT_FROM } from '../quests/content/act3/summit/director/net';
import { LEDGE as D06_LEDGE } from '../quests/content/act3/summit/director/aerie';
import { LEDGE_ANCHOR } from '../quests/content/act3/summit/director/oath';
import { LAST_ANVIL, WAYSIDE, WYRMS_HEARTH } from '../shrine/act3/tuning';
import { WAYSTONE_TUNING } from '../waystones/tuning';
import { heightAt } from '../terrain/heightfield';
import { ACT3_SPINE, ACT3_SUMMIT } from '../quests/act3Jump';

type Vec3Like = { x: number; y: number; z: number };

/** Uses a prop once it is registered (quest props register a few times a second after their quest begins). */
async function useProp(h: ChapterHarness, trail: PhaseCTrail, id: string, holdS = 0): Promise<void> {
  for (let i = 0; i < 12 && !ipos(h, id); i++) await h.runAsync(10);
  return useNow(h, trail, id, holdS);
}
const arr = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : v === undefined ? [] : [String(v)]);
const qs = (h: ChapterHarness) => h.ctx.services.require('quests');
const feetStr = (h: ChapterHarness) => h.ctx.player.feet.toArray().map((v) => v.toFixed(0)).join(',');

/** The branch each run takes. */
export interface SpineChoices {
  r15: 'lodge' | 'hut';
  r16: 'give' | 'keep';
  m31: 'won' | 'yielded';
  d06: 'spared' | 'defeated';
}
export const SPINE_RUN_A: SpineChoices = { r15: 'lodge', r16: 'give', m31: 'won', d06: 'spared' };
export const SPINE_RUN_B: SpineChoices = { r15: 'hut', r16: 'keep', m31: 'yielded', d06: 'defeated' };

/** The lower Dragonspine and the summit in the jump's (and the fixtures') order. */
export const PHASE_F_LOWER = ACT3_SPINE;
export const PHASE_F_SUMMIT = ACT3_SUMMIT;
/** Thorgar offers R15 and R18 together: the job is picked on his first line. */
const OFFER_PICKS: Record<string, number[]> = { r15: [1], r18: [2] };

/** The anchor a reach step's director measures, and how close to stand (inside its radius). */
const REACH_AT: Record<string, { anchor: string; dist: number; onTop?: boolean }> = {
  'm28.trailhead': { anchor: 'dragonspine.m28.trailhead', dist: 4 },
  'm28.ledge1': { anchor: 'dragonspine.m28.leap.1', dist: 0.6, onTop: true },
  'm28.ledge2': { anchor: 'dragonspine.m28.leap.2', dist: 0.6, onTop: true },
  'r16.mouth': { anchor: 'dragonspine.cave.mouth', dist: 4 },
  'm31.gate': { anchor: 'dragonspine.summit-gate', dist: 6 },
  'm31.ledge1': { anchor: 'dragonspine.roost.leap.1', dist: 0.6, onTop: true },
  'm31.ledge2': { anchor: 'dragonspine.roost.leap.2', dist: 0.6, onTop: true },
  'm31.ledge3': { anchor: 'dragonspine.roost.leap.3', dist: 0.6, onTop: true },
  'm31.hearth': { anchor: 'dragonspine.hearth.eadgyth', dist: 6 },
  'm34.ledge': { anchor: LEDGE_ANCHOR, dist: 3 },
};

/** Where a scene the director offers on distance is waited for. */
const SCENE_AT: Record<string, string> = {
  'm31.before': ARENA,
  'd06.lip': D06_LEDGE,
};

/** Dialogue picks per objective (a talk or a scene with a choice), by run. */
function picks(q: string, o: string, c: SpineChoices): number[] {
  if (q === 'r15' && o === 'choice') return [c.r15 === 'lodge' ? 1 : 2];
  if (q === 'r16' && o === 'choice') return [c.r16 === 'give' ? 1 : 2];
  return [];
}

/** Talks to `npc`; Ysmeryth is spoken to through her talk prompt at the Hearth (K13's `use:ysmeryth-talk`), not as an NPC. */
async function talkNpc(h: ChapterHarness, trail: PhaseCTrail, npc: string, choices: number[] = []): Promise<void> {
  if (npc !== 'ysmeryth') return talkTo(h, trail, npc, choices);
  for (let i = 0; i < 12 && !ipos(h, M32_TALK); i++) await h.runAsync(10);
  const p = ipos(h, M32_TALK);
  ensure(p, `Ysmeryth's talk prompt`);
  await pressAt(h, M32_TALK);
  await h.runAsync(2);
  readOpen(h, trail, 'ysmeryth', choices);
  heal(h);
}

/** Stands on an anchor (on its top when it is a ledge). */
async function standOn(h: ChapterHarness, anchor: string, dist: number, onTop = false): Promise<void> {
  const a = h.anchor(anchor);
  await ensureSpace(h, a);
  if (onTop) await h.teleport({ x: a.x, y: a.y + 0.05, z: a.z }, 10);
  else await h.approach(a, dist);
}

/**
 * Walks `points` a step at a time, ticking the time each step takes at `mps` (so a carried thing follows and the carry reset
 * sees a walk, never a jump). Returns the metres walked.
 */
export async function walkAlong(h: ChapterHarness, points: readonly Vec3Like[], mps: number, stepM = 1.5, stop?: () => boolean): Promise<number> {
  let metres = 0;
  const ticksPerStep = Math.max(1, Math.round((stepM / mps) * 60));
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len < 0.01) continue;
    const yaw = Math.atan2(-(b.x - a.x), -(b.z - a.z));
    for (let s = Math.min(stepM, len); ; s = Math.min(s + stepM, len)) {
      const t = s / len;
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      const y = Math.max(a.y + (b.y - a.y) * t, heightAt(x, z)) + 0.05;
      h.ctx.player.teleport({ x, y, z }, yaw);
      await h.runAsync(ticksPerStep);
      heal(h);
      if (stop?.()) return metres + s;
      if (s >= len) break;
    }
    metres += len;
  }
  return metres;
}

interface CarryLike { heldSled: string | null }
const carry = (h: ChapterHarness) => h.ctx.services.get('carry') as unknown as CarryLike | undefined;
const sledIid = (id: string) => `sled:${id.replace(/^sled\./, '').replace(/\./g, '-')}`;

/** R15: each sled taken by F at the shed, dragged along its route at the haul pace, and let go by F at the cache. */
async function haulSleds(h: ChapterHarness, trail: PhaseCTrail, q: string, o: ObjectiveDef): Promise<void> {
  let metres = 0;
  let drops = 0;
  for (let n = 0; n < R15_SLEDS.length && !objDone(h, q, o.id); n++) {
    if (flag(h, R15_SLED_FLAGS[n]!)) continue;
    const id = R15_SLEDS[n]!;
    const route = routeById(id);
    ensure(route, `a carry route ${id}`);
    await pressAt(h, sledIid(id));
    ensure(carry(h)?.heldSled === id, `${id} taken (held ${carry(h)?.heldSled})`);
    const end = route.checkpoints.at(-1)!;
    // Checkpoint by checkpoint; a hawk's stoop that lands drops the sled (K7), and the player takes it up again where it fell.
    for (let i = 1; i < route.checkpoints.length; i++) {
      for (let tries = 0; ; tries++) {
        ensure(tries < 20, `${id}: dropped twenty times before checkpoint ${i}`);
        metres += await walkAlong(h, [h.ctx.player.feet.clone(), route.checkpoints[i]!], 4.5 * 0.6, 1.5, () => carry(h)?.heldSled !== id);
        if (carry(h)?.heldSled === id) break;
        drops++;
        await h.runAsync(30);
        await pressAt(h, sledIid(id));
        ensure(carry(h)?.heldSled === id, `${id} taken again (held ${carry(h)?.heldSled}; feet ${feetStr(h)})`);
      }
    }
    ensure(Math.hypot(h.ctx.player.feet.x - end.x, h.ctx.player.feet.z - end.z) <= R15_DELIVER_RADIUS, `${id}: at the cache`);
    await pressAt(h, sledIid(id));
    h.run(4);
    ensure(carry(h)?.heldSled === null, `${id} let go`);
    await h.runAsync(6);
    ensure(flag(h, R15_SLED_FLAGS[n]!), `${id} delivered`);
  }
  trail.scripted.push(`r15 sleds: hauled ${metres.toFixed(0)} m along K4's routes, ${drops} dropped by a stoop and taken up again`);
}

/** R17: the bundle taken at the Anvil and carried down past 3, 2, 1 then up past 4, 5, 6, each shrine lit by F. */
async function lightWayside(h: ChapterHarness, trail: PhaseCTrail, n: number): Promise<void> {
  const leg = n <= 3 && !flag(h, WAYSIDE.flag(1)) ? 'down' : 'up';
  const route = routeById(R17_LEG_ROUTES[leg]);
  ensure(route, `the candle route ${leg}`);
  const at = h.anchor(WAYSIDE.anchor(n));
  // Along the route to its checkpoint nearest the shrine.
  const f = h.ctx.player.feet;
  const cps = route.checkpoints;
  const near = (p: Vec3Like) => cps.reduce((b, c, i) => (Math.hypot(c.x - p.x, c.z - p.z) < Math.hypot(cps[b]!.x - p.x, cps[b]!.z - p.z) ? i : b), 0);
  const from = near(f);
  const to = near(at);
  const path = from <= to ? cps.slice(from, to + 1) : cps.slice(to, from + 1).reverse();
  const metres = await walkAlong(h, [f.clone(), ...path, at], 4.5);
  trail.scripted.push(`r17 shrine ${n}: carried ${metres.toFixed(0)} m along ${R17_LEG_ROUTES[leg]}`);
  await useProp(h, trail, `use:r17-wayside-${n}`);
}

/** R18: each egg taken at the camp and carried up its route to its nest. */
async function nestEggs(h: ChapterHarness, trail: PhaseCTrail, q: string, o: ObjectiveDef): Promise<void> {
  let metres = 0;
  for (let i = 0; i < 3 && !objDone(h, q, o.id); i++) {
    if (flag(h, R18_NEST_FLAGS[i]!)) continue;
    await useProp(h, trail, R18_EGG_PROPS[i]!);
    const route = routeById(`egg.r18.${i + 1}`);
    ensure(route, `the egg route ${i + 1}`);
    const nest = ipos(h, R18_NEST_PROPS[i]!);
    ensure(nest, `a nest ${R18_NEST_PROPS[i]}`);
    metres += await walkAlong(h, [h.ctx.player.feet.clone(), ...route.checkpoints.slice(1)], 4.5);
    await useProp(h, trail, R18_NEST_PROPS[i]!);
    ensure(flag(h, R18_NEST_FLAGS[i]!), `egg ${i + 1} nested (feet ${feetStr(h)})`);
  }
  trail.scripted.push(`r18 eggs: carried ${metres.toFixed(0)} m along K4's routes`);
}

/** A prop that writes `key` (K13's props, or K9's three Anvil steps). */
function propFor(key: string): string | undefined {
  const p = [...DRAGONSPINE_PROPS, ...SUMMIT_PROPS].find((x) => x.usedFlag === key);
  if (p) return p.interactableId;
  const step = LAST_ANVIL.steps.find((s) => s.flag === key);
  return step ? `use:last-anvil-${step.id}` : undefined;
}

interface TrialsLike { state(): { id: string; player?: number; opponent?: number } | null; canYield(): boolean }
interface FoeLike { id: string; kind: string; dead?: boolean; hittable?: boolean; untargetable?: boolean; invulnerable?: boolean; health?: number }

/**
 * Lands Cael's blow on `kind` whenever the game lets it land (the damage service refuses an untouchable target), every half
 * second, healing Cael between, until `done()`. The bosses and the trial's dragon fly or stand out of a sword's reach between
 * rounds, so the blows go through the damage service as the player's (K13's real run did the same).
 */
async function blowsUntil(h: ChapterHarness, kind: string, amount: number, done: () => boolean, maxS: number, each?: () => Promise<void> | void): Promise<number> {
  let hits = 0;
  for (let i = 0; i < maxS * 2 && !done(); i++) {
    await h.runAsync(30);
    heal(h);
    await each?.();
    if (done()) break;
    const foe = [...h.ctx.actors.all()].find((a) => a.kind === kind) as FoeLike | undefined;
    if (!foe || foe.dead || foe.hittable === false || foe.untargetable || foe.invulnerable) continue;
    const r = h.ctx.damage.apply({
      attackerId: h.ctx.player.actor.id, targetId: foe.id, amount, poise: amount, kind: 'melee', direction: new THREE.Vector3(0, 0, -1),
    });
    if (r && (r as { dealt?: number }).dealt) hits++;
  }
  return hits;
}

/** M31's trial at the roost: Cael breaks her three times (won), or twice and then holds T on K15's prompt (yielded). */
async function playTrial(h: ChapterHarness, trail: PhaseCTrail, q: string, o: ObjectiveDef, c: SpineChoices): Promise<void> {
  await standOn(h, ARENA, 6);
  const trials = () => h.ctx.services.get('trials') as unknown as TrialsLike | undefined;
  const t0 = h.clock.ms;
  for (let i = 0; i < 60 && trials()?.state()?.id !== TRIAL_ID; i++) await h.runAsync(30);
  ensure(trials()?.state()?.id === TRIAL_ID, `${q}.${o.id}: the trial began (feet ${feetStr(h)})`);
  const breaks = () => h.of('trial.break').filter((b) => b.trialId === TRIAL_ID && b.by === 'player').length;
  let held = 0;
  const hits = await blowsUntil(h, 'ysmeryth', 1e5, () => !!h.ctx.state.getString(M31_CHOICE), 600, async () => {
    if (c.m31 === 'yielded' && trials()?.canYield()) {
      h.hold('KeyT', YIELD_HOLD_SECONDS + 0.3);
      held++;
      await h.runAsync(2);
    }
  });
  const got = h.ctx.state.getString(M31_CHOICE);
  ensure(got === c.m31, `${q}.${o.id}: the trial ended ${c.m31} (got ${got}; ${breaks()} breaks, ${hits} blows)`);
  trail.scripted.push(`m31 trial: ${c.m31} after ${breaks()} breaks, ${hits} blows through the damage service${held ? ', T held on the yield prompt' : ''}, ${((h.clock.ms - t0) / 1000).toFixed(0)} s`);
  await waitFor(h, () => objDone(h, q, o.id), `${q}.${o.id}`, 10, trail);
}

/** D06's glide from the chasm lip: F at the launch, then the flight flown by the game until it lands on the Aerie's shelf. */
async function glideToAerie(h: ChapterHarness, trail: PhaseCTrail, q: string, o: ObjectiveDef): Promise<void> {
  const from = h.ctx.player.feet.clone();
  await pressAt(h, D06_GLIDE);
  const t0 = h.clock.ms;
  await waitFor(h, () => objDone(h, q, o.id) || h.of('glide.landed').length > 0, `${q}.${o.id}: the glide landed`, 240);
  const at = h.of('glide.landed').at(-1)?.at ?? h.ctx.player.feet;
  const metres = Math.hypot(at.x - from.x, at.z - from.z);
  await waitFor(h, () => objDone(h, q, o.id), `${q}.${o.id} credited (landed at ${Math.round(at.x)},${Math.round(at.z)})`, 10);
  trail.scripted.push(`d06 glide: flown by the game, ${metres.toFixed(0)} m in ${((h.clock.ms - t0) / 1000).toFixed(0)} s`);
}

/** Skarl at the Aerie: blows through the damage service whenever he can be hit; spared by T held in his release window, or beaten. */
async function fightSkarl(h: ChapterHarness, trail: PhaseCTrail, q: string, o: ObjectiveDef, c: SpineChoices): Promise<void> {
  const out = () => h.ctx.state.getString(D06_SKARL_OUTCOME);
  const t0 = h.clock.ms;
  for (let i = 0; i < 120 && !h.of('boss.started').some((b) => b.bossId === 'corvin-skarl'); i++) {
    const s = h.ctx.anchors.find('dragonspine.aerie.arena.centre');
    if (s) await h.approach(s.position, 4);
    await h.runAsync(30);
    heal(h);
  }
  ensure(h.of('boss.started').some((b) => b.bossId === 'corvin-skarl'), `${q}.${o.id}: Skarl's fight began (feet ${feetStr(h)})`);
  let windows = 0;
  const hits = await blowsUntil(h, SKARL_KIND, 120, () => !!out(), 900, async () => {
    const open = h.of('boss.releaseWindow').filter((w) => w.bossId === 'corvin-skarl').at(-1)?.open === true;
    if (!open || c.d06 !== 'spared') return;
    windows++;
    const sk = [...h.ctx.actors.all()].find((a) => a.kind === SKARL_KIND);
    if (sk?.root) await h.approach(sk.root.getWorldPosition(new THREE.Vector3()), 1.6);
    h.hold('KeyT', 2);
    await h.runAsync(2);
  });
  ensure(out() === c.d06, `${q}.${o.id}: Skarl ${c.d06} (got ${out()}; ${hits} blows, ${windows} windows)`);
  trail.scripted.push(`skarl: ${c.d06} after ${hits} blows of 120 through the damage service${c.d06 === 'spared' ? ', T held in the release window' : ''}, ${((h.clock.ms - t0) / 1000).toFixed(0)} s`);
  await waitFor(h, () => objDone(h, q, o.id), `${q}.${o.id}`, 20, trail);
}

type Handler = (h: ChapterHarness, trail: PhaseCTrail, q: string, o: ObjectiveDef, c: SpineChoices) => Promise<void>;

const HANDLERS: Record<string, Handler> = {
  'm28.view': async (h, trail, q, o) => {
    await standOn(h, 'dragonspine.m28.crag', 10);
    await waitFor(h, () => objDone(h, q, o.id), `${q}.${o.id}`, 30, trail);
  },
  'r15.hauls': async (h, trail, q, o) => haulSleds(h, trail, q, o),
  'r18.nested': async (h, trail, q, o) => nestEggs(h, trail, q, o),
  'm30.rekindle': async (h, trail, q, o) => {
    await pressAt(h, `waystone:${LAST_ANVIL.id}`, WAYSTONE_TUNING.rekindleHoldSeconds + 0.2);
    await h.runAsync(4);
    readOpen(h, trail, `scene-${q}.${o.id}`);
    await waitFor(h, () => objDone(h, q, o.id), `${q}.${o.id}`, 30, trail);
  },
  'm30.rubbings': async (h, trail, q, o) => {
    for (let n = 1; n <= LAST_ANVIL.rubbingIds.length && !objDone(h, q, o.id); n++) {
      await useProp(h, trail, `use:anvil-rubbing-${n}`, LAST_ANVIL.rubbingHoldSeconds + 0.3);
    }
  },
  'm34.rekindle': async (h, trail, q, o) => {
    await pressAt(h, `waystone:${WYRMS_HEARTH.id}`, WAYSTONE_TUNING.rekindleHoldSeconds + 0.2);
    await h.runAsync(4);
    readOpen(h, trail, `scene-${q}.${o.id}`);
    await waitFor(h, () => objDone(h, q, o.id), `${q}.${o.id}`, 30, trail);
  },
  'm31.trial': async (h, trail, q, o, c) => playTrial(h, trail, q, o, c),
  'd06.land': async (h, trail, q, o) => glideToAerie(h, trail, q, o),
  'd06.skarl': async (h, trail, q, o, c) => fightSkarl(h, trail, q, o, c),
  'm33.flight': async (h, trail, q, o) => {
    await standOn(h, FLIGHT_FROM, 20);
    await waitFor(h, () => objDone(h, q, o.id), `${q}.${o.id}`, 40, trail);
  },
};

/** One current objective of a Phase F quest, played. Exported for the dev runner and the special drivers (the trial, the glide, Skarl). */
export async function playSpineObjective(
  h: ChapterHarness, trail: PhaseCTrail, q: string, o: ObjectiveDef, c: SpineChoices, extra: Record<string, Handler> = {},
): Promise<void> {
  const key = `${q}.${o.id}`;
  readOpen(h, trail, `scene-${key}`, picks(q, o.id, c));
  for (let i = 0; i < 7200 && h.ctx.input.contexts.top() === 'cutscene'; i += 30) {
    await h.runAsync(30);
    readOpen(h, trail, `scene-${key}`, picks(q, o.id, c));
  }
  await h.runAsync(2);
  if (objDone(h, q, o.id)) return;
  const target = arr(o.target);
  const match = (o.match ?? {}) as Record<string, unknown>;
  const handler = extra[key] ?? HANDLERS[key];
  if (handler) return handler(h, trail, q, o, c);
  const reach = REACH_AT[key];
  if (reach) {
    await standOn(h, reach.anchor, reach.dist, reach.onTop);
    return waitFor(h, () => objDone(h, q, o.id), `${key} at ${reach.anchor} (feet ${feetStr(h)})`, 5);
  }
  switch (o.type) {
    case 'talk': {
      const npc = target[0]!;
      if (npc.startsWith('scene.')) {
        const at = SCENE_AT[key];
        if (at) await standOn(h, at, 6);
        const dialogue = h.ctx.services.require('dialogue');
        for (let i = 0; i < 120 && !dialogue.active && !objDone(h, q, o.id); i++) {
          await h.runAsync(30);
          heal(h);
        }
        if (objDone(h, q, o.id)) return;
        ensure(dialogue.active, `${key}: the scene opened`);
        readOpen(h, trail, `scene-${npc.slice(6)}`, picks(q, o.id, c));
        return;
      }
      return talkNpc(h, trail, npc, picks(q, o.id, c));
    }
    case 'interact':
      return useProp(h, trail, target[0]!);
    case 'event':
      break;
    default:
      ensure(false, `${key}: objective type ${o.type}`);
  }
  const ev = target[0]!;
  const group = [...DRAGONSPINE_GROUP_OBJECTIVES, ...SUMMIT_GROUP_OBJECTIVES].find((g) => g.quest === q && g.objective === o.id);
  if (group) return killSpawners(h, group.groups, () => objDone(h, q, o.id), key, () => flag(h, group.seen));
  if (ev === 'dialogue.ended') {
    const unread = arr(match.npcId).filter((n) => !trail.talks.some((t) => t.npc === n));
    ensure(unread.length > 0, `${key}: an unread note`);
    return useProp(h, trail, `use:${unread[0]}`);
  }
  if (ev === 'interact') {
    const ids = arr(match.interactableId);
    const done = progressOf(h, q, o.id);
    const next = ids[done] ?? ids[0];
    return useProp(h, trail, next!);
  }
  if (ev === 'flag.changed') {
    const id = propFor(String(match.key));
    ensure(id, `${key}: a prop that sets ${String(match.key)}`);
    return useProp(h, trail, id);
  }
  if (ev === 'wayside.lit') return lightWayside(h, trail, Number(match.index));
  ensure(false, `${key}: a driver (event ${ev})`);
}

/** Plays one Phase F quest from its giver's offer to its hand-in. */
export async function playSpineQuest(
  h: ChapterHarness, trail: PhaseCTrail, q: string, c: SpineChoices, extra: Record<string, Handler> = {},
): Promise<void> {
  const quests = qs(h);
  if (quests.state(q) === 'inactive') {
    const first = quests.objectives(q)[0]?.def;
    ensure(first?.type === 'talk', `${q}: offered by a talk`);
    await talkNpc(h, trail, arr(first.target)[0]!, OFFER_PICKS[q] ?? []);
    ensure(quests.state(q) === 'active', `${q} offered by ${String(first.target)} (${describeQuest(h, q)})`);
  }
  for (let guard = 0; guard < 80 && quests.state(q) === 'active'; guard++) {
    const cur = quests.objectives(q).find((v) => v.current && !v.done);
    if (!cur) {
      await h.runAsync(10);
      continue;
    }
    const before = describeQuest(h, q);
    await playSpineObjective(h, trail, q, cur.def, c, extra);
    await h.runAsync(4);
    trail.order.push(`${q}.${cur.def.id}`);
    if (describeQuest(h, q) === before && quests.state(q) === 'active') await h.runAsync(60);
    ensure(describeQuest(h, q) !== before || quests.state(q) !== 'active', `${q}.${cur.def.id} advanced (${before}; feet ${feetStr(h)})`);
  }
  readOpen(h, trail, 'scene');
  ensure(quests.state(q) === 'completed', `${q} completed (${describeQuest(h, q)})`);
}

