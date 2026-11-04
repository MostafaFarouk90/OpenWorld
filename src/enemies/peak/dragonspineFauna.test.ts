// The Dragonspine's ambient groups (plans/act3-K6b-pr2.md section 5): the defs, the anchors, the first arrivals, the summit
// cap, the Aerie wyrms' gate, the kill XP and the both-region census (plan 7.2; K16 owns the final figure).
import { describe, expect, it, vi } from 'vitest';
import { killXp } from '../../progression/tuning';
import { renderAnchorsDoc } from '../../region/anchorsDoc';
import { areaAt } from '../../region/areas';
import { engineBox } from '../../region/regions';
import { readFileSync } from '../../region/testing/nodeFs';
import { dragonspineBuild } from '../../dragonspine/layout';
import { WYRMS_HEARTH_PLATEAU } from '../../terrain/shape/dragonspine';
import {
  ACT3_AMBIENT_GATE,
  ACT3_SPAWNERS,
  AERIE_WYRMS_AWAY_FLAG,
  AERIE_WYRM_SPAWNERS,
  DRAGONSPINE_SPAWNERS,
  GREYFEN_SPAWNERS,
  R18_PARENTS_SPAWNER,
  SUMMIT_AMBIENT_GATE,
} from '../act3Spawners';
import { act3AmbientCensus } from '../fen/census';
import { GREYFEN_KILL_XP_FACTOR } from '../fen/fen.plugin';
import { SUMMIT_CAP_ABOVE_PLAYER } from '../level';
import type { AnchorLike } from '../ports';
import { SpawnRequest, SpawnerRegistry } from '../spawners';
import type { SpawnerDef } from '../types';
import {
  DRAGONSPINE_FAUNA_DOC,
  DRAGONSPINE_FAUNA_GROUPS,
  DRAGONSPINE_FAUNA_LAYOUT,
  DS_ARRIVAL_SITES,
  dragonspineSite,
  peakGroupCentre,
} from './dragonspineFauna.layout';
import { DRAGONSPINE_KILL_XP_FACTOR } from './peak.plugin';

const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
const isSummit = (d: SpawnerDef) => d.area === 'dragonspine-summit';

describe('Dragonspine ambient groups (DRAGONSPINE_SPAWNERS)', () => {
  it('every group is on the dragonspine band, the lower block or the summit area, gated, refilled on rest, leashed', () => {
    expect(DRAGONSPINE_SPAWNERS.length).toBe(DRAGONSPINE_FAUNA_GROUPS.length);
    expect(ACT3_SPAWNERS).toEqual([...GREYFEN_SPAWNERS, ...DRAGONSPINE_SPAWNERS, R18_PARENTS_SPAWNER]);
    expect(R18_PARENTS_SPAWNER).toMatchObject({ id: 'dragonspine.r18.parents', activation: 'manual', respawn: 'never' });
    expect(new Set(ACT3_SPAWNERS.map((d) => d.id)).size).toBe(ACT3_SPAWNERS.length);
    for (const d of DRAGONSPINE_SPAWNERS) {
      expect(d.id.startsWith('dragonspine.')).toBe(true);
      expect(d.band).toBe('dragonspine');
      expect(!!d.block !== !!d.area, d.id).toBe(true);
      if (!isSummit(d)) expect(d.block).toBe('dragonspine-lower');
      expect(d.respawn).toBe('onRest');
      expect(d.leash).toBe(true);
      expect(d.memberAnchors).toHaveLength(d.count);
      const act = d.activation as { flag: string; until?: string };
      expect(act.flag).toBe(isSummit(d) ? SUMMIT_AMBIENT_GATE : ACT3_AMBIENT_GATE);
    }
  });

  it('the mix: ten lower hawks (two on nests), three lone ogres, three hunter camps, two wyrms; on the summit four hawks, two ogres, two wyrms', () => {
    const count = (enemy: string, summit: boolean) =>
      DRAGONSPINE_SPAWNERS.filter((d) => d.enemy === enemy && isSummit(d) === summit).reduce((n, d) => n + d.count, 0);
    expect(count('rime-hawk', false)).toBe(10);
    expect(count('crag-ogre', false)).toBe(3);
    expect(count('hunter-spearman', false)).toBe(12);
    expect(count('ember-wyrm', false)).toBe(2);
    expect(count('rime-hawk', true)).toBe(4);
    expect(count('crag-ogre', true)).toBe(2);
    expect(count('ember-wyrm', true)).toBe(2);
    for (const d of DRAGONSPINE_SPAWNERS.filter((x) => x.enemy === 'hunter-spearman')) expect(d.memberKinds).toContain('hunter-harpooner');
  });

  it('the two nest hawks perch on their own anchor (the group options carry the nest)', () => {
    const nests = DRAGONSPINE_SPAWNERS.filter((d) => d.options?.nest);
    expect(nests).toHaveLength(2);
    for (const d of nests) expect(d.options!.nest).toBe(d.memberAnchors![0]);
  });

  it('only the two first-arrival groups narrow their span, to 1', () => {
    const first = DRAGONSPINE_SPAWNERS.filter((d) => d.blockSpan !== undefined);
    expect(first.map((d) => d.id).sort()).toEqual(['dragonspine.hawks.spine-road', 'dragonspine.hunters.deepgate-track']);
    for (const d of first) expect(d.blockSpan).toBe(1);
  });

  it('the Aerie wyrms leave while the away flag is set (Skarl\'s fight armed); nothing else reads it', () => {
    expect(AERIE_WYRM_SPAWNERS).toEqual(['dragonspine.wyrm.aerie-south', 'dragonspine.wyrm.aerie-east']);
    for (const d of DRAGONSPINE_SPAWNERS) {
      const act = d.activation as { until?: string };
      expect(act.until, d.id).toBe(AERIE_WYRM_SPAWNERS.includes(d.id) ? AERIE_WYRMS_AWAY_FLAG : undefined);
    }
  });
});

