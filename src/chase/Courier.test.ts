import { describe, expect, it } from 'vitest';
import { Courier } from './Courier';
import { Polyline, routeFromAnchors, validateRoute, type RouteNode } from './route';
import { CHASE } from './tuning';

const DT = 1 / 60;
const straight = (kinds: RouteNode['kind'][] = ['run', 'run', 'run']): RouteNode[] =>
  kinds.map((kind, i) => ({ id: `chase.t.${i}`, position: { x: i * 100, y: 0, z: 0 }, kind }));

describe('Courier', () => {
  it('starts at his head start and runs at the run speed at a middle gap', () => {
    const c = new Courier(straight());
    expect(c.progress).toBe(CHASE.courierHeadStart);
    for (let i = 0; i < 60; i++) c.step(DT, 15);
    expect(c.progress).toBeCloseTo(CHASE.courierHeadStart + CHASE.courierRun, 3);
  });

  it('slows to the floor beyond the slow gap, bursts close for at most the burst budget', () => {
    const far = new Courier(straight());
    for (let i = 0; i < 60; i++) far.step(DT, 30);
    expect(far.progress - CHASE.courierHeadStart).toBeCloseTo(CHASE.courierFloor, 3);
    const near = new Courier(straight());
    for (let i = 0; i < 240; i++) near.step(DT, 3);
    const expected = CHASE.courierBurst * CHASE.burstSeconds + CHASE.courierRun * (4 - CHASE.burstSeconds);
    expect(near.progress - CHASE.courierHeadStart).toBeCloseTo(expected, 0);
  });

  it('pauses on a vault node and waits cornered at the end', () => {
    const c = new Courier(straight(['run', 'vault', 'run']));
    let paused = 0;
    for (let i = 0; i < 60 * 40; i++) {
      c.step(DT, 15);
      if (c.pausing) paused += DT;
    }
    expect(paused).toBeGreaterThan(CHASE.courierVaultSeconds - 0.05);
    expect(c.cornered).toBe(true);
    expect(c.position.x).toBe(200);
  });

  it('takes the detour on a gap that has one', () => {
    const nodes = straight(['run', 'gap', 'run']);
    nodes[1].detour = { x: 150, y: 0, z: 30 };
    const c = new Courier(nodes);
    expect(c.line.length).toBeGreaterThan(200);
  });

  it('edge: NaN gap counts as far; a zero dt does nothing', () => {
    const c = new Courier(straight());
    c.step(0, 10);
    expect(c.progress).toBe(CHASE.courierHeadStart);
    c.step(1, NaN);
    expect(c.progress).toBeCloseTo(CHASE.courierHeadStart + CHASE.courierFloor);
  });
});

describe('route', () => {
  it('reads nodes and kinds from anchors until the first missing index, with detours', () => {
    const anchors = new Map([
      ['chase.m10.0', { id: 'chase.m10.0', position: { x: 0, y: 0, z: 0 }, yaw: 0, tags: ['chase-run'] }],
      ['chase.m10.1', { id: 'chase.m10.1', position: { x: 10, y: 0, z: 0 }, yaw: 0, tags: ['roof', 'chase-gap'] }],
      ['chase.m10.1.detour', { id: 'chase.m10.1.detour', position: { x: 12, y: 0, z: 5 }, yaw: 0 }],
      ['chase.m10.2', { id: 'chase.m10.2', position: { x: 16, y: 0, z: 0 }, yaw: 0 }],
      ['chase.m10.4', { id: 'chase.m10.4', position: { x: 99, y: 0, z: 0 }, yaw: 0 }],
    ]);
    const nodes = routeFromAnchors((id) => anchors.get(id), 'chase.m10');
    expect(nodes.map((n) => n.kind)).toEqual(['run', 'gap', 'run']);
    expect(nodes[1].detour).toEqual({ x: 12, y: 0, z: 5 });
    expect(validateRoute(nodes)).toEqual([]);
  });

  it('validateRoute flags short routes, zero segments and a trailing gap', () => {
    expect(validateRoute([])).toHaveLength(1);
    const bad = straight(['run', 'run', 'gap']);
    bad[1].position = { ...bad[0].position };
    expect(validateRoute(bad).map((p) => p.problem)).toEqual(['zero-length segment', 'the last node cannot be a gap']);
  });

  it('Polyline samples without allocating and clamps both ends', () => {
    const l = new Polyline([{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, { x: 10, y: 0, z: 10 }]);
    const out = { x: 0, y: 0, z: 0 };
    expect(l.sampleAt(15, out)).toBe(out);
    expect(out).toEqual({ x: 10, y: 0, z: 5 });
    expect(l.sampleAt(-1, out)).toEqual({ x: 0, y: 0, z: 0 });
    expect(l.sampleAt(99, out)).toEqual({ x: 10, y: 0, z: 10 });
    expect(l.segmentAt(10)).toBe(1);
  });
});
