// PR 2's set pieces on the real bus, flag store and quest manager: M54's withdrawal of the rim quests and the murals, M55's
// trial on a stand-in `hammerTrial`, M56's confirm (Rekindle at 7, 8 and 12 Scars, Let It Die at any count, nothing written
// before the confirm, the hold asked first, a second confirm refused) and the ending's scenes and theme.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../../../../core/EventBus';
import type { GameContext } from '../../../../../core/Game';
import type { GameEventMap } from '../../../../../core/events';
import { Services } from '../../../../../core/Services';
import { WorldState } from '../../../../../state/WorldState';
import { QuestManager } from '../../../../QuestManager';
import { installObjectiveFlags } from '../../../../objectiveFlags';
import { makeKit, type Off } from '../../../act2/director/kit';
import { ACT5_OBJECTIVE_FLAGS, ACT5_QUEST_DEFS } from '../..';
import { phaseHolds } from '../../../../../region/regions';
import { installComplete, installDoneWhenRecheck } from './generic';
import { installEnding, installM54, installM55, installM56, m56Outcome } from './descent';
import {
  ANVIL_LIT_FLAG, LEFT_ON_RIM, M54_MURALS_FLAG, M55_TRIAL_PASSED, M56_CAEL_LIVES_FLAG, M56_CHOICE_FLAG, M56_CONFIRM_EVENT,
  M56_SCARS_FLAG, SCARS_MIRROR_FLAG,
} from '../flags';
import { M54_MURALS, M54_MURAL_NOTE } from '../m54.quest';
import { M55_TRIAL_USE } from '../m55.quest';
import { ENDING_CUTSCENES } from '../../../../../scenes/act5/ending';
import { endingKeepsakeFor } from '../../../../../items/act5/catalog';

function rig(flags: Record<string, boolean | number | string> = {}, opts: { ending?: boolean; trial?: boolean } = {}) {
  const events = new EventBus<GameEventMap>(() => {});
  const state = new WorldState(events, () => {});
  const services = new Services();
  const manager = new QuestManager({ bus: events as never, state: state as never, playerId: () => 'player', warn: () => {} });
  // the gates are the quest files' business (content tests); here every quest starts on demand
  for (const q of ACT5_QUEST_DEFS) manager.register({ ...q, startWhen: undefined });
  const flagsOff = installObjectiveFlags(ACT5_OBJECTIVE_FLAGS, events as never, state as never, manager);
  services.provide('quests' as never, manager as never);
  for (const h of phaseHolds('caldera')) state.setFlag(h, true);
  for (const [k, v] of Object.entries(flags)) state.setFlag(k, v);
  services.provide('interiors' as never, { current: null } as never);
  const dialogue = { starts: [] as string[], active: false, start(tree: string, npc: string) { this.starts.push(`${tree}/${npc}`); return true; } };
  services.provide('dialogue' as never, dialogue as never);
  const ending = { holds: 0, holdSaves() { this.holds++; } };
  if (opts.ending !== false) services.provide('act5Ending' as never, ending as never);
  const trial = { running: false, starts: 0, start() { this.starts++; this.running = true; } };
  if (opts.trial !== false) services.provide('hammerTrial' as never, trial as never);
  const inventory = { added: [] as string[], add(id: string) { this.added.push(id); return true; } };
  services.provide('inventory' as never, inventory as never);
  const scenes = { ids: [] as string[], register(d: { id: string }) { this.ids.push(d.id); return () => {}; }, registerTest: () => () => {} };
  services.provide('scenes' as never, scenes as never);
  const music = { cues: [] as (string | null)[], setCue(id: string | null) { this.cues.push(id); } };
  services.provide('music' as never, music as never);
  const toasts: string[] = [];
  events.on('hud.toast' as never, ((e: { textKey: string }) => void toasts.push(e.textKey)) as never);
  const ctx = {
    events, state, services,
    anchors: { find: (id: string) => ({ id, position: { x: 11000, y: 300, z: 8000 }, yaw: 0 }), define: () => () => {} },
    triggers: { add: () => () => {} },
    strings: { t: (k: string) => k, register: () => () => {} },
  } as unknown as GameContext;
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const offs: Off[] = [];
  const { kit, tick } = makeKit(ctx, (m) => console.warn(m), offs);
  installComplete(kit);
  installDoneWhenRecheck(kit);
  installM54(kit);
  installM55(kit);
  installM56(kit);
  installEnding(kit, offs);
  const emit = (type: string, payload: unknown = {}): void => void events.emit(type as never, payload as never);
  return {
    state, manager, toasts, ending, trial, inventory, scenes, music, dialogue, emit, warn,
    step: (n = 1): void => { for (let i = 0; i < n; i++) tick(); },
    use: (id: string) => emit('interact', { interactableId: id, kind: 'prop', actorId: 'player', action: 'interact' }),
    read: (id: string) => emit('dialogue.ended', { dialogueId: id, npcId: id, reason: 'completed' }),
    dispose: () => { for (const o of offs.splice(0)) o(); flagsOff.dispose(); warn.mockRestore(); },
  };
}
let cur: ReturnType<typeof rig> | null = null;
const make = (f?: Record<string, boolean | number | string>, o?: Parameters<typeof rig>[1]) => (cur = rig(f, o));
afterEach(() => { cur?.dispose(); cur = null; });

