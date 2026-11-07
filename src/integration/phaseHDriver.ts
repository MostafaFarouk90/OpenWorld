/**
 * Phase H (the Ashen Waste, M42 to M46, R24, R25, D08) played headless on phaseGDriver.ts's tools (L13 PR 2). The same rules:
 * dialogue by key presses with the run's choices, props and notes by F with them in focus, quest groups fought as the player
 * through the damage service (run B offers the Spare and the Release first), escorts followed at the lead's shoulder. The
 * Waste's own steps are played the way the director reads them:
 * - M42: the gate arch and the camp edge are trigger spheres (entered); each shelter's flap is pulled and the 20 s wall
 *   waited out standing inside the shelter.
 * - M43: the Storm Walk is walked knot to knot along the rope with the two lee waits, and the count bar struck on the beat; the
 *   Pyre Rite is the Blightblooms burned with the camp torch (run A) or the three wraiths released at their pyres (run B); the
 *   Spear-Dance is won by breaks on the trial service (R19's bout).
 * - R24: the casks loaded, the cart followed, the brake set at each storm shelter and the 40 s waited, Wulfhild's choice.
 * - M45: the Glasslands entered, the chime phrases struck on the strike stone with the attack keys on the beat (the puzzle's
 *   own widen and assist rules stand if a strike misses), Ulthred's voice sat through.
 * - D08: L11's real-game path (Leofric, the door, the narthex's knights, the notes) and the real fight by L6's
 *   `winEormenForTest`, run A defeating him and run B releasing him.
 * - M46: at each cairn the wave set held from the barricade, the outriders, the rim scene.
 * What has no cheap driver is named in `trail.scripted`.
 */
import type { ChapterHarness } from './chapterHarness';
import { ensure } from './phaseA';
import {
  aliveIn, ensureSpace, fightGroups, followEscort, holdGround, playBeat, playQuest, sitThrough, talkTo, tick, useProp, waitFor,
  type DriverTable, type Handler, type PhaseGRun,
} from './phaseGDriver';
import { WASTE_A4_GROUPS } from '../quests/content/act4/waste/director/tables';
import { W } from '../quests/content/act4/waste/ids';
import { L1 } from '../quests/content/act4/waste/siteIds';
import { SHELTER_SPOTS } from '../region/act4/ropeLines';
import { heightAt } from '../terrain/heightfield';
import { M42_CAMP_TRIGGER, M42_FLAP, M42_GATE_TRIGGER, M42_SHELTERS } from '../quests/content/act4/waste/m42.quest';
import {
  M43_BLOOM, M43_COUNT, M43_DANCE_TRIAL, M43_DONE, M43_KNOT, M43_KNOTS, M43_LEE_DONE, M43_LEES, M43_PYRE_GROUP, M43_PYRE_RESTED,
  M43_TORCH,
} from '../quests/content/act4/waste/m43.quest';
import { LEE_RADIUS } from '../quests/content/act4/waste/director/crossing';
import { R24_BRAKE, R24_CHOICE, R24_WAITED, type R24Way } from '../quests/content/act4/waste/r24.quest';
import { M43_TORCH_LIT, R24_AT_SHELTER } from '../quests/content/act4/waste/props';
import { M45_MET_TRIGGER, SHRINE_LIT } from '../quests/content/act4/waste/m45.quest';
import { CATHEDRAL_ID } from '../quests/content/act4/waste/d08.quest';
import { M46_HELD } from '../quests/content/act4/waste/m46.quest';
import { M46_WAVE_START_M } from '../quests/content/act4/waste/director/road';
import { HUSK_CATHEDRAL_DOOR_ID, HUSK_CATHEDRAL_OUTSIDE } from '../waste/interiors/huskCathedral';
import { winEormenForTest } from '../bosses/act4/eormen/testing';
import { ARENA } from '../bosses/act4/eormen/tuning';
import { CHIME_PHRASES, CHIME_PHRASE_FLAG, CHIME_FAILS_FLAG, CHIME_TUNING } from '../waste/chime/phrases';
import { GEAR_TUNING } from '../gear/tuning';
import { stepMsAt } from '../waste/chime/chimePuzzle';
import { ACT4_PHASE_H } from '../quests/act4Jump';

export type PhaseHQuest = (typeof ACT4_PHASE_H)[number];
/** Plan 2.3's order as ACT4_PHASE_H lists it (R25 before R24, D08 before M46); the run asserts M46 is offered last. */
export const PHASE_H_ORDER: readonly PhaseHQuest[] = ACT4_PHASE_H;

