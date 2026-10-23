import * as THREE from 'three';
import { HurtboxSet } from '../../combat/HurtboxSet';
import type { HurtboxDef } from '../../combat/types';
import { LOOK } from './tuning';

/** Live uniforms of the lava shader, kept on `material.userData.slagmawUniforms` (tests and debug read them; no recompile needed). */
export interface SlagmawUniforms {
  uLavaTime: { value: number };
  /** 0..1 how much lava shows through the crust (cooled dims it). */
  uGlow: { value: number };
  /** 0..1 added glow for the tremor build-up and spit wind-up. */
  uLavaTelegraph: { value: number };
  uLava: { value: THREE.Color };
  uLavaHot: { value: THREE.Color };
  uScale: { value: number };
  /**
   * 0 hot .. 1 cooled: blends the crust and plate colours (and their ember) to the cooled ones in the shader. The actor FX
   * clones every MeshStandardMaterial per mesh on the first telegraph, so `material.color` / `emissive` would not reach the
   * clones; shared uniforms do (the clone chains this patch).
   */
  uCooled: { value: number };
  uCooledColor: { value: THREE.Color };
  uEmberCooled: { value: THREE.Color };
  uPlateCooled: { value: THREE.Color };
}

export interface SlagmawModel {
  /** Origin = the surface spot on the floor; yaw 0 faces -Z. */
  readonly root: THREE.Group;
  /** The hurtbox owner. */
  readonly owner: THREE.Object3D;
  /** Head plus the first three segments. */
  readonly hurtboxes: HurtboxSet;
  /** 0 = fully under the floor, 1 = fully up (reared). Erupts the head and neck upward, the tail follows; below 0.05 the root is hidden. */
  setEmergence(e: number): void;
  /** Swaps the crust and lava colours to LOOK.cooledColor and dims the lava, seams, eyes and maw. */
  setCooled(cooled: boolean): void;
  /** 0..1 lava glow (tremor build-up, spit wind-up): flares the veins, seams, eyes and the maw. */
  setTelegraph(t: number): void;
  setOpacity(o: number): void;
  faceToward(x: number, z: number): void;
  /** Scrolls the lava shader time uniform and sways the body. */
  update(dt: number): void;
  /** Head position in world space (the spit origin). */
  headWorld(out: THREE.Vector3): THREE.Vector3;
  dispose(): void;
}

/** Below this emergence the whole worm is hidden (it is under the floor). */
export const HIDE_BELOW = 0.05;

/** The head and the first six body segments carry hurtboxes (segments 4 to 6 lie along the floor, within blade reach) (bones are plain Object3Ds named like this). */
export const HEAD_BONE = 'slagmaw-head';
export const segmentBone = (i: number): string => `slagmaw-seg-${i}`;

/**
 * The lava pattern samples the mesh's OBJECT-SPACE position (`transformed`) and never the world position or modelMatrix:
 * Deepdelve sits far from the origin and float32 world coordinates would jitter the noise (plans/act2-a0-far-coords.md).
 * Every body mesh is a unit sphere whose local Z is the body axis, so the veins are noise stretched along Z: long molten
 * streaks running down the body that widen toward the joints, instead of the rings an isotropic noise draws on a drum.
 */
