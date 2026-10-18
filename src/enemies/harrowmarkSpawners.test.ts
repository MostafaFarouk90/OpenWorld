import { describe, expect, it, vi } from 'vitest';
import { ENEMY_DEFS } from './defs';
import { GUILDHALL_THUG, GUILDHALL_THUG_TAG } from './guildhall/def';
import { DEAD_ROAD_CAMP_SPAWNER_IDS, HARROWMARK_SPAWNERS } from './harrowmarkSpawners';
import { REGION_BANDS, WATCH_GUARD_BAND } from './level';
import type { AnchorLike } from './ports';
import { SLICE_SPAWNERS } from './spawnerDefs';
import { BRIGHTWATER_SPAWNERS } from './brightwaterSpawners';
import { SpawnerRegistry, type SpawnRequest } from './spawners';
import { ENEMY_STRINGS_EN } from './strings.en';
import type { SpawnerDef } from './types';

const by = (id: string): SpawnerDef => HARROWMARK_SPAWNERS.find((d) => d.id === id)!;

function registry(defs: readonly SpawnerDef[], anchorIds: string[]) {
  const anchors: AnchorLike[] = anchorIds.map((id, i) => ({ id, position: { x: i * 3, y: 0, z: 0 }, yaw: 0 }));
  const warn = vi.fn();
  const reqs: SpawnRequest[] = [];
  let n = 0;
  const reg = new SpawnerRegistry({
    anchors: { find: (id) => anchors.find((a) => a.id === id), withTag: () => [] },
    warn,
    spawn: (r) => {
      reqs.push(r);
      return `a${++n}`;
    },
    despawn: () => undefined,
    rng: () => 0.5,
  });
  defs.forEach((d) => reg.define(d));
  return { reg, warn, reqs };
}