/** M56 started with told, Ysmeryth and the company done, so the choice is current. */
function atChoice(scars: number, o?: Parameters<typeof rig>[1]) {
  const r = make({ [SCARS_MIRROR_FLAG]: scars }, o);
  r.manager.start('m56');
  for (const id of ['told', 'ysmeryth', 'company']) r.manager.completeObjective('m56', id);
  r.step(2);
  expect(r.manager.isObjectiveCurrent('m56', 'choice')).toBe(true);
  return r;
}

describe('M54 the descent', () => {
  it('withdraws the rim optionals still running, quietly, and leaves finished ones alone', () => {
    const r = make();
    r.manager.start('r28');
    r.manager.start('r30');
    r.manager.complete('r30');
    r.manager.start('m54');
    r.step(2);
    expect(r.manager.state('r28')).toBe('failed');
    expect(r.state.getFlag(LEFT_ON_RIM('r28'))).toBe(true);
    expect(r.manager.state('r30')).toBe('completed');
    expect(r.state.getFlag(LEFT_ON_RIM('r30'))).toBeUndefined();
    expect(r.toasts.filter((t) => t === 'quest.m54.leftOnRim')).toHaveLength(1);
  });

  it('nothing to withdraw: no toast', () => {
    const r = make();
    r.manager.start('m54');
    r.step(2);
    expect(r.toasts).not.toContain('quest.m54.leftOnRim');
  });

  it('the murals flag lands only once all four are read (a cancelled read does not count)', () => {
    const r = make();
    r.manager.start('m54');
    for (const n of M54_MURALS.slice(0, 3)) r.read(M54_MURAL_NOTE(n));
    r.emit('dialogue.ended', { dialogueId: M54_MURAL_NOTE(4), npcId: M54_MURAL_NOTE(4), reason: 'cancelled' });
    expect(r.state.getFlag(M54_MURALS_FLAG)).toBeUndefined();
    r.read(M54_MURAL_NOTE(4));
    expect(r.state.getFlag(M54_MURALS_FLAG)).toBe(true);
  });
});

describe('M55 the trial', () => {
  const atTrial = (o?: Parameters<typeof rig>[1]) => {
    const r = make({}, o);
    r.manager.start('m55');
    r.manager.completeObjective('m55', 'parley');
    r.step(2);
    return r;
  };
  it('the stone starts the trial once, and the won event sets the flag', () => {
    const r = atTrial();
    r.use(M55_TRIAL_USE);
    r.use(M55_TRIAL_USE);
    expect(r.trial.starts).toBe(1);
    r.emit('ulthred.trial.round', { n: 2 });
    expect(r.toasts).toContain('quest.m55.trialRound');
    r.emit('ulthred.trial.won', {});
    r.step(2);
    expect(r.state.getFlag(M55_TRIAL_PASSED)).toBe(true);
    expect(r.manager.objectiveDone('m55', 'trial')).toBe(true);
  });
  it('no trial service: a toast and a warning, never a throw', () => {
    const r = atTrial({ trial: false });
    expect(() => r.use(M55_TRIAL_USE)).not.toThrow();
    expect(r.toasts).toContain('quest.m55.noTrial');
    expect(r.state.getFlag(M55_TRIAL_PASSED)).toBeUndefined();
  });
});