const VERTEX_DECL = 'varying vec3 vLavaPos;';
const VERTEX_BODY = '\nvLavaPos = transformed;';
const FRAGMENT_DECL = `
varying vec3 vLavaPos;
uniform float uLavaTime;
uniform float uGlow;
uniform float uLavaTelegraph;
uniform vec3 uLava;
uniform vec3 uLavaHot;
uniform float uScale;
uniform float uCooled;
uniform vec3 uCooledColor;
uniform vec3 uEmberCooled;
float lavaHash( vec3 p ) { return fract( sin( dot( p, vec3( 127.1, 311.7, 74.7 ) ) ) * 43758.5453 ); }
float lavaNoise( vec3 p ) {
  vec3 i = floor( p ); vec3 f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
  float a = mix( mix( lavaHash( i ), lavaHash( i + vec3( 1.0, 0.0, 0.0 ) ), f.x ),
                 mix( lavaHash( i + vec3( 0.0, 1.0, 0.0 ) ), lavaHash( i + vec3( 1.0, 1.0, 0.0 ) ), f.x ), f.y );
  float b = mix( mix( lavaHash( i + vec3( 0.0, 0.0, 1.0 ) ), lavaHash( i + vec3( 1.0, 0.0, 1.0 ) ), f.x ),
                 mix( lavaHash( i + vec3( 0.0, 1.0, 1.0 ) ), lavaHash( i + vec3( 1.0, 1.0, 1.0 ) ), f.x ), f.y );
  return mix( a, b, f.z );
}`;
const FRAGMENT_BODY = `
diffuseColor.rgb = mix( diffuseColor.rgb, uCooledColor, uCooled );
totalEmissiveRadiance = mix( totalEmissiveRadiance, uEmberCooled, uCooled );
// Streaks: stripes around the axis (angle about object-space Z) whose phase wanders slowly along Z, broken into dashes,
// so the lava runs down the body in long cracks. The angle enters through fract and (cos, sin) only, so there is no seam.
float lavaTh = atan( vLavaPos.y, vLavaPos.x );
vec2 lavaCs = vec2( cos( lavaTh ), sin( lavaTh ) );
float lavaZ = vLavaPos.z * uScale;
float lavaWob = lavaNoise( vec3( lavaCs * 1.4, lavaZ * 0.9 - uLavaTime * 0.08 ) );
float lavaS = fract( lavaTh * ( 7.0 / 6.2831853 ) + lavaWob * 1.8 + lavaZ * 0.15 );
float lavaD = min( lavaS, 1.0 - lavaS );
float lavaS2 = fract( lavaTh * ( 13.0 / 6.2831853 ) + lavaNoise( vec3( lavaCs * 2.3 + 5.1, lavaZ * 1.4 ) ) * 2.4 );
float lavaD2 = min( lavaS2, 1.0 - lavaS2 );
// Wider, hotter cracks toward the joints (|z| -> 1), where the lava pours out of the seams.
float lavaEnd = smoothstep( 0.45, 1.0, abs( vLavaPos.z ) );
float lavaW = mix( 0.05, 0.1, lavaEnd ) * ( 0.6 + 0.8 * lavaNoise( vec3( lavaCs * 3.0, lavaZ * 2.5 ) ) );
float lavaMask = smoothstep( 0.3, 0.55, lavaNoise( vec3( lavaCs * 2.2 + 11.0, lavaZ * 1.8 - uLavaTime * 0.15 ) ) );
float lavaVein = ( 1.0 - smoothstep( 0.0, lavaW, lavaD ) ) * mix( lavaMask, 1.0, lavaEnd );
lavaVein = max( lavaVein, ( 1.0 - smoothstep( 0.0, lavaW * 0.5, lavaD2 ) ) * 0.4 * lavaMask );
float lavaB = lavaNoise( vec3( lavaCs * 2.0, lavaZ * 2.0 + uLavaTime * 0.3 ) );
lavaVein *= 0.7 + 0.3 * lavaB;
lavaVein += lavaEnd * lavaEnd * 0.3;
vec3 lavaCol = mix( uLava, uLavaHot, clamp( lavaB * 0.7 + lavaEnd * 0.4, 0.0, 1.0 ) );
totalEmissiveRadiance += lavaCol * lavaVein * ( uGlow + uLavaTelegraph * 1.5 );`;

interface Patchable {
  uniforms: Record<string, { value: unknown }>;
  vertexShader: string;
  fragmentShader: string;
}

