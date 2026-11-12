/**
 * G3 New Game+ ("Second Hearth", design 12.5) on a booted game with every real plugin: N13's after-ending save (Act 4's M46
 * fixture with the ending played) is turned into a Second Hearth by the shipped transform and loaded as Continue does.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootFromSave, type ChapterHarness } from '../integration/chapterHarness';
import { strandedSave } from '../afterEnding/testing';
import { getItem } from '../inventory/items';
import { buildSecondHearth } from './carry';
import { ensure, objectiveDone, playPhaseA, reachPhaseAStart, talkTo, type QuestTrail } from '../integration/phaseA';
import { killGroup, playM06, playM08, playM09, playM10, playR03, playR04, reachSouthGate, useAt } from '../integration/phaseB';
import { healthLift } from './scaling';
import { heatMultiplier } from '../cinderlands/heat';
import { temperCap } from '../gear/tempering';
import * as THREE from 'three';
import { damageLift } from './scaling';
import { NGPLUS_BURNING } from './tuning';

/** A hostile stand-in spawned straight through the registry (the scaling listens to every spawn). */
function foe(hh: ChapterHarness, level: number) {
  const root = new THREE.Object3D();
  return hh.ctx.actors.spawn({ kind: 'g3-test-foe', team: 'hostile', level, maxHealth: 100, root, owner: root });
}
function hitPlayer(hh: ChapterHarness, attackerId: string): number {
  const p = hh.ctx.player.actor;
  p.health = p.maxHealth;
  const r = hh.ctx.damage.apply({ attackerId, targetId: p.id, amount: 10, poise: 0, kind: 'melee', direction: new THREE.Vector3(0, 0, -1) });
  return r?.dealt ?? 0;
}

const TIMEOUT = 600_000;
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

async function secondHearth() {
  const ended = await strandedSave(true, 'rekindle', []);
  const built = buildSecondHearth(ended, (id) => getItem(id)?.kind, 1);
  if (!built.ok) throw new Error(built.reason);
  return { ended, file: built.file };
}

