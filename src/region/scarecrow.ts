// The T02 scarecrow: a neutral, mortal actor with capsule hurtboxes on a tiny named Object3D rig.
import * as THREE from 'three';
import { HurtboxSet } from '../combat/HurtboxSet';
import type { HurtboxDef } from '../combat/types';
import type { ActorLike, Anchor, CoreContext } from './coreTypes';
import { greyMat } from './greybox';

export type ScarecrowDeps = Pick<CoreContext, 'scene' | 'actors' | 'combat' | 'events' | 'systems' | 'state'>;

/** Set when the T01 scarecrow is knocked down, so a reload past T01 does not stand it up again. */
export const SCARECROW_TOPPLED_FLAG = 'place.scarecrow.toppled';

export const TOPPLE_SECONDS = 0.6;

/** Capsules are in each rig node's local space. */
export const SCARECROW_DEFS: HurtboxDef[] = [
  { name: 'head', bone: 'sc-head', start: { x: 0, y: -0.05, z: 0 }, end: { x: 0, y: 0.05, z: 0 }, radius: 0.3 },
  { name: 'torso', bone: 'sc-torso', start: { x: 0, y: -0.4, z: 0 }, end: { x: 0, y: 0.35, z: 0 }, radius: 0.24 },
  { name: 'armL', bone: 'sc-arm-l', start: { x: 0, y: 0, z: 0 }, end: { x: -0.75, y: 0, z: 0 }, radius: 0.13 },
  { name: 'armR', bone: 'sc-arm-r', start: { x: 0, y: 0, z: 0 }, end: { x: 0.75, y: 0, z: 0 }, radius: 0.13 },
];

export interface ScarecrowHandle {
  actor: ActorLike;
  root: THREE.Object3D;
  dispose(): void;
}

const mesh = (g: THREE.BufferGeometry, color: number, x: number, y: number, z: number): THREE.Mesh => {
  const m = new THREE.Mesh(g, greyMat(color));
  m.position.set(x, y, z);
  return m;
};

function buildMesh(): { root: THREE.Group; rig: THREE.Group } {
  const root = new THREE.Group();
  root.name = 'scarecrow';
  // The rig rotates about the base when it topples.
  const rig = new THREE.Group();
  rig.name = 'sc-rig';
  const node = (name: string, y: number, x = 0): THREE.Object3D => {
    const o = new THREE.Object3D();
    o.name = name;
    o.position.set(x, y, 0);
    rig.add(o);
    return o;
  };
  rig.add(mesh(new THREE.BoxGeometry(0.5, 0.25, 0.5), 0x6b4a2b, 0, 0.125, 0)); // short post base
  rig.add(mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.9, 6), 0x6b4a2b, 0, 0.95, 0)); // pole
  rig.add(mesh(new THREE.BoxGeometry(1.5, 0.08, 0.08), 0x6b4a2b, 0, 1.5, 0)); // cross arm
  const torso = node('sc-torso', 1.2);
  torso.add(mesh(new THREE.BoxGeometry(0.5, 0.7, 0.3), 0xc9a45c, 0, 0, 0));
  const head = node('sc-head', 1.85);
  head.add(mesh(new THREE.SphereGeometry(0.25, 8, 6), 0xb59a6a, 0, 0, 0)); // sack head
  head.add(mesh(new THREE.CylinderGeometry(0.18, 0.4, 0.06, 10), 0xd2b25a, 0, 0.2, 0)); // hat brim
  head.add(mesh(new THREE.ConeGeometry(0.2, 0.3, 8), 0xd2b25a, 0, 0.38, 0)); // hat crown
  node('sc-arm-l', 1.5);
  node('sc-arm-r', 1.5);
  root.add(rig);
  return { root, rig };
}

export function spawnScarecrow(
  deps: ScarecrowDeps,
  anchor: Pick<Anchor, 'position' | 'yaw'>,
  _heightAt?: (x: number, z: number) => number,
): ScarecrowHandle {
  const { root, rig } = buildMesh();
  root.position.set(anchor.position.x, anchor.position.y, anchor.position.z);
  root.rotation.y = anchor.yaw ?? 0;
  deps.scene.add(root);
  root.updateMatrixWorld(true);

  const actor = deps.actors.spawn({ kind: 'scarecrow', team: 'neutral', maxHealth: 20, hittable: true, root, owner: root });
  actor.data.audio = { material: 'straw' };
  let hurtboxes: HurtboxSet | null = null;
  let removeTarget: (() => void) | null = null;
  let died = false;
  let toppled = false;
  let disposed = false;
  let removeSystem: (() => void) | null = null;
  let offDied: (() => void) | null = null;
  let actorGone = false;

  const dropHurtboxes = (): void => {
    if (!hurtboxes) return;
    removeTarget?.();
    removeTarget = null;
    hurtboxes.dispose();
    hurtboxes = null;
  };
  const despawn = (): void => {
    if (actorGone) return;
    actorGone = true;
    deps.actors.despawn(actor.id);
  };

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    offDied?.();
    removeSystem?.();
    removeSystem = null;
    dropHurtboxes();
    despawn();
    root.removeFromParent();
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
  };

  try {
    hurtboxes = new HurtboxSet(root, SCARECROW_DEFS, root);
    // With the actor id the core also removes the target when the actor despawns.
    removeTarget = deps.combat.addTarget(hurtboxes, actor.id);
    offDied = deps.events.on('actor.died', (p: { actorId?: string } | undefined) => {
      if (disposed || died || p?.actorId !== actor.id) return;
      died = true;
      deps.state.setFlag(SCARECROW_TOPPLED_FLAG, true);
      dropHurtboxes();
      let t = 0;
      removeSystem = deps.systems.add({
        id: `scarecrow-topple:${actor.id}`,
        fixedPhase: 'animation',
        order: 160,
        fixedUpdate(dt) {
          if (toppled) return;
          t = Math.min(TOPPLE_SECONDS, t + dt);
          const k = t / TOPPLE_SECONDS;
          rig.rotation.x = (Math.PI / 2) * k * k;
          if (t >= TOPPLE_SECONDS) {
            toppled = true;
            despawn();
            removeSystem?.();
            removeSystem = null;
          }
        },
      });
    });
  } catch (err) {
    dispose();
    throw err;
  }
  return { actor, root, dispose };
}
