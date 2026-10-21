import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BRIGHTWATER_SPAWNERS } from '../enemies/brightwaterSpawners';
import { DENSITY_SPAWNERS_A } from '../enemies/densitySpawners';
import { HARROWMARK_SPAWNERS } from '../enemies/harrowmarkSpawners';
import { SLICE_SPAWNERS } from '../enemies/spawnerDefs';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { CINDERFORD_ANCHORS, CINDERFORD_RAID } from './defs/cinderford';
import { spawnerId, spawnersFor, WAVE_SPAWNERS } from './spawners';
import { makeKit, type Kit } from './testKit';

describe('WAVE_SPAWNERS', () => {
  it('has one spawner per (wave, lane, kind), sized to the data: 5, 7 and 9 members per wave', () => {
    const perWave = [0, 0, 0];
    for (const sp of WAVE_SPAWNERS) perWave[Number(/\.w(\d)\./.exec(sp.id)![1])] += sp.count;
    expect(perWave).toEqual([5, 7, 9]);
    expect(new Set(WAVE_SPAWNERS.map((s) => s.id)).size).toBe(WAVE_SPAWNERS.length);
    expect(WAVE_SPAWNERS.map((s) => s.id)).toContain(spawnerId(CINDERFORD_RAID.id, 0, '1', 'ember-hound'));
  });

  it('merges entries that share a lane and kind', () => {
    const def = { ...CINDERFORD_RAID, waves: [{ spawns: [{ lane: '1', kind: 'ash-wraith' as const, count: 2, delay: 0, stagger: 1 }, { lane: '1', kind: 'ash-wraith' as const, count: 3, delay: 9, stagger: 1 }], carts: [] }] };
    const sp = spawnersFor(def);
    expect(sp).toHaveLength(1);
    expect(sp[0].count).toBe(5);
  });

  it('every spawner is manual, ephemeral, never respawns, does not leash, is tagged m12 and sits on a lane anchor', () => {
    const lanes = new Set<string>(Object.values(CINDERFORD_ANCHORS.lanes));
    for (const sp of WAVE_SPAWNERS) {
      expect(sp).toMatchObject({ activation: 'manual', ephemeral: true, respawn: 'never', leash: false, tag: 'm12', band: 'cinderreach' });
      expect(lanes.has(sp.anchor)).toBe(true);
    }
  });

  it('does not collide with the ids already registered', () => {
    const others = new Set([...SLICE_SPAWNERS, ...BRIGHTWATER_SPAWNERS, ...HARROWMARK_SPAWNERS, ...DENSITY_SPAWNERS_A].map((s) => s.id));
    for (const sp of WAVE_SPAWNERS) expect(others.has(sp.id)).toBe(false);
  });

  it('uses the Act 1 kinds plus the Ember Wyrm closer', () => {
    const kinds = new Set(WAVE_SPAWNERS.map((s) => s.enemy));
    expect([...kinds].sort()).toEqual(['ash-wraith', 'blighted-soldier', 'ember-hound', 'ember-wyrm']);
  });
});

describe('the enemies plugin list includes them (edit to another owner\'s file)', () => {
  let physics: PhysicsWorld;
  let kit: Kit;
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(async () => {
    physics = new PhysicsWorld();
    await physics.init();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    kit = await makeKit(physics, { realEnemies: true, withWaves: false, anchors: false });
  });
  afterEach(() => {
    kit.teardown();
    vi.restoreAllMocks();
  });

  const warnings = () => warn.mock.calls.map((c: unknown[]) => String(c[0]));

  it('registers every wave spawner (no unknown-spawner warning) and still knows the Act 1 ones', () => {
    const enemies = kit.ctx.services.require('enemies');
    enemies.spawnGroup(WAVE_SPAWNERS[0].id, { count: 1, aggro: true });
    enemies.spawnGroup('grimtooth-summons');
    enemies.spawnGroup('brightwater.prior-summon.1');
    expect(warnings().filter((w) => w.includes('unknown spawner'))).toEqual([]);
    // the control: an id nobody registered does warn
    enemies.spawnGroup('waves.nope');
    expect(warnings().filter((w) => w.includes("unknown spawner 'waves.nope'"))).toHaveLength(1);
  });

  it('a wave spawner without its lane anchor spawns nothing and says why', () => {
    const enemies = kit.ctx.services.require('enemies');
    expect(enemies.spawnGroup(WAVE_SPAWNERS[0].id, { count: 1, aggro: true })).toEqual([]);
    expect(warnings().some((w) => w.includes('no spawn anchor'))).toBe(true);
  });

  it('is idle until asked: nothing from the waves spawns at startup', () => {
    kit.run(30);
    const enemies = kit.ctx.services.require('enemies');
    for (const sp of WAVE_SPAWNERS) expect(enemies.alive(sp.id)).toEqual([]);
  });
});
