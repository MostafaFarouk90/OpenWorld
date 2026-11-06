import { describe, expect, it } from 'vitest';
import { ESCORT_RUN, EscortRun, type EscortRunEvent, type EscortRunPlan } from './EscortRun';

const DT = 1 / 60;
// a straight 100 m route toward -Z (yaw 0), junctions at 30 and 60, shelters at 20 and 50
const plan = (over: Partial<EscortRunPlan> = {}): EscortRunPlan => ({
  points: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -100 }],
  pace: 2,
  memberCount: 3,
  junctions: [{ id: 'j1', s: 30 }, { id: 'j2', s: 60 }],
  shelters: [{ id: 'sh1', s: 20 }, { id: 'sh2', s: 50 }],
  ...over,
});

/** Runs until `stop` says so or `max` seconds pass, the player walking with the lead (2 m behind it) unless `player` is given. */
function run(r: EscortRun, seconds: number, over: { down?: boolean; storm?: boolean; player?: { x: number; y: number; z: number } } = {}) {
  const events: EscortRunEvent[] = [];
  for (let t = 0; t < seconds; t += DT) {
    const lead = r.pose(0);
    const player = over.player ?? { x: lead.x, y: 0, z: lead.z + 2 };
    events.push(...r.step({ dt: DT, player, down: over.down ?? false, storm: over.storm ?? false }));
  }
  return events;
}

describe('EscortRun walking', () => {
  it('walks at its pace with the column 1.6 m apart behind the lead, facing along the route', () => {
    const r = new EscortRun(plan());
    run(r, 5);
    expect(r.s).toBeCloseTo(10, 1);
    const [a, b, c] = r.poses();
    expect(a.z).toBeCloseTo(-10, 1);
    expect(b.z - a.z).toBeCloseTo(ESCORT_RUN.spacing, 5);
    expect(c.z - b.z).toBeCloseTo(ESCORT_RUN.spacing, 5);
    expect(a.yaw).toBeCloseTo(0, 5); // yaw 0 faces -Z
  });

  it('members behind the start wait at the start', () => {
    const r = new EscortRun(plan());
    const p = r.pose(2);
    expect(p.z).toBe(0);
  });

  it('arrives at the end once, then does nothing', () => {
    const r = new EscortRun(plan({ junctions: [] }));
    const ev = run(r, 60);
    expect(ev.filter((e) => e.type === 'arrived')).toHaveLength(1);
    expect(r.arrived).toBe(true);
    expect(r.s).toBe(100);
    expect(run(r, 2)).toEqual([]);
  });

  it('rejects a bad plan', () => {
    expect(() => new EscortRun(plan({ pace: 0 }))).toThrow(/pace/);
    expect(() => new EscortRun(plan({ points: [{ x: 0, y: 0, z: 0 }] }))).toThrow(/two points/);
    expect(() => new EscortRun(plan({ memberCount: 0 }))).toThrow(/member/);
    expect(() => new EscortRun(plan({ junctions: [{ id: 'b', s: 50 }, { id: 'a', s: 10 }] }))).toThrow(/route order/);
  });
});

describe('EscortRun junctions', () => {
  it('stops at each junction until go(), with a junction event and a halted event', () => {
    const r = new EscortRun(plan());
    const ev = run(r, 20);
    expect(r.s).toBe(30);
    expect(ev).toContainEqual({ type: 'junction', junction: 'j1', index: 0 });
    expect(ev).toContainEqual({ type: 'halted', reason: 'junction' });
    expect(r.junctionId).toBe('j1');
    expect(r.go()).toEqual([{ type: 'resumed' }]);
    run(r, 20);
    expect(r.s).toBe(60);
    expect(r.junctionId).toBe('j2');
  });

  it('with Cael absent it waits at the junction for good (no time-out); player-far joins the halt', () => {
    const r = new EscortRun(plan());
    run(r, 20);
    const ev = run(r, 600, { player: { x: 0, y: 0, z: 200 } });
    expect(r.s).toBe(30);
    expect(r.halted.has('junction')).toBe(true);
    expect(r.halted.has('player-far')).toBe(true);
    expect(ev.filter((e) => e.type === 'resumed')).toEqual([]);
  });

  it('go() when not at a junction changes nothing', () => {
    const r = new EscortRun(plan());
    run(r, 2);
    const s = r.s;
    expect(r.go()).toEqual([]);
    expect(r.s).toBe(s);
  });
});

describe('EscortRun hits', () => {
  it('halts while a member is down and resumes when the caller clears it', () => {
    const r = new EscortRun(plan());
    run(r, 2);
    const s = r.s;
    expect(run(r, 3, { down: true })).toEqual([{ type: 'halted', reason: 'hit' }]);
    expect(r.s).toBe(s);
    expect(run(r, 1)[0]).toEqual({ type: 'resumed' });
    expect(r.s).toBeGreaterThan(s);
  });
});

