// Act 3 spawner lint (contracts v0.7, coordinator ruling 2): every spawner whose anchor lies in the Greyfen or Dragonspine
// box (or whose band names one of those regions) names a `block` or an `area`, so the level fallback (Greyfen 18 to 26)
// is never what a shipped spawner relies on. Today no spawner is there, so the list is empty.
import { describe, expect, it } from 'vitest';
import { SLICE_SPAWNERS } from './spawnerDefs';
import { BRIGHTWATER_SPAWNERS } from './brightwaterSpawners';
import { DENSITY_SPAWNERS_A } from './densitySpawners';
import { HARROWMARK_SPAWNERS } from './harrowmarkSpawners';
import { ACT2_SPAWNERS } from './act2Spawners';
import { WYRM_SPAWNERS } from './wyrm/spawners';
import { WAVE_SPAWNERS } from '../waves/spawners';
import { ACT2_SPAWNERS_A12 } from '../quests/content/act2/spawners';
import { OLDSMOKE_SPAWNERS } from '../quests/content/act2/oldsmoke';
import { ALL_INTERIORS } from '../interiors/interiors.plugin';
import { ALL_LAYOUTS, resolveAnchors } from '../quests/lint/noteLint';
import { MAP_TO_ENGINE_OFFSET, REGION_BOXES_MAP } from '../region/regionMask';
import { regionAt } from '../region/regionMask';
import type { SpawnerDef } from './types';

/** The two Act 3 regions whose spawners must name a block or an area. */
const ACT3_REGIONS = ['greyfen', 'dragonspine'] as const;

export const ALL_SPAWNER_DEFS: readonly SpawnerDef[] = [
  ...SLICE_SPAWNERS, ...BRIGHTWATER_SPAWNERS, ...HARROWMARK_SPAWNERS, ...DENSITY_SPAWNERS_A, ...WYRM_SPAWNERS, ...ACT2_SPAWNERS,
  ...WAVE_SPAWNERS, ...ACT2_SPAWNERS_A12, ...OLDSMOKE_SPAWNERS,
];

const anchors = resolveAnchors(ALL_LAYOUTS, ALL_INTERIORS);

/** The Act 3 region a point (engine metres) lies in, by the region boxes (reserved regions included). */
export function act3RegionAt(x: number, z: number): string | null {
  const info = regionAt(x, z);
  if (info && (ACT3_REGIONS as readonly string[]).includes(info.id)) return info.id;
  const mx = x - MAP_TO_ENGINE_OFFSET.x;
  const mz = z - MAP_TO_ENGINE_OFFSET.z;
  for (const id of ACT3_REGIONS) {
    const b = REGION_BOXES_MAP[id];
    if (mx >= b.x0 && mx < b.x1 && mz >= b.z0 && mz < b.z1) return id;
  }
  return null;
}

/** Spawner defs in an Act 3 region (by band string or any resolved anchor) that name neither a block nor an area. */
export function act3SpawnersMissingBlockOrArea(defs: readonly SpawnerDef[], lookup = anchors): string[] {
  const bad: string[] = [];
  for (const s of defs) {
    const ids = [s.anchor, ...(s.memberAnchors ?? []), ...(Array.isArray(s.patrol) ? (s.patrol as string[]) : [])];
    const inAct3 =
      (typeof s.band === 'string' && (ACT3_REGIONS as readonly string[]).includes(s.band)) ||
      ids.some((id) => (lookup.get(id) ?? []).some((p) => p.space === 'world' && act3RegionAt(p.x, p.z) !== null));
    if (inAct3 && !s.block && !s.area) bad.push(s.id);
  }
  return bad;
}

describe('Act 3 spawner lint', () => {
  it('sees the shipped spawner tables and resolves their anchors', () => {
    expect(ALL_SPAWNER_DEFS.length).toBeGreaterThan(100);
    const resolved = ALL_SPAWNER_DEFS.filter((s) => anchors.has(s.anchor));
    expect(resolved.length).toBeGreaterThan(ALL_SPAWNER_DEFS.length / 2);
  });

  it('no shipped spawner lies in the Greyfen or Dragonspine boxes without a block or an area (today none lie there at all)', () => {
    expect(act3SpawnersMissingBlockOrArea(ALL_SPAWNER_DEFS)).toEqual([]);
    const inside = ALL_SPAWNER_DEFS.filter((s) => (anchors.get(s.anchor) ?? []).some((p) => act3RegionAt(p.x, p.z) !== null));
    expect(inside.map((s) => s.id)).toEqual([]);
  });

  it('knows the Greyfen and Dragonspine boxes', () => {
    for (const id of ACT3_REGIONS) {
      const b = REGION_BOXES_MAP[id];
      const x = (b.x0 + b.x1) / 2 + MAP_TO_ENGINE_OFFSET.x;
      const z = (b.z0 + b.z1) / 2 + MAP_TO_ENGINE_OFFSET.z;
      expect(act3RegionAt(x, z)).toBe(id);
    }
    expect(act3RegionAt(0, 0)).toBeNull();
  });

  describe('synthetic defs', () => {
    const b = REGION_BOXES_MAP.greyfen;
    const there = { space: 'world', x: (b.x0 + b.x1) / 2 + MAP_TO_ENGINE_OFFSET.x, z: (b.z0 + b.z1) / 2 + MAP_TO_ENGINE_OFFSET.z };
    const lookup = new Map([['greyfen.test.a', [there]], ['bright.a', [{ space: 'world', x: 10, z: 10 }]]]);
    const def = (id: string, extra: Partial<SpawnerDef>): SpawnerDef =>
      ({ id, enemy: 'wraith', count: 2, anchor: 'greyfen.test.a', band: { min: 18, max: 26 }, activation: 'auto', ...extra }) as SpawnerDef;

    it('reports an Act 3 def with neither a block nor an area', () => {
      expect(act3SpawnersMissingBlockOrArea([def('bare', {})], lookup)).toEqual(['bare']);
    });
    it('passes with a block or an area', () => {
      const withBlock = def('blk', { block: 'greyfen-approach' as never });
      const withArea = def('area', { area: 'dragonspine-summit' as never });
      expect(act3SpawnersMissingBlockOrArea([withBlock, withArea], lookup)).toEqual([]);
    });
    it('reports a def whose band names the region even when the anchor is unknown', () => {
      expect(act3SpawnersMissingBlockOrArea([def('band', { anchor: 'nowhere', band: 'dragonspine' })], lookup)).toEqual(['band']);
    });
    it('reports a def with only a member anchor inside', () => {
      expect(act3SpawnersMissingBlockOrArea([def('member', { anchor: 'bright.a', memberAnchors: ['greyfen.test.a'] })], lookup)).toEqual(['member']);
    });
    it('ignores a def outside the Act 3 boxes', () => {
      expect(act3SpawnersMissingBlockOrArea([def('far', { anchor: 'bright.a' })], lookup)).toEqual([]);
    });
  });
});
