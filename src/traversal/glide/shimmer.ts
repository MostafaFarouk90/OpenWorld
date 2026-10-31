// The Dragonspine's lift made visible (design 7.5): once the Last Anvil burns (`shrine.last-anvil.lit`), each thermal
// shows as a soft column of heat shimmer and each slope-wind lane as faint streaks running up its slope. Scripted
// geometry and one additive shader; the noise samples each mesh's own (local) coordinates, so it stays steady at the
// Dragonspine's far engine coordinates (the farPrecision rule). The lift works before the shrine is lit.
import * as THREE from 'three';
import type { Vec3Like } from '../../core/events';
import type { UpdraftDef } from '../../movement/types';
import { heightAt } from '../../terrain/heightfield';
import { GLIDE_LANES, GLIDE_UPDRAFTS, type GlideLane } from './lanes';

/** Hidden beyond this distance from the player (m): the summit's lanes are seen from the ledges, not from Greyfen. */
export const SHIMMER_VIEW_DISTANCE = 2500;
/** The streaks ride this high over the slope (m), inside the wind's full-lift band. */
export const STREAK_HEIGHT = 6;
const STREAK_WIDTH = 40;
const STREAK_STEP = 40;

const VERT = /* glsl */ `
varying vec3 vLocal;
varying vec2 vUv;
varying float vDist;
void main() {
  vLocal = position;
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDist = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

// Cheap value noise on local coordinates scrolled upward (columns) or along the lane (streaks).
const FRAG = /* glsl */ `
uniform float uTime;
uniform float uStreak;
uniform vec3 uColor;
uniform float uOpacity;
varying vec3 vLocal;
varying vec2 vUv;
varying float vDist;
float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float noise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash(i), n100 = hash(i + vec3(1, 0, 0)), n010 = hash(i + vec3(0, 1, 0)), n110 = hash(i + vec3(1, 1, 0));
  float n001 = hash(i + vec3(0, 0, 1)), n101 = hash(i + vec3(1, 0, 1)), n011 = hash(i + vec3(0, 1, 1)), n111 = hash(i + vec3(1, 1, 1));
  return mix(mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y), mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y), f.z);
}
void main() {
  float a;
  if (uStreak > 0.5) {
    // Thin bands across the strip, sliding up the lane (the wind blows up the slope, against the glide).
    float across = 1.0 - abs(vUv.x - 0.5) * 2.0;
    float band = noise(vec3(vUv.x * 9.0, vUv.y * 0.6 - uTime * 0.8, 0.0));
    a = smoothstep(0.62, 0.9, band) * across;
  } else {
    // Rising flicker, fading at the column's base, top and silhouette.
    float h = vUv.y;
    float edge = smoothstep(0.0, 0.15, h) * (1.0 - smoothstep(0.7, 1.0, h));
    float n = noise(vec3(vLocal.x * 0.3, vLocal.y * 0.12 - uTime * 1.2, vLocal.z * 0.3));
    a = smoothstep(0.55, 0.9, n) * edge;
  }
  // Faint up close (a glider inside a column sees the haze, not a wall), clearest from 150 m off.
  a *= smoothstep(15.0, 150.0, vDist);
  gl_FragColor = vec4(uColor, a * uOpacity);
}`;

function material(streak: boolean): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uTime: { value: 0 },
      uStreak: { value: streak ? 1 : 0 },
      uColor: { value: new THREE.Color(streak ? 0xdfe8f0 : 0xffd6a0) },
      uOpacity: { value: streak ? 0.12 : 0.1 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

/** An open cylinder over the column, its base at `centre.y`, positioned at the centre. */
export function columnMesh(u: UpdraftDef): THREE.Mesh {
  const g = new THREE.CylinderGeometry(u.radius, u.radius, u.height, 32, 8, true);
  g.translate(0, u.height / 2, 0);
  const m = new THREE.Mesh(g, material(false));
  m.position.set(u.centre.x, u.centre.y, u.centre.z);
  m.name = `shimmer:${u.id}`;
  m.frustumCulled = true;
  return m;
}

/** A ribbon from the lip to where the wind stops, `STREAK_HEIGHT` m over the ground, its vertices local to the lip. */
export function streakMesh(lane: GlideLane, ground: (x: number, z: number) => number = heightAt): THREE.Mesh {
  const { x: lx, z: lz } = lane.site.ledge;
  const ly = lane.site.ledge.y;
  const fx = -Math.sin(lane.def.heading);
  const fz = -Math.cos(lane.def.heading);
  const steps = Math.max(1, Math.ceil(lane.windStop / STREAK_STEP));
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const d = (lane.windStop * i) / steps;
    for (const side of [-1, 1]) {
      const ox = fx * d + fz * side * (STREAK_WIDTH / 2);
      const oz = fz * d - fx * side * (STREAK_WIDTH / 2);
      pos.push(ox, ground(lx + ox, lz + oz) + STREAK_HEIGHT - ly, oz);
      uv.push(side < 0 ? 0 : 1, d / STREAK_STEP);
    }
    if (i > 0) {
      const a = (i - 1) * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, material(true));
  m.position.set(lx, ly, lz);
  m.name = `shimmer:${lane.def.id}`;
  return m;
}

export class GlideShimmer {
  readonly group = new THREE.Group();
  private readonly materials: THREE.ShaderMaterial[] = [];
  private time = 0;
  private built = false;

  constructor(
    private readonly scene: THREE.Object3D,
    private readonly playerFeet: () => Vec3Like,
    private readonly updrafts: readonly UpdraftDef[] = GLIDE_UPDRAFTS,
    private readonly lanes: readonly GlideLane[] = GLIDE_LANES,
  ) {
    this.group.name = 'traversal.glide.shimmer';
    this.group.visible = false;
  }

  get visible(): boolean {
    return this.group.visible;
  }

  /** Each frame: shown only once `lit`, and only near the Dragonspine. Built on first show. */
  update(dt: number, lit: boolean): void {
    const f = this.playerFeet();
    const near = lit && this.nearAny(f);
    if (near && !this.built) this.build();
    this.group.visible = near;
    if (!near) return;
    // Wrapped hourly: small numbers for the GPU's noise, one pop an hour at most.
    this.time = (this.time + dt) % 3600;
    for (const m of this.materials) m.uniforms.uTime!.value = this.time;
  }

  dispose(): void {
    this.group.removeFromParent();
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    for (const m of this.materials) m.dispose();
    this.materials.length = 0;
  }

  private build(): void {
    this.built = true;
    const add = (m: THREE.Mesh) => {
      this.materials.push(m.material as THREE.ShaderMaterial);
      this.group.add(m);
    };
    for (const u of this.updrafts) add(columnMesh(u));
    for (const l of this.lanes) if (l.wind > 0) add(streakMesh(l));
    this.scene.add(this.group);
  }

  private nearAny(f: Vec3Like): boolean {
    const d2 = SHIMMER_VIEW_DISTANCE * SHIMMER_VIEW_DISTANCE;
    for (const l of this.lanes) {
      const dx = f.x - l.site.ledge.x;
      const dz = f.z - l.site.ledge.z;
      if (dx * dx + dz * dz < d2) return true;
    }
    return false;
  }
}