/** Injects the scrolling lava into a MeshStandardMaterial's shader (an `onBeforeCompile` body). */
export function patchLavaShader(shader: Patchable, u: SlagmawUniforms): void {
  for (const [k, v] of Object.entries(u)) shader.uniforms[k] = v;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${VERTEX_DECL}`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>${VERTEX_BODY}`);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>${FRAGMENT_DECL}`)
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>${FRAGMENT_BODY}`);
}

/** The armour plates only blend to the cooled slate and lose their ember (uniform-driven, so the FX clones follow). */
function patchPlateShader(shader: Patchable, u: SlagmawUniforms): void {
  shader.uniforms.uCooled = u.uCooled;
  shader.uniforms.uPlateCooled = u.uPlateCooled;
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform float uCooled;\nuniform vec3 uPlateCooled;')
    .replace(
      '#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\ndiffuseColor.rgb = mix( diffuseColor.rgb, uPlateCooled, uCooled );\ntotalEmissiveRadiance *= 1.0 - uCooled;',
    );
}

/**
 * Light-free glow: a view-facing gradient (bright where the surface faces the camera, falling off to the silhouette), in view
 * space from modelViewMatrix only (computed on the CPU in doubles, so far coordinates are safe). `additive` makes a soft halo
 * (AdditiveBlending, depthWrite off); otherwise it is an opaque molten surface (the seam cores, eyes and throat).
 */
