// The slice fog gate (design 5.9): an ash-fall wall across the Dead Road at x 1100 that stands until its flag opens
// it. The wall is a translucent mesh with drifting ash, one long collider across the valley, a push-back for anyone
// who gets past it and the "Act 1 continues" trigger, all of which exist only while it stands. The state is derived
// through ctx.gates, so a loaded save applies it with no listener of our own.
import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d';
import { heightAt as terrainHeight } from '../terrain/heightfield';
import type { CoreContext } from './coreTypes';

/**
 * The wall stands until M05 is complete (thread 6 writes `story.m05.complete`, and Phase A saves already carry it).
 * `story.slice.harrowmarkOpen` was Phase A's stand-in: nothing writes it, and thread 21 retires its readers.
 */
export const FOG_OPEN_FLAGS: readonly string[] = ['story.m05.complete'];

/** Whether the wall is down for this state: the one check the map marker, the card and the wall itself share. */
export function fogOpen(state: { getFlag(key: string): unknown }): boolean {
  return FOG_OPEN_FLAGS.some((k) => Boolean(state.getFlag(k)));
}
export const FOG_TRIGGER_ID = 'trg.fog.harrowmark';
export const FOG_WALL_HALF_LENGTH = 500;
const COLLIDER_HALF_THICKNESS = 1.5;
const COLLIDER_SAMPLE_STEP = 20;
const COLLIDER_BELOW = 6;
const COLLIDER_ABOVE = 30;
const VISIBLE_HALF_WIDTH = 40;
const WALL_HEIGHT = 30;
const ASH_COUNT = 400;
/** A player found this far past the wall while it stands is put back (design 5.9's push-back). */
export const PUSH_BACK_PAST = 2;
export const PUSH_BACK_TO = 4;

export type FogWallDeps = Pick<CoreContext, 'scene' | 'physics' | 'gates' | 'triggers' | 'systems' | 'player'> & {
  rapier: Pick<typeof RAPIER, 'ColliderDesc'>;
};

export interface FogWallHandle {
  readonly standing: boolean;
  dispose(): void;
}

/**
 * The collider's vertical extent: from below the lowest ground along its whole length to well above the highest, so
 * no dip in the valley floor lets anyone walk under it. Pure.
 */
export function fogColliderExtent(heightAt: (x: number, z: number) => number, wall: { x: number; z: number }): { bottom: number; top: number } {
  let lo = Infinity;
  let hi = -Infinity;
  for (let dz = -FOG_WALL_HALF_LENGTH; dz <= FOG_WALL_HALF_LENGTH; dz += COLLIDER_SAMPLE_STEP) {
    for (const dx of [-COLLIDER_HALF_THICKNESS, 0, COLLIDER_HALF_THICKNESS]) {
      const h = heightAt(wall.x + dx, wall.z + dz);
      if (h < lo) lo = h;
      if (h > hi) hi = h;
    }
  }
  return { bottom: lo - COLLIDER_BELOW, top: hi + COLLIDER_ABOVE };
}

/** True when `x` is past the wall by enough to be pushed back. Pure. */
export function needsPushBack(playerX: number, wallX: number, playerZ = 0, wallZ = 0): boolean {
  return Number.isFinite(playerX) && Number.isFinite(playerZ) && playerX > wallX + PUSH_BACK_PAST && Math.abs(playerZ - wallZ) <= FOG_WALL_HALF_LENGTH;
}

