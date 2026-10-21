import { describe, expect, it } from 'vitest';
import { FLOAT_HEIGHT, boundsContain, layoutInterior, type InteriorLayout } from '../interiors/layout';
import { NavGrid } from '../nav/NavGrid';
import { findPath } from '../nav/pathfind';
import { heightAt } from '../terrain/heightfield';
import { INTERIOR_PRESETS } from '../audio/InteriorFx';
import { ACT2_DOOR_LOCKS, ACT2_INTERIORS } from '../interiors/act2';
import { GRISEL_HALL_DEF, GRISEL_HALL_DOOR_ID, GRISEL_HALL_ID, GRISEL_HALL_LOCK_FLAG } from './griselHall';
import { OLDSMOKE_LAYOUT } from './oldsmoke.layout';

const l: InteriorLayout = layoutInterior(GRISEL_HALL_DEF, heightAt);
const grid = new NavGrid(l.nav);
const anchorOf = (id: string) => {
  const a = l.anchors.find((x) => x.id === id);
  if (!a) throw new Error(`no anchor ${id}`);
  return a;
};
const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
const reaches = (from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }) => {
  const path = findPath(grid, from, to, 0.4);
  return path.length > 0 && dist(path[path.length - 1], to) <= 0.6;
};
const solidAt = (p: { x: number; y: number; z: number }) =>
  l.boxes.some((b) => b.kind !== 'blocker' && p.x > b.min.x && p.x < b.max.x && p.y > b.min.y && p.y < b.max.y && p.z > b.min.z && p.z < b.max.z);
const room = (id: string) => GRISEL_HALL_DEF.rooms.find((r) => r.id === id)!;
/** The local position of an anchor (the layout's anchors are in world metres above the float). */
const local = (id: string) => {
  const a = GRISEL_HALL_DEF.anchors.find((x) => x.id === id)!;
  return { x: a.x, z: a.z };
};
const inRoom = (id: string, rid: string) => {
  const p = local(id);
  const r = room(rid);
  return p.x >= r.x0 && p.x <= r.x1 && p.z >= r.z0 && p.z <= r.z1;
};

