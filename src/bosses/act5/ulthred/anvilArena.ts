// The Anvil of Ages' greybox arena for D10 phases 2 and 3 (ruling A, plans/act5-N6.md "PR 2 build notes"): until N1 PR 2 builds
// the real island set, these stand-ins sit at N1's positions (`ANVIL_ISLAND`: centre 11000, 8000, top 160, flat to r 30). N1
// replaces them in place by exporting a `buildAnvilArena(ctx)` with this shape; nothing else in the fight changes.
//   - the drop anchor `caldera.anvil.arena.drop` (defined here only if N1 has not), 6 m south of the centre, ground + 0.05;
//   - four platform slabs (6 x 8 m, 0.35 m deck) at r 16 on N0's spin paths about the centre, for N3's TurningPlatforms;
//   - three crack-anvils (1.2 x 1 x 2 m blocks) at r 26, 120 degrees apart;
//   - ten spirit-flame posts at r 28 (a flame mesh each, hidden until lit).
import * as THREE from 'three';
import { ANVIL_ISLAND } from '../../../caldera/calderaSites';
import type { PlatformItem } from '../../../caldera/arenaKit';
import type { GameContext } from '../../../core/Game';
import { heightAt } from '../../../terrain/heightfield';
import { DROP_ANCHOR, LOOK } from './tuning';
import { envModelLibraryFor } from '../../../env/envStructureArt';
import { dressAnvilArena } from '../../../caldera/env/anvilArenaArt';

export const ANVIL_ARENA_LAYOUT = {
  dropR: 6,
  platformR: 16,
  platformCount: 4,
  platformSize: { x: 6, y: 0.35, z: 8 },
  anvilR: 26,
  anvilAngles: [0, 120, 240] as readonly number[],
  anvilSize: { x: 1.2, y: 1, z: 2 },
  flameR: 28,
  flameCount: 10,
  /**
   * The fight's floor: Cael counts as on the Anvil within this radius of the centre and 6 m of its height. It reaches past N1's
   * rim lips (r 50, src/caldera/calderaSites.ts), so a lava throw to a lip is not leaving the fight.
   */
  arenaR: 54,
} as const;

export interface AnvilArena {
  /** The island's centre at ground height (the platforms' pivot). */
  readonly centre: THREE.Vector3;
  readonly dropAnchor: string;
  /** Platform bodies and meshes for TurningPlatforms (empty when physics is absent: headless tests). */
  readonly platforms: readonly PlatformItem[];
  readonly anvils: readonly THREE.Vector3[];
  readonly flamePosts: readonly THREE.Vector3[];
  /** The anvil's cracked look (and back on a reset). */
  setAnvilCracked(index: number, cracked: boolean): void;
  /** Lights the first `n` flame posts (0 hides all). */
  setFlames(n: number): void;
  /** On the Anvil's fight floor. */
  onArena(feet: THREE.Vector3Like): boolean;
  dispose(): void;
}

const polar = (cx: number, cz: number, deg: number, r: number): [number, number] => {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.sin(a), cz - r * Math.cos(a)];
};

