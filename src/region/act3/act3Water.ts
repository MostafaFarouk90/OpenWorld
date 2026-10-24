// Act 3 water planes (thread K1, plan 5): Hathren's Mere, its wading shelf, the three ferry channels and the Greyfen's
// pool sheet, all at the 6 m water table. Render only: K7 builds the swim and wade volumes from ACT3_WATER_SURFACES.
//
// The surfaces are 7 km across at a distance of 3 to 5 km from the world's origin, so no mesh here has world-sized
// vertices. Each mesh is built around its own centre (positions under 1 km) and placed there, which is as precise as a
// terrain chunk. The ripple pattern samples a Greyfen-local coordinate, `modelMatrix[3].xz - uOrigin + position.xz`
// (the K0 spike's rule): never raw world x and z, never Act 2's origin. The meshes carry no rotation, so
// modelMatrix[3].xz is the exact centre. Only meshes within SHOW_RADIUS of the camera are drawn.
import * as THREE from 'three';
import { GREYFEN_GROUND_ORIGIN } from '../../terrain/ground';
import {
  FERRY_MERE_GREYWATCH_POINTS,
  FERRY_MERE_MIREWEATHER_POINTS,
  FERRY_REEDGATE_MERE_POINTS,
  GREYFEN_WATER_TABLE,
  HATHRENS_MERE,
} from '../../terrain/shape/greyfen';

/** Half width of a ferry channel's water strip, metres (the trough is 12 m each side of the centreline). */
export const CHANNEL_HALF_WIDTH = 12;
/** Fen sheet tile edge, metres. */
export const FEN_TILE = 500;
/** Meshes farther than this from the camera (to their nearest point) are hidden. */
export const WATER_SHOW_RADIUS = 2500;
/** The Greyfen box the pool sheet covers (engine metres). */
export const GREYFEN_SHEET = { minX: -500, maxX: 6500, minZ: 9500, maxZ: 15500 } as const;

export type WaterKind = 'wade' | 'deep';
export type WaterOutline =
  | { readonly kind: 'polygon'; readonly points: readonly (readonly [number, number])[] }
  | { readonly kind: 'circle'; readonly x: number; readonly z: number; readonly radius: number; readonly innerRadius?: number };

export interface WaterSurface {
  readonly id: string;
  readonly surfaceY: number;
  readonly kind: WaterKind;
  readonly outline: WaterOutline;
}

type Pt = readonly [number, number];

/** The left and right edge points of a strip around `points`, offset along each vertex's averaged normal. Pure. */
export function stripEdges(points: readonly Pt[], halfWidth: number): { left: Pt[]; right: Pt[] } {
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[Math.max(i - 1, 0)];
    const b = points[Math.min(i + 1, points.length - 1)];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz) || 1;
    // Left of the direction of travel, +Z north.
    const nx = -dz / len;
    const nz = dx / len;
    left.push([points[i][0] + nx * halfWidth, points[i][1] + nz * halfWidth]);
    right.push([points[i][0] - nx * halfWidth, points[i][1] - nz * halfWidth]);
  }
  return { left, right };
}

const channelOutline = (points: readonly Pt[]): WaterOutline => {
  const { left, right } = stripEdges(points, CHANNEL_HALF_WIDTH);
  return { kind: 'polygon', points: [...left, ...right.reverse()] };
};

const FEN_SHEET_OUTLINE: WaterOutline = {
  kind: 'polygon',
  points: [
    [GREYFEN_SHEET.minX, GREYFEN_SHEET.minZ],
    [GREYFEN_SHEET.maxX, GREYFEN_SHEET.minZ],
    [GREYFEN_SHEET.maxX, GREYFEN_SHEET.maxZ],
    [GREYFEN_SHEET.minX, GREYFEN_SHEET.maxZ],
  ],
};

/** Every region-scale water surface of Act 3, for K7's volumes and this file's meshes. */
export const ACT3_WATER_SURFACES: readonly WaterSurface[] = [
  { id: 'water.mere', surfaceY: GREYFEN_WATER_TABLE, kind: 'deep', outline: { kind: 'circle', x: HATHRENS_MERE.x, z: HATHRENS_MERE.z, radius: HATHRENS_MERE.radius } },
  {
    id: 'water.mere-shelf',
    surfaceY: GREYFEN_WATER_TABLE,
    kind: 'wade',
    outline: { kind: 'circle', x: HATHRENS_MERE.x, z: HATHRENS_MERE.z, radius: HATHRENS_MERE.radius + HATHRENS_MERE.shelfWidth, innerRadius: HATHRENS_MERE.radius },
  },
  { id: 'water.ferry-reedgate-mere', surfaceY: GREYFEN_WATER_TABLE, kind: 'deep', outline: channelOutline(FERRY_REEDGATE_MERE_POINTS) },
  { id: 'water.ferry-mere-greywatch', surfaceY: GREYFEN_WATER_TABLE, kind: 'deep', outline: channelOutline(FERRY_MERE_GREYWATCH_POINTS) },
  { id: 'water.ferry-mere-mireweather', surfaceY: GREYFEN_WATER_TABLE, kind: 'deep', outline: channelOutline(FERRY_MERE_MIREWEATHER_POINTS) },
  { id: 'water.fen-pools', surfaceY: GREYFEN_WATER_TABLE, kind: 'wade', outline: FEN_SHEET_OUTLINE },
];