describe('Grisel Hall', () => {
  const first = anchorOf('oldsmoke.hall.entry').position;

  it('lays out, floating FLOAT_HEIGHT over the door', () => {
    expect(l.boxes.length).toBeGreaterThan(10);
    expect(first.y - l.floorY).toBeLessThan(1);
    expect(l.floorY).toBeGreaterThanOrEqual(heightAt(GRISEL_HALL_DEF.site.x, GRISEL_HALL_DEF.site.z) + FLOAT_HEIGHT - 1);
  });

  it('puts every anchor on a walkable cell with 0.4 m clearance, in bounds and clear of solids', () => {
    for (const a of l.anchors) {
      const i = grid.cellIndex(a.position.x, a.position.z);
      expect(grid.isWalkable(i), a.id).toBe(true);
      expect(grid.clearance(i), a.id).toBeGreaterThanOrEqual(0.4);
      expect(boundsContain(l.bounds, a.position), a.id).toBe(true);
      expect(solidAt({ ...a.position, y: a.position.y + 1 }), a.id).toBe(false);
    }
  });

  it('reaches every anchor from the door, including the gallery, the study and the corridor behind the dais', () => {
    for (const a of l.anchors) expect(reaches(first, a.position), a.id).toBe(true);
  });

  it('reaches every pair of quest anchors both ways (M16 dais, M21 checkpoints, hide spots, letters)', () => {
    const ids = [
      'oldsmoke.hall.dais', 'oldsmoke.hall.aldous', 'oldsmoke.hall.wenna', 'oldsmoke.stealth.m21.start', 'oldsmoke.stealth.m21.cp.gallery',
      'oldsmoke.stealth.m21.cp.study', 'oldsmoke.stealth.m21.end', 'oldsmoke.hall.exit',
      ...[1, 2, 3].flatMap((n) => [`oldsmoke.hall.study.letter.${n}`, `oldsmoke.m21.evidence.${n}`]),
      ...[1, 2, 3, 4].flatMap((n) => [`oldsmoke.hide.m21.${n}`, `oldsmoke.hall.steward.${n}`, `oldsmoke.hall.guard.${n}`]),
    ];
    for (const a of ids) for (const b of ids) if (a < b) expect(reaches(anchorOf(a).position, anchorOf(b).position), `${a} -> ${b}`).toBe(true);
  });

  it('keeps the exit within 2.5 m of the entry and the door wired to A4\'s outside anchor', () => {
    expect(dist(anchorOf('oldsmoke.hall.entry').position, anchorOf('oldsmoke.hall.exit').position)).toBeLessThanOrEqual(2.5);
    expect(dist(anchorOf('oldsmoke.hall.entry').position, anchorOf('oldsmoke.hall.exit').position)).toBeGreaterThanOrEqual(1);
    expect(GRISEL_HALL_DEF.doors).toEqual([{ doorId: GRISEL_HALL_DOOR_ID, outside: 'oldsmoke.hall.door', inside: 'oldsmoke.hall.entry', exit: 'oldsmoke.hall.exit' }]);
    expect(OLDSMOKE_LAYOUT.anchors.some((a) => a.id === 'oldsmoke.hall.door')).toBe(true);
  });

  it('keeps the gallery behind a wall: the service corridor from the foyer is the only way in from the hall side', () => {
    // Walking the gallery is possible without crossing the audience floor: a path exists that never enters the audience room.
    const audience = room('audience');
    const path = findPath(grid, first, anchorOf('oldsmoke.stealth.m21.cp.gallery').position, 0.4);
    expect(path.length).toBeGreaterThan(0);
    // The entry is local (0, -1); local z grows toward the door, world z the same way.
    const worldX = (lx: number) => first.x + lx;
    const worldZ = (lz: number) => first.z + (lz + 1);
    const insideAudience = (p: { x: number; z: number }) => p.x > worldX(audience.x0) + 1 && p.x < worldX(audience.x1) - 1 && p.z > worldZ(audience.z0) + 1 && p.z < worldZ(audience.z1) - 1;
    for (const p of path) expect(insideAudience(p), `(${p.x.toFixed(1)}, ${p.z.toFixed(1)})`).toBe(false);
    // Not vacuous: the walk to the dais does cross the audience floor.
    expect(findPath(grid, first, anchorOf('oldsmoke.hall.dais').position, 0.4).some(insideAudience)).toBe(true);
  });

  it('puts the stealth, hide and watch anchors in the rooms they are meant for', () => {
    expect(inRoom('oldsmoke.stealth.m21.cp.gallery', 'gallery')).toBe(true);
    expect(inRoom('oldsmoke.stealth.m21.cp.study', 'study')).toBe(true);
    expect(inRoom('oldsmoke.hide.m21.1', 'gallery')).toBe(true);
    expect(inRoom('oldsmoke.hide.m21.2', 'gallery')).toBe(true);
    expect(inRoom('oldsmoke.hide.m21.3', 'back')).toBe(true);
    expect(inRoom('oldsmoke.hide.m21.4', 'study')).toBe(true);
    expect(inRoom('spawn.m21.watch-1', 'audience')).toBe(true);
    expect(inRoom('spawn.m21.watch-3', 'gallery')).toBe(true);
    for (const n of [1, 2, 3]) expect(inRoom(`oldsmoke.hall.study.letter.${n}`, 'study')).toBe(true);
    for (const n of [1, 2, 3, 4, 5]) expect(inRoom(`patrol.m21.hall.${n}`, 'audience')).toBe(true);
  });

  it('sets the study door as a blocker inside the doorway room, open by default', () => {
    const door = GRISEL_HALL_DEF.blockers.find((b) => b.id === 'oldsmoke.hall.study.door')!;
    const r = room('study-door');
    expect(door.rect.x0).toBeGreaterThanOrEqual(r.x0 - 1);
    expect(door.rect.x1).toBeLessThanOrEqual(r.x1 + 1);
    expect(door.rect.z0).toBeGreaterThanOrEqual(r.z0);
    expect(door.rect.z1).toBeLessThanOrEqual(r.z1);
    expect(l.boxes.some((b) => b.kind === 'blocker')).toBe(true);
  });

  it('gives the hostile guards four posts inside the audience hall and the stewards four more', () => {
    for (const n of [1, 2, 3, 4]) {
      expect(inRoom(`oldsmoke.hall.guard.${n}`, 'audience')).toBe(true);
      expect(inRoom(`oldsmoke.hall.steward.${n}`, 'audience')).toBe(true);
    }
  });

  it('has the interior music preset ready (A14\'s `grisel-hall` entry)', () => {
    expect(INTERIOR_PRESETS[GRISEL_HALL_ID]).toBeDefined();
  });

  it('is registered with the Act 2 interiors and locked by A13\'s story.m16.started', () => {
    expect(ACT2_INTERIORS.some((d) => d.id === GRISEL_HALL_ID)).toBe(true);
    expect(ACT2_DOOR_LOCKS[GRISEL_HALL_DOOR_ID]).toBe(GRISEL_HALL_LOCK_FLAG);
    expect(GRISEL_HALL_LOCK_FLAG).toBe('story.m16.started');
  });

  it('has a fog that covers the whole hall', () => {
    const far = Math.max(...GRISEL_HALL_DEF.rooms.map((r) => Math.hypot(r.x1 - r.x0, r.z1 - r.z0)));
    expect(GRISEL_HALL_DEF.environment.fogFar).toBeGreaterThan(far);
  });
});
