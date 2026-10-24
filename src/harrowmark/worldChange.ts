// The mini-ending world change ("Smoke Over Harrowmark"): banners over the Bastion and the Keep, and a lit brazier line
// on the Keep road. Derived from `story.gate.a2` through ctx.gates, so a load either way re-derives it.
import * as THREE from 'three';
import type { Anchor, CoreContext } from '../region/coreTypes';
import { HARROWMARK_LAYOUT } from './harrowmark.layout';

export const A2_FLAG = 'story.gate.a2';
/** Act 2's ending ("The Houses Stand") sets this once; it relights the Silver Fountain and reopens the closed stalls. */
export const A3_FLAG = 'story.gate.a3';

export interface WorldChange {
  readonly active: boolean;
  /** Counts of what is built right now (tests, debug). */
  counts(): { banners: number; braziers: number };
  /** The Act 2 change (`story.gate.a3`): the Silver Fountain runs, the closed market stalls stand open. */
  readonly act2: { readonly active: boolean; counts(): { fountainJets: number; stalls: number } };
  dispose(): void;
}

/** The Silver Fountain's basin (the layout's `fountain` structure) and the anchor whose height it shares. */
export const FOUNTAIN = { x: 8500, z: 1700, anchor: 'harrowmark.square.fountain', jets: 5 } as const;
export const STALL_PREFIX = 'guild.stall-';

const WATER = new THREE.MeshBasicMaterial({ color: 0x9fd6ee, transparent: true, opacity: 0.55 });
const AWNING = new THREE.MeshLambertMaterial({ color: 0xc8553a, side: THREE.DoubleSide });
const GOODS = new THREE.MeshLambertMaterial({ color: 0xd9a441 });

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

  // ---- Act 2: "The Houses Stand" (gate a3). A separate group, so each act's change builds and clears on its own flag.
  const root2 = new THREE.Group();
  root2.name = 'harrowmark-world-change-a3';
  const geometries2: THREE.BufferGeometry[] = [];
  let jets = 0;
  let stalls = 0;
  let active2 = false;

  const clear2 = (): void => {
    root2.removeFromParent();
    root2.clear();
    for (const g of geometries2.splice(0)) g.dispose();
    jets = 0;
    stalls = 0;
    active2 = false;
  };

  const build2 = (): void => {
    clear2();
    const track2 = <T extends THREE.BufferGeometry>(g: T): T => {
      geometries2.push(g);
      return g;
    };
    const y = ctx.anchors.find(FOUNTAIN.anchor)?.position.y ?? 0;
    // The fountain: a lit water surface in the basin, and a ring of jets around a tall centre column.
    const fountain = new THREE.Group();
    fountain.position.set(FOUNTAIN.x, y, FOUNTAIN.z);
    const surface = new THREE.Mesh(track2(new THREE.CylinderGeometry(5, 5, 0.1, 20)), WATER);
    surface.position.y = 1.15;
    fountain.add(surface);
    const column = new THREE.Mesh(track2(new THREE.CylinderGeometry(0.18, 0.3, 3.2, 8)), WATER);
    column.position.y = 2.7;
    fountain.add(column);
    jets++;
    const jetGeo = track2(new THREE.CylinderGeometry(0.08, 0.14, 1.8, 6));
    for (let k = 0; k < FOUNTAIN.jets - 1; k++) {
      const a = (k / (FOUNTAIN.jets - 1)) * Math.PI * 2;
      const jet = new THREE.Mesh(jetGeo, WATER);
      jet.position.set(Math.sin(a) * 3.4, 2.0, Math.cos(a) * 3.4);
      jet.rotation.set(Math.cos(a) * 0.35, 0, -Math.sin(a) * 0.35);
      fountain.add(jet);
      jets++;
    }
    root2.add(fountain);
    // The stalls: the shutters go up, an awning over the table and a heap of goods on it.
    const awningGeo = track2(new THREE.PlaneGeometry(4, 2.2));
    const goodsGeo = track2(new THREE.BoxGeometry(1.2, 0.35, 0.6));
    for (const s of HARROWMARK_LAYOUT.structures) {
      if (!s.id.startsWith(STALL_PREFIX)) continue;
      const g = new THREE.Group();
      g.position.set(s.x, y, s.z);
      g.rotation.y = (s.yawDeg * Math.PI) / 180;
      const awning = new THREE.Mesh(awningGeo, AWNING);
      awning.position.set(0, 2.7, 0);
      awning.rotation.x = -Math.PI / 2 + 0.25;
      const goods = new THREE.Mesh(goodsGeo, GOODS);
      goods.position.set(0, 1.0, 0);
      g.add(awning, goods);
      root2.add(g);
      stalls++;
    }
    ctx.scene.add(root2);
    active2 = true;
  };

  const off = ctx.gates.flag(A2_FLAG, (on) => (on ? build() : clear()));
  const off2 = ctx.gates.flag(A3_FLAG, (on) => (on ? build2() : clear2()));
  return {
    get active() {
      return active;
    },
    counts: () => ({ banners, braziers }),
    act2: {
      get active() {
        return active2;
      },
      counts: () => ({ fountainJets: jets, stalls }),
    },
    dispose() {
      off();
      off2();
      clear();
      clear2();
    },
  };
}
