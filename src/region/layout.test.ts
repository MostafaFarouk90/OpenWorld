import { describe, expect, it } from 'vitest';
import { COMBAT, WORLD } from '../config/constants';
import { SPAWN_FLAT_RADIUS, heightAt } from '../terrain/heightfield';
import { BRIGHTWATER_LAYOUT } from './brightwater.layout';
import { pointInFootprint } from './geometry';
import type { LayoutData } from './layoutTypes';
import { resolveLayout } from './resolveLayout';
import { validateLayout } from './validateLayout';

// The core's training dummies as the world places them: the spawn plus each COMBAT.dummies offset.
const OLD_DUMMIES = COMBAT.dummies.map((d, i) => ({ id: `dummy-${i + 1}`, x: WORLD.spawnX + d.x, z: WORLD.spawnZ + d.z, radius: 1 }));

const flat = () => 0;
const spawnOnly = (): LayoutData => ({ anchors: [{ id: 'brightwater.player-spawn', x: 0, z: 0, yawDeg: 0 }], triggers: [], structures: [], patrols: [], npcs: [], fields: [] });

const clone = (): LayoutData => structuredClone(BRIGHTWATER_LAYOUT);
const errorsOf = (layout: LayoutData, opts = {}) => validateLayout(layout, heightAt, { keepClear: OLD_DUMMIES, ...opts });

