// Act 5 N2: the Caldera interiors' layouts (plans/act5-N2.md section 7): the float and the pad, anchors, doors and links, the camera
// wall rule, headroom, the flag-driven gates, the tunnel's two far-end states and the Hammer Hall's pit. Shipped pins run unchanged.
import { describe, expect, it } from 'vitest';
import { NavGrid } from '../../nav/NavGrid';
import { ALL_INTERIORS, validateInteriorLinks } from '../../interiors/interiors.plugin';
import { CELL, groundRange, layoutInterior, MAX_GROUND_RANGE, standsIn, stairSteps, sunkenDepthAt, type InteriorLayout } from '../../interiors/layout';
import { heightAt } from '../../terrain/heightfield';
import {
  BLOCKERS, CALDERA_DOOR_LOCKS, CALDERA_FLAG_BLOCKERS, CALDERA_INTERIOR_PAD, CALDERA_INTERIORS, CALDERA_LINKS, COOLING_HALL_DEF, FOUNDRY_DESCENT_DEF, FOUNDRY_CHEST_ANCHOR,
  FOUNDRY_ARENA, HAMMER_HALL_DEF, HAMMER_PIT, STOKERS_TUNNEL_DEF,
} from '.';

const CALDERA_BOX = { x0: 9500, x1: 12500, z0: 6500, z1: 9500 };
const layouts = new Map(CALDERA_INTERIORS.map((d) => [d.id, layoutInterior(d, heightAt)]));
const L = (id: string): InteriorLayout => layouts.get(id)!;
const inR = (r: { x0: number; z0: number; x1: number; z1: number }, x: number, z: number) => x >= r.x0 && x < r.x1 && z >= r.z0 && z < r.z1;

function fnv(text: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x0100019d) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

describe('Caldera interiors: float and pad', () => {
  it('ships four interiors with unique ids, all in ALL_INTERIORS', () => {
    expect(CALDERA_INTERIORS.map((d) => d.id)).toEqual(['cooling-hall', 'stokers-tunnel', 'foundry-descent', 'hammer-hall']);
    for (const d of CALDERA_INTERIORS) expect(ALL_INTERIORS).toContain(d);
    expect(new Set(ALL_INTERIORS.map((d) => d.id)).size).toBe(ALL_INTERIORS.length);
  });

  it('floats each over ground that varies by well under the 40 m rule, inside the Caldera box', () => {
    for (const d of CALDERA_INTERIORS) {
      const g = groundRange(d, heightAt);
      expect(g.max - g.min, d.id).toBeLessThanOrEqual(20);
      expect(g.max - g.min, d.id).toBeLessThan(MAX_GROUND_RANGE);
      const b = L(d.id).bounds;
      expect(b.min.x).toBeGreaterThanOrEqual(CALDERA_BOX.x0);
      expect(b.max.x).toBeLessThanOrEqual(CALDERA_BOX.x1);
      expect(b.min.z).toBeGreaterThanOrEqual(CALDERA_BOX.z0);
      expect(b.max.z).toBeLessThanOrEqual(CALDERA_BOX.z1);
      expect(b.min.x, d.id).toBeGreaterThanOrEqual(CALDERA_INTERIOR_PAD.x0);
      expect(b.max.x, d.id).toBeLessThanOrEqual(CALDERA_INTERIOR_PAD.x1);
      expect(b.min.z, d.id).toBeGreaterThanOrEqual(CALDERA_INTERIOR_PAD.z0);
      expect(b.max.z, d.id).toBeLessThanOrEqual(CALDERA_INTERIOR_PAD.z1);
    }
  });

  it('keeps the whole pad flat enough (fails if a later bowl edit reaches the north crest)', () => {
    let lo = Infinity;
    let hi = -Infinity;
    for (let x = CALDERA_INTERIOR_PAD.x0; x <= CALDERA_INTERIOR_PAD.x1; x += 25) {
      for (let z = CALDERA_INTERIOR_PAD.z0; z <= CALDERA_INTERIOR_PAD.z1; z += 25) {
        const h = heightAt(x, z);
        lo = Math.min(lo, h);
        hi = Math.max(hi, h);
      }
    }
    expect(hi - lo).toBeLessThanOrEqual(MAX_GROUND_RANGE);
  });

  it('keeps every pair of interiors more than 130 m apart (box to box), Caldera and shipped alike', () => {
    const gap = (lo1: number, hi1: number, lo2: number, hi2: number) => Math.max(0, lo2 - hi1, lo1 - hi2);
    for (const a of CALDERA_INTERIORS) {
      for (const other of ALL_INTERIORS) {
        if (other === a) continue;
        const A = L(a.id).bounds;
        const B = layoutInterior(other, heightAt).bounds;
        expect(Math.hypot(gap(A.min.x, A.max.x, B.min.x, B.max.x), gap(A.min.z, A.max.z, B.min.z, B.max.z)), `${a.id} vs ${other.id}`).toBeGreaterThan(130);
      }
    }
  });
});

