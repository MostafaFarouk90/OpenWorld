// Act 4 thread L1 (plans/act4-L1.md section 8): the Sunforge column, `landmark.sunforge`. A fog-free translucent glow
// column about 900 m tall over the Caldera's centre with a slow pulse, and a smoke plume of soft sprites rising and
// drifting east. The Ash Road's start is 5.75 km away, past the camera's 5 km far plane, so beyond 0.9 x far the group
// is drawn on the true line of sight at the true angular size (the Oldsmoke stacks' and the summit's method), tinted
// toward the fog by real distance. Quality-tiered: Low the column only, Medium a 24-sprite plume, High 64. Hidden indoors.
import * as THREE from 'three';
import { hazeFor, PROXY_FAR_FRACTION } from '../act2/oldsmokeStacks';
import { SUNFORGE_COLUMN } from '../../terrain/shape/waste';

export const SUNFORGE_LANDMARK_ID = 'landmark.sunforge';
export const COLUMN_HEIGHT = 900;
export const COLUMN_RADIUS = 45;
/** Seconds per pulse of the column's glow. */
export const COLUMN_PULSE_PERIOD = 9;
/** Plume sprites per quality step. */
export const PLUME_SPRITES = { low: 0, medium: 24, high: 64 } as const;
export type SunforgeQuality = keyof typeof PLUME_SPRITES;
/** A sprite rises from the column's top to this many metres above it, drifting this far east (+x), over its life. */
export const PLUME_RISE = 700;
export const PLUME_DRIFT = 900;
export const PLUME_LIFE = 80;
const PLUME_SIZE = 260;

export interface SunforgePlacement {
  x: number;
  y: number;
  z: number;
  scale: number;
  distance: number;
}

/**
 * Where the group (origin: the column's foot at `baseY`) is drawn for a camera at `cam` with far plane `far` and a
 * group bounding `radius`: at its true place inside 0.9 x far, else on the line of sight at that distance (pulled in
 * so its far side stays inside the far plane), scaled by the distance ratio so the angular size is the real one. Pure.
 */
export function sunforgePlacement(cam: { x: number; y: number; z: number }, far: number, radius: number, baseY: number): SunforgePlacement {
  const dx = SUNFORGE_COLUMN[0] - cam.x;
  const dy = baseY - cam.y;
  const dz = SUNFORGE_COLUMN[1] - cam.z;
  const distance = Math.hypot(dx, dy, dz);
  const limit = PROXY_FAR_FRACTION * far;
  if (!(distance > limit) || !(limit > 0)) return { x: SUNFORGE_COLUMN[0], y: baseY, z: SUNFORGE_COLUMN[1], scale: 1, distance };
  const placed = Math.min(limit, (0.98 * far) / (1 + radius / distance));
  const k = placed / distance;
  return { x: cam.x + dx * k, y: cam.y + dy * k, z: cam.z + dz * k, scale: k, distance };
}

export interface SunforgeLandmark {
  readonly object: THREE.Group;
  /** Sprites drawn now (the quality step's count). */
  readonly plumeCount: number;
  setQuality(step: SunforgeQuality): void;
  update(cam: { x: number; y: number; z: number }, far: number, seconds: number, fog: THREE.Color | null, indoors: boolean): void;
  dispose(): void;
}

const GLOW = new THREE.Color(1.0, 0.45, 0.12);
const SMOKE = new THREE.Color(0.32, 0.29, 0.27);

/** A soft round sprite (radial alpha), built once per landmark. */
function softSprite(): THREE.DataTexture {
  const n = 32;
  const data = new Uint8Array(n * n * 4);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const d = Math.hypot(i - (n - 1) / 2, j - (n - 1) / 2) / (n / 2);
      const a = Math.round(255 * Math.max(0, 1 - d) ** 1.6);
      data.set([255, 255, 255, a], (j * n + i) * 4);
    }
  const t = new THREE.DataTexture(data, n, n);
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

