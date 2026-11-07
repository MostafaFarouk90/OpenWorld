/**
 * Phase I (the Rim, M47 to M52 with R26 and R29) played headless on phaseGDriver.ts's tools (N12 PR 1). The same rules as
 * Phases G and H: dialogue by key presses with the run's choices, props and notes by F with them in focus, quest groups fought
 * as the player through the damage service (run B offers the Spare and the Release first), escorts followed at the lead's
 * shoulder. The Rim's own steps are played the way N10's director reads them:
 * - M47: the hairpin is a trigger; the winch a prop; the first sight a scene; the Rim Camp waystone held F to rekindle.
 * - M48: each vent's wheel turned, then the channel's far lip entered (a Surge crossing and a crust walk count the same);
 *   the levers pressed; the roar sat through.
 * - M49: the signal fire, the arrival scene, each won House's banner raised, the rise scene, the war table pressed and read.
 * - R26: the master's road (run A fast, run B long), the crates loaded, the convoy followed: the ambushes fought on the fast
 *   road, the brakes set and the 30 s storm walls waited at the long road's halts; the arrival scene; the crates unloaded.
 * - R29: each part carried by the shipped carry kit to the gong frame, the gong hung, struck in Ansgar's count on the beat.
 * - M50: in each chamber the three sluice wheels turned in the chart's order before the gauge fills.
 * - M51: the horn-stone at the camp opens the quest; the dragons are spoken to by their talk props on the terraces.
 * - M52: Wystan's brief and war post, the stairs scene, the start point; the waves held from the gate's lee (the foes march on
 *   it), the household guard, the holds scene, the wounded companion (by their companion tree), Wystan.
 * What has no cheap driver is named in `trail.scripted`.
 */
import type { ChapterHarness } from './chapterHarness';
import { carryTo, ensure } from './phaseA';
import {
  fightGroups, followEscort, holdGround, playBeat, readOpen, whereIs, ensureSpace, playQuest, pressAt, sitThrough, tick, useProp, waitFor,
  type DriverTable, type Handler, type PhaseGRun,
} from './phaseGDriver';
import { WAYSTONE_TUNING } from '../waystones/tuning';
import { RIM_A5_GROUPS } from '../quests/content/act5/rim/director/tables';
import { M47_HAIRPIN_TRIGGER, M47_WINCH, RIM_CAMP_WAYSTONE } from '../quests/content/act5/rim/m47.quest';
import { M48_CHAN_TRIGGER, M48_WHEEL } from '../quests/content/act5/rim/m48.quest';
import { DELEGATE_FLAG, M49_BANNER, M49_BANNER_RAISED, M49_HOUSES, M49_TABLE } from '../quests/content/act5/rim/m49.quest';
import { R26_AMBUSH_ARM, R26_AT_HALT, R26_BRAKE, R26_BRAKED, R26_CHOICE, R26_FAST, R26_LONG, R26_WAITED } from '../quests/content/act5/rim/r26.quest';
import { R29_HANG, R29_STRIKE } from '../quests/content/act5/rim/r29.quest';
import { RIM_A5_CARRY } from '../quests/content/act5/rim/carry';
import { M50_CHAMBER_TRIGGER, M50_ORDER, M50_WHEEL, type M50Channel } from '../quests/content/act5/rim/m50.quest';
import { M51_REPORT, M51_TALK, TERRACES_WAYSTONE, type M51Dragon } from '../quests/content/act5/rim/m51.quest';
import { M51_HORN } from '../quests/content/act5/rim/director/camp';
import { M52_START_TRIGGER } from '../quests/content/act5/rim/m52.quest';
import { SIEGE_POINTS } from '../caldera/calderaSites';
import { AELFREDA_COMPANION_DIALOGUE } from '../companions/aelfreda';
import { heightAt } from '../terrain/heightfield';
import { ACT5_PHASE_I } from '../quests/act5Jump';

export type PhaseIQuest = (typeof ACT5_PHASE_I)[number];
/** Plan 2.1's recommended order (ACT5_PHASE_I); M52 last. */
export const PHASE_I_ORDER: readonly string[] = ACT5_PHASE_I;

