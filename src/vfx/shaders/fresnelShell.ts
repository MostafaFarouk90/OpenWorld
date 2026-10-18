import * as THREE from 'three';
import { FRESNEL_FRAGMENT, FRESNEL_VERTEX, SHOCK_FRAGMENT, SHOCK_VERTEX } from './glsl';

/** Additive fresnel rim shell. Rendered front faces; the rim term already hides the centre. */
export function createFresnelShell(opts: { radius: number; color: number; intensity?: number }): THREE.Mesh {
  const geo = new THREE.SphereGeometry(Math.max(0.001, opts.radius), 32, 20);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(opts.color) },
      uIntensity: { value: opts.intensity ?? 1.5 },
      uProgress: { value: 0 },
    },
    vertexShader: FRESNEL_VERTEX,
    fragmentShader: FRESNEL_FRAGMENT,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.FrontSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'fresnelShell';
  mesh.frustumCulled = false;
  return mesh;
}

/** Flat (XZ) additive shockwave ring that expands with uProgress. */
export function createShockRing(opts: { inner: number; outer: number; color: number }): THREE.Mesh {
  const inner = Math.max(0, Math.min(opts.inner, opts.outer));
  const outer = Math.max(opts.outer, inner + 0.001);
  const geo = new THREE.RingGeometry(inner, outer, 64);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(opts.color) },
      uProgress: { value: 0 },
      uInner: { value: inner },
      uOuter: { value: outer },
      uExpand: { value: 4 },
    },
    vertexShader: SHOCK_VERTEX,
    fragmentShader: SHOCK_FRAGMENT,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'shockRing';
  mesh.frustumCulled = false;
  return mesh;
}

function setProgress(mesh: THREE.Mesh, p: number): void {
  const u = (mesh.material as THREE.ShaderMaterial).uniforms?.uProgress;
  if (u) u.value = Number.isFinite(p) ? Math.min(1, Math.max(0, p)) : 0;
}
export function setShellProgress(mesh: THREE.Mesh, p: number): void {
  setProgress(mesh, p);
}
export function setRingProgress(mesh: THREE.Mesh, p: number): void {
  setProgress(mesh, p);
}

export function disposeFx(mesh: THREE.Mesh): void {
  mesh.removeFromParent();
  mesh.geometry.dispose();
  const m = mesh.material;
  if (Array.isArray(m)) m.forEach((x) => x.dispose());
  else m.dispose();
}
