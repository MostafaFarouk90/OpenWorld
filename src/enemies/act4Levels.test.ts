// v0.8 items 2, 4 and 21: act-scoped region bands, the Act 4 cap (Q1) on the shared helper, area bands for the Act 4
// interiors, wave sets that name an area, the Harrowmark kill XP factor from `story.gate.a4` only, and the band lint.
import { describe, expect, it, vi } from 'vitest';
import { KillXpRegionFactor } from '../core/scalePorts';
import { AREA_BANDS, areaAt } from '../region/areas';
import { regionAt } from '../region/regionMask';
import { REGION_INFO, regionBandNow, regionTrackNow } from '../region/regions';
import { spawnersFor } from '../waves/spawners';
import type { WaveSetDef } from '../waves/types';
import { ALL_SPAWNERS } from './allSpawners';
import { HARROWMARK_ACT1_BANDS, HARROWMARK_SPAWNERS } from './harrowmarkSpawners';
import {
  ACT4_CAP_ABOVE_PLAYER,
  ACT4_FIRST_ARRIVAL_ABOVE_PLAYER,
  DRAGONSPINE_LOWER_CAP_ABOVE_PLAYER,
  SUMMIT_CAP_ABOVE_PLAYER,
  WATCH_GUARD_BAND,
  act4BossLevel,
  act4Level,
  bandForRegion,
  blockBaseLevel,
  capAbovePlayer,
  summitLevel,
} from './level';
import type { AnchorLike } from './ports';
import { SpawnerRegistry, type SpawnRequest } from './spawners';
import type { SpawnerDef } from './types';
import { ACT4_QUEST_IDS } from '../quests/lint/act4Ids';
import { Progression } from '../progression/Progression';

const anchor = (id: string, x: number, z: number): AnchorLike => ({ id, position: { x, y: 2, z }, yaw: 0 });
/** Harrowmark's centre, the Waste's Walker Camp, an interior floor (150 m up at the Keep's x, z). */
const ANCHORS = [anchor('hm', 8500, 2000), anchor('waste', 8400, 5900), anchor('keep', 8500, 1700)];

function setup(defs: SpawnerDef[], opts: { player?: number; rolls?: number[]; flags?: Record<string, boolean> | null } = {}) {
  const warn = vi.fn();
  const reqs: SpawnRequest[] = [];
  let n = 0;
  const state = { player: opts.player as number | undefined, rolls: opts.rolls ?? [0], flags: { ...(opts.flags ?? {}) } };
  let i = 0;
  const reg = new SpawnerRegistry({
    anchors: { find: (id) => ANCHORS.find((a) => a.id === id), withTag: () => [] },
    warn,
    spawn: (r) => {
      reqs.push(r);
      return `a${++n}`;
    },
    despawn: () => {},
    rng: () => state.rolls[i++ % state.rolls.length],
    playerLevel: () => state.player,
    ...(opts.flags === null ? {} : { flags: { getFlag: (k: string) => state.flags[k] } }),
  });
  defs.forEach((d) => reg.define(d));
  return { reg, warn, reqs, state };
}

const mk = (over: Partial<SpawnerDef>): SpawnerDef => ({
  id: 's', enemy: 'blighted-soldier', count: 1, anchor: 'hm', band: 'harrowmark', activation: 'manual', respawn: 'onRest', ...over,
});

describe('the shared player-relative cap (A1, Q9 and Q1 on one helper)', () => {
  it('caps at P + cap (success)', () => {
    expect(capAbovePlayer(33, 26, 3)).toBe(29);
    expect(capAbovePlayer(28, 26, 3)).toBe(28);
    expect(capAbovePlayer(30, 26.4, 3)).toBe(29); // P rounds
  });
  it('a null cap or an unknown player leaves the level (failure to bite)', () => {
    expect(capAbovePlayer(33, 26, null)).toBe(33);
    expect(capAbovePlayer(33, undefined, 3)).toBe(33);
    expect(capAbovePlayer(33, NaN, 3)).toBe(33);
    expect(capAbovePlayer(33, 20, -1)).toBe(33); // a negative cap is ignored
  });
  it('the shipped callers keep their numbers (A1 lower Dragonspine, Q9 summit)', () => {
    expect(DRAGONSPINE_LOWER_CAP_ABOVE_PLAYER).toBe(3);
    expect(blockBaseLevel('dragonspine-lower', 4, 19)).toBe(22);
    expect(SUMMIT_CAP_ABOVE_PLAYER).toBe(3);
    expect(summitLevel({ min: 26, max: 28 }, 1, 20)).toBe(23);
    expect(summitLevel({ min: 26, max: 28 }, 1, 30)).toBe(28);
  });
});

