// Act 4 L1 PR 2: the Waste's places (plans/act4-L1.md section 16). The ids other threads import, the clearances (rope lanes,
// sites, the Caldera hole), the generated anchors doc, and the two interiors (D08's nave and crypt, the chapel).
import { readFileSync } from '../region/testing/nodeFs';
import { describe, expect, it } from 'vitest';
import { renderAnchorsDoc } from '../region/anchorsDoc';
import { validateLayout } from '../region/validateLayout';
import { nearestRopeDistance } from './ropeDistance';
import { heightAt } from '../terrain/heightfield';
import { CALDERA_BOX, WASTE_BOX } from '../terrain/shape/waste';
import { layoutInterior, standsIn, groundRange, MAX_GROUND_RANGE } from '../interiors/layout';
import { footprintBox } from '../region/geometry';
import { WASTE_DOC, WASTE_LAYOUT } from './waste.layout';
import { WASTE_MAX_FOOTPRINT_SPREAD } from './waste.plugin';
import { CAIRN_CLEARING, CAIRNS, CAMP, CHAPEL_MUSIC_BOX, CHAPEL_NEST, R25_HEARTHS, SLAG, WASTE_POIS, WASTE_SITE_DISCS, poiAnchorId } from './wasteSites';
import {
  CINDER_CHAPEL_DEF,
  HUSK_CATHEDRAL_ARENA,
  HUSK_CATHEDRAL_ARENA_GATE,
  HUSK_CATHEDRAL_ASH,
  HUSK_CATHEDRAL_CRYPT_GATE,
  HUSK_CATHEDRAL_DEF,
  WASTE_DOOR_LOCKS,
  WASTE_FLAG_BLOCKERS,
  WASTE_INTERIORS,
} from './interiors';

const ids = WASTE_LAYOUT.anchors.map((a) => a.id);
const anchor = (id: string) => {
  const a = WASTE_LAYOUT.anchors.find((x) => x.id === id);
  if (!a) throw new Error(`no anchor ${id}`);
  return a;
};
const inBox = (b: { x0: number; z0: number; x1: number; z1: number }, x: number, z: number) => x >= b.x0 && x < b.x1 && z >= b.z0 && z < b.z1;

describe('WASTE_ANCHORS.md', () => {
  it('matches the layout (regenerate with npx vite-node tools/gen-region-docs.ts)', () => {
    expect(readFileSync('src/waste/WASTE_ANCHORS.md', 'utf8')).toBe(renderAnchorsDoc(WASTE_LAYOUT, WASTE_DOC));
  });
});