const CHANNEL_POINTS: ReadonlyArray<readonly [string, readonly Pt[]]> = [
  ['ferry-reedgate-mere', FERRY_REEDGATE_MERE_POINTS],
  ['ferry-mere-greywatch', FERRY_MERE_GREYWATCH_POINTS],
  ['ferry-mere-mireweather', FERRY_MERE_MIREWEATHER_POINTS],
];

// ---- material

const WATER_VERTEX = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
uniform vec2 uOrigin;
varying vec2 vLocal;
void main() {
  vLocal = modelMatrix[3].xz - uOrigin + position.xz;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const WATER_FRAGMENT = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform float uTime;
uniform float uOpacity;
uniform vec3 uColor;
uniform vec3 uHighlight;
varying vec2 vLocal;
float waterHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float waterValueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(waterHash(i), waterHash(i + vec2(1.0, 0.0)), u.x), mix(waterHash(i + vec2(0.0, 1.0)), waterHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
void main() {
  // Two slow, crossing ripple layers in Greyfen-local metres.
  float rippleA = waterValueNoise(vLocal / 7.0 + vec2(uTime * 0.05, uTime * 0.03));
  float rippleB = waterValueNoise(vLocal / 2.6 - vec2(uTime * 0.04, -uTime * 0.07));
  float ripple = rippleA * 0.6 + rippleB * 0.4;
  vec3 tint = mix(uColor, uHighlight, smoothstep(0.45, 0.8, ripple) * 0.45);
  gl_FragColor = vec4(tint, clamp(uOpacity + (ripple - 0.5) * 0.14, 0.0, 1.0));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

export const WATER_SNIPPETS = { vertex: WATER_VERTEX, fragment: WATER_FRAGMENT } as const;

function waterMaterial(color: number, highlight: number, opacity: number): THREE.ShaderMaterial {
  const material = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uOrigin: { value: new THREE.Vector2(GREYFEN_GROUND_ORIGIN.x, GREYFEN_GROUND_ORIGIN.z) },
        uTime: { value: 0 },
        uOpacity: { value: opacity },
        uColor: { value: new THREE.Color(color) },
        uHighlight: { value: new THREE.Color(highlight) },
      },
    ]),
    vertexShader: WATER_VERTEX,
    fragmentShader: WATER_FRAGMENT,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
  });
  material.name = 'act3-water';
  return material;
}

// ---- geometry, each built about its own centre

/** A flat strip in the XZ plane at y 0 (normals up) about (cx, cz), from vertex pairs along its edges. */
function stripGeometry(left: readonly Pt[], right: readonly Pt[], cx: number, cz: number): THREE.BufferGeometry {
  const n = left.length;
  const pos = new Float32Array(n * 2 * 3);
  const idx: number[] = [];
  for (let i = 0; i < n; i++) {
    pos.set([left[i][0] - cx, 0, left[i][1] - cz], i * 6);
    pos.set([right[i][0] - cx, 0, right[i][1] - cz], i * 6 + 3);
    if (i < n - 1) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
  }
  return finish(pos, idx);
}

function finish(pos: Float32Array, idx: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const normals = new Float32Array(pos.length);
  for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/** A disc (inner 0) or ring about its own centre, in the XZ plane at y 0. */
function ringGeometry(radius: number, inner: number, segments: number): THREE.BufferGeometry {
  const pos: number[] = inner > 0 ? [] : [0, 0, 0];
  const idx: number[] = [];
  if (inner > 0) {
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      pos.push(Math.cos(a) * inner, 0, Math.sin(a) * inner, Math.cos(a) * radius, 0, Math.sin(a) * radius);
    }
    for (let i = 0; i < segments; i++) {
      const j = (i + 1) % segments;
      idx.push(i * 2, j * 2, i * 2 + 1, i * 2 + 1, j * 2, j * 2 + 1);
    }
  } else {
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      pos.push(Math.cos(a) * radius, 0, Math.sin(a) * radius);
    }
    for (let i = 0; i < segments; i++) idx.push(0, 1 + ((i + 1) % segments), 1 + i);
  }
  return finish(new Float32Array(pos), idx);
}