export interface PhaseHChoices {
  r24: R24Way;
  eormen: 'released' | 'defeated';
  /** the Pyre Rite: the Blightblooms burned (no fight) or the three wraiths released at their pyres */
  pyres: 'burn' | 'release';
}
export const PHASE_H_RUN_A: PhaseHChoices = { r24: 'all', eormen: 'defeated', pyres: 'burn' };
export const PHASE_H_RUN_B: PhaseHChoices = { r24: 'half', eormen: 'released', pyres: 'release' };

export interface PhaseHRun extends PhaseGRun { hc: PhaseHChoices }
/** Run B's mercy in the Waste: the Spare (any Footman left) and the Release (wraiths, husks, Husk Knights). */
export const PHASE_H_MERCY_B: ReadonlySet<string> = new Set(['spare', 'release']);

const flag = (h: ChapterHarness, k: string) => h.ctx.state.getBool(k);
const qs = (h: ChapterHarness) => h.ctx.services.require('quests');
const objDone = (h: ChapterHarness, q: string, o: string) => qs(h).objectiveDone(q, o);
const done = (r: PhaseGRun, q: string, o: string) => () => objDone(r.h, q, o);
const asH = (r: PhaseGRun): PhaseHRun => r as PhaseHRun;

/** Stands on an anchor (into its space), at `radius` metres. */
async function at(r: PhaseGRun, anchor: string, radius = 1.5): Promise<void> {
  const a = r.h.anchor(anchor);
  await ensureSpace(r.h, a);
  await r.h.approach(a, radius);
}

/** Enters a trigger sphere (the way the player crosses it) and waits for the step. */
const trigger = (id: string): Handler => async (r, q, o) => {
  await r.h.enterTrigger(id);
  await waitFor(r, done(r, q, o.id), `${q}.${o.id}`, 20);
};

// ---- M42 ---------------------------------------------------------------------------------------------------------------
const shelter = (n: number): Handler => async (r, q, o) => {
  await useProp(r, M42_FLAP(n));
  const s = SHELTER_SPOTS.find((x) => x.id === M42_SHELTERS[n - 1]);
  ensure(s, `the shelter ${M42_SHELTERS[n - 1]}`);
  await r.h.teleport({ x: s.at.x, y: heightAt(s.at.x, s.at.z) + 0.05, z: s.at.z }, 2);
  // the 20 s wall runs only while Cael stays inside: no stepping out to fight
  for (let i = 0; i < 80 && !objDone(r.h, q, o.id); i++) await tick(r, 30, `${q}.${o.id}`);
  ensure(objDone(r.h, q, o.id), `${q}.${o.id}: the wall passed in the shelter`);
};

// ---- M43 ---------------------------------------------------------------------------------------------------------------
const stormWalk: Handler = async (r, q, o) => {
  const { h } = r;
  await at(r, L1.stormWalkStart, 1);
  await waitFor(r, () => flag(h, 'story.m43.walking') || flag(h, M43_DONE.walk), 'm43 walk started', 10);
  for (let n = 1; n <= M43_KNOTS; n++) {
    await at(r, L1.stormWalkKnot(n), 1.5);
    await waitFor(r, () => h.ctx.state.getNumber(M43_KNOT) >= n, `m43 knot ${n}`, 10);
    if ((M43_LEES as readonly number[]).includes(n)) {
      // the lee: stay within its radius until the wall has passed
      await h.approach(h.anchor(L1.stormWalkKnot(n)), Math.min(1.5, LEE_RADIUS - 1));
      await waitFor(r, () => flag(h, M43_LEE_DONE(n)), `m43 lee ${n}`, 40);
    }
  }
  await playBeat(r, M43_COUNT, 1, done(r, q, o.id), `${q}.${o.id} (the count)`);
  r.trail.scripted.push('m43 Storm Walk: walked knot to knot by teleport along the rope (the lees waited out in full)');
};

const pyres: Handler = async (r, q, o) => {
  const { h } = r;
  if (asH(r).hc.pyres === 'burn') {
    if (!flag(h, M43_TORCH_LIT)) await useProp(r, M43_TORCH);
    for (const n of [1, 2, 3]) if (!flag(h, M43_PYRE_RESTED(n))) await useProp(r, M43_BLOOM(n));
  } else {
    // each pyre's wraith released beside its pyre (a kill only makes it rise again in 8 s)
    for (const n of [1, 2, 3]) {
      for (let i = 0; i < 40 && !flag(h, M43_PYRE_RESTED(n)); i++) {
        await at(r, L1.pyre(n), 2);
        await tick(r, 30, `m43 pyre ${n}`);
        const [id] = aliveIn(h, [M43_PYRE_GROUP(n)]);
        const a = id ? h.ctx.actors.get(id) : undefined;
        if (!a) continue;
        await fightGroups(r, [M43_PYRE_GROUP(n)], () => flag(h, M43_PYRE_RESTED(n)) || aliveIn(h, [M43_PYRE_GROUP(n)]).length === 0, `m43 pyre ${n}`);
      }
      if (!flag(h, M43_PYRE_RESTED(n))) {
        // the Release did not take (no Burn, or the wraith died): the bloom lays it to rest
        r.trail.scripted.push(`m43 pyre ${n}: not released, its bloom burned`);
        if (!flag(h, M43_TORCH_LIT)) await useProp(r, M43_TORCH);
        await useProp(r, M43_BLOOM(n));
      }
    }
  }
  await waitFor(r, done(r, q, o.id), `${q}.${o.id}`, 20);
};

