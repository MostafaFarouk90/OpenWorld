import { describe, expect, it, vi } from 'vitest';
import { killXp } from '../../progression/tuning';
import { renderAnchorsDoc } from '../../region/anchorsDoc';
import { engineBox } from '../../region/regions';
import { readFileSync } from '../../region/testing/nodeFs';
import { ACT3_AMBIENT_GATE, GREYFEN_SPAWNERS } from '../act3Spawners';
import { ACT3_BLOCKS } from '../level';
import type { AnchorLike } from '../ports';
import { SpawnRequest, SpawnerRegistry } from '../spawners';
import type { SpawnerDef } from '../types';
import { act3AmbientCensus } from './census';
import { GREYFEN_KILL_XP_FACTOR } from './fen.plugin';
import {
  ARRIVAL_SITES,
  FEN_ROAD_PROXY,
  GREYFEN_FAUNA_DOC,
  GREYFEN_FAUNA_GROUPS,
  GREYFEN_FAUNA_LAYOUT,
  MERE_DEEP_RADIUS,
  QUEST_SITES,
  groupCentre,
  greyfenSite,
} from './greyfenFauna.layout';

const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

/** Distance from p to the segment a-b. */
function segDist(p: { x: number; z: number }, a: readonly [number, number], b: readonly [number, number]): number {
  const [ax, az] = a;
  const [bx, bz] = b;
  const dx = bx - ax;
  const dz = bz - az;
  const t = Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.z - az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(p.x - (ax + t * dx), p.z - (az + t * dz));
}

describe('Greyfen ambient groups (GREYFEN_SPAWNERS)', () => {
  it('every group is on the greyfen block and band, gated on story.gate.a3, refilled on rest', () => {
    expect(GREYFEN_SPAWNERS.length).toBe(GREYFEN_FAUNA_GROUPS.length);
    expect(new Set(GREYFEN_SPAWNERS.map((d) => d.id)).size).toBe(GREYFEN_SPAWNERS.length);
    for (const d of GREYFEN_SPAWNERS) {
      expect(d.id.startsWith('greyfen.')).toBe(true);
      expect(d.block).toBe('greyfen');
      expect(d.band).toBe('greyfen');
      expect(d.activation).toEqual({ flag: ACT3_AMBIENT_GATE });
      expect(d.respawn).toBe('onRest');
      expect(d.memberAnchors).toHaveLength(d.count);
    }
    expect(ACT3_AMBIENT_GATE).toBe('story.gate.a3');
  });

  it('the plan mix: ten leech knots of three, five shamblers, four hunter camps of four, one wraith group', () => {
    const by = (enemy: string) => GREYFEN_SPAWNERS.filter((d) => d.enemy === enemy);
    expect(by('fen-leech').map((d) => d.count)).toEqual(Array(10).fill(3));
    expect(by('peat-shambler').map((d) => d.count)).toEqual(Array(5).fill(1));
    expect(by('hunter-spearman').map((d) => d.count)).toEqual(Array(4).fill(4));
    expect(by('ash-wraith').map((d) => d.count)).toEqual([4]);
    for (const d of by('hunter-spearman')) expect(d.memberKinds).toContain('hunter-harpooner');
  });

  it('only the first-arrival groups narrow their span, to 1', () => {
    const first = GREYFEN_SPAWNERS.filter((d) => d.blockSpan !== undefined);
    expect(first.map((d) => d.id).sort()).toEqual(['greyfen.hunters.east-edge', 'greyfen.leech.reedgate-causeway']);
    for (const d of first) expect(d.blockSpan).toBe(1);
  });
});

