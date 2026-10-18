import { describe, expect, it, vi } from 'vitest';
import { RECAP_LINES, buildRecap, endingRecap, endingRecapLines, recapLines, readFromContext, type RecapRead } from './storyRecap';
import { HUD_JOURNAL_STRINGS_EN } from './strings.en';

const mk = (done: string[] = [], flags: Record<string, string | number | boolean> = {}): RecapRead => ({
  questDone: (id) => done.includes(id),
  flag: (k) => flags[k],
});
const ids = (r: RecapRead): string[] => buildRecap(r).map((e) => e.id);

describe('buildRecap', () => {
  it('is empty for an empty save', () => { expect(ids(mk())).toEqual([]); });

  it('lists only finished beats, in story order', () => {
    expect(ids(mk(['m02', 'm01']))).toEqual(['m01', 'm02']);
    expect(ids(mk(['m03', 'm05']))).toEqual(['m03', 'm05']);
  });

  it('full save shows every plain beat once', () => {
    const all = ['m01','m02','m03','m04','m05','m06','m07','m08','m09','m10','d01','d02','r01','r02','r03','r04'];
    const out = ids(mk(all));
    expect(out).toEqual(all);
    expect(new Set(out).size).toBe(out.length);
  });

  it.each([
    ['m06', 'story.m06.route', ['stealth', 'bribe', 'persuasion']],
    ['m08', 'story.m08.stance', ['warm', 'wary']],
    ['d01', 'boss.ashen-prior.outcome', ['defeated', 'released']],
    ['d02', 'boss.gaffer-grimtooth.outcome', ['defeated', 'released']],
    ['r04', 'story.r04.choice', ['expose', 'shield']],
  ] as const)('%s picks the variant and drops the plain line', (q, key, values) => {
    for (const v of values) expect(ids(mk([q], { [key]: v }))).toEqual([`${q}.${v}`]);
  });

  it.each([
    ['world.brightwater.barley', 'scorched', 'barley.scorched'],
    ['world.brightwater.barley', 'saved', 'barley.saved'],
    ['world.harrowmark.inn.price', 'forgiven', 'inn.forgiven'],
    ['world.harrowmark.inn.price', 'collected', 'inn.collected'],
  ])('%s=%s', (key, v, id) => { expect(ids(mk([], { [key]: v }))).toEqual([id]); });

  it('Tobb joined only on true', () => {
    expect(ids(mk([], { 'story.m05.tobbJoined': true }))).toEqual(['tobb.joined']);
    expect(ids(mk([], { 'story.m05.tobbJoined': false }))).toEqual([]);
    expect(ids(mk([], { 'story.m05.tobbJoined': 'yes' }))).toEqual([]);
  });

  it('ignores unknown values: plain text when done, nothing otherwise', () => {
    expect(ids(mk(['m06'], { 'story.m06.route': 'flying' }))).toEqual(['m06']);
    expect(ids(mk([], { 'story.m06.route': 'flying' }))).toEqual([]);
    expect(ids(mk([], { 'world.brightwater.barley': 3 }))).toEqual([]);
  });

  it('a throwing read drops only that line', () => {
    const r: RecapRead = { questDone: (id) => { if (id === 'm02') throw new Error('x'); return id === 'm01' || id === 'm03'; }, flag: () => undefined };
    expect(ids(r)).toEqual(['m01', 'm03']);
  });

  it('keeps one stable order and every textKey has a string', () => {
    const everything: RecapRead = { questDone: () => true, flag: () => undefined };
    expect(ids(everything)).toEqual(ids(everything));
    for (const l of RECAP_LINES) expect(HUD_JOURNAL_STRINGS_EN[l.textKey], l.textKey).toBeTruthy();
    expect(new Set(RECAP_LINES.map((l) => l.id)).size).toBe(RECAP_LINES.length);
    for (const v of Object.values(HUD_JOURNAL_STRINGS_EN)) expect(v).not.toMatch(/[–—]| - /);
  });
});