describe("the Waste's places", () => {
  it('has unique ids under the Act 4 prefixes (or the contract waystone and post names)', () => {
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(['waste.', 'waystone.', 'npc-post.'].some((p) => id.startsWith(p)), id).toBe(true);
    for (const t of WASTE_LAYOUT.triggers) expect(t.id.startsWith('trg.waste.'), t.id).toBe(true);
    const sids = WASTE_LAYOUT.structures.map((s) => s.id);
    expect(new Set(sids).size).toBe(sids.length);
  });

  it('defines every id L5, L6, L7, L9 and L11 asked for', () => {
    for (const id of [
      'waste.walker-camp.rest',
      'waste.walker-camp.pyre.1', 'waste.walker-camp.pyre.3',
      'waste.walker-camp.cistern.1', 'waste.walker-camp.cistern.2',
      'waste.walker-camp.trial-ring',
      'waste.walker-camp.storm-walk.start', 'waste.walker-camp.storm-walk.end',
      ...[1, 2, 3, 4, 5].map((k) => `waste.walker-camp.storm-walk.knot.${k}`),
      'waste.walker-camp.gate',
      'waste.walker-camp.shop.wulfhild',
      'npc-post.wulfhild.camp', 'npc-post.hrodna.camp', 'npc-post.carter.camp', 'npc-post.walker.1.camp',
      'waystone.walker-camp', 'waystone.cinder-chapel', 'waystone.glasslands',
      'waste.cinder-chapel.door', 'npc-post.ebba.chapel',
      'waste.cinder-chapel.house.2.nest', 'waste.cinder-chapel.house.3.music-box',
      'waste.glasslands.strike', 'waste.glasslands.pillar.6', 'waste.glasslands.plaque.3',
      'waste.husk-cathedral',
      'waste.cinder-road.cairn.1', 'waste.cinder-road.cairn.3.lore', 'waste.cinder-road.glass-drift',
      'npc-post.wulfhild.rimfoot', 'waste.rimfoot.cam', 'waste.rimfoot.companion.tobb',
      ...WASTE_POIS.map((p) => poiAnchorId(p.id)),
      ...[1, 2, 3].map((k) => `waste.poi.burned-village.${k}.hearth`),
    ]) {
      expect(ids, id).toContain(id);
    }
    expect(WASTE_POIS.map((p) => p.id)).toHaveLength(11);
  });

  it('passes the layout validator on the real ground', () => {
    expect(validateLayout(WASTE_LAYOUT, heightAt, { spawnId: null, maxFootprintSpread: WASTE_MAX_FOOTPRINT_SPREAD })).toEqual([]);
  });

  it('keeps everything in the open Waste, out of the Caldera hole', () => {
    for (const a of WASTE_LAYOUT.anchors) {
      expect(inBox(WASTE_BOX, a.x, a.z), a.id).toBe(true);
      expect(inBox(CALDERA_BOX, a.x, a.z), a.id).toBe(false);
    }
  });

  it('keeps every solid structure off the rope lanes (the storm-safe paths stay clear)', () => {
    for (const s of WASTE_LAYOUT.structures) {
      if (s.mode !== 'solid') continue;
      // Sample the footprint's edge: every point stays outside the lane (half width 4) with half a metre to spare.
      const b = footprintBox(s);
      const yaw = (s.yawDeg * Math.PI) / 180;
      let near = Infinity;
      for (let k = 0; k <= 40; k++) {
        const t = k / 40;
        for (const [lx, lz] of [[-b.hx + 2 * b.hx * t, -b.hz], [-b.hx + 2 * b.hx * t, b.hz], [-b.hx, -b.hz + 2 * b.hz * t], [b.hx, -b.hz + 2 * b.hz * t]] as const) {
          near = Math.min(near, nearestRopeDistance(b.cx + lx * Math.cos(yaw) + lz * Math.sin(yaw), b.cz - lx * Math.sin(yaw) + lz * Math.cos(yaw)));
        }
      }
      expect(near, s.id).toBeGreaterThan(4.5);
    }
  });

  it('keeps the points of interest 60 m off the rope-lines and 120 m off the sites, on gentle ground', () => {
    for (const p of WASTE_POIS) {
      expect(nearestRopeDistance(p.at[0], p.at[1]), p.id).toBeGreaterThan(60);
      for (const s of WASTE_SITE_DISCS) expect(Math.hypot(s.at[0] - p.at[0], s.at[1] - p.at[1]) - s.radius, `${p.id} ${s.id}`).toBeGreaterThan(120);
    }
  });

  it("spreads R25's hearths over the three burned villages (about 2 km of walking, coordinator ruling)", () => {
    const d = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!);
    const walk = d(R25_HEARTHS[0]!, R25_HEARTHS[1]!) + d(R25_HEARTHS[1]!, R25_HEARTHS[2]!);
    expect(walk).toBeGreaterThan(1500);
    expect(walk).toBeLessThan(2600);
  });

  it('keeps the music box 3 m from the nest and the M43 posts 3 m from each other', () => {
    expect(Math.hypot(CHAPEL_MUSIC_BOX[0] - CHAPEL_NEST[0], CHAPEL_MUSIC_BOX[1] - CHAPEL_NEST[1])).toBeGreaterThan(3);
    const posts = Object.values(CAMP.posts);
    for (let i = 0; i < posts.length; i++) for (let j = i + 1; j < posts.length; j++) expect(Math.hypot(posts[i]![0] - posts[j]![0], posts[i]![1] - posts[j]![1])).toBeGreaterThanOrEqual(3);
  });

  it("keeps each cairn's wave clearing free of solid structures but its own stones", () => {
    CAIRNS.forEach((c, i) => {
      for (const s of WASTE_LAYOUT.structures) {
        if (s.mode !== 'solid' || s.id === `waste.cinder-road.cairn.${i + 1}.stones`) continue;
        expect(Math.hypot(s.x - c.lane[0], s.z - c.lane[1]), s.id).toBeGreaterThan(CAIRN_CLEARING);
      }
    });
  });

  it('strikes each pillar from a face 1.8 m in front of it', () => {
    SLAG.pillars.forEach((p, i) => {
      const f = anchor(`waste.glasslands.pillar.${i + 1}`);
      expect(Math.hypot(f.x - p[0], f.z - p[1])).toBeCloseTo(1.8, 1);
    });
  });
});

