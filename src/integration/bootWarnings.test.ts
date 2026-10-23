/**
 * Boot hygiene on the Phase D build (A16): a game booted from a Phase C and from Phase D saves logs no missing anchor,
 * spawner anchor or string key. Catches a spawner whose anchor nobody published (the Oldsmoke mines spawner's
 * `oldsmoke.spawn.mines.1` until A4's mines landed) and an NPC named by a key no table holds (`companion.hrolf.name`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootFromSave, type ChapterHarness } from './chapterHarness';
import { ACT2_C_FIXTURES, readAct2CFixture } from '../save/__fixtures__/act2c';
import { ACT2_D_FIXTURES, readAct2DFixture } from '../save/__fixtures__/act2d';
import { ACT2_SPAWNERS } from '../enemies/act2Spawners';

let h: ChapterHarness | null = null;
let warn: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  error = vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => {
  h?.dispose();
  h = null;
  vi.restoreAllMocks();
});

const logged = (): string[] => [...warn.mock.calls, ...error.mock.calls].map((c: unknown[]) => String(c[0]));
const BOOT_PROBLEMS = /anchor|spawner|Missing string key|not registered|Duplicate/i;

describe('no anchor, spawner or string warnings at boot', () => {
  it.each([
    ['Phase C complete', async () => readAct2CFixture(ACT2_C_FIXTURES.completeDefeated)],
    ['mid-mines', async () => readAct2DFixture(ACT2_D_FIXTURES.minesMid)],
    ['act complete', async () => readAct2DFixture(ACT2_D_FIXTURES.actComplete)],
  ] as const)('%s', async (_name, file) => {
    h = await bootFromSave(await file(), { models: false, virtualClock: true });
    await h.runAsync(120);
    expect(logged().filter((m) => BOOT_PROBLEMS.test(m))).toEqual([]);
  }, 60_000);

  it('every Oldsmoke spawner\'s anchor, including the mines\' first, is published by the interiors or the layout', async () => {
    h = await bootFromSave(await readAct2DFixture(ACT2_D_FIXTURES.minesMid), { models: false, virtualClock: true });
    const missing = ACT2_SPAWNERS.filter((s) => s.anchor.startsWith('oldsmoke.')).filter((s) => !h!.ctx.anchors.find(s.anchor)).map((s) => s.anchor);
    expect(missing).toEqual([]);
  }, 60_000);

  it('the Cinderreach Hrolf and the companion Hrolf both name him from a table that is loaded', async () => {
    h = await bootFromSave(await readAct2CFixture(ACT2_C_FIXTURES.m11Start), { models: false, virtualClock: true });
    for (const key of ['npc.hrolf.name', 'companion.hrolf.name']) expect(h.ctx.strings.t(key), key).toBe('Hrolf Ironbrow');
    expect(logged().filter((m) => /Missing string key/.test(m))).toEqual([]);
  }, 60_000);
});
