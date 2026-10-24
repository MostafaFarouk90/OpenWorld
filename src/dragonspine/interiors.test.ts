import { describe, expect, it } from 'vitest';
import { ALL_INTERIORS } from '../interiors/interiors.plugin';
import { ACT3_DOOR_LOCKS, ACT3_FLAG_BLOCKERS, ACT3_INTERIORS } from '../interiors/act3';
import { MAX_GROUND_RANGE, groundRange, layoutInterior } from '../interiors/layout';
import { Containment } from '../region/containment';
import { ACT3_CORRIDORS, ACT3_HOLES } from '../region/act3Containment';
import { SUMMIT_BOX, areaAt } from '../region/areas';
import { heightAt } from '../terrain/heightfield';
import { CAVE_AREA, COLLAPSED_CAVE_ID, DRAGONSPINE_DOOR_LOCKS, DRAGONSPINE_FLAG_BLOCKERS, DRAGONSPINE_INTERIORS, ROCKFALL_BLOCKER_ID, WYRMWATCH_HALL_ID } from './interiors';
import { padFromRecord } from './inputs';
import { buildDragonspine } from './layout';
import { buildDragonspineInteriors } from './interiors';
import { R16_ROCKFALL_CLEARED_FLAG, R16_STARTED_FLAG } from './flags';
import { registerDragonspineKinds } from './structureKinds';
import { stubInputs } from './testing/fixture';

const hall = DRAGONSPINE_INTERIORS.find((d) => d.id === WYRMWATCH_HALL_ID)!;
const cave = DRAGONSPINE_INTERIORS.find((d) => d.id === COLLAPSED_CAVE_ID)!;