describe('act4Level and act4BossLevel', () => {
  const B = { min: 28, max: 33 };
  it('rolls the band, then caps at P + 3 (first arrivals P + 2)', () => {
    expect(ACT4_CAP_ABOVE_PLAYER).toBe(3);
    expect(ACT4_FIRST_ARRIVAL_ABOVE_PLAYER).toBe(2);
    expect(act4Level(B, 1, 26)).toBe(29);
    expect(act4Level(B, 1, 26, true)).toBe(28);
    expect(act4Level(B, 0, 22)).toBe(25); // below the band's min for a lagging player, by design
    expect(act4Level(B, 1, 33)).toBe(33); // a player at the design's level sees the design
  });
  it('null cap restores the band; an unknown P is uncapped; a bad roll reads 0', () => {
    expect(act4Level(B, 1, 20, false, null)).toBe(33);
    expect(act4Level(B, 1, 20, true, null)).toBe(33);
    expect(act4Level(B, 1, undefined)).toBe(33);
    expect(act4Level(B, NaN, 30)).toBe(28);
  });
  it('bosses: the Bellows-Engine 31 and Eormen 35, capped the same way', () => {
    expect(act4BossLevel(31, 26)).toBe(29);
    expect(act4BossLevel(35, 33)).toBe(35);
    expect(act4BossLevel(35, undefined)).toBe(35);
    expect(act4BossLevel(35, 2)).toBe(5);
  });
});

describe('act-scoped region bands (item 2)', () => {
  it('Harrowmark is 4 to 9 before story.gate.a4 and 28 to 33 from it; other regions are unchanged', () => {
    const before = { getFlag: () => undefined };
    const after = { getFlag: (k: string) => k === 'story.gate.a4' };
    expect(regionBandNow('harrowmark', before)).toEqual({ min: 4, max: 9 });
    expect(regionBandNow('harrowmark', after)).toEqual({ min: 28, max: 33 });
    expect(regionBandNow('harrowmark')).toEqual({ min: 4, max: 9 });
    expect(regionBandNow('greyfen', after)).toEqual(REGION_INFO.greyfen.levelBand);
    expect(bandForRegion('harrowmark')).toEqual({ min: 4, max: 9 });
    expect(bandForRegion('harrowmark', after)).toEqual({ min: 28, max: 33 });
    // v0.9: the Caldera is built (Act 5, 35 to 40; capped at spawn).
    expect(bandForRegion('caldera', after)).toEqual({ min: 35, max: 40 });
    expect(bandForRegion('nowhere', after)).toBeUndefined();
  });
  it('the track variant follows the same gate', () => {
    expect(regionTrackNow('harrowmark', { getFlag: () => false })).toBe('seven-gates-one-drum');
    expect(regionTrackNow('harrowmark', { getFlag: (k) => k === 'story.gate.a4' })).toBe('seven-gates-ash');
    expect(regionTrackNow('ashen-waste')).toBe('dust-chant');
  });
  it('the Waste is built at 31 to 35; the Caldera inside it answers itself (v0.9: built)', () => {
    expect(REGION_INFO['ashen-waste'].levelBand).toEqual({ min: 31, max: 35 });
    expect(regionAt(8400, 5900)?.id).toBe('ashen-waste');
    expect(regionAt(13300, 5700)?.id).toBe('ashen-waste');
    expect(regionAt(11000, 8000)?.id).toBe('caldera');
    expect(regionAt(10000, 4450)?.id).not.toBe('ashen-waste'); // Ashgate sits outside the Waste's edge
  });
  it('the harrowmark-a4 area is named-only: areaAt never answers it', () => {
    expect(AREA_BANDS['harrowmark-a4'].band).toEqual({ min: 28, max: 33 });
    expect(areaAt(8500, 1700)).toBeNull();
  });
});

