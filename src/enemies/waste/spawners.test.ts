// The Waste's ambient groups, their anchors and placement, the census, and the waste-creatures plugin (Act 4 L5).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ALL_SPAWNERS } from '../allSpawners';
import { ENEMY_DEFS } from '../defs';
import { GroupStanding } from '../groupStanding';
import { ENEMY_SKINS } from '../skins';
import { SpawnerRegistry, type SpawnRequest } from '../spawners';
import type { AnchorLike } from '../ports';
import { regionAt } from '../../region/regionMask';
import { ROPE_LINE_GEOMS, SHELTER_SPOTS } from '../../region/act4/ropeLines';
import { createFakeCore } from '../../region/testing/fakeCore';
import { CROSSING, R24_SPRING, WALKER_CAMP, HUSK_CATHEDRAL } from '../../terrain/shape/waste';
import { nearestRopeDistance } from '../../waste/ropeDistance';
import { SLAG, WASTE_SITE_DISCS } from '../../waste/wasteSites';
import { HUSK_CATHEDRAL_DEF } from '../../waste/interiors/huskCathedral';
import { WASTE_LAYOUT } from '../../waste/waste.layout';
import { wasteAmbientCensus } from './census';
import { NAVE_HUSKS_FLAG, NAVE_HUSKS_SPAWNER, WASTE_AMBIENT_GATE, WASTE_AMBIENT_SPAWNERS, WASTE_SPAWNERS } from './spawners';
import { WASTE_KILL_XP_FACTOR } from './tuning';
import { WASTE_FAUNA_GROUPS, WASTE_FAUNA_LAYOUT, wasteGroupCentre } from './wasteFauna.layout';
import plugin, { EORMEN_OUTCOME_FLAG } from './waste.plugin';

const segDist = (x: number, z: number, pts: readonly (readonly [number, number])[]): number => {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1]!;
    const [bx, bz] = pts[i]!;
    const dx = bx - ax;
    const dz = bz - az;
    const l = dx * dx + dz * dz;
    const t = l ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l)) : 0;
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
};

const ANCHOR_IDS = new Set([
  ...WASTE_FAUNA_LAYOUT.anchors.map((a) => a.id),
  ...HUSK_CATHEDRAL_DEF.anchors.map((a) => a.id),
  ...WASTE_LAYOUT.anchors.map((a) => a.id),
]);

function registry(flags: Record<string, unknown>, player: number | undefined, rng = () => 1) {
  const anchors: AnchorLike[] = [...ANCHOR_IDS].map((id, i) => ({ id, position: { x: i, y: 0, z: 0 }, yaw: 0 }));
  const reqs: SpawnRequest[] = [];
  let n = 0;
  const reg = new SpawnerRegistry({
    anchors: { find: (id) => anchors.find((a) => a.id === id), withTag: () => [] },
    warn: vi.fn(),
    spawn: (r) => {
      reqs.push(r);
      return `a${++n}`;
    },
    despawn: () => undefined,
    rng,
    playerLevel: () => player,
    flags: { getFlag: (k) => flags[k] as never },
  });
  WASTE_SPAWNERS.forEach((d) => reg.define(d));
  return { reg, reqs };
}

