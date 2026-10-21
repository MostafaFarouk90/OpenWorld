// A structure the plugin shows and hides on a flag: the boarded well, the well's blight stain, the resting wyrm's den marker.
// It owns at most one static collider (solid specs) and one mesh, so `hide` and `dispose` leave nothing behind. The layout
// never contains these specs: StructureBuilder has no per-structure handle, and a toggle is not a permanent structure.
import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d';
import type { CoreContext } from '../region/coreTypes';
import { buildGreybox, disposeGreybox, structureHeight } from '../region/greybox';
import type { StructureSpec } from '../region/layoutTypes';

function disposeArt(art: THREE.Object3D): void {
  art.traverse((o) => {
    if (o.userData.greybox) disposeGreybox(o);
    else if (o.userData.ownGeometry) (o as THREE.Mesh).geometry.dispose();
  });
}

export type ToggleDeps = Pick<CoreContext, 'scene' | 'physics'> & { rapier: Pick<typeof RAPIER, 'ColliderDesc'> };

export class ToggleStructure {
  readonly root = new THREE.Group();
  private collider: RAPIER.Collider | null = null;
  private shown = false;
  private disposed = false;
  private visual: THREE.Object3D;

  constructor(
    private readonly deps: ToggleDeps,
    readonly spec: StructureSpec,
    heightAt: (x: number, z: number) => number,
  ) {
    this.root.name = `toggle:${spec.id}`;
    this.root.position.set(spec.x, heightAt(spec.x, spec.z), spec.z);
    this.root.rotation.y = (spec.yawDeg * Math.PI) / 180;
    this.visual = buildGreybox(spec);
    this.root.add(this.visual);
    this.root.visible = false;
  }

  get visible(): boolean {
    return this.shown;
  }

  /** Swaps in real art (the plugin's async upgrade); ignored once disposed or when the art is null. */
  setArt(art: THREE.Object3D | null): void {
    if (!art) return;
    if (this.disposed) {
      disposeArt(art);
      return;
    }
    this.root.remove(this.visual);
    disposeGreybox(this.visual);
    this.visual = art;
    this.root.add(art);
  }

  setVisible(on: boolean): void {
    if (this.disposed || on === this.shown) return;
    this.shown = on;
    if (on) {
      this.deps.scene.add(this.root);
      this.root.visible = true;
      if (this.spec.mode === 'solid') {
        const [w, d] = this.spec.footprint;
        const h = structureHeight(this.spec);
        const yaw = (this.spec.yawDeg * Math.PI) / 180;
        const desc = this.deps.rapier.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setTranslation(this.root.position.x, this.root.position.y + h / 2, this.root.position.z);
        if (yaw !== 0) desc.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) });
        this.collider = this.deps.physics.addStaticCollider(desc);
      }
    } else {
      this.root.visible = false;
      this.root.removeFromParent();
      this.dropCollider();
    }
  }

  private dropCollider(): void {
    if (!this.collider) return;
    try {
      this.deps.physics.removeCollider(this.collider);
    } catch {
      /* the world may already be gone */
    }
    this.collider = null;
  }

  dispose(): void {
    if (this.disposed) return;
    this.setVisible(false);
    this.disposed = true;
    disposeArt(this.visual);
    this.root.clear();
  }
}
