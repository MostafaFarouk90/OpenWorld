// The Foundry block's PR 2 set pieces (plans/act5-N11.md section 5): M54's withdrawal of the rim quests, the voice in the
// walls and the murals; M55's hammer trial on N6's `hammerTrial` service; M56's favour snapshot, the farewell props, the
// choice confirm (every M56 flag written at once, the Scar count read at that moment) and the autosave hold N12 releases.
import type { Kit } from '../../../act4/harrowmark/director/shared';
import { recheck, toast } from '../../../act4/harrowmark/director/shared';
import { HAMMER_HALL_ID } from '../../../../../caldera/interiors/sites';
import {
  ANVIL_LIT_FLAG, LEFT_ON_RIM, M54_ENTERED, M54_MURALS_FLAG, M54_VOICE_SEEN, M55_TRIAL_PASSED, M56_CAEL_LIVES_FLAG, M56_CHOICE_FLAG,
  M56_CONFIRM_EVENT, M56_SCAR_BAND, M56_SCARS_FLAG, SCARS_MIRROR_FLAG,
} from '../flags';
import { M54_MURALS, M54_MURAL_NOTE, M54_VOICE } from '../m54.quest';
import { M55_TRIAL_USE } from '../m55.quest';
import { M56_COMPANY_USE, M56_YSMERYTH_USE } from '../m56.quest';
import { RIM_OPTIONAL } from '../readers';
import { caelLivesFor, scarBand } from '../scars';
import { LOG } from './generic';
import { endingKeepsakeFor } from '../../../../../items/act5/catalog';
import { playEndingTheme } from '../../../../../music/act5Cues';
import { ENDING_CUTSCENES, ENDING_SCENE_DEFS, ENDING_STRINGS } from '../../../../../scenes/act5/ending';

/** Tree ids the director opens. */
export const M54_VOICE_TREE = `npc-${M54_VOICE}`;
export const M56_COMPANY_TREE = 'npc-m56-company';
export const M56_COMPANY_NPC = 'm56-company';

export type M56Choice = 'rekindle' | 'let-it-die';

/** What the confirm writes, from the choice and the Scar count at that moment (pure, for the tests and N12's matrix). */
export function m56Outcome(choice: M56Choice, scars: number): { choice: M56Choice; caelLives: boolean; scars: number } {
  const n = Number.isFinite(scars) && scars > 0 ? Math.floor(scars) : 0;
  return { choice, caelLives: choice === 'let-it-die' ? true : caelLivesFor(n), scars: n };
}

const start = (k: Kit, tree: string, npc: string): void => {
  k.later(() => { if (!k.ctx.services.get('dialogue')?.start(tree, npc)) k.warn(`${LOG} ${tree} did not open`); });
};

// ---- M54 --------------------------------------------------------------------------------------------------------------------
export function installM54(k: Kit): void {
  // the descent withdraws whatever is still running on the rim (R28, R29, R30), quietly: a journal line, never a loud fail
  k.on('quest.started', (e) => {
    if (e.questId !== 'm54') return;
    const quests = k.ctx.services.get('quests');
    for (const q of RIM_OPTIONAL) {
      if (k.qstate(q) !== 'active') continue;
      k.set(LEFT_ON_RIM(q));
      quests?.fail(q);
      k.ctx.events.emit('hud.toast', { textKey: 'quest.m54.leftOnRim', params: { title: k.ctx.strings.t(`quest.${q}.title`) } });
    }
  });
  k.on('interior.entered', (e) => {
    if (e.interiorId === HAMMER_HALL_ID && k.active('m54') && !k.flag(M54_ENTERED)) k.set(M54_ENTERED);
  });
  // the voice speaks once Cael is below and the step is current (a load re-offers it the same way)
  let tried = -1e9;
  let ticks = 0;
  k.every(30, () => {
    ticks += 30;
    if (!k.active('m54') || !k.objCurrent('m54', 'voice') || k.flag(M54_VOICE_SEEN)) return;
    if (k.ctx.services.get('interiors')?.current !== HAMMER_HALL_ID || k.ctx.services.get('dialogue')?.active) return;
    if (ticks - tried < 600) return;
    tried = ticks;
    start(k, M54_VOICE_TREE, M54_VOICE);
  });
  // the murals: each read is remembered, all four write N9's codex flag
  const muralFlag = (n: number): string => `story.m54.mural.${n}`;
  k.on('dialogue.ended', (e) => {
    const n = M54_MURALS.find((m) => M54_MURAL_NOTE(m) === e.npcId);
    if (n === undefined || e.reason !== 'completed') return;
    k.set(muralFlag(n));
    if (!k.flag(M54_MURALS_FLAG) && M54_MURALS.every((m) => k.flag(muralFlag(m)))) {
      k.set(M54_MURALS_FLAG);
      k.later(() => recheck(k));
    }
  });
}