describe('Caldera interiors: anchors, doors and links', () => {
  it('stands every anchor in a room, off pillars and solid props, with the owned prefixes', () => {
    for (const d of CALDERA_INTERIORS) {
      const l = L(d.id);
      for (const a of l.anchors) expect(standsIn(l, a.position), `${d.id} ${a.id}`).toBe(true);
      for (const a of d.anchors) expect(a.id, d.id).toMatch(/^caldera\.int\./);
      for (const t of d.triggers) expect(t.id, d.id).toMatch(/^trg\.caldera\.int\./);
      expect(new Set(d.anchors.map((a) => a.id)).size, d.id).toBe(d.anchors.length);
    }
  });

  it('names the door anchors, each door has its inside and (unless link-only) exit anchors, the world-safe door first', () => {
    for (const d of CALDERA_INTERIORS) {
      const ids = new Set(d.anchors.map((a) => a.id));
      for (const door of d.doors) {
        expect(ids.has(door.inside), `${d.id} ${door.doorId}`).toBe(true);
        if (door.exit !== 'harrowmark.a4.link-only') expect(ids.has(door.exit)).toBe(true);
        expect(door.outside).toMatch(/^caldera\.door\./);
      }
    }
    expect(HAMMER_HALL_DEF.doors[0]!.outsideInteractable).toBe(false);
    expect(FOUNDRY_DESCENT_DEF.doors[0]!.outsideInteractable).toBeUndefined();
  });

  it('links the Foundry and the Hammer Hall both ways and validates against all interiors', () => {
    validateInteriorLinks(CALDERA_LINKS, ALL_INTERIORS);
    const pairs = CALDERA_LINKS.map((l) => `${l.from.interior}>${l.to.interior}`);
    expect(pairs).toEqual(['foundry-descent>hammer-hall', 'hammer-hall>foundry-descent']);
    for (const link of CALDERA_LINKS) {
      const from = CALDERA_INTERIORS.find((d) => d.id === link.from.interior)!;
      expect(from.anchors.some((a) => a.id === link.from.anchor)).toBe(true);
    }
  });

  it('locks four doors on quest flags and drives six blockers by flag; the Cooling Hall is not linked', () => {
    expect(CALDERA_DOOR_LOCKS).toEqual({
      'cooling-hall': 'story.m49.complete',
      'stokers-tunnel': 'story.r27.started',
      'foundry-descent': 'story.d09.started',
      'hammer-hall': 'story.d09.complete',
    });
    expect(Object.keys(CALDERA_FLAG_BLOCKERS).sort()).toEqual(
      [BLOCKERS.coolingGate2, BLOCKERS.coolingGate3, BLOCKERS.coolingForge, BLOCKERS.foundryLift, BLOCKERS.foundryArenaExit, BLOCKERS.hammerHallGate].sort(),
    );
    for (const id of Object.keys(CALDERA_FLAG_BLOCKERS)) {
      const def = CALDERA_INTERIORS.find((d) => d.blockers.some((b) => b.id === id))!;
      expect(def.blockers.find((b) => b.id === id)!.startClosed, id).toBe(true);
    }
    expect(CALDERA_LINKS.some((l) => l.from.interior === 'cooling-hall' || l.to.interior === 'cooling-hall')).toBe(false);
  });

  it('places N7\'s forge-heart chest on the vat gallery floor, before the arena stairs, behind no gate', () => {
    const l = L('foundry-descent');
    const chest = l.anchors.find((a) => a.id === FOUNDRY_CHEST_ANCHOR)!;
    const z = chest.position.z - l.origin.z;
    expect(z).toBeGreaterThan(64);
    expect(z).toBeLessThan(106);
    expect(sunkenDepthAt(FOUNDRY_DESCENT_DEF, chest.position.x - l.origin.x, z)).toBe(6);
  });
});

