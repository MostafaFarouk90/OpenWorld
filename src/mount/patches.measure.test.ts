import { describe, expect, it } from 'vitest';
import { FIXED_TIMESTEP } from '../config/constants';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { TerrainColliders } from '../world/TerrainColliders';
import { MOUNT_TUNING as T } from './tuning';

/**
 * The slice plan's collider-patch timing check for the mount (thread 20). Skipped in the normal run; use:
 *   MEASURE_MOUNT_PATCHES=1 npx vitest run src/mount/patches.measure.test.ts
 * Rides 90 s at the 12 m/s gallop across the real heightfield with the game's patch size, cells and 2 ms build
 * budget, and counts the ticks on which the ground 30 m ahead was not resident yet (the ride caps to 7.5 m/s then).
 */
describe.skipIf(!(globalThis as any).process?.env?.MEASURE_MOUNT_PATCHES)('mount: collider patches at the gallop', () => {
  it('measures the build time and the ticks with unbuilt ground ahead', async () => {
    const physics = new PhysicsWorld();
    await physics.init();
    const colliders = new TerrainColliders(physics);
    let x = 0;
    const z = 0;
    let unresident = 0;
    let worst = 0;
    const ticks = Math.round(90 / FIXED_TIMESTEP);
    for (let i = 0; i < ticks; i++) {
      const t0 = performance.now();
      colliders.update(x, z);
      worst = Math.max(worst, performance.now() - t0);
      if (!colliders.isResident(x + T.residentLookahead, z)) unresident++;
      x += T.gallopSpeed * FIXED_TIMESTEP;
    }
    console.log(`mount patches: ${ticks} ticks over ${x.toFixed(0)} m, worst update ${worst.toFixed(2)} ms, ${unresident} ticks with the ground ${T.residentLookahead} m ahead unbuilt`);
    expect(Number.isFinite(worst)).toBe(true);
  }, 120_000);
});