describe('EscortRun player-far', () => {
  it('halts past 25 m, keeps halting between 15 and 25 m, resumes inside 15 m', () => {
    const r = new EscortRun(plan());
    run(r, 2); // lead at about -4
    const lead = () => r.pose(0).z;
    expect(run(r, 0.5, { player: { x: 0, y: 0, z: lead() + 30 } })).toEqual([{ type: 'halted', reason: 'player-far' }]);
    const s = r.s;
    run(r, 2, { player: { x: 0, y: 0, z: lead() + 20 } });
    expect(r.s).toBe(s);
    expect(run(r, 0.5, { player: { x: 0, y: 0, z: lead() + 10 } })[0]).toEqual({ type: 'resumed' });
  });

  it('between 15 and 25 m without a prior halt it keeps walking', () => {
    const r = new EscortRun(plan());
    run(r, 2);
    const s = r.s;
    run(r, 1, { player: { x: 0, y: 0, z: r.pose(0).z + 20 } });
    expect(r.s).toBeGreaterThan(s);
  });
});

describe('EscortRun storms', () => {
  it('a storm sends it to the next shelter ahead and it waits there; a clear resumes the walk', () => {
    const r = new EscortRun(plan());
    run(r, 5); // s = 10
    const ev = run(r, 10, { storm: true });
    expect(ev[0]).toEqual({ type: 'halted', reason: 'storm' });
    expect(r.s).toBe(20);
    run(r, 30, { storm: true });
    expect(r.s).toBe(20);
    expect(run(r, 1)[0]).toEqual({ type: 'resumed' });
    expect(r.s).toBeGreaterThan(20);
  });

  it('never seeks a shelter past the next junction: it walks back to the one behind instead', () => {
    const r = new EscortRun(plan({ shelters: [{ id: 'sh1', s: 20 }, { id: 'sh-far', s: 40 }] }));
    run(r, 12.5); // s = 25, the next junction is at 30, sh-far is past it
    run(r, 10, { storm: true });
    expect(r.s).toBe(20);
  });

  it('with no shelter at all it waits where it is', () => {
    const r = new EscortRun(plan({ shelters: [] }));
    run(r, 5);
    const s = r.s;
    run(r, 5, { storm: true });
    expect(r.s).toBe(s);
  });

  it('a storm during a junction stop: go() alone does not move it until the storm clears', () => {
    const r = new EscortRun(plan({ shelters: [{ id: 'at-j1', s: 30 }] }));
    run(r, 20);
    run(r, 1, { storm: true });
    r.go();
    run(r, 3, { storm: true });
    expect(r.s).toBe(30);
    run(r, 1);
    expect(r.s).toBeGreaterThan(30);
  });

  it('a hit during the shelter walk holds it in place; it walks on to the shelter when cleared', () => {
    const r = new EscortRun(plan());
    run(r, 5);
    run(r, 1, { storm: true });
    const s = r.s;
    const ev = run(r, 2, { storm: true, down: true });
    expect(ev).toContainEqual({ type: 'halted', reason: 'hit' });
    expect(r.s).toBe(s);
    run(r, 10, { storm: true });
    expect(r.s).toBe(20);
  });
});

describe('EscortRun save and restore', () => {
  it('saves the last junction and restores there, waiting for Cael, from every state', () => {
    const states: Array<(r: EscortRun) => void> = [
      (r) => run(r, 20), // at j1
      (r) => { run(r, 20); r.go(); run(r, 3); }, // walking past j1
      (r) => { run(r, 20); r.go(); run(r, 2, { down: true }); }, // hit
      (r) => { run(r, 20); r.go(); run(r, 2, { storm: true }); }, // storm
      (r) => { run(r, 20); r.go(); run(r, 2, { player: { x: 0, y: 0, z: 300 } }); }, // player far
    ];
    for (const reach of states) {
      const a = new EscortRun(plan());
      reach(a);
      const saved = JSON.parse(JSON.stringify(a.save()));
      expect(saved).toEqual({ junctionIndex: 0 });
      const b = new EscortRun(plan());
      b.restore(saved);
      expect(b.s).toBe(30);
      expect(b.atJunction).toBe(true);
      expect(b.reason).toBe('junction');
      expect(b.safePoint()).toEqual({ x: 0, y: 0, z: -30 });
      expect(b.go()).toEqual([{ type: 'resumed' }]);
    }
  });

  it('before the first junction it restores at the start, walking; a bad index clamps', () => {
    const a = new EscortRun(plan());
    run(a, 3);
    const b = new EscortRun(plan());
    b.restore(a.save());
    expect(b.s).toBe(0);
    expect(b.reason).toBeNull();
    expect(b.safePoint()).toEqual({ x: 0, y: 0, z: 0 });
    b.restore({ junctionIndex: 9 });
    expect(b.junctionId).toBe('j2');
    b.restore({ junctionIndex: Number.NaN });
    expect(b.s).toBe(0);
  });
});
