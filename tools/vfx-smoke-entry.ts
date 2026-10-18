// Headless shader smoke for the VFX layer: builds a real WebGLRenderer, spawns every slice effect,
// runs the dissolve/telegraph material patches on a skinned-free mesh, renders and reports any GLSL
// compile error. Driven by tools/smoke-vfx.mjs (playwright + swiftshader); not part of the game bundle.
import * as THREE from 'three';
import { VfxServiceImpl } from '../src/vfx/VfxServiceImpl';
import { EFFECT_IDS } from '../src/vfx/types';
import { BloomPostPass } from '../src/quality/BloomPass';

declare global {
  interface Window {
    __vfxSmoke?: { errors: string[]; live: Record<string, number>; done: boolean };
  }
}

const out = { errors: [] as string[], live: {} as Record<string, number>, done: false };
window.__vfxSmoke = out;
try {
  const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('c') as HTMLCanvasElement });
  renderer.debug.onShaderError = (_gl, _prog, vs, fs) => {
    out.errors.push(`shader error vs=${vs.getShaderInfoLog?.call(_gl, vs) ?? ''} fs=${fs.getShaderInfoLog?.call(_gl, fs) ?? ''}`);
  };
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 1), new THREE.DirectionalLight(0xffffff, 1));
  const camera = new THREE.PerspectiveCamera(60, 640 / 400, 0.1, 200);
  camera.position.set(0, 3, 8);
  camera.lookAt(0, 1, 0);

  const vfx = new VfxServiceImpl({ scene, heightAt: () => 0, actorRoot: (id) => (id === 'dummy' ? dummy : null) });
  const dummy = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 1.2), new THREE.MeshStandardMaterial({ color: 0x88aa88 }));
  dummy.position.set(0, 1, 0);
  scene.add(dummy);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1, 0.05));
  scene.add(blade);
  const markers = vfx.createWeaponMarkers(blade);
  const trail = vfx.attachTrail('smoke', markers.hilt, markers.tip);
  trail.setEmitting(true);

  for (const id of EFFECT_IDS) vfx.spawnEffect(id, { position: { x: 0, y: 0, z: 0 }, attach: id === 'wraith-dissolve' ? dummy : undefined });
  vfx.telegraph('dummy', 'block', 0.4);
  const bloom = new BloomPostPass(renderer, scene, camera);

  for (let i = 0; i < 40; i++) {
    blade.position.set(Math.sin(i / 5), 1, 0);
    vfx.trailDriver.tick(vfx.clock.now);
    vfx.update(1 / 60, false);
    if (i % 2) bloom.render(renderer, scene, camera, 16);
    else renderer.render(scene, camera);
  }
  out.live = { sparks: vfx.sparks.liveCount, points: vfx.points.liveCount, trails: vfx.trails.liveCount };
  const err = renderer.getContext().getError();
  if (err !== 0) out.errors.push(`gl error ${err}`);
} catch (e) {
  out.errors.push(String(e instanceof Error ? e.stack : e));
}
out.done = true;
