import { describe, expect, it } from 'vitest';
import { AI, AWARENESS, LOUD_SPEED } from '../tuning';
import { loudFromSpeed, makeSpeedMeter, stepAwareness } from './awareness';
import { type PerceptionInput, type PerceptionModifiers, perceive } from './perception';
import { PerceptionHub, SNEAK, combineModifiers, type ObserverPose } from '../perceptionHook';

type P3 = { x: number; y: number; z: number };
const clear = () => true;
function input(patch: Partial<PerceptionInput>): PerceptionInput {
  return {
    selfFeet: { x: 0, y: 0, z: 0 },
    selfYaw: 0,
    targetFeet: { x: 0, y: 0, z: -10 },
    targetAlive: true,
    targetLoud: false,
    damagedBy: false,
    lineOfSight: clear,
    ...patch,
  };
}
const ID: PerceptionModifiers = { sightRangeScale: 1, coneScale: 1, hearingQuietScale: 1, hearingLoudScale: 1 };

/** The pre-hook perceive(), verbatim, as the golden reference. */
function legacyPerceive(input: PerceptionInput) {
  const NONE = { sees: false, hears: false, notices: false, distance: Infinity };
  const { selfFeet: s, targetFeet: t } = input;
  if (!t || !input.targetAlive) return { ...NONE };
  const dx = t.x - s.x;
  const dz = t.z - s.z;
  const distance = Math.hypot(dx, dz);
  if (!Number.isFinite(distance)) return { ...NONE };
  const hears = distance <= (input.targetLoud ? AI.hearingLoud : AI.hearingQuiet);
  let sees = false;
  if (distance <= AI.sightRange) {
    let inCone = true;
    if (distance > 1e-6) {
      const fx = -Math.sin(input.selfYaw);
      const fz = -Math.cos(input.selfYaw);
      const cos = (fx * dx + fz * dz) / distance;
      inCone = cos >= Math.cos((AI.sightConeDegrees / 2) * (Math.PI / 180)) - 1e-9;
    }
    if (inCone) sees = input.lineOfSight({ x: s.x, y: s.y + AI.eyeHeight, z: s.z }, { x: t.x, y: t.y + AI.chestHeight, z: t.z });
  }
  return { sees, hears, notices: input.damagedBy || sees || hears, distance };
}

describe('perceive without providers is unchanged (golden)', () => {
  const cases: Partial<PerceptionInput>[] = [];
  for (const yaw of [0, Math.PI / 2, 2.5, -1])
    for (const [x, z] of [[0, -10], [0, 10], [-10, 0], [3, -4], [0, 0], [0, -17.9], [0, -18.5], [4, -6.5], [-30, 30]])
      for (const loud of [false, true])
        for (const los of [true, false])
          for (const damagedBy of [false, true])
            cases.push({ selfYaw: yaw, targetFeet: { x, y: 0.3, z }, targetLoud: loud, lineOfSight: () => los, damagedBy });
  cases.push({ targetFeet: null, damagedBy: true }, { targetAlive: false, damagedBy: true, targetLoud: true });

  it('matches the old implementation on every case, with no modifiers, null, and identity modifiers', () => {
    for (const c of cases) {
      const base = legacyPerceive(input(c));
      expect(perceive(input(c))).toEqual(base);
      expect(perceive(input({ ...c, modifiers: null }))).toEqual(base);
      expect(perceive(input({ ...c, modifiers: combineModifiers([ID]) }))).toEqual(base);
    }
    expect(cases.length).toBeGreaterThan(250);
  });
});

