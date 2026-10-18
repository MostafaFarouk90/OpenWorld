/**
 * Phase A to Phase B save migration (thread 21). There is no format bump and no rewrite step: per-entry versions are
 * the contract's mechanism (game-events-and-flags.md section 7) and `SaveFile.format` stays the literal 1, so a bump
 * would only make older builds refuse newer saves. A slice 1 or Phase A save has no `classes`, `mount`, `stealth`,
 * `vendors` or `inn` entry; each owner keeps (or resets to) its defaults on `save.loaded`. These tests load every old
 * fixture through the real save plugin on every real plugin and check the Phase B state a player continues into:
 * Knight, no class chosen, trainers closed, dismounted, skills and level kept; then a save and reload round-trips, and
 * M07's class choice still works on the migrated game.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootFromSave, type ChapterHarness } from '../integration/chapterHarness';
import { CLASS_IDS } from '../actors/classes';
import { PHASE_A_FIXTURES, readPhaseAFixture } from './__fixtures__/phaseA';

const SLICE1 = import.meta.glob<unknown>('./__fixtures__/slice1-*.json', { eager: true, import: 'default' });
const slice1 = (name: string) => structuredClone(SLICE1[`./__fixtures__/${name}.json`]) as Record<string, unknown>;

type Entries = Record<string, { version: number; data: unknown }>;
const entriesOf = (f: Record<string, unknown>): Entries => {
  const e = f.entries as Entries | { key: string; version: number; data: unknown }[];
  return Array.isArray(e) ? Object.fromEntries(e.map((x) => [x.key, { version: x.version, data: x.data }])) : e;
};

const OLD_FIXTURES: Array<[string, () => Promise<Record<string, unknown>>]> = [
  ...['slice1-mid-tutorial-t09', 'slice1-tutorial-complete', 'slice1-mid-m02', 'slice1-complete'].map(
    (n) => [n, async () => slice1(n)] as [string, () => Promise<Record<string, unknown>>],
  ),
  ...Object.values(PHASE_A_FIXTURES).map((n) => [n, () => readPhaseAFixture(n)] as [string, () => Promise<Record<string, unknown>>]),
];

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

describe('old saves carry none of the Phase B entries', () => {
  it.each(OLD_FIXTURES)('%s', async (_name, read) => {
    const e = entriesOf(await read());
    for (const key of ['classes', 'mount', 'stealth', 'vendors', 'inn']) expect(e[key], key).toBeUndefined();
    expect(e.progression?.version).toBeLessThanOrEqual(2);
  });
});

describe('every old fixture loads into the Phase B game', () => {
  it.each(OLD_FIXTURES)('%s: Knight, no class chosen, trainers closed, dismounted, progression kept; round-trips', async (_name, read) => {
    const file = await read();
    const before = entriesOf(file);
    h = await bootFromSave(file);
    expect(h.loaded).toBe(true);
    const ctx = h.ctx;
    const classes = ctx.services.require('classes');
    expect(classes.current()).toBe('knight');
    expect(classes.chosen()).toBe(false);
    for (const id of CLASS_IDS) expect(ctx.state.getBool(`classes.available.${id}`), id).toBe(false);
    expect(ctx.state.getBool('classes.chosen')).toBe(false);
    const mount = ctx.services.get('mount');
    expect(mount?.mounted() ?? false).toBe(false);
    expect(ctx.state.getBool('story.m10.ashmare')).toBe(false);
    const progression = ctx.services.require('progression');
    const saved = before.progression?.data as { xp: number; learned: string[] } | undefined;
    if (saved) {
      expect([...progression.learnedSkills()].sort()).toEqual([...saved.learned].sort());
      expect(progression.xp).toBe(saved.xp);
    }
    const inv = before.inventory?.data as { gold?: number } | undefined;
    if (inv?.gold !== undefined) expect(ctx.services.require('inventory').gold).toBe(inv.gold);
    // No section or chase to resume.
    expect(ctx.services.get('stealth')?.eye?.() ?? null).toBeFalsy();

    // A save now writes the Phase B entries; loading it again keeps the same state.
    await h.runAsync(5);
    const out = await ctx.services.require('save').saveNow('manual');
    await h.flush();
    expect(out.ok).toBe(true);
    const resaved = JSON.parse(JSON.stringify(h.fake.peek('slot-0'))) as Record<string, unknown>;
    const after = entriesOf(resaved);
    expect(after.classes?.version).toBeGreaterThanOrEqual(1);
    h.dispose();
    h = await bootFromSave(resaved);
    expect(h.loaded).toBe(true);
    expect(h.ctx.services.require('classes').current()).toBe('knight');
    expect(h.ctx.services.require('classes').chosen()).toBe(false);
    if (saved) expect([...h.ctx.services.require('progression').learnedSkills()].sort()).toEqual([...saved.learned].sort());
  }, 90_000);
});

describe('M07 still works on a migrated save', () => {
  it('opening the trainers (story.m07.classOpen) lets the player choose a class once', async () => {
    h = await bootFromSave(await readPhaseAFixture(PHASE_A_FIXTURES.releasedSaved));
    const classes = h.ctx.services.require('classes');
    expect(classes.choose('warden')).toMatchObject({ ok: false, reason: 'no-permit' });
    h.ctx.state.setFlag('story.m07.classOpen', true);
    expect(h.ctx.state.getBool('classes.available.warden')).toBe(true);
    expect(classes.choose('warden')).toEqual({ ok: true });
    expect(classes.current()).toBe('warden');
    expect(classes.chosen()).toBe(true);
    expect(classes.choose('knight')).toMatchObject({ ok: false, reason: 'already-chosen' });
  }, 60_000);
});
