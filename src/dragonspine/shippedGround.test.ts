// The checks that matter on K1's real ground, run on the shipped heightAt (`ACT3_PLATEAUS` in the world shape): climbs and the cave approach stay under the slope limit, the nest shelf is a real climb, every Leap ledge is reachable
// from its launch point at its built size, and the wayside platforms sit level with the road edge. They fail loudly when K1's
// numbers break a place.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { heightAt } from '../terrain/heightfield';
import { LEDGE_MAX_HEIGHT } from '../region/layoutTypes';
import { ledgeRise } from './fit';
import { WAYSIDE_MAX_SLIDE, WAYSIDE_MAX_STEP, WAYSIDE_MIN_GAP, WAYSIDE_SPACING } from './wayside';
import { CRAG_VIEW_ABOVE, CRAG_VIEW_MAX, sightClear } from './m28';
import { buildDragonspine } from './layout';
import { registerDragonspineKinds } from './structureKinds';
import { defaultInputs } from './inputs';
import { TAN_40, worstSlope } from './testing/walk';
import { routeOver } from './route';
import { PARAPET_GAP, PARAPET_HEIGHT } from './hawkCliffs';
import { WALL_T } from './lodge';
import { footprintCorners, pointInFootprint } from '../region/geometry';
import { roadFromPoints } from './road';

let release: () => void;
beforeAll(() => (release = registerDragonspineKinds()));
afterAll(() => release());

const inp = defaultInputs(heightAt);
const b = buildDragonspine(inp);
const anchor = (id: string) => b.layout.anchors.find((a) => a.id === id)!;

describe('the places on the shipped ground', () => {
  it('has a walkable route from the road to the cave trailhead and to the Hawk Cliffs path start', () => {
    for (const [name, to] of [['cave trailhead', b.cave.trailhead], ['Hawk Cliffs path start', b.hawk.climbStart]] as const) {
      const n = b.sites.road.nearest(to.x, to.z);
      const spine = roadFromPoints(inp.spinePoints);
      const sn = spine.nearest(to.x, to.z);
      // From the Rime Pass or from the Spine Road, whichever the rider takes.
      const routes = [b.sites.road.point(n.s), spine.point(sn.s)].map((p) => routeOver(heightAt, { x: p.x, z: p.z }, to));
      expect(routes.some((r) => r !== null), name).toBe(true);
    }
  });


  it('has the Hawk Cliffs path, M28\'s climb and the cave approach under the controller\'s slope limit', () => {
    expect(worstSlope(heightAt, b.hawk.climb)).toBeLessThanOrEqual(TAN_40);
    expect(worstSlope(heightAt, b.m28.climb)).toBeLessThanOrEqual(TAN_40);
    expect(worstSlope(heightAt, b.cave.approach)).toBeLessThanOrEqual(TAN_40);
    expect(b.m28.walkable).toBe(true);
  });

  it('rises to K1\'s nest shelf, which is level under the nests', () => {
    expect(heightAt(b.hawk.shelf.x, b.hawk.shelf.z) - heightAt(b.hawk.climbStart.x, b.hawk.climbStart.z)).toBeGreaterThan(30);
    for (const n of b.hawk.nests) expect(Math.abs(heightAt(n.x, n.z) - heightAt(b.hawk.shelf.x, b.hawk.shelf.z))).toBeLessThan(0.6);
  });

  it('gives every Leap ledge a 1.5 to 1.8 m rise over its launch point, at its built footprint', () => {
    const launches: Record<string, string> = {
      'dragonspine-cave-ledge': 'dragonspine.cave.leap.launch',
      'dragonspine-m28-ledge-1': 'dragonspine.m28.leap.1.launch',
      'dragonspine-m28-ledge-2': 'dragonspine.m28.leap.2.launch',
      'dragonspine-roost-ledge-1': 'dragonspine.roost.leap.1.launch',
      'dragonspine-roost-ledge-2': 'dragonspine.roost.leap.2.launch',
      'dragonspine-roost-ledge-3': 'dragonspine.roost.leap.3.launch',
    };
    expect(b.layout.structures.filter((x) => x.role === 'ledge')).toHaveLength(6);
    for (const s of b.layout.structures.filter((x) => x.role === 'ledge')) {
      const l = anchor(launches[s.id]!);
      const rise = ledgeRise(heightAt, s.x, s.z, { x: l.x, z: l.z }, [s.footprint[0], s.footprint[1]]);
      expect(rise, s.id).toBeGreaterThanOrEqual(1.5);
      expect(rise, s.id).toBeLessThanOrEqual(LEDGE_MAX_HEIGHT);
    }
  });

  it('keeps each wayside platform within WAYSIDE_MAX_STEP of the road edge', () => {
    for (const w of b.wayside.sites) {
      const spec = b.wayside.specs[w.index - 1]!;
      const edge = b.sites.road.point(w.s, w.side * b.sites.roadHalf);
      expect(heightAt(spec.x, spec.z) + w.dy - heightAt(edge.x, edge.z), `wayside ${w.index}`).toBeLessThanOrEqual(WAYSIDE_MAX_STEP);
    }
  });

  it('spaces the wayside pads in road order, at least WAYSIDE_MIN_GAP apart, three each side of the Anvil', () => {
    const at = b.wayside.sites.map((w) => w.s);
    expect(at).toHaveLength(6);
    for (let i = 1; i < 6; i++) {
      expect(at[i]! - at[i - 1]!, `gap ${i}`).toBeGreaterThanOrEqual(WAYSIDE_MIN_GAP);
      expect(Math.abs(at[i]! - at[i - 1]! - (i === 3 ? 2 * WAYSIDE_SPACING : WAYSIDE_SPACING)), `gap ${i}`).toBeLessThanOrEqual(2 * WAYSIDE_MAX_SLIDE);
    }
    expect(at.slice(0, 3).every((v) => v < b.anvil.roadS)).toBe(true);
    expect(at.slice(3).every((v) => v > b.anvil.roadS)).toBe(true);
    expect(at[0]).toBeGreaterThan(b.shelter.roadS);
  });

  it('gives dragonspine.m28.crag.view a clear sightline to the lodge yard, between 32 and 80 m over the crag', () => {
    const v = anchor('dragonspine.m28.crag.view');
    expect(v.dy).toBeGreaterThanOrEqual(CRAG_VIEW_ABOVE);
    expect(v.dy).toBeLessThanOrEqual(CRAG_VIEW_MAX);
    const hearth = inp.hearth;
    expect(sightClear(heightAt, { x: v.x, z: v.z }, heightAt(v.x, v.z) + v.dy!, hearth, heightAt(hearth.x, hearth.z) + 5)).toBe(true);
    // And it is the lowest such point on the 2 m ladder: two metres lower is blocked or below the floor.
    if (v.dy! > CRAG_VIEW_ABOVE) expect(sightClear(heightAt, { x: v.x, z: v.z }, heightAt(v.x, v.z) + v.dy! - 2, hearth, heightAt(hearth.x, hearth.z) + 5)).toBe(false);
  });
});

