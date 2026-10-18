import { describe, expect, it } from 'vitest';
import type { LayoutData } from '../region/layoutTypes';
import { arrival, validateCity } from './validateCity';
import { DOORS, HARROWMARK_LAYOUT } from './harrowmark.layout';

const clone = (l: LayoutData): LayoutData => ({
  ...l,
  anchors: l.anchors.map((a) => ({ ...a })),
  triggers: l.triggers.slice(),
  structures: l.structures.map((s) => ({ ...s })),
  patrols: l.patrols.map((p) => ({ ...p, points: p.points.slice() })),
  npcs: l.npcs.slice(),
});

describe('validateCity', () => {
  it('accepts the real layout', () => {
    expect(validateCity(HARROWMARK_LAYOUT, { doors: DOORS })).toEqual([]);
  });

  it('flags a duplicate anchor id, a clash with another layout, and a bad patrol reference', () => {
    const l = clone(HARROWMARK_LAYOUT);
    l.anchors.push({ ...l.anchors[0] });
    l.patrols[0].points.push('harrowmark.patrol.nowhere.1');
    const errors = validateCity(l, { takenIds: new Set([l.anchors[1].id]) });
    expect(errors.some((e) => e.includes('duplicate anchor id'))).toBe(true);
    expect(errors.some((e) => e.includes('already defined by another layout'))).toBe(true);
    expect(errors.some((e) => e.includes('unknown anchor "harrowmark.patrol.nowhere.1"'))).toBe(true);
  });

  it('flags an NPC whose post anchor is missing', () => {
    const l = clone(HARROWMARK_LAYOUT);
    l.npcs.push({ id: 'ghost', post: 'npc-post.ghost' });
    expect(validateCity(l)).toContain('npc "ghost": unknown post anchor "npc-post.ghost"');
  });

  it('flags an anchor inside a building, and one outside the wall that is not part of the approach', () => {
    const l = clone(HARROWMARK_LAYOUT);
    l.anchors.push({ id: 'harrowmark.test.inside', x: 8360, z: 1330, yawDeg: 0 });
    l.anchors.push({ id: 'harrowmark.test.outside', x: 8500, z: 1000, yawDeg: 0 });
    const errors = validateCity(l);
    expect(errors.some((e) => e.includes('"harrowmark.test.inside": inside solid structure "barracks.hall"'))).toBe(true);
    expect(errors.some((e) => e.includes('"harrowmark.test.outside"') && e.includes('outside the wall'))).toBe(true);
  });

  it('flags a structure beyond the ring and two overlapping buildings', () => {
    const l = clone(HARROWMARK_LAYOUT);
    l.structures.push({ id: 'far.house', kind: 'house', x: 8500, z: 2790, yawDeg: 0, footprint: [20, 20], mode: 'solid' });
    l.structures.push({ id: 'dup.stables', kind: 'house', x: 8640, z: 1330, yawDeg: 0, footprint: [10, 10], mode: 'solid' });
    const errors = validateCity(l);
    expect(errors.some((e) => e.includes('"far.house"') && e.includes('beyond'))).toBe(true);
    expect(errors.some((e) => e.includes('"stables.hall" and "dup.stables" overlap') || e.includes('"dup.stables" and "stables.hall" overlap'))).toBe(true);
  });

  it('flags a door whose arrival point lands inside a building, or whose anchor is missing', () => {
    const l = clone(HARROWMARK_LAYOUT);
    // Stand just outside the Keep's south face but face into it: the 1.6 m arrival point lands in the hall.
    const door = l.anchors.find((a) => a.id === 'harrowmark.keep-hall.door')!;
    door.z = 2599;
    door.yawDeg = 180;
    const errors = validateCity(l, { doors: [{ doorId: 'keep-hall', anchor: 'harrowmark.keep-hall.door' }, { doorId: 'nope', anchor: 'harrowmark.nope.door' }] });
    expect(errors.some((e) => e.includes('door "keep-hall": arrival point is inside "keep.hall"'))).toBe(true);
    expect(errors).toContain('door "nope": missing anchor "harrowmark.nope.door"');
  });

  it('flags a rooftop anchor that floats over nothing or at the wrong height', () => {
    const l = clone(HARROWMARK_LAYOUT);
    l.anchors.push({ id: 'chase.test.void', x: 8500, z: 1500, yawDeg: 0, dy: 6, tags: ['elevated'] });
    l.anchors.push({ id: 'chase.test.wrong', x: 8850, z: 2296, yawDeg: 0, dy: 20, tags: ['elevated'] });
    const errors = validateCity(l);
    expect(errors.some((e) => e.includes('"chase.test.void": elevated but not over any structure'))).toBe(true);
    expect(errors.some((e) => e.includes('"chase.test.wrong": dy 20'))).toBe(true);
  });

  it('flags a hide name that cannot be an interactable id', () => {
    const l = clone(HARROWMARK_LAYOUT);
    l.anchors.push({ id: 'harrowmark.hide.bad name', x: 8500, z: 1500, yawDeg: 0, tags: ['hide'] });
    expect(validateCity(l).some((e) => e.includes('name must match'))).toBe(true);
  });

  it('arrival() steps along the yaw (yaw 0 faces -Z)', () => {
    expect(arrival({ id: 'x', x: 10, z: 10, yawDeg: 0 })).toEqual({ x: 10, z: 8.4 });
  });
});
