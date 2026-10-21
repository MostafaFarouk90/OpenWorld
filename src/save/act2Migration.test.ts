/**
 * Act 2 save migration audit (test only: there is no migration code, and none is needed). Per-entry versions are the
 * contract's mechanism (game-events-and-flags.md section 7): an entry the save lacks leaves its owner on its defaults.
 * The audit derives the keys from `ctx.persist.all()` (not a hand list) and loads every fixture in the directory
 * (slice 1, Phase A, Act 1, Act 2) through the real save plugin on every real plugin: it loads, every key is accepted
 * (no refused or failed `Persist:` warning), `save.loaded` fires once and the ending flags are exactly the fixture's
 * (a load never plays or marks an act ending). An Act 1 save lacks every Act 2 key, which is the no-key load for them.
 * Then the codex backfill: an Act 2 save with no codex entry still unlocks tempering, the Hearth Rite and the party.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootFromSave, type ChapterHarness } from '../integration/chapterHarness';
import { ACT2_C_FIXTURES, readAct2CFixture } from './__fixtures__/act2c';
import { ACT1_FIXTURES, readAct1Fixture } from './__fixtures__/act1';
import { ACT2_CODEX_IDS } from '../codex/act2';

const FIXTURES = import.meta.glob<Record<string, unknown>>('./__fixtures__/*.json', { eager: true, import: 'default' });
const NAMES = Object.keys(FIXTURES).filter((k) => !k.endsWith('.meta.json')).sort();
type Entries = Record<string, { version: number; data: unknown }>;

let h: (ChapterHarness & { loaded: boolean }) | null = null;
let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  h?.dispose();
  h = null;
  vi.restoreAllMocks();
});

const persistWarnings = () => warn.mock.calls.map((c: unknown[]) => String(c[0])).filter((m: string) => m.startsWith('Persist:'));

describe('every fixture loads on every plugin', () => {
  it('finds the fixtures', () => {
    expect(NAMES.length).toBeGreaterThanOrEqual(26);
  });

  it.each(NAMES)('%s', async (name) => {
    const file = structuredClone(FIXTURES[name]) as Record<string, unknown>;
    const entries = file.entries as Entries;
    h = await bootFromSave(file, { models: false, virtualClock: true });
    expect(h.loaded, 'the save loaded').toBe(true);
    expect(h.statuses.filter((s) => s.state !== 'ok')).toEqual([]);
    expect(persistWarnings()).toEqual([]);
    expect(h.of('save.loaded')).toHaveLength(1);
    // Nothing the fixture lacks is invented by a load: the ending flags are the fixture's own.
    const flags = ((entries['world-state']?.data as { flags?: Record<string, unknown> })?.flags ?? {});
    for (const k of ['story.a2.campSeen', 'codex.actEndingSeen']) expect(h.ctx.state.getFlag(k), k).toBe(flags[k]);
    // Every entry the save carries has an owner on this build (none is left orphaned by a rename).
    const owners = new Set(h.ctx.persist.all().map((p) => p.key));
    // The save plugin restores the player's position itself; it is the one entry that is not a persistable.
    for (const key of Object.keys(entries).filter((k) => k !== 'player-position')) expect(owners.has(key), `${key} has a persistable`).toBe(true);
  }, 60_000);
});

describe('the persistables', () => {
  it('every registered key is in at least one fixture, or is an Act 2 key an Act 1 save lacks', async () => {
    h = await bootFromSave(await readAct1Fixture(ACT1_FIXTURES.complete), { models: false, virtualClock: true });
    const keys = h.ctx.persist.all().map((p) => p.key);
    const inAny = new Set(NAMES.flatMap((n) => Object.keys((FIXTURES[n].entries as Entries))));
    // The keys an Act 1 save lacks are the ones Act 2 added: the Act 1 loads above are their no-key loads, and the
    // Phase C fixtures carry them.
    // Every key is carried by some fixture (a loader test exists for it) except those the build registers but no save has
    // written yet; there must be none, so a new persistable ships with a fixture that carries it.
    const orphans = keys.filter((k) => !inAny.has(k));
    expect(orphans, 'persistables no fixture carries').toEqual([]);
    // An Act 1 save loads with the Act 2 keys at their defaults: neither Act 2 companion joined.
    expect(h.ctx.services.require('companions').active()).not.toContain('hrolf');
    expect(h.ctx.services.require('companions').active()).not.toContain('aelfreda');
  }, 60_000);
});

describe('the codex backfill', () => {
  it('an Act 2 save with no codex entry still unlocks tempering, the Hearth Rite and the party', async () => {
    const file = await readAct2CFixture(ACT2_C_FIXTURES.completeDefeated);
    delete (file.entries as Entries).codex;
    h = await bootFromSave(file, { models: false, virtualClock: true });
    const codex = h.ctx.services.require('codex');
    for (const id of [ACT2_CODEX_IDS.party, ACT2_CODEX_IDS.tempering, ACT2_CODEX_IDS.hearthRite, ACT2_CODEX_IDS.scorchhold]) {
      expect(codex.has(id), id).toBe(true);
    }
  }, 60_000);

  it('an Act 1 save does not unlock them', async () => {
    h = await bootFromSave(await readAct1Fixture(ACT1_FIXTURES.complete), { models: false, virtualClock: true });
    const codex = h.ctx.services.require('codex');
    for (const id of [ACT2_CODEX_IDS.party, ACT2_CODEX_IDS.tempering, ACT2_CODEX_IDS.hearthRite]) {
      expect(codex.has(id), id).toBe(false);
    }
  }, 60_000);
});
