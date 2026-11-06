// Act 4 L3: the storm's screen-space ash layer, one full-screen quad (value-noise streaks, no depth, drawn last). The
// spike's prototype; its cost is fill rate, so Low runs it thinner. Render only.
import * as THREE from 'three';

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const FRAG = /* glsl */ `
uniform float uTime;
uniform float uAlpha;
uniform vec3 uColor;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
void main() {
  vec2 p = vUv * vec2(6.0, 3.0) + vec2(uTime * 0.9, uTime * 0.15);
  float n = noise(p) * 0.6 + noise(p * 2.7 + 3.1) * 0.4;
  float a = uAlpha * (0.55 + 0.45 * n);
  gl_FragColor = vec4(uColor, a);
}`;

export class AshLayer {
  readonly object: THREE.Mesh;
  private readonly mat: THREE.ShaderMaterial;
  private t = 0;

  constructor(color: number) {
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uTime: { value: 0 }, uAlpha: { value: 0 }, uColor: { value: new THREE.Color(color) } },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      fog: false,
    });
    this.object = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.object.frustumCulled = false;
    this.object.renderOrder = 10_000;
    this.object.visible = false;
    this.object.name = 'weather.ash-layer';
  }

  update(dt: number, alpha: number): void {
    this.t += dt;
    this.mat.uniforms.uTime.value = this.t;
    this.mat.uniforms.uAlpha.value = alpha;
    this.object.visible = alpha > 0.001;
  }

  get alpha(): number {
    return this.mat.uniforms.uAlpha.value as number;
  }

  dispose(): void {
    this.object.removeFromParent();
    this.object.geometry.dispose();
    this.mat.dispose();
  }
}