describe('readFromContext and recapLines', () => {
  const ctxWith = (quests: unknown, flags: Record<string, unknown> = {}) => ({
    services: { get: (n: string) => (n === 'quests' ? quests : undefined) },
    state: { getFlag: (k: string) => flags[k] },
  }) as never;

  it('tests get() before state(), so unknown ids never warn', () => {
    const state = vi.fn(() => 'completed');
    const q = { get: (id: string) => (id === 'm01' ? {} : undefined), state };
    const r = readFromContext(ctxWith(q));
    expect(r.questDone('zzz')).toBe(false);
    expect(state).not.toHaveBeenCalled();
    expect(r.questDone('m01')).toBe(true);
    expect(state).toHaveBeenCalledWith('m01');
  });

  it('only completed counts', () => {
    const q = { get: () => ({}), state: () => 'active' };
    expect(readFromContext(ctxWith(q)).questDone('m01')).toBe(false);
  });

  it('no quests service: no quest lines, flag lines still work', () => {
    const ctx = ctxWith(undefined, { 'world.brightwater.barley': 'saved' });
    expect(readFromContext(ctx).questDone('m01')).toBe(false);
    expect(recapLines(ctx, (k) => k)).toEqual(['hud.journal.recap.barley.saved']);
  });

  it('maps keys through t', () => {
    const q = { get: () => ({}), state: () => 'completed' };
    const out = recapLines(ctxWith(q), (k) => `T:${k}`);
    expect(out[0]).toBe('T:hud.journal.recap.m01');
  });
});

describe('endingRecap (ending card body)', () => {
  const FULL_FLAGS = {
    'world.brightwater.barley': 'saved',
    'story.m05.tobbJoined': true,
    'story.m06.route': 'stealth',
    'story.m08.stance': 'warm',
    'world.harrowmark.inn.price': 'forgiven',
    'boss.ashen-prior.outcome': 'defeated',
    'boss.gaffer-grimtooth.outcome': 'released',
    'story.r04.choice': 'expose',
  };
  const ALL = ['m01', 'm02', 'm03', 'm04', 'm05', 'm06', 'm07', 'm08', 'm09', 'm10', 'd01', 'd02', 'r01', 'r02', 'r03', 'r04'];

  it('a full Act 1 save shows the late outcome beats (M06 route, D01, D02, R04), not Act 1 opening', () => {
    const out = endingRecap(buildRecap(mk(ALL, FULL_FLAGS))).map((e) => e.id);
    expect(out).toHaveLength(6);
    for (const id of ['m06.stealth', 'd01.defeated', 'd02.released', 'r04.expose']) expect(out).toContain(id);
    expect(out).not.toContain('m01');
    expect(out).not.toContain('m02');
    // Story order is kept.
    expect(out).toEqual(['m06.stealth', 'm08.warm', 'inn.forgiven', 'd01.defeated', 'd02.released', 'r04.expose']);
  });

  it('with few outcomes it tops up with the latest plain completions, still in story order', () => {
    const out = endingRecap(buildRecap(mk(ALL, { 'story.r04.choice': 'shield' }))).map((e) => e.id);
    expect(out).toEqual(['m09', 'm10', 'd01', 'd02', 'r01', 'r02', 'r03', 'r04.shield'].slice(-6));
  });

  it('is short for a short save and empty for none', () => {
    expect(endingRecap([])).toEqual([]);
    expect(endingRecap(buildRecap(mk(['m01', 'm02']))).map((e) => e.id)).toEqual(['m01', 'm02']);
  });

  it('endingRecapLines maps a full save through t', () => {
    const q = { get: () => ({}), state: () => 'completed' };
    const flags = FULL_FLAGS as Record<string, unknown>;
    const ctx = { services: { get: (n: string) => (n === 'quests' ? q : undefined) }, state: { getFlag: (k: string) => flags[k] } } as never;
    const lines = endingRecapLines(ctx, (k) => k);
    expect(lines).toHaveLength(6);
    expect(lines).toContain('hud.journal.recap.m06.stealth');
    expect(lines).toContain('hud.journal.recap.d02.released');
  });
});