describe('perception modifiers', () => {
  it('the SNEAK preset has the agreed numbers and shrinks sight, cone and hearing', () => {
    expect(SNEAK).toEqual({ sightRangeScale: 0.5, coneScale: 0.8, hearingQuietScale: 0.4, hearingLoudScale: 0.7 });
    const m = combineModifiers([SNEAK]);
    expect(perceive(input({ targetFeet: { x: 0, y: 0, z: -10 }, modifiers: m })).sees).toBe(false); // 10 > 18 * 0.5
    expect(perceive(input({ targetFeet: { x: 0, y: 0, z: -8 }, modifiers: m })).sees).toBe(true);
    expect(perceive(input({ targetFeet: { x: 0, y: 0, z: -4 }, modifiers: m, lineOfSight: () => false })).hears).toBe(false); // 6 * 0.4 = 2.4
    expect(perceive(input({ targetFeet: { x: 0, y: 0, z: -2 }, modifiers: m, lineOfSight: () => false })).hears).toBe(true);
    const at = (deg: number, mod: typeof m) => {
      const a = (deg * Math.PI) / 180;
      return perceive(input({ targetFeet: { x: -Math.sin(a) * 6, y: 0, z: -Math.cos(a) * 6 }, modifiers: mod })).sees;
    };
    expect(at(55, null)).toBe(true);
    expect(at(55, m)).toBe(false); // half cone is 48 degrees
    expect(at(40, m)).toBe(true);
  });

  it('scales multiply across two providers', () => {
    const m = combineModifiers([
      { ...ID, sightRangeScale: 0.5, coneScale: 0.8, hearingQuietScale: 0.5, hearingLoudScale: 0.9 },
      { ...ID, sightRangeScale: 0.6, coneScale: 0.5, hearingQuietScale: 0.5, hearingLoudScale: 0.5 },
    ])!;
    expect(m.sightRangeScale).toBeCloseTo(0.3);
    expect(m.coneScale).toBeCloseTo(0.4);
    expect(m.hearingQuietScale).toBeCloseTo(0.25);
    expect(m.hearingLoudScale).toBeCloseTo(0.45);
    expect(perceive(input({ targetFeet: { x: 0, y: 0, z: -5 }, modifiers: m })).sees).toBe(true);
    expect(perceive(input({ targetFeet: { x: 0, y: 0, z: -6 }, modifiers: m })).sees).toBe(false); // 18 * 0.3 = 5.4
  });

  it('an empty list combines to null', () => {
    expect(combineModifiers([])).toBeNull();
  });

  it('sight blockers concatenate, a single blocker object is accepted, and a disc on the ray blocks sight', () => {
    const a = { x: 0, z: -3, r: 1 };
    const b = { x: 5, z: -5, r: 1 };
    const m = combineModifiers([{ ...ID, blockSightRadius: a }, { ...ID, blockSightRadius: [b] }, ID])!;
    expect(m.blockSightRadius).toEqual([a, b]);
    expect(perceive(input({ modifiers: m })).sees).toBe(false); // smoke at z -3 on the ray
    expect(perceive(input({ modifiers: m })).distance).toBeCloseTo(10);
    // Only the second blocker covers this ray.
    const t = { x: 10, y: 0, z: -10 };
    expect(perceive(input({ targetFeet: t, selfYaw: -Math.PI / 4, modifiers: combineModifiers([{ ...ID, blockSightRadius: a }]) })).sees).toBe(true);
    expect(perceive(input({ targetFeet: t, selfYaw: -Math.PI / 4, modifiers: m })).sees).toBe(false);
    // A disc beside the ray, or beyond the target, does not block.
    expect(perceive(input({ modifiers: combineModifiers([{ ...ID, blockSightRadius: { x: 3, z: -5, r: 1 } }]) })).sees).toBe(true);
    expect(perceive(input({ modifiers: combineModifiers([{ ...ID, blockSightRadius: { x: 0, z: -14, r: 1 } }]) })).sees).toBe(true);
    // Smoke does not stop hearing.
    expect(perceive(input({ targetLoud: true, modifiers: m })).hears).toBe(true);
  });

  it('hiddenBelow takes the minimum and ignores the cone inside it', () => {
    const m = combineModifiers([{ ...ID, hiddenBelow: 5 }, { ...ID, hiddenBelow: 3 }, ID])!;
    expect(m.hiddenBelow).toBe(3);
    const behind = (z: number, mod = m) => perceive(input({ targetFeet: { x: 0, y: 0, z }, modifiers: mod }));
    expect(behind(2).sees).toBe(true); // behind the observer, but closer than 3
    expect(behind(2).notices).toBe(true);
    expect(behind(4).sees).toBe(false);
    expect(behind(-4).sees).toBe(false); // in the cone but farther than hiddenBelow
    expect(behind(-4).notices).toBe(false);
    expect(behind(-4, combineModifiers([{ ...ID, hiddenBelow: 5 }])!).sees).toBe(true);
    expect(perceive(input({ targetFeet: { x: 0, y: 0, z: -4 }, damagedBy: true, modifiers: m })).notices).toBe(true);
  });

  it('targetHeight lowers the sight ray target, minimum wins, and never raises it', () => {
    let to: P3 | null = null;
    const los = (_f: P3, t: P3) => {
      to = t;
      return true;
    };
    const run = (m: PerceptionModifiers[]) => {
      perceive(input({ targetFeet: { x: 0, y: 2, z: -5 }, lineOfSight: los, modifiers: combineModifiers(m) }));
      return to!.y;
    };
    expect(run([ID])).toBeCloseTo(2 + AI.chestHeight);
    expect(run([{ ...ID, targetHeight: 0.6 }])).toBeCloseTo(2.6);
    expect(run([{ ...ID, targetHeight: 0.8 }, { ...ID, targetHeight: 0.5 }])).toBeCloseTo(2.5);
    expect(run([{ ...ID, targetHeight: 3 }])).toBeCloseTo(2 + AI.chestHeight);
    expect(run([{ ...ID, targetHeight: -1 }])).toBeCloseTo(2);
  });

  it('low cover hides a crouched target through a real height-sensitive ray', () => {
    const coverTop = 0.9;
    const los = (_f: P3, t: P3) => t.y > coverTop; // the ray to a low point is stopped by the cover
    expect(perceive(input({ lineOfSight: los })).sees).toBe(true);
    expect(perceive(input({ lineOfSight: los, modifiers: combineModifiers([{ ...ID, targetHeight: 0.5 }]) })).sees).toBe(false);
  });
});

