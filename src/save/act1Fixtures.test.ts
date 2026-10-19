/**
 * The Act 1 fixtures (src/save/__fixtures__/act1-*.json, written by the real save plugin from the headless Act 1 runs)
 * loaded the way a player continues, on every real plugin. Also the ending's load rows: a quit during the card resumes
 * at the camp, a quit mid-camp (a synthetic copy of act1-complete without `story.d02.campSeen`, marked as such here)
 * replays the camp, and the finished act loads quiet.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootFromSave, type ChapterHarness } from '../integration/chapterHarness';
import { ACT1_FIXTURES, readAct1Fixture } from './__fixtures__/act1';
import { FIXTURE_SAVED_AT } from './__fixtures__/phaseA';

let h: (ChapterHarness & { loaded: boolean }) | null = null;
beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  h?.dispose();
  h = null;
  vi.restoreAllMocks();
});

const flag = (k: string) => h!.ctx.state.getFlag(k);
const qstate = (id: string) => h!.ctx.services.require('quests').state(id);
const frames = (n: number) => {
  for (let i = 0; i < n; i++) {
    h!.run(1);
    h!.ctx.hud.update(1 / 60);
  }
};
const worldChange = () =>
  (h!.ctx.services.require('harrowmark') as unknown as { worldChange(): { active: boolean; banners: number; braziers: number } }).worldChange();
const cardActive = () => h!.ctx.services.require('actEndingCard').active();
const load = async (f: Record<string, unknown>) => {
  h = await bootFromSave(f, { models: true, virtualClock: true });
  expect(h.loaded).toBe(true);
};

describe('Act 1 fixtures are real saves', () => {
  it.each(Object.values(ACT1_FIXTURES))('%s has the save shape, the fixed savedAt and the Phase B entries', async (name) => {
    const f = await readAct1Fixture(name);
    expect(f.format).toBe(1);
    expect(f.savedAt).toBe(FIXTURE_SAVED_AT);
    const entries = f.entries as Record<string, unknown>;
    for (const key of ['quests', 'world-state', 'classes', 'player-position']) expect(entries[key], key).toBeDefined();
  });
});

describe('Act 1 fixtures load', () => {
  it('through the gate: M06 done, the gate open, M07 offerable', async () => {
    await load(await readAct1Fixture(ACT1_FIXTURES.m06ThroughGate));
    expect(qstate('m06')).toBe('completed');
    expect(qstate('m07')).toBe('inactive');
    expect(flag('story.m06.route')).toBe('bribe');
    expect(h!.ctx.services.require('harrowmark').southGate.state()).toBe('open');
    expect(h!.ctx.services.require('classes').chosen()).toBe(false);
  }, 60_000);

  it('the class chosen: a Warden, drill skipped, trainers open', async () => {
    await load(await readAct1Fixture(ACT1_FIXTURES.m07ClassChosen));
    const classes = h!.ctx.services.require('classes');
    expect(qstate('m07')).toBe('completed');
    expect(classes.chosen()).toBe(true);
    expect(classes.current()).toBe('warden');
    expect(flag('classes.drill.warden')).toBe('skipped');
    expect(flag('story.m06.route')).toBe('stealth');
  }, 60_000);

  it('the Counting-House: inside, the section cleared, Merrin to hand in to', async () => {
    await load(await readAct1Fixture(ACT1_FIXTURES.m09CountingHouse));
    expect(qstate('m09')).toBe('active');
    const q = h!.ctx.services.require('quests');
    for (const o of ['o1', 'o2', 'o3', 'o4']) expect(q.objectiveDone('m09', o), o).toBe(true);
    expect(h!.ctx.services.require('interiors').current).toBe('counting-house');
    expect(h!.ctx.player.feet.y).toBeGreaterThan(100);
    // No live section to resume (it cleared before the save).
    expect(h!.ctx.services.get('stealth')?.eye?.() ?? null).toBeFalsy();
  }, 60_000);

  it('the Ashmare: M10 done, the mount unlocked, loaded on foot', async () => {
    await load(await readAct1Fixture(ACT1_FIXTURES.m10Ashmare));
    expect(qstate('m10')).toBe('completed');
    expect(flag('story.m10.ashmare')).toBe(true);
    expect(h!.ctx.services.require('mount').mounted()).toBe(false);
    expect(h!.ctx.services.require('chase').active()).toBe(false);
  }, 60_000);

  it('the Underways: D02 active, inside, Calm taught, the kennels ahead', async () => {
    await load(await readAct1Fixture(ACT1_FIXTURES.d02Underways));
    expect(qstate('d02')).toBe('active');
    expect(h!.ctx.services.require('interiors').current).toBe('underways');
    expect(flag('enemies.mercy.calm')).toBe(true);
    expect(flag('story.gate.a2')).toBeUndefined();
  }, 60_000);
});

describe('the ending across a load', () => {
  it('a quit during the card: no card again, no act.ended, the world change stands, the camp starts on its own and finishes', async () => {
    await load(await readAct1Fixture(ACT1_FIXTURES.endingCard));
    expect(flag('story.gate.a2')).toBe(true);
    expect(flag('codex.actEndingSeen')).toBe(true);
    expect(flag('story.d02.campSeen')).toBeUndefined();
    const dialogue = h!.ctx.services.require('dialogue');
    for (let i = 0; i < 60 && !dialogue.active; i++) {
      frames(1);
      expect(cardActive()).toBe(false);
    }
    expect(dialogue.active).toBe(true);
    expect(h!.of('dialogue.started').at(-1)).toEqual({ dialogueId: 'scene-act1-camp', npcId: 'camp' });
    expect(h!.of('act.ended')).toEqual([]);
    expect(worldChange()).toEqual({ active: true, banners: 10, braziers: 21 });
    for (let i = 0; i < 100 && dialogue.active; i++) h!.press('KeyF');
    expect(flag('story.d02.campSeen')).toBe(true);
    frames(60);
    expect(dialogue.active).toBe(false);
  }, 60_000);

  it('a save with the gate set before the card showed (synthetic: act1-ending-card without codex.actEndingSeen): the card first, the camp after its close', async () => {
    // D02's hand-in is a dialogue (a modal), so the card waits; the dialogue.ended save can land before it shows.
    const f = await readAct1Fixture(ACT1_FIXTURES.endingCard);
    const ws = (f.entries as Record<string, { data: { flags: Record<string, unknown> } }>)['world-state'];
    delete ws.data.flags['codex.actEndingSeen'];
    await load(f);
    const dialogue = h!.ctx.services.require('dialogue');
    frames(120);
    expect(cardActive()).toBe(true);
    expect(dialogue.active).toBe(false);
    expect(h!.of('act.ended')).toEqual([]);
    expect(flag('codex.actEndingSeen')).toBe(true);
    // The card's close (no key target headless: the service closes it as its key would).
    expect(h!.of('hud.actEnding.closed')).toEqual([]);
    h!.ctx.services.require('actEndingCard').dismiss();
    for (let i = 0; i < 60 && !dialogue.active; i++) frames(1);
    expect(dialogue.active).toBe(true);
    expect(h!.of('dialogue.started').at(-1)).toEqual({ dialogueId: 'scene-act1-camp', npcId: 'camp' });
  }, 60_000);

  it('a quit mid-camp (synthetic: act1-complete without story.d02.campSeen): the camp replays', async () => {
    const f = await readAct1Fixture(ACT1_FIXTURES.complete);
    const ws = (f.entries as Record<string, { data: { flags: Record<string, unknown> } }>)['world-state'];
    delete ws.data.flags['story.d02.campSeen'];
    await load(f);
    const dialogue = h!.ctx.services.require('dialogue');
    for (let i = 0; i < 60 && !dialogue.active; i++) frames(1);
    expect(dialogue.active).toBe(true);
    expect(h!.of('act.ended')).toEqual([]);
  }, 60_000);

  it('a camp cut short (closed by a script) is armed again and replays', async () => {
    await load(await readAct1Fixture(ACT1_FIXTURES.endingCard));
    const dialogue = h!.ctx.services.require('dialogue');
    for (let i = 0; i < 60 && !dialogue.active; i++) frames(1);
    expect(dialogue.active).toBe(true);
    dialogue.close('script');
    expect(dialogue.active).toBe(false);
    for (let i = 0; i < 60 && !dialogue.active; i++) frames(1);
    expect(dialogue.active).toBe(true);
    expect(h!.of('dialogue.started').filter((e) => e.dialogueId === 'scene-act1-camp')).toHaveLength(2);
  }, 60_000);

  it('the finished act loads quiet: no card, no camp, no act.ended, the banners up, the act gate set', async () => {
    await load(await readAct1Fixture(ACT1_FIXTURES.complete));
    frames(120);
    expect(h!.of('act.ended')).toEqual([]);
    expect(h!.of('dialogue.started')).toEqual([]);
    expect(flag('story.gate.a2')).toBe(true);
    expect(worldChange()).toEqual({ active: true, banners: 10, braziers: 21 });
    // Every Act 1 quest the run played is done.
    for (const q of ['m01', 'm02', 'm03', 'm04', 'm05', 'm06', 'm07', 'm08', 'm09', 'm10', 'r01', 'r02', 'r03', 'r04', 'd01', 'd02']) {
      expect(qstate(q), q).toBe('completed');
    }
  }, 60_000);
});
