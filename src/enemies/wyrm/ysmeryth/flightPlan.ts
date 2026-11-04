import { FlightPath, type PathPoint } from '../large/flightPath';
import { YSMERYTH } from './def';

/**
 * Ysmeryth's flights between rounds (plans/act3-K6a-pr2.md 1.3). Points are world x, z with `y` the altitude above the
 * ground under them (the overlay draws it as the body's altitude), so the paths need no heightfield.
 */
export interface XZ {
  x: number;
  z: number;
}

const LOOP_POINTS = 8;

/**
 * One loop of the arena: from `from` (at `fromAlt`) up onto the circle of `loopRadius` round `centre`, entering at the
 * angle nearest `from`, once round (counter-clockwise from above), ending at the entry point at `loopAltitude`.
 */
export function loopPath(from: XZ, fromAlt: number, centre: XZ): FlightPath {
  const r = YSMERYTH.loopRadius;
  const alt = YSMERYTH.loopAltitude;
  const a0 = Math.atan2(from.z - centre.z, from.x - centre.x);
  const pts: PathPoint[] = [{ x: from.x, y: Math.max(0, fromAlt), z: from.z }];
  for (let i = 0; i <= LOOP_POINTS; i++) {
    const a = a0 + (i / LOOP_POINTS) * Math.PI * 2;
    // The first point is the climb's end (a little lower), the rest ride the loop altitude.
    pts.push({ x: centre.x + Math.cos(a) * r, y: i === 0 ? alt * 0.75 : alt, z: centre.z + Math.sin(a) * r });
  }
  return new FlightPath(pts);
}

/** The approach: from the current point and altitude down onto the landing mark (altitude 0). */
export function landPath(from: XZ, fromAlt: number, land: XZ): FlightPath {
  const mid = { x: from.x + (land.x - from.x) * 0.66, z: from.z + (land.z - from.z) * 0.66 };
  const pts: PathPoint[] = [
    { x: from.x, y: Math.max(0, fromAlt), z: from.z },
    { x: mid.x, y: Math.max(0, fromAlt) * 0.45, z: mid.z },
    { x: land.x, y: 0, z: land.z },
  ];
  // A landing from right above the mark: a short vertical drop still needs two distinct points.
  if (Math.hypot(land.x - from.x, land.z - from.z) < 0.5 && fromAlt < 0.5) pts.splice(1, 1, { x: land.x, y: 0.5, z: land.z + 0.5 });
  return new FlightPath(pts);
}

/** Leaving after the trial: up and away from the player, `distance` metres out, climbing to 30 m. */
export function leavePath(from: XZ, fromAlt: number, awayFrom: XZ, distance: number): FlightPath {
  let dx = from.x - awayFrom.x;
  let dz = from.z - awayFrom.z;
  const l = Math.hypot(dx, dz);
  if (l < 1e-3) {
    dx = 0;
    dz = 1;
  } else {
    dx /= l;
    dz /= l;
  }
  return new FlightPath([
    { x: from.x, y: Math.max(0, fromAlt), z: from.z },
    { x: from.x + dx * distance * 0.3, y: 14, z: from.z + dz * distance * 0.3 },
    { x: from.x + dx * distance, y: 30, z: from.z + dz * distance },
  ]);
}

/** The loop's walking speed so one loop takes about `loopSeconds`, never above the flight cap. */
export function loopSpeed(path: FlightPath): number {
  return Math.min(YSMERYTH.flySpeed, path.length / YSMERYTH.loopSeconds);
}

/** The approach speed: fast enough that she is down within `landWithin` of the call, never above the cap. */
export function landSpeed(path: FlightPath): number {
  return Math.min(YSMERYTH.flySpeed, Math.max(10, path.length / (YSMERYTH.landWithin * 0.7)));
}