describe('the Hawk Cliffs parapet', () => {
  const stones = b.layout.structures.filter((x) => x.id.startsWith('dragonspine-hawk-parapet-'));
  const hw = inp.hawkPathHalfWidth;

  it('is a line of low solid rocks on the downhill edge of the three legs, out of the path\'s half-width', () => {
    expect(hw).toBe(3);
    expect(stones.length).toBeGreaterThan(60);
    for (const x of stones) {
      expect(x.mode, x.id).toBe('solid');
      expect(x.kind, x.id).toBe('rock');
      expect(x.height, x.id).toBeCloseTo(PARAPET_HEIGHT, 5);
      for (const [cx, cz] of footprintCorners(x)) expect(b.sites.hawkPath.nearest(cx, cz).d, x.id).toBeGreaterThanOrEqual(hw + PARAPET_GAP - 0.1);
    }
  });

  it('stands on the lower side of its leg, and keeps the path walkable', () => {
    for (const x of stones) {
      const n = b.sites.hawkPath.nearest(x.x, x.z);
      const p = b.sites.hawkPath.point(n.s);
      const sx = Math.sign((x.x - p.x) * -p.dirZ + (x.z - p.z) * p.dirX);
      const out = heightAt(x.x, x.z);
      const inn = heightAt(p.x, p.z);
      expect(out, `${x.id} (side ${sx})`).toBeLessThan(inn + 1);
    }
    expect(worstSlope(heightAt, b.hawk.climb)).toBeLessThanOrEqual(TAN_40);
  });
});