describe('M56 the choice', () => {
  it.each([
    ['rekindle', 0, true], ['rekindle', 7, true], ['rekindle', 8, false], ['rekindle', 12, false],
    ['let-it-die', 0, true], ['let-it-die', 8, true], ['let-it-die', 12, true],
  ] as const)('%s at %i Scars: Cael lives %s', (choice, scars, lives) => {
    expect(m56Outcome(choice, scars).caelLives).toBe(lives);
    const r = atChoice(scars);
    r.emit(M56_CONFIRM_EVENT, { choice });
    expect(r.state.getFlag(M56_CHOICE_FLAG)).toBe(choice);
    expect(r.state.getFlag(M56_CAEL_LIVES_FLAG)).toBe(lives);
    expect(r.state.getFlag(M56_SCARS_FLAG)).toBe(scars);
    expect(r.state.getFlag(ANVIL_LIT_FLAG)).toBe(true);
    expect(r.ending.holds).toBe(1);
    expect(r.inventory.added).toEqual([endingKeepsakeFor(choice)].filter(Boolean));
    r.step(2);
    expect(r.manager.objectiveDone('m56', 'choice')).toBe(true);
  });

  it('nothing is written before the confirm, and a bad or early confirm writes nothing', () => {
    const r = make({ [SCARS_MIRROR_FLAG]: 3 });
    r.manager.start('m56');
    r.emit(M56_CONFIRM_EVENT, { choice: 'rekindle' }); // the choice is not current yet
    for (const id of ['told', 'ysmeryth', 'company']) r.manager.completeObjective('m56', id);
    r.step(2);
    r.emit(M56_CONFIRM_EVENT, { choice: 'both' });
    for (const f of [M56_CHOICE_FLAG, M56_CAEL_LIVES_FLAG, M56_SCARS_FLAG, ANVIL_LIT_FLAG]) expect(r.state.getFlag(f)).toBeUndefined();
    expect(r.ending.holds).toBe(0);
  });

  it('a second confirm is refused: the first choice and one keepsake stand', () => {
    const r = atChoice(9);
    r.emit(M56_CONFIRM_EVENT, { choice: 'let-it-die' });
    r.emit(M56_CONFIRM_EVENT, { choice: 'rekindle' });
    expect(r.state.getFlag(M56_CHOICE_FLAG)).toBe('let-it-die');
    expect(r.state.getFlag(M56_CAEL_LIVES_FLAG)).toBe(true);
    expect(r.inventory.added.length).toBeLessThanOrEqual(1);
  });

  it('the Scar count is read at the moment of the confirm (a late Scar counts)', () => {
    const r = atChoice(7);
    r.state.setFlag(SCARS_MIRROR_FLAG, 8);
    r.emit(M56_CONFIRM_EVENT, { choice: 'rekindle' });
    expect(r.state.getFlag(M56_CAEL_LIVES_FLAG)).toBe(false);
  });

  it('without N12\'s ending service the choice still lands, with a warning', () => {
    const r = atChoice(2, { ending: false });
    r.emit(M56_CONFIRM_EVENT, { choice: 'rekindle' });
    expect(r.state.getFlag(M56_CHOICE_FLAG)).toBe('rekindle');
    expect(r.warn.mock.calls.some((c) => String(c[0]).includes('act5Ending'))).toBe(true);
  });
});

describe('the ending scenes', () => {
  it('registers both cutscenes and plays the choice\'s theme when one starts', () => {
    const r = make();
    expect(r.scenes.ids).toEqual(expect.arrayContaining(Object.values(ENDING_CUTSCENES)));
    r.emit('scene.started', { id: ENDING_CUTSCENES['let-it-die'] });
    r.emit('scene.started', { id: 'some-other-scene' });
    expect(r.music.cues).toHaveLength(1);
    expect(r.music.cues[0]).toBeTruthy();
  });
});
