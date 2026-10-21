import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { FIXED_TIMESTEP as DT } from '../config/constants';
import { KILL_XP_BASE, killXp } from '../progression/tuning';
import { ACT2_SPAWNERS } from './act2Spawners';
import { BRIGHTWATER_SPAWNERS } from './brightwaterSpawners';
import { DENSITY_SPAWNERS_A } from './densitySpawners';
import { ENEMY_DEFS } from './defs';
import { EnemyManager } from './EnemyManager';
import { FOE_DEFS } from './foes/defs';
import { HARROWMARK_SPAWNERS } from './harrowmarkSpawners';
import { HUNTER_PACK_KINDS, HUNTER_PACK_LEADER_SLOT } from './hunters/def';
import { REGION_BANDS } from './level';
import { SLICE_SPAWNERS } from './spawnerDefs';
import { FakeHost, loadKnight } from './testing/fakeHost';
import type { SpawnerDef } from './types';

let gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] };
beforeAll(async () => {
  gltf = await loadKnight();
});

const ALL = [...SLICE_SPAWNERS, ...BRIGHTWATER_SPAWNERS, ...HARROWMARK_SPAWNERS, ...DENSITY_SPAWNERS_A, ...ACT2_SPAWNERS];
const by = (id: string): SpawnerDef => ACT2_SPAWNERS.find((d) => d.id === id)!;

describe('spawner tables', () => {
  it('has no duplicate spawner id across all lists', () => {
    const ids = ALL.map((d) => d.id);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dupes).toEqual([]);
  });

  it('keeps every Act 2 anchor under cinderreach. or oldsmoke., with a known band and a matching member count', () => {
    expect(ACT2_SPAWNERS.length).toBeGreaterThan(0);
    for (const d of ACT2_SPAWNERS) {
      expect(d.anchor, d.id).toMatch(/^(cinderreach|oldsmoke)\./);
      for (const a of d.memberAnchors ?? []) expect(a, d.id).toMatch(/^(cinderreach|oldsmoke)\./);
      expect(['cinderreach', 'oldsmoke'], d.id).toContain(d.band);
      expect(REGION_BANDS[d.band as string], d.id).toBeDefined();
      expect(d.memberAnchors, d.id).toBeDefined();
      expect(d.memberAnchors!.length, d.id).toBe(d.count);
    }
  });

  it('defines the hunter camp as three spearmen then a harpooner led from slot 3', () => {
    const camp = by('cinderreach.hunters.camp');
    expect(camp.memberKinds).toEqual(['hunter-spearman', 'hunter-spearman', 'hunter-spearman', 'hunter-harpooner']);
    expect(camp.memberKinds).toEqual([...HUNTER_PACK_KINDS]);
    expect(camp.leaderSlot).toBe(3);
    expect(camp.leaderSlot).toBe(HUNTER_PACK_LEADER_SLOT);
    expect(camp.count).toBe(4);
  });
});

function setup(defs: readonly SpawnerDef[] = ACT2_SPAWNERS) {
  const fake = new FakeHost(gltf.scene, { playerFeet: { x: 0, y: 0, z: -400 } });
  // Every Act 2 member anchor, spread out so nothing overlaps.
  let n = 0;
  for (const d of defs) {
    for (const a of d.memberAnchors ?? [d.anchor]) fake.defineAnchor(a, (n++ % 20) * 10, Math.floor(n / 20) * 10);
    fake.defineAnchor(d.anchor, 0, 0);
  }
  const manager = new EnemyManager(fake.host, FakeHost.factory(gltf), { spawners: defs, seed: 3 });
  return { fake, manager };
}

function kill(fake: FakeHost, id: string, manager: EnemyManager): void {
  fake.apply({ attackerId: 'player', targetId: id, amount: 9999, poise: 0, kind: 'script' });
  for (let i = 0; i < 60 * 5; i++) {
    manager.think(DT);
    manager.animate(DT);
    manager.react(DT);
  }
}

const CF = 'cinderreach.hounds.cinderford';
const PA = 'cinderreach.hounds.pasture';
const FLAG = 'story.r07.choice';
const counts = (m: EnemyManager) => [m.service.alive(CF).length, m.service.alive(PA).length];

describe('hunter camp spawn', () => {
  it('spawns the pack kinds in slot order', () => {
    const { fake, manager } = setup([by('cinderreach.hunters.camp')]);
    manager.spawners.startAuto();
    const ids = manager.service.alive('cinderreach.hunters.camp');
    expect(ids).toHaveLength(4);
    expect(ids.map((id) => fake.actorMap.get(id)!.kind)).toEqual([
      'hunter-spearman', 'hunter-spearman', 'hunter-spearman', 'hunter-harpooner',
    ]);
  });
});

