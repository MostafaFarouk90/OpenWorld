/**
 * Golem poses: flat number arrays (no allocation per tick). Index order below. Rotations are radians about X
 * (positive swings a hanging limb forward, towards -Z) unless noted. Arm Z is "outward" for both arms.
 */
export const P = {
  TX: 0, TY: 1, TZ: 2, // torso pitch (forward +), twist, roll
  HX: 3, // head pitch
  ARX: 4, ARZ: 5, ALX: 6, ALZ: 7, // arms: swing, outward
  LRH: 8, LRK: 9, LLH: 10, LLK: 11, // legs: hip swing, knee (<= 0 bends the shin back)
  DROP: 12, // extra lowering of the hips, metres
  COUNT: 13,
} as const;

export type PoseArr = number[];
export const newPose = (): PoseArr => new Array<number>(P.COUNT).fill(0);

const mk = (o: Partial<Record<keyof typeof P, number>>): readonly number[] => {
  const a = newPose();
  a[P.ARZ] = 0.12;
  a[P.ALZ] = 0.12;
  a[P.ARX] = 0.05;
  a[P.ALX] = 0.05;
  for (const [k, v] of Object.entries(o)) a[P[k as keyof typeof P]] = v as number;
  return a;
};

export const REST = mk({});

interface Key {
  u: number;
  p: readonly number[];
}

const k = (u: number, o: Partial<Record<keyof typeof P, number>>): Key => ({ u, p: mk(o) });
const rest = (u: number): Key => ({ u, p: REST });

export const KEYS = {
  Stomp: [
    rest(0),
    k(0.3, { TX: -0.12, TZ: -0.1, ARX: -0.3, ALX: -0.3, ARZ: 0.5, ALZ: 0.5, LRH: 1.1, LRK: -1.3 }),
    k(0.42, { TX: -0.15, TZ: -0.12, ARX: -0.4, ALX: -0.4, ARZ: 0.55, ALZ: 0.55, LRH: 1.2, LRK: -1.4 }),
    k(0.5, { TX: 0.2, HX: 0.1, ARX: 0.4, ALX: 0.4, ARZ: 0.3, ALZ: 0.3, LRH: 0.15, LRK: -0.05 }),
    k(0.68, { TX: 0.2, HX: 0.1, ARX: 0.4, ALX: 0.4, ARZ: 0.3, ALZ: 0.3, LRH: 0.15, LRK: -0.05 }),
    rest(1),
  ],
  Slam: [
    rest(0),
    k(0.3, { TX: -0.25, HX: -0.2, ARX: 2.9, ALX: 2.9, ARZ: 0.15, ALZ: 0.15 }),
    k(0.44, { TX: -0.3, HX: -0.25, ARX: 3.0, ALX: 3.0, ARZ: 0.15, ALZ: 0.15 }),
    k(0.54, { TX: 0.45, HX: 0.2, ARX: 0.6, ALX: 0.6, ARZ: 0.2, ALZ: 0.2, LRH: 0.3, LRK: -0.4, LLH: 0.3, LLK: -0.4 }),
    k(0.74, { TX: 0.45, HX: 0.2, ARX: 0.6, ALX: 0.6, ARZ: 0.2, ALZ: 0.2, LRH: 0.3, LRK: -0.4, LLH: 0.3, LLK: -0.4 }),
    rest(1),
  ],
  Throw: [
    rest(0),
    k(0.3, { TX: -0.2, TY: 0.5, ARX: -2.6, ARZ: 0.3, ALX: 0.8, LLH: 0.2 }),
    k(0.44, { TX: -0.25, TY: 0.6, ARX: -2.8, ARZ: 0.3, ALX: 0.9, LLH: 0.25 }),
    k(0.52, { TX: 0.3, TY: -0.4, ARX: 1.6, ARZ: 0.2, ALX: 0.4 }),
    k(0.66, { TX: 0.3, TY: -0.4, ARX: 1.8, ARZ: 0.2, ALX: 0.4 }),
    rest(1),
  ],
  Hit: [rest(0), k(0.4, { TX: -0.25, HX: -0.3, ARX: -0.3, ALX: -0.3 }), rest(1)],
  Stagger: [
    rest(0),
    k(0.15, { TX: 0.55, HX: -0.4, ARX: 0.8, ALX: 0.8, ARZ: 0.3, ALZ: 0.3, LRH: 1.5, LRK: -1.6, LLH: 0.4, LLK: -0.5 }),
    k(0.85, { TX: 0.6, HX: -0.45, ARX: 0.9, ALX: 0.9, ARZ: 0.3, ALZ: 0.3, LRH: 1.5, LRK: -1.6, LLH: 0.4, LLK: -0.5 }),
    rest(1),
  ],
  Death: [
    rest(0),
    k(0.25, { TX: -0.2, HX: -0.2, ARZ: 0.6, ALZ: 0.6 }),
    k(0.6, { TX: 0.5, HX: 0.3, ARX: 0.5, ALX: 0.5, ARZ: 0.4, ALZ: 0.4, LRH: 1.5, LRK: -1.6, LLH: 1.4, LLK: -1.5 }),
    k(1, { TX: 1.3, HX: 0.4, ARX: 1.5, ALX: 1.5, ARZ: 0.4, ALZ: 0.4, LRH: 1.5, LRK: -1.6, LLH: 1.4, LLK: -1.5 }),
  ],
} as const satisfies Record<string, readonly Key[]>;

export const smooth = (t: number): number => {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * (3 - 2 * x);
};

/** Writes the keyframed pose at normalised time `u` into `out`. */
export function sampleKeys(keys: readonly Key[], u: number, out: PoseArr): void {
  let i = 0;
  while (i < keys.length - 2 && u > keys[i + 1]!.u) i++;
  const a = keys[i]!;
  const b = keys[i + 1]!;
  const span = b.u - a.u;
  const f = smooth(span > 0 ? (u - a.u) / span : 1);
  for (let j = 0; j < P.COUNT; j++) out[j] = a.p[j]! + (b.p[j]! - a.p[j]!) * f;
}

/** Walk/run cycle pose. `phase` radians, `amp` swing amplitude (0 stands still), `lean` forward torso pitch. */
export function gaitPose(phase: number, amp: number, lean: number, out: PoseArr): void {
  const s = Math.sin(phase);
  const c = Math.cos(phase);
  out[P.TX] = lean;
  out[P.TY] = 0.1 * amp * s;
  out[P.TZ] = 0.05 * amp * s;
  out[P.HX] = -lean * 0.5;
  out[P.ARX] = -0.8 * amp * s + 0.05;
  out[P.ALX] = 0.8 * amp * s + 0.05;
  out[P.ARZ] = 0.12;
  out[P.ALZ] = 0.12;
  out[P.LRH] = amp * s;
  out[P.LLH] = -amp * s;
  out[P.LRK] = -Math.max(0, c) * amp * 1.1;
  out[P.LLK] = -Math.max(0, -c) * amp * 1.1;
  out[P.DROP] = 0;
}
