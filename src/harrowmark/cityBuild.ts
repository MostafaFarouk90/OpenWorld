// Builds the city's greybox: visuals merged per district and material (a handful of draw calls instead of one per
// box) plus a static cuboid per solid structure. The South Gate's portcullis is the one piece with a switch.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type RAPIER from '@dimforge/rapier3d';
import type { CoreContext } from '../region/coreTypes';
import { buildGreybox, disposeGreybox, greyMat, structureHeight } from '../region/greybox';
import type { StructureSpec } from '../region/layoutTypes';
import { PORTCULLIS_ID } from './city';
import { coverageOf } from './cityArt';

export type BuildDeps = Pick<CoreContext, 'scene' | 'physics'> & { rapier: Pick<typeof RAPIER, 'ColliderDesc'> };

export interface CityHandle {
  group: THREE.Group;
  /** Number of merged meshes (draw calls, before the portcullis). */
  drawCalls: number;
  colliders: number;
  /** Raises or lowers the South Gate's portcullis: collider and mesh. */
  setPortcullis(closed: boolean): void;
  portcullisClosed(): boolean;
  dispose(): void;
}

/** District bucket of a structure id: `forge.a0` -> `forge`, `ward.b10` -> `ward`, `wall.12a` -> `ring`. */
export function districtOf(id: string): string {
  const head = id.split(/[.-]/)[0];
  return ['wall', 'tower', 'plug'].includes(head) ? 'ring' : head;
}

export function buildCity(deps: BuildDeps, structures: StructureSpec[], heightAt: (x: number, z: number) => number): CityHandle {
  const group = new THREE.Group();
  group.name = 'harrowmark-city';
  const colliders: RAPIER.Collider[] = [];
  const buckets = new Map<string, Map<THREE.Material, THREE.BufferGeometry[]>>();
  let portcullisCollider: RAPIER.Collider | null = null;
  let portcullisMesh: THREE.Group | null = null;
  let closed = true;
  let disposed = false;

  const addCuboid = (cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, yaw: number): RAPIER.Collider => {
    const desc = deps.rapier.ColliderDesc.cuboid(hx, hy, hz).setTranslation(cx, cy, cz);
    if (yaw !== 0) desc.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) });
    const c = deps.physics.addStaticCollider(desc);
    colliders.push(c);
    return c;
  };

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    for (const c of colliders.splice(0)) {
      try {
        deps.physics.removeCollider(c);
      } catch {
        /* keep tearing down */
      }
    }
    group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose();
    });
    group.removeFromParent();
    group.clear();
  };

  try {
    deps.scene.add(group);
    for (const spec of structures) {
      const y = heightAt(spec.x, spec.z);
      const yaw = (spec.yawDeg * Math.PI) / 180;
      const h = structureHeight(spec);
      if (spec.id === PORTCULLIS_ID) {
        portcullisMesh = buildPortcullis(spec, h);
        portcullisMesh.position.set(spec.x, y, spec.z);
        portcullisMesh.rotation.y = yaw;
        group.add(portcullisMesh);
        portcullisCollider = addCuboid(spec.x, y + h / 2, spec.z, spec.footprint[0] / 2, h / 2, spec.footprint[1] / 2, yaw);
        continue;
      }
      if (spec.mode === 'solid') addCuboid(spec.x, y + h / 2, spec.z, spec.footprint[0] / 2, h / 2, spec.footprint[1] / 2, yaw);
      const holder = new THREE.Group();
      holder.position.set(spec.x, y, spec.z);
      holder.rotation.y = yaw;
      // A structure the asset swap dresses has its greybox pulled in from the sides (and the top, except a walkable deck) so the
      // models stand in front of it without z-fighting; the collider above is untouched and the greybox is the far tier.
      const cover = coverageOf(spec);
      // A dressed house is a plain box (no pyramid roof): the models carry the roofs, and the keep's castle must not sit under a greybox one.
      const dressedKinds = ['house', 'tavern', 'chapel'];
      const visual = buildGreybox(
        cover
          ? { ...spec, kind: dressedKinds.includes(spec.kind) ? 'block' : spec.kind, footprint: [spec.footprint[0] - 2 * cover.inset, spec.footprint[1] - 2 * cover.inset], height: Math.max(0.5, h - cover.topInset) }
          : spec,
      );
      if (cover?.deck) {
        const deck = buildGreybox({ ...spec, kind: 'block', footprint: spec.footprint, height: cover.deck });
        deck.position.y = h - cover.deck;
        visual.add(deck);
      }
      holder.add(visual);
      holder.updateMatrixWorld(true);
      const bucket = buckets.get(districtOf(spec.id)) ?? new Map<THREE.Material, THREE.BufferGeometry[]>();
      buckets.set(districtOf(spec.id), bucket);
      visual.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const geom = m.geometry.clone().applyMatrix4(m.matrixWorld);
        const mat = m.material as THREE.Material;
        const list = bucket.get(mat) ?? [];
        list.push(geom);
        bucket.set(mat, list);
      });
      disposeGreybox(visual);
    }
    let drawCalls = 0;
    for (const [district, mats] of buckets) {
      for (const [mat, geoms] of mats) {
        const merged = mergeGeometries(geoms, false);
        for (const g of geoms) g.dispose();
        if (!merged) continue;
        const mesh = new THREE.Mesh(merged, mat);
        mesh.name = `harrowmark:${district}`;
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        group.add(mesh);
        drawCalls++;
      }
    }
    return {
      group,
      drawCalls,
      colliders: colliders.length,
      setPortcullis(next: boolean) {
        closed = next;
        portcullisCollider?.setEnabled(next);
        if (portcullisMesh) portcullisMesh.visible = next;
      },
      portcullisClosed: () => closed,
      dispose,
    };
  } catch (err) {
    dispose();
    throw err;
  }
}

function buildPortcullis(spec: StructureSpec, h: number): THREE.Group {
  const g = new THREE.Group();
  g.name = 'portcullis';
  const w = spec.footprint[0];
  const mat = greyMat(0x3b3430);
  const bars = Math.round(w / 1.2);
  for (let i = 0; i < bars; i++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.3, h, 0.3), mat);
    bar.position.set(-w / 2 + 0.6 + (i * (w - 1.2)) / (bars - 1), h / 2, 0);
    g.add(bar);
  }
  for (const f of [0.35, 0.75]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, 0.3), mat);
    rail.position.set(0, h * f, 0);
    g.add(rail);
  }
  return g;
}