describe('R07 hound gates', () => {
  const start = (flag?: boolean | number | string) => {
    const s = setup([by(CF), by(PA)]);
    if (flag !== undefined) s.fake.flags.set(FLAG, flag);
    // The manager binds gates in its constructor, so a pre-set flag needs a fresh manager.
    const manager = flag === undefined ? s.manager : new EnemyManager(s.fake.host, FakeHost.factory(gltf), { spawners: [by(CF), by(PA)], seed: 3 });
    manager.spawners.startAuto();
    return { fake: s.fake, manager };
  };

  it('has both groups with the flag unset', () => {
    expect(counts(start().manager)).toEqual([3, 3]);
  });

  it("'spared' stills the Cinderford hounds only", () => {
    expect(counts(start('spared').manager)).toEqual([0, 3]);
  });

  it("'culled' stills the pasture hounds only", () => {
    expect(counts(start('culled').manager)).toEqual([3, 0]);
  });

  it.each(['maybe', '', true, 1])('treats the unexpected value %j as undecided', (v) => {
    expect(counts(start(v).manager)).toEqual([3, 3]);
  });

  it.each([
    ['spared', [0, 3]],
    ['culled', [3, 0]],
    ['maybe', [3, 3]],
  ] as const)('keeps the %s result after a save load', (v, want) => {
    const { fake, manager } = start(v);
    fake.loadFlags({ [FLAG]: v });
    expect(counts(manager)).toEqual(want);
  });

  it('a load into a different decision re-derives the groups', () => {
    const { fake, manager } = start();
    fake.loadFlags({ [FLAG]: 'spared' });
    expect(counts(manager)).toEqual([0, 3]);
    fake.loadFlags({});
    expect(counts(manager)).toEqual([3, 3]);
  });

  it('removes the Cinderford group when the choice changes from unset to spared mid-session', () => {
    const { fake, manager } = start();
    expect(counts(manager)).toEqual([3, 3]);
    fake.setFlag(FLAG, 'spared');
    expect(counts(manager)).toEqual([0, 3]);
    expect(manager.count).toBe(3);
  });

  it('does not refill a group the player cleared when the gate re-opens', () => {
    const { fake, manager } = start();
    for (const id of manager.service.alive(CF)) kill(fake, id, manager);
    expect(manager.spawners.isCleared(CF)).toBe(true);
    fake.setFlag(FLAG, 'spared');
    fake.setFlag(FLAG, 'maybe');
    expect(counts(manager)).toEqual([0, 3]);
  });

  it('does not refill a cleared group after a load, and persists the cleared mark', () => {
    const a = start();
    for (const id of a.manager.service.alive(CF)) kill(a.fake, id, a.manager);
    const saved = JSON.parse(JSON.stringify(a.manager.spawners.serialize()));
    expect(saved.cleared).toContain(CF);
    expect(saved.cleared).not.toContain(PA);
    // Same world: a load keeps the cleared group gone.
    a.fake.loadFlags({});
    expect(counts(a.manager)).toEqual([0, 3]);
    // A fresh world loading the save.
    const b = setup([by(CF), by(PA)]);
    b.manager.spawners.load(saved);
    b.manager.spawners.startAuto();
    expect(counts(b.manager)).toEqual([0, 3]);
  });
});

describe('Act 2 kill xp', () => {
  it('pays the provisional base rows', () => {
    expect(KILL_XP_BASE['hunter-spearman']).toBe(65);
    expect(KILL_XP_BASE['hunter-harpooner']).toBe(80);
    expect(KILL_XP_BASE['slag-crawler']).toBe(60);
    expect(KILL_XP_BASE['cinder-golem']).toBe(180);
    expect(KILL_XP_BASE['kindling-fox'] ?? 0).toBe(0);
    expect(killXp('kindling-fox', 5, 5)).toBe(0);
  });

  it('sums a stated Act 2 fixture inside +-15% of its computed total', () => {
    // PROVISIONAL fixture: A16's headless run is the authority. Counts are assumptions, not the shipped spawn totals.
    // 8 spearmen, 3 harpooners, 6 crawlers, 8 golems, plus ambient 20 hounds, 40 wraiths and 20 footmen (blighted-soldier),
    // all at the player's level (scale 1). Sum: 520 + 240 + 360 + 1440 + 500 + 800 + 600 = 4460.
    const fixture: Array<[string, number]> = [
      ['hunter-spearman', 8], ['hunter-harpooner', 3], ['slag-crawler', 6], ['cinder-golem', 8],
      ['ember-hound', 20], ['ash-wraith', 40], ['blighted-soldier', 20],
    ];
    const total = fixture.reduce((s, [kind, n]) => s + n * killXp(kind, 6, 6), 0);
    expect(total).toBe(4460);
    expect(total).toBeGreaterThanOrEqual(4460 * 0.85);
    expect(total).toBeLessThanOrEqual(4460 * 1.15);
  });

  it('gives every enemy and foe kind a KILL_XP_BASE row, except an explicit allowlist', () => {
    // Kinds that currently have no row and so pay 0 xp. kindling-fox pays nothing by design; the others are
    // non-combat or quest-paid. 'hrolf-trial' (companion trial) is allowed in case it is added to ENEMY_DEFS later.
    const NO_XP_ROW = new Set(['kindling-fox', 'watch-guard', 'hrolf-trial']);
    const missing = [...Object.keys(ENEMY_DEFS), ...Object.keys(FOE_DEFS)].filter(
      (k) => !(k in KILL_XP_BASE) && !NO_XP_ROW.has(k),
    );
    expect(missing).toEqual([]);
    // The allowlist must not go stale: a listed kind that gained a row should leave it.
    for (const k of NO_XP_ROW) if (k !== 'hrolf-trial') expect(k in KILL_XP_BASE, k).toBe(false);
  });
});
