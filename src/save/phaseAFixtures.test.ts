/**
 * The Phase A fixtures (src/save/__fixtures__/phaseA-*.json, written by the real save plugin through
 * src/integration/fixtures.gen.test.ts) loaded the way a player continues: seeded into both IndexedDB slots before
 * boot, every real plugin booted, `save.continueNow()`, ticks. Also the refusals: a corrupt copy and a copy from a
 * newer format leave the game on its defaults.
 */
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootFromSave, type ChapterHarness } from '../integration/chapterHarness';
import { PHASE_A_ORDER } from '../integration/phaseA';
import { FIXTURE_SAVED_AT, PHASE_A_FIXTURES, readPhaseAFixture } from './__fixtures__/phaseA';

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
const fogStanding = () => h!.triggerCentre('trg.fog.harrowmark') !== null && h!.ctx.scene.getObjectByName('fog-wall') !== undefined;
const tobbPosition = () => {
  const id = h!.ctx.services.require('companions').actorId('tobb');
  const root = id ? h!.ctx.actors.get(id)?.root : undefined;
  return root ? root.getWorldPosition(new THREE.Vector3()) : null;
};
const horizontal = (a: THREE.Vector3Like, b: THREE.Vector3Like) => Math.hypot(a.x - b.x, a.z - b.z);

describe('Phase A fixtures are real saves', () => {
  it.each(Object.values(PHASE_A_FIXTURES))('%s has the save file shape and the fixed savedAt', async (name) => {
    const f = await readPhaseAFixture(name);
    expect(f.format).toBe(1);
    expect(f.savedAt).toBe(FIXTURE_SAVED_AT);
    expect(f.reason).toBe('manual');
    const entries = f.entries as Record<string, { version: number }>;
    for (const key of ['quests', 'world-state', 'companions', 'interior', 'player-position', 'tutorial']) expect(entries[key], key).toBeDefined();
  });
});

describe('Phase A complete fixtures load on every real plugin', () => {
  it.each([
    [PHASE_A_FIXTURES.releasedSaved, 'released', 'saved'],
    [PHASE_A_FIXTURES.defeatedScorched, 'defeated', 'scorched'],
  ] as const)('%s', async (name, prior, field) => {
    h = await bootFromSave(await readPhaseAFixture(name));
    expect(h.loaded).toBe(true);
    for (const q of PHASE_A_ORDER) expect(qstate(q), q).toBe('completed');
    for (const q of ['m01', 'm02']) expect(qstate(q), q).toBe('completed');
    expect(flag('boss.ashen-prior.outcome')).toBe(prior);
    expect(flag('world.brightwater.barley')).toBe(field);
    expect(flag('story.r01.torchUsed') === true).toBe(field === 'scorched');
    expect(flag('story.m05.complete')).toBe(true);
    expect(flag('story.m05.tobbJoined')).toBe(true);
    expect(h.ctx.state.getBool('enemies.mercy.release')).toBe(true);
    expect(h.ctx.state.getBool('enemies.mercy.spare')).toBe(true);
    expect(h.director().complete).toBe(true);
    // M05 is complete, so the wall is down; nothing wrote the retired Phase A flag.
    expect(fogStanding()).toBe(false);
    expect(flag('story.slice.harrowmarkOpen')).toBeUndefined();
    // Outdoors at the vault door, Tobb beside the player.
    expect(h.ctx.services.require('interiors').current).toBeNull();
    expect(horizontal(h.ctx.player.feet, h.anchor('vault.door'))).toBeLessThan(8);
    expect(h.ctx.services.require('companions').active()).toEqual(['tobb']);
    const tobb = tobbPosition();
    expect(tobb).not.toBeNull();
    expect(horizontal(tobb!, h.ctx.player.feet)).toBeLessThan(6);
    expect(Math.abs(tobb!.y - h.ctx.player.feet.y)).toBeLessThan(3);
    // No leftovers of the quests: no yard dummies, no Prior, no scarecrows.
    const kinds = new Set([...h.ctx.actors.all()].map((a) => a.kind));
    for (const k of ['blocking-dummy', 'ashen-prior', 'ash-scarecrow']) expect(kinds.has(k), k).toBe(false);
  }, 60_000);
});

