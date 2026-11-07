// v0.9 items 1, 2 and 11: the Caldera's named areas and the Act 5 cap (Q3) on the shared helper, the kill XP factor by
// area (a `caldera-*` member pays the Caldera's x 3.0 inside the Waste's box too), the area lint, the Act 5 kinds and
// skins, and the role and area a spawner leaves on its member.
import { describe, expect, it, vi } from 'vitest';
import { KillXpRegionFactor } from '../core/scalePorts';
import { AREA_BANDS, CALDERA_AREA_IDS, areaAt, isCalderaArea } from '../region/areas';
import { CALDERA_KILL_XP_FACTOR, CALDERA_CENTRE } from '../region/act5Regions';
import { spawnersFor } from '../waves/spawners';
import type { WaveSetDef } from '../waves/types';
import { ALL_SPAWNERS } from './allSpawners';
import { calderaAreaLint } from './act5Lint';
import {
  ACT4_CAP_ABOVE_PLAYER,
  ACT5_CAP_ABOVE_PLAYER,
  ACT5_FIRST_ARRIVAL_ABOVE_PLAYER,
  act4BossLevel,
  act4Level,
  act5BossLevel,
  act5Level,
} from './level';
import type { AnchorLike } from './ports';
import { SpawnerRegistry, type SpawnRequest } from './spawners';
import type { SpawnerDef } from './types';
import { killXpRegionOf, spawnDataOf, SPAWN_DATA_KEY } from './spawnData';
import { ACT5_BOSS_BASE_LEVEL, ACT5_BOSS_IDS, ACT5_BOSS_RULES } from '../bosses/act5Bosses';
import { Progression } from '../progression/Progression';

const anchor = (id: string, x: number, z: number): AnchorLike => ({ id, position: { x, y: 2, z }, yaw: 0 });
/** The Rim Camp inside the Caldera; a rim-stair anchor inside the Waste's box below the crest; a Waste anchor. */
const ANCHORS = [anchor('caldera.camp', 11000, 6750), anchor('caldera.stair.1', 11000, 6300), anchor('waste', 8400, 5900)];

function setup(defs: SpawnerDef[], opts: { player?: number; rolls?: number[] } = {}) {
  const warn = vi.fn();
  const reqs: SpawnRequest[] = [];
  let n = 0;
  const state = { player: opts.player as number | undefined, rolls: opts.rolls ?? [0] };
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
    flags: { getFlag: (k: string) => k === 'story.gate.a5' || k === 'story.gate.a4' },
  });
  defs.forEach((d) => reg.define(d));
  return { reg, warn, reqs, state };
}

const mk = (over: Partial<SpawnerDef>): SpawnerDef => ({
  id: 's', enemy: 'blighted-soldier', count: 1, anchor: 'caldera.camp', band: 'caldera', area: 'caldera-rim', activation: 'manual', respawn: 'onRest', ...over,
});

describe('item 1: the Caldera areas', () => {
  it('six named-only areas with the plan bands, all paying the Caldera factor', () => {
    expect(CALDERA_AREA_IDS).toEqual(['caldera-rim', 'caldera-stair', 'caldera-terraces', 'caldera-foundry', 'caldera-anvil', 'caldera-siege']);
    expect(CALDERA_AREA_IDS.map((a) => [AREA_BANDS[a].band.min, AREA_BANDS[a].band.max])).toEqual([[35, 36], [35, 37], [36, 37], [37, 39], [39, 40], [37, 37]]);
    for (const a of CALDERA_AREA_IDS) {
      expect(AREA_BANDS[a].namedOnly, a).toBe(true);
      expect(AREA_BANDS[a].killXpRegion, a).toBe('caldera');
    }
    expect(areaAt(CALDERA_CENTRE.x, CALDERA_CENTRE.z)).toBeNull(); // named only: never answered by position
    expect(isCalderaArea('caldera-rim')).toBe(true);
    expect(isCalderaArea('harrowmark-a4')).toBe(false);
    expect(isCalderaArea(undefined)).toBe(false);
  });
});

