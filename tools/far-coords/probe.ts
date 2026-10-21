// Far-coordinate render probe (Act 2 Step 0). Renders the same Knight, ground and sun shadow at a base point
// near the origin and at the far edge of Cinderreach, then moves the whole rig (character, camera, sun) by
// sub-millimetre steps and counts pixels that flip between frames. Float32 precision loss shows up as
// pixels that flip at the far base but not at the origin. Open /tools/far-coords/ under `npx vite`;
// results land on window.__probe.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { installFarPrecision } from '../../src/rendering/farPrecision';

const W = 960;
const H = 540;
const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
renderer.setSize(W, H);
renderer.setPixelRatio(1);
const Q = new URLSearchParams(location.search);
renderer.shadowMap.enabled = Q.get('shadows') !== '0';
const FIX = Q.get('fix') === '1';
if (FIX) installFarPrecision(renderer);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x203040);
const camera = new THREE.PerspectiveCamera(60, W / H, 0.1, 2000);
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 400 });
sun.shadow.bias = -0.0005;
scene.add(sun, sun.target, new THREE.HemisphereLight(0xffffff, 0x404030, 0.6));
const SUN_DIR = new THREE.Vector3(0.4, 1, 0.25).normalize();

// Ground as the terrain builds it: local vertices, mesh placed at the chunk centre.
const groundMat = Q.get('ground') === 'basic' ? new THREE.MeshBasicMaterial({ color: 0x6a8a4a }) : null;
const ground = new THREE.Mesh(new THREE.PlaneGeometry(100, 100, 50, 50).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x6a8a4a }));
ground.receiveShadow = true;
scene.add(ground);

const rig = new THREE.Group();
scene.add(rig);

interface Result { base: string; pose: string; mode: string; flips: number[]; meanFlips: number; maxFlips: number; edgePixels: number }

async function main(): Promise<void> {
  const gltf = await new GLTFLoader().loadAsync('/assets/kaykit-adventurers/characters/Knight.glb');
  const knight = gltf.scene;
  knight.scale.setScalar(0.78);
  knight.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  rig.add(knight);
  const mixer = new THREE.AnimationMixer(knight);
  const clip = (n: string) => gltf.animations.find((c) => c.name === n) ?? gltf.animations[0];

  const pixels = new Uint8Array(W * H * 4);
  const read = (): Uint8Array => {
    const gl = renderer.getContext();
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    return pixels.slice();
  };
  const place = (bx: number, bz: number, dx: number) => {
    const x = bx + dx;
    rig.position.set(x, 0, bz);
    ground.position.set(Math.round(bx / 100) * 100, 0, Math.round(bz / 100) * 100);
    camera.position.set(x + 1.2, 1.9, bz + 3.6);
    camera.lookAt(x, 1.0, bz);
    sun.target.position.set(x, 0, bz);
    sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, 200);
    scene.updateMatrixWorld(true);
  };
  const mask = (overrideBasic: boolean): void => {
    scene.overrideMaterial = overrideBasic ? new THREE.MeshBasicMaterial({ color: 0xffffff }) : null;
    ground.visible = !overrideBasic;
    scene.background = overrideBasic ? new THREE.Color(0x000000) : new THREE.Color(0x203040);
  };

  const results: Result[] = [];
  const bases: [string, number, number][] = [['origin', 0, 0], ['harrowmark', 8000, 2000], ['cinderreach-far', 22000, 3000], ['far-test-40km', 40000, 0]];
  for (const pose of ['Idle', 'Walking_A']) {
    mixer.stopAllAction();
    const action = mixer.clipAction(clip(pose));
    action.play();
    mixer.setTime(0.37);
    for (const mode of ['silhouette', 'lit']) {
      mask(mode === 'silhouette');
      for (const [name, bx, bz] of bases) {
        const flips: number[] = [];
        let prev: Uint8Array | null = null;
        let edge = 0;
        for (let i = 0; i <= 40; i++) {
          place(bx, bz, i * 0.0005); // 0.5 mm per frame: the rig moves rigidly, so the image should not change
          renderer.render(scene, camera);
          const img = read();
          if (prev) {
            let n = 0;
            for (let p = 0; p < img.length; p += 4) {
              const d = Math.abs(img[p] - prev[p]) + Math.abs(img[p + 1] - prev[p + 1]) + Math.abs(img[p + 2] - prev[p + 2]);
              if (d > 24) n++;
            }
            flips.push(n);
          } else if (mode === 'silhouette') {
            for (let p = 0; p < img.length; p += 4) if (img[p] > 128) edge++;
          }
          prev = img;
        }
        console.log('probe', pose, mode, name, performance.now() | 0);
        results.push({ base: name, pose, mode, flips, meanFlips: flips.reduce((a, b) => a + b, 0) / flips.length, maxFlips: Math.max(...flips), edgePixels: edge });
      }
    }
  }
  // One still per base for the eye.
  mask(false);
  const shots: Record<string, string> = {};
  for (const [name, bx, bz] of bases) {
    place(bx, bz, 0);
    renderer.render(scene, camera);
    shots[name] = renderer.domElement.toDataURL('image/png');
  }
  (window as unknown as { __probe: unknown }).__probe = { results, shots, clips: gltf.animations.map((c) => c.name) };
}
main().catch((e) => { (window as unknown as { __probe: unknown }).__probe = { error: String(e) }; });
