// The mini-ending world change ("Smoke Over Harrowmark"): banners over the Bastion and the Keep, and a lit brazier line
// on the Keep road. Derived from `story.gate.a2` through ctx.gates, so a load either way re-derives it.
import * as THREE from 'three';
import type { Anchor, CoreContext } from '../region/coreTypes';

export const A2_FLAG = 'story.gate.a2';

export interface WorldChange {
  readonly active: boolean;
  /** Counts of what is built right now (tests, debug). */
  counts(): { banners: number; braziers: number };
  dispose(): void;
}

const CLOTH = new THREE.MeshLambertMaterial({ color: 0xb8892b, side: THREE.DoubleSide });
const POLE = new THREE.MeshLambertMaterial({ color: 0x5a4632 });
const BOWL = new THREE.MeshLambertMaterial({ color: 0x3a3532 });
const FLAME = new THREE.MeshBasicMaterial({ color: 0xff8a2a });

export function buildWorldChange(ctx: Pick<CoreContext, 'scene' | 'anchors' | 'gates'>): WorldChange {
  const root = new THREE.Group();
  root.name = 'harrowmark-world-change';
  let banners = 0;
  let braziers = 0;
  let active = false;
  const geometries: THREE.BufferGeometry[] = [];

  const track = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };

  const clear = (): void => {
    root.removeFromParent();
    root.clear();
    for (const g of geometries.splice(0)) g.dispose();
    banners = 0;
    braziers = 0;
    active = false;
  };

  const byTag = (prefix: string): Anchor[] => ctx.anchors.withTag(prefix.split('.')[0]).filter((a) => a.id.startsWith(`harrowmark.${prefix}`));

  const build = (): void => {
    clear();
    // Banners hang on the building face: a pole across the top and a cloth drop in front of it.
    for (const anchor of byTag('banner')) {
      const g = new THREE.Group();
      g.position.copy(anchor.position as THREE.Vector3);
      g.rotation.y = anchor.yaw;
      const pole = new THREE.Mesh(track(new THREE.BoxGeometry(1.8, 0.12, 0.12)), POLE);
      pole.position.set(0, 0, -0.2);
      const cloth = new THREE.Mesh(track(new THREE.PlaneGeometry(1.3, 4)), CLOTH);
      cloth.position.set(0, -2.05, -0.25);
      g.add(pole, cloth);
      root.add(g);
      banners++;
    }
    // Braziers: a dark bowl on a post with an emissive flame. No point lights: the flames only glow.
    const bowlGeo = track(new THREE.CylinderGeometry(0.45, 0.3, 0.4, 8));
    const postGeo = track(new THREE.CylinderGeometry(0.08, 0.1, 1.1, 6));
    const flameGeo = track(new THREE.ConeGeometry(0.3, 0.8, 6));
    for (const anchor of byTag('brazier')) {
      const g = new THREE.Group();
      g.position.copy(anchor.position as THREE.Vector3);
      const post = new THREE.Mesh(postGeo, POLE);
      post.position.y = 0.55;
      const bowl = new THREE.Mesh(bowlGeo, BOWL);
      bowl.position.y = 1.3;
      const flame = new THREE.Mesh(flameGeo, FLAME);
      flame.position.y = 1.9;
      g.add(post, bowl, flame);
      root.add(g);
      braziers++;
    }
    ctx.scene.add(root);
    active = true;
  };

  const off = ctx.gates.flag(A2_FLAG, (on) => (on ? build() : clear()));
  return {
    get active() {
      return active;
    },
    counts: () => ({ banners, braziers }),
    dispose() {
      off();
      clear();
    },
  };
}
