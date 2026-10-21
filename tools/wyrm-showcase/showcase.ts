// Wyrm showcase (dev only, plans/act2-A6a.md 4): the Ember Wyrm, a wyrmling and Orsk at 3x side by side on their own
// renderer, at the origin or at the far edge of Cinderreach (`?far=1`). Open /tools/wyrm-showcase/ under `npx vite`.
// `?cam=` frames one exhibit; `?pose=ground|fly|spit|fold` picks the Ember Wyrm's pose; `?t=<seconds>` freezes the clock there (renders);
// `window.__showcase.ready` turns true after the first frame. Not part of the build or of vitest.
import * as THREE from 'three';
import { installFarPrecision } from '../../src/rendering/farPrecision';
import { WyrmRig, restPose, type RootFrame, type WyrmPose } from '../../src/enemies/wyrm/builder/rig';
import { WYRMLING } from '../../src/enemies/wyrm/tuning';

const Q = new URLSearchParams(location.search);
const W = Number(Q.get('w') ?? 1600);
const H = Number(Q.get('h') ?? 720);
const FAR = Q.get('far') === '1';
const POSE = Q.get('pose') ?? 'ground';
const FIXED_T = Q.has('t') ? Number(Q.get('t')) : null;
const BASE = FAR ? new THREE.Vector3(4000, 40, -3500) : new THREE.Vector3(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H);
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
installFarPrecision(renderer);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x3a3436);
scene.fog = new THREE.Fog(0x3a3436, 60, 160);
const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 500);
const sun = new THREE.DirectionalLight(0xfff0e0, 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 200 });
sun.position.copy(BASE).add(new THREE.Vector3(20, 50, 25));
sun.target.position.copy(BASE);
scene.add(sun, sun.target, new THREE.HemisphereLight(0xc8d0ff, 0x4a3020, 0.7));
const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 160).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x4d4440, roughness: 1 }));
ground.position.copy(BASE);
ground.receiveShadow = true;
scene.add(ground);

interface Exhibit {
  rig: WyrmRig;
  frame: RootFrame;
  pose: WyrmPose;
  altitude: number;
  animate(t: number, p: WyrmPose): number;
}

function exhibit(rig: WyrmRig, dx: number, yaw: number, animate: Exhibit['animate']): Exhibit {
  const frame = { x: BASE.x + dx, y: BASE.y, z: BASE.z, yaw };
  rig.root.position.set(frame.x, frame.y, frame.z);
  rig.root.rotation.y = yaw;
  scene.add(rig.root);
  const pose = restPose();
  const altitude = animate(0, pose);
  rig.resetSpine(frame, altitude, pose);
  return { rig, frame, pose, altitude, animate };
}

const ember = exhibit(new WyrmRig({ palette: 'ember' }), -2, -Math.PI / 2 + 0.5, (t, p) => {
  Object.assign(p, restPose());
  p.headYaw = 0.2 * Math.sin(t * 0.7);
  if (POSE === 'fly') {
    p.fold = 0;
    p.flap = 0.7 * Math.sin(t * 5);
    p.billow = 1;
    p.legTuck = 1;
    return 5;
  }
  if (POSE === 'spit') {
    const u = (t % 2) / 2;
    p.mouth = Math.min(1, u / 0.35);
    p.jaw = u > 0.35 ? 1 : u;
    p.breath = u > 0.35 ? 1 : 0;
    p.breathReach = 7;
    p.cone = Math.min(1, u / 0.35);
    p.coneReach = 7;
    return 0;
  }
  if (POSE === 'fold') {
    p.fold = 1;
    p.flash = 0.5 + 0.5 * Math.sin(t * 8);
    return 3;
  }
  p.fold = 0.6;
  p.flap = 0.08 * Math.sin(t * 1.3);
  return 0;
});
const wyrmling = exhibit(
  new WyrmRig({ scale: WYRMLING.scale, segments: WYRMLING.segments, palette: 'wyrmling', legs: 'small', spikes: false }),
  9,
  -Math.PI / 2 - 0.6,
  (t, p) => {
    Object.assign(p, restPose());
    p.headPitch = -0.3;
    p.headYaw = 0.4 * Math.sin(t * 1.9);
    p.fold = 0.7;
    return 0;
  },
);
wyrmling.rig.setChain({ x: BASE.x + 10.5, y: BASE.y, z: BASE.z + 1.5 });
const orsk = exhibit(new WyrmRig({ scale: 3, palette: 'orsk', seed: 28 }), -26, -Math.PI / 2 + 0.3, (t, p) => {
  Object.assign(p, restPose());
  p.headPitch = 0.2;
  p.jaw = 0.25 + 0.15 * Math.sin(t * 2);
  p.fold = 0.5;
  return 0;
});
const exhibits = [ember, wyrmling, orsk];

// `?cam=ember|wyrmling|orsk` frames one exhibit; the default frames all three.
const CAMS: Record<string, [THREE.Vector3, THREE.Vector3]> = {
  all: [new THREE.Vector3(-8, 7, 26), new THREE.Vector3(-8, 2.5, 0)],
  ember: [new THREE.Vector3(2, 3.5, 10), new THREE.Vector3(-1, 1.6, 0)],
  wyrmling: [new THREE.Vector3(10.5, 1.2, 3.2), new THREE.Vector3(9.5, 0.4, 0.5)],
  orsk: [new THREE.Vector3(-18, 8, 26), new THREE.Vector3(-26, 4, 0)],
};
const [camAt, camLook] = CAMS[Q.get('cam') ?? 'all'] ?? CAMS.all!;
// The flying pose is 5 m up: raise the shot with it.
const lift = new THREE.Vector3(0, POSE === 'fly' && Q.get('cam') === 'ember' ? 4.5 : 0, 0);
camera.position.copy(BASE).add(camAt).add(lift);
camera.lookAt(BASE.clone().add(camLook).add(lift));

const head = { x: 0, y: 0, z: 0 };
let t = 0;
let last = performance.now();
let frames = 0;
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  t = FIXED_T ?? t + dt;
  for (const e of exhibits) {
    e.altitude = e.animate(t, e.pose);
    e.rig.headWorld(e.frame, e.altitude, e.pose, head);
    e.rig.spine.step(FIXED_T === null ? dt : 1 / 60, head, { speed: e.altitude > 0 ? 6 : 0, flying: e.altitude > 0.3 });
    e.rig.apply(e.frame, e.pose, FIXED_T === null ? dt : 0);
  }
  renderer.render(scene, camera);
  frames++;
  (window as unknown as { __showcase: object }).__showcase = { ready: frames > 2, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