describe('Greyfen fauna anchors', () => {
  const box = engineBox('greyfen');
  const anchors = GREYFEN_FAUNA_LAYOUT.anchors;

  it('one anchor per member, ids under greyfen.fauna., unique', () => {
    expect(anchors.length).toBe(GREYFEN_SPAWNERS.reduce((n, d) => n + d.count, 0));
    expect(new Set(anchors.map((a) => a.id)).size).toBe(anchors.length);
    for (const a of anchors) expect(a.id.startsWith('greyfen.fauna.')).toBe(true);
    const ids = new Set(anchors.map((a) => a.id));
    for (const d of GREYFEN_SPAWNERS) for (const m of d.memberAnchors!) expect(ids.has(m)).toBe(true);
  });

  it('every anchor lies inside the Greyfen box', () => {
    for (const a of anchors) {
      expect(a.x, a.id).toBeGreaterThanOrEqual(box.x0);
      expect(a.x, a.id).toBeLessThan(box.x1);
      expect(a.z, a.id).toBeGreaterThanOrEqual(box.z0);
      expect(a.z, a.id).toBeLessThan(box.z1);
    }
  });

  it('keeps 12 m off the Fen Road and out of the Mere deep water', () => {
    const mere = greyfenSite('mere');
    for (const a of anchors) {
      expect(segDist(a, FEN_ROAD_PROXY[0]!, FEN_ROAD_PROXY[1]!), a.id).toBeGreaterThanOrEqual(12);
      expect(dist(a, mere), a.id).toBeGreaterThan(MERE_DEEP_RADIUS);
    }
  });

  it('keeps 150 m from every quest site', () => {
    for (const a of anchors) for (const s of QUEST_SITES) expect(dist(a, greyfenSite(s)), `${a.id} ${s}`).toBeGreaterThanOrEqual(150);
  });

  it('nothing within 300 m of an arrival point; the first-arrival groups stand 300 to 600 m out', () => {
    for (const g of GREYFEN_FAUNA_GROUPS) {
      const c = groupCentre(g);
      const nearest = Math.min(...ARRIVAL_SITES.map((s) => dist(c, greyfenSite(s))));
      expect(nearest, g.id).toBeGreaterThanOrEqual(300);
      if (g.firstArrival) expect(nearest, g.id).toBeLessThanOrEqual(600);
    }
  });

  it('GREYFEN_FAUNA_ANCHORS.md matches the layout (regenerate with tools/gen-region-docs.ts)', () => {
    expect(readFileSync('src/enemies/fen/GREYFEN_FAUNA_ANCHORS.md', 'utf8')).toBe(renderAnchorsDoc(GREYFEN_FAUNA_LAYOUT, GREYFEN_FAUNA_DOC));
  });
});

const anchor = (id: string): AnchorLike => ({ id, position: { x: 3000, y: 2, z: 12500 }, yaw: 0 });

function registry(defs: SpawnerDef[], opts: { player?: number; rolls?: number[] } = {}) {
  const warn = vi.fn();
  const reqs: SpawnRequest[] = [];
  let n = 0;
  let i = 0;
  const rolls = opts.rolls ?? [0];
  const reg = new SpawnerRegistry({
    anchors: { find: (id) => anchor(id), withTag: () => [] },
    warn,
    spawn: (r) => {
      reqs.push(r);
      return `a${++n}`;
    },
    despawn: () => {},
    rng: () => rolls[i++ % rolls.length]!,
    playerLevel: () => opts.player,
  });
  defs.forEach((d) => reg.define(d));
  return { reg, warn, reqs };
}

const mk = (over: Partial<SpawnerDef>): SpawnerDef => ({
  id: 's', enemy: 'fen-leech', count: 1, anchor: 'gf', band: 'greyfen', block: 'greyfen', activation: 'manual', respawn: 'onRest', ...over,
});

describe('SpawnerDef.blockSpan (coordinator ruling C)', () => {
  const levels = (over: Partial<SpawnerDef>, L: number, rolls = [0, 0.4, 0.6, 1]) => {
    const r = registry([mk({ count: rolls.length, ...over })], { player: L, rolls });
    r.reg.lockBlockLevel('greyfen', L);
    r.reg.spawnGroup('s');
    return { levels: r.reqs.map((q) => q.level), warn: r.warn };
  };

  it('a first-arrival group rolls L to L + 1 in both orders (Greyfen first L 18, second L 21)', () => {
    expect(levels({ blockSpan: 1 }, 18).levels).toEqual([18, 18, 19, 19]);
    expect(levels({ blockSpan: 1 }, 21).levels).toEqual([21, 21, 22, 22]);
    expect(levels({}, 18).levels).toEqual([18, 20, 21, 23]);
  });

  it('0 is exactly L; the block span itself is allowed', () => {
    expect(levels({ blockSpan: 0 }, 18).levels).toEqual([18, 18, 18, 18]);
    const full = levels({ blockSpan: ACT3_BLOCKS.greyfen.span }, 18);
    expect(full.levels).toEqual([18, 20, 21, 23]);
    expect(full.warn).not.toHaveBeenCalled();
  });

  it.each([[-1], [Number.NaN], [1.5], [ACT3_BLOCKS.greyfen.span + 1], [Infinity]])('%s warns once and uses the block span', (bad) => {
    const r = levels({ blockSpan: bad }, 18);
    expect(r.levels).toEqual([18, 20, 21, 23]);
    expect(r.warn).toHaveBeenCalledOnce();
    expect(String(r.warn.mock.calls[0]![0])).toContain('blockSpan');
  });

  it('the preview before the lock narrows the same way', () => {
    const r = registry([mk({ count: 2, blockSpan: 1 })], { player: 18, rolls: [1] });
    r.reg.setWarmthTier(3);
    r.reg.spawnGroup('s');
    expect(r.reqs.map((q) => q.level)).toEqual([19, 19]);
  });
});