describe('Dragonspine fauna anchors', () => {
  const box = engineBox('dragonspine');
  const anchors = DRAGONSPINE_FAUNA_LAYOUT.anchors;
  const k4 = dragonspineBuild().layout.anchors;

  it('one anchor per member, ids under dragonspine.fauna., unique and clear of K4\'s ids', () => {
    expect(anchors.length).toBe(DRAGONSPINE_SPAWNERS.reduce((n, d) => n + d.count, 0));
    const ids = new Set(anchors.map((a) => a.id));
    expect(ids.size).toBe(anchors.length);
    for (const a of anchors) expect(a.id.startsWith('dragonspine.fauna.')).toBe(true);
    for (const d of DRAGONSPINE_SPAWNERS) for (const m of d.memberAnchors!) expect(ids.has(m)).toBe(true);
    for (const a of k4) expect(ids.has(a.id)).toBe(false);
  });

  it('every anchor lies in the Dragonspine box, summit groups in the summit area and the rest below it', () => {
    for (const g of DRAGONSPINE_FAUNA_GROUPS) {
      const c = peakGroupCentre(g);
      expect(c.x, g.id).toBeGreaterThanOrEqual(box.x0);
      expect(c.x, g.id).toBeLessThan(box.x1);
      expect(c.z, g.id).toBeGreaterThanOrEqual(box.z0);
      expect(c.z, g.id).toBeLessThan(box.z1);
      expect(areaAt(c.x, c.z), g.id).toBe(g.summit ? 'dragonspine-summit' : 'dragonspine-lower');
    }
  });

  it('keeps 40 m from every K4 anchor and 150 m from K4\'s quest spawn anchors (K13\'s packs never overlap a group)', () => {
    for (const a of anchors) {
      for (const b of k4) {
        expect(dist(a, b), `${a.id} ${b.id}`).toBeGreaterThanOrEqual(40);
        if (b.id.startsWith('dragonspine.spawn.') || b.id.startsWith('dragonspine.hawk.')) expect(dist(a, b), `${a.id} ${b.id}`).toBeGreaterThanOrEqual(150);
      }
    }
  });

  it('no summit wyrm over the Wyrm\'s Hearth plateau or within 80 m of it (Ysmeryth\'s trial)', () => {
    const b = WYRMS_HEARTH_PLATEAU.box;
    for (const g of DRAGONSPINE_FAUNA_GROUPS.filter((x) => x.kind === 'wyrm')) {
      const c = peakGroupCentre(g);
      const dx = Math.max(b.minX - c.x, 0, c.x - b.maxX);
      const dz = Math.max(b.minZ - c.z, 0, c.z - b.maxZ);
      expect(Math.hypot(dx, dz), g.id).toBeGreaterThanOrEqual(80);
    }
  });

  it('nothing within 300 m of an arrival point; the first-arrival groups stand 300 to 600 m out', () => {
    for (const g of DRAGONSPINE_FAUNA_GROUPS) {
      const c = peakGroupCentre(g);
      const nearest = Math.min(...DS_ARRIVAL_SITES.map((s) => dist(c, dragonspineSite(s))));
      expect(nearest, g.id).toBeGreaterThanOrEqual(300);
      if (g.firstArrival) expect(nearest, g.id).toBeLessThanOrEqual(600);
    }
  });

  it('DRAGONSPINE_FAUNA_ANCHORS.md matches the layout (regenerate with tools/gen-region-docs.ts)', () => {
    expect(readFileSync('src/enemies/peak/DRAGONSPINE_FAUNA_ANCHORS.md', 'utf8')).toBe(renderAnchorsDoc(DRAGONSPINE_FAUNA_LAYOUT, DRAGONSPINE_FAUNA_DOC));
  });
});

