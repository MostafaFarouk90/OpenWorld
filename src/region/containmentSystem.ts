// The containment push-back (contracts v0.6 item 4): a player outside the open area is put back at its nearest
// point, 1 m inside, with a toast. Runs at intent order -95, before the region tracker (-90) and the fog wall's own
// push (-80), so a closed region is never discovered. A mounted player stays mounted: the horse is the player's
// capsule, so the small teleport carries both (the mount ends a ride only on a jump over 5 m); near a closed edge a
// soft speed cap slows the horse instead of letting it hit the edge at a gallop.
import { MOUNT_TUNING } from '../mount/tuning';
import { heightAt as terrainHeight } from '../terrain/heightfield';
import { ACT3_CORRIDORS, ACT3_HOLES } from './act3Containment';
import { Containment, DEAD_ROAD_CORRIDOR, type ContainmentService } from './containment';
import type { CoreContext } from './coreTypes';

export const CONTAINMENT_SYSTEM_ID = 'region.containment';
export const CONTAINMENT_TOAST_KEY = 'region.containment.toast';
/** One toast at most this often (simulated seconds), however often the player leans on the edge. */
export const CONTAINMENT_TOAST_SECONDS = 8;
/** The mount's soft cap starts this far from a closed edge, falling to `EDGE_CAP_MIN` at the edge. */
export const EDGE_CAP_METRES = 20;
export const EDGE_CAP_MIN = MOUNT_TUNING.walkSpeed;

/** The horse's speed cap at `distance` metres from the nearest closed point. Pure. */
export function edgeSpeedCap(distance: number): number {
  if (!(distance < EDGE_CAP_METRES)) return Infinity;
  const k = Math.max(0, distance) / EDGE_CAP_METRES;
  return EDGE_CAP_MIN + (MOUNT_TUNING.gallopSpeed - EDGE_CAP_MIN) * k;
}

export interface InstalledContainment {
  service: ContainmentService;
  dispose(): void;
}

/** Provides `containment` and adds the push-back system; `heightAt` is the terrain's (tests pass a flat one). */
export function installContainment(
  ctx: Pick<CoreContext, 'state' | 'services' | 'systems' | 'player' | 'events'>,
  heightAt: (x: number, z: number) => number = terrainHeight,
): InstalledContainment {
  // v0.7: the Act 3 corridors and the summit hole are registered here, closed until their conditions hold.
  const containment = new Containment(ctx.state, [DEAD_ROAD_CORRIDOR, ...ACT3_CORRIDORS], ACT3_HOLES);
  const offs: (() => void)[] = [];
  offs.push(ctx.services.provide('containment', containment));
  let sinceToast = Infinity;
  let capOff: (() => void) | null = null;

  offs.push(
    ctx.systems.add({
      id: CONTAINMENT_SYSTEM_ID,
      fixedPhase: 'intent',
      order: -95,
      fixedUpdate(dt) {
        sinceToast += dt;
        if (!capOff) {
          const mount = ctx.services.get('mount');
          if (mount) capOff = mount.addSpeedCap((x, z) => edgeSpeedCap(containment.edgeDistance(x, z, EDGE_CAP_METRES)));
        }
        // Interiors float 150 m up at their door's x, z; loads and waystone travel move the player over many ticks.
        if (ctx.services.get('interiors')?.current) return;
        if (ctx.services.get('save')?.loading || ctx.services.get('waystones')?.travelling) return;
        if (ctx.player.actor?.dead) return;
        const feet = ctx.player.feet;
        if (containment.isOpen(feet.x, feet.z)) return;
        const q = containment.nearestOpen(feet.x, feet.z);
        const from = { x: feet.x, y: feet.y, z: feet.z };
        const to = { x: q.x, y: Math.max(feet.y, heightAt(q.x, q.z)) + 0.1, z: q.z };
        ctx.player.teleport(to);
        // v0.7: K7's glide ends on it (`glide.ended { reason: 'contained' }`).
        ctx.events.emit('containment.pushed', { from, to });
        if (sinceToast >= CONTAINMENT_TOAST_SECONDS) {
          sinceToast = 0;
          ctx.events.emit('hud.toast', { textKey: CONTAINMENT_TOAST_KEY });
        }
      },
    }),
  );

  return {
    service: containment,
    dispose() {
      capOff?.();
      capOff = null;
      for (const off of offs.splice(0)) off();
    },
  };
}