describe('PerceptionHub', () => {
  const pose: ObserverPose = { actorId: 'e1', kind: 'watch-guard', state: 'idle', spawnerId: null, level: 1, feet: { x: 1, y: 0, z: 2 }, yaw: 0.5, observerOnly: true };

  it('returns null with no providers, passes the pose and target, and unregister removes a provider', () => {
    const hub = new PerceptionHub(() => {});
    expect(hub.combined('player', () => pose)).toBeNull();
    const seen: Array<[string, ObserverPose]> = [];
    const off = hub.register({
      modifiers: (t, o) => {
        seen.push([t, o]);
        return SNEAK;
      },
    });
    expect(hub.combined('player', () => pose)).toEqual({ ...SNEAK, blockSightRadius: [] });
    expect(seen).toEqual([['player', pose]]);
    off();
    off();
    expect(hub.size).toBe(0);
    expect(hub.combined('player', () => pose)).toBeNull();
  });

  it('a provider returning null contributes nothing', () => {
    const hub = new PerceptionHub(() => {});
    hub.register({ modifiers: () => null });
    expect(hub.combined('p', () => pose)).toBeNull();
  });

  it('a throwing provider is ignored with exactly one warning, and the others still apply', () => {
    const warnings: string[] = [];
    const hub = new PerceptionHub((m) => warnings.push(m));
    hub.register({
      modifiers: () => {
        throw new Error('boom');
      },
    });
    hub.register({ modifiers: () => SNEAK });
    for (let i = 0; i < 5; i++) expect(hub.combined('p', () => pose)?.sightRangeScale).toBe(0.5);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('boom');
    // A second throwing provider gets its own warning.
    hub.register({
      modifiers: () => {
        throw new Error('bang');
      },
    });
    hub.combined('p', () => pose);
    hub.combined('p', () => pose);
    expect(warnings).toHaveLength(2);
  });
});