const dance: Handler = async (r, q, o) => {
  const { h } = r;
  const t0 = h.clock.ms;
  let blows = 0;
  let asks = 0;
  const running = () => !!h.ctx.services.get('trials')?.state();
  for (let i = 0; i < 600 && !objDone(h, q, o.id); i++) {
    await tick(r, 20, `${q}.${o.id}`);
    // no bout after Hrodna's "Into the ring?": ask her again (finding: the first ask lands before her talk step is done)
    if (!running() && i % 15 === 14 && asks < 4) {
      asks++;
      await talkTo(r, 'hrodna');
      const note = `m43 Spear-Dance: no bout after the first "Now."; asked Hrodna again (${asks})`;
      r.trail.scripted.push(note);
      if (!r.watch.notes.includes('m43 dance re-ask')) r.watch.notes.push('m43 dance re-ask');
    }
    const trial = h.ctx.services.get('trials')?.state() as { id?: string; opponentId?: string } | null | undefined;
    if (!trial || (trial.id && trial.id !== M43_DANCE_TRIAL)) continue;
    const opp = trial.opponentId ?? aliveIn(h, ['m43.dance'])[0];
    if (!opp) continue;
    h.ctx.damage.apply({ attackerId: h.ctx.player.actor.id, targetId: opp, amount: 1e5, poise: 1e5, kind: 'melee' });
    blows++;
  }
  ensure(objDone(h, q, o.id), `${q}.${o.id}: the Spear-Dance won (${blows} blows)`);
  r.trail.scripted.push(`m43 Spear-Dance: won in ${blows} breaks through the damage service, ${((h.clock.ms - t0) / 1000).toFixed(0)} s`);
};

// ---- R24 ---------------------------------------------------------------------------------------------------------------
const brake = (n: 1 | 2): Handler => async (r, q, o) => {
  const { h } = r;
  await followEscort(r, () => flag(h, R24_AT_SHELTER(n)) || objDone(h, q, o.id), `${q}.${o.id} (to the shelter)`);
  if (!objDone(h, q, o.id)) await useProp(r, R24_BRAKE(n));
  await waitFor(r, () => flag(h, R24_WAITED(n)), `${q}.${o.id}: the 40 s storm`, 90);
  await waitFor(r, done(r, q, o.id), `${q}.${o.id}`, 10);
};

// ---- M45 ---------------------------------------------------------------------------------------------------------------
/** One chime phrase: the first press starts it (a one-beat count-in), then each strike on its step with its key. */
async function strikePhrase(r: PhaseGRun): Promise<void> {
  const { h } = r;
  const n = Math.min(CHIME_PHRASES.length - 1, Math.floor(h.ctx.state.getNumber(CHIME_PHRASE_FLAG)));
  const ph = CHIME_PHRASES[n]!;
  const stepMs = stepMsAt(CHIME_TUNING.bpm, CHIME_TUNING.divisions);
  const press = (code: string) => { h.key('keydown', code); h.run(1); h.key('keyup', code); };
  const t0 = h.clock.ms;
  press('Digit1');
  const countIn = GEAR_TUNING.rhythm.countInSteps;
  for (let k = 0; k < ph.steps.length; k++) {
    const when = t0 + (countIn + ph.steps[k]!) * stepMs;
    while (h.clock.ms + 1000 / 60 < when) h.run(1);
    press(`Digit${ph.keys[k]}`);
  }
  // past the bar's end and any replay of a failed phrase
  while (h.clock.ms < t0 + (countIn + 16 + 2) * stepMs) h.run(1);
  h.run(12);
}

const chime: Handler = async (r, q, o) => {
  const { h } = r;
  await at(r, L1.strike, 1);
  let phrases = 0;
  for (; phrases < 16 && !flag(h, SHRINE_LIT); phrases++) {
    const before = h.ctx.state.getNumber(CHIME_PHRASE_FLAG);
    await strikePhrase(r);
    if (h.ctx.state.getNumber(CHIME_PHRASE_FLAG) === before) {
      // a failed phrase replays its plaque (16 steps after a one-beat lead) before the next press counts
      await h.runAsync(Math.ceil(((16 + CHIME_TUNING.leadSteps + 2) * stepMsAt()) / (1000 / 60)));
    }
    heal(h);
  }
  ensure(flag(h, SHRINE_LIT), `${q}.${o.id}: the shrine lit (${phrases} phrases, fails ${h.ctx.state.getNumber(CHIME_FAILS_FLAG)})`);
  r.trail.scripted.push(`m45 chime: ${phrases} phrases struck on the beat with the attack keys`);
  await waitFor(r, done(r, q, o.id), `${q}.${o.id}`, 20);
};

