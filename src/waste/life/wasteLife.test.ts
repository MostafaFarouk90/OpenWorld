// The Waste's discovery and the refuge's and camp's story dressing: pure readers in every flag state, and the plugin in a
// reduced boot (flag changes and a load re-derive it; each place is discovered once, only by the player).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import corePlugin from '../../core/core.plugin';
import { bootPlugins, makeTestGame, PLUGIN_TEST_TIMEOUT } from '../../core/testing/bootPlugins';
import { PhysicsWorld } from '../../physics/PhysicsWorld';
import { r19Pair, R19_CAPTAINS, R19_PAIRS } from '../../quests/content/act4/harrowmark/r19.quest';
import type { World } from '../../world/World';
import { WASTE_LAYOUT } from '../waste.layout';
import { WASTE_POIS } from '../wasteSites';
import { createWasteLifePlugin } from './wasteLife.plugin';
import { cisternsFull, discoveredFlag, R19_COMPANIES, raisedCompanies, refugeDressing, WASTE_PLACES } from './wasteLife';
import { PENNANT_SPOTS } from './wasteLifeVisuals';
import { REFUGE_BANNERS } from '../../region/act4/act4Places';
import { ACT4_WORLD_LAYOUT } from '../../region/act4/act4World.layout';

const flags = (m: Record<string, boolean | string>) => ({ getBool: (k: string) => m[k] === true, getString: (k: string) => (typeof m[k] === 'string' ? (m[k] as string) : '') });

describe('waste places', () => {
  it('are the five sites and the eleven POIs, each on a trigger the layouts place', () => {
    expect(WASTE_PLACES).toHaveLength(5 + WASTE_POIS.length);
    expect(WASTE_POIS).toHaveLength(11);
    const triggers = new Set([...WASTE_LAYOUT.triggers, ...ACT4_WORLD_LAYOUT.triggers].map((t) => t.id));
    for (const p of WASTE_PLACES) expect(triggers.has(p.triggerId), p.triggerId).toBe(true);
    expect(new Set(WASTE_PLACES.map((p) => p.placeId)).size).toBe(WASTE_PLACES.length);
    expect(discoveredFlag('waste.walker-camp')).toBe('place.waste.walker-camp.discovered');
    expect(WASTE_PLACES.find((p) => p.placeId === 'poi.a4.buried-bell')?.triggerId).toBe('trg.waste.poi.buried-bell.discover');
  });
});

describe('refuge dressing', () => {
  it('is absent before M41 ends, whatever the choices', () => {
    expect(refugeDressing(flags({ 'story.r21.choice': 'all', 'story.r24.choice': 'half', 'story.r19.choice': 'archers-pikes' }))).toEqual({ present: false, raised: [], miners: 0, casks: false });
  });
  it('shows three miners by default and twelve after R21 all; casks only for R24 half', () => {
    const base = { 'story.m41.complete': true };
    expect(refugeDressing(flags(base))).toEqual({ present: true, raised: [], miners: 3, casks: false });
    expect(refugeDressing(flags({ ...base, 'story.r21.choice': 'leaders' })).miners).toBe(3);
    expect(refugeDressing(flags({ ...base, 'story.r21.choice': 'all' })).miners).toBe(12);
    expect(refugeDressing(flags({ ...base, 'story.r24.choice': 'half' })).casks).toBe(true);
    expect(refugeDressing(flags({ ...base, 'story.r24.choice': 'all' })).casks).toBe(false);
  });
  it("raises the two companies of every one of R19's six pairs, and nothing for a bad value", () => {
    expect([...R19_COMPANIES].sort()).toEqual(R19_CAPTAINS.map((c) => c.id).sort());
    for (const pair of R19_PAIRS) {
      const r = raisedCompanies(pair);
      expect(r).toHaveLength(2);
      expect(r19Pair(r[0]!, r[1]!)).toBe(pair);
    }
    for (const bad of ['', 'archers', 'archers-archers', 'archers-knights', 'a-b-c']) expect(raisedCompanies(bad)).toEqual([]);
  });
  it('fills the cisterns only for R24 all', () => {
    expect(cisternsFull(flags({ 'story.r24.choice': 'all' }))).toBe(true);
    expect(cisternsFull(flags({ 'story.r24.choice': 'half' }))).toBe(false);
    expect(cisternsFull(flags({}))).toBe(false);
  });
  it('stands the pennants on the banner row, clear of the House banners', () => {
    for (const p of Object.values(PENNANT_SPOTS)) for (const b of Object.values(REFUGE_BANNERS)) expect(Math.hypot(p[0] - b[0], p[1] - b[1])).toBeGreaterThanOrEqual(15);
  });
});