describe('item 2: the Act 5 cap (Q3)', () => {
  it('rolls the band then caps at P + 3; first arrivals at P + 2; null restores the band', () => {
    expect(ACT5_CAP_ABOVE_PLAYER).toBe(3);
    expect(ACT5_FIRST_ARRIVAL_ABOVE_PLAYER).toBe(2);
    expect(act5Level({ min: 37, max: 39 }, 1, 33)).toBe(36);
    expect(act5Level({ min: 37, max: 39 }, 1, 33, true)).toBe(35);
    expect(act5Level({ min: 37, max: 39 }, 1, 40)).toBe(39);
    expect(act5Level({ min: 37, max: 39 }, 1, 33, false, null)).toBe(39);
    expect(act5Level({ min: 37, max: 39 }, NaN, 33)).toBe(36 > 37 ? 37 : 36); // a bad roll reads 0: 37, capped at 36
    expect(act5Level({ min: 39, max: 40 }, 1, undefined)).toBe(40); // no player: uncapped
  });
  it('the Act 4 and Act 5 rules share one function (same numbers for the same caps)', () => {
    expect(ACT4_CAP_ABOVE_PLAYER).toBe(ACT5_CAP_ABOVE_PLAYER);
    for (const p of [20, 30, 33, 38]) for (const r of [0, 0.5, 1]) for (const f of [false, true]) {
      expect(act5Level({ min: 35, max: 40 }, r, p, f)).toBe(act4Level({ min: 35, max: 40 }, r, p, f));
    }
    expect(act5BossLevel(40, 33)).toBe(act4BossLevel(40, 33));
  });
  it('the bosses: Vey 38, Ulthred 40, capped the same way', () => {
    expect(ACT5_BOSS_BASE_LEVEL).toEqual({ vey: 38, ulthred: 40 });
    expect(act5BossLevel(ACT5_BOSS_BASE_LEVEL.ulthred, 35)).toBe(38);
    expect(act5BossLevel(ACT5_BOSS_BASE_LEVEL.vey, 39)).toBe(38);
  });
  it('a Caldera spawner rolls its area band and is capped at spawn; its member keeps its level', () => {
    const { reg, reqs, state } = setup([mk({ area: 'caldera-foundry' })], { player: 33, rolls: [1] });
    reg.spawnGroup('s');
    expect(reqs[0].level).toBe(36);
    state.player = 40;
    expect(reqs[0].level).toBe(36);
  });
  it("a spawner with the 'caldera' band and no area is still capped (the lint catches it)", () => {
    const { reg, reqs } = setup([mk({ area: undefined })], { player: 30, rolls: [1] });
    reg.spawnGroup('s');
    expect(reqs[0].level).toBe(33);
    expect(calderaAreaLint([mk({ area: undefined })])).toEqual([{ id: 's', why: 'names no caldera-* area' }]);
  });
  it('with no player level the Act 5 cap is off and warns once', () => {
    const { reg, reqs, warn } = setup([mk({ count: 2, area: 'caldera-anvil' })], { player: undefined, rolls: [1] });
    reg.spawnGroup('s');
    expect(reqs.map((r) => r.level)).toEqual([40, 40]);
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('Act 5 cap is off'))).toHaveLength(1);
  });
  it('a wave set with area caldera-siege is capped; an Act 4 spawner is untouched', () => {
    const set: WaveSetDef = {
      id: 'w', barricadeId: 'b', barricadeHealth: 1, barricadeAnchors: ['caldera.camp'], lanes: { l1: 'caldera.stair.1' },
      waves: [{ spawns: [{ lane: 'l1', kind: 'blighted-soldier', count: 2, delay: 0, stagger: 0 }], carts: [] }],
      defenders: [], band: 'caldera', area: 'caldera-siege', spawnTag: 'w',
    };
    const defs = spawnersFor(set);
    const { reg, reqs } = setup([...defs, mk({ id: 'a4', band: 'ashen-waste', area: undefined, anchor: 'waste', enemy: 'ash-wraith' })], { player: 33, rolls: [1] });
    reg.spawnGroup(defs[0].id);
    expect(reqs.every((r) => r.level === 36)).toBe(true);
    reg.spawnGroup('a4');
    expect(reqs[reqs.length - 1].level).toBe(35); // the Waste's 35, capped at P + 3 = 36: untouched by Act 5
    expect(calderaAreaLint(defs)).toEqual([]);
  });
});

