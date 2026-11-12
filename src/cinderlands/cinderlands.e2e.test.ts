/**
 * G4 Cinderlands phase 1 on a booted game with every real plugin, from the Act 2 start fixture (M10 done): the arch is
 * open, a Rift Walk raises the site and lands the player on the entry, the Warden's ring wakes real enemies, quelling it
 * opens the way home and banks the Embers into the saved `cinderlands` entry; a death in a rift wakes the player at the
 * Quenchstone with half banked and no gold pouch.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { bootFromSave, type ChapterHarness } from '../integration/chapterHarness';
import { cinderlandsParts, QUENCHSTONE_ANCHOR } from './cinderlands.plugin';
import { RUN_FLAG } from './run';
import { SITE } from './domain';
import { riftTerrain } from './terrain';

const TIMEOUT = 600_000;
const FIXTURE = JSON.parse(readFileSync('src/save/__fixtures__/act2-m11-start.json', 'utf8'));
let h: (ChapterHarness & { loaded: boolean }) | null = null;
beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => {
  h?.dispose();
  h = null;
  vi.restoreAllMocks();
});

async function startRun(heat = 1): Promise<void> {
  const p = cinderlandsParts()!;
  const board = p.board();
  board.setHeat(heat);
  const c = board.check(board.code);
  if (!c.ok) throw new Error(`board code refused: ${c.reason}`);
  let ok: boolean | null = null;
  void p.run.start({ seed: c.seed, fullMode: false }).then((v) => (ok = v));
  for (let i = 0; i < 60 && ok === null; i++) await h!.runAsync(15);
  expect(ok, 'the run started').toBe(true);
}

const runActors = () => [...h!.ctx.actors.all()].filter((a) => cinderlandsParts()!.run.isRunActor(a.id) && !a.dead);

describe('Cinderlands Rift Walk (booted)', () => {
  it(
    'enters, quells the Warden, comes home and banks the Embers',
    async () => {
      h = await bootFromSave(FIXTURE, { models: true, virtualClock: true, colliderRadius: 4 });
      expect(h.loaded).toBe(true);
      const p = cinderlandsParts()!;
      expect(p.unlocked()).toBe(true);
      expect(p.fullMode()).toBe(false);
      const gold = h.ctx.services.get('inventory' as never) as unknown as { gold: number } | undefined;
      const goldBefore = gold?.gold;

      await startRun(1);
      const run = p.run;
      const entry = run.manifest!.entry;
      expect(Math.hypot(h.ctx.player.feet.x - entry.x, h.ctx.player.feet.z - entry.z)).toBeLessThan(4);
      expect(h.ctx.state.getBool(RUN_FLAG)).toBe(true);
      expect(riftTerrain()).not.toBeNull();
      const cont = h.ctx.services.require('containment');
      expect(cont.isOpen(entry.x, entry.z)).toBe(true);
      expect(cont.isOpen(SITE.x + 2000, SITE.z)).toBe(false);
      expect(cont.isOpen(965, -165)).toBe(false); // the world is shut while in the rift

      const w = run.manifest!.pois.find((q) => q.id === run.manifest!.wardenId)!;
      await h.teleport({ x: w.x + 30, z: w.z }, 30);
      await h.runAsync(30);
      expect(run.pois.get(w.id)!.state).toBe('awake');
      const foes = runActors();
      expect(foes.length).toBeGreaterThan(0);
      for (const a of foes) h.ctx.damage.kill(a.id, h.ctx.player.actor.id);
      await h.runAsync(30);
      expect(run.exitOpen).toBe(true);
      expect(run.embers).toBeGreaterThan(0);

      let s: Awaited<ReturnType<typeof run.leave>> = null;
      void run.leave().then((v) => (s = v));
      for (let i = 0; i < 60 && s === null; i++) await h.runAsync(15);
      expect(s!.outcome).toBe('quelled');
      const home = h.anchor(QUENCHSTONE_ANCHOR);
      expect(Math.hypot(h.ctx.player.feet.x - home.x, h.ctx.player.feet.z - home.z)).toBeLessThan(8);
      expect(h.ctx.state.getBool(RUN_FLAG)).toBe(false);
      expect(riftTerrain()).toBeNull();
      expect(p.meta.data.embers).toBe(s!.kept);
      expect(p.meta.data.maxHeat).toBe(2);
      if (goldBefore !== undefined) expect(gold!.gold).toBe(goldBefore); // no gold from a rift

      // The banked run is in the next save.
      await h.ctx.services.require('save').saveNow('manual');
      await h.runAsync(30);
      const entries = h.ctx.persist.saveAll();
      const saved = entries.find((e) => e.key === 'cinderlands');
      expect((saved?.data as { embers: number }).embers).toBe(s!.kept);
    },
    TIMEOUT,
  );

  it(
    'a death in the rift wakes the player at the Quenchstone with half banked and no pouch',
    async () => {
      h = await bootFromSave(FIXTURE, { models: true, virtualClock: true, colliderRadius: 4 });
      const p = cinderlandsParts()!;
      await startRun(1);
      p.run.embers = 30;
      h.ctx.damage.kill(h.ctx.player.actor.id, null);
      for (let i = 0; i < 80 && p.run.phase !== 'idle'; i++) await h.runAsync(15);
      expect(p.run.phase).toBe('idle');
      expect(p.run.last?.outcome).toBe('died');
      expect(p.meta.data.embers).toBe(15);
      const home = h.anchor(QUENCHSTONE_ANCHOR);
      expect(Math.hypot(h.ctx.player.feet.x - home.x, h.ctx.player.feet.z - home.z)).toBeLessThan(10);
      const pouchSaved = h.ctx.persist.saveAll().find((e) => e.key === 'combat');
      expect(JSON.stringify(pouchSaved?.data ?? {})).not.toMatch(/"goldPouch":\{"position"/);
    },
    TIMEOUT,
  );
});
