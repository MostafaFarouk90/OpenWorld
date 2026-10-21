// The Oldsmoke smoke stacks (design 4.3: one of four skyline landmarks, seen from the Cinder Road). Thread A1 draws the
// three columns and their plumes at every distance; A4 builds the furnace houses at their feet (OLDSMOKE_STACKS).
// The camera sees 3.4 to 5 km, and the stacks stand 4 to 13 km from the road, so beyond 0.9 of the far plane the
// group is drawn as a stand-in: on the true line of sight at 0.9 x far, scaled by the same factor, so its bearing and
// angular size are the real ones and the drawn terrain in front still hides it. Fog would swallow it out there, so
// the materials skip fog and take a haze tint by real distance instead.
import * as THREE from 'three';
import { DEEPGATE_PLATEAU, OLDSMOKE_STACKS } from '../../terrain/shape/oldsmokePass';

export const STACK_HEIGHT = 45;
export const STACK_RADIUS = 3.2;
/** The plume rises to this height above the plateau: enough to clear the ridges between it and most of the Cinder Road. */
export const PLUME_TOP = 1000;
export const PUFFS_PER_PLUME = 14;
/** The stand-in sits at this fraction of the camera's far plane. */
export const PROXY_FAR_FRACTION = 0.9;
/** Seconds for a puff to rise from the stack's lip to the plume's top. */
const PUFF_RISE_SECONDS = 240;

export interface StackPlacement {
  /** Where to draw the group's origin. */
  x: number;
  y: number;
  z: number;
  /** Uniform scale (1 when drawn at its real place). */
  scale: number;
  /** Real distance from the camera, metres. */
  distance: number;
}

/**
 * Where to draw the stacks' group (origin `real`) for a camera at `cam` with far plane `far`: at the real place while
 * it lies within PROXY_FAR_FRACTION of the far plane, else pulled in along the line of sight and scaled to match. Pure.
 */
export function stackPlacement(cam: { x: number; y: number; z: number }, real: { x: number; y: number; z: number }, far: number): StackPlacement {
  const dx = real.x - cam.x;
  const dy = real.y - cam.y;
  const dz = real.z - cam.z;
  const distance = Math.hypot(dx, dy, dz);
  const limit = PROXY_FAR_FRACTION * far;
  if (!(distance > limit) || !(limit > 0)) return { x: real.x, y: real.y, z: real.z, scale: 1, distance };
  const k = limit / distance;
  return { x: cam.x + dx * k, y: cam.y + dy * k, z: cam.z + dz * k, scale: k, distance };
}

/** 0 near, rising to 0.75 by 14 km: how much of the sky's colour the stand-in takes. Pure. */
export function hazeFor(distance: number): number {
  const t = Math.min(Math.max((distance - 800) / 13200, 0), 1);
  return 0.75 * t * t * (3 - 2 * t);
}

/** The group's origin: the middle stack's foot on Deepgate's plateau. */
export const STACKS_ORIGIN = { x: OLDSMOKE_STACKS[1].x, y: DEEPGATE_PLATEAU.height, z: OLDSMOKE_STACKS[1].z };

export interface OldsmokeStacks {
  readonly object: THREE.Group;
  /** Places the group for this camera and animates the plumes; `hidden` (inside an interior) hides it. */
  update(cam: THREE.Vector3, far: number, seconds: number, sky: THREE.Color | null, hidden: boolean): void;
  dispose(): void;
}

export function buildOldsmokeStacks(): OldsmokeStacks {
  const group = new THREE.Group();
  group.name = 'oldsmoke-stacks';
  const brick = new THREE.Color(0x4a2f26);
  const smoke = new THREE.Color(0x3b3632);
  const columnMat = new THREE.MeshLambertMaterial({ color: brick.clone(), fog: false });
  const smokeMat = new THREE.MeshLambertMaterial({ color: smoke.clone(), transparent: true, opacity: 0.55, depthWrite: false, fog: false });
  const columnGeo = new THREE.CylinderGeometry(STACK_RADIUS * 0.75, STACK_RADIUS, STACK_HEIGHT, 10);
  columnGeo.translate(0, STACK_HEIGHT / 2, 0);
  const puffGeo = new THREE.IcosahedronGeometry(1, 1);

  const columns = new THREE.InstancedMesh(columnGeo, columnMat, OLDSMOKE_STACKS.length);
  const m = new THREE.Matrix4();
  OLDSMOKE_STACKS.forEach((s, i) => {
    m.makeTranslation(s.x - STACKS_ORIGIN.x, 0, s.z - STACKS_ORIGIN.z);
    columns.setMatrixAt(i, m);
  });
  columns.instanceMatrix.needsUpdate = true;
  columns.name = 'columns';
  const puffs = new THREE.InstancedMesh(puffGeo, smokeMat, OLDSMOKE_STACKS.length * PUFFS_PER_PLUME);
  puffs.name = 'plumes';
  // Instances span a kilometre of sky around a moving origin: never cull on the stale bounds.
  columns.frustumCulled = false;
  puffs.frustumCulled = false;
  group.add(columns, puffs);

  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  /** Puff `j` of stack `i` at time `seconds`, in the group's frame (object space, so the stand-in animates the same). */
  const placePuffs = (seconds: number): void => {
    OLDSMOKE_STACKS.forEach((s, i) => {
      for (let j = 0; j < PUFFS_PER_PLUME; j++) {
        const phase = (seconds / PUFF_RISE_SECONDS + j / PUFFS_PER_PLUME + i * 0.137) % 1;
        const rise = STACK_HEIGHT + (PLUME_TOP - STACK_HEIGHT) * phase;
        // The plume leans east on the wind and widens as it climbs.
        const drift = 260 * phase * phase;
        const r = 8 + 140 * phase;
        pos.set(s.x - STACKS_ORIGIN.x + drift, rise, s.z - STACKS_ORIGIN.z + drift * 0.25);
        scl.set(r, r * 0.8, r);
        m.compose(pos, q, scl);
        puffs.setMatrixAt(i * PUFFS_PER_PLUME + j, m);
      }
    });
    puffs.instanceMatrix.needsUpdate = true;
  };
  placePuffs(0);

  return {
    object: group,
    update(cam, far, seconds, sky, hidden) {
      group.visible = !hidden;
      if (hidden) return;
      const p = stackPlacement(cam, STACKS_ORIGIN, far);
      group.position.set(p.x, p.y, p.z);
      group.scale.setScalar(p.scale);
      // Wrapped so the float32 maths in the matrices never sees a large time.
      placePuffs(seconds % (PUFF_RISE_SECONDS * 100));
      const h = hazeFor(p.distance);
      if (sky) {
        columnMat.color.copy(brick).lerp(sky, h);
        smokeMat.color.copy(smoke).lerp(sky, h * 0.8);
      }
    },
    dispose() {
      group.removeFromParent();
      columns.dispose();
      puffs.dispose();
      columnGeo.dispose();
      puffGeo.dispose();
      columnMat.dispose();
      smokeMat.dispose();
    },
  };
}
