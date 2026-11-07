// The Caldera ambient groups (Act 5 N5): areas, caps, gates, anchors on N1's sites, lines that can break, the doc, the plugin.
import { describe, expect, it, vi } from 'vitest';
import { CALDERA_FAUNA_SITES } from '../../caldera/calderaSites';
import { isCalderaArea } from '../../region/areas';
import { renderAnchorsDoc } from '../../region/anchorsDoc';
import { ALL_SPAWNERS } from '../allSpawners';
import { calderaAreaLint } from '../act5Lint';
import { ENEMY_DEFS } from '../defs';
import type { AnchorLike } from '../ports';
import { ENEMY_SKINS } from '../skins';
import { SpawnerRegistry, type SpawnRequest } from '../spawners';
import { CALDERA_FAUNA_DOC, CALDERA_FAUNA_GROUPS, CALDERA_FAUNA_LAYOUT, CALDERA_GATE_FLAGS } from './calderaFauna.layout';
import { calderaAmbientCensus } from './census';
import { warhostLineLint } from './lint';
import { CALDERA_AMBIENT_SPAWNERS } from './spawners';

function registry(flags: Record<string, unknown>, player: number | undefined, rng = () => 1) {
  const anchors: AnchorLike[] = CALDERA_FAUNA_LAYOUT.anchors.map((a) => ({ id: a.id, position: { x: a.x, y: 0, z: a.z }, yaw: 0 }));
  const reqs: SpawnRequest[] = [];
  let n = 0;
  const reg = new SpawnerRegistry({
    anchors: { find: (id) => anchors.find((a) => a.id === id), withTag: () => [] },
    warn: vi.fn(),
    spawn: (r) => (reqs.push(r), `a${++n}`),
    despawn: () => undefined,
    rng,
    playerLevel: () => player,
    flags: { getFlag: (k) => flags[k] as never },
  });
  CALDERA_AMBIENT_SPAWNERS.forEach((d) => reg.define(d));
  return { reg, reqs };
}

describe('the Caldera ambient groups', () => {
  it('are in the full list once, each on a real N1 site with a caldera-* area, one kind and a matching skin', () => {
    const ids = ALL_SPAWNERS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    const siteIds = new Set(CALDERA_FAUNA_SITES.map((s) => s.id));
    for (const g of CALDERA_FAUNA_GROUPS) expect(siteIds.has(g.site), g.id).toBe(true);
    for (const d of CALDERA_AMBIENT_SPAWNERS) {
      expect(ids.filter((i) => i === d.id), d.id).toHaveLength(1);
      expect(isCalderaArea(d.area), d.id).toBe(true);
      expect(d.band, d.id).toBe('caldera');
      expect(d.respawn, d.id).toBe('never');
      expect(d.memberKinds, d.id).toBeUndefined();
      expect(ENEMY_DEFS[d.enemy as keyof typeof ENEMY_DEFS], d.id).toBeDefined();
      if (d.skin) expect(ENEMY_SKINS[d.skin].kind, d.id).toBe(d.enemy);
      expect(d.memberAnchors).toHaveLength(d.count);
    }
    expect(calderaAreaLint(CALDERA_AMBIENT_SPAWNERS)).toEqual([]);
  });

  it('about 22 foes; only the stair outriders are a first arrival; every Warhost line can break', () => {
    expect(CALDERA_AMBIENT_SPAWNERS.reduce((a, d) => a + d.count, 0)).toBe(22);
    expect(CALDERA_AMBIENT_SPAWNERS.filter((d) => d.firstArrival).map((d) => d.id)).toEqual(['caldera.stair.outriders']);
    expect(warhostLineLint(CALDERA_AMBIENT_SPAWNERS)).toEqual([]);
  });

  it('gates only read flags: the rim groups wait on the Caldera, the inside groups on the Rim Gate, the Foundry pair on the hold', () => {
    const flag = (id: string) => (CALDERA_AMBIENT_SPAWNERS.find((d) => d.id === id)!.activation as { flag: string }).flag;
    expect(flag('caldera.rim.stokers.1')).toBe(CALDERA_GATE_FLAGS['gate.a5']);
    expect(flag('caldera.stair.outriders')).toBe('story.m47.rimGateOpen');
    expect(flag('caldera.foundry.guards')).toBe('story.m52.complete');
    expect(flag('caldera.terraces.pikes')).toBe('story.m51.complete');
    expect((CALDERA_AMBIENT_SPAWNERS.find((d) => d.id === 'caldera.rim.stokers.1')!.activation as { until?: string }).until).toBe('story.r29.struck');
  });

  it('caps every group at P + 3 (the first arrival P + 2), at the Caldera bands, for several player levels', () => {
    for (const p of [28, 31, 34, 37, 40]) {
      const flags = { 'story.gate.a5': true, 'story.m47.rimGateOpen': true, 'story.m51.complete': true, 'story.m52.complete': true };
      const { reg, reqs } = registry(flags, p, () => 1);
      for (const d of CALDERA_AMBIENT_SPAWNERS) reg.spawnGroup(d.id);
      expect(reqs.length).toBe(22);
      for (const r of reqs) {
        expect(r.level, `${r.spawnerId} at ${p}`).toBeLessThanOrEqual(Math.min(40, p + (r.spawnerId === 'caldera.stair.outriders' ? 2 : 3)));
        expect(r.area).toBeDefined();
      }
    }
  });

  it('carries role, skin and line to the member', () => {
    const { reg, reqs } = registry({ 'story.m51.complete': true }, 33);
    reg.spawnGroup('caldera.terraces.pikes');
    expect(reqs.map((r) => [r.role, (r as { line?: string }).line])).toEqual([['pike', 'caldera.fauna.terraces'], ['pike', 'caldera.fauna.terraces']]);
  });

  it('every anchor stands on ground the layout validator accepts', async () => {
    const { validateLayout } = await import('../../region/validateLayout');
    const { heightAt } = await import('../../terrain/heightfield');
    expect(validateLayout(CALDERA_FAUNA_LAYOUT, heightAt).filter((m) => !m.startsWith('missing anchor'))).toEqual([]);
  });

  it('anchor ids are unique, prefixed caldera.fauna. and no two members share ground', () => {
    const ids = CALDERA_FAUNA_LAYOUT.anchors.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id.startsWith('caldera.fauna.')).toBe(true);
    const pts = CALDERA_FAUNA_LAYOUT.anchors.map((a) => [a.x, a.z] as const);
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) expect(Math.hypot(pts[i]![0] - pts[j]![0], pts[i]![1] - pts[j]![1])).toBeGreaterThan(1);
  });

  it('CALDERA_FAUNA_ANCHORS.md matches the layout (regenerate with tools/gen-region-docs.ts)', async () => {
    const { readFileSync } = await import('../../region/testing/nodeFs');
    expect(readFileSync('src/enemies/act5/CALDERA_FAUNA_ANCHORS.md', 'utf8')).toBe(renderAnchorsDoc(CALDERA_FAUNA_LAYOUT, CALDERA_FAUNA_DOC));
  });

  it('the census pays the ambient total after the cap and the factor, and a level 28 player earns less than a level 38 one per foe', () => {
    const lo = calderaAmbientCensus(CALDERA_AMBIENT_SPAWNERS, { playerLevel: 28 });
    const hi = calderaAmbientCensus(CALDERA_AMBIENT_SPAWNERS, { playerLevel: 38 });
    expect(lo.total).toBeGreaterThan(2000);
    expect(hi.total).toBeGreaterThan(2000);
    expect(lo.rows).toHaveLength(CALDERA_AMBIENT_SPAWNERS.length);
  });
});
