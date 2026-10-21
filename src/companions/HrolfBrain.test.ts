import { describe, expect, it } from 'vitest';
import { HrolfBrain, type BrainView, type Foe } from './HrolfBrain';
import { HROLF_TUNING } from './tuning';

const DT = 1 / 60;

function view(over: Partial<Omit<BrainView, 'foes'>> & { foes?: Foe[] } = {}) {
  const foes: Foe[] = over.foes ?? [{ id: 'foe#1', x: 0, z: -3, health: 30, beast: false }];
  const { foes: _f, ...rest } = over;
  const v: BrainView = {
    self: { x: 0, z: -1.5 },
    player: { x: 0, z: 0 },
    canAct: true,
    playerInCombat: true,
    trialRunning: false,
    mayEngage: () => true,
    struckByPlayer: () => false,
    ...rest,
    foes: () => foes,
  };
  return { v, foes };
}

/** Ticks until a hit lands or `seconds` pass; returns the hits. */
function runFor(b: HrolfBrain, v: BrainView, seconds: number) {
  const hits: string[] = [];
  let swings = 0;
  for (let t = 0; t < seconds; t += DT) {
    const s = b.tick(DT, v);
    if (s.swing) swings++;
    if (s.hit) hits.push(s.hit);
  }
  return { hits, swings };
}

describe('HrolfBrain target rule', () => {
  it('fights a foe Cael is fighting: swings on cooldown and lands at the hit frame', () => {
    const b = new HrolfBrain();
    const { v } = view();
    const r = runFor(b, v, HROLF_TUNING.cooldown * 2 + 0.5);
    expect(b.currentTarget).toBe('foe#1');
    expect(r.swings).toBe(3);
    expect(r.hits).toEqual(['foe#1', 'foe#1', 'foe#1']);
  });

  it('walks to a point within reach when the foe is out of range', () => {
    const b = new HrolfBrain();
    const { v } = view({ self: { x: 5, z: 5 } });
    const s = b.tick(DT, v);
    expect(s.goal).not.toBeNull();
    expect(Math.hypot(s.goal!.x - 0, s.goal!.z + 3)).toBeCloseTo(HROLF_TUNING.range - HROLF_TUNING.closeIn, 5);
    expect(s.swing).toBe(false);
  });

  it.each([
    ['Cael out of combat', { playerInCombat: false }],
    ['a trial running', { trialRunning: true }],
    ['he cannot act (waiting, hidden, downed)', { canAct: false }],
    ['mayEngage false (a mercy state, or not aggroed on Cael)', { mayEngage: () => false }],
  ] as const)('never engages with %s', (_n, over) => {
    const b = new HrolfBrain();
    const { v } = view(over as Partial<Omit<BrainView, 'foes'>>);
    const r = runFor(b, v, 3);
    expect(b.currentTarget).toBeNull();
    expect(r.swings).toBe(0);
    expect(r.hits).toEqual([]);
  });

  it('never touches an unstruck beast; once Cael has struck it he joins in', () => {
    const b = new HrolfBrain();
    let struck = false;
    const { v } = view({ foes: [{ id: 'hound#1', x: 0, z: -3, health: 40, beast: true }], struckByPlayer: () => struck });
    expect(runFor(b, v, 2).swings).toBe(0);
    struck = true;
    expect(runFor(b, v, 1).hits).toEqual(['hound#1']);
  });

  it('never swings at a foe on 1 HP', () => {
    const b = new HrolfBrain();
    const { v } = view({ foes: [{ id: 'foe#1', x: 0, z: -3, health: 1, beast: false }] });
    expect(runFor(b, v, 3).swings).toBe(0);
  });

  it('drops a swing at the hit frame when the foe stops qualifying mid-swing (calmed, de-aggroed)', () => {
    const b = new HrolfBrain();
    let may = true;
    const { v } = view({ mayEngage: () => may });
    const first = b.tick(DT, v);
    expect(first.swing).toBe(true);
    may = false;
    const r = runFor(b, v, HROLF_TUNING.swingSeconds);
    expect(r.hits).toEqual([]);
  });

  it('ignores foes beyond his aggro radius from Cael, and leashes at 15 m', () => {
    const b = new HrolfBrain();
    const far = view({ foes: [{ id: 'foe#1', x: 0, z: -(HROLF_TUNING.aggroRadius + 1), health: 30, beast: false }] });
    expect(runFor(b, far.v, 2).swings).toBe(0);
    const b2 = new HrolfBrain();
    const lead = view({ self: { x: 0, z: -(HROLF_TUNING.leash + 1) } });
    const s = b2.tick(DT, lead.v);
    expect(s.goal).toBeNull();
    expect(b2.currentTarget).toBeNull();
  });

  it('prefers the foe nearest Cael', () => {
    const b = new HrolfBrain();
    const { v } = view({
      foes: [
        { id: 'far', x: 0, z: -8, health: 30, beast: false },
        { id: 'near', x: 1, z: -2, health: 30, beast: false },
      ],
    });
    b.tick(DT, v);
    expect(b.currentTarget).toBe('near');
  });
});