export function buildSunforgeLandmark(heightAt: (x: number, z: number) => number): SunforgeLandmark {
  const baseY = heightAt(SUNFORGE_COLUMN[0], SUNFORGE_COLUMN[1]);
  const group = new THREE.Group();
  group.name = SUNFORGE_LANDMARK_ID;

  // The column: an open cylinder, wider at the foot, additive and fog-free (the haze is applied by hand).
  const colGeo = new THREE.CylinderGeometry(COLUMN_RADIUS * 0.6, COLUMN_RADIUS, COLUMN_HEIGHT, 16, 1, true);
  colGeo.translate(0, COLUMN_HEIGHT / 2, 0);
  // Normal blending: additive over a bright sky washes to white; a translucent orange reads as fire by day.
  const colMat = new THREE.MeshBasicMaterial({ color: GLOW.clone(), transparent: true, opacity: 0.5, depthWrite: false, fog: false, side: THREE.DoubleSide });
  const column = new THREE.Mesh(colGeo, colMat);
  column.name = 'sunforge-column';
  column.frustumCulled = false;
  group.add(column);

  // The plume: the High count of sprites; the quality step draws the first n.
  const max = PLUME_SPRITES.high;
  const pos = new Float32Array(max * 3);
  const plumeGeo = new THREE.BufferGeometry();
  plumeGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const sprite = softSprite();
  const plumeMat = new THREE.PointsMaterial({ color: SMOKE.clone(), size: PLUME_SIZE, map: sprite, transparent: true, opacity: 0.55, depthWrite: false, fog: false, sizeAttenuation: true });
  const plume = new THREE.Points(plumeGeo, plumeMat);
  plume.name = 'sunforge-plume';
  plume.frustumCulled = false;
  group.add(plume);
  const radius = Math.hypot(PLUME_DRIFT, COLUMN_HEIGHT + PLUME_RISE);

  let count: number = PLUME_SPRITES.medium;
  plumeGeo.setDrawRange(0, count);
  const tmp = new THREE.Color();

  return {
    object: group,
    get plumeCount() {
      return count;
    },
    setQuality(step) {
      count = PLUME_SPRITES[step];
      plumeGeo.setDrawRange(0, count);
      plume.visible = count > 0;
    },
    update(cam, far, seconds, fog, indoors) {
      group.visible = !indoors && far > 0;
      if (!group.visible) return;
      const p = sunforgePlacement(cam, far, radius, baseY);
      group.position.set(p.x, p.y, p.z);
      group.scale.setScalar(p.scale);
      const haze = fog ? hazeFor(p.distance) : 0;
      const pulse = 0.5 + 0.5 * Math.sin((seconds * 2 * Math.PI) / COLUMN_PULSE_PERIOD);
      colMat.opacity = (0.35 + 0.2 * pulse) * (1 - haze * 0.6);
      tmp.copy(SMOKE);
      if (fog) tmp.lerp(fog, haze);
      plumeMat.color.copy(tmp);
      plumeMat.size = PLUME_SIZE * p.scale;
      for (let i = 0; i < count; i++) {
        // Each sprite's age runs on its own phase; it rises, drifts east and spreads with age.
        const u = ((seconds / PLUME_LIFE + i / max) % 1 + 1) % 1;
        const swirl = Math.sin(i * 12.9898) * 60 * (0.3 + u);
        pos[i * 3] = PLUME_DRIFT * u * u + swirl;
        pos[i * 3 + 1] = COLUMN_HEIGHT + PLUME_RISE * Math.sqrt(u);
        pos[i * 3 + 2] = Math.cos(i * 78.233) * 80 * (0.3 + u);
      }
      (plumeGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    },
    dispose() {
      group.removeFromParent();
      colGeo.dispose();
      colMat.dispose();
      plumeGeo.dispose();
      plumeMat.dispose();
      sprite.dispose();
    },
  };
}
