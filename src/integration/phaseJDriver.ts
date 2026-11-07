/**
 * Phase J (the Foundry and the Anvil: R27, R28, R30, M53, D09, M54, M55, D10, M56) played headless on phaseGDriver.ts's tools
 * (N12 PR 2), by Phase I's rules: dialogue by key presses with the run's choices, props and notes by F with them in focus,
 * quest groups fought as the player through the damage service (run B offers the Spare and the Release first). The Foundry's
 * own steps are played the way N11's director reads them:
 * - R27: Wenna, the tunnel entered, the captain, every shoring prop, lamp and charge, the three signs read, the captain again,
 *   the hold on N4's siege kit from inside the tunnel (the foes come down it), the choice at the far shoring.
 * - R28: each mourner named, the token carried to its pyre, the risen fought, the wood laid; the run's pyres lit with
 *   Heartshard fire (A one, B four, the design's worked playthroughs), the rite.
 * - R30: the ten allies' lines (Ysmeryth by her talk prop), the three pages, the camp anvil drummed on the beat, the verse.
 * - M53: Edric and Rook, the truce at the Inner Gate, F1's breakers fought, the gate's note, Edric's decision.
 * - D09: Alric, the Foundry entered, the patrol, the captive stoker, the plate, the sluices in the plate's order, the guards,
 *   the gallery, Vey on N6's `winVeyForTest` (run A strikes him down, run B spares him), the outcome scene.
 * - M54, M55, D10 and M56: the descent, the voice, the murals, the thralls; the parley, N6's hammer trial, the verdict; the
 *   adds, the vents, the marks, Ulthred on N6's `winUlthredForTest`; the disclosure, Ysmeryth, the company, the choice.
 * What has no cheap driver is named in `trail.scripted`.
 */
import type { ChapterHarness } from './chapterHarness';
import { carryTo, ensure } from './phaseA';
import {
  fightGroups, holdGround, playBeat, playQuest, readOpen, sitThrough, talkTo, tick, useProp, waitFor, whereIs, ensureSpace,
  type DriverTable, type Handler, type PhaseGRun,
} from './phaseGDriver';
import { FOUNDRY_A5_GROUPS } from '../quests/content/act5/foundry/director/tables';
import { FOUNDRY_A5_CARRY } from '../quests/content/act5/foundry/carry';
import { D09_WENNA_MET, R27_CHOICE, R28_LIT, R30_LINE, R30_VERSE } from '../quests/content/act5/foundry/flags';
import { R28_LAY, R28_LIGHT, R28_PYRE_NS, R28_MOURNER } from '../quests/content/act5/foundry/r28.quest';
import { R28_RITE_USE } from '../quests/content/act5/foundry/props';
import { R30_ALLIES, R30_ANVIL, R30_YSMERYTH_USE } from '../quests/content/act5/foundry/r30.quest';
import { M53_GATE_TRIGGER, M53_VEY } from '../quests/content/act5/foundry/m53.quest';
import { M54_APPROACH_TRIGGER, M54_VOICE } from '../quests/content/act5/foundry/m54.quest';
import { R27_CAPTAIN } from '../quests/content/act5/foundry/r27.quest';
import { AELFREDA_COMPANION_DIALOGUE } from '../companions/aelfreda';
import { D09_SLUICE_ORDER, D09_SLUICE_USE } from '../quests/content/act5/foundry/d09.quest';
import { M55_TRIAL_USE, M55_ULTHRED } from '../quests/content/act5/foundry/m55.quest';
import { ULTHRED_OUTCOME } from '../quests/content/act5/foundry/flags';
const ULTHRED_BOSS = 'ulthred';
import { D10_VENTS, D10_VENT_USE } from '../quests/content/act5/foundry/d10.quest';
import { M56_COMPANY_USE, M56_YSMERYTH_USE } from '../quests/content/act5/foundry/m56.quest';
import { M56_CHOICE_FLAG } from '../quests/content/act5/foundry/flags';
import { winVeyForTest } from '../bosses/act5/vey/testing';
import { INT_TRIGGER, STOKERS_TUNNEL_ID } from '../caldera/interiors/sites';
import { ARENA as VEY_ARENA, VEY_BOSS_ID } from '../bosses/act5/vey/tuning';
import { ACT5_PHASE_J } from '../quests/act5Jump';