describe('the spawners: Act 4 bands and the cap', () => {
  it('a Harrowmark group spawns at the Act 1 band before the gate (uncapped) and at 28 to 33 capped after', () => {
    const { reg, reqs, state } = setup([mk({})], { player: 26, rolls: [1] });
    reg.spawnGroup('s');
    expect(reqs[0].level).toBe(9);
    state.flags['story.gate.a4'] = true;
    reg.reset('s');
    reg.spawnGroup('s');
    expect(reqs[1].level).toBe(29); // 33 rolled, capped at P + 3
  });

  it('live members keep their level; the new band arrives at the next spawn (nothing re-levels)', () => {
    const { reg, reqs, state } = setup([mk({ count: 2 })], { player: 26, rolls: [1] });
    reg.spawnGroup('s');
    state.flags['story.gate.a4'] = true;
    state.player = 40;
    expect(reqs.map((r) => r.level)).toEqual([9, 9]); // nothing touched
    reg.reset('s');
    reg.spawnGroup('s');
    expect(reqs.slice(2).every((r) => r.level === 33)).toBe(true);
  });

  it('a capped member keeps its level when the player levels mid-fight', () => {
    const { reg, reqs, state } = setup([mk({ count: 1 })], { player: 26, rolls: [1], flags: { 'story.gate.a4': true } });
    reg.spawnGroup('s');
    state.player = 33;
    expect(reqs[0].level).toBe(29);
  });

  it('first arrivals cap at P + 2; the Waste band is always capped; harrowmark-a4 uses its area band', () => {
    const { reg, reqs } = setup(
      [
        mk({ id: 'arrive', firstArrival: true }),
        mk({ id: 'waste', anchor: 'waste', band: 'ashen-waste', enemy: 'ash-wraith' }),
        mk({ id: 'keep', anchor: 'keep', area: 'harrowmark-a4' }),
      ],
      { player: 26, rolls: [1], flags: { 'story.gate.a4': true } },
    );
    reg.spawnGroup('arrive');
    reg.spawnGroup('waste');
    reg.spawnGroup('keep');
    expect(reqs.map((r) => r.level)).toEqual([28, 29, 29]);
  });

  it('with no player level the Act 4 cap is off and warns once', () => {
    const { reg, reqs, warn } = setup([mk({ band: 'ashen-waste', anchor: 'waste', count: 2 })], { player: undefined, rolls: [1] });
    reg.spawnGroup('s');
    expect(reqs.map((r) => r.level)).toEqual([35, 35]);
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('Act 4 cap is off'))).toHaveLength(1);
  });

  it('without a flag reader (older hosts) Harrowmark reads its base band and is never capped', () => {
    const { reg, reqs } = setup([mk({})], { player: 2, rolls: [1], flags: null });
    reg.spawnGroup('s');
    expect(reqs[0].level).toBe(9);
  });

  it('a literal band is never capped, even after the gate (the Act 1 groups)', () => {
    const { reg, reqs } = setup([mk({ band: { min: 6, max: 7 } })], { player: 1, rolls: [1], flags: { 'story.gate.a4': true } });
    reg.spawnGroup('s');
    expect(reqs[0].level).toBe(7);
  });

  it('a wave set that names an area passes it to its spawners (M39 and M46 waves are capped)', () => {
    const set: WaveSetDef = {
      id: 'w', barricadeId: 'b', barricadeHealth: 1, barricadeAnchors: ['hm'], lanes: { l1: 'keep' },
      waves: [{ spawns: [{ lane: 'l1', kind: 'blighted-soldier', count: 2, delay: 0, stagger: 0 }], carts: [] }],
      defenders: [], band: 'harrowmark', area: 'harrowmark-a4', spawnTag: 'w',
    };
    const defs = spawnersFor(set);
    expect(defs.every((d) => d.area === 'harrowmark-a4')).toBe(true);
    const { reg, reqs } = setup(defs, { player: 25, rolls: [1] });
    reg.spawnGroup(defs[0].id);
    expect(reqs.every((r) => r.level === 28)).toBe(true);
    const plain = spawnersFor({ ...set, area: undefined });
    expect(plain.every((d) => !('area' in d))).toBe(true);
  });
});