// ---- M55 --------------------------------------------------------------------------------------------------------------------
interface HammerTrial { start(): unknown; stop?(): unknown; readonly running?: boolean }
export function installM55(k: Kit): void {
  const trial = (): HammerTrial | undefined => (k.ctx.services as unknown as { get(id: string): HammerTrial | undefined }).get('hammerTrial');
  k.on('interact', (e) => {
    if (e.action !== 'interact' || e.interactableId !== M55_TRIAL_USE || !k.active('m55') || !k.objCurrent('m55', 'trial')) return;
    const t = trial();
    if (!t) { toast(k, 'quest.m55.noTrial'); k.warn(`${LOG} M55: no hammerTrial service`); return; }
    if (t.running) return;
    try { t.start(); toast(k, 'quest.m55.trialStart'); } catch (err) { k.warn(`${LOG} M55: the trial would not start: ${String(err)}`); }
  });
  k.onNamed('ulthred.trial.round', (p) => {
    const n = (p as { n?: number } | undefined)?.n;
    if (k.active('m55') && typeof n === 'number') k.ctx.events.emit('hud.toast', { textKey: 'quest.m55.trialRound', params: { n } });
  });
  k.onNamed('ulthred.trial.won', () => {
    if (!k.active('m55') || k.flag(M55_TRIAL_PASSED)) return;
    k.set(M55_TRIAL_PASSED);
    toast(k, 'quest.m55.trialWon');
    k.later(() => recheck(k));
  });
}

// ---- M56 --------------------------------------------------------------------------------------------------------------------
/** N12's ending service: `holdSaves()` suspends autosaves (idempotent) until N12 has written the after-ending state. */
interface Act5Ending { holdSaves(): void }

export function installM56(k: Kit): void {
  // the Scar band Alric's words read, kept current until the choice is made (a Rite or a new Scar changes it)
  const band = (): void => {
    if (!k.active('m56') || k.str(M56_CHOICE_FLAG)) return;
    const b = scarBand(k.num(SCARS_MIRROR_FLAG));
    if (k.str(M56_SCAR_BAND) !== b) k.set(M56_SCAR_BAND, b);
  };
  k.on('quest.started', (e) => { if (e.questId === 'm56') { k.ctx.state.snapshotFavour('m56'); band(); } });
  k.on('save.loaded', () => k.later(band));
  k.every(30, band);
  // a new Scar, or Alric's talk opening, refreshes it at once: the warning line and the confirm read the same count
  k.on('scar.added', band);
  k.on('dialogue.started', band);
  k.on('interact', (e) => {
    if (e.action !== 'interact' || !k.active('m56')) return;
    if (e.interactableId === M56_YSMERYTH_USE && k.objCurrent('m56', 'ysmeryth')) start(k, 'npc-ysmeryth', 'ysmeryth');
    if (e.interactableId === M56_COMPANY_USE && k.objCurrent('m56', 'company')) start(k, M56_COMPANY_TREE, M56_COMPANY_NPC);
  });
  const chosen = (): boolean => k.str(M56_CHOICE_FLAG) === 'rekindle' || k.str(M56_CHOICE_FLAG) === 'let-it-die';
  k.onNamed(M56_CONFIRM_EVENT, (p) => {
    const choice = (p as { choice?: unknown } | undefined)?.choice;
    if (choice !== 'rekindle' && choice !== 'let-it-die') { k.warn(`${LOG} M56: bad choice ${String(choice)}`); return; }
    if (!k.active('m56') || !k.objCurrent('m56', 'choice') || chosen()) return;
    // the hold first (N12 releases it after `world.afterEnding`): nothing before the confirm needs one, a load replays the choice
    const ending = (k.ctx.services as unknown as { get(id: string): Act5Ending | undefined }).get('act5Ending');
    if (ending) ending.holdSaves();
    else k.warn(`${LOG} M56: no act5Ending service, autosaves are not held through the ending`);
    const o = m56Outcome(choice, k.num(SCARS_MIRROR_FLAG));
    k.set(M56_SCARS_FLAG, o.scars);
    k.set(M56_CAEL_LIVES_FLAG, o.caelLives);
    k.set(ANVIL_LIT_FLAG, true);
    k.set(M56_CHOICE_FLAG, o.choice);
    // N7's keepsake by branch (once: the confirm is refused after a choice is written)
    const keepsake = endingKeepsakeFor(o.choice);
    if (keepsake) k.ctx.services.get('inventory')?.add(keepsake, 1);
    k.later(() => recheck(k));
  });
}

// ---- the ending (N12 plays it) ------------------------------------------------------------------------------------------------
/** Registers the two ending cutscenes and their strings, and starts the choice's theme when one begins (N8's cue). */
export function installEnding(k: Kit, offs: (() => void)[]): void {
  offs.push(k.ctx.strings.register('en', ENDING_STRINGS));
  const scenes = k.ctx.services.get('scenes');
  if (!scenes) { k.warn(`${LOG} no scenes service: the ending cutscenes will not play`); return; }
  for (const d of ENDING_SCENE_DEFS) offs.push(scenes.register(d));
  k.on('scene.started', (e) => {
    const choice = (Object.keys(ENDING_CUTSCENES) as M56Choice[]).find((c) => ENDING_CUTSCENES[c] === e.id);
    if (choice) playEndingTheme(k.ctx.services.get('music'), choice);
  });
}