export function buildAnvilArena(ctx: GameContext, warn: (m: string) => void = () => {}): AnvilArena {
  const L = ANVIL_ARENA_LAYOUT;
  const [cx, cz] = ANVIL_ISLAND.centre;
  const g = (x: number, z: number): number => {
    const h = heightAt(x, z);
    return Number.isFinite(h) ? h : ANVIL_ISLAND.top;
  };
  const centre = new THREE.Vector3(cx, g(cx, cz), cz);
  const offs: (() => void)[] = [];
  const group = new THREE.Group();
  group.name = 'ulthred-anvil-arena';
  ctx.scene.add(group);
  offs.push(() => group.removeFromParent());
  const stone = new THREE.MeshStandardMaterial({ color: 0x3a3330, roughness: 0.9 });
  const iron = new THREE.MeshStandardMaterial({ color: 0x2a2624, roughness: 0.5, metalness: 0.6, emissive: new THREE.Color(0x200800) });
  const cracked = new THREE.MeshStandardMaterial({ color: 0x1a1412, roughness: 0.9, emissive: new THREE.Color(LOOK.ember), emissiveIntensity: 0.6 });
  const flameMat = new THREE.MeshBasicMaterial({ color: LOOK.fire, transparent: true, opacity: 0.85 });
  offs.push(() => [stone, iron, cracked, flameMat].forEach((m) => m.dispose()));

  // The drop anchor (N1's own wins when it exists).
  const [dx, dz] = [cx, cz + L.dropR];
  if (!ctx.anchors.find(DROP_ANCHOR)) {
    try {
      offs.push(ctx.anchors.define({ id: DROP_ANCHOR, position: { x: dx, y: g(dx, dz) + 0.05, z: dz }, yaw: 0, tags: ['arena'] }));
    } catch (err) {
      warn(`could not define ${DROP_ANCHOR} (${String(err)})`);
    }
  }

  // Platforms: kinematic bodies at the pivot, each collider offset to its slab (N3's devRig pattern).
  const platforms: PlatformItem[] = [];
  const slabs: THREE.Mesh[] = [];
  const physics = (ctx as Partial<GameContext>).physics;
  for (let k = 0; k < L.platformCount; k++) {
    const deg = 45 + (360 / L.platformCount) * k;
    const a = (deg * Math.PI) / 180;
    const ox = L.platformR * Math.sin(a);
    const oz = -L.platformR * Math.cos(a);
    const top = Math.max(g(cx + ox, cz + oz), centre.y) + L.platformSize.y;
    const mesh = new THREE.Group();
    mesh.name = `ulthred-anvil-platform-${k + 1}`;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(L.platformSize.x, L.platformSize.y, L.platformSize.z), iron);
    slab.position.set(ox, top - centre.y - L.platformSize.y / 2, oz);
    slab.rotation.y = -a;
    mesh.add(slab);
    slabs.push(slab);
    mesh.position.copy(centre);
    group.add(mesh);
    offs.push(() => slab.geometry.dispose());
    if (!physics?.world) continue;
    try {
      const body = physics.world.createRigidBody(physics.rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(centre.x, centre.y, centre.z));
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a);
      const col = physics.world.createCollider(
        physics.rapier.ColliderDesc.cuboid(L.platformSize.x / 2, L.platformSize.y / 2, L.platformSize.z / 2)
          .setTranslation(ox, top - centre.y - L.platformSize.y / 2, oz)
          .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }),
        body,
      );
      offs.push(() => {
        physics.world.removeCollider(col, false);
        physics.world.removeRigidBody(body);
      });
      platforms.push({ id: `caldera.anvil.ring.${k + 1}`, body, mesh });
    } catch (err) {
      warn(`platform ${k + 1} could not be built (${String(err)})`);
    }
  }

  // Crack-anvils: static blocks with colliders.
  const anvils: THREE.Vector3[] = [];
  const anvilMeshes: THREE.Mesh[] = [];
  const anvilGeo = new THREE.BoxGeometry(L.anvilSize.x, L.anvilSize.y, L.anvilSize.z);
  offs.push(() => anvilGeo.dispose());
  for (const deg of L.anvilAngles) {
    const [x, z] = polar(cx, cz, deg, L.anvilR);
    const y = g(x, z);
    const at = new THREE.Vector3(x, y, z);
    anvils.push(at);
    const m = new THREE.Mesh(anvilGeo, iron);
    m.name = `ulthred-crack-anvil-${anvils.length}`;
    m.position.set(x, y + L.anvilSize.y / 2, z);
    m.rotation.y = (-deg * Math.PI) / 180;
    group.add(m);
    anvilMeshes.push(m);
    if (physics?.addStaticCollider) {
      try {
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), m.rotation.y);
        const col = physics.addStaticCollider(
          physics.rapier.ColliderDesc.cuboid(L.anvilSize.x / 2, L.anvilSize.y / 2, L.anvilSize.z / 2)
            .setTranslation(x, y + L.anvilSize.y / 2, z)
            .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }),
        );
        offs.push(() => physics.removeCollider(col));
      } catch (err) {
        warn(`anvil collider failed (${String(err)})`);
      }
    }
  }

  // Flame posts.
  const flamePosts: THREE.Vector3[] = [];
  const flames: THREE.Mesh[] = [];
  const posts: THREE.Mesh[] = [];
  const postGeo = new THREE.CylinderGeometry(0.18, 0.24, 1.6, 8);
  const flameGeo = new THREE.ConeGeometry(0.35, 0.9, 8);
  offs.push(() => {
    postGeo.dispose();
    flameGeo.dispose();
  });
  for (let k = 0; k < L.flameCount; k++) {
    const [x, z] = polar(cx, cz, 18 + (360 / L.flameCount) * k, L.flameR);
    const y = g(x, z);
    flamePosts.push(new THREE.Vector3(x, y, z));
    const post = new THREE.Mesh(postGeo, stone);
    post.position.set(x, y + 0.8, z);
    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.position.set(x, y + 2.05, z);
    flame.visible = false;
    group.add(post, flame);
    posts.push(post);
    flames.push(flame);
  }

  // N1 PR 3: the env pieces over these primitives (src/caldera/env/anvilArenaArt.ts); positions, bodies and colliders stay as built here.
  const art = dressAnvilArena(envModelLibraryFor((ctx as Partial<GameContext>).assets), { slabs, anvils: anvilMeshes, posts, flames });
  offs.push(() => art.dispose());

  return {
    centre,
    dropAnchor: DROP_ANCHOR,
    platforms,
    anvils,
    flamePosts,
    setAnvilCracked(index, isCracked) {
      const m = anvilMeshes[index];
      if (m) m.material = isCracked ? cracked : iron;
      art.setCracked(index, isCracked);
    },
    setFlames(n) {
      flames.forEach((f, i) => (f.visible = i < n));
    },
    onArena(feet) {
      return Math.hypot(feet.x - centre.x, feet.z - centre.z) <= L.arenaR && Math.abs(feet.y - centre.y) < 6;
    },
    dispose() {
      for (const off of offs.splice(0).reverse()) {
        try {
          off();
        } catch (err) {
          warn(`anvil arena dispose: ${String(err)}`);
        }
      }
    },
  };
}