export interface PhaseIChoices {
  /** R26's road: run A the fast road (the shorter branch, measured), run B the long safe road (coverage). */
  r26: 'fast' | 'long';
}
export const PHASE_I_RUN_A: PhaseIChoices = { r26: R26_FAST };
export const PHASE_I_RUN_B: PhaseIChoices = { r26: R26_LONG };

export interface PhaseIRun extends PhaseGRun { ic: PhaseIChoices }
/** Run B's mercy on the Rim: the Spare (Warhost scouts) and the Release (stoker wraiths). */
export const PHASE_I_MERCY_B: ReadonlySet<string> = new Set(['spare', 'release']);

/** The givers the driver talks to for the offer (M47 starts by itself; M51 is offered by the horn-stone). */
export const PHASE_I_GIVERS: Readonly<Record<string, string>> = {
  m48: 'alric', m49: 'hrolf', r26: 'merrin', r29: 'ansgar', m50: 'alric', m52: 'wystan',
};

const flag = (h: ChapterHarness, k: string) => h.ctx.state.getBool(k);
const qs = (h: ChapterHarness) => h.ctx.services.require('quests');
const done = (r: PhaseGRun, q: string, o: string) => () => qs(r.h).objectiveDone(q, o);

/** Enters a trigger sphere and waits for the step. */
const trigger = (id: string): Handler => async (r, q, o) => {
  await r.h.enterTrigger(id);
  await waitFor(r, done(r, q, o.id), `${q}.${o.id}`, 20);
};
/** Presses a prop and waits for the step. */
const prop = (id: string, seconds = 20): Handler => async (r, q, o) => {
  await useProp(r, id);
  await waitFor(r, done(r, q, o.id), `${q}.${o.id}`, seconds);
};
const scene: Handler = async (r, q, o) => sitThrough(r, done(r, q, o.id), `${q}.${o.id}`);
const rekindle = (waystoneId: string): Handler => async (r, q, o) => {
  await pressAt(r.h, `waystone:${waystoneId}`, WAYSTONE_TUNING.rekindleHoldSeconds + 0.2);
  await waitFor(r, done(r, q, o.id), `${q}.${o.id}`, 10);
};

// ---- M48 ---------------------------------------------------------------------------------------------------------------
/** A crossing: the far lip's trigger entered (N10 counts a crust walk and a Surge leap the same). */
const crossing = (n: number): Handler => async (r, q, o) => {
  await r.h.enterTrigger(M48_CHAN_TRIGGER(n));
  await waitFor(r, done(r, q, o.id), `${q}.${o.id}`, 20);
  r.trail.scripted.push(`m48 channel ${n}: crossed by entering the far lip's trigger (no Leap or crust walk played)`);
};

// ---- M49 ---------------------------------------------------------------------------------------------------------------
const banners: Handler = async (r, q, o) => {
  const { h } = r;
  const won = M49_HOUSES.filter((x) => h.ctx.state.getString(DELEGATE_FLAG(x)) === 'won');
  for (const b of won.length ? won : (['camp'] as const)) if (!flag(h, M49_BANNER_RAISED(b))) await useProp(r, M49_BANNER(b));
  await waitFor(r, done(r, q, o.id), `${q}.${o.id}`, 20);
};
const warTable: Handler = async (r, q, o) => {
  await useProp(r, M49_TABLE);
  await waitFor(r, done(r, q, o.id), `${q}.${o.id}`, 60);
};