describe('Greyfen kill XP (coordinator ruling A)', () => {
  const F = GREYFEN_KILL_XP_FACTOR;
  it('at parity a leech pays 70, a shambler 220, a spearman 117 in the Greyfen', () => {
    expect(F).toBe(1.8);
    expect(killXp('fen-leech', 20, 20, F)).toBe(70);
    expect(killXp('peat-shambler', 20, 20, F)).toBe(220);
    expect(killXp('hunter-spearman', 20, 20, F)).toBe(117);
  });

  it('outside the Greyfen (factor 1) they pay the stored rows', () => {
    expect(killXp('fen-leech', 20, 20)).toBe(39);
    expect(killXp('peat-shambler', 20, 20)).toBe(122);
  });

  it('the stored rows times 1.8 land on the design figures (parity check)', () => {
    expect(Math.round(39 * F)).toBe(70);
    expect(Math.round(122 * F)).toBe(220);
  });
});

describe('the Greyfen ambient census (plan 7.2; K16 owns the final figure)', () => {
  const L = 18;
  it('parity: at least 5,000 XP in the Greyfen ambient share; rolled is higher; no factor is lower', () => {
    const parity = act3AmbientCensus(GREYFEN_SPAWNERS, { level: L, playerLevel: L, regionFactor: GREYFEN_KILL_XP_FACTOR });
    const rolled = act3AmbientCensus(GREYFEN_SPAWNERS, { level: L, playerLevel: L, regionFactor: GREYFEN_KILL_XP_FACTOR, mode: 'rolled' });
    const bare = act3AmbientCensus(GREYFEN_SPAWNERS, { level: L, playerLevel: L });
    // For K16: the census at the block's L, parity and rolled.
    console.info(`[K6b census] Greyfen ambient at L ${L}: parity ${parity.total} XP, rolled average ${rolled.total} XP, no factor ${bare.total} XP`);
    expect(parity.total).toBeGreaterThanOrEqual(5000);
    expect(rolled.total).toBeGreaterThan(parity.total);
    expect(bare.total).toBeLessThan(parity.total);
    expect(parity.rows).toHaveLength(GREYFEN_SPAWNERS.length);
  });

  it('a rolled row weighs the span ends half (a first-arrival knot is the mean of L and L + 1)', () => {
    const knot = GREYFEN_SPAWNERS.find((d) => d.id === 'greyfen.leech.reedgate-causeway')!;
    const { rows } = act3AmbientCensus([knot], { level: L, playerLevel: L, regionFactor: GREYFEN_KILL_XP_FACTOR, mode: 'rolled' });
    const expected = 3 * ((killXp('fen-leech', L, L, 1.8) + killXp('fen-leech', L + 1, L, 1.8)) / 2);
    expect(rows[0]!.xp).toBe(Math.round(expected));
  });

  it('a kind with no XP row pays 0', () => {
    const d = { ...GREYFEN_SPAWNERS[0]!, enemy: 'no-such-kind' as SpawnerDef['enemy'] };
    expect(act3AmbientCensus([d], { level: L, playerLevel: L }).total).toBe(0);
  });
});

describe('ambient groups stay out of the story', () => {
  it('no K6b module writes an M27 witness (a spared ambient hunter is only a mercy)', () => {
    const files = ['src/enemies/act3Spawners.ts', 'src/enemies/fen/fen.plugin.ts', 'src/enemies/fen/greyfenFauna.layout.ts', 'src/enemies/fen/shambler/peat.ts', 'src/enemies/fen/leech/lurk.ts'];
    for (const f of files) expect(readFileSync(f, 'utf8'), f).not.toMatch(/story\.m27|witness/);
  });
});
