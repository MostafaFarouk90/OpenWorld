// The Leap-gated points of interest and the Heartshard study: small props and inert `use` interactables. Quests listen
// to the core `interact` event for them (thread 6), so nothing happens here beyond the prompt.
import * as THREE from 'three';
import type { AnchorsApi, CoreContext } from './coreTypes';
import { greyMat } from './greybox';

export type PoiDeps = Pick<CoreContext, 'scene' | 'interaction'>;

export const POI_INTERACTABLES = [
  { id: 'use:poi-chapel-ledge', anchor: 'poi.leap.chapel-ledge', prop: 'cache' },
  { id: 'use:poi-reed-island', anchor: 'poi.leap.reed-island', prop: 'lore-stone' },
  { id: 'use:shard-study', anchor: 'chapel.shard-study', prop: null },
] as const;

function buildProp(kind: 'cache' | 'lore-stone'): THREE.Group {
  const g = new THREE.Group();
  g.name = kind;
  if (kind === 'cache') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.55), greyMat(0x7a5a3a));
    body.position.y = 0.25;
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.12, 0.6), greyMat(0x5a4028));
    lid.position.y = 0.56;
    g.add(body, lid);
  } else {
    const stone = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.6, 0.35), greyMat(0x8d8d8d));
    stone.position.y = 0.8;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.2, 0.28), greyMat(0x77746f));
    cap.position.y = 1.7;
    g.add(stone, cap);
  }
  return g;
}

export function buildPoiProps(deps: PoiDeps, anchors: AnchorsApi): { dispose(): void } {
  const cleanups: Array<() => void> = [];
  const group = new THREE.Group();
  group.name = 'poi-props';
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
    deps.scene.add(group);
    for (const poi of POI_INTERACTABLES) {
      const a = anchors.get(poi.anchor);
      if (poi.prop) {
        const prop = buildProp(poi.prop);
        prop.position.set(a.position.x, a.position.y, a.position.z);
        prop.rotation.y = a.yaw;
        group.add(prop);
      }
      cleanups.push(
        deps.interaction.register({
          id: poi.id,
          kind: 'use',
          position: (out) => out.set(a.position.x, a.position.y, a.position.z),
          radius: 2.5,
          promptKey: 'interact.use',
          onInteract() {},
        }),
      );
    }
  } catch (err) {
    dispose();
    throw err;
  }
  return { dispose };
}
