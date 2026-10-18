import { describe, expect, it } from 'vitest';
import { DodgeModel, DODGE_SPEED, type DodgeContext } from './DodgeModel';
import { DODGE, STAMINA } from './tuning';

const ok = (over: Partial<DodgeContext> = {}): DodgeContext => ({
  stamina: { canAfford: () => true },
  exhausted: false,
  grounded: true,
  dead: false,
  staggered: false,
  busyAction: false,
  ...over,
});
const free = (x = 0, z = -1, yaw = 0) => ({ inputX: x, inputZ: z, facingYaw: yaw, lockedOn: false });

describe('DodgeModel gating', () => {
  it('allows a normal start and asks for the dodge cost', () => {
    let asked = -1;
    const m = new DodgeModel();
    expect(m.canStart(ok({ stamina: { canAfford: (n) => ((asked = n), true) } }))).toBe(true);
    expect(asked).toBe(STAMINA.dodgeCost);
  });
  it.each([
    ['stamina short', { stamina: { canAfford: () => false } }],
    ['exhausted', { exhausted: true }],
    ['airborne', { grounded: false }],
    ['dead', { dead: true }],
    ['staggered', { staggered: true }],
    ['busy', { busyAction: true }],
  ] as [string, Partial<DodgeContext>][])('refuses when %s', (_n, over) => {
    expect(new DodgeModel().canStart(ok(over))).toBe(false);
  });
  it('refuses while already dodging and allows again the tick after done', () => {
    const m = new DodgeModel();
    m.start(free());
    expect(m.canStart(ok())).toBe(false);
    for (let i = 0; i < DODGE.totalTicks; i++) m.tick();
    expect(m.active).toBe(false);
    expect(m.canStart(ok())).toBe(true);
  });
});

describe('DodgeModel timing', () => {
  it('has i-frames exactly on iFrameStart..iFrameEnd', () => {
    const m = new DodgeModel();
    m.start(free());
    const flags: boolean[] = [];
    for (let i = 0; i < DODGE.totalTicks; i++) flags.push(m.tick().iFrames);
    flags.forEach((f, i) => expect(f).toBe(i >= 2 && i <= 16));
    expect(flags[1]).toBe(false);
    expect(flags[17]).toBe(false);
  });
  it('indexes from 0 and finishes on totalTicks-1', () => {
    const m = new DodgeModel();
    m.start(free());
    for (let i = 0; i < DODGE.totalTicks; i++) {
      const t = m.tick();
      expect(t.index).toBe(i);
      expect(t.done).toBe(i === DODGE.totalTicks - 1);
    }
  });
  it('travels exactly the dodge distance, only until iFrameEnd', () => {
    const m = new DodgeModel();
    const s = m.start(free(3, 4));
    let dx = 0;
    let dz = 0;
    for (let i = 0; i < DODGE.totalTicks; i++) {
      const t = m.tick();
      if (i <= DODGE.iFrameEnd) expect(t.move).not.toBeNull();
      else expect(t.move).toBeNull();
      if (t.move) {
        dx += t.move.x * t.move.speed / 60;
        dz += t.move.z * t.move.speed / 60;
      }
    }
    expect(Math.hypot(dx, dz)).toBeCloseTo(DODGE.distance, 9);
    expect(dx / Math.hypot(dx, dz)).toBeCloseTo(s.dirX, 9);
    expect(DODGE_SPEED).toBeGreaterThan(0);
  });
  it('idle ticks do nothing', () => {
    expect(new DodgeModel().tick()).toEqual({ index: -1, iFrames: false, move: null, done: false });
  });
});

