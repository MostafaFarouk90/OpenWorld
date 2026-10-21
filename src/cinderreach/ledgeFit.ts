// Where the Leap ledges stand: the nearest ground to the wanted spot where the ledge is climbable from its launch point.
import { heightAt } from '../terrain/heightfield';
import { footprintSpread } from './siteFit';

/** Ledge top above its own ground: the Leap clears 1.8 m, so the rise from the launch point must stay at or under it. */
export const LEDGE_HEIGHT = 1.8;
export const LAUNCH_BACK = 5.5;
export function ledgeRise(cx: number, cz: number): number {
  let hi = -Infinity;
  for (let dx = -3; dx <= 3; dx += 1.5) for (let dz = -2.5; dz <= 2.5; dz += 1.25) hi = Math.max(hi, heightAt(cx + dx, cz + dz));
  return hi + LEDGE_HEIGHT - heightAt(cx, cz - LAUNCH_BACK);
}

/**
 * Moves a wanted ledge spot to the nearest ground where the ledge is climbable from its launch point: a level footprint and
 * a level launch strip, with the top 1.5 to 1.8 m above the launch ground (the Act 1 ledges sit on level ground).
 */
export function fitLedge(wantX: number, wantZ: number): { x: number; z: number } {
  for (let r = 0; r <= 60; r += 2) {
    for (let k = 0; k < Math.max(1, r * 2); k++) {
      const ang = (k / Math.max(1, r * 2)) * Math.PI * 2;
      const x = Math.round(wantX + Math.cos(ang) * r);
      const z = Math.round(wantZ + Math.sin(ang) * r);
      const rise = ledgeRise(x, z);
      if (rise < 1.5 || rise > LEDGE_HEIGHT + 0.001) continue;
      if (footprintSpread(heightAt, x, z, 6, 5) > 0.4) continue;
      if (footprintSpread(heightAt, x, z - LAUNCH_BACK, 4, 4) > 0.5) continue;
      return { x, z };
    }
  }
  throw new Error(`cinderreach: no climbable ledge ground near (${wantX}, ${wantZ})`);
}