function registry(defs: SpawnerDef[], player: number, rolls: number[]) {
  const reqs: SpawnRequest[] = [];
  let n = 0;
  let i = 0;
  const pos = new Map(DRAGONSPINE_FAUNA_LAYOUT.anchors.map((a) => [a.id, a]));
  const reg = new SpawnerRegistry({
    anchors: {
      find: (id): AnchorLike | undefined => {
        const a = pos.get(id);
        return a ? { id, position: { x: a.x, y: 0, z: a.z }, yaw: 0 } : undefined;
      },
      withTag: () => [],
    },
    warn: vi.fn(),
    spawn: (r) => {
      reqs.push(r);
      return `a${++n}`;
    },
    despawn: () => {},
    rng: () => rolls[i++ % rolls.length]!,
    playerLevel: () => player,
  });
  defs.forEach((d) => reg.define(d));
  return { reg, reqs };
}

describe('Dragonspine levels', () => {
  it('a first-arrival group rolls L to L + 1 once the lower block locks', () => {
    for (const id of ['dragonspine.hawks.spine-road', 'dragonspine.hunters.deepgate-track']) {
      const d = DRAGONSPINE_SPAWNERS.find((x) => x.id === id)!;
      const r = registry([d], 19, [0, 1]);
      r.reg.lockBlockLevel('dragonspine-lower', 21);
      r.reg.spawnGroup(d.id);
      for (const q of r.reqs) expect(q.level).toBeLessThanOrEqual(22);
    }
  });

  it('the summit cap on: a summit group never rolls more than 3 above a level 22 player; off (null): the design\'s 26 to 28', () => {
    expect(SUMMIT_CAP_ABOVE_PLAYER).toBe(3);
    const d = DRAGONSPINE_SPAWNERS.find((x) => x.id === 'dragonspine.ogres.summit-road')!;
    const on = registry([d], 22, [1]);
    on.reg.spawnGroup(d.id);
    expect(on.reqs.map((q) => q.level)).toEqual([25, 25]);
    const strong = registry([d], 26, [1]);
    strong.reg.spawnGroup(d.id);
    expect(strong.reqs.map((q) => q.level)).toEqual([28, 28]);
  });
});

describe('Dragonspine kill XP and the both-region census (plan 7.2)', () => {
  const F = DRAGONSPINE_KILL_XP_FACTOR;
  it('at parity a hawk pays 90, an ogre 240, a reused Ember Wyrm 324 in the Dragonspine; the stored rows outside it', () => {
    expect(F).toBe(1.8);
    expect(killXp('rime-hawk', 20, 20, F)).toBe(90);
    expect(killXp('crag-ogre', 20, 20, F)).toBe(239);
    expect(killXp('ember-wyrm', 20, 20, F)).toBe(324);
    expect(killXp('rime-hawk', 20, 20)).toBe(50);
    expect(killXp('crag-ogre', 20, 20)).toBe(133);
  });

  it('Greyfen at L 18 plus the lower slopes at L 20 plus the summit at L 26 reach at least 10,000 XP at parity', () => {
    const lower = DRAGONSPINE_SPAWNERS.filter((d) => !isSummit(d));
    const summit = DRAGONSPINE_SPAWNERS.filter(isSummit);
    const census = (mode?: 'rolled') => {
      const g = act3AmbientCensus(GREYFEN_SPAWNERS, { level: 18, playerLevel: 18, regionFactor: GREYFEN_KILL_XP_FACTOR, mode });
      const l = act3AmbientCensus(lower, { level: 20, playerLevel: 20, regionFactor: F, mode });
      const s = act3AmbientCensus(summit, { level: 26, playerLevel: 26, regionFactor: F, mode });
      return { g: g.total, l: l.total, s: s.total, total: g.total + l.total + s.total };
    };
    const parity = census();
    const rolled = census('rolled');
    // For K16: the census per region, parity and rolled.
    console.info(`[K6b census] parity: Greyfen ${parity.g}, lower Dragonspine ${parity.l}, summit ${parity.s}, total ${parity.total} XP; rolled: ${rolled.total} XP`);
    expect(parity.l + parity.s).toBeGreaterThanOrEqual(4700);
    expect(parity.total).toBeGreaterThanOrEqual(10000);
    expect(rolled.total).toBeGreaterThan(parity.total);
  });
});