// ---- R26 ---------------------------------------------------------------------------------------------------------------
const ambush = (n: 1 | 2): Handler => async (r, q, o) => {
  const { h } = r;
  await followEscort(r, () => flag(h, R26_AMBUSH_ARM(n)) || qs(h).objectiveDone(q, o.id), `${q}.${o.id} (to the ambush)`);
  const g = RIM_A5_GROUPS.find((x) => x.quest === q && x.objective === o.id)!;
  if (!qs(h).objectiveDone(q, o.id)) await fightGroups(r, g.groups, done(r, q, o.id), `${q}.${o.id}`, () => flag(h, g.seen));
};
const brake = (n: 1 | 2): Handler => async (r, q, o) => {
  const { h } = r;
  await followEscort(r, () => flag(h, R26_AT_HALT(n)) || qs(h).objectiveDone(q, o.id), `${q}.${o.id} (to the halt)`);
  if (!flag(h, R26_BRAKED(n))) await useProp(r, R26_BRAKE(n));
  await waitFor(r, done(r, q, o.id), `${q}.${o.id}`, 20);
};
/** A halt step is current from the load on (N10's `when`): follow the column to the halt, set the brake there, wait out the wall. */
const halt = (n: 1 | 2): Handler => async (r, q, o) => {
  const { h } = r;
  await followEscort(r, () => flag(h, R26_AT_HALT(n)) || qs(h).objectiveDone(q, o.id), `${q}.${o.id} (to the halt)`, 2700);
  if (!qs(h).objectiveDone(q, o.id) && !flag(h, R26_BRAKED(n))) await useProp(r, R26_BRAKE(n));
  await waitFor(r, () => flag(h, R26_WAITED(n)) || qs(h).objectiveDone(q, o.id), `${q}.${o.id}: the 30 s storm wall`, 90);
  await waitFor(r, done(r, q, o.id), `${q}.${o.id}`, 10);
};

// ---- R29 ---------------------------------------------------------------------------------------------------------------
const carryPart = (n: 1 | 2 | 3): Handler => async (r, q, o) => {
  const item = RIM_A5_CARRY.find((c) => c.objectiveId === `carry${n}`);
  ensure(item, `r29 carry${n}: the part`);
  await carryTo(r.h, item.homeAnchor, item.destination, item.deliveredFlag);
  await waitFor(r, done(r, q, o.id), `${q}.${o.id}`, 20);
};

// ---- M50 ---------------------------------------------------------------------------------------------------------------
const channel = (c: M50Channel): Handler => async (r, q, o) => {
  const { h } = r;
  for (let tries = 0; tries < 3 && !qs(h).objectiveDone(q, o.id); tries++) {
    await h.enterTrigger(M50_CHAMBER_TRIGGER(c));
    for (const w of M50_ORDER[c]) await useProp(r, M50_WHEEL(c, w));
    await tick(r, 30, `${q}.${o.id}`);
  }
  await waitFor(r, done(r, q, o.id), `${q}.${o.id}`, 20);
};

// ---- M52 ---------------------------------------------------------------------------------------------------------------
/**
 * A siege step: Cael holds at the gate line's lee (14 m behind the gate) and fights whatever comes within reach of the gate,
 * the court and the stairs' upper leg, until the step is done. No orders are given (each order is a one-press dialogue; the
 * driver lets N4's defaults stand) and the ram is fought as it comes.
 */
/** The reach the siege steps fight at from the gate's lee: the gate line, the court and the stairs' top. */
export const SIEGE_REACH_M = 60;
const siegeStep: Handler = async (r, q, o) => {
  const { h } = r;
  const [x, z] = SIEGE_POINTS.lee;
  const f = h.ctx.player.feet;
  if (Math.hypot(f.x - x, f.z - z) > 30) await h.approach({ x, y: heightAt(x, z), z }, 1);
  // the foes march on the gate line and wear it (N4 2c83867, src/siege/march.ts): Cael fights what comes within reach of the lee
  await holdGround(r, done(r, q, o.id), `${q}.${o.id}`, SIEGE_REACH_M, 900);
};

/**
 * The wounded companion at the aid tent: a joined companion is spoken to through their companion tree (talks.ts names it:
 * Aelfreda's is `npc-aelfreda-companion`; her plain `npc-aelfreda` is the Act 1 priory tree, which would offer D01).
 */
