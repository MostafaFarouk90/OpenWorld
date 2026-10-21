import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SaveEntry } from '../core/Persist';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { CINDERFORD_RAID } from './defs/cinderford';
import { BARRICADE, CART, DIRECTOR } from './tuning';
import { makeKit, type Kit } from './testKit';

const ID = CINDERFORD_RAID.id;
let physics: PhysicsWorld;
let kit: Kit;
let warn: ReturnType<typeof vi.spyOn>;
beforeEach(async () => {
  physics = new PhysicsWorld();
  await physics.init();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  kit = await makeKit(physics);
});
afterEach(() => {
  kit.teardown();
  vi.restoreAllMocks();
});

const wavesEntry = (k: Kit = kit) => k.ctx.persist.saveAll().find((e) => e.key === 'waves')!;
const load = (entries: SaveEntry[], k: Kit = kit) => k.ctx.persist.loadAll(entries, k.ctx.events, 'slot-0');
const entryOf = (data: unknown, version = 1): SaveEntry[] => [{ key: 'waves', version, data }];
const killAll = () => {
  for (const id of kit.enemies.all()) if (kit.ctx.actors.get(id) && !kit.ctx.actors.get(id)!.dead) kit.ctx.damage.kill(id, 'player');
};

function toWave(index: number) {
  kit.waves().start(ID);
  for (let i = 0; i < 60 * 400; i++) {
    if (kit.waves().current!.index >= index && kit.director().phase === 'running') return;
    if (i % 10 === 0) {
      killAll();
      for (const c of kit.director().parts?.carts.all ?? []) if (c.active) kit.ctx.damage.kill(c.actor.id, 'player');
    }
    kit.ctx.player.actor.health = 100;
    kit.run(1);
  }
  throw new Error('timeout');
}

describe('serialize', () => {
  it('idle', () => {
    expect(wavesEntry()).toEqual({ key: 'waves', version: 1, data: { defId: null, index: 0, phase: 'idle' } });
  });
  it('running: {defId, index, phase}, barricade only when below full', () => {
    kit.waves().start(ID);
    kit.runSecs(3);
    expect(wavesEntry().data).toEqual({ defId: ID, index: 0, phase: 'running' });
  });
  it('intermission stores the wave just cleared; done stores the last wave', () => {
    toWave(1);
    kit.director().parts!.barricade.damage(100);
    for (let s = 0; s < 14; s++) {
      killAll();
      for (const c of kit.director().parts!.carts.all) if (c.active) kit.ctx.damage.kill(c.actor.id, 'player');
      kit.ctx.player.actor.health = 100;
      kit.run(60);
    }
    expect(kit.director().phase).toBe('intermission');
    expect(wavesEntry().data).toEqual({ defId: ID, index: 1, phase: 'intermission', barricade: 300 });
  });
});

