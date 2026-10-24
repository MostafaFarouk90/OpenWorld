import { SUMMIT_BOX } from '../region/areas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { footprintCorners } from '../region/geometry';
import { LEDGE_MAX_HEIGHT, LEDGE_MIN_HEIGHT } from '../region/layoutTypes';
import { validateLayout } from '../region/validateLayout';
import { SHRINE_POSITIONS } from '../map/ForgeMarks';
import { roadLength, roadPoint } from '../terrain/shape/roadPoint';
import { buildDragonspine, type DragonspineBuild } from './layout';
import { ledgeRise } from './fit';
import { TAN_40, worstSlope } from './testing/walk';
import { LEDGE_HEIGHT } from './helpers';
import { PLATEAU_IDS } from './inputs';
import { DRAGONSPINE_NPCS } from './npcDefs';
import { roadFromPoints } from './road';
import { registerDragonspineKinds } from './structureKinds';
import { shiftedInputs, shiftedRoad, stubInputs } from './testing/fixture';
import { WAYSIDE_MAX_SLIDE, WAYSIDE_MAX_STEP, WAYSIDE_SPACING } from './wayside';

let release: () => void;
beforeAll(() => {
  release = registerDragonspineKinds();
});
afterAll(() => release());

const inp = stubInputs();
const b: DragonspineBuild = buildDragonspine(inp);
const anchor = (id: string) => {
  const a = b.layout.anchors.find((x) => x.id === id);
  if (!a) throw new Error(`no anchor ${id}`);
  return a;
};
const inBox = (box: { minX: number; maxX: number; minZ: number; maxZ: number }, x: number, z: number, pad = 0) => x >= box.minX - pad && x <= box.maxX + pad && z >= box.minZ - pad && z <= box.maxZ + pad;
const plateau = (id: string) => inp.plateaus.find((p) => p.id === id)!.box;

/** The ids the plan's final table makes binding (ranges expanded). */
const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
const TABLE: string[] = [
  'waystone.wyrmwatch-lodge', 'waystone.rime-pass', 'waystone.last-anvil',
  'dragonspine.anvil.shrine', ...range(6).map((n) => `dragonspine.anvil.carving.${n}`), 'dragonspine.anvil.mark.1', 'dragonspine.anvil.mark.2', 'dragonspine.anvil.cell', 'dragonspine.anvil.rest',
  ...range(6).map((n) => `dragonspine.wayside.${n}`),
  'dragonspine.lodge.gate.south', 'dragonspine.lodge.gate.pass', 'dragonspine.lodge.hall.door',
  'dragonspine.lodge.sled-shed', ...range(3).map((n) => `dragonspine.r15.sled-start.${n}`), 'dragonspine.r15.cache',
  'dragonspine.shelter.fire', 'dragonspine.shelter.woodpile', ...range(5).map((n) => `dragonspine.shelter.trophy.${n}`), 'dragonspine.shelter.m31-offer',
  'dragonspine.hawk.camp', ...range(4).map((n) => `dragonspine.hawk.camp.search.${n}`), ...range(3).map((n) => `dragonspine.hawk.egg.${n}`), 'dragonspine.hawk.companion-hold', 'dragonspine.hawk.climb.1',
  'dragonspine.hawk.nest.r18', 'dragonspine.hawk.nest.2', 'dragonspine.hawk.nest.3', ...range(4).map((n) => `dragonspine.hawk.circle.${n}`),
  'dragonspine.cave.trailhead', 'dragonspine.cave.path.1', 'dragonspine.cave.mouth', 'dragonspine.cave.leap',
  'dragonspine.m28.trailhead', 'dragonspine.m28.leap.1', 'dragonspine.m28.leap.2', ...range(4).map((n) => `dragonspine.m28.cairn.${n}`), 'dragonspine.m28.crag', 'dragonspine.m28.crag.view',
  'npc-post.thorgar.yard', 'npc-post.eadgyth.fire', 'npc-post.ansgar.anvil', ...range(6).map((n) => `npc-post.lodge-hunter-${n}`), ...range(2).map((n) => `npc-post.sled-hand-${n}`), 'npc-post.lodge-hunter-cave', 'npc-post.egg-thief', ...range(3).map((n) => `npc-post.pilgrim-${n}`),
  ...range(6).map((n) => `dragonspine.spawn.m28.hawk-${n}`), 'dragonspine.spawn.m28.ogre', 'dragonspine.spawn.m28.scout',
  'dragonspine.spawn.cave.ogre', ...range(4).map((n) => `dragonspine.spawn.cave.hawk-${n}`),
  ...range(3).map((n) => `dragonspine.spawn.anvil.hawk-${n}`), 'dragonspine.spawn.anvil.ogre',
  'dragonspine.spawn.shelter.hawk-1', 'dragonspine.spawn.shelter.hawk-2', ...range(3).map((n) => `dragonspine.spawn.r15.stoop-${n}`),
  'dragonspine.spawn.wayside.hawk-a', 'dragonspine.spawn.wayside.hawk-b', 'dragonspine.spawn.hawk-cliffs.parent-1', 'dragonspine.spawn.hawk-cliffs.parent-2',
];

