import * as THREE from 'three';
import type { HitEvent } from './types';
import type { HurtboxSet } from './HurtboxSet';
import { damageFor, type DamageBus } from './DamageBus';
import { sweepBlade, segmentVsCapsules } from './sweep';

export interface BladeSegment {
  hilt: THREE.Vector3;
  tip: THREE.Vector3;
}

export interface WeaponTracerOptions {
  /** Identity reported as `attacker` in hit events. */
  attacker: unknown;
  /** Weapon object whose matrixWorld places the blade. */
  weapon: THREE.Object3D;
  /** Blade endpoints in weapon-local space. Default: derived from the weapon's geometry bounding box. */
  hilt?: THREE.Vector3Like | THREE.Object3D;
  tip?: THREE.Vector3Like | THREE.Object3D;
  /** The attacker's own hurtboxes; never hit by this tracer. */
  ownHurtboxes?: HurtboxSet;
  /** Events are also emitted here when given. */
  bus?: DamageBus;
}

/**
 * Derives blade endpoints from the geometry of `obj` (in `obj`-local space): the longest axis of the
 * bounding box, with the end nearer the local origin (the grip) as the hilt. Returns null without geometry.
 */
export function bladeFromGeometry(obj: THREE.Object3D): BladeSegment | null {
  obj.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(obj.matrixWorld).invert();
  const box = new THREE.Box3();
  const tmp = new THREE.Box3();
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const gb = mesh.geometry.boundingBox;
    if (!gb) return;
    tmp.copy(gb).applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld));
    box.union(tmp);
  });
  if (box.isEmpty()) return null;
  const size = box.getSize(new THREE.Vector3());
  const axis = size.x >= size.y && size.x >= size.z ? 'x' : size.y >= size.z ? 'y' : 'z';
  const centre = box.getCenter(new THREE.Vector3());
  const a = centre.clone();
  const b = centre.clone();
  a[axis] = box.min[axis];
  b[axis] = box.max[axis];
  return Math.abs(a[axis]) <= Math.abs(b[axis]) ? { hilt: a, tip: b } : { hilt: b, tip: a };
}

/**
 * Sweeps a weapon's blade against other characters' hurtboxes, only while an attack window is active.
 * Call `tick` once per fixed step after bones and the weapon have their final matrixWorld for the step.
 */
export class WeaponTracer {
  readonly attacker: unknown;
  private readonly weapon: THREE.Object3D;
  private readonly localHilt = new THREE.Vector3();
  private readonly localTip = new THREE.Vector3();
  private readonly own?: HurtboxSet;
  private readonly bus?: DamageBus;

  private readonly prevHilt = new THREE.Vector3();
  private readonly prevTip = new THREE.Vector3();
  private readonly curHilt = new THREE.Vector3();
  private readonly curTip = new THREE.Vector3();
  private hasPrev = false;
  private wasActive = false;
  private swingId = 0;
  private sourceSwing: number | undefined;
  private readonly hitThisSwing = new Set<unknown>();

  constructor(opts: WeaponTracerOptions) {
    this.attacker = opts.attacker;
    this.weapon = opts.weapon;
    this.own = opts.ownHurtboxes;
    this.bus = opts.bus;
    const toLocal = (p: THREE.Vector3Like | THREE.Object3D, out: THREE.Vector3): void => {
      if ((p as THREE.Object3D).isObject3D) {
        // Marker objects (e.g. weaponHilt/weaponTip): express their world position in weapon space.
        opts.weapon.updateWorldMatrix(true, false);
        (p as THREE.Object3D).updateWorldMatrix(true, false);
        opts.weapon.worldToLocal(out.setFromMatrixPosition((p as THREE.Object3D).matrixWorld));
      } else {
        out.copy(p as THREE.Vector3);
      }
    };
    const blade = opts.hilt && opts.tip ? null : bladeFromGeometry(opts.weapon);
    if (!blade && !(opts.hilt && opts.tip)) {
      throw new Error('WeaponTracer: weapon has no geometry and no hilt/tip override');
    }
    if (opts.hilt) toLocal(opts.hilt, this.localHilt);
    else this.localHilt.copy(blade!.hilt);
    if (opts.tip) toLocal(opts.tip, this.localTip);
    else this.localTip.copy(blade!.tip);
  }

  /** Index of the current swing; increments each time the window opens. */
  get swing(): number {
    return this.swingId;
  }

  /**
   * One fixed step. When `active` is false nothing is traced. Otherwise sweeps against each target (skipping
   * the attacker's own and already-hit targets; a changed `swingId` starts a new swing) and returns the new hits. `prepare` runs on each target
   * actually queried (use it to refit hurtboxes lazily).
   */
  tick(
    active: boolean,
    targets: Iterable<HurtboxSet>,
    prepare?: (set: HurtboxSet) => void,
    swingId?: number,
  ): HitEvent[] {
    if (!active) {
      this.wasActive = false;
      this.hasPrev = false;
      return [];
    }
    const newSwingId = swingId !== undefined && this.wasActive && swingId !== this.sourceSwing;
    this.sourceSwing = swingId;
    if (!this.wasActive || newSwingId) {
      this.swingId++;
      this.hitThisSwing.clear();
      this.wasActive = true;
      this.hasPrev = false;
    }
    this.weapon.updateWorldMatrix(true, false);
    this.curHilt.copy(this.localHilt).applyMatrix4(this.weapon.matrixWorld);
    this.curTip.copy(this.localTip).applyMatrix4(this.weapon.matrixWorld);
    if (!this.hasPrev) {
      this.prevHilt.copy(this.curHilt);
      this.prevTip.copy(this.curTip);
    }

    const hits: HitEvent[] = [];
    for (const set of targets) {
      if (set === this.own) continue;
      const target = set.owner ?? set;
      if (target === this.attacker || this.hitThisSwing.has(target)) continue;
      if (set.count === 0) continue;
      prepare?.(set);
      const hit = this.hasPrev
        ? sweepBlade(this.prevHilt, this.prevTip, this.curHilt, this.curTip, set)
        : segmentVsCapsules(this.curHilt, this.curTip, set, 1);
      if (!hit) continue;
      this.hitThisSwing.add(target);
      const event: HitEvent = {
        bone: hit.bone,
        point: hit.point,
        normal: hit.normal,
        attacker: this.attacker,
        target,
        damage: damageFor(hit.bone),
      };
      hits.push(event);
      this.bus?.emit(event);
    }

    this.prevHilt.copy(this.curHilt);
    this.prevTip.copy(this.curTip);
    this.hasPrev = true;
    return hits;
  }
}
