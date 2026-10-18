// Inert M01/M02 props: the bakery barrel chest, the hearth-stone pickup and the notice-board use point.
import * as THREE from 'three';
import type { AnchorsApi, CoreContext } from './coreTypes';
import { greyMat } from './greybox';
import type { ChestOptions, Disposable } from './localDoor';

export type PropsDeps = Pick<CoreContext, 'scene' | 'interaction' | 'state' | 'events'> & {
  createChest: (opts: ChestOptions) => Disposable;
};

export interface PropsHandle {
  dispose(): void;
}

export const BARREL_ANCHOR = 'kettlewick.barrel';
export const HEARTH_STONE_ANCHOR = 'kettlewick.bakery-hearth';
export const NOTICE_BOARD_ANCHOR = 'kettlewick.notice-board';

export function buildProps(deps: PropsDeps, anchors: AnchorsApi): PropsHandle {
  const cleanups: Array<() => void> = [];
  const group = new THREE.Group();
  group.name = 'props';
  let disposed = false;
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    for (const c of cleanups.splice(0).reverse()) {
      try {
        c();
      } catch {
        /* keep tearing down */
      }
    }
    group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
    group.removeFromParent();
  };

  try {
    const barrelAnchor = anchors.get(BARREL_ANCHOR);
    const stoneAnchor = anchors.get(HEARTH_STONE_ANCHOR);
    const boardAnchor = anchors.get(NOTICE_BOARD_ANCHOR);
    deps.scene.add(group);

    // Barrel chest.
    const barrel = new THREE.Group();
    barrel.name = 'barrel';
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.36, 0.9, 10), greyMat(0x7a5a3a));
    body.position.y = 0.45;
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.06, 10), greyMat(0x5a4028));
    lid.name = 'lid';
    lid.position.y = 0.93;
    barrel.add(body, lid);
    barrel.position.set(barrelAnchor.position.x, barrelAnchor.position.y, barrelAnchor.position.z);
    group.add(barrel);
    barrel.updateMatrixWorld(true);
    const chest = deps.createChest({
      id: 'chest:bakery-barrel',
      object: barrel,
      loot: [{ itemId: 'healing-flask', count: 1 }],
    });
    cleanups.push(() => chest.dispose());

    // Hearth stone pickup.
    const stone = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.18),
      new THREE.MeshStandardMaterial({ color: 0xd9a441, emissive: 0xd9a441, emissiveIntensity: 0.3, flatShading: true }),
    );
    stone.name = 'hearth-stone';
    stone.position.set(stoneAnchor.position.x, stoneAnchor.position.y + 0.2, stoneAnchor.position.z);
    group.add(stone);
    cleanups.push(() => (stone.material as THREE.Material).dispose());
    const stoneFlag = 'pickup.hearth-stone.taken';
    let taken = deps.state.getBool(stoneFlag);
    stone.visible = !taken;
    cleanups.push(
      deps.interaction.register({
        id: 'pickup:hearth-stone',
        kind: 'pickup',
        position: (out) => out.set(stoneAnchor.position.x, stoneAnchor.position.y, stoneAnchor.position.z),
        radius: 2,
        promptKey: 'interact.pickup',
        enabled: () => !taken,
        onInteract() {
          if (taken || disposed) return;
          taken = true;
          deps.state.setFlag(stoneFlag, true);
          stone.visible = false;
          deps.events.emit('loot.granted', {
            sourceId: 'pickup:hearth-stone',
            items: [{ itemId: 'hearth-stone', count: 1 }],
          });
        },
      }),
    );
    cleanups.push(
      deps.events.on('save.loaded', () => {
        taken = deps.state.getBool(stoneFlag);
        stone.visible = !taken;
      }),
    );

    // Notice board: quests listen to the core `interact` event, so there is nothing to do here.
    cleanups.push(
      deps.interaction.register({
        id: 'use:notice-board',
        kind: 'use',
        position: (out) => out.set(boardAnchor.position.x, boardAnchor.position.y, boardAnchor.position.z),
        radius: 2.5,
        promptKey: 'interact.use',
        onInteract() {},
      }),
    );
  } catch (err) {
    dispose();
    throw err;
  }
  return { dispose };
}