export function buildFogWall(
  deps: FogWallDeps,
  wall: { x: number; z: number; y: number },
  openFlags: readonly string[] = FOG_OPEN_FLAGS,
  heightAt: (x: number, z: number) => number = terrainHeight,
): FogWallHandle {
  let standing = false;
  let group: THREE.Group | null = null;
  let collider: ReturnType<FogWallDeps['physics']['addStaticCollider']> | null = null;
  let removeTrigger: (() => void) | null = null;
  let removeSystem: (() => void) | null = null;
  let ash: THREE.Points | null = null;
  const disposables: Array<{ dispose(): void }> = [];

  const raise = (): void => {
    if (standing) return;
    standing = true;
    group = new THREE.Group();
    group.name = 'fog-wall';
    group.position.set(wall.x, wall.y, wall.z);
    const veilMat = new THREE.MeshBasicMaterial({ color: 0x8a8378, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
    const veilGeo = new THREE.PlaneGeometry(VISIBLE_HALF_WIDTH * 2, WALL_HEIGHT);
    const veil = new THREE.Mesh(veilGeo, veilMat);
    veil.rotation.y = Math.PI / 2; // spans Z, faces along X
    veil.position.y = WALL_HEIGHT / 2 - 2;
    veil.name = 'veil';
    group.add(veil);
    const pos = new Float32Array(ASH_COUNT * 3);
    for (let i = 0; i < ASH_COUNT; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 6;
      pos[i * 3 + 1] = Math.random() * WALL_HEIGHT;
      pos[i * 3 + 2] = (Math.random() - 0.5) * VISIBLE_HALF_WIDTH * 2;
    }
    const ashGeo = new THREE.BufferGeometry();
    ashGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const ashMat = new THREE.PointsMaterial({ color: 0xcfc8bc, size: 0.5, transparent: true, opacity: 0.8, depthWrite: false });
    ash = new THREE.Points(ashGeo, ashMat);
    ash.frustumCulled = false;
    ash.name = 'ash';
    group.add(ash);
    disposables.push(veilGeo, veilMat, ashGeo, ashMat);
    deps.scene.add(group);

    // One long box across the valley, sunk below the lowest ground along it. Its ends are not cliffs, so the
    // push-back below is what holds anyone who walks round them.
    const ext = fogColliderExtent(heightAt, wall);
    const desc = deps.rapier.ColliderDesc.cuboid(COLLIDER_HALF_THICKNESS, (ext.top - ext.bottom) / 2, FOG_WALL_HALF_LENGTH).setTranslation(wall.x, (ext.top + ext.bottom) / 2, wall.z);
    collider = deps.physics.addStaticCollider(desc);

    removeTrigger = deps.triggers.add({
      id: FOG_TRIGGER_ID,
      who: 'player',
      shape: { type: 'sphere', center: { x: wall.x - 12, y: wall.y, z: wall.z }, radius: 8 },
    });
    removeSystem = deps.systems.add({
      id: 'fog-wall',
      fixedPhase: 'intent',
      order: -80,
      fixedUpdate(dt) {
        const feet = deps.player.feet;
        if (needsPushBack(feet.x, wall.x, feet.z, wall.z)) {
          const x = wall.x - PUSH_BACK_TO;
          deps.player.teleport({ x, y: Math.max(feet.y, heightAt(x, feet.z)) + 0.1, z: feet.z });
        }
        if (ash) {
          const p = ash.geometry.getAttribute('position') as THREE.BufferAttribute;
          for (let i = 0; i < ASH_COUNT; i++) {
            const y = p.getY(i) + dt * 1.2;
            p.setY(i, y > WALL_HEIGHT ? 0 : y);
          }
          p.needsUpdate = true;
        }
      },
    });
  };

  const lower = (): void => {
    if (!standing) return;
    standing = false;
    removeSystem?.();
    removeSystem = null;
    removeTrigger?.();
    removeTrigger = null;
    if (collider) deps.physics.removeCollider(collider);
    collider = null;
    disposables.splice(0).forEach((d) => d.dispose());
    group?.removeFromParent();
    group?.clear();
    group = null;
    ash = null;
  };

  const off = deps.gates.watch(
    (s) => openFlags.some((f) => Boolean(s.getFlag(f))),
    (open) => (open ? lower() : raise()),
    { keys: openFlags },
  );
  return {
    get standing() {
      return standing;
    },
    dispose() {
      off();
      lower();
    },
  };
}