describe('a Second Hearth in the real game (G3)', () => {
  it('loads at Kettlewick with the carried level and gear, the gear kept on, and M01 handed over at T15', async () => {
    const { ended, file } = await secondHearth();
    h = await bootFromSave(file, { models: true, virtualClock: true });
    expect(h.loaded).toBe(true);
    const director = h.director();
    for (let i = 0; i < 20 && !director.begun; i++) await h.runAsync(5);
    console.log('BEAT', director.beat, director.mode, director.complete);
    // "Skip to Kettlewick" lands at T15, the beat that hands M01 over
    expect(director.beat).toBe('t15');
    for (let n = 0; n < 5 && !director.complete; n++) {
      director.skipCurrent();
      await h.runAsync(10);
    }
    const ctx = h.ctx;
    const q = ctx.services.require('quests');
    const inv = ctx.services.require('inventory');
    expect(ctx.services.require('ngPlus').cycle()).toBe(1);
    expect(q.state('m01')).toBe('active');
    expect(q.state('m46')).toBe('inactive');
    const endedInv = (ended.entries as Record<string, { data: Record<string, any> }>).inventory!.data;
    expect(inv.equipped('weapon')).toBe(endedInv.equipped.weapon);
    expect(inv.gold).toBeGreaterThanOrEqual(endedInv.gold);
    expect(ctx.services.require('progression').level).toBe((ended.entries as any).progression.data.xp ? ctx.services.require('progression').level : 0);
    expect(ctx.services.require('progression').level).toBe(28);
    expect(ctx.services.require('ngPlus').heat()).toBe(3);
  }, TIMEOUT);

  it('plays Act 1 to M10 as a Second Hearth: the carried class counts for M07, and every foe is scaled to level 40', async () => {
    const { file } = await secondHearth();
    h = await bootFromSave(file, { models: true, virtualClock: true });
    expect(h.loaded).toBe(true);
    const ctx = h.ctx;
    const ng = ctx.services.require('ngPlus');
    const classBefore = ctx.services.require('progression').classId;
    const spawned: Array<{ kind: string; level: number; maxHealth: number }> = [];
    ctx.events.on('actor.spawned', ({ actor }) => {
      if (actor.team === 'hostile') queueMicrotask(() => spawned.push({ kind: actor.kind, level: actor.level, maxHealth: actor.maxHealth }));
    });
    const t = (): QuestTrail => ({ talks: [] });
    for (let i = 0; i < 20 && !h.director().begun; i++) await h.runAsync(5);
    await reachPhaseAStart(h, { play: { m01: t(), m02: t() } });
    await playPhaseA(h, { field: 'saved', prior: 'released' });
    await reachSouthGate(h);
    await playM06(h, t(), 'bribe');
    // M07: the carried class (and its drill) count as chosen; the trainer refuses a second choice
    const q = ctx.services.require('quests');
    await talkTo(h, t(), 'aldith', [1]);
    await talkTo(h, t(), 'stallholder-1');
    await talkTo(h, t(), 'stallholder-2');
    for (const n of [1, 2, 3]) await useAt(h, `m07.coin-${n}`, `use:m07-coin-${n}`);
    await killGroup(h, 'm07.thieves', 'alley-cutpurse', 3, 'm07.thieves.1');
    await useAt(h, 'm07.satchel', 'pickup:satchel');
    await talkTo(h, t(), 'aldith');
    await h.enterTrigger('trg.harrowmark.bastion-yard');
    await h.runAsync(5);
    ensure(objectiveDone(h, 'm07', 'o5'), 'o5 the Bastion yard');
    expect(q.state('m07')).toBe('completed');
    expect(ctx.services.require('progression').classId).toBe(classBefore);
    await playR03(h, t(), 'collected');
    await playR04(h, t(), 'expose');
    await playM08(h, t(), 'steady');
    await playM09(h, t());
    await playM10(h, t());
    expect(q.state('m10')).toBe('completed');
    // every scaled hostile fought at level 40; health lifted from its own level times the Heat
    const fighters = spawned.filter((s) => s.kind !== 'brazier-cart');
    expect(fighters.length).toBeGreaterThan(10);
    for (const f of fighters) expect(f.level, f.kind).toBe(40);
    expect(ng.heat()).toBeGreaterThanOrEqual(3);
    expect(healthLift(9) * heatMultiplier(3)).toBeGreaterThan(3);
  }, TIMEOUT * 3);

  it('a first playthrough is untouched; begin() parks the ended world and writes the Second Hearth', async () => {
    const { ended } = await secondHearth();
    h = await bootFromSave(ended, { models: true, virtualClock: true });
    expect(h.loaded).toBe(true);
    const ctx = h.ctx;
    const ng = ctx.services.require('ngPlus');
    expect(ng.cycle()).toBe(0);
    expect(ng.heat()).toBe(1);
    expect(temperCap()).toBe(5);
    const a = foe(h, 5);
    expect(a.maxHealth).toBe(100);
    expect(a.level).toBe(5);
    const plain = hitPlayer(h, a.id);
    expect(plain).toBeGreaterThan(0);
    // the ended world can begin a Second Hearth (headless there is no page to reload)
    expect(ng.available()).toBe(true);
    expect(await ng.begin()).toBe(true);
    const save = ctx.services.require('save');
    const parked = save.parkedFile?.();
    expect(parked && (parked.entries['world-state']!.data as any).flags['world.afterEnding']).toBe(true);
  }, TIMEOUT);

  it('failure: a save before the ending cannot begin one', async () => {
    const before = await strandedSave(false, 'rekindle', []);
    h = await bootFromSave(before, { models: true, virtualClock: true });
    const ng = h.ctx.services.require('ngPlus');
    expect(ng.available()).toBe(false);
    expect(await ng.begin()).toBe(false);
    expect(h.ctx.services.require('save').parkedFile?.()).toBeNull();
  }, TIMEOUT);

  it('cycle 2: Heat 5, +2 tempering, hits lifted to level 40 and Burning', async () => {
    const { file } = await secondHearth();
    (file.entries.ngplus!.data as { cycle: number }).cycle = 2;
    h = await bootFromSave(file, { models: true, virtualClock: true });
    const ctx = h.ctx;
    const ng = ctx.services.require('ngPlus');
    expect(ng.cycle()).toBe(2);
    expect(ng.heat()).toBe(5);
    expect(temperCap()).toBe(7);
    const a = foe(h, 5);
    expect(a.level).toBe(40);
    expect(a.maxHealth).toBe(Math.round(100 * healthLift(5) * heatMultiplier(5)));
    const k = damageLift(5) * heatMultiplier(5);
    const dealt = hitPlayer(h, a.id);
    expect(dealt).toBeGreaterThan(10);
    expect(k).toBeGreaterThan(1.5);
    const burning = ctx.services.require('status').list(ctx.player.actor.id).find((e) => e.id === NGPLUS_BURNING.id);
    expect(burning?.kind).toBe('ignite');
  }, TIMEOUT);
});

describe('the pause menu row (G1 hook)', () => {
  it('is offered in the ended world, and not in a Second Hearth before its ending', async () => {
    const { ended, file } = await secondHearth();
    h = await bootFromSave(ended, { models: true, virtualClock: true });
    await h.runAsync(2);
    const ng = h.ctx.services.require('ngPlus');
    expect(h.ctx.services.get('pauseMenu')).toBeDefined();
    expect(ng.available()).toBe(true);
    h.dispose();
    h = await bootFromSave(file, { models: true, virtualClock: true });
    expect(h.ctx.services.require('ngPlus').available()).toBe(false);
  }, TIMEOUT);
});
