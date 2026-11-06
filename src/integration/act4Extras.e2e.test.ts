/**
 * The Act 4 extra fixtures on the real save plugin (L13): an old save made inside the held walls loads outside them (at the
 * M41 camp before M41, at the refuge rest after), and a saved interior checkpoint (`respawn` v1) is the respawn point.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootFromSave, type ChapterHarness } from './chapterHarness';
import { insideRingWall, M41_CAMP_ANCHOR, REFUGE_REST_ANCHOR } from '../harrowmark/noStrand';
import { STAIRS_CHECKPOINT_ANCHOR } from '../interiors/harrowmark/act4/keepStairs';

const FILES = import.meta.glob<Record<string, unknown>>('../save/__fixtures__/act4/act4-extra-*.json', { eager: true, import: 'default' });
const extra = (name: string) => FILES[`../save/__fixtures__/act4/act4-extra-${name}.json`]!;

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

const savedFeet = (save: Record<string, unknown>) =>
  (save.entries as Record<string, { data: { x: number; z: number } }>)['player-position'].data;

async function loadAndNear(name: string, anchorId: string) {
  const save = extra(name);
  const p = savedFeet(save);
  expect(insideRingWall(p.x, p.z), `${name} was saved inside the walls`).toBe(true);
  h = await bootFromSave(save, { models: false, virtualClock: true });
  expect(h.loaded).toBe(true);
  await h.runAsync(30);
  const f = h.ctx.player.feet;
  expect(insideRingWall(f.x, f.z), 'loaded outside the walls').toBe(false);
  const a = h.ctx.anchors.find(anchorId)!.position;
  expect(Math.hypot(f.x - a.x, f.z - a.z), `near ${anchorId}`).toBeLessThan(15);
}

describe('Act 4 extra fixtures', () => {
  it('an old save inside the held walls, before M41, loads at the M41 camp', async () => {
    await loadAndNear('inside-walls-occupied', M41_CAMP_ANCHOR);
  }, 120_000);

  it('the same after M41 loads at the refuge rest', async () => {
    await loadAndNear('inside-walls-after-m41', REFUGE_REST_ANCHOR);
  }, 120_000);

  it('a saved Keep stairs checkpoint is the respawn point after the load', async () => {
    h = await bootFromSave(extra('checkpoint-keep-stairs'), { models: false, virtualClock: true });
    expect(h.loaded).toBe(true);
    const r = h.ctx.services.require('waystones').respawnPoint();
    const a = h.ctx.anchors.find(STAIRS_CHECKPOINT_ANCHOR)!.position;
    expect(Math.hypot(r.feet.x - a.x, r.feet.z - a.z)).toBeLessThan(2);
  }, 120_000);
});
