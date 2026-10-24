import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildCarryRoutes, candleStops, CHECKPOINT_MAX, CHECKPOINT_MIN, CORRIDOR_HALF_WIDTH, densify, MAX_DROP } from './carryRoutes';
import { buildDragonspine } from './layout';
import { registerDragonspineKinds } from './structureKinds';
import { shiftedInputs, shiftedRoad, stubInputs } from './testing/fixture';

let release: () => void;
beforeAll(() => (release = registerDragonspineKinds()));
afterAll(() => release());

const inp = stubInputs();
const build = buildDragonspine(inp);
const routes = buildCarryRoutes(inp.heightAt, build);
const route = (id: string) => routes.find((r) => r.id === id)!;
const near = (cp: { x: number; z: number }, p: { x: number; z: number }) => Math.hypot(cp.x - p.x, cp.z - p.z);

describe('carry routes', () => {
  it('has the eight routes with the agreed corridor and drop', () => {
    expect(routes.map((r) => r.id)).toEqual(['sled.r15.1', 'sled.r15.2', 'sled.r15.3', 'egg.r18.1', 'egg.r18.2', 'egg.r18.3', 'candle.r17.down', 'candle.r17.up']);
    for (const r of routes) {
      expect(r.corridorHalfWidth).toBe(CORRIDOR_HALF_WIDTH);
      expect(r.corridorHalfWidth).toBe(30);
      expect(r.maxDrop).toBe(MAX_DROP);
      expect(r.maxDrop).toBe(10);
    }
  });

  it('spaces consecutive checkpoints 10 to 25 m apart', () => {
    for (const r of routes) {
      expect(r.checkpoints.length, r.id).toBeGreaterThan(3);
      for (let i = 1; i < r.checkpoints.length; i++) {
        const d = Math.hypot(r.checkpoints[i]!.x - r.checkpoints[i - 1]!.x, r.checkpoints[i]!.z - r.checkpoints[i - 1]!.z);
        expect(d, `${r.id} ${i}`).toBeGreaterThanOrEqual(CHECKPOINT_MIN);
        expect(d, `${r.id} ${i}`).toBeLessThanOrEqual(CHECKPOINT_MAX);
      }
    }
  });

  it('never drops more than 10 m between consecutive checkpoints on the ground, and takes every y from heightAt', () => {
    for (const r of routes) {
      for (let i = 0; i < r.checkpoints.length; i++) {
        const c = r.checkpoints[i]!;
        expect(c.y, `${r.id} ${i}`).toBe(inp.heightAt(c.x, c.z));
        if (i > 0) expect(r.checkpoints[i - 1]!.y - c.y, `${r.id} ${i}`).toBeLessThanOrEqual(MAX_DROP);
      }
    }
  });

  it('eggs reset to the pick-up (resetAt [0]) and start at their egg anchor and end at R18\'s nest', () => {
    for (let i = 1; i <= 3; i++) {
      const r = route(`egg.r18.${i}`);
      expect(r.resetAt).toEqual([0]);
      expect(near(r.checkpoints[0]!, build.hawk.eggs[i - 1]!)).toBeLessThan(0.01);
      expect(near(r.checkpoints[r.checkpoints.length - 1]!, build.hawk.nests[0]!)).toBeLessThan(0.01);
      // The climb is on the route: every point of K1's path has a checkpoint within the spacing limit (the hairpins' corners are cut at most that far).
      for (const p of build.hawk.climb) expect(r.checkpoints.some((c) => near(c, p) <= CHECKPOINT_MAX), `${r.id} climb`).toBe(true);
    }
  });

  it('puts a checkpoint on every R15 leg: at the sled start (depot) and at the hawk-line cache', () => {
    for (let i = 1; i <= 3; i++) {
      const r = route(`sled.r15.${i}`);
      expect(near(r.checkpoints[0]!, build.lodge.sledStarts[i - 1]!)).toBeLessThan(0.01);
      expect(near(r.checkpoints[r.checkpoints.length - 1]!, build.lodge.cache)).toBeLessThan(0.01);
      expect(r.resetAt).toBeUndefined();
      // Through the pass gate and up the road.
      expect(r.checkpoints.some((c) => near(c, build.lodge.gateN) <= 8)).toBe(true);
    }
  });

  it('follows the road for sleds: every checkpoint after the gate is within half the corridor of the centre line', () => {
    const r = route('sled.r15.2');
    const gate = r.checkpoints.findIndex((c) => near(c, build.lodge.gateN) <= 8);
    for (const c of r.checkpoints.slice(gate + 3)) expect(build.sites.road.nearest(c.x, c.z).d).toBeLessThan(CORRIDOR_HALF_WIDTH / 2);
  });

  it('splits the candle in two: down from the Anvil to 3, 2, 1, up from 1 to 4, 5, 6, each reset at its start and every stop', () => {
    const shrineOf = (c: { at: { x: number; z: number } }) => build.wayside.sites.findIndex((w) => w.x === c.at.x && w.z === c.at.z) + 1;
    for (const [leg, order] of [['down', [0, 3, 2, 1]], ['up', [1, 4, 5, 6]]] as const) {
      const r = route(`candle.r17.${leg}`);
      const stops = candleStops(build, leg);
      expect(stops.map(shrineOf)).toEqual(order);
      expect(r.resetAt).toHaveLength(stops.length);
      r.resetAt!.forEach((idx, k) => expect(near(r.checkpoints[idx]!, stops[k]!.at), `${leg} stop ${k}`).toBeLessThan(0.01));
      expect([...r.resetAt!].sort((a, b) => a - b)).toEqual([...r.resetAt!]);
    }
    expect(near(route('candle.r17.down').checkpoints[0]!, build.anvil.shrine)).toBeLessThan(0.01);
    expect(candleStops(build, 'up')[0]).toEqual(candleStops(build, 'down')[3]);
  });

  it('never doubles back: on every route no checkpoint is within 16 m (two pass radii) of one more than 2 indices away', () => {
    for (const r of routes) {
      for (let i = 0; i < r.checkpoints.length; i++) {
        for (let j = i + 3; j < r.checkpoints.length; j++) {
          expect(near(r.checkpoints[i]!, r.checkpoints[j]!), `${r.id} ${i} vs ${j}`).toBeGreaterThan(16);
        }
      }
    }
  });

  it('densify keeps the end exactly and never leaves a last gap under 10 m', () => {
    for (const len of [9, 10, 14.4, 14.6, 24, 29, 31, 100.3]) {
      const out = densify([{ x: 0, z: 0 }, { x: len, z: 0 }]);
      expect(out[out.length - 1]).toEqual({ x: len, z: 0 });
      for (let i = 1; i < out.length; i++) {
        const d = out[i]!.x - out[i - 1]!.x;
        if (len >= CHECKPOINT_MIN) {
          expect(d, `${len}`).toBeGreaterThanOrEqual(CHECKPOINT_MIN);
          expect(d, `${len}`).toBeLessThanOrEqual(CHECKPOINT_MAX);
        }
      }
    }
  });

  it('moves the checkpoints with the plateaus and the road (shifted-plateau test)', () => {
    const lodge = shiftedInputs(['wyrmwatch-lodge'], 20, 10);
    const moved = buildCarryRoutes(lodge.heightAt, buildDragonspine(lodge));
    expect(near(moved[0]!.checkpoints[0]!, route('sled.r15.1').checkpoints[0]!)).toBeGreaterThan(8);
    const foot = shiftedInputs(['hawk-cliffs-foot'], 12, 6);
    const movedEgg = buildCarryRoutes(foot.heightAt, buildDragonspine(foot)).find((r) => r.id === 'egg.r18.1')!;
    expect(near(movedEgg.checkpoints[0]!, route('egg.r18.1').checkpoints[0]!)).toBeGreaterThan(10);
    const road = shiftedRoad(25, -15);
    const movedRoad = buildCarryRoutes(road.heightAt, buildDragonspine(road)).find((r) => r.id === 'candle.r17.down')!;
    const was = route('candle.r17.down');
    expect(movedRoad.checkpoints.length).toBeGreaterThan(0);
    expect(near(movedRoad.checkpoints[10]!, was.checkpoints[10]!)).toBeGreaterThan(10);
    // y follows the ground it moved to.
    for (const c of movedRoad.checkpoints) expect(c.y).toBe(road.heightAt(c.x, c.z));
  });
});