describe('load', () => {
  it('a save mid-wave loads at that wave\'s start: enemies full, carts reset, barricade at the stored value, militia up', async () => {
    const entries = [{ key: 'waves', version: 1, data: { defId: ID, index: 2, phase: 'running', barricade: 150 } }];
    kit.clearEvents();
    load(entries);
    expect(kit.of('wave.started')).toEqual([{ defId: ID, index: 2 }]);
    expect(kit.waves().current).toEqual({ defId: ID, index: 2 });
    expect(kit.director().parts!.barricade.health).toBe(150);
    expect(kit.director().parts!.defenders.count).toBe(6);
    kit.runSecs(7);
    expect(kit.director().parts!.carts.all).toHaveLength(1);
    expect(kit.director().parts!.carts.all[0].actor.health).toBe(CART.maxHealth);
    expect(kit.enemies.all().length).toBeGreaterThanOrEqual(3);
  });

  it('a mid-run save round-trips into a fresh game', async () => {
    toWave(1);
    kit.runSecs(2);
    const saved = kit.ctx.persist.saveAll();
    const other = await makeKit(physics);
    load(saved, other);
    expect(other.waves().current).toEqual({ defId: ID, index: 1 });
    expect(other.of('wave.started')).toEqual([{ defId: ID, index: 1 }]);
    other.teardown();
  });

  it('an intermission save loads at the start of the next wave', () => {
    load(entryOf({ defId: ID, index: 0, phase: 'intermission' }));
    expect(kit.of('wave.started')).toEqual([{ defId: ID, index: 1 }]);
    expect(kit.director().parts!.barricade.health).toBe(BARRICADE.maxHealth);
  });

  it('a cleared set does not restart and cannot be started again', () => {
    load(entryOf({ defId: ID, index: 2, phase: 'done' }));
    kit.runSecs(5);
    expect(kit.waves().current).toBeNull();
    expect(kit.of('wave.started')).toEqual([]);
    expect(kit.waves().start(ID)).toBe(false);
    expect(wavesEntry().data).toEqual({ defId: ID, index: 2, phase: 'done' });
  });

  it('done sets in the `done` list also refuse a start', () => {
    load(entryOf({ defId: null, index: 0, phase: 'idle', done: [ID, 'ghost'] }));
    expect(kit.waves().start(ID)).toBe(false);
  });

  it.each([
    ['unknown set', { defId: 'nope', index: 0, phase: 'running' }],
    ['index out of range', { defId: ID, index: 9, phase: 'running' }],
    ['negative index', { defId: ID, index: -1, phase: 'running' }],
    ['fractional index', { defId: ID, index: 0.5, phase: 'running' }],
    ['bad phase', { defId: ID, index: 0, phase: 'beat' }],
    ['intermission after the last wave', { defId: ID, index: 2, phase: 'intermission' }],
    ['not an object', 'garbage'],
    ['null', null],
  ])('drops a corrupt save (%s) with a warning and stays idle', (_n, data) => {
    load(entryOf(data));
    expect(kit.waves().current).toBeNull();
    expect(kit.of('wave.started')).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });

  it('drops a version it does not know', () => {
    load(entryOf({ defId: ID, index: 0, phase: 'running' }, 7));
    expect(kit.waves().current).toBeNull();
  });

  it('ignores a nonsense barricade value', () => {
    load(entryOf({ defId: ID, index: 1, phase: 'running', barricade: 99999 }));
    expect(kit.director().parts!.barricade.health).toBe(BARRICADE.maxHealth);
  });

  it('a pre-A7 save (no waves key) loads idle, and clears a run in progress', () => {
    kit.waves().start(ID);
    kit.runSecs(3);
    expect([...kit.ctx.actors.all()].some((a) => a.kind === 'militia')).toBe(true);
    kit.clearEvents();
    load([{ key: 'world-state', version: 1, data: { flags: {} } }]);
    expect(kit.waves().current).toBeNull();
    expect(kit.of('wave.started')).toEqual([]);
    expect([...kit.ctx.actors.all()].filter((a) => a.kind === 'militia' || a.kind === CART.kind)).toEqual([]);
  });

  it('a stored run replaces a run in progress', () => {
    kit.waves().start(ID);
    kit.runSecs(3);
    load(entryOf({ defId: ID, index: 1, phase: 'running' }));
    expect(kit.waves().current).toEqual({ defId: ID, index: 1 });
    expect([...kit.ctx.actors.all()].filter((a) => a.kind === 'militia')).toHaveLength(6);
  });
});

describe('load far from the barricade', () => {
  it('parks the run, builds nothing, and rebuilds when the player is back in range', async () => {
    kit.teardown();
    const feet = { x: 0, y: 0, z: 0 };
    kit = await makeKit(physics, { feet });
    feet.x = kit.at.x + DIRECTOR.activeRadius + 300;
    load(entryOf({ defId: ID, index: 1, phase: 'running' }));
    expect(kit.waves().current).toEqual({ defId: ID, index: 1 });
    expect(kit.director().parked).toBe(true);
    expect(kit.director().parts).toBeNull();
    kit.clearEvents();
    kit.runSecs(10);
    expect(kit.of('wave.started')).toEqual([]);
    expect([...kit.ctx.actors.all()].filter((a) => a.kind === 'militia')).toEqual([]);
    feet.x = kit.at.x + 10;
    kit.run(3);
    expect(kit.director().parked).toBe(false);
    expect(kit.of('wave.started')).toEqual([{ defId: ID, index: 1 }]);
  });
});

describe('fixtures', () => {
  const fixtures = import.meta.glob('../save/__fixtures__/act2-waves-*.json', { eager: true, import: 'default' }) as Record<string, { entries: Record<string, { version: number; data: unknown }> }>;
  const entries = (name: string): SaveEntry[] => {
    const f = Object.entries(fixtures).find(([k]) => k.endsWith(`act2-waves-${name}.json`))![1];
    return Object.entries(f.entries).map(([key, e]) => ({ key, version: e.version, data: e.data }));
  };

  it('finds all four', () => {
    expect(Object.keys(fixtures)).toHaveLength(4);
  });
  it('mid-wave loads wave 3 with the barricade at 150', () => {
    load(entries('mid-wave'));
    expect(kit.waves().current).toEqual({ defId: ID, index: 2 });
    expect(kit.director().parts!.barricade.health).toBe(150);
  });
  it('intermission loads the next wave', () => {
    load(entries('intermission'));
    expect(kit.waves().current).toEqual({ defId: ID, index: 1 });
  });
  it('done stays done', () => {
    load(entries('done'));
    expect(kit.waves().current).toBeNull();
    expect(kit.waves().start(ID)).toBe(false);
  });
  it('a pre-A7 save with no waves key loads idle', () => {
    expect(entries('pre-a7').some((e) => e.key === 'waves')).toBe(false);
    load(entries('pre-a7'));
    expect(kit.waves().current).toBeNull();
  });
});