export interface Act3WaterOptions {
  /** Draw radius from the camera, metres (default WATER_SHOW_RADIUS). */
  showRadius?: number;
  /** Fen sheet tile edge, metres (default FEN_TILE). */
  tileSize?: number;
  /** Segments around the Mere's disc and shelf (default 72). */
  circleSegments?: number;
}

export interface Act3Water {
  readonly object: THREE.Object3D;
  /** Shows the meshes within the draw radius of `cameraPos` and advances the ripples. */
  update(cameraPos: { x: number; y?: number; z: number }, seconds: number): void;
  dispose(): void;
}

interface Piece {
  mesh: THREE.Mesh;
  /** Bounding radius about the mesh's centre (xz). */
  radius: number;
}

export function buildAct3Water(opts: Act3WaterOptions = {}): Act3Water {
  const showRadius = opts.showRadius ?? WATER_SHOW_RADIUS;
  const tile = opts.tileSize ?? FEN_TILE;
  const segs = opts.circleSegments ?? 72;
  const y = GREYFEN_WATER_TABLE;
  const group = new THREE.Group();
  group.name = 'act3-water';
  const wade = waterMaterial(0x6f8a78, 0xc3d3c6, 0.5);
  const deep = waterMaterial(0x2f4a46, 0x8fa89c, 0.78);
  const geometries: THREE.BufferGeometry[] = [];
  const pieces: Piece[] = [];

  const place = (geo: THREE.BufferGeometry, material: THREE.Material, name: string, cx: number, cz: number, order: number): void => {
    geometries.push(geo);
    const mesh = new THREE.Mesh(geo, material);
    mesh.name = name;
    mesh.position.set(cx, y, cz);
    mesh.renderOrder = order;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    group.add(mesh);
    pieces.push({ mesh, radius: geo.boundingSphere?.radius ?? 0 });
  };

  // The pool sheet: tiles at their own centres, one shared small geometry.
  const { minX, maxX, minZ, maxZ } = GREYFEN_SHEET;
  const nx = Math.ceil((maxX - minX) / tile);
  const nz = Math.ceil((maxZ - minZ) / tile);
  const quad = finish(new Float32Array([-tile / 2, 0, -tile / 2, tile / 2, 0, -tile / 2, tile / 2, 0, tile / 2, -tile / 2, 0, tile / 2]), [0, 2, 1, 0, 3, 2]);
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const cx = minX + (i + 0.5) * tile;
      const cz = minZ + (j + 0.5) * tile;
      // Every tile shares the one small quad; it is disposed once.
      const mesh = new THREE.Mesh(quad, wade);
      mesh.name = `fen-pools@${i},${j}`;
      mesh.position.set(cx, y, cz);
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      group.add(mesh);
      pieces.push({ mesh, radius: (tile / 2) * Math.SQRT2 });
    }
  }
  geometries.push(quad);

  // The Mere: its deep disc, its wading shelf ring.
  for (const s of ACT3_WATER_SURFACES) {
    if (s.outline.kind !== 'circle') continue;
    const o = s.outline;
    place(ringGeometry(o.radius, o.innerRadius ?? 0, segs), s.kind === 'deep' ? deep : wade, s.id, o.x, o.z, s.kind === 'deep' ? 2 : 1);
  }

  // The ferry channels: one ribbon per polyline segment, each about its own centre, sharing edge points exactly.
  for (const [id, pts] of CHANNEL_POINTS) {
    const { left, right } = stripEdges(pts, CHANNEL_HALF_WIDTH);
    for (let i = 0; i < pts.length - 1; i++) {
      const cx = (pts[i][0] + pts[i + 1][0]) / 2;
      const cz = (pts[i][1] + pts[i + 1][1]) / 2;
      place(stripGeometry(left.slice(i, i + 2), right.slice(i, i + 2), cx, cz), deep, `water.${id}#${i}`, cx, cz, 2);
    }
  }

  return {
    object: group,
    update(cam, seconds) {
      const t = Number.isFinite(seconds) ? seconds % 7200 : 0;
      wade.uniforms.uTime.value = t;
      deep.uniforms.uTime.value = t;
      for (const p of pieces) {
        const dx = p.mesh.position.x - cam.x;
        const dz = p.mesh.position.z - cam.z;
        p.mesh.visible = Math.hypot(dx, dz) - p.radius < showRadius;
      }
    },
    dispose() {
      group.removeFromParent();
      for (const g of geometries) g.dispose();
      wade.dispose();
      deep.dispose();
    },
  };
}