function heal(h: ChapterHarness): void {
  const p = h.ctx.player.actor;
  if (!p.dead) p.health = p.maxHealth;
}

// ---- D08 ---------------------------------------------------------------------------------------------------------------
const enterCathedral: Handler = async (r, q, o) => {
  const { h } = r;
  await h.approach(h.anchor(HUSK_CATHEDRAL_OUTSIDE), 1.5);
  const interiors = h.ctx.services.require('interiors');
  let ok = false;
  void interiors.enter(CATHEDRAL_ID, HUSK_CATHEDRAL_DOOR_ID).then(() => { ok = true; });
  for (let i = 0; i < 40 && !ok; i++) await h.runAsync(15);
  ensure(ok, 'the cathedral door opened');
  await waitFor(r, done(r, q, o.id), `${q}.${o.id}`, 10);
};

const eormen: Handler = async (r, q, o) => {
  const { h } = r;
  await h.enterTrigger(ARENA.trigger);
  const res = winEormenForTest({ ctx: h.ctx, step: () => h.run(1) }, { outcome: asH(r).hc.eormen });
  r.trail.scripted.push(`d08 Eormen: ${res.outcome} through L6's winEormenForTest (gong only at each floor), ${res.seconds.toFixed(0)} s`);
  await waitFor(r, done(r, q, o.id), `${q}.${o.id}`, 30);
};

// ---- M46 ---------------------------------------------------------------------------------------------------------------
const cairnWave = (n: number): Handler => async (r, q, o) => {
  const { h } = r;
  await at(r, `${W}.m46.wave.${n}.barricade`, Math.min(6, M46_WAVE_START_M - 5));
  await holdGround(r, () => flag(h, M46_HELD(n)) || objDone(h, q, o.id), `${q}.${o.id}`, 60, 900);
  await waitFor(r, done(r, q, o.id), `${q}.${o.id}`, 10);
};

const rim: Handler = async (r, q, o) => {
  await at(r, `${W}.m46.rim`, 6);
  await sitThrough(r, done(r, q, o.id), `${q}.${o.id}`);
};

const HANDLERS: Record<string, Handler> = {
  'm42.gate': trigger(M42_GATE_TRIGGER),
  'm42.shelter1': shelter(1),
  'm42.shelter2': shelter(2),
  'm42.shelter3': shelter(3),
  'm42.shelter4': shelter(4),
  'm42.camp': trigger(M42_CAMP_TRIGGER),
  'm43.walk': stormWalk,
  'm43.pyres': pyres,
  'm43.dance': dance,
  'r24.brake1': brake(1),
  'r24.brake2': brake(2),
  // about 1.5 km at Brand's 1.5 m/s, with the real weather's storms halting it on the way: give it 45 minutes of game time
  'r24.arrive': async (r, q, o) => followEscort(r, done(r, q, o.id), `${q}.${o.id}`, 2700),
  'r24.choose': async (r, q, o) => {
    await talkTo(r, 'wulfhild');
    await waitFor(r, done(r, q, o.id), `${q}.${o.id}`, 10);
  },
  'm45.meet': trigger(M45_MET_TRIGGER),
  'm45.chime': chime,
  'm45.voice': async (r, q, o) => sitThrough(r, done(r, q, o.id), `${q}.${o.id}`),
  'd08.enter': enterCathedral,
  'd08.boss': eormen,
  'm46.wave1': cairnWave(1),
  'm46.wave2': cairnWave(2),
  'm46.wave3': cairnWave(3),
  'm46.rim': rim,
};

export const PHASE_H_TABLE: DriverTable = { handlers: HANDLERS, groups: WASTE_A4_GROUPS };

/** The flags and hub entries the run wants (merged into Phase G's `want`). */
export function wantedFlagsH(c: PhaseHChoices): Record<string, unknown> {
  return { [R24_CHOICE]: c.r24 };
}

/** Plays one Phase H quest; Wulfhild's errands hub is told which entry the quest is. */
export async function playPhaseHQuest(r: PhaseHRun, q: PhaseHQuest): Promise<void> {
  r.want[`choice:${q}`] = true;
  try {
    await playQuest(r, q, PHASE_H_TABLE);
  } finally {
    delete r.want[`choice:${q}`];
  }
}