const wounded = (c: 'hrolf' | 'aelfreda' | 'tobb'): Handler => async (r, q, o) => {
  const { h } = r;
  const tree = c === 'aelfreda' ? AELFREDA_COMPANION_DIALOGUE : `npc-${c}`;
  await ensureSpace(h, whereIs(h, c));
  await h.approach(whereIs(h, c), 1.6);
  ensure(h.ctx.services.require('dialogue').start(tree, c), `${q}.${o.id}: ${tree} opened`);
  readOpen(r, c);
  await h.runAsync(2);
  await waitFor(r, done(r, q, o.id), `${q}.${o.id}`, 10);
};

// ---- M51 ---------------------------------------------------------------------------------------------------------------
const dragon = (d: M51Dragon): Handler => prop(M51_TALK(d), 60);

const HANDLERS: Record<string, Handler> = {
  'm47.hairpin': trigger(M47_HAIRPIN_TRIGGER),
  'm47.winch': prop(M47_WINCH),
  'm47.sight': scene,
  'm47.stone': rekindle(RIM_CAMP_WAYSTONE),
  ...Object.fromEntries([1, 2, 3, 4].map((v) => [`m48.vent${v}`, prop(M48_WHEEL(v))])),
  ...Object.fromEntries([1, 2, 3, 4, 5, 6].map((n) => [`m48.chan${n}`, crossing(n)])),
  'm48.roar': scene,
  'm49.arrive': scene,
  'm49.banners': banners,
  'm49.rise': scene,
  'm49.table': warTable,
  'r26.ambush1': ambush(1),
  'r26.ambush2': ambush(2),
  'r26.brake1': brake(1),
  'r26.halt1': halt(1),
  'r26.brake2': brake(2),
  'r26.halt2': halt(2),
  'r26.road': async (r, q, o) => followEscort(r, done(r, q, o.id), `${q}.${o.id}`, 2700),
  'r26.in': scene,
  'r29.hang': prop(R29_HANG),
  'r29.carry1': carryPart(1),
  'r29.carry2': carryPart(2),
  'r29.carry3': carryPart(3),
  'r29.strike': async (r, q, o) => playBeat(r, R29_STRIKE, 1, done(r, q, o.id), `${q}.${o.id}`),
  'r29.sound': scene,
  'm50.chan1': channel(1),
  'm50.chan2': channel(2),
  'm50.chan3': channel(3),
  'm50.cool': scene,
  'm51.stone': rekindle(TERRACES_WAYSTONE),
  'm51.landed': scene,
  'm51.ysmeryth': dragon('ysmeryth'),
  'm51.orsk': dragon('orsk'),
  'm51.hathren': dragon('hathren'),
  'm51.fires': scene,
  'm51.report': prop(M51_REPORT, 60),
  'm52.stairs': scene,
  'm52.start': trigger(M52_START_TRIGGER),
  'm52.wave1': siegeStep,
  'm52.wave2': siegeStep,
  'm52.wave3': siegeStep,
  'm52.guard': siegeStep,
  'm52.wave4': siegeStep,
  'm52.holds': scene,
  'm52.wounded-hrolf': wounded('hrolf'),
  'm52.wounded-aelfreda': wounded('aelfreda'),
  'm52.wounded-tobb': wounded('tobb'),
};

export const PHASE_I_TABLE: DriverTable = { handlers: HANDLERS, groups: RIM_A5_GROUPS };

/** The flags the run wants its dialogue choices to write. */
export function wantedFlagsI(c: PhaseIChoices): Record<string, unknown> {
  return { [R26_CHOICE]: c.r26 };
}

/** Plays one Phase I quest: M47 starts by itself, M51 is offered by the horn-stone, the rest by their giver. */
export async function playPhaseIQuest(r: PhaseIRun, q: string): Promise<void> {
  const { h } = r;
  if (q === 'm51' && qs(h).state('m51') === 'inactive') {
    await useProp(r, M51_HORN);
    for (let i = 0; i < 20 && qs(h).state('m51') === 'inactive'; i++) await tick(r, 30, 'm51 call');
  }
  await playQuest(r, q, PHASE_I_TABLE, ['m47'], PHASE_I_GIVERS);
}