describe('the Hawk Cliffs parapet and the walked line', () => {
  const stones = b.layout.structures.filter((x) => x.id.startsWith('dragonspine-hawk-parapet-'));
  const hw = inp.hawkPathHalfWidth;
  const climbAnchors = b.layout.anchors
    .filter((x) => /^dragonspine\.hawk\.climb\.\d+$/.test(x.id))
    .sort((p, q) => Number(p.id.split('.').pop()) - Number(q.id.split('.').pop()));
  const end = inp.hawkPathPoints[inp.hawkPathPoints.length - 1]!;
  // A walker on R18 goes from climb anchor to climb anchor: at a hairpin that line cuts the inside of the turn.
  const walked = roadFromPoints([[b.hawk.climbStart.x, b.hawk.climbStart.z], ...climbAnchors.map((x) => [x.x, x.z] as const), end]);

  // The stone's own half size toward a line: the half extent of its footprint along the direction from the line's nearest point.
  const halfToward = (x: (typeof stones)[number], ux: number, uz: number): number => {
    const yaw = (x.yawDeg * Math.PI) / 180;
    const ax = { x: Math.cos(yaw), z: -Math.sin(yaw) };
    const bx = { x: Math.sin(yaw), z: Math.cos(yaw) };
    return (Math.abs(ux * ax.x + uz * ax.z) * x.footprint[0]) / 2 + (Math.abs(ux * bx.x + uz * bx.z) * x.footprint[1]) / 2;
  };

  it('keeps every stone clear of K1\'s centreline and of the anchor-to-anchor line by halfWidth plus its own half size', () => {
    expect(climbAnchors.length).toBeGreaterThan(10);
    for (const x of stones) {
      for (const [name, line] of [['centreline', b.sites.hawkPath], ['climb anchors\' line', walked]] as const) {
        const n = line.nearest(x.x, x.z);
        const p = line.point(n.s);
        const half = halfToward(x, (x.x - p.x) / n.d, (x.z - p.z) / n.d);
        expect(n.d, `${x.id} from the ${name}`).toBeGreaterThanOrEqual(hw + half);
        // And no corner of it is inside the walkable width of any stretch of that line.
        for (const [cx, cz] of footprintCorners(x)) expect(line.nearest(cx, cz).d, `${x.id} corner, ${name}`).toBeGreaterThanOrEqual(hw);
      }
    }
  });

  it('leaves the stretch between climb.10 and climb.11 (the hairpin where R18\'s walker stalled) free of stones', () => {
    const c10 = climbAnchors[9]!;
    const c11 = climbAnchors[10]!;
    const seg = roadFromPoints([[c10.x, c10.z], [c11.x, c11.z]]);
    for (const x of stones) for (const [cx, cz] of footprintCorners(x)) expect(seg.nearest(cx, cz).d, x.id).toBeGreaterThan(hw);
  });
});

describe('the lodge hunters\' posts on the shipped ground', () => {
  const ids = [1, 2, 3, 4, 5, 6].flatMap((n) => [`npc-post.lodge-hunter-${n}`, `npc-post.lodge-hunter-${n}.out`]);
  const solids = b.layout.structures.filter((x) => x.mode === 'solid');
  const e = b.lodge.edge;

  it('stands every lodge hunter post, home and .out, on the ground inside the walls, clear of every solid (no tower tops)', () => {
    for (const id of ids) {
      const p = anchor(id);
      expect(p, id).toBeTruthy();
      expect(p.onStructure, id).toBeUndefined();
      expect(p.dy ?? 0, id).toBeLessThanOrEqual(0.5);
      expect(p.tags ?? [], id).not.toContain('elevated');
      // Inside the curtain walls, where the gates let a walker in.
      expect(p.x, id).toBeGreaterThan(e.w + WALL_T / 2);
      expect(p.x, id).toBeLessThan(e.e - WALL_T / 2);
      expect(p.z, id).toBeGreaterThan(e.s + WALL_T / 2);
      expect(p.z, id).toBeLessThan(e.n - WALL_T / 2);
      for (const sp of solids) expect(pointInFootprint(sp, p.x, p.z, 0.5), `${id} in ${sp.id}`).toBe(false);
    }
  });

  it('can walk from the yard to every lodge hunter post over the ground', () => {
    const yard = anchor('dragonspine.lodge.yard');
    for (const id of ids) {
      const p = anchor(id);
      expect(routeOver(heightAt, { x: yard.x, z: yard.z }, { x: p.x, z: p.z }), id).not.toBeNull();
    }
  });
});