describe('Harrowmark groups and the band lint (item 2)', () => {
  it('the shipped Act 1 groups keep their bands, named in one table', () => {
    const band = (id: string) => HARROWMARK_SPAWNERS.find((d) => d.id === id)!.band;
    expect(band('r03.guildhall')).toEqual({ min: 5, max: 6 });
    expect(band('m07.thieves')).toEqual({ min: 4, max: 5 });
    expect(band('underways.kennel-1')).toEqual({ min: 6, max: 7 });
    expect(band('grimtooth-summons')).toEqual({ min: 7, max: 8 });
    expect(band('stealth.m06.watch')).toEqual(WATCH_GUARD_BAND);
    expect(band('stealth.m09.clerk')).toEqual(HARROWMARK_ACT1_BANDS.watch);
    expect(WATCH_GUARD_BAND).toEqual({ min: 4, max: 6 });
  });

  it('no group whose activation reads an Act 4 quest or flag names a literal band', () => {
    const act4 = new RegExp(`(^|\\.)(${ACT4_QUEST_IDS.join('|')}|gate\\.a4|gate\\.a5|phase\\.wasteOpen)(\\.|$)`);
    const keysOf = (d: SpawnerDef): string[] => {
      const a = d.activation;
      if (typeof a !== 'object') return [];
      if ('quest' in a) return [a.quest, a.flag ?? ''];
      if ('interior' in a) return [a.interior];
      return [a.flag ?? '', a.until ?? ''];
    };
    const literal = ALL_SPAWNERS.filter((d) => typeof d.band !== 'string' && !d.area && keysOf(d).some((k) => act4.test(k) || ACT4_QUEST_IDS.includes(k)));
    expect(literal.map((d) => d.id)).toEqual([]);
  });

  it('the lint pattern catches an Act 4 group with a literal band (the lint can fail)', () => {
    const bad = mk({ id: 'bad', band: { min: 28, max: 30 }, activation: { quest: 'm35' } });
    const act4 = new RegExp(`(^|\\.)(${ACT4_QUEST_IDS.join('|')})(\\.|$)`);
    expect(act4.test((bad.activation as { quest: string }).quest)).toBe(true);
  });
});

describe('the Harrowmark kill XP factor from story.gate.a4 only (item 21)', () => {
  const flags: Record<string, boolean> = {};
  const port = new KillXpRegionFactor(() => {}, { getFlag: (k) => flags[k] });
  port.set('harrowmark', 2.4, { when: { all: ['story.gate.a4'] } });

  it('reads 1 before the gate and 2.4 after; other regions stay 1', () => {
    delete flags['story.gate.a4'];
    expect(port.factor('harrowmark')).toBe(1);
    flags['story.gate.a4'] = true;
    expect(port.factor('harrowmark')).toBe(2.4);
    expect(port.factor('brightwater')).toBe(1);
    expect(port.factor(null)).toBe(1);
  });

  it("Act 1's kill XP in Harrowmark is unchanged before the gate (census row: a level 5 Footman at player level 5)", () => {
    delete flags['story.gate.a4'];
    const plain = new Progression({ emit: () => {}, actor: () => null });
    const withPort = new Progression({ emit: () => {}, actor: () => null, killXpRegionFactor: () => port });
    const kill = (p: Progression, id: string) => p.onKill({ actorId: id, kind: 'blighted-soldier', team: 'hostile', level: 1, killerId: 'player', regionId: 'harrowmark' });
    expect(kill(withPort, 'x')).toBe(kill(plain, 'x'));
    flags['story.gate.a4'] = true;
    expect(kill(withPort, 'y')).toBeGreaterThan(kill(plain, 'y'));
  });

  it('a condition without a flag reader reads 1 and warns', () => {
    const warn = vi.fn();
    const blind = new KillXpRegionFactor(warn);
    blind.set('harrowmark', 2.4, { when: { all: ['story.gate.a4'] } });
    expect(blind.factor('harrowmark')).toBe(1);
    expect(warn).toHaveBeenCalledOnce();
    const undo = blind.set('ashen-waste', 2.4);
    expect(blind.factor('ashen-waste')).toBe(2.4);
    undo();
    expect(blind.factor('ashen-waste')).toBe(1);
  });
});

