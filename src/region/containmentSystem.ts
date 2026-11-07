// The containment push-back (contracts v0.6 item 4): a player outside the open area is put back at its nearest
// point, 1 m inside, with a toast. Runs at intent order -95, before the region tracker (-90) and the fog wall's own
// push (-80), so a closed region is never discovered. A mounted player stays mounted: the horse is the player's
// capsule, so the small teleport carries both (the mount ends a ride only on a jump over 5 m); near a closed edge a
// soft speed cap slows the horse instead of letting it hit the edge at a gallop.
import { MOUNT_TUNING } from '../mount/tuning';
import { heightAt as terrainHeight } from '../terrain/heightfield';
import { ACT3_CORRIDORS, ACT3_HOLES } from './act3Containment';
import { ACT4_CORRIDORS, ACT4_HOLES } from './act4Containment';
import { ACT5_HOLES, ACT5_KEEPINS } from './act5Containment';
import { Containment, DEAD_ROAD_CORRIDOR, type ContainmentService } from './containment';
import type { CoreContext } from './coreTypes';

export const CONTAINMENT_SYSTEM_ID = 'region.containment';
export const CONTAINMENT_TOAST_KEY = 'region.containment.toast';
/**
 * v0.8 (L1, playthrough L1): one toast per push episode. An episode starts at a push and ends once the player has been
 * open and unpushed this long (simulated seconds), so leaning on an edge toasts once however long it lasts; the 8 s
 * throttle this replaces toasted 11 times in 90 s of sliding along the Fen Road's corridor edge.
 */
export const CONTAINMENT_EPISODE_QUIET_SECONDS = 4;
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
  // v0.8: the Ash Road corridor and the Caldera hole (act4Containment.ts).
  // v0.9: the bowl floor's round hole and the siege's keep-in (act5Containment.ts).
  const containment = new Containment(ctx.state, [DEAD_ROAD_CORRIDOR, ...ACT3_CORRIDORS, ...ACT4_CORRIDORS], [...ACT3_HOLES, ...ACT4_HOLES, ...ACT5_HOLES]);
  const offs: (() => void)[] = [];
  for (const k of ACT5_KEEPINS) offs.push(containment.addKeepIn(k));
  offs.push(ctx.services.provide('containment', containment));
  // Seconds since the last push; an episode is over (and the next push toasts) once this reaches the quiet time.
  let sincePush = Infinity;
  let capOff: (() => void) | null = null;

  offs.push(
    ctx.systems.add({
      id: CONTAINMENT_SYSTEM_ID,
      fixedPhase: 'intent',
      order: -95,
      fixedUpdate(dt) {
        sincePush += dt;
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
        const newEpisode = sincePush >= CONTAINMENT_EPISODE_QUIET_SECONDS;
        sincePush = 0;
        // v0.9: a push out of a live keep-in toasts its own line (the siege's "Hold the gate").
        if (newEpisode) ctx.events.emit('hud.toast', { textKey: containment.pushToastKey(from.x, from.z) ?? CONTAINMENT_TOAST_KEY });
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
