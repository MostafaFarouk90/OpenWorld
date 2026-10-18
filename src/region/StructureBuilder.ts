// Places a greybox for every structure synchronously, with colliders and doors; real models swap in
// later through handle.upgrade().
import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d';
import type { BuildingLookup } from './buildingLookup';
import type { CoreContext } from './coreTypes';
import { doorFillBox, wallBoxes } from './geometry';
import { DOOR_HEIGHT, buildGreybox, disposeGreybox, greyMat, structureHeight } from './greybox';
import type { LayoutData, StructureSpec } from './layoutTypes';
import { Chest, type ChestOptions } from '../interaction/Chest';
import { Door, type DoorOptions } from '../interaction/Door';

export interface Disposable {
  dispose(): void;
}

export type Collider = RAPIER.Collider;

export type StructureDeps = Pick<CoreContext, 'scene' | 'physics' | 'interaction' | 'state' | 'events' | 'systems'> & {
  /** The loaded Rapier module (for ColliderDesc). */
  rapier: Pick<typeof RAPIER, 'ColliderDesc'>;
  createDoor: (opts: DoorOptions) => Disposable;
  createChest: (opts: ChestOptions) => Disposable;
};

export interface StructureHandle {
  group: THREE.Group;
  objectById: Map<string, THREE.Object3D>;
  colliders: Collider[];
  doors: Disposable[];
  /** Swaps real models in where the lookup has them; never rejects. */
  upgrade(): Promise<void>;
  dispose(): void;
}

/** The core's Door and Chest, bound to a context; tests substitute their own. */
export function coreFactories(ctx: Pick<CoreContext, 'interaction' | 'state' | 'events' | 'systems'>) {
  return {
    createDoor: (o: DoorOptions): Disposable => new Door(ctx, o),
    createChest: (o: ChestOptions): Disposable => new Chest(ctx, o),
  };
}

export type { ChestOptions, DoorOptions };

const VISUAL = 'visual';
const POST_HALF = 0.25;

export function buildStructures(
  deps: StructureDeps,
  layout: Pick<LayoutData, 'structures'>,
  heightAt: (x: number, z: number) => number,
  lookup: Pick<BuildingLookup, 'tryReal'>,
): StructureHandle {
  const group = new THREE.Group();
  group.name = 'structures';
  const objectById = new Map<string, THREE.Object3D>();
  const colliders: Collider[] = [];
  const doors: Disposable[] = [];
  const specs = new Map<string, StructureSpec>();
  let disposed = false;

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    for (const d of doors.splice(0).reverse()) {
      try {
        d.dispose();
      } catch {
        /* keep tearing down */
      }
    }
    for (const c of colliders.splice(0)) {
      try {
        deps.physics.removeCollider(c);
      } catch {
        /* keep tearing down */
      }
    }
    group.traverse((o) => {
      if (o.userData.greybox) disposeGreybox(o);
    });
    group.removeFromParent();
    group.clear();
    objectById.clear();
  };

  const addCuboid = (cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, yaw = 0): Collider => {
    const desc = deps.rapier.ColliderDesc.cuboid(hx, hy, hz).setTranslation(cx, cy, cz);
    if (yaw !== 0) desc.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) });
    const c = deps.physics.addStaticCollider(desc);
    colliders.push(c);
    return c;
  };

  try {
    deps.scene.add(group);
    for (const spec of layout.structures) {
      const y = heightAt(spec.x, spec.z);
      const yaw = (spec.yawDeg * Math.PI) / 180;
      const h = structureHeight(spec);
      const holder = new THREE.Group();
      holder.name = `structure:${spec.id}`;
      holder.position.set(spec.x, y, spec.z);
      holder.rotation.y = yaw;
      const visual = buildGreybox(spec);
      visual.name = VISUAL;
      holder.add(visual);
      group.add(holder);
      objectById.set(spec.id, holder);
      specs.set(spec.id, spec);

      if (spec.mode === 'solid') {
        addCuboid(spec.x, y + h / 2, spec.z, spec.footprint[0] / 2, h / 2, spec.footprint[1] / 2, yaw);
      } else if (spec.mode === 'enterable') {
        for (const b of wallBoxes(spec)) addCuboid(b.cx, y + h / 2, b.cz, b.hx, h / 2, b.hz);
        const fill = doorFillBox(spec);
        if (spec.door && fill) {
          const fillCollider = addCuboid(fill.cx, y + h / 2, fill.cz, fill.hx, h / 2, fill.hz);
          // Hinge at the low end of the doorway; the slab extends along the wall.
          const alongX = spec.door.side === 'N' || spec.door.side === 'S';
          const pivot = new THREE.Group();
          pivot.name = `door-pivot:${spec.door.name}`;
          const slab = new THREE.Mesh(new THREE.BoxGeometry(fill.hx * 2, DOOR_HEIGHT, fill.hz * 2), greyMat(0x6b4a2b));
          if (alongX) {
            pivot.position.set(fill.cx - spec.x - fill.hx, 0, fill.cz - spec.z);
            slab.position.set(fill.hx, DOOR_HEIGHT / 2, 0);
          } else {
            pivot.position.set(fill.cx - spec.x, 0, fill.cz - spec.z - fill.hz);
            slab.position.set(0, DOOR_HEIGHT / 2, fill.hz);
          }
          pivot.add(slab);
          holder.add(pivot);
          const openWhen = spec.door.openWhen ?? [];
          doors.push(
            deps.createDoor({
              id: `door:${spec.door.name}`,
              pivot,
              openAngle: Math.PI / 2,
              seconds: 0.6,
              collider: fillCollider,
              // Any one flag opens it (the chapel opens at T04, or when the tutorial is skipped).
              locked: () => openWhen.length > 0 && !openWhen.some((f) => deps.state.getBool(f)),
            }),
          );
        }
      } else if (spec.kind === 'gate' || spec.kind === 'loft') {
        const [w, d] = spec.footprint;
        const xs = spec.kind === 'gate' ? [-1, 1].map((s) => s * (w / 2 - 0.3)) : [-1, 1].map((s) => s * (w / 2 - POST_HALF));
        const zs = spec.kind === 'gate' ? [0] : [-1, 1].map((s) => s * (d / 2 - POST_HALF));
        for (const lx of xs) {
          for (const lz of zs) {
            const wx = spec.x + lx * Math.cos(yaw) + lz * Math.sin(yaw);
            const wz = spec.z - lx * Math.sin(yaw) + lz * Math.cos(yaw);
            addCuboid(wx, heightAt(wx, wz) + h / 2, wz, POST_HALF * 0.8, h / 2, POST_HALF * 0.8, yaw);
          }
        }
      }
    }
  } catch (err) {
    dispose();
    throw err;
  }

  return {
    group,
    objectById,
    colliders,
    doors,
    dispose,
    async upgrade() {
      for (const [id, spec] of specs) {
        if (disposed) return;
        try {
          const real = await lookup.tryReal(spec);
          const holder = objectById.get(id);
          if (!real || disposed || !holder) continue;
          const old = holder.getObjectByName(VISUAL);
          if (old) {
            holder.remove(old);
            disposeGreybox(old);
          }
          real.name = VISUAL;
          holder.add(real);
        } catch (err) {
          console.warn(`buildStructures: upgrade of "${id}" failed`, err);
        }
      }
    },
  };
}