describe('stepAwareness', () => {
  const seen = (distance: number) => ({ sees: true, hears: false, distance });
  const unseen = { sees: false, hears: false, distance: 8 };

  it('fills faster when closer, and fills to exactly 1 and clamps', () => {
    const near = stepAwareness(0, seen(1), 0.1).awareness;
    const far = stepAwareness(0, seen(17), 0.1).awareness;
    expect(near).toBeGreaterThan(far);
    expect(far).toBeGreaterThan(0);
    expect(near).toBeCloseTo((1 / AWARENESS.fillSeconds) * 0.1 * (AWARENESS.edgeFillScale + (1 - AWARENESS.edgeFillScale) * (1 - 1 / AI.sightRange)), 6);
    const full = stepAwareness(0.99, seen(1), 5);
    expect(full.awareness).toBe(1);
    expect(full.notices).toBe(true);
  });

  it('drains at 0.25 per second when unseen and clamps at 0', () => {
    expect(stepAwareness(0.8, unseen, 1).awareness).toBeCloseTo(0.55);
    expect(stepAwareness(0.1, unseen, 10).awareness).toBe(0);
    expect(stepAwareness(0, unseen, 1).awareness).toBe(0);
    expect(AWARENESS.drainPerSecond).toBe(0.25);
  });

  it('suspicious only above 0.3, notices only at 1', () => {
    expect(stepAwareness(0.3, unseen, 0).suspicious).toBe(false);
    expect(stepAwareness(0.31, unseen, 0).suspicious).toBe(true);
    expect(stepAwareness(0.9, seen(5), 0.001).notices).toBe(false);
  });

  it('edges fire once per rise and re-arm after a drop', () => {
    let a = 0;
    let suspicious = 0;
    let spotted = 0;
    const run = (r: { sees: boolean; hears: boolean; distance: number }, seconds: number) => {
      for (let i = 0; i < Math.round(seconds / 0.02); i++) {
        const s = stepAwareness(a, r, 0.02);
        a = s.awareness;
        if (s.becameSuspicious) suspicious++;
        if (s.becameSpotted) spotted++;
      }
    };
    run(seen(4), 3); // fills to 1 and stays
    expect([suspicious, spotted]).toEqual([1, 1]);
    run(unseen, 2); // 1 -> 0.5: still above 0.3, spotted re-armed, suspicious not
    run(seen(4), 3);
    expect([suspicious, spotted]).toEqual([1, 2]);
    run(unseen, 5); // down to 0
    expect(a).toBe(0);
    run(seen(4), 3);
    expect([suspicious, spotted]).toEqual([2, 3]);
  });

  it('a loud noise counts like sight, and bad input does not produce NaN', () => {
    expect(stepAwareness(0, { sees: false, hears: true, distance: 5 }, 0.1).awareness).toBeGreaterThan(0);
    expect(stepAwareness(Number.NaN, seen(5), 0.1).awareness).toBeGreaterThan(0);
    expect(stepAwareness(0.5, seen(Infinity), 0.1).awareness).toBeGreaterThan(0.5);
    expect(stepAwareness(0.5, seen(5), Number.NaN).awareness).toBe(0.5);
    expect(stepAwareness(0.5, seen(5), -1).awareness).toBe(0.5);
  });
});

describe('loudness from speed', () => {
  it('loud only at sprint pace or while attacking', () => {
    expect(loudFromSpeed(0, false)).toBe(false);
    expect(loudFromSpeed(4.5, false)).toBe(false);
    expect(loudFromSpeed(LOUD_SPEED, false)).toBe(true);
    expect(loudFromSpeed(7.5, false)).toBe(true);
    expect(loudFromSpeed(0, true)).toBe(true);
    expect(loudFromSpeed(Number.NaN, false)).toBe(false);
  });

  it('the speed meter measures feet over simulated time and shares a reading within a tick', () => {
    const feet = { x: 0, z: 0 };
    let t = 0;
    const speed = makeSpeedMeter(() => feet, () => t);
    expect(speed()).toBe(0);
    t = 0.5;
    feet.x = 3;
    feet.z = 4;
    expect(speed()).toBeCloseTo(10);
    feet.x = 100;
    expect(speed()).toBeCloseTo(10); // same tick: cached
    t = 1;
    expect(speed()).toBeCloseTo(97 / 0.5);
    t = 1.5; // standing still
    expect(speed()).toBe(0);
  });
});