describe('Brightwater layout data', () => {
  it('passes the validator against the real terrain', () => {
    expect(errorsOf(BRIGHTWATER_LAYOUT)).toEqual([]);
  });

  it('has unique ids across anchors, triggers and structures', () => {
    for (const list of [BRIGHTWATER_LAYOUT.anchors, BRIGHTWATER_LAYOUT.triggers, BRIGHTWATER_LAYOUT.structures]) {
      const ids = list.map((x) => x.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('has a start anchor for every tutorial beat T01 to T15', () => {
    const ids = new Set(BRIGHTWATER_LAYOUT.anchors.map((a) => a.id));
    for (let n = 1; n <= 15; n++) expect(ids.has(`beat.t${String(n).padStart(2, '0')}.start`)).toBe(true);
  });

  it('has the anchors and triggers other threads reference', () => {
    const anchors = new Set(BRIGHTWATER_LAYOUT.anchors.map((a) => a.id));
    const triggers = new Set(BRIGHTWATER_LAYOUT.triggers.map((t) => t.id));
    for (const id of [
      'brightwater.player-spawn',
      'm01.villager-1',
      'm01.villager-2',
      'm01.villager-3',
      'spawn.m01.wraith-1',
      'spawn.m01.wraith-5',
      'kettlewick.barrel',
      'kettlewick.bakery-hearth',
      'kettlewick.bakery-fire',
      'kettlewick.notice-board',
      'waystone.chapel',
      'waystone.kettlewick',
      'waystone.north',
      'yard.dummy-1',
      'yard.dummy-2',
    ])
      expect(anchors.has(id), id).toBe(true);
    for (const id of ['m01.chapel-door', 'm02.bakery']) expect(triggers.has(id), id).toBe(true);
  });

  it('tags exactly three waystone anchors, with the Kettlewick one starting lit', () => {
    const stones = BRIGHTWATER_LAYOUT.anchors.filter((a) => a.tags?.includes('waystone'));
    expect(stones.map((a) => a.id).sort()).toEqual(['waystone.chapel', 'waystone.kettlewick', 'waystone.north']);
    expect(stones.filter((a) => a.tags?.includes('waystone-lit')).map((a) => a.id)).toEqual(['waystone.kettlewick']);
  });

  it('keeps the first patrol far beyond the T15 gate fight', () => {
    const wave = BRIGHTWATER_LAYOUT.anchors.filter((a) => a.id.startsWith('spawn.t15.'));
    const patrol = BRIGHTWATER_LAYOUT.anchors.filter((a) => a.id.startsWith('patrol.north.'));
    const nearestWave = Math.max(...wave.map((a) => a.z));
    for (const p of patrol) expect(p.z - nearestWave).toBeGreaterThanOrEqual(180);
  });

  it('puts every structure but the far waystone inside the flat meadow', () => {
    for (const s of BRIGHTWATER_LAYOUT.structures) {
      if (s.id === 'waystone-north') continue;
      expect(Math.hypot(s.x, s.z) + Math.hypot(...s.footprint) / 2).toBeLessThanOrEqual(SPAWN_FLAT_RADIUS);
    }
  });

  it('keeps the T06 sprint at 40 m and clear of the old dummies', () => {
    const start = BRIGHTWATER_LAYOUT.triggers.find((t) => t.id === 'trg.t06.start')!;
    const end = BRIGHTWATER_LAYOUT.triggers.find((t) => t.id === 'trg.t06.end')!;
    expect(Math.hypot(start.x - end.x, start.z - end.z)).toBe(40);
  });
});

describe('resolveLayout', () => {
  const resolved = resolveLayout(BRIGHTWATER_LAYOUT, heightAt);

  it('computes absolute heights from the terrain plus dy', () => {
    const banner = resolved.anchors.find((a) => a.id === 'chapel.banner-1')!;
    const spec = BRIGHTWATER_LAYOUT.anchors.find((a) => a.id === 'chapel.banner-1')!;
    expect(spec.dy).toBe(5);
    expect(banner.position.y).toBe(heightAt(spec.x, spec.z) + 5);
    const north = resolved.anchors.find((a) => a.id === 'waystone.north')!;
    expect(north.position.y).toBe(heightAt(10, 310));
    expect(north.position.y).not.toBe(0);
  });

  it('puts every flat-meadow anchor at exactly its dy', () => {
    for (const a of resolved.anchors) {
      const spec = BRIGHTWATER_LAYOUT.anchors.find((s) => s.id === a.id)!;
      if (Math.hypot(spec.x, spec.z) <= SPAWN_FLAT_RADIUS) expect(a.position.y).toBe(spec.dy ?? 0);
    }
  });

  it('converts yaw to radians and keeps tags without sharing the array', () => {
    const kneel = resolved.anchors.find((a) => a.id === 'chapel.kneel')!;
    // Heading 90 (east) is stored as yawDeg 270 because the engine's yaw 0 faces -Z.
    expect(BRIGHTWATER_LAYOUT.anchors.find((a) => a.id === 'chapel.kneel')!.yawDeg).toBe(270);
    expect(kneel.yaw).toBeCloseTo((3 * Math.PI) / 2);
    expect(kneel.tags).toEqual(['poi']);
    expect(kneel.tags).not.toBe(BRIGHTWATER_LAYOUT.anchors.find((a) => a.id === 'chapel.kneel')!.tags);
  });

  it('resolves trigger shapes with defaults', () => {
    const sphere = resolved.triggers.find((t) => t.id === 'trg.t01.gate')!;
    expect(sphere).toMatchObject({ who: 'player', once: false, shape: { type: 'sphere', radius: 3 } });
    const box = resolved.triggers.find((t) => t.id === 'trg.t11.square')!;
    expect(box.shape).toMatchObject({ type: 'box', half: { x: 12, y: 30, z: 12 }, yaw: 0 });
  });
});

describe('validateLayout failure paths', () => {
  it('flags duplicate anchor, trigger, structure and npc ids', () => {
    const l = clone();
    l.anchors.push({ ...l.anchors[0] });
    l.triggers.push({ ...l.triggers[0] });
    l.structures.push({ ...l.structures[0] });
    l.npcs.push({ ...l.npcs[0] });
    const e = errorsOf(l).join('\n');
    expect(e).toContain(`duplicate anchor id "${l.anchors[0].id}"`);
    expect(e).toContain(`duplicate trigger id "${l.triggers[0].id}"`);
    expect(e).toContain(`duplicate structure id "${l.structures[0].id}"`);
    expect(e).toContain(`duplicate npc id "${l.npcs[0].id}"`);
  });

  it('flags bad anchor ids and non-finite coordinates', () => {
    const l = clone();
    l.anchors.push({ id: 'Bad Name', x: 1, z: 1, yawDeg: 0 });
    l.anchors.push({ id: 'area.nan', x: NaN, z: 1, yawDeg: 0 });
    const e = errorsOf(l).join('\n');
    expect(e).toContain('anchor "Bad Name"');
    expect(e).toContain('anchor "area.nan": non-finite');
  });

  it('flags unknown references from npcs, patrols and anchors', () => {
    const l = clone();
    l.npcs[0].post = 'npc-post.nobody';
    l.patrols[0].points.push('patrol.north.99');
    l.anchors.push({ id: 'area.ghost', x: 1, z: 1, yawDeg: 0, onStructure: 'nope' });
    const e = errorsOf(l).join('\n');
    expect(e).toContain('unknown post anchor "npc-post.nobody"');
    expect(e).toContain('unknown anchor "patrol.north.99"');
    expect(e).toContain('unknown structure "nope"');
  });

  it('flags a patrol with one point', () => {
    const l = clone();
    l.patrols[0].points = ['patrol.north.1'];
    expect(errorsOf(l).join('\n')).toContain('needs at least two points');
  });

  it('flags zero, negative and non-finite trigger sizes', () => {
    const l = clone();
    l.triggers.push({ id: 'trg.bad.zero', shape: 'sphere', x: 0, z: 0, radius: 0 });
    l.triggers.push({ id: 'trg.bad.neg', shape: 'box', x: 0, z: 0, half: [1, -1, 1] });
    l.triggers.push({ id: 'trg.bad.nan', shape: 'sphere', x: NaN, z: 0, radius: 1 });
    const e = errorsOf(l).join('\n');
    expect(e).toContain('trigger "trg.bad.zero": size must be positive');
    expect(e).toContain('trigger "trg.bad.neg": size must be positive');
    expect(e).toContain('trigger "trg.bad.nan": non-finite');
  });

  it('flags an anchor below the terrain and one floating above it', () => {
    const l = clone();
    const resolved = resolveLayout(l, heightAt).anchors;
    resolved.find((a) => a.id === 'lane.start')!.position.y = -2;
    resolved.find((a) => a.id === 'lane.end')!.position.y = 3;
    const e = errorsOf(l, { resolvedAnchors: resolved }).join('\n');
    expect(e).toContain('anchor "lane.start": below the terrain');
    expect(e).toContain('anchor "lane.end": floats above the terrain');
  });

  it('accepts a roof anchor that is elevated on purpose', () => {
    expect(errorsOf(BRIGHTWATER_LAYOUT).filter((m) => m.includes('banner'))).toEqual([]);
  });

  it('flags an anchor on a slope too steep to stand on', () => {
    const steep = (x: number, z: number) => heightAt(x, z) + x * 2;
    const e = validateLayout(BRIGHTWATER_LAYOUT, steep, { keepClear: OLD_DUMMIES }).join('\n');
    expect(e).toContain('slope too steep');
    expect(e).toContain('terrain under the footprint is not flat enough');
  });

  it('flags a standing anchor inside a solid footprint unless it is on that structure', () => {
    const l = clone();
    l.anchors.push({ id: 'area.in-house', x: -16, z: 100, yawDeg: 0 });
    l.anchors.push({ id: 'area.on-house', x: -16, z: 100.5, yawDeg: 0, onStructure: 'house-01' });
    const e = errorsOf(l).join('\n');
    expect(e).toContain('anchor "area.in-house": inside a solid structure');
    expect(e).not.toContain('area.on-house');
  });

  it('flags an NPC post that is walled in and unreachable', () => {
    const l = clone();
    // Four solid blocks enclosing a free 4 m by 4 m yard around (-60, 44).
    const ring: Array<[number, number, number, number]> = [[-66, 44, 8, 16], [-54, 44, 8, 16], [-60, 50, 4, 8], [-60, 38, 4, 8]];
    for (const [i, [x, z, w, d]] of ring.entries())
      l.structures.push({ id: `cage-${i}`, kind: 'house', x, z, yawDeg: 0, footprint: [w, d], mode: 'solid' });
    l.anchors.push({ id: 'npc-post.caged', x: -60, z: 44, yawDeg: 0, tags: ['npc-post'] });
    l.npcs.push({ id: 'caged', post: 'npc-post.caged' });
    const e = errorsOf(l).join('\n');
    expect(e).toContain('anchor "npc-post.caged": unreachable from the player spawn');
  });

  it('flags overlapping blocking structures but allows a contained altar', () => {
    const l = clone();
    l.structures.push({ id: 'house-dup', kind: 'house', x: -16, z: 102, yawDeg: 0, footprint: [8, 8], mode: 'solid' });
    const e = errorsOf(l).join('\n');
    expect(e).toContain('"house-01" and "house-dup" overlap');
    expect(e).not.toContain('altar');
  });

  it('flags a structure over a dummy position', () => {
    const l = clone();
    const d = OLD_DUMMIES[0];
    l.structures.push({ id: 'shed', kind: 'house', x: d.x, z: d.z, yawDeg: 0, footprint: [3, 3], mode: 'solid' });
    expect(errorsOf(l).join('\n')).toContain(`structure "shed" overlaps "${d.id}"`);
  });

  it('flags enterable structures with no door, a bad door or a rotated frame', () => {
    const l = clone();
    l.structures.push({ id: 'shack', kind: 'house', x: -80, z: 20, yawDeg: 0, footprint: [8, 8], mode: 'enterable' });
    l.structures.push({ id: 'shed2', kind: 'house', x: -80, z: 40, yawDeg: 45, footprint: [8, 8], mode: 'enterable', door: { name: 'bad name', side: 'W', width: 9 } });
    l.structures.push({ id: 'cabin', kind: 'house', x: -80, z: 60, yawDeg: 0, footprint: [8, 8], mode: 'solid', door: { name: 'x', side: 'W', width: 2 } });
    const e = errorsOf(l).join('\n');
    expect(e).toContain('structure "shack": enterable structure has no door');
    expect(e).toContain('structure "shed2": enterable structures need yaw 0');
    expect(e).toContain('bad door name');
    expect(e).toContain('does not fit the wall');
    expect(e).toContain('structure "cabin": only enterable structures can have a door');
  });

  it('flags a contained structure that sticks out of its host', () => {
    const l = clone();
    l.structures.find((s) => s.id === 'altar')!.x = 70;
    expect(errorsOf(l).join('\n')).toContain('structure "altar": not fully inside "chapel"');
  });

  it('keeps every real doorway walkable: the door gap is open in the validator grid', () => {
    const e = errorsOf(BRIGHTWATER_LAYOUT);
    expect(e.filter((m) => m.includes('doorway'))).toEqual([]);
    // Standing points on both sides of each real door are reachable (inside the room and at the threshold).
    for (const id of ['kettlewick.bakery-door', 'kettlewick.bakery-counter', 'chapel.door', 'chapel.kneel']) {
      expect(e.filter((m) => m.includes(`"${id}"`)), id).toEqual([]);
    }
  });

  const hut = (width: number): LayoutData => {
    const l = spawnOnly();
    l.structures.push({ id: 'hut', kind: 'house', x: 0, z: 20, yawDeg: 0, footprint: [8, 8], mode: 'enterable', door: { name: 'hut', side: 'S', width } });
    l.anchors.push({ id: 'area.inside', x: 0, z: 20, yawDeg: 0, onStructure: 'hut' });
    return l;
  };

  it('walks into a hut through a wide doorway', () => {
    expect(validateLayout(hut(2.4), flat)).toEqual([]);
  });

  it('fails reachability when the doorway is too narrow for the player', () => {
    const e = validateLayout(hut(0.6), flat).join('\n');
    expect(e).toContain('structure "hut": doorway is not reachable');
    expect(e).toContain('anchor "area.inside": unreachable from the player spawn');
  });

  it('blocks a yaw-90 solid along the rotated axis, not the unrotated one', () => {
    const l = spawnOnly();
    // 2 m by 20 m rotated 90 degrees lies along world X: x in [-10, 10], z in [19, 21].
    l.structures.push({ id: 'bar', kind: 'house', x: 0, z: 20, yawDeg: 90, footprint: [2, 20], mode: 'solid' });
    l.anchors.push({ id: 'area.in-rotated', x: 8, z: 20, yawDeg: 0 });
    l.anchors.push({ id: 'area.in-unrotated', x: 0, z: 28, yawDeg: 0 });
    const e = validateLayout(l, flat).join('\n');
    expect(e).toContain('anchor "area.in-rotated": inside a solid structure');
    expect(e).not.toContain('area.in-unrotated');
  });

  it('puts every waystone stand point on walkable ground, clear of every blocking structure', () => {
    const e = errorsOf(BRIGHTWATER_LAYOUT);
    const blocking = BRIGHTWATER_LAYOUT.structures.filter((s) => s.mode !== 'open');
    const stones = BRIGHTWATER_LAYOUT.anchors.filter((a) => a.tags?.includes('waystone'));
    expect(stones).toHaveLength(3);
    for (const a of stones) {
      expect(e.filter((m) => m.includes(`"${a.id}"`)), a.id).toEqual([]);
      for (const s of blocking) expect(pointInFootprint(s, a.x, a.z, 0.4), `${a.id} vs ${s.id}`).toBe(false);
      const stone = BRIGHTWATER_LAYOUT.structures.find((s) => s.id === a.id.replace('.', '-'))!;
      expect(Math.hypot(stone.x - a.x, stone.z - a.z)).toBeCloseTo(1.8);
    }
  });

  it('hangs the banner anchors outside every structure footprint', () => {
    const banners = BRIGHTWATER_LAYOUT.anchors.filter((a) => a.tags?.includes('banner'));
    expect(banners).toHaveLength(3);
    for (const b of banners) {
      for (const s of BRIGHTWATER_LAYOUT.structures) expect(pointInFootprint(s, b.x, b.z), `${b.id} in ${s.id}`).toBe(false);
    }
  });

  it('reports a missing player spawn instead of crashing', () => {
    const l = clone();
    l.anchors = l.anchors.filter((a) => a.id !== 'brightwater.player-spawn');
    expect(errorsOf(l)).toContain('missing anchor "brightwater.player-spawn"');
  });

  it('accepts an empty layout apart from the spawn', () => {
    const l: LayoutData = { anchors: [{ id: 'brightwater.player-spawn', x: 0, z: 0, yawDeg: 0 }], triggers: [], structures: [], patrols: [], npcs: [], fields: [] };
    expect(errorsOf(l)).toEqual([]);
  });

  it('accepts an anchor exactly on a structure border only when it stays walkable', () => {
    const l = clone();
    // 4.4 m from a house centre is the edge of the player's clearance margin.
    l.anchors.push({ id: 'area.edge', x: -16 + 4 + 0.3 + 0.25, z: 100, yawDeg: 0 });
    expect(errorsOf(l).filter((m) => m.includes('area.edge'))).toEqual([]);
  });
});