describe('item 1 change 1: the kill XP factor answers by area', () => {
  it('a caldera-rim member on the rim stairs (in the Waste box) carries its area and pays x 3.0', () => {
    const { reg, reqs } = setup([mk({ anchor: 'caldera.stair.1', band: 'caldera', area: 'caldera-rim' })], { player: 35, rolls: [0] });
    reg.spawnGroup('s');
    expect(reqs[0].area).toBe('caldera-rim');
    const data: Record<string, unknown> = { [SPAWN_DATA_KEY]: { area: reqs[0].area } };
    expect(killXpRegionOf(data)).toBe('caldera');
    const port = new KillXpRegionFactor();
    port.set('ashen-waste', 2.4);
    port.set('caldera', CALDERA_KILL_XP_FACTOR);
    expect(port.factor(killXpRegionOf(data))).toBe(3.0);
    expect(port.factor('ashen-waste')).toBe(2.4);
  });
  it('no area, or a non-Caldera area, falls back to the position (null here)', () => {
    expect(killXpRegionOf({})).toBeNull();
    expect(killXpRegionOf(undefined)).toBeNull();
    expect(killXpRegionOf({ [SPAWN_DATA_KEY]: { area: 'harrowmark-a4' } })).toBeNull();
    expect(killXpRegionOf({ [SPAWN_DATA_KEY]: { area: 'nowhere' } })).toBeNull();
    expect(killXpRegionOf({ [SPAWN_DATA_KEY]: 'junk' })).toBeNull();
  });
  it('the factor scales a kill through Progression', () => {
    const port = new KillXpRegionFactor();
    port.set('caldera', CALDERA_KILL_XP_FACTOR);
    port.set('ashen-waste', 2.4);
    const kill = (regionId: string | null) =>
      new Progression({ emit: () => {}, actor: () => null, killXpRegionFactor: () => port }).onKill({ actorId: 'a', kind: 'blighted-soldier', team: 'hostile', level: 1, killerId: 'player', regionId });
    expect(kill('caldera')).toBeGreaterThan(kill('ashen-waste'));
    expect(kill('ashen-waste')).toBeGreaterThan(kill(null));
  });
});

describe('item 11: the role and the area reach the spawn', () => {
  it('a role is passed on; a spawner with neither leaves nothing', () => {
    const { reg, reqs } = setup([mk({ role: 'shield' }), mk({ id: 'plain', band: 'ashen-waste', area: undefined, anchor: 'waste', enemy: 'ash-wraith' })], { player: 35 });
    reg.spawnGroup('s');
    reg.spawnGroup('plain');
    expect(reqs[0].role).toBe('shield');
    expect(reqs[0].area).toBe('caldera-rim');
    expect('role' in reqs[1]).toBe(false);
    expect('area' in reqs[1]).toBe(false);
    expect(spawnDataOf({ [SPAWN_DATA_KEY]: { role: 'pike' } })).toEqual({ role: 'pike' });
  });
});

describe('item 18: the Caldera area lint', () => {
  it('passes every shipped spawner, and fails a Caldera anchor or box spawner without an area', () => {
    expect(calderaAreaLint(ALL_SPAWNERS)).toEqual([]);
    const at = (id: string) => (id === 'in-box' ? { x: 11000, z: 8000 } : undefined);
    expect(calderaAreaLint([mk({ id: 'x', anchor: 'caldera.camp', band: 'ashen-waste', area: undefined })]).map((r) => r.id)).toEqual(['x']);
    expect(calderaAreaLint([mk({ id: 'y', anchor: 'in-box', band: 'ashen-waste', area: undefined })], at).map((r) => r.id)).toEqual(['y']);
    expect(calderaAreaLint([mk({ id: 'z', area: 'harrowmark-a4' })])[0].why).toMatch(/not a caldera/);
  });
});

describe('item 7: the Act 5 boss rules', () => {
  it('Vey is spared through four breaks in one phase; Ulthred has no mercy, three phases of three', () => {
    expect(ACT5_BOSS_IDS).toEqual({ vey: 'vey', ulthred: 'ulthred' });
    expect(ACT5_BOSS_RULES.vey).toEqual({ mercyVerb: 'spare', phases: [], breaksPerPhase: 4 });
    expect(ACT5_BOSS_RULES.ulthred).toEqual({ releaseWindowSeconds: 0, phases: [0.66, 0.33], breaksPerPhase: 3 });
  });
});

describe('item 11: the Act 5 kinds and skins', () => {
  it('reserves warhost-soldier; the three skins dress shipped kinds and draw like them', async () => {
    const { ACT5_ENEMY_KINDS, WARHOST_ROLES } = await import('./types');
    const { ENEMY_SKINS } = await import('./skins');
    const { ENEMY_DEFS } = await import('./defs');
    // N5 adds kinds (warhost-guard) and their defs; the row only ever holds warhost kinds, soldier first.
    expect(ACT5_ENEMY_KINDS[0]).toBe('warhost-soldier');
    expect(new Set(ACT5_ENEMY_KINDS).size).toBe(ACT5_ENEMY_KINDS.length);
    for (const k of ACT5_ENEMY_KINDS) expect(k.startsWith('warhost-'), k).toBe(true);
    expect(WARHOST_ROLES).toEqual(['shield', 'pike', 'torch']);
    for (const [id, kind] of [['footman-grisel', 'blighted-soldier'], ['wraith-stoker', 'ash-wraith'], ['golem-lava', 'cinder-golem']] as const) {
      expect(ENEMY_SKINS[id]).toMatchObject({ kind }); // N5 adds the overrides
      expect(ENEMY_DEFS[kind], id).toBeTruthy();
    }
  });
});