describe('the Waste ambient groups', () => {
  it('are registered once in the full list, with ids unique across every table', () => {
    const ids = ALL_SPAWNERS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const d of WASTE_SPAWNERS) expect(ids.filter((i) => i === d.id), d.id).toHaveLength(1);
  });

  it('stand on the Waste band behind M42, never refill, one kind and its own skin per spawner, on real anchors', () => {
    for (const d of WASTE_AMBIENT_SPAWNERS) {
      expect(d.band, d.id).toBe('ashen-waste');
      expect(d.activation, d.id).toEqual({ flag: WASTE_AMBIENT_GATE });
      expect(d.respawn, d.id).toBe('never');
      expect(d.memberKinds, d.id).toBeUndefined();
      expect(ENEMY_DEFS[d.enemy as keyof typeof ENEMY_DEFS], d.id).toBeDefined();
      if (d.skin) expect(ENEMY_SKINS[d.skin].kind, d.id).toBe(d.enemy);
      expect(d.enemy === 'ash-wraith', d.id).toBe(d.skin === 'wraith-husk');
      expect(d.memberAnchors, d.id).toHaveLength(d.count);
      for (const m of d.memberAnchors!) expect(ANCHOR_IDS.has(m), `${d.id}: ${m}`).toBe(true);
    }
    expect(WASTE_AMBIENT_SPAWNERS.filter((d) => d.firstArrival).map((d) => d.id)).toEqual(['waste.arrival.cinder-road']);
  });

  it('counts: 24 striders, 6 hounds, 6 gnat swarms, 3 golems, 2 Husk Knights, 28 husks', () => {
    const count = (kind: string) => WASTE_AMBIENT_SPAWNERS.filter((d) => d.enemy === kind).reduce((a, d) => a + d.count, 0);
    expect(count('waste-strider')).toBe(24);
    expect(count('ember-hound')).toBe(6);
    expect(count('cinder-gnat-swarm')).toBe(6);
    expect(count('cinder-golem')).toBe(3);
    expect(count('husk-knight')).toBe(2);
    expect(count('ash-wraith')).toBe(3 + 8 + 12 + 3 + 2);
  });

  it('every anchor id is unique and every group centre is in the open Waste, clear of the lanes, shelters and sites', () => {
    const ids = WASTE_FAUNA_LAYOUT.anchors.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    const ashgateCamp = ROPE_LINE_GEOMS.find((l) => l.id === 'rope.ashgate-camp')!;
    for (const g of WASTE_FAUNA_GROUPS) {
      const c = wasteGroupCentre(g);
      expect(regionAt(c.x, c.z)?.id, g.id).toBe('ashen-waste');
      expect(nearestRopeDistance(c.x, c.z), `${g.id} lane`).toBeGreaterThanOrEqual(25);
      for (const s of SHELTER_SPOTS) expect(Math.hypot(s.at.x - c.x, s.at.z - c.z), `${g.id} shelter ${s.id}`).toBeGreaterThanOrEqual(25);
      expect(segDist(c.x, c.z, ashgateCamp.points), `${g.id} M42 line`).toBeGreaterThanOrEqual(150);
      for (const p of [WALKER_CAMP, R24_SPRING, CROSSING]) expect(Math.hypot(p[0] - c.x, p[1] - c.z), `${g.id} site`).toBeGreaterThanOrEqual(150);
      for (const d of WASTE_SITE_DISCS) expect(Math.hypot(d.at[0] - c.x, d.at[1] - c.z), `${g.id} disc ${d.id}`).toBeGreaterThan(d.radius + 20);
    }
    for (const g of WASTE_FAUNA_GROUPS.filter((x) => x.id.startsWith('glass.gnats'))) {
      const c = wasteGroupCentre(g);
      expect(Math.hypot(SLAG.strike[0] - c.x, SLAG.strike[1] - c.z), g.id).toBeGreaterThanOrEqual(40);
    }
    const knight = wasteGroupCentre(WASTE_FAUNA_GROUPS.find((g) => g.id === 'cathedral.knight')!);
    expect(Math.hypot(HUSK_CATHEDRAL[0] - knight.x, HUSK_CATHEDRAL[1] - knight.z)).toBeGreaterThanOrEqual(40);
  });

  it('roll in the Waste band capped at P + 3 (the arrival P + 2): a level 28 player meets 31 there, 30 on the road', () => {
    const { reg, reqs } = registry({ [WASTE_AMBIENT_GATE]: true }, 28);
    reg.spawnGroup('waste.dunes.1');
    expect(reqs.map((r) => r.level)).toEqual([31, 31, 31]);
    reqs.length = 0;
    reg.spawnGroup('waste.arrival.cinder-road');
    expect(reqs.map((r) => [r.level, r.skin])).toEqual([[30, 'wraith-husk'], [30, 'wraith-husk'], [30, 'wraith-husk']]);
  });

  it('the cap never lifts the band: a level 20 player meets 23, a level 34 player the band (31 to 35)', () => {
    const low = registry({}, 20, () => 0);
    low.reg.spawnGroup('waste.glass.knight');
    expect(low.reqs[0]!.level).toBe(23);
    const high = registry({}, 34, () => 0);
    high.reg.spawnGroup('waste.glass.knight');
    expect(high.reqs[0]!.level).toBe(31);
    const top = registry({}, 34, () => 1);
    top.reg.spawnGroup('waste.glass.knight');
    expect(top.reqs[0]!.level).toBe(35);
  });

  it('the nave night husks stand on ash.4 to ash.6 (Eormen keeps 1 to 3), rise after each rest, behind the derived flag', () => {
    expect(NAVE_HUSKS_SPAWNER.memberAnchors).toEqual(['waste.cathedral.nave.ash.4', 'waste.cathedral.nave.ash.5', 'waste.cathedral.nave.ash.6']);
    expect(NAVE_HUSKS_SPAWNER.respawn).toBe('onRest');
    expect(NAVE_HUSKS_SPAWNER.activation).toEqual({ flag: NAVE_HUSKS_FLAG });
    expect(NAVE_HUSKS_SPAWNER.skin).toBe('wraith-husk');
  });

  it('a Husk Knight lying in its heap still stands for its group; released there, the group is cleared', () => {
    const listeners = new Map<string, Set<(p: unknown) => void>>();
    const emit = (t: string, p: unknown) => listeners.get(t)?.forEach((l) => l(p));
    const dead = new Set<string>(['h1']);
    const gs = new GroupStanding({
      alive: () => ['k', 'h1'],
      isDead: (a) => dead.has(a),
      on: (t, fn) => {
        const s = listeners.get(t) ?? new Set();
        s.add(fn as (p: unknown) => void);
        listeners.set(t, s);
        return () => s.delete(fn as (p: unknown) => void);
      },
    });
    expect(gs.isCleared('waste.glass.knight')).toBe(false); // the heaped knight is alive at 1 HP
    emit('mercy', { actorId: 'k' });
    expect(gs.isCleared('waste.glass.knight')).toBe(true);
    gs.dispose();
  });
});