describe('the pass gate follows the road (wherever the road starts)', () => {
  const withStart = (start: readonly [number, number]) => {
    const base = stubInputs();
    return { ...base, passPoints: [start, ...base.passPoints] as typeof base.passPoints };
  };
  const lodge = build.sites.lodge;
  const northWall = lodge.maxZ - 10;
  const variants: Array<[string, ReturnType<typeof stubInputs>]> = [
    ['stub road start', inp],
    ['road from the lodge centre', withStart([lodge.cx + 20, lodge.cz])],
    ['road from the north wall', withStart([lodge.cx - 15, northWall])],
  ];
  it.each(variants)('%s: no sled checkpoint is inside the yard after the gate, and no solid stands on the road', (_name, vin) => {
    const b = buildDragonspine(vin);
    const rs = buildCarryRoutes(vin.heightAt, b);
    const { edge, gateN } = b.lodge;
    // On the wall line when the road crosses it; the road's start when it already begins beyond it.
    const atGate = b.sites.road.point(b.lodge.passGateS);
    if (b.lodge.passGateS > 0) expect(Math.abs(atGate.z - edge.n)).toBeLessThan(0.5);
    else expect(atGate.z).toBeGreaterThanOrEqual(edge.n - 0.5);
    for (const r of rs.filter((x) => x.id.startsWith('sled.'))) {
      const gate = r.checkpoints.findIndex((c) => Math.hypot(c.x - gateN.x, c.z - gateN.z) <= 8);
      expect(gate, r.id).toBeGreaterThan(0);
      for (const c of r.checkpoints.slice(gate + 1)) expect(c.z, `${r.id} after the gate`).toBeGreaterThan(edge.n);
    }
    const solids = b.layout.structures.filter((s) => s.mode === 'solid');
    for (let s = 0; s <= b.lodge.passGateS; s += 2) {
      const p = b.sites.road.point(s);
      for (const sp of solids) {
        const inside = Math.abs(p.x - sp.x) <= sp.footprint[0] / 2 && Math.abs(p.z - sp.z) <= sp.footprint[1] / 2;
        expect(inside, `${sp.id} on the road at ${s}`).toBe(false);
      }
    }
  });
});