describe('Caldera interiors: the camera wall rule and headroom', () => {
  // Every walkable nav cell centre and every anchor has at least 3.5 m of headroom, and the rooms and passages are wide enough.
  it('has no passage under 3 m and no room under 4 m except 3 m to 4 m passages', () => {
    for (const d of CALDERA_INTERIORS) {
      for (const r of d.rooms) {
        const w = Math.min(r.x1 - r.x0, r.z1 - r.z0);
        const passage = /^(pass|nave-door|hall-gate|exit-pass|lift|stairs|tunnel)/.test(r.id) || r.id === 'mouth';
        expect(w, `${d.id} ${r.id}`).toBeGreaterThanOrEqual(passage ? 3 : 4);
      }
    }
  });

  it('gives every anchor at least 3.5 m of headroom', () => {
    for (const d of CALDERA_INTERIORS) {
      const l = L(d.id);
      for (const a of d.anchors) {
        const room = d.rooms.find((r) => inR(r, a.x, a.z))!;
        expect(room.height + sunkenDepthAt(d, a.x, a.z), `${d.id} ${a.id}`).toBeGreaterThanOrEqual(3.5);
        expect(l.anchors.find((q) => q.id === a.id)).toBeDefined();
      }
    }
  });

  it('keeps solid props a 3 m lane from the walls (flush against a wall is fine)', () => {
    for (const d of CALDERA_INTERIORS) {
      const box = d.rooms.reduce((b, r) => ({ x0: Math.min(b.x0, r.x0), x1: Math.max(b.x1, r.x1), z0: Math.min(b.z0, r.z0), z1: Math.max(b.z1, r.z1) }), { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity });
      for (const p of d.props ?? []) {
        if (p.walkable) continue;
        const room = d.rooms.find((r) => inR(r, (p.rect.x0 + p.rect.x1) / 2, (p.rect.z0 + p.rect.z1) / 2))!;
        for (const gapTo of [p.rect.x0 - room.x0, room.x1 - p.rect.x1]) {
          expect(gapTo >= 3 || gapTo < 0.3, `${d.id} ${p.id} lane ${gapTo}`).toBe(true);
        }
        expect(box.x0).toBeLessThan(box.x1);
      }
    }
  });

  it('keeps the stairs within one step; the Hammer pit reports only its rim', () => {
    expect(stairSteps(FOUNDRY_DESCENT_DEF)).toEqual([]);
    expect(stairSteps(COOLING_HALL_DEF)).toEqual([]);
    expect(stairSteps(STOKERS_TUNNEL_DEF)).toEqual([]);
    const rim = stairSteps(HAMMER_HALL_DEF).filter((s) => !(s.x >= HAMMER_PIT.x0 - CELL && s.x <= HAMMER_PIT.x1 + CELL && s.z >= HAMMER_PIT.z0 - CELL && s.z <= HAMMER_PIT.z1 + CELL));
    expect(rim).toEqual([]);
  });
});

/** True when both points are walkable cells of one connected component. */
function connected(g: NavGrid, a: { x: number; z: number }, b: { x: number; z: number }): boolean {
  const ia = g.cellIndex(a.x, a.z);
  const ib = g.cellIndex(b.x, b.z);
  return ia >= 0 && ib >= 0 && g.isWalkable(ia) && g.isWalkable(ib) && g.component(ia) === g.component(ib);
}

describe('the tunnel\'s far end', () => {
  const grid = (closed: boolean) => {
    const g = new NavGrid(L('stokers-tunnel').nav);
    g.setBlocker(BLOCKERS.tunnelSeal, closed);
    return g;
  };
  const at = (x: number, z: number) => {
    const l = L('stokers-tunnel');
    return { x: l.origin.x + x, y: l.floorY, z: l.origin.z + z };
  };
  it('is sealed (the gallery unreachable) or open (reachable from the mouth)', () => {
    expect(connected(grid(true), at(0, 2), at(0, 66))).toBe(false);
    expect(connected(grid(false), at(0, 2), at(0, 66))).toBe(true);
  });
  it('keeps the charge sites on the near side of the seal', () => {
    for (const a of STOKERS_TUNNEL_DEF.anchors.filter((q) => q.id.includes('.charge.'))) expect(a.z).toBeLessThan(53);
  });
});