/** Plan 2.1's order for Phase J: the Foundry's openers, M53, D09, then the descent to the ending. */
export const PHASE_J_ORDER: readonly string[] = ['r27', 'r28', 'r30', 'm53', 'd09', 'm54', 'm55', 'd10', 'm56'];
ensure(PHASE_J_ORDER.length === ACT5_PHASE_J.length && PHASE_J_ORDER.every((q) => ACT5_PHASE_J.includes(q)), 'PHASE_J_ORDER covers ACT5_PHASE_J');

export interface PhaseJChoices {
  r27: 'collapse' | 'keep';
  /** how many pyres are lit with Heartshard fire (design: marshal one, keepers four) */
  pyres: number;
  verse: 'gaut' | 'keepers' | 'houses' | 'walkers';
  vey: 'spared' | 'defeated';
  m56: 'rekindle' | 'let-it-die';
}
/** Run A, the marshal's squire: Vey struck down, one pyre, Rekindle. */
export const PHASE_J_RUN_A: PhaseJChoices = { r27: 'collapse', pyres: 1, verse: 'houses', vey: 'defeated', m56: 'rekindle' };
/** Run B, the keepers' friend: Vey spared, four pyres, Let It Die. */
export const PHASE_J_RUN_B: PhaseJChoices = { r27: 'keep', pyres: 4, verse: 'keepers', vey: 'spared', m56: 'let-it-die' };

export interface PhaseJRun extends PhaseGRun { jc: PhaseJChoices }

export const PHASE_J_GIVERS: Readonly<Record<string, string>> = {
  r27: 'wenna', r28: 'wulfhild', r30: 'tobb', m53: 'edric', d09: 'alric', m54: 'alric', m55: M55_ULTHRED, d10: 'alric', m56: 'alric',
};
/** Every Phase J quest is offered by a talk (Ulthred's greeting opens M55, Alric's words over the ash open M56). */
export const PHASE_J_AUTOSTART: readonly string[] = [];

export function wantedFlagsJ(c: PhaseJChoices): Record<string, unknown> {
  // M56's pick writes no flag on the line (the confirm's event does, through N11's director): it is named by its choice id
  return { [R27_CHOICE]: c.r27, [R30_VERSE]: c.verse, [M56_CHOICE_FLAG]: c.m56, [`choice:${c.m56}`]: true };
}

const flag = (h: ChapterHarness, k: string) => h.ctx.state.getBool(k);
const qs = (h: ChapterHarness) => h.ctx.services.require('quests');
const done = (r: PhaseGRun, q: string, o: string) => () => qs(r.h).objectiveDone(q, o);
const asJ = (r: PhaseGRun) => r as PhaseJRun;

const prop = (id: string, seconds = 20): Handler => async (r, q, o) => {
  await useProp(r, id);
  await waitFor(r, done(r, q, o.id), `${q}.${o.id}`, seconds);
};
const scene: Handler = async (r, q, o) => sitThrough(r, done(r, q, o.id), `${q}.${o.id}`);
/** A step a talk completes (a story flag written by a line): the NPC spoken to, then the step awaited. */
const talkStep = (npc: string, seconds = 20): Handler => async (r, q, o) => {
  await talkTo(r, npc);
  await waitFor(r, done(r, q, o.id), `${q}.${o.id}`, seconds);
};
/** A companion's own tree (Aelfreda's `npc-aelfreda` is the Act 1 priory tree, which offers D01). */
const companionTalk = async (r: PhaseGRun, c: string): Promise<void> => {
  const { h } = r;
  const tree = c === 'aelfreda' ? AELFREDA_COMPANION_DIALOGUE : `npc-${c}`;
  await ensureSpace(h, whereIs(h, c));
  await h.approach(whereIs(h, c), 1.6);
  ensure(h.ctx.services.require('dialogue').start(tree, c), `${tree} opened`);
  readOpen(r, c);
  await h.runAsync(2);
};