describe('DodgeModel direction', () => {
  it('free dodge turns toward the input with the forward clip', () => {
    const s = new DodgeModel().start(free(1, 0, 0));
    expect(s.clip).toBe('Dodge_Forward');
    expect(s.dirX).toBeCloseTo(1);
    expect(s.yaw).toBeCloseTo(Math.atan2(-1, -0));
    // forward vector of the new yaw matches the direction
    expect(-Math.sin(s.yaw)).toBeCloseTo(s.dirX);
    expect(-Math.cos(s.yaw)).toBeCloseTo(s.dirZ);
  });
  it('yaw 0 faces -Z', () => {
    expect(new DodgeModel().start(free(0, -1, 1.2)).yaw).toBeCloseTo(0);
  });
  it('free dodge with no input goes backward without turning', () => {
    const s = new DodgeModel().start(free(0, 0, 0.7));
    expect(s.clip).toBe('Dodge_Backward');
    expect(s.yaw).toBe(0.7);
    expect(s.dirX).toBeCloseTo(Math.sin(0.7));
    expect(s.dirZ).toBeCloseTo(Math.cos(0.7));
  });
  it('locked-on keeps yaw and picks sectors from facing', () => {
    const yaw = 0.6;
    const f = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
    const r = { x: Math.cos(yaw), z: -Math.sin(yaw) };
    const pick = (x: number, z: number) => new DodgeModel().start({ inputX: x, inputZ: z, facingYaw: yaw, lockedOn: true });
    expect(pick(f.x, f.z).clip).toBe('Dodge_Forward');
    expect(pick(-f.x, -f.z).clip).toBe('Dodge_Backward');
    expect(pick(r.x, r.z).clip).toBe('Dodge_Right');
    expect(pick(-r.x, -r.z).clip).toBe('Dodge_Left');
    expect(pick(f.x, f.z).yaw).toBe(yaw);
  });
  it('locked-on no input is backward', () => {
    const s = new DodgeModel().start({ inputX: 0, inputZ: 0, facingYaw: 0, lockedOn: true });
    expect(s.clip).toBe('Dodge_Backward');
    expect(s.dirZ).toBeCloseTo(1);
  });
  it('exact 45 degree edges go to the lateral sectors consistently', () => {
    const h = Math.SQRT1_2;
    const pick = (x: number, z: number) => new DodgeModel().start({ inputX: x, inputZ: z, facingYaw: 0, lockedOn: true }).clip;
    expect(pick(h, -h)).toBe('Dodge_Right');
    expect(pick(-h, -h)).toBe('Dodge_Left');
    expect(pick(h, h)).toBe('Dodge_Right');
    expect(pick(-h, h)).toBe('Dodge_Left');
    // just inside forward / back
    expect(pick(Math.sin(0.78), -Math.cos(0.78))).toBe('Dodge_Forward');
    expect(pick(Math.sin(0.78), Math.cos(0.78))).toBe('Dodge_Backward');
  });
});

describe('DodgeModel cancel and recovery', () => {
  it('cancel clears i-frames the same tick and reports done once', () => {
    const m = new DodgeModel();
    m.start(free());
    m.tick();
    m.tick();
    expect(m.tick().iFrames).toBe(true);
    m.cancel();
    expect(m.active).toBe(false);
    const t = m.tick();
    expect(t).toMatchObject({ iFrames: false, move: null, done: true });
    expect(m.tick().done).toBe(false);
    expect(m.canStart(ok())).toBe(true);
  });
  it('cancel when idle is a no-op', () => {
    const m = new DodgeModel();
    m.cancel();
    expect(m.tick().done).toBe(false);
  });
  it('allows attack only in recovery', () => {
    const m = new DodgeModel();
    expect(m.canCancelIntoAttack).toBe(false);
    m.start(free());
    expect(m.canCancelIntoAttack).toBe(false);
    for (let i = 0; i <= DODGE.iFrameEnd; i++) {
      m.tick();
      expect(m.canCancelIntoAttack).toBe(false);
      expect(m.recovering).toBe(false);
    }
    m.tick();
    expect(m.recovering).toBe(true);
    expect(m.canCancelIntoAttack).toBe(true);
    for (let i = DODGE.iFrameEnd + 2; i < DODGE.totalTicks; i++) m.tick();
    expect(m.canCancelIntoAttack).toBe(false);
  });
});