const GLOW_VERTEX = `
varying vec3 vGlowN;
varying vec3 vGlowV;
void main() {
  vec4 mv = modelViewMatrix * vec4( position, 1.0 );
  vGlowN = normalize( normalMatrix * normal );
  vGlowV = normalize( -mv.xyz );
  gl_Position = projectionMatrix * mv;
}`;
const GLOW_FRAGMENT = `
uniform vec3 uCore;
uniform vec3 uRim;
uniform float uIntensity;
uniform float uOpacity;
uniform float uPower;
uniform float uAdditive;
varying vec3 vGlowN;
varying vec3 vGlowV;
void main() {
  float f = pow( clamp( abs( dot( normalize( vGlowN ), normalize( vGlowV ) ) ), 0.0, 1.0 ), uPower );
  vec3 c = mix( uRim, uCore, f ) * uIntensity;
  gl_FragColor = uAdditive > 0.5 ? vec4( c * f, uOpacity ) : vec4( c, uOpacity );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

interface Glow {
  material: THREE.ShaderMaterial;
  u: { uCore: { value: THREE.Color }; uRim: { value: THREE.Color }; uIntensity: { value: number }; uOpacity: { value: number }; uPower: { value: number }; uAdditive: { value: number } };
  hot: [number, number];
  cool: [number, number];
  /** Intensity hot, cooled, and the extra fraction a full telegraph adds. */
  base: number;
  cooledBase: number;
  flare: number;
  additive: boolean;
}

function makeGlow(name: string, o: { hot: [number, number]; cool: [number, number]; intensity: number; cooledIntensity: number; flare: number; power: number; additive?: boolean; side?: THREE.Side }): Glow {
  const additive = !!o.additive;
  const u = {
    uCore: { value: new THREE.Color(o.hot[0]) },
    uRim: { value: new THREE.Color(o.hot[1]) },
    uIntensity: { value: o.intensity },
    uOpacity: { value: 1 },
    uPower: { value: o.power },
    uAdditive: { value: additive ? 1 : 0 },
  };
  const material = new THREE.ShaderMaterial({
    name,
    uniforms: u,
    vertexShader: GLOW_VERTEX,
    fragmentShader: GLOW_FRAGMENT,
    side: o.side ?? THREE.FrontSide,
    transparent: additive,
    depthWrite: !additive,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  return { material, u, hot: o.hot, cool: o.cool, base: o.intensity, cooledBase: o.cooledIntensity, flare: o.flare, additive };
}

const GLOW_HOT = 0.8;
const GLOW_COOLED = 0.1;
/** How far below the floor a fully buried segment sits (m). */
const BURY_DEPTH = LOOK.headRadius * 2.4;
/** Height of the head's centre when fully reared (m). */
const REAR_HEIGHT = 3.6;
/** Extra downward pitch of the head (rad) so the maw looks down at the player. */
const HEAD_PITCH = -0.05;

/**
 * The reared spine, head to tail, in root space (x right, y up, -z forward): the head hangs forward over the burrow spot
 * looking down, the neck arches back in an S and plunges to the floor, then the body lies half-sunk in a lazy curve.
 */
const SPINE: readonly [number, number, number][] = [
  [0, REAR_HEIGHT, -0.4],
  [0, REAR_HEIGHT + 0.85, 0.7],
  [0, REAR_HEIGHT + 0.7, 2.0],
  [0.1, 2.6, 3.0],
  [0.25, 1.1, 3.6],
  [0.45, 0.4, 4.7],
  [0.9, 0.25, 6.2],
  [0.8, 0.2, 7.8],
  [0.0, 0.18, 9.4],
  [-0.8, 0.15, 11.0],
  [-1.2, 0.1, 13.0],
];

/** Ease-out with a small overshoot: the head bursts a little past its pose and settles back (an eruption, not a lift). */
const easeOut = (t: number): number => {
  const c = 1.4;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
};

/**
 * Builds the Slagmaw: a segmented lava worm made of spheres (head plus LOOK.segments - 1 body segments tapering to the tail)
 * that rears up in an S curve when surfaced. One crust material with a scrolling lava shader, shared plate material,
 * light-free glow materials for the seams, eyes and maw. Fully procedural, no assets.
 */
export function buildSlagmawModel(): SlagmawModel {
  const root = new THREE.Group();
  root.name = 'boss-the-slagmaw';
  const body = new THREE.Group();
  body.name = 'slagmaw-body';
  root.add(body);

  const uniforms: SlagmawUniforms = {
    uLavaTime: { value: 0 },
    uGlow: { value: GLOW_HOT },
    uLavaTelegraph: { value: 0 },
    uLava: { value: new THREE.Color(LOOK.lavaColor) },
    uLavaHot: { value: new THREE.Color(LOOK.lavaHot) },
    uScale: { value: 1.6 },
    uCooled: { value: 0 },
    uCooledColor: { value: new THREE.Color(LOOK.cooledColor) },
    uEmberCooled: { value: new THREE.Color(LOOK.crustEmberCooled) },
    uPlateCooled: { value: new THREE.Color(LOOK.plateCooled) },
  };
  const material = new THREE.MeshStandardMaterial({ color: LOOK.crustColor, roughness: 0.85, metalness: 0.05, emissive: LOOK.crustEmber });
  material.name = 'slagmaw-crust';
  material.userData.slagmawUniforms = uniforms;
  material.onBeforeCompile = (shader) => patchLavaShader(shader as unknown as Patchable, uniforms);
  material.customProgramCacheKey = () => 'slagmaw-lava';

  const geometry = new THREE.SphereGeometry(1, 22, 16);
  // The skull: the same sphere with an open hole at the front (-Z) for the maw.
  const SKULL_GEO = new THREE.SphereGeometry(1, 22, 16, 0, Math.PI * 2, 0.62, Math.PI - 0.62);
  SKULL_GEO.rotateX(-Math.PI / 2);
  const LIP_GEO = new THREE.TorusGeometry(1, 0.2, 8, 20);
  const JAW_GEO = new THREE.ConeGeometry(0.2 * LOOK.headRadius, 1.9 * LOOK.headRadius, 7);
  JAW_GEO.translate(0, 0.95 * LOOK.headRadius, 0); // pivot at the base so the tip swings
  const TOOTH_GEO = new THREE.ConeGeometry(0.5, 1, 5);
  TOOTH_GEO.translate(0, 0.5, 0);
  const FIN_GEO = new THREE.ConeGeometry(0.5, 1, 4);
  FIN_GEO.rotateY(Math.PI / 4);
  const plateMaterial = new THREE.MeshStandardMaterial({ color: LOOK.plateColor, roughness: 0.75, metalness: 0.15, emissive: LOOK.plateEmber, emissiveIntensity: 0.35 });
  plateMaterial.name = 'slagmaw-plate';
  plateMaterial.onBeforeCompile = (shader) => patchPlateShader(shader as unknown as Patchable, uniforms);
  plateMaterial.customProgramCacheKey = () => 'slagmaw-plate';

  const cooledRim = LOOK.seamCooled;
  const seamCore = makeGlow('slagmaw-seam', { hot: [LOOK.lavaColor, 0x7a1404], cool: [cooledRim, 0x1e0d08], intensity: 1.0, cooledIntensity: 0.7, flare: 1.0, power: 2.0 });
  const seamHalo = makeGlow('slagmaw-seam-halo', { hot: [LOOK.lavaHot, LOOK.lavaColor], cool: [cooledRim, cooledRim], intensity: 0.5, cooledIntensity: 0.04, flare: 1.4, power: 3.0, additive: true });
  const throat = makeGlow('slagmaw-throat', { hot: [0xfff2b0, 0x9a1e06], cool: [0x6a3020, 0x140806], intensity: 1.3, cooledIntensity: 0.6, flare: 1.0, power: 3.5, side: THREE.BackSide });
  const mawHalo = makeGlow('slagmaw-maw-halo', { hot: [LOOK.lavaHot, LOOK.lavaColor], cool: [cooledRim, cooledRim], intensity: 0.2, cooledIntensity: 0.0, flare: 2.5, power: 2.5, additive: true });
  const eyeCore = makeGlow('slagmaw-eye', { hot: [0xfffbe0, LOOK.lavaHot], cool: [0x8a4a30, 0x2a120a], intensity: 1.8, cooledIntensity: 0.5, flare: 0.6, power: 0.8 });
  const eyeHalo = makeGlow('slagmaw-eye-halo', { hot: [LOOK.lavaHot, LOOK.lavaColor], cool: [cooledRim, cooledRim], intensity: 0.35, cooledIntensity: 0.0, flare: 0.8, power: 3.0, additive: true });
  const glows = [seamCore, seamHalo, throat, mawHalo, eyeCore, eyeHalo];
  const extras = [plateMaterial];

  const n = Math.max(2, LOOK.segments);
  const parts: { node: THREE.Group; radius: number; index: number }[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, shadow = false): THREE.Mesh => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = shadow;
    parent.add(m);
    return m;
  };
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1);
    const radius = THREE.MathUtils.lerp(LOOK.headRadius, LOOK.tailRadius, k);
    const node = new THREE.Group();
    node.name = i === 0 ? HEAD_BONE : segmentBone(i);
    const mesh = new THREE.Mesh(i === 0 ? SKULL_GEO : geometry, material);
    // Each segment is a flattened drum: short along the body so the joints pinch hard.
    const half = LOOK.segmentSpacing * 0.56;
    mesh.scale.set(radius, radius * 0.95, Math.min(half, radius));
    if (i === 1) mesh.scale.x *= 0.85; // the neck is slimmer than the skull and the first body drum
    // The spheres are symmetric about Z: a different roll per segment varies the object-space lava without any per-mesh uniform.
    if (i > 0) mesh.rotation.z = i * 1.7;
    mesh.castShadow = true;
    mesh.name = `${node.name}-mesh`;
    node.add(mesh);
    if (i === 0) {
      // A heavy armoured skull with a round lamprey maw (-Z): a plated lip, a ring of teeth, a molten throat, two mandibles.
      const sx = radius * 1.1;
      const sz = radius * 1.3;
      mesh.scale.set(sx, radius * 1.0, sz);
      const holeR = Math.sin(0.62) * radius; // the skull's opening, before the x squash
      const holeZ = -Math.cos(0.62) * sz;
      const lip = add(node, LIP_GEO, plateMaterial, true);
      lip.scale.set(holeR * 1.05, holeR * 0.95, holeR * 0.9);
      lip.position.set(0, 0, holeZ + radius * 0.02);
      const gullet = add(node, geometry, throat.material);
      gullet.scale.set(holeR * 1.15, holeR * 1.05, radius * 0.75);
      gullet.position.set(0, 0, holeZ + radius * 0.55);
      const halo = add(node, geometry, mawHalo.material);
      halo.scale.set(holeR * 1.55, holeR * 1.45, radius * 0.45);
      halo.position.set(0, 0, holeZ - radius * 0.05);
      halo.renderOrder = 2;
      for (let t = 0; t < 6; t++) {
        const a = (t / 6) * Math.PI * 2 + Math.PI / 6;
        const tooth = add(node, TOOTH_GEO, plateMaterial);
        const cx = Math.cos(a);
        const cy = Math.sin(a);
        tooth.position.set(cx * holeR * 1.0, cy * holeR * 0.92, holeZ - radius * 0.05);
        tooth.scale.set(radius * 0.13, radius * 0.42, radius * 0.13);
        tooth.quaternion.setFromUnitVectors(up, new THREE.Vector3(-cx * 0.55, -cy * 0.55, -1).normalize());
      }
      for (const side of [-1, 1]) {
        const jaw = add(node, JAW_GEO, plateMaterial, true);
        jaw.position.set(side * radius * 0.7, -radius * 0.3, holeZ + radius * 0.25);
        jaw.quaternion.setFromUnitVectors(up, new THREE.Vector3(-side * 0.22, -0.12, -1).normalize());
        jaw.scale.set(1, 0.7, 1);
        // Two pairs of small slit eyes set into the brow line beside the maw, each a molten bead with a soft halo.
        for (const [ex, ey, es] of [[0.62, 0.5, 1], [0.8, 0.22, 0.7]] as const) {
          const dir = new THREE.Vector3(side * ex, ey, -0.62).normalize();
          const p = new THREE.Vector3(dir.x * sx, dir.y * radius, dir.z * sz).multiplyScalar(0.97);
          const eye = add(node, geometry, eyeCore.material);
          eye.position.copy(p);
          eye.scale.set(radius * 0.11 * es, radius * 0.06 * es, radius * 0.08 * es);
          eye.rotation.z = side * 0.35;
          const glow = add(node, geometry, eyeHalo.material);
          glow.position.copy(p).multiplyScalar(1.02);
          glow.scale.setScalar(radius * 0.18 * es);
          glow.renderOrder = 2;
        }
      }
    } else {
      // A tall dorsal blade on every body segment plus flank spines on the front ones, so the line reads as an armoured worm.
      const fin = add(node, FIN_GEO, plateMaterial, true);
      fin.scale.set(radius * 0.45, radius * 1.05, radius * 1.5);
      fin.position.y = radius * 0.95;
      if (i <= 6) {
        for (const side of [-1, 1]) {
          const spine = add(node, FIN_GEO, plateMaterial, true);
          spine.scale.set(radius * 0.3, radius * 0.75, radius * 0.9);
          spine.position.set(side * radius * 0.78, radius * 0.5, 0);
          spine.rotation.z = -side * 1.0;
        }
      }
    }
    body.add(node);
    parts.push({ node, radius, index: i });
  }
  // A molten seam bead in each joint, between segment i-1 and i, wrapped in a soft additive halo (positioned in layout()).
  const seams: THREE.Mesh[] = [];
  const halos: THREE.Mesh[] = [];
  for (let i = 1; i < n; i++) {
    const r = (parts[i - 1].radius + parts[i].radius) / 2;
    const s = new THREE.Mesh(geometry, seamCore.material);
    s.name = `slagmaw-seam-${i}`;
    s.scale.set(r * 0.7, r * 0.7, r * 0.5);
    const h = new THREE.Mesh(geometry, seamHalo.material);
    h.name = `slagmaw-seam-halo-${i}`;
    h.scale.set(r * 1.2, r * 1.2, r * 0.7);
    h.renderOrder = 2;
    body.add(s, h);
    seams.push(s);
    halos.push(h);
  }

  // Hurtboxes: head and the first six body segments (4 to 6 lie low on the floor so a 1.8 m knight can reach them), a capsule across each sphere along the body axis.
  const defs: HurtboxDef[] = parts.slice(0, 7).map((p) => ({
    name: p.index === 0 ? 'head' : `segment${p.index}`,
    bone: p.node.name,
    start: { x: 0, y: 0, z: -p.radius * 0.3 },
    end: { x: 0, y: 0, z: p.radius * 0.3 },
    radius: p.radius * 0.95,
  }));

  // The reared pose: each segment at its arc length along the spine, its +Z (toward the tail) along the tangent.
  const curve = new THREE.CatmullRomCurve3(SPINE.map(([x, y, z]) => new THREE.Vector3(x, y, z)), false, 'centripetal');
  const length = curve.getLength();
  const rest = parts.map((p) => {
    const u = Math.min(1, (p.index * LOOK.segmentSpacing) / length);
    const pos = curve.getPointAt(u);
    // The floor-lying segments sink by their size so the drums look half-buried rather than resting on top.
    if (pos.y < 1) pos.y = Math.min(pos.y, p.radius * 0.35);
    const quat = basis(curve.getTangentAt(u));
    if (p.index === 0) quat.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), HEAD_PITCH));
    // Buried: the head and neck dive nose-up under the burrow spot, so they erupt upward; the rest waits under its spot.
    const rising = p.index <= 3;
    const buriedPos = new THREE.Vector3(pos.x, -BURY_DEPTH - p.radius - (rising ? pos.y * 0.6 : 0), rising ? THREE.MathUtils.lerp(pos.z, 0.6, 0.6) : pos.z);
    const buriedQuat = rising ? basis(new THREE.Vector3(0, -1, 0.35)) : quat.clone();
    return { pos, quat, buriedPos, buriedQuat };
  });

  let emergence = 1;
  let swayT = 0;
  let cooled = false;
  let telegraph = 0;
  let opacity = 1;
  let disposed = false;
  const tmpQ = new THREE.Quaternion();
  const swayQ = new THREE.Quaternion();
  const yAxis = new THREE.Vector3(0, 1, 0);

  const layout = (): void => {
    for (const p of parts) {
      const i = p.index;
      const k = i / (n - 1);
      // Head first, the tail last: each segment's own 0..1 rise, eased out so the eruption snaps up and settles.
      const local = easeOut(THREE.MathUtils.clamp((emergence - k * 0.35) / 0.65, 0, 1));
      const r = rest[i];
      p.node.position.lerpVectors(r.buriedPos, r.pos, local);
      // The reared neck weaves like a cobra; the lying body slithers a little.
      const reared = Math.max(0, 1 - k * 2.2);
      const sway = Math.sin(swayT * 1.1 - i * 0.6) * (0.22 * reared + 0.12 * k) * local;
      p.node.position.x += sway;
      p.node.position.y += Math.sin(swayT * 1.7 - i * 0.5) * 0.06 * reared * local;
      tmpQ.slerpQuaternions(r.buriedQuat, r.quat, local);
      swayQ.setFromAxisAngle(yAxis, Math.cos(swayT * 1.1 - i * 0.6) * 0.12 * reared * local);
      p.node.quaternion.copy(swayQ).multiply(tmpQ);
    }
    for (let i = 1; i < n; i++) {
      const a = parts[i - 1].node;
      const b = parts[i].node;
      seams[i - 1].position.lerpVectors(a.position, b.position, 0.5);
      seams[i - 1].quaternion.slerpQuaternions(a.quaternion, b.quaternion, 0.5);
      halos[i - 1].position.copy(seams[i - 1].position);
      halos[i - 1].quaternion.copy(seams[i - 1].quaternion);
    }
  };

  layout();
  root.updateMatrixWorld(true);
  const hurtboxes = new HurtboxSet(root, defs, body);

  const applyGlow = (): void => {
    for (const g of glows) {
      const [core, rim] = cooled ? g.cool : g.hot;
      g.u.uCore.value.set(core);
      g.u.uRim.value.set(rim);
      g.u.uIntensity.value = (cooled ? g.cooledBase : g.base) * (1 + g.flare * telegraph);
    }
  };
  const applyCooled = (): void => {
    uniforms.uCooled.value = cooled ? 1 : 0;
    uniforms.uLava.value.set(cooled ? LOOK.cooledColor : LOOK.lavaColor);
    uniforms.uLavaHot.value.set(cooled ? LOOK.cooledColor : LOOK.lavaHot);
    uniforms.uGlow.value = cooled ? GLOW_COOLED : GLOW_HOT;
    applyGlow();
  };
  const headPos = new THREE.Vector3();

  return {
    root,
    owner: body,
    hurtboxes,
    setEmergence(e) {
      emergence = THREE.MathUtils.clamp(Number.isFinite(e) ? e : 0, 0, 1);
      root.visible = emergence >= HIDE_BELOW;
      layout();
    },
    setCooled(c) {
      cooled = !!c;
      applyCooled();
    },
    setTelegraph(t) {
      telegraph = THREE.MathUtils.clamp(Number.isFinite(t) ? t : 0, 0, 1);
      uniforms.uLavaTelegraph.value = telegraph;
      applyGlow();
    },
    setOpacity(o) {
      opacity = THREE.MathUtils.clamp(Number.isFinite(o) ? o : 1, 0, 1);
      const transparent = opacity < 1;
      for (const m of [material, ...extras]) {
        if (m.transparent !== transparent) m.needsUpdate = true;
        m.transparent = transparent;
        m.opacity = opacity;
      }
      for (const g of glows) {
        g.u.uOpacity.value = opacity;
        if (!g.additive && g.material.transparent !== transparent) {
          g.material.transparent = transparent;
          g.material.needsUpdate = true;
        }
      }
    },
    faceToward(x, z) {
      const dx = x - root.position.x;
      const dz = z - root.position.z;
      if (!Number.isFinite(dx) || !Number.isFinite(dz) || Math.hypot(dx, dz) < 1e-6) return;
      // Yaw 0 faces -Z.
      root.rotation.y = Math.atan2(-dx, -dz);
    },
    update(dt) {
      if (!(dt > 0) || !Number.isFinite(dt)) return;
      uniforms.uLavaTime.value += dt;
      swayT += dt;
      layout();
    },
    headWorld(out) {
      root.updateMatrixWorld(true);
      headPos.copy(parts[0].node.position);
      return out.copy(root.localToWorld(headPos));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      hurtboxes.dispose();
      for (const g of [geometry, SKULL_GEO, LIP_GEO, JAW_GEO, TOOTH_GEO, FIN_GEO]) g.dispose();
      for (const g of glows) g.material.dispose();
      plateMaterial.dispose();
      material.dispose();
      root.removeFromParent();
    },
  };
}

/** A rotation whose +Z runs along `dir` and whose +Y stays as close to world up as it can. */
function basis(dir: THREE.Vector3): THREE.Quaternion {
  const z = dir.clone().normalize();
  const x = new THREE.Vector3(0, 1, 0).cross(z);
  if (x.lengthSq() < 1e-6) x.set(1, 0, 0);
  x.normalize();
  const y = new THREE.Vector3().crossVectors(z, x);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}
