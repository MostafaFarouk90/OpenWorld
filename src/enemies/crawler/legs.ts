/**
 * The crawler's own leg script: an alternating-tripod gait with no IK. Leg order (index, side): 0 L-front,
 * 1 R-front, 2 L-mid, 3 R-mid, 4 L-rear, 5 R-rear. Tripod A is legs 1,4,5 (1-based: indices 0,3,4), tripod B is
 * 2,3,6 (indices 1,2,5). A leg is in swing for half of the cycle, and the two tripods are half a cycle apart.
 * The phase advances with the distance travelled (`speed / strideLength`).
 */
export const LEG_COUNT = 6;
export const TRIPOD_A: readonly number[] = [0, 3, 4];
export const TRIPOD_B: readonly number[] = [1, 2, 5];
/** -1 for the left (-X) legs, +1 for the right. */
export const LEG_SIDE: readonly number[] = [-1, 1, -1, 1, -1, 1];
/** Rest fore/aft fan of the hips (rotation about X, positive = foot forward / towards -Z). */
export const LEG_FAN: readonly number[] = [0.35, 0.35, 0, 0, -0.35, -0.35];
/** Peak fore/aft swing of a stepping foot, radians. */
export const STRIDE_ANGLE = 0.42;
/** Distance travelled per full gait cycle (both tripods step once), metres at scale 1. */
export const STRIDE_LENGTH = 0.9;

export function tripodOf(leg: number): 'A' | 'B' {
  return TRIPOD_A.includes(leg) ? 'A' : 'B';
}

export class LegScript {
  /** Gait cycle phase 0..1. */
  phase = 0;
  constructor(private readonly strideLength: number = STRIDE_LENGTH) {}

  step(speed: number, dt: number): void {
    if (!(speed > 0)) return;
    const p = this.phase + (speed / this.strideLength) * dt;
    this.phase = p - Math.floor(p);
  }

  /** Phase of one leg, 0..1; 0..0.5 is swing, 0.5..1 stance. Tripod B is half a cycle behind A. */
  legPhase(leg: number): number {
    const p = this.phase + (tripodOf(leg) === 'A' ? 0 : 0.5);
    return p - Math.floor(p);
  }

  swinging(leg: number): boolean {
    return this.legPhase(leg) < 0.5;
  }

  /** Writes the foot's fore/aft fraction (-1 back .. +1 forward) and lift (0..1) into `out`. */
  sample(leg: number, out: { reach: number; lift: number }): void {
    const q = this.legPhase(leg);
    if (q < 0.5) {
      const u = q * 2;
      out.reach = -Math.cos(Math.PI * u);
      out.lift = Math.sin(Math.PI * u);
    } else {
      out.reach = 1 - (q - 0.5) * 4;
      out.lift = 0;
    }
  }
}

/** What the pose layer and the gait feed into one leg. */
export interface LegInput {
  /** Gait strength 0..1 (0 = at rest). */
  gaitAmp: number;
  /** Foot lift scale (run lifts higher). */
  liftScale: number;
  frontRaise: number;
  legUp: number;
  curl: number;
  splay: number;
  squirm: number;
  /** Body pitch, for keeping the rear feet down while rearing. */
  pitch: number;
  time: number;
}

export interface LegAngles {
  /** Hip rotation about X (fore/aft). */
  hipX: number;
  /** Hip outward angle, side-signed (rotation about Z). */
  hipZ: number;
  /** Knee rotation about Z, side-signed. */
  kneeZ: number;
}

const tmp = { reach: 0, lift: 0 };
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** Joint angles of one leg. Writes into `out`; no allocation. */
export function solveLeg(script: LegScript, leg: number, input: LegInput, restHip: number, out: LegAngles): void {
  const side = LEG_SIDE[leg]!;
  script.sample(leg, tmp);
  const tuck = Math.max(input.curl, input.legUp);
  const gaitW = input.gaitAmp * (1 - Math.min(1, tuck));
  let hipX = LEG_FAN[leg]! + STRIDE_ANGLE * tmp.reach * gaitW;
  let theta = restHip + 0.12 * tmp.lift * gaitW + 0.8 * input.splay;
  let lower = -0.9 * tmp.lift * gaitW * input.liftScale + 0.5 * input.splay;
  if (leg < 2) {
    hipX += 1.1 * input.frontRaise;
    theta += 0.3 * input.frontRaise;
    lower -= 1.2 * input.frontRaise;
  } else {
    hipX -= 0.8 * input.pitch;
  }
  theta = lerp(theta, 2.2, input.legUp);
  lower = lerp(lower, 2.5, input.legUp);
  theta = lerp(theta, 1.3, input.curl);
  lower = lerp(lower, -0.9, input.curl);
  hipX += Math.sin(input.time * 9 + leg * 1.7) * 0.25 * input.squirm;
  out.hipX = hipX;
  out.hipZ = side * theta;
  out.kneeZ = side * (lower - theta);
}