describe('the layout on stand-in ground', () => {
  it('validates (flat structures, no overlaps, anchors on walkable ground)', () => {
    expect(validateLayout(b.layout, inp.heightAt, { spawnId: null })).toEqual([]);
  });

  it('has unique anchor, trigger, structure and npc ids', () => {
    for (const list of [b.layout.anchors, b.layout.triggers, b.layout.structures, b.layout.npcs]) {
      const ids = list.map((x) => x.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('prefixes every id: dragonspine., the contract waystone. and npc-post. names, trg.dragonspine.', () => {
    for (const a of b.layout.anchors) expect(/^(dragonspine\.|waystone\.|npc-post\.)/.test(a.id), a.id).toBe(true);
    for (const a of b.layout.anchors.filter((x) => x.id.startsWith('waystone.'))) expect(a.tags).toContain('waystone');
    for (const t of b.layout.triggers) expect(t.id.startsWith('trg.dragonspine.'), t.id).toBe(true);
    for (const s of b.layout.structures) expect(s.id.startsWith('dragonspine-'), s.id).toBe(true);
  });

  it('defines every id of the plan\'s final table, verbatim', () => {
    const have = new Set(b.layout.anchors.map((a) => a.id));
    expect(TABLE.filter((id) => !have.has(id))).toEqual([]);
  });

  it('never defines K1\'s ids: the camp hearth, dragonspine.wyrmwatch.*, dragonspine.pass.*, .track.*, .fog.*', () => {
    for (const a of b.layout.anchors) {
      expect(a.id).not.toBe('dragonspine.wyrmwatch.hearth');
      expect(/^dragonspine\.(wyrmwatch|pass|track|fog)\./.test(a.id), a.id).toBe(false);
    }
  });

  it('gives every NPC a post that is one of its anchors', () => {
    const have = new Set(b.layout.anchors.map((a) => a.id));
    for (const n of DRAGONSPINE_NPCS) expect(have.has(n.post), n.id).toBe(true);
    expect(DRAGONSPINE_NPCS).toHaveLength(3 + 6 + 2 + 1 + 1 + 3);
  });

  it('puts every place on its plateau', () => {
    const on = (prefix: string, id: string, pad = 0) => {
      for (const a of b.layout.anchors.filter((x) => x.id.startsWith(prefix))) expect(inBox(plateau(id), a.x, a.z, pad), a.id).toBe(true);
    };
    on('dragonspine.lodge.', 'wyrmwatch-lodge');
    on('dragonspine.r15.sled-start.', 'wyrmwatch-lodge');
    for (const k of ['fire', 'trophy', 'm31-offer']) on(`dragonspine.shelter.${k}`, 'rime-pass-shelter');
    on('dragonspine.hawk.camp', 'hawk-cliffs-foot');
    on('dragonspine.hawk.egg', 'hawk-cliffs-foot');
    for (const k of ['mouth', 'leap', 'leap.launch']) on(`dragonspine.cave.${k}`, 'collapsed-cave');
    on('dragonspine.m28.crag', 'm28-crag');
    on('dragonspine.anvil.shrine', 'last-anvil');
    on('dragonspine.anvil.cell', 'last-anvil');
    on('dragonspine.anvil.rest', 'last-anvil');
    on('waystone.last-anvil', 'last-anvil');
    on('waystone.rime-pass', 'rime-pass-shelter');
    on('waystone.wyrmwatch-lodge', 'wyrmwatch-lodge');
    expect(PLATEAU_IDS.every((id) => inp.plateaus.some((p) => p.id === id))).toBe(true);
  });

  it('keeps the lodge\'s buildings inside its walls, and the hall at the pad door', () => {
    const e = b.lodge.edge;
    for (const s of b.lodge.specs.filter((x) => !/wall|tower|gate|waystone/.test(x.id))) {
      for (const [x, z] of footprintCorners(s)) expect(inBox({ minX: e.w, maxX: e.e, minZ: e.s, maxZ: e.n }, x, z), s.id).toBe(true);
    }
    const door = anchor('dragonspine.lodge.hall.door');
    expect([door.x, door.z]).toEqual([b.sites.hallDoor.x, b.sites.hallDoor.z].map((n) => Math.round(n * 100) / 100));
    expect(b.lodge.hall.z - b.lodge.hall.d / 2).toBeGreaterThan(door.z);
  });

  it('builds the yard fire pit round K1\'s hearth and leaves the hearth free of solids', () => {
    const pit = b.layout.structures.find((s) => s.id === 'dragonspine-yard-fire-pit')!;
    expect([pit.x, pit.z]).toEqual([inp.hearth.x, inp.hearth.z]);
    for (const s of b.layout.structures.filter((x) => x.mode !== 'open')) {
      const reach = Math.hypot(...s.footprint) / 2;
      expect(Math.hypot(s.x - inp.hearth.x, s.z - inp.hearth.z), s.id).toBeGreaterThan(Math.min(reach, 3));
    }
  });

  it('keeps blocking structures off the pass road', () => {
    const road = roadFromPoints(inp.passPoints);
    for (const s of [...b.shelter.specs, ...b.anvil.specs, ...b.wayside.specs.map((w) => ({ ...w, mode: 'open' as const }))].filter((x) => x.mode !== 'open')) {
      for (const [x, z] of footprintCorners(s)) expect(road.nearest(x, z).d, s.id).toBeGreaterThanOrEqual(b.sites.roadHalf);
    }
  });

  it('puts the Last Anvil, the shrine and every R17 site south of the summit hole (z < SUMMIT_BOX.z0), every place south of z 16900', () => {
    for (const a of b.layout.anchors) expect(a.z, a.id).toBeLessThan(16900);
    for (const id of ['dragonspine.anvil.shrine', 'waystone.last-anvil', ...range(6).map((n) => `dragonspine.wayside.${n}`)]) expect(anchor(id).z, id).toBeLessThan(SUMMIT_BOX.z0);
    for (const a of b.layout.anchors.filter((x) => x.id.startsWith('dragonspine.anvil.') || x.id.startsWith('dragonspine.wayside.'))) expect(a.z, a.id).toBeLessThan(SUMMIT_BOX.z0);
    for (const s of b.layout.structures) expect(s.z, s.id).toBeLessThan(SUMMIT_BOX.z0);
  });

  it('keeps the shrine anchor and the Last Anvil waystone within 30 m of K0\'s SHRINE_POSITIONS', () => {
    const s = SHRINE_POSITIONS['last-anvil']!;
    for (const id of ['dragonspine.anvil.shrine', 'waystone.last-anvil']) expect(Math.hypot(anchor(id).x - s.x, anchor(id).z - s.z), id).toBeLessThanOrEqual(30);
  });

  it('builds no shrine, anvil or brazier (K9\'s)', () => {
    for (const s of b.layout.structures) expect(/shrine(?!-pad)|anvil(?!-)|brazier/.test(s.kind) && s.kind !== 'waystone', s.id).toBe(false);
    expect(b.layout.structures.some((s) => s.kind === 'altar')).toBe(false);
  });
});

describe('the wayside sites', () => {
  const road = roadFromPoints(inp.passPoints);
  it('are six platforms in road order, about 200 m of road apart, three each side of the Anvil', () => {
    const s = b.wayside.sites.map((w) => w.s);
    expect(s).toHaveLength(6);
    expect([...s].sort((x, y) => x - y)).toEqual(s);
    expect(s.slice(0, 3).every((v) => v < b.anvil.roadS)).toBe(true);
    expect(s.slice(3).every((v) => v > b.anvil.roadS)).toBe(true);
    expect(s[0]).toBeGreaterThan(b.shelter.roadS);
    for (let i = 1; i < 6; i++) expect(Math.abs(s[i]! - s[i - 1]! - (i === 3 ? 2 * WAYSIDE_SPACING : WAYSIDE_SPACING)), `gap ${i}`).toBeLessThanOrEqual(2 * WAYSIDE_MAX_SLIDE);
  });
  it('stand beside the road, top level with its edge (a step of at most WAYSIDE_MAX_STEP), anchor on the platform', () => {
    for (const w of b.wayside.sites) {
      const spec = b.wayside.specs[w.index - 1]!;
      const d = road.nearest(spec.x, spec.z).d;
      expect(d).toBeGreaterThan(b.sites.roadHalf);
      expect(d).toBeLessThan(b.sites.roadHalf + 12);
      const edge = road.point(w.s, w.side * b.sites.roadHalf);
      const top = inp.heightAt(spec.x, spec.z) + w.dy;
      expect(top - inp.heightAt(edge.x, edge.z), `wayside ${w.index}`).toBeLessThanOrEqual(WAYSIDE_MAX_STEP);
      expect(anchor(`dragonspine.wayside.${w.index}`).onStructure).toBe(spec.id);
    }
  });
});

describe('Leap ledges', () => {
  const ledges = b.layout.structures.filter((s) => s.role === 'ledge');
  it('are the cave\'s and M28\'s two, 1.7 to 1.9 m high, with a launch anchor giving a 1.5 to 1.8 m rise', () => {
    expect(ledges.map((s) => s.id).sort()).toEqual(['dragonspine-cave-ledge', 'dragonspine-m28-ledge-1', 'dragonspine-m28-ledge-2']);
    const launches: Record<string, string> = {
      'dragonspine-cave-ledge': 'dragonspine.cave.leap.launch',
      'dragonspine-m28-ledge-1': 'dragonspine.m28.leap.1.launch',
      'dragonspine-m28-ledge-2': 'dragonspine.m28.leap.2.launch',
    };
    for (const s of ledges) {
      expect(s.height).toBeGreaterThanOrEqual(LEDGE_MIN_HEIGHT);
      expect(s.height).toBeLessThanOrEqual(LEDGE_MAX_HEIGHT);
      const l = anchor(launches[s.id]!);
      const rise = ledgeRise(inp.heightAt, s.x, s.z, { x: l.x, z: l.z }, [s.footprint[0], s.footprint[1]]);
      expect(rise, s.id).toBeGreaterThanOrEqual(1.5);
      expect(rise, s.id).toBeLessThanOrEqual(LEDGE_HEIGHT + 0.001);
    }
  });
});

describe('the climbs', () => {
  const walk = (pts: ReadonlyArray<{ x: number; z: number }>) => worstSlope(inp.heightAt, pts);
  it('the Hawk Cliffs climb is K1\'s hawk-cliffs-path (the same line as roadPoint), within the slope limit, ending at the nest shelf', () => {
    expect(walk(b.hawk.climb)).toBeLessThanOrEqual(TAN_40);
    expect(b.hawk.climbLength).toBeCloseTo(roadLength('hawk-cliffs-path'), 3);
    for (const f of [0, 0.3, 0.7, 1]) {
      const p = roadPoint('hawk-cliffs-path', b.hawk.climbLength * f, 0);
      const q = b.sites.hawkPath.point(b.hawk.climbLength * f);
      expect([q.x, q.z]).toEqual([p.x, p.z]);
    }
    const end = b.hawk.climb[b.hawk.climb.length - 1]!;
    expect(Math.hypot(end.x - b.hawk.shelf.x, end.z - b.hawk.shelf.z)).toBeLessThan(20);
    for (const n of b.hawk.nests) expect(inBox({ minX: b.hawk.shelf.x - 20, maxX: b.hawk.shelf.x + 20, minZ: b.hawk.shelf.z - 20, maxZ: b.hawk.shelf.z + 20 }, n.x, n.z)).toBe(true);
  });
  it('the cave approach has no slope over the limit, is about 200 m and ends at the mouth', () => {
    expect(walk(b.cave.approach)).toBeLessThanOrEqual(TAN_40);
    expect(b.cave.approachLength).toBeGreaterThan(180);
    expect(b.cave.approachLength).toBeLessThan(220);
    expect(b.cave.approach[b.cave.approach.length - 1]).toEqual(b.cave.door);
    expect(anchor('dragonspine.cave.trailhead').x).toBeCloseTo(b.cave.trailhead.x, 1);
  });
  it('M28\'s climb has no slope over the limit and ends at the crag', () => {
    expect(walk(b.m28.climb)).toBeLessThanOrEqual(TAN_40);
    const end = b.m28.climb[b.m28.climb.length - 1]!;
    expect(inBox(plateau('m28-crag'), end.x, end.z)).toBe(true);
  });
  it('no solid structure blocks either climb path', () => {
    const solids = b.layout.structures.filter((s) => s.mode === 'solid' && s.role !== 'ledge');
    for (const path of [b.hawk.climb, b.m28.climb, b.cave.approach.slice(0, -2)]) {
      for (let i = 1; i < path.length; i++) {
        for (let t = 0; t <= 1; t += 0.1) {
          const x = path[i - 1]!.x + (path[i]!.x - path[i - 1]!.x) * t;
          const z = path[i - 1]!.z + (path[i]!.z - path[i - 1]!.z) * t;
          for (const s of solids) expect(inBox({ minX: s.x - s.footprint[0] / 2, maxX: s.x + s.footprint[0] / 2, minZ: s.z - s.footprint[1] / 2, maxZ: s.z + s.footprint[1] / 2 }, x, z), s.id).toBe(false);
        }
      }
    }
  });
});

describe('derivation (nothing is a copied coordinate)', () => {
  it('reads the same road as roadPoint(\'rime-pass\')', () => {
    const road = roadFromPoints(inp.passPoints);
    expect(road.length).toBeCloseTo(roadLength('rime-pass'), 6);
    for (const s of [0, 100, 777, 2000, road.length]) {
      const p = roadPoint('rime-pass', s, 3);
      const q = road.point(s, 3);
      expect([q.x, q.z]).toEqual([p.x, p.z]);
    }
  });

  it('moves the lodge\'s places, y and all, with its plateau', () => {
    const moved = shiftedInputs(['wyrmwatch-lodge'], 24, 14);
    const m = buildDragonspine(moved);
    for (const id of ['waystone.wyrmwatch-lodge', 'dragonspine.lodge.hall.door', 'dragonspine.lodge.gate.south', 'npc-post.thorgar.yard']) {
      const was = anchor(id);
      const now = m.layout.anchors.find((a) => a.id === id)!;
      expect(now.x - was.x, id).toBeCloseTo(24, 1);
      expect(now.z - was.z, id).toBeCloseTo(14, 1);
    }
    expect(validateLayout(m.layout, moved.heightAt, { spawnId: null })).toEqual([]);
  });

  it('moves the shelter, the Anvil site, the cliff camp, the cave mouth and the crag with their plateaus', () => {
    for (const [plateauId, ids] of [
      ['rime-pass-shelter', ['dragonspine.shelter.fire', 'waystone.rime-pass']],
      ['last-anvil', ['dragonspine.anvil.cell', 'dragonspine.anvil.rest']],
      ['hawk-cliffs-foot', ['dragonspine.hawk.camp', 'dragonspine.hawk.egg.1']],
      ['m28-crag', ['dragonspine.m28.crag']],
    ] as const) {
      const m = buildDragonspine(shiftedInputs([plateauId], 10, 8));
      for (const id of ids) {
        const now = m.layout.anchors.find((a) => a.id === id)!;
        const was = anchor(id);
        expect(Math.hypot(now.x - was.x, now.z - was.z), `${plateauId} ${id}`).toBeGreaterThan(2);
      }
    }
    const cave = buildDragonspine(shiftedInputs(['collapsed-cave'], 6, 4));
    expect(cave.layout.anchors.find((a) => a.id === 'dragonspine.cave.leap')!.x).toBeCloseTo(anchor('dragonspine.cave.leap').x + 6, 0);
  });

  it('moves the trailhead, the cache, the wayside pads and the ledges with the road', () => {
    const moved = shiftedRoad(30, -20);
    const m = buildDragonspine(moved);
    for (const id of ['dragonspine.m28.trailhead', 'dragonspine.r15.cache', 'dragonspine.wayside.2', 'dragonspine.wayside.5']) {
      const now = m.layout.anchors.find((a) => a.id === id)!;
      const was = anchor(id);
      expect(Math.hypot(now.x - was.x, now.z - was.z), id).toBeGreaterThan(5);
    }
    expect(m.layout.structures.find((s) => s.id === 'dragonspine-m28-ledge-1')).not.toEqual(b.layout.structures.find((s) => s.id === 'dragonspine-m28-ledge-1'));
  });

  it('rejects a plateau move that puts a place off its plateau', () => {
    const moved = shiftedInputs(['wyrmwatch-lodge'], 60, 0);
    // Only the plateau moves; the hall pad (a separate export) stays behind, so the hall's door is off the lodge.
    const broken = { ...moved, pads: stubInputs().pads, hearth: stubInputs().hearth };
    const errors = (() => {
      try {
        const m = buildDragonspine(broken);
        return validateLayout(m.layout, broken.heightAt, { spawnId: null });
      } catch (e) {
        return [(e as Error).message];
      }
    })();
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('the Last Anvil carving stones', () => {
  it('stand inside the plateau, off the road, outside the shrine clearing, on a loop of about 400 m', () => {
    const A = plateau('last-anvil');
    for (const [i, p] of b.anvil.stones.entries()) {
      expect(inBox(A, p.x, p.z, -3), `stone ${i + 1} inside`).toBe(true);
      expect(b.sites.road.nearest(p.x, p.z).d, `stone ${i + 1} road`).toBeGreaterThanOrEqual(b.sites.roadClear);
      expect(Math.hypot(p.x - b.anvil.shrine.x, p.z - b.anvil.shrine.z), `stone ${i + 1} shrine`).toBeGreaterThan(12);
    }
    expect(Math.abs(b.anvil.loopLength - 400)).toBeLessThanOrEqual(60);
  });
});