describe("the Waste's interiors", () => {
  it('ships the chapel and the cathedral, every anchor inside a room, ground within the save window', () => {
    expect(WASTE_INTERIORS.map((d) => d.id)).toEqual(['cinder-chapel', 'husk-cathedral']);
    for (const def of WASTE_INTERIORS) {
      const l = layoutInterior(def, heightAt);
      for (const a of l.anchors) expect(standsIn(l, a.position), `${def.id} ${a.id}`).toBe(true);
      const g = groundRange(def, heightAt);
      expect(g.max - g.min, def.id).toBeLessThanOrEqual(MAX_GROUND_RANGE);
    }
  });

  it('floats the cathedral inside the open Waste and never over the Caldera hole', () => {
    const l = layoutInterior(HUSK_CATHEDRAL_DEF, heightAt);
    for (const [x, z] of [
      [l.bounds.min.x, l.bounds.min.z],
      [l.bounds.max.x, l.bounds.max.z],
    ]) {
      expect(inBox(WASTE_BOX, x!, z!)).toBe(true);
      expect(inBox(CALDERA_BOX, x!, z!)).toBe(false);
    }
  });

  it("gives L6 a flat 30 x 40 m nave with the gong at the far end and L5's and L6's ash piles inside it", () => {
    const a = HUSK_CATHEDRAL_ARENA;
    expect([a.x1 - a.x0, a.z1 - a.z0]).toEqual([30, 40]);
    for (const p of HUSK_CATHEDRAL_ASH) expect(p.x > a.x0 && p.x < a.x1 && p.z > a.z0 && p.z < a.z1).toBe(true);
    const ids = HUSK_CATHEDRAL_DEF.anchors.map((x) => x.id);
    for (const id of ['eormen', 'entry', 'mouth', 'gong', 'altar', 'ash.1', 'ash.6']) expect(ids).toContain(`waste.cathedral.nave.${id}`);
    for (const id of ['knight-1', 'knight-2', 'bones', 'gong-rope']) expect(ids).toContain(`waste.cathedral.narthex.${id}`);
    const gong = HUSK_CATHEDRAL_DEF.anchors.find((x) => x.id === 'waste.cathedral.nave.gong')!;
    expect(gong.z).toBeGreaterThan(a.z1 - 5);
    expect(HUSK_CATHEDRAL_DEF.triggers.map((t) => t.id)).toEqual(['trg.waste.cathedral.nave']);
  });

  it('builds the arena gate open (BossArena drives it) and the crypt gate shut until Eormen has an outcome', () => {
    const gate = HUSK_CATHEDRAL_DEF.blockers.find((b) => b.id === HUSK_CATHEDRAL_ARENA_GATE)!;
    expect(gate.startClosed).toBe(false);
    expect(WASTE_FLAG_BLOCKERS).toEqual({ [HUSK_CATHEDRAL_CRYPT_GATE]: 'boss.eormen.outcome' });
    expect(HUSK_CATHEDRAL_DEF.blockers.find((b) => b.id === HUSK_CATHEDRAL_CRYPT_GATE)!.startClosed).toBe(true);
    expect(WASTE_DOOR_LOCKS).toEqual({ 'husk-cathedral': 'story.d08.started' });
  });

  it('joins the narthex to the nave only through the nave door the arena gate fills', () => {
    const room = (id: string) => HUSK_CATHEDRAL_DEF.rooms.find((r) => r.id === id)!;
    const narthex = room('narthex');
    const door = room('nave-door');
    const a = HUSK_CATHEDRAL_ARENA;
    expect(narthex.z1).toBeLessThan(a.z0);
    expect([door.z0, door.z1]).toEqual([narthex.z1, a.z0]);
    const gate = HUSK_CATHEDRAL_DEF.blockers.find((b) => b.id === HUSK_CATHEDRAL_ARENA_GATE)!.rect;
    expect([gate.x0, gate.x1]).toEqual([door.x0, door.x1]);
    expect(gate.z0 >= door.z0 && gate.z1 <= door.z1).toBe(true);
    // No other room touches the nave (the crypt stops 0.5 m short of it, behind its own gate).
    for (const r of HUSK_CATHEDRAL_DEF.rooms) if (r.id !== 'nave-door' && r.id !== 'nave') expect(r.z1 < a.z0, r.id).toBe(true);
  });

  it("keeps the crypt out of the arena (it opens off the narthex)", () => {
    const crypt = HUSK_CATHEDRAL_DEF.rooms.find((r) => r.id === 'crypt')!;
    const a = HUSK_CATHEDRAL_ARENA;
    expect(crypt.z1 <= a.z0 || crypt.x0 >= a.x1).toBe(true);
  });

  it('leaves no slot under 1 m between a solid prop and a wall (a player could be pinned in it)', () => {
    for (const def of [HUSK_CATHEDRAL_DEF, CINDER_CHAPEL_DEF]) {
      for (const p of def.props) {
        if (p.walkable) continue;
        const room = def.rooms.find((r) => p.rect.x0 >= r.x0 && p.rect.x1 <= r.x1 && p.rect.z0 >= r.z0 && p.rect.z1 <= r.z1);
        expect(room, `${def.id} ${p.id} sits in one room`).toBeDefined();
        for (const gap of [p.rect.x0 - room!.x0, room!.x1 - p.rect.x1, p.rect.z0 - room!.z0, room!.z1 - p.rect.z1]) {
          expect(gap === 0 || gap >= 1, `${def.id} ${p.id} gap ${gap}`).toBe(true);
        }
      }
    }
  });

  it('has a door prompt in and out of both interiors', async () => {
    const { INTERIOR_STRINGS_EN } = await import('../interiors/strings.en');
    for (const id of ['husk-cathedral', 'cinder-chapel']) for (const way of ['enter', 'exit']) expect(INTERIOR_STRINGS_EN[`interior.${way}.${id}`]).toMatch(/^\{key\} /);
  });

  it("opens the chapel's door onto the shell's south face", () => {
    expect(CINDER_CHAPEL_DEF.doors[0]!.outside).toBe('waste.cinder-chapel.door');
    expect(ids).toContain('waste.cinder-chapel.door');
  });
});