describe('the Waste census', () => {
  it('pays every member once at the player level through the x 2.4 factor; the arrival pays its P + 2 level', () => {
    const at28 = wasteAmbientCensus(WASTE_AMBIENT_SPAWNERS, { playerLevel: 28 });
    expect(at28.rows).toHaveLength(WASTE_AMBIENT_SPAWNERS.length);
    expect(Math.abs(at28.total - at28.rows.reduce((a, r) => a + r.xp, 0))).toBeLessThanOrEqual(at28.rows.length);
    // A strider at 31 for a level 28 player: 67 x 1.45 x 2.4 = 233.
    const dunes = at28.rows.find((r) => r.id === 'waste.dunes.1')!;
    expect(dunes.xp).toBe(3 * 233);
    const factorOne = wasteAmbientCensus(WASTE_AMBIENT_SPAWNERS, { playerLevel: 28, regionFactor: 1 });
    expect(at28.total / factorOne.total).toBeGreaterThan(2.35);
    expect(at28.total / factorOne.total).toBeLessThan(2.45);
  });

  it('a level 34 player meets the rolled band, so the census falls as the player outgrows it', () => {
    const at30 = wasteAmbientCensus(WASTE_AMBIENT_SPAWNERS, { playerLevel: 30 }).total;
    const at34 = wasteAmbientCensus(WASTE_AMBIENT_SPAWNERS, { playerLevel: 34 }).total;
    expect(at34).toBeLessThan(at30);
    expect(WASTE_KILL_XP_FACTOR).toBe(2.4);
  });
});

describe('waste-creatures plugin', () => {
  afterEach(() => plugin.dispose?.());

  function setup(opts: { factor?: boolean } = {}) {
    const fc = createFakeCore();
    const factors = new Map<string, number>();
    if (opts.factor ?? true) {
      fc.services.set('killXpRegionFactor', {
        set(region: string, f: number) {
          factors.set(region, f);
          return () => factors.delete(region);
        },
      });
    }
    return { fc, factors };
  }

  it('defines every fauna anchor, the Waste factor and the four rules; dispose undoes them', () => {
    const s = setup();
    plugin.setup(s.fc.ctx);
    expect(s.fc.anchors.size).toBe(WASTE_FAUNA_LAYOUT.anchors.length);
    expect(s.factors.get('ashen-waste')).toBe(WASTE_KILL_XP_FACTOR);
    for (const id of ['waste.strider-trip', 'waste.husk-ember', 'waste.gnats-scatter', 'waste.husk-rise']) expect(s.fc.modifiers.has(id), id).toBe(true);
    plugin.dispose?.();
    expect(s.fc.anchors.size).toBe(0);
    expect(s.factors.has('ashen-waste')).toBe(false);
    expect(s.fc.modifiers.has('waste.husk-rise')).toBe(false);
  });

  it('with no factor service it warns and still sets up', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const s = setup({ factor: false });
    plugin.setup(s.fc.ctx);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('killXpRegionFactor'));
    expect(s.fc.anchors.size).toBeGreaterThan(0);
    warn.mockRestore();
  });

  it('derives the nave flag: on only once Eormen is defeated (not released), and again from a load', () => {
    const s = setup();
    plugin.setup(s.fc.ctx);
    const st = s.fc.ctx.state;
    expect(st.getBool(NAVE_HUSKS_FLAG, false)).toBe(false);
    st.setFlag(EORMEN_OUTCOME_FLAG, 'released');
    expect(st.getBool(NAVE_HUSKS_FLAG, false)).toBe(false);
    st.setFlag(EORMEN_OUTCOME_FLAG, 'defeated');
    expect(st.getBool(NAVE_HUSKS_FLAG, false)).toBe(true);
    // A load of an older save (no outcome) clears it.
    (st as unknown as { setFlag(k: string, v: unknown): void }).setFlag(EORMEN_OUTCOME_FLAG, undefined as never);
    s.fc.ctx.events.emit('save.loaded', {} as never);
    expect(st.getBool(NAVE_HUSKS_FLAG, false)).toBe(false);
  });

  it('a defeated outcome already in the state sets the flag at setup', () => {
    const s = setup();
    s.fc.ctx.state.setFlag(EORMEN_OUTCOME_FLAG, 'defeated');
    plugin.setup(s.fc.ctx);
    expect(s.fc.ctx.state.getBool(NAVE_HUSKS_FLAG, false)).toBe(true);
  });
});

describe('the Waste fauna anchor doc', () => {
  it('WASTE_FAUNA_ANCHORS.md matches the layout (regenerate with tools/gen-region-docs.ts)', async () => {
    const { readFileSync } = await import('../../region/testing/nodeFs');
    const { renderAnchorsDoc } = await import('../../region/anchorsDoc');
    const { WASTE_FAUNA_DOC } = await import('./wasteFauna.layout');
    expect(readFileSync('src/enemies/waste/WASTE_FAUNA_ANCHORS.md', 'utf8')).toBe(renderAnchorsDoc(WASTE_FAUNA_LAYOUT, WASTE_FAUNA_DOC));
  });
});