describe('the mid-D01 vault fixture', () => {
  it('loads inside the chapel vault with Tobb beside the player; an immediate exit lands both at the vault door', async () => {
    h = await bootFromSave(await readPhaseAFixture(PHASE_A_FIXTURES.midD01Vault));
    expect(h.loaded).toBe(true);
    const interiors = h.ctx.services.require('interiors');
    expect(interiors.current).toBe('chapel-vault');
    expect(qstate('d01')).toBe('active');
    expect(h.ctx.services.require('quests').objectiveDone('d01', 'o1')).toBe(true);
    for (const q of ['m03', 'm04', 'm05', 'r01', 'r02']) expect(qstate(q), q).toBe('completed');
    expect(flag('boss.ashen-prior.outcome')).toBeUndefined();
    // Interiors float 150 m above the terrain (src/interiors/README.md).
    const feet = h.ctx.player.feet.clone();
    expect(feet.y).toBeGreaterThan(100);
    expect(interiors.interiorAt(feet)).toBe('chapel-vault');
    // The Prior's vault reload rule: a load inside the vault with no outcome yet puts the player at the arena door.
    expect(horizontal(feet, h.anchor('vault.arena.door'))).toBeLessThan(1.5);
    const tobb = tobbPosition();
    expect(tobb).not.toBeNull();
    expect(interiors.interiorAt(tobb!)).toBe('chapel-vault');
    expect(horizontal(tobb!, feet)).toBeLessThan(4);
    expect(fogStanding()).toBe(false); // M05 is done in this fixture

    let done = false;
    void interiors.exit().then(() => (done = true));
    for (let i = 0; i < 30 && !done; i++) await h.runAsync(15);
    await h.runAsync(60);
    expect(done).toBe(true);
    expect(interiors.current).toBeNull();
    const door = h.anchor('vault.door');
    expect(horizontal(h.ctx.player.feet, door)).toBeLessThan(3);
    expect(h.ctx.player.feet.y).toBeLessThan(door.y + 3);
    const out = tobbPosition();
    expect(out).not.toBeNull();
    expect(horizontal(out!, door)).toBeLessThan(5);
    expect(Math.abs(out!.y - h.ctx.player.feet.y)).toBeLessThan(3);
    expect(interiors.interiorAt(out!)).toBeNull();
  }, 60_000);
});

describe('refused fixtures keep the defaults', () => {
  const expectDefaults = () => {
    expect(h!.loaded).toBe(false);
    expect(h!.ctx.services.require('save').hasSave()).toBe(false);
    for (const q of [...PHASE_A_ORDER, 'm01', 'm02']) expect(qstate(q), q).toBe('inactive');
    expect(flag('boss.ashen-prior.outcome')).toBeUndefined();
    expect(flag('story.m05.complete')).toBeUndefined();
    expect(h!.ctx.services.require('companions').active()).toEqual([]);
    expect(h!.ctx.services.require('interiors').current).toBeNull();
  };

  it('a corrupt copy (entries mangled) is refused', async () => {
    const f = await readPhaseAFixture(PHASE_A_FIXTURES.releasedSaved);
    (f.entries as Record<string, unknown>).quests = 'not an entry';
    h = await bootFromSave(f);
    expectDefaults();
  }, 60_000);

  it('a copy with format 99 (a newer game) is refused', async () => {
    const f = await readPhaseAFixture(PHASE_A_FIXTURES.defeatedScorched);
    f.format = 99;
    h = await bootFromSave(f);
    expectDefaults();
  }, 60_000);
});
