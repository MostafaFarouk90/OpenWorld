// Props: the bakery barrel chest, the hearth-stone pickup (M02), the notice-board use point and the T02 banners.
import * as THREE from 'three';
import type { AnchorsApi, CoreContext } from './coreTypes';
import { greyMat } from './greybox';
import type { ChestOptions, Disposable } from './StructureBuilder';

export type PropsDeps = Pick<CoreContext, 'scene' | 'interaction' | 'state' | 'events' | 'services'> & {
  createChest: (opts: ChestOptions) => Disposable;
};

export interface PropsHandle {
  dispose(): void;
}

export const BARREL_ANCHOR = 'kettlewick.barrel';
export const HEARTH_STONE_ANCHOR = 'kettlewick.bakery-hearth';
export const NOTICE_BOARD_ANCHOR = 'kettlewick.notice-board';

/**
 * Quests (thread 3) say which objective is current; until that service is on main, or if its plugin failed,
 * the stone stays untouchable rather than risk being taken early.
 */
function m02StoneObjectiveIsCurrent(services: PropsDeps['services']): boolean {
  const quests = (services as unknown as { get(name: string): unknown }).get('quests') as
    | { isObjectiveCurrent?(questId: string, objectiveId: string): boolean }
    | undefined;
  try {
    return quests?.isObjectiveCurrent?.('m02', 'o2') === true;
  } catch {
    return false;
  }
}

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

    // Hearth stone on the bakery hearth.
    const stone = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.18),
      new THREE.MeshStandardMaterial({ color: 0xd9a441, emissive: 0xd9a441, emissiveIntensity: 0.3, flatShading: true }),
    );
    stone.name = 'hearth-stone';
    stone.position.set(stoneAnchor.position.x, stoneAnchor.position.y + 0.2, stoneAnchor.position.z);
    group.add(stone);
    cleanups.push(() => (stone.material as THREE.Material).dispose());
    // The hearth stone: M02's "bring the stone" objective. It can only be taken while that objective is the
    // current one (thread 3's quests service), so pressing F on it during T03/T12 changes nothing.
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
        enabled: () => !taken && m02StoneObjectiveIsCurrent(deps.services),
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

    // T02 look targets: cloth banners on the chapel's west face, one per `banner` anchor.
    for (const a of anchors.withTag('banner')) {
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1, 2.4), new THREE.MeshStandardMaterial({ color: 0xb02a2a, side: THREE.DoubleSide, flatShading: true }));
      cloth.name = `banner:${a.id}`;
      cloth.position.set(a.position.x, a.position.y, a.position.z);
      cloth.rotation.y = a.yaw;
      group.add(cloth);
      cleanups.push(() => (cloth.material as THREE.Material).dispose());
    }
  } catch (err) {
    dispose();
    throw err;
  }
  return { dispose };
}