let physics: PhysicsWorld;
const worlds: World[] = [];
beforeEach(async () => {
  physics = new PhysicsWorld();
  await physics.init();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  for (const w of worlds.splice(0)) w.dispose();
  vi.restoreAllMocks();
});

async function boot() {
  (globalThis as any).self ??= globalThis;
  const game = makeTestGame(physics);
  worlds.push(game.ctx.world as unknown as World);
  const ctx = game.ctx;
  ctx.anchors.define({ id: 'brightwater.player-spawn', position: { x: 0, y: 0, z: 0 }, yaw: 0 });
  const statuses = await bootPlugins(game, [corePlugin, createWasteLifePlugin({ heightAt: () => 0 })]);
  const emitted: { type: string; payload: any }[] = [];
  for (const type of ['discover', 'hud.toast']) (ctx.events as any).on(type, (p: unknown) => emitted.push({ type, payload: p }));
  const obj = (name: string) => ctx.scene.getObjectByName(name)!;
  return { game, ctx, statuses, emitted, obj };
}

describe('waste-life plugin', () => {
  it('discovers a place once, only for the player, and toasts its name', async () => {
    const t = await boot();
    expect(t.statuses.filter((s) => s.state !== 'ok')).toEqual([]);
    const player = t.ctx.player.actor.id;
    t.ctx.events.emit('trigger.enter', { triggerId: 'trg.waste.walker-camp', actorId: 'someone-else' as never });
    expect(t.ctx.state.getBool('place.waste.walker-camp.discovered')).toBe(false);
    t.ctx.events.emit('trigger.enter', { triggerId: 'trg.waste.walker-camp', actorId: player });
    t.ctx.events.emit('trigger.enter', { triggerId: 'trg.waste.walker-camp', actorId: player });
    t.ctx.events.emit('trigger.enter', { triggerId: 'trg.waste.poi.glass-vein.discover', actorId: player });
    expect(t.ctx.state.getBool('place.waste.walker-camp.discovered')).toBe(true);
    expect(t.ctx.state.getBool('place.poi.a4.glass-vein.discovered')).toBe(true);
    expect(t.emitted.filter((e) => e.type === 'discover').map((e) => e.payload)).toEqual([
      { placeId: 'waste.walker-camp', kind: 'poi' },
      { placeId: 'poi.a4.glass-vein', kind: 'poi' },
    ]);
    expect(t.ctx.strings.t('waste.found', t.emitted.find((e) => e.type === 'hud.toast')!.payload.params)).toBe('You found the Walker Camp.');
  }, PLUGIN_TEST_TIMEOUT);

  it('follows the story flags, and a load re-derives the dressing', async () => {
    const t = await boot();
    expect(t.obj('waste-life-refuge').visible).toBe(false);
    expect(t.obj('waste-life-cistern-1-water').visible).toBe(false);
    t.ctx.state.setFlag('story.m41.complete', true);
    expect(t.obj('waste-life-refuge').visible).toBe(true);
    const shown = () => Array.from({ length: 12 }, (_, i) => t.obj(`waste-life-miner-${i + 1}`).visible).filter(Boolean).length;
    expect(shown()).toBe(3);
    t.ctx.state.setFlag('story.r21.choice', 'all');
    expect(shown()).toBe(12);
    t.ctx.state.setFlag('story.r19.choice', 'horse-pikes');
    const raisedY = (c: string) => t.obj(`waste-life-pennant-${c}`).position.y;
    expect(raisedY('horse')).toBeGreaterThan(raisedY('archers') + 3);
    expect(raisedY('pikes')).toBeGreaterThan(raisedY('engineers') + 3);
    expect(t.obj('waste-life-casks').visible).toBe(false);
    t.ctx.state.setFlag('story.r24.choice', 'all');
    expect(t.obj('waste-life-cistern-2-water').visible).toBe(true);
    // A load that changes flags without flag.changed events (the save restores state wholesale).
    (t.ctx.state as any).load({ flags: { 'story.m41.complete': true, 'story.r24.choice': 'half' } });
    t.ctx.events.emit('save.loaded', {} as never);
    expect(t.obj('waste-life-casks').visible).toBe(true);
    expect(t.obj('waste-life-cistern-1-water').visible).toBe(false);
    expect(shown()).toBe(3);
  }, PLUGIN_TEST_TIMEOUT);
});