describe('HARROWMARK_SPAWNERS table', () => {
  it('has the contract ids, each registered once alongside the other tables', () => {
    const ids = HARROWMARK_SPAWNERS.map((d) => d.id);
    expect(ids).toEqual([
      'r03.guildhall', 'm07.thieves', 'underways.kennel-1', 'underways.kennel-2', 'grimtooth-summons',
      'stealth.m09.hall', 'stealth.m09.stacks', 'stealth.m09.clerk',
    ]);
    expect(() => registry([...SLICE_SPAWNERS, ...BRIGHTWATER_SPAWNERS, ...HARROWMARK_SPAWNERS], [])).not.toThrow();
    expect(() => registry([...HARROWMARK_SPAWNERS, by('m07.thieves')], [])).toThrow();
  });

  it('uses existing kinds, member anchors that are unique and sized to the count (m07 has one spare)', () => {
    const all = new Set<string>();
    for (const d of HARROWMARK_SPAWNERS) {
      expect(ENEMY_DEFS[d.enemy as keyof typeof ENEMY_DEFS], d.id).toBeDefined();
      const m = d.memberAnchors ?? [];
      expect(new Set(m).size, d.id).toBe(m.length);
      if (d.id === 'm07.thieves') expect(m).toHaveLength(d.count - 1);
      else expect(m, d.id).toHaveLength(d.count);
      expect(d.leaderSlot === undefined || (d.leaderSlot >= 0 && d.leaderSlot < d.count), d.id).toBe(true);
      expect(m.length === 0 || m.includes(d.anchor), d.id).toBe(true);
      if (d.id.startsWith('stealth.m09')) for (const a of m) { expect(all.has(a), a).toBe(false); all.add(a); }
    }
    expect([...all].sort()).toEqual([1, 2, 3, 4].map((i) => `spawn.m09.watch-${i}`));
  });

  it('keeps bands inside Harrowmark (watch guards on their own band) and nothing respawns', () => {
    const h = REGION_BANDS.harrowmark!;
    for (const d of HARROWMARK_SPAWNERS) {
      const b = d.band as { min: number; max: number };
      expect(b.min, d.id).toBeGreaterThanOrEqual(h.min);
      expect(b.max, d.id).toBeLessThanOrEqual(h.max);
      expect(d.respawn, d.id).toBe('never');
    }
    for (const id of ['stealth.m09.hall', 'stealth.m09.stacks', 'stealth.m09.clerk']) {
      expect(by(id).band).toEqual(WATCH_GUARD_BAND);
      expect(by(id).activation).toEqual({ interior: 'counting-house' });
    }
  });

  it('activates R03 and M07 by quest, kennels on the Underways, summons by hand', () => {
    expect(by('r03.guildhall').activation).toEqual({ quest: 'r03' });
    expect(by('m07.thieves').activation).toEqual({ quest: 'm07' });
    expect(by('underways.kennel-1').activation).toEqual({ interior: 'underways' });
    expect(by('grimtooth-summons').activation).toBe('manual');
  });

  it('kennels never respawn, are not ephemeral, lead from slot 0, and use hounds 1-3 and 4-6', () => {
    for (const id of ['underways.kennel-1', 'underways.kennel-2']) {
      expect(by(id)).toMatchObject({ enemy: 'ember-hound', respawn: 'never', count: 3, leaderSlot: 0 });
      expect(by(id).ephemeral).toBeFalsy();
    }
    expect(by('underways.kennel-1').memberAnchors).toEqual([1, 2, 3].map((i) => `underways.spawn.hound-${i}`));
    expect(by('underways.kennel-2').memberAnchors).toEqual([4, 5, 6].map((i) => `underways.spawn.hound-${i}`));
  });

  it('summons are an ephemeral manual pack of four on underways.summon.1-4 and are never saved', () => {
    const d = by('grimtooth-summons');
    expect(d).toMatchObject({ enemy: 'ember-hound', count: 4, ephemeral: true, leaderSlot: 0 });
    expect(d.memberAnchors).toEqual([1, 2, 3, 4].map((i) => `underways.summon.${i}`));
    const { reg } = registry([d], d.memberAnchors!.concat(d.anchor));
    const ids = reg.spawnGroup('grimtooth-summons');
    expect(ids).toHaveLength(4);
    ids.forEach((a) => reg.onMemberGone(a, 'died'));
    expect(reg.isCleared('grimtooth-summons')).toBe(false);
    expect(reg.serialize().cleared).not.toContain('grimtooth-summons');
  });

  it('a fleeing cutpurse cannot stall the kill objective: 3 kills remain possible after one escapes', () => {
    const d = by('m07.thieves');
    const { reg, reqs } = registry([d], [...d.memberAnchors!]);
    const ids = reg.spawnGroup('m07.thieves');
    expect(ids).toHaveLength(4);
    expect(reqs.every((r) => r.spawnTag === 'm07.thieves')).toBe(true);
    // one robs the player and flees away with the gold
    expect(reg.onMemberGone(ids[0]!, 'despawned')).toBe(false);
    const killed = ids.slice(1);
    expect(killed.length).toBeGreaterThanOrEqual(3); // the objective's need
    killed.forEach((a) => reg.onMemberGone(a, 'died'));
    expect(reg.alive('m07.thieves')).toHaveLength(0);
  });

  it('with no escape the group clears once all four are down', () => {
    const d = by('m07.thieves');
    const { reg } = registry([d], [...d.memberAnchors!]);
    const ids = reg.spawnGroup('m07.thieves');
    const results = ids.map((a) => reg.onMemberGone(a, 'died'));
    expect(results).toEqual([false, false, false, true]);
  });

  it('a missing anchor warns once and spawns nothing', () => {
    const { reg, warn } = registry([by('r03.guildhall')], []);
    expect(reg.spawnGroup('r03.guildhall')).toEqual([]);
    expect(reg.spawnGroup('r03.guildhall')).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('exports the Dead Road camp ids without defining them here', () => {
    expect([...DEAD_ROAD_CAMP_SPAWNER_IDS]).toEqual(['deadroad.camp-1', 'deadroad.camp-2']);
    for (const id of DEAD_ROAD_CAMP_SPAWNER_IDS) expect(HARROWMARK_SPAWNERS.some((d) => d.id === id)).toBe(false);
  });
});

describe('guildhall thug kind', () => {
  const def = ENEMY_DEFS['guildhall-thug'];
  it('is the exported def with the stable tag, name and spawn wiring', () => {
    expect(def).toBe(GUILDHALL_THUG);
    expect(GUILDHALL_THUG_TAG).toBe('r03.guildhall');
    expect(by('r03.guildhall').tag).toBe('r03.guildhall');
    expect(by('r03.guildhall')).toMatchObject({ enemy: 'guildhall-thug', count: 3 });
    expect(ENEMY_STRINGS_EN[def.nameKey]).toBe('Guildhall Thug');
  });
  it('is a guardless brawler with two melee moves and a track-less Spare', () => {
    expect(def).toMatchObject({ maxHealth: 45, maxPoise: 25 });
    expect(def.guard).toBeFalsy();
    expect(def.mercy).toEqual({ verb: 'spare', tier: 'normal', track: null, when: 'yielding' });
    expect(def.moves.map((m) => m.id)).toEqual(['thug.club', 'thug.shove']);
    for (const m of def.moves) {
      expect(m.activeStart).toBeLessThan(m.activeEnd);
      expect(m.weight).toBeGreaterThan(0);
      expect(m.windup).toBeGreaterThan(0);
    }
  });
});