// ---- R27 -----------------------------------------------------------------------------------------------------------------
/** The hold: N4's siege kit runs the tunnel's waves once Cael is inside with the line set; he fights what comes down it. */
const r27Hold: Handler = async (r, q, o) => {
  // back to the tunnel's centre line: the props' stand-offs are outside its 5 m wide bounds, where the bounds rule takes
  // Cael out of the interior (and the director starts the siege only with Cael inside)
  await r.h.enterTrigger(`${INT_TRIGGER}.tunnel.hold`);
  await tick(r, 10, `${q}.${o.id}`);
  ensure(r.h.ctx.services.require('interiors').current === STOKERS_TUNNEL_ID, `${q}.${o.id}: Cael inside the tunnel`);
  // a Spare's stand-off beside a foe can put Cael's feet outside the tunnel's bounds, which takes him out of the interior
  // (and the waves wait for him): back to the hold mark whenever that happens
  let returns = 0;
  const backInside = async () => {
    if (r.h.ctx.services.require('interiors').current === STOKERS_TUNNEL_ID || done(r, q, o.id)()) return;
    returns++;
    await r.h.enterTrigger(`${INT_TRIGGER}.tunnel.hold`);
    await tick(r, 4, `${q}.${o.id}`);
  };
  await holdGround(r, done(r, q, o.id), `${q}.${o.id}`, 45, Number((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.R27_HOLD_S ?? 900), backInside);
  if (returns) r.trail.scripted.push(`r27 hold: back to the hold mark ${returns} times after a Spare's stand-off left the tunnel's bounds`);
};

// ---- R28 -----------------------------------------------------------------------------------------------------------------
const token = (n: number): Handler => async (r, q, o) => {
  const item = FOUNDRY_A5_CARRY.find((c) => c.objectiveId === `token${n}`);
  ensure(item, `r28 token${n}: the token`);
  await carryTo(r.h, item.homeAnchor, item.destination, item.deliveredFlag);
  await waitFor(r, done(r, q, o.id), `${q}.${o.id}`, 20);
};
const mourner = (n: number): Handler => async (r, q, o) => {
  await talkTo(r, R28_MOURNER(n));
  await waitFor(r, done(r, q, o.id), `${q}.${o.id}`, 10);
};
/** The rite: the run's pyres lit first (10 Burn each, refused over the cap), then the rite stone. */
const rite: Handler = async (r, q, o) => {
  const { h } = r;
  for (const n of R28_PYRE_NS.slice(0, asJ(r).jc.pyres)) if (!flag(h, R28_LIT(n))) await useProp(r, R28_LIGHT(n));
  await useProp(r, R28_RITE_USE);
  await waitFor(r, done(r, q, o.id), `${q}.${o.id}`, 60);
};

// ---- R30 -----------------------------------------------------------------------------------------------------------------
/** The ten allies' lines: each spoken to once (Ysmeryth by her talk prop on the terraces). */
const lines: Handler = async (r, q, o) => {
  const { h } = r;
  for (const a of R30_ALLIES) {
    if (flag(h, R30_LINE(a))) continue;
    if (a === 'ysmeryth') await useProp(r, R30_YSMERYTH_USE);
    else if (a === 'aelfreda') await companionTalk(r, a);
    else await talkTo(r, a);
    await tick(r, 4, `${q}.${o.id} ${a}`);
  }
  await waitFor(r, done(r, q, o.id), `${q}.${o.id}`, 20);
};
const tune: Handler = async (r, q, o) => playBeat(r, R30_ANVIL, 2, done(r, q, o.id), `${q}.${o.id}`);

// ---- D09 -----------------------------------------------------------------------------------------------------------------
const slag: Handler = async (r, q, o) => {
  for (const n of D09_SLUICE_ORDER) await useProp(r, D09_SLUICE_USE(n));
  await waitFor(r, done(r, q, o.id), `${q}.${o.id}`, 20);
};
const vey: Handler = async (r, q, o) => {
  const { h } = r;
  await ensureSpace(h, h.anchor(VEY_ARENA.centre));
  await h.approach(h.anchor(VEY_ARENA.centre), 4);
  let res: { seconds: number };
  try {
    res = winVeyForTest({ ctx: h.ctx, step: () => h.run(1) }, asJ(r).jc.vey);
  } catch (e) {
    // N6's helper strikes once just after the grace; on this save the strike lands before the window counts as past its
    // grace (held at 1 HP), so the helper gives up at 2 s. One more blow in the open window strikes him down, as in play.
    const st = h.ctx.bosses.state(VEY_BOSS_ID);
    if (asJ(r).jc.vey !== 'defeated' || !st?.releaseOpen || !/the outcome did not happen/.test((e as Error).message)) throw e;
    h.ctx.damage.apply({ attackerId: h.ctx.player.actor.id, targetId: st.actorId, amount: 1, poise: 0, kind: 'melee', attackId: '1H_Melee_Attack_Chop' });
    await waitFor(r, () => h.ctx.state.getFlag(`boss.${VEY_BOSS_ID}.outcome` as never) === 'defeated' && !h.ctx.bosses.state(VEY_BOSS_ID), 'd09 Vey struck down', 10);
    res = { seconds: 0 };
    r.trail.scripted.push('d09 Vey: N6 helper strike held at 1 HP; a second blow in the open window struck him down');
  }
  r.trail.scripted.push(`d09 Vey: ${asJ(r).jc.vey} through N6's winVeyForTest (bars chopped and broken by heavy blows), ${res.seconds.toFixed(0)} s`);
  await waitFor(r, done(r, q, o.id), `${q}.${o.id}`, 30);
};

// ---- M55, D10 (N6 PR 2's trial and Ulthred) -----------------------------------------------------------------------------
const trial: Handler = async (r, q, o) => {
  const { h } = r;
  if (!h.ctx.services.get('hammerTrial' as never)) {
    // N6 PR 2's hammer trial is not in this stack yet: N11's stand-in (its director takes the trial's own win event).
    h.ctx.events.emit('ulthred.trial.won' as never, {} as never);
    r.trail.scripted.push('m55 trial: N6 PR 2 not in the stack, ulthred.trial.won emitted (stand-in)');
  } else await useProp(r, M55_TRIAL_USE);
  await waitFor(r, done(r, q, o.id), `${q}.${o.id}`, 600);
};
const ulthred: Handler = async (r, q, o) => {
  const { h } = r;
  if (!h.ctx.bosses.state(ULTHRED_BOSS)) {
    // N6 PR 2's Ulthred is not in this stack yet: the outcome he writes and the event D10 listens for (stand-in).
    h.ctx.state.setFlag(ULTHRED_OUTCOME as never, 'defeated' as never);
    h.ctx.events.emit('boss.defeated' as never, { bossId: ULTHRED_BOSS } as never);
    r.trail.scripted.push('d10 Ulthred: N6 PR 2 not in the stack, boss.ulthred.outcome defeated + boss.defeated emitted (stand-in)');
  }
  await waitFor(r, done(r, q, o.id), `${q}.${o.id}`, 900);
};
const vents: Handler = async (r, q, o) => {
  for (const n of D10_VENTS) if (!flag(r.h, `story.d10.vent${n}`)) await useProp(r, D10_VENT_USE(n));
  await waitFor(r, done(r, q, o.id), `${q}.${o.id}`, 20);
};

/** D09's guards: on the Spy road (F1 not Confront) they are armed only after Wenna's word in the Foundry; then the pairs she
 * did not turn and the vat patrol are fought as a group step (none at all when she turned all four). */
const guards: Handler = async (r, q, o) => {
  const { h } = r;
  if (h.ctx.state.getString('story.m21.choice') !== 'confront' && !flag(h, D09_WENNA_MET)) await talkTo(r, 'wenna');
  const g = FOUNDRY_A5_GROUPS.find((x) => x.quest === q && x.objective === o.id)!;
  await fightGroups(r, g.groups, done(r, q, o.id), `${q}.${o.id}`, () => flag(h, g.seen));
};

const HANDLERS: Record<string, Handler> = {
  'd09.guards': guards,
  'r27.hold': r27Hold,
  'r27.choose': talkStep(R27_CAPTAIN),
  ...Object.fromEntries(R28_PYRE_NS.map((n) => [`r28.mourner${n}`, mourner(n)])),
  ...Object.fromEntries(R28_PYRE_NS.map((n) => [`r28.token${n}`, token(n)])),
  ...Object.fromEntries(R28_PYRE_NS.map((n) => [`r28.lay${n}`, prop(R28_LAY(n))])),
  'r28.rite': rite,
  'r30.lines': lines,
  'r30.tune': tune,
  'r30.verse': talkStep('tobb'),
  'r30.sing': async (r, q, o) => waitFor(r, done(r, q, o.id), `${q}.${o.id}`, 30),
  'm53.truce': async (r, q, o) => {
    await r.h.enterTrigger(M53_GATE_TRIGGER);
    await tick(r, 10, `${q}.${o.id}`);
    if (!qs(r.h).objectiveDone(q, o.id)) await talkTo(r, M53_VEY);
    await waitFor(r, done(r, q, o.id), `${q}.${o.id}`, 60);
  },
  'd09.slag': slag,
  'd09.vey': vey,
  'd09.after': talkStep('alric', 60),
  'm54.voice': async (r, q, o) => {
    await r.h.enterTrigger(M54_APPROACH_TRIGGER);
    await tick(r, 10, `${q}.${o.id}`);
    if (!qs(r.h).objectiveDone(q, o.id)) await talkTo(r, M54_VOICE);
    await waitFor(r, done(r, q, o.id), `${q}.${o.id}`, 60);
  },
  'm55.parley': talkStep(M55_ULTHRED, 60),
  'm55.trial': trial,
  'd10.vents': vents,
  'd10.ulthred': ulthred,
  'm56.told': talkStep('alric', 60),
  'm56.choice': talkStep('alric', 60),
  'm56.ysmeryth': prop(M56_YSMERYTH_USE, 60),
  'm56.company': prop(M56_COMPANY_USE, 60),
  'm56.after': scene,
};

export const PHASE_J_TABLE: DriverTable = { handlers: HANDLERS, groups: FOUNDRY_A5_GROUPS };

/** Plays one Phase J quest from its giver's offer to its hand-in. */
export async function playPhaseJQuest(r: PhaseJRun, q: string): Promise<void> {
  return playQuest(r, q, PHASE_J_TABLE, PHASE_J_AUTOSTART, PHASE_J_GIVERS);
}

// ---- the ending (N12's director: cutscene, title card, epilogue, credits, after) -------------------------------------------
export interface EndingTrail {
  steps: { step: string; atS: number }[];
  slidesRead: number;
  seconds: number;
}
interface EndingLike { readonly step: string; readonly log: readonly string[] }
interface ScreensLike { active(): boolean; advance?(): void; update?(dt: number): void }
/**
 * Sits through the ending as a player does: the cutscene and the card play out, each epilogue slide is read for 6 s and
 * advanced with F, the credits roll to their end hold and close on their own. Returns the step times.
 */
export async function playEnding(r: PhaseGRun, maxS = 1500): Promise<EndingTrail> {
  const { h } = r;
  const d = h.ctx.services.require('act5Ending' as never) as unknown as EndingLike;
  const screens = h.ctx.services.get('act5Screens' as never) as unknown as ScreensLike | undefined;
  const t0 = h.clock.ms;
  const steps: EndingTrail['steps'] = [];
  let last = '';
  let slides = 0;
  let shownFor = 0;
  for (let i = 0; i < maxS * 2 && d.step !== 'done'; i++) {
    await tick(r, 30, 'the ending');
    if (d.step !== last) {
      last = d.step;
      steps.push({ step: last, atS: (h.clock.ms - t0) / 1000 });
      shownFor = 0;
    }
    // The HUD's frame updates do not run headless: the credits roll gets the half second each loop step stands for.
    if (screens?.active() && d.step === 'credits') screens.update?.(0.5);
    if (screens?.active() && (d.step === 'epilogue' || d.step === 'card')) {
      shownFor += 0.5;
      if (shownFor >= 6) {
        // The screens listen on the page's keys, which the headless harness has none of: advance() is their headless F.
        if (screens.advance) screens.advance();
        else h.press('KeyF');
        if (d.step === 'epilogue') slides++;
        shownFor = 0;
      }
    }
  }
  ensure(d.step === 'done', `the ending played to its end (step ${d.step}, log ${d.log.join(' ')})`);
  return { steps, slidesRead: slides, seconds: (h.clock.ms - t0) / 1000 };
}