describe('v0.8 item 11: Act 4 kinds, skins and boss rules', () => {
  it('reserves the kinds, and every skin dresses a shipped kind', async () => {
    const { ACT4_ENEMY_KINDS } = await import('./types');
    const { ENEMY_SKINS, ENEMY_SKIN_IDS, isEnemySkinId } = await import('./skins');
    const { ENEMY_DEFS } = await import('./defs');
    expect(ACT4_ENEMY_KINDS).toEqual(['waste-strider', 'husk-knight', 'cinder-gnat-swarm']);
    // v0.9 item 11 adds the three Act 5 skins.
    expect(ENEMY_SKIN_IDS.sort()).toEqual(['footman-grisel', 'footman-masked', 'footman-soot', 'golem-lava', 'watch-masked', 'wraith-husk', 'wraith-stoker']);
    for (const id of ENEMY_SKIN_IDS) expect(ENEMY_DEFS[ENEMY_SKINS[id].kind], id).toBeTruthy();
    expect(isEnemySkinId('wraith-husk')).toBe(true);
    expect(isEnemySkinId('nope')).toBe(false);
  });
  it('the skin reaches the actor', async () => {
    const { Actor } = await import('../actors/Actor');
    expect(new Actor('a', { kind: 'ash-wraith', team: 'hostile', maxHealth: 1, skin: 'wraith-husk' }).skin).toBe('wraith-husk');
    expect(new Actor('b', { kind: 'ash-wraith', team: 'hostile', maxHealth: 1 }).skin).toBeUndefined();
  });
  it('boss rules: the Engine takes no mercy, Eormen is released for 20 Burn', async () => {
    const { ACT4_BOSS_RULES, ACT4_BOSS_BASE_LEVEL } = await import('../bosses/act4Bosses');
    expect(ACT4_BOSS_RULES['bellows-engine']).toEqual({ releaseWindowSeconds: 0 });
    expect(ACT4_BOSS_RULES.eormen).toEqual({ mercyVerb: 'release', releaseBurnCost: 20 });
    expect(ACT4_BOSS_BASE_LEVEL).toEqual({ 'bellows-engine': 31, eormen: 35 });
  });
});

describe('v0.8 item 11: SpawnerDef.skin reaches the spawn request', () => {
  it('passes the skin when set, and leaves it off otherwise', () => {
    const { reg, reqs } = setup([mk({ id: 'a', skin: 'footman-soot' }), mk({ id: 'b' })], { player: 5 });
    reg.spawnGroup('a');
    reg.spawnGroup('b');
    expect(reqs[0].skin).toBe('footman-soot');
    expect('skin' in reqs[1]).toBe(false);
  });
});

describe('v0.8 item 11: applyEnemySkin', () => {
  it('hides nodes, tints and lights the materials; an empty skin, an unknown skin or another kind changes nothing', async () => {
    const THREE = await import('three');
    const { applyEnemySkin, ENEMY_SKINS } = await import('./skins');
    const make = () => {
      const root = new THREE.Group();
      const helm = new THREE.Object3D();
      helm.name = 'helm';
      root.add(helm);
      const mat = new THREE.MeshStandardMaterial({ color: 0xffffff });
      return { root, helm, mat, materials: [mat] };
    };
    const warn = vi.fn();
    const a = make();
    applyEnemySkin(a, 'ash-wraith', 'wraith-husk', warn); // L5 filled the husk: a tint and a faint ember, the hat hidden
    expect(a.helm.visible).toBe(true);
    expect(a.mat.color.getHex()).toBe(ENEMY_SKINS['wraith-husk'].tint);
    expect(a.mat.emissive.getHex()).toBe(ENEMY_SKINS['wraith-husk'].emissive);
    const b = make();
    const saved = { ...ENEMY_SKINS['footman-soot'] };
    Object.assign(ENEMY_SKINS['footman-soot'] as object, { hide: ['helm'], tint: 0x808080, emissive: 0x110000 });
    try {
      applyEnemySkin(b, 'blighted-soldier', 'footman-soot', warn);
    } finally {
      for (const k of ['hide', 'tint', 'emissive']) delete (ENEMY_SKINS['footman-soot'] as unknown as Record<string, unknown>)[k];
      Object.assign(ENEMY_SKINS['footman-soot'] as object, saved);
    }
    expect(b.helm.visible).toBe(false);
    expect(b.mat.color.getHex()).toBe(0x808080);
    expect(b.mat.emissive.getHex()).toBe(0x110000);
    const c = make();
    applyEnemySkin(c, 'ash-wraith', 'footman-soot', warn);
    applyEnemySkin(c, 'ash-wraith', 'nope', warn);
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
