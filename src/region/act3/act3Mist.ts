// Greyfen mist (thread K1, plan 6): the scene fog's near distance and colour blend toward a silver-green haze by the
// player's Greyfen weight, plus a few low translucent mist sheets above the water table. Fog is the plugin's to apply
// (`mistFog` is the pure blend); the sheets follow the camera snapped to a grid, so the pattern does not swim, and
// sample a Greyfen-local coordinate (`modelMatrix[3].xz - uOrigin + position.xz`), never raw world x and z.
import * as THREE from 'three';
import { GREYFEN_GROUND_ORIGIN } from '../../terrain/ground';
import { GREYFEN_WATER_TABLE } from '../../terrain/shape/greyfen';

/** The Greyfen box in engine metres (the marsh's region of effect). */
export const GREYFEN_MIST_BOX = { minX: -500, maxX: 6500, minZ: 9500, maxZ: 15500 } as const;
/** The weight smoothsteps from 1 at the box to 0 this far outside it. */
export const GREYFEN_MIST_BLEND = 600;
/** Fog at full weight: near and far distances (metres) and the haze colour. */
export const MIST_FOG_NEAR = 120;
export const MIST_FOG_FAR = 2600;
export const MIST_HAZE = new THREE.Color(0x9db0a4);
/** Sheet heights above the water table (metres): 1 to 5 m. */
export const MIST_SHEET_HEIGHTS: readonly number[] = [1.4, 2.9, 4.6];
/** Sheets are this wide, and follow the camera in steps of MIST_GRID. */
export const MIST_SHEET_SIZE = 2600;
export const MIST_GRID = 100;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

/** 1 inside the Greyfen box, 0 beyond 600 m outside it, a smoothstep between. Pure. */
export function greyfenWeight(x: number, z: number): number {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return 0;
  const b = GREYFEN_MIST_BOX;
  const dx = x < b.minX ? b.minX - x : x > b.maxX ? x - b.maxX : 0;
  const dz = z < b.minZ ? b.minZ - z : z > b.maxZ ? z - b.maxZ : 0;
  return 1 - smooth(0, GREYFEN_MIST_BLEND, Math.hypot(dx, dz));
}

export interface MistFog {
  near: number;
  far: number;
  color: THREE.Color;
}

/** The scene fog blended toward the silver-green haze by `weight` (0 gives the base back exactly). Pure. */
export function mistFog(baseNear: number, baseFar: number, baseColor: THREE.Color, weight: number): MistFog {
  const w = Math.min(Math.max(Number.isFinite(weight) ? weight : 0, 0), 1);
  // Never push the fog out past the base: a darker, shorter fog only.
  const near = baseNear + (Math.min(baseNear, MIST_FOG_NEAR) - baseNear) * w;
  const far = baseFar + (Math.min(baseFar, MIST_FOG_FAR) - baseFar) * w;
  return { near, far: Math.max(far, near + 1), color: baseColor.clone().lerp(MIST_HAZE, w) };
}

const MIST_VERTEX = /* glsl */ `
uniform vec2 uOrigin;
varying vec2 vLocal;
varying float vEdge;
void main() {
  vLocal = modelMatrix[3].xz - uOrigin + position.xz;
  vEdge = length(position.xz) / ${(MIST_SHEET_SIZE / 2).toFixed(1)};
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const MIST_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uOpacity;
uniform float uScale;
uniform vec2 uDrift;
uniform vec3 uColor;
varying vec2 vLocal;
varying float vEdge;
float mistHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float mistValueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(mistHash(i), mistHash(i + vec2(1.0, 0.0)), u.x), mix(mistHash(i + vec2(0.0, 1.0)), mistHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
void main() {
  vec2 p = vLocal / uScale + uDrift * uTime;
  float cloud = mistValueNoise(p) * 0.6 + mistValueNoise(p * 2.3 + 11.0) * 0.4;
  float thin = smoothstep(0.35, 0.8, cloud);
  gl_FragColor = vec4(uColor, uOpacity * thin * (1.0 - smoothstep(0.55, 1.0, vEdge)));
}
`;

export const MIST_SNIPPETS = { vertex: MIST_VERTEX, fragment: MIST_FRAGMENT } as const;

/** The most opaque a mist sheet gets at weight 1 (three sheets stack). */
export const MIST_MAX_OPACITY = 0.3;

export interface GreyfenMist {
  readonly object: THREE.Object3D;
  /** Follows the camera on the grid, scales the opacity by `weight` (hidden at 0) and tints with the scene fog colour. */
  update(cameraPos: { x: number; y?: number; z: number }, weight: number, seconds: number, fogColor: THREE.Color): void;
  dispose(): void;
}

export function buildGreyfenMist(): GreyfenMist {
  const group = new THREE.Group();
  group.name = 'greyfen-mist';
  const geo = new THREE.PlaneGeometry(MIST_SHEET_SIZE, MIST_SHEET_SIZE, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mats = MIST_SHEET_HEIGHTS.map((_, i) => {
    const m = new THREE.ShaderMaterial({
      uniforms: {
        uOrigin: { value: new THREE.Vector2(GREYFEN_GROUND_ORIGIN.x, GREYFEN_GROUND_ORIGIN.z) },
        uTime: { value: 0 },
        uOpacity: { value: 0 },
        uScale: { value: 140 + i * 90 },
        uDrift: { value: new THREE.Vector2(0.0009 * (i + 1), -0.0006 * (3 - i)) },
        uColor: { value: MIST_HAZE.clone() },
      },
      vertexShader: MIST_VERTEX,
      fragmentShader: MIST_FRAGMENT,
      transparent: true,
      depthWrite: false,
      fog: false,
      side: THREE.DoubleSide,
    });
    m.name = `greyfen-mist-${i}`;
    return m;
  });
  const sheets = mats.map((m, i) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.name = `mist-sheet-${i}`;
    mesh.position.y = GREYFEN_WATER_TABLE + MIST_SHEET_HEIGHTS[i];
    mesh.renderOrder = 3 + i;
    // The sheet moves with the camera, so its bounding sphere would be stale: it is always near the camera anyway.
    mesh.frustumCulled = false;
    group.add(mesh);
    return mesh;
  });
  group.visible = false;

  return {
    object: group,
    update(cam, weight, seconds, fogColor) {
      const w = Math.min(Math.max(Number.isFinite(weight) ? weight : 0, 0), 1);
      group.visible = w > 0.001;
      if (!group.visible) return;
      // Snapped to the grid: the local noise coordinate is world-fixed, so the pattern holds still while the sheet hops.
      const gx = Math.round(cam.x / MIST_GRID) * MIST_GRID;
      const gz = Math.round(cam.z / MIST_GRID) * MIST_GRID;
      const t = Number.isFinite(seconds) ? seconds % 100000 : 0;
      mats.forEach((m, i) => {
        sheets[i].position.x = gx;
        sheets[i].position.z = gz;
        m.uniforms.uOpacity.value = MIST_MAX_OPACITY * w * (1 - i * 0.18);
        m.uniforms.uTime.value = t;
        (m.uniforms.uColor.value as THREE.Color).copy(fogColor).lerp(MIST_HAZE, 0.5);
      });
    },
    dispose() {
      group.removeFromParent();
      geo.dispose();
      for (const m of mats) m.dispose();
    },
  };
}