describe('the Dragonspine interiors', () => {
  it('are registered through the Act 3 index and the interiors plugin\'s list', () => {
    expect(ACT3_INTERIORS.map((d) => d.id)).toEqual([WYRMWATCH_HALL_ID, COLLAPSED_CAVE_ID]);
    for (const d of ACT3_INTERIORS) expect(ALL_INTERIORS).toContain(d);
    expect(ACT3_DOOR_LOCKS).toEqual({ 'collapsed-cave': 'story.r16.started' });
    expect(DRAGONSPINE_DOOR_LOCKS['wyrmwatch-hall']).toBeUndefined();
    expect(ACT3_FLAG_BLOCKERS).toEqual({ [ROCKFALL_BLOCKER_ID]: 'story.r16.rockfallCleared' });
    expect(DRAGONSPINE_FLAG_BLOCKERS).toEqual(ACT3_FLAG_BLOCKERS);
    expect(R16_STARTED_FLAG).toBe('story.r16.started');
    expect(R16_ROCKFALL_CLEARED_FLAG).toBe('story.r16.rockfallCleared');
  });

  it('have unique anchor and trigger ids under the dragonspine prefixes, with the plan\'s names', () => {
    const ids = DRAGONSPINE_INTERIORS.flatMap((d) => d.anchors.map((a) => a.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id.startsWith('dragonspine.'), id).toBe(true);
    for (const id of ['dragonspine.hall.inside', 'dragonspine.hall.exit', 'dragonspine.hall.dais', 'dragonspine.hall.hearth', 'dragonspine.cave.inside', 'dragonspine.cave.exit', 'dragonspine.cave.rockfall', 'dragonspine.cave.axe', ...[1, 2, 3, 4, 5, 6].map((n) => `dragonspine.cave.search.${n}`)]) expect(ids, id).toContain(id);
    for (const t of DRAGONSPINE_INTERIORS.flatMap((d) => d.triggers)) expect(t.id.startsWith('trg.dragonspine.')).toBe(true);
    expect(cave.anchors.some((a) => a.id === 'dragonspine.wyrmwatch.hearth')).toBe(false);
  });

  it('the cave has a rockfall blocker that starts closed, and an axe chamber past it', () => {
    const b = cave.blockers.find((x) => x.id === ROCKFALL_BLOCKER_ID)!;
    expect(b.startClosed).toBe(true);
    const axe = cave.anchors.find((a) => a.id === 'dragonspine.cave.axe')!;
    expect(axe.z).toBeLessThan(b.rect.z0);
    const before = cave.anchors.find((a) => a.id === 'dragonspine.cave.rockfall')!;
    expect(before.z).toBeGreaterThan(b.rect.z1);
    expect(hall.blockers).toEqual([]);
    expect(hall.props!.map((p) => p.id)).toEqual(expect.arrayContaining(['dais.1', 'table.1', 'hearth.1', 'bench.1', 'bench.2']));
  });

  it('keep their rooms and anchors inside the pad\'s footprint', () => {
    const inp = stubInputs();
    for (const def of DRAGONSPINE_INTERIORS) {
      const pad = inp.pads.find((p) => p.id === def.id)!;
      expect(def.site).toEqual(pad.site);
      for (const r of def.rooms) {
        expect(def.site.x + r.x0 - 1).toBeGreaterThanOrEqual(pad.footprint.minX);
        expect(def.site.x + r.x1 + 1).toBeLessThanOrEqual(pad.footprint.maxX);
        expect(def.site.z + r.z0 - 1).toBeGreaterThanOrEqual(pad.footprint.minZ);
        expect(def.site.z + r.z1 + 1).toBeLessThanOrEqual(pad.footprint.maxZ);
      }
    }
  });

  it('pass the float check on the shaped ground: ground range within MAX_GROUND_RANGE under each footprint', () => {
    for (const d of DRAGONSPINE_INTERIORS) {
      const r = groundRange(d, heightAt);
      expect(r.max - r.min, d.id).toBeLessThanOrEqual(MAX_GROUND_RANGE);
      expect(() => layoutInterior(d, heightAt)).not.toThrow();
    }
  });

  it('keeps both floats in the lower slopes: every room corner is inside the area, outside the summit box and hole, and open in every flag state', () => {
    expect(CAVE_AREA).toBe('dragonspine-lower');
    const open: Record<string, boolean> = { 'story.gate.a3': true, 'story.phase.dragonspineOpen': true };
    const summit = Object.fromEntries((ACT3_HOLES[0]!.openWhen as { all: string[] }).all.map((k) => [k, true]));
    for (const d of [hall, cave]) {
      const corners = [
        [d.site.x, d.site.z],
        ...d.rooms.flatMap((r) => [
          [d.site.x + r.x0, d.site.z + r.z0],
          [d.site.x + r.x1, d.site.z + r.z0],
          [d.site.x + r.x0, d.site.z + r.z1],
          [d.site.x + r.x1, d.site.z + r.z1],
        ]),
      ] as const;
      for (const [x, z] of corners) {
        expect(areaAt(x, z), d.id).toBe(CAVE_AREA);
        expect(x >= SUMMIT_BOX.x0 && x < SUMMIT_BOX.x1 && z >= SUMMIT_BOX.z0 && z < SUMMIT_BOX.z1, d.id).toBe(false);
        expect(z, d.id).toBeLessThan(SUMMIT_BOX.z0);
        for (const flags of [open, { ...open, ...summit }]) {
          const c = new Containment({ getFlag: (k: string) => flags[k] }, ACT3_CORRIDORS, ACT3_HOLES);
          expect(c.isOpen(x, z), `${d.id} ${x},${z}`).toBe(true);
        }
      }
    }
  });

  it('puts every anchor and every exit at least 1.5 m inside a room, and every door anchor in a room', () => {
    for (const d of DRAGONSPINE_INTERIORS) {
      for (const a of d.anchors) {
        const inside = d.rooms.some((r) => a.x > r.x0 && a.x < r.x1 && a.z > r.z0 && a.z < r.z1);
        expect(inside, `${d.id} ${a.id}`).toBe(true);
        if (a.id.endsWith('.exit') || a.id.endsWith('.inside')) {
          const room = d.rooms.find((r) => a.x >= r.x0 && a.x <= r.x1 && a.z >= r.z0 && a.z <= r.z1)!;
          expect(Math.min(a.x - room.x0, room.x1 - a.x, a.z - room.z0, room.z1 - a.z), `${d.id} ${a.id} margin`).toBeGreaterThanOrEqual(1.5);
        }
      }
    }
  });

  it('throws on a pad too small for its rooms', () => {
    const inp = stubInputs();
    const shrink = (id: string, w: number, d: number) => inp.pads.map((p) => (p.id === id ? padFromRecord(id, { x: (p.footprint.minX + p.footprint.maxX) / 2, z: (p.footprint.minZ + p.footprint.maxZ) / 2, w, d }) : p));
    expect(() => buildDragonspineInteriors({ pads: shrink('wyrmwatch-hall', 30, 10) })).toThrow(/too small/);
    expect(() => buildDragonspineInteriors({ pads: shrink('wyrmwatch-hall', 10, 20) })).toThrow(/too small/);
    expect(() => buildDragonspineInteriors({ pads: shrink('collapsed-cave', 50, 20) })).toThrow(/too small/);
    expect(() => buildDragonspineInteriors({ pads: shrink('collapsed-cave', 8, 60) })).toThrow(/too small/);
  });

  it('stands at least 130 m from every other interior (Act 1 and 2 included)', () => {
    for (const d of DRAGONSPINE_INTERIORS) {
      for (const o of ALL_INTERIORS) {
        if (o === d) continue;
        expect(Math.hypot(o.site.x - d.site.x, o.site.z - d.site.z), `${d.id} vs ${o.id}`).toBeGreaterThanOrEqual(130);
      }
    }
  });

  it('puts the three waystones outside every interior and inside the open area once the gate and the phase hold', () => {
    registerDragonspineKinds()();
    const b = buildDragonspine(stubInputs());
    const flags: Record<string, boolean> = { 'story.gate.a3': true, 'story.phase.dragonspineOpen': true };
    const c = new Containment({ getFlag: (k: string) => flags[k] }, ACT3_CORRIDORS, ACT3_HOLES);
    const closed = new Containment({ getFlag: (k: string) => ({ 'story.gate.a3': true })[k as 'story.gate.a3'] }, ACT3_CORRIDORS, ACT3_HOLES);
    const stones = b.layout.anchors.filter((a) => a.tags?.includes('waystone'));
    expect(stones.map((s) => s.id).sort()).toEqual(['waystone.last-anvil', 'waystone.rime-pass', 'waystone.wyrmwatch-lodge']);
    for (const s of stones) {
      expect(c.isOpen(s.x, s.z), s.id).toBe(true);
      expect(closed.isOpen(s.x, s.z), `${s.id} closed in Phase E`).toBe(false);
      for (const d of ALL_INTERIORS) {
        const inside = d.rooms.some((r) => s.x >= d.site.x + r.x0 - 1 && s.x <= d.site.x + r.x1 + 1 && s.z >= d.site.z + r.z0 - 1 && s.z <= d.site.z + r.z1 + 1);
        expect(inside, `${s.id} in ${d.id}`).toBe(false);
      }
    }
  });

  it('rebuilds from a pad: the same def for the same pad, a different site for a moved pad', () => {
    const inp = stubInputs();
    expect(buildDragonspineInteriors(inp)).toEqual(DRAGONSPINE_INTERIORS);
    const moved = buildDragonspineInteriors({
      pads: inp.pads.map((p) => ({ ...p, site: { x: p.site.x + 5, z: p.site.z }, footprint: { ...p.footprint, minX: p.footprint.minX + 5, maxX: p.footprint.maxX + 5 } })),
    });
    expect(moved[0]!.site.x).toBe(inp.pads[0]!.site.x + 5);
  });
});