describe('the gates cut the nav (closed) and join it (open)', () => {
  const world = (id: string, x: number, z: number) => {
    const l = L(id);
    return { x: l.origin.x + x, z: l.origin.z + z };
  };
  const cases: [string, string, [number, number], [number, number]][] = [
    ['cooling-hall', BLOCKERS.coolingGate2, [0, 20], [0, 44]],
    ['cooling-hall', BLOCKERS.coolingGate3, [0, 44], [0, 68]],
    ['cooling-hall', BLOCKERS.coolingForge, [0, 68], [0, 94]],
    ['foundry-descent', BLOCKERS.foundryLift, [0, 20], [0, 85]],
    ['foundry-descent', BLOCKERS.foundryArenaExit, [0, 149], [0, 172]],
    ['hammer-hall', BLOCKERS.hammerHallGate, [0, 20], [0, 50]],
  ];
  it.each(cases)('%s: %s', (id, blocker, a, b) => {
    const g = new NavGrid(L(id).nav);
    for (const bl of CALDERA_INTERIORS.find((d) => d.id === id)!.blockers) if (bl.startClosed) g.setBlocker(bl.id, true);
    const pa = world(id, a[0], a[1]);
    const pb = world(id, b[0], b[1]);
    expect(connected(g, pa, pb)).toBe(false);
    g.setBlocker(blocker, false);
    expect(connected(g, pa, pb)).toBe(true);
  });
  it('leaves the arena gate open by default and the Foundry\'s arena reachable once the lift opens', () => {
    const g = new NavGrid(L('foundry-descent').nav);
    for (const bl of FOUNDRY_DESCENT_DEF.blockers) if (bl.startClosed) g.setBlocker(bl.id, true);
    g.setBlocker(BLOCKERS.foundryLift, false);
    const pa = world('foundry-descent', 0, 20);
    expect(connected(g, pa, world('foundry-descent', 0, 149))).toBe(true);
    g.setBlocker(BLOCKERS.foundryArenaGate, true);
    expect(connected(g, pa, world('foundry-descent', 0, 149))).toBe(false);
  });
});

describe('the Hammer Hall pit', () => {
  it('has a closed bridge deck as its base state and a stepped way out of the pit', () => {
    const deck = HAMMER_HALL_DEF.blockers.find((b) => b.id === BLOCKERS.hammerFloor)!;
    expect(deck.startClosed).toBe(true);
    expect(deck.base! + deck.height).toBe(0);
    expect(sunkenDepthAt(HAMMER_HALL_DEF, 0, 47.5)).toBeCloseTo(0.3);
    expect(sunkenDepthAt(HAMMER_HALL_DEF, 0, 60)).toBe(3);
    const g = new NavGrid(L('hammer-hall').nav);
    g.setBlocker(BLOCKERS.hammerFloor, false);
    const l = L('hammer-hall');
    expect(connected(g, { x: l.origin.x, z: l.origin.z + 60 }, { x: l.origin.x, z: l.origin.z + 40 })).toBe(true);
  });
  it('keeps Vey\'s arena rect inside its room', () => {
    expect(FOUNDRY_DESCENT_DEF.rooms.some((r) => r.id === 'arena' && r.x0 === FOUNDRY_ARENA.x0 && r.z1 === FOUNDRY_ARENA.z1)).toBe(true);
  });
});

describe('layout pins (a change moves sites other threads use: update deliberately)', () => {
  it('pins each layout', () => {
    const hashes = Object.fromEntries(CALDERA_INTERIORS.map((d) => {
      const l = layoutInterior(d, () => 0);
      return [d.id, fnv(JSON.stringify({ b: l.boxes, a: l.anchors, n: l.nav, bo: l.bounds, f: l.floorY }))];
    }));
    expect(hashes).toMatchInlineSnapshot(`
      {
        "cooling-hall": "3d6cff2e726ebe2e",
        "foundry-descent": "9ee0346884def972",
        "hammer-hall": "c63ee84523a8bdf1",
        "stokers-tunnel": "7786b169306eb351",
      }
    `);
  });
});
