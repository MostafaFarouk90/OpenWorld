/**
 * Body pitch (radians, positive = nose up) from the terrain under the front and the back of a quadruped:
 * samples `length / 2` ahead of and behind the feet along `yaw` (forward is -Z, as `forwardOf`).
 * Non-finite samples count as flat.
 */
export function slopePitch(
  heightAt: (x: number, z: number) => number,
  x: number,
  z: number,
  yaw: number,
  length: number,
): number {
  if (!(length > 0)) return 0;
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  const half = length / 2;
  const dy = heightAt(x + fx * half, z + fz * half) - heightAt(x - fx * half, z - fz * half);
  return Number.isFinite(dy) ? Math.atan2(dy, length) : 0;
}
