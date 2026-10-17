import * as THREE from 'three';
import { AudioManager, proceduralSounds } from '../audio';
import {
  AssetLoader,
  InstancedModel,
  addBatchedInstance,
  buildBatchedMesh,
  extractMeshParts,
} from '../assets';
import { GameLoop } from '../core/GameLoop';
import type { Renderer } from '../rendering/Renderer';

/**
 * Showcase scene for the audio and asset systems, opened with `?scene=audio`: a KayKit knight
 * idling, a ring of instanced swords, a ring of batched swords and shields (one draw call), a
 * crackling campfire emitter, a clang from the anvil on click and ambient/combat music stems
 * toggled with C. Replaced once real gameplay exists.
 */
export function startAudioAssetsDemo(renderer: Renderer): void {
  const { scene, camera } = renderer;
  const audio = new AudioManager();
  const assets = new AssetLoader(renderer.renderer);
  const hint = createHint('Click to enable audio');
  let mixer: THREE.AnimationMixer | null = null;

  scene.background = new THREE.Color(0x87a9c9);
  scene.fog = new THREE.Fog(0x87a9c9, 30, 120);
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x4a3f2a, 0.9));
  const sun = new THREE.DirectionalLight(0xfff1d6, 2);
  sun.position.set(15, 30, 10);
  sun.castShadow = true;
  scene.add(sun);

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(30, 48),
    new THREE.MeshStandardMaterial({ color: 0x6b7f3f }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const campfire = new THREE.Mesh(
    new THREE.ConeGeometry(0.4, 0.6, 7),
    new THREE.MeshStandardMaterial({ color: 0xff7a1a, emissive: 0xff5500, emissiveIntensity: 0.8 }),
  );
  campfire.position.set(-3, 0.3, 1.5);
  scene.add(campfire);

  const anvil = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.5, 0.4),
    new THREE.MeshStandardMaterial({ color: 0x55585e, metalness: 0.7, roughness: 0.4 }),
  );
  anvil.position.set(0, 0.25, 2);
  anvil.castShadow = true;
  scene.add(anvil);

  camera.position.set(0, 4, 10);
  camera.lookAt(0, 0.8, 0);

  audio.register('clang', { src: [proceduralSounds.clangUrl()], format: ['wav'], refDistance: 2 });
  audio.register('crackle', {
    src: [proceduralSounds.crackleLoopUrl()],
    format: ['wav'],
    loop: true,
    volume: 0.8,
    refDistance: 1.5,
  });
  audio.attach('crackle', campfire);

  let combat = false;
  audio.onUnlock(() => {
    const { music, context } = audio;
    void Promise.all([
      music.add('ambient', proceduralSounds.ambientStem(context)),
      music.add('combat', proceduralSounds.combatStem(context)),
    ]).then(() => {
      music.start({ ambient: 0 });
      music.setMix({ ambient: 1 });
      hint.textContent = 'Click: anvil clang · C: toggle combat music';
    });
  });
  window.addEventListener('pointerdown', () => audio.playAt('clang', anvil.position));
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyC' || !audio.music.isPlaying) return;
    combat = !combat;
    audio.music.setMix(combat ? { ambient: 0.4, combat: 1 } : { ambient: 1, combat: 0 });
  });

  void (async () => {
    await assets.preload(['knight', 'sword', 'shieldRound']);

    const knight = assets.instantiate('knight');
    knight.position.set(1.5, 0, 0);
    knight.rotation.y = -Math.PI / 6;
    scene.add(knight);
    mixer = new THREE.AnimationMixer(knight);
    const idle = THREE.AnimationClip.findByName(assets.animations('knight'), 'Idle');
    if (idle) mixer.clipAction(idle).play();

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const scale = new THREE.Vector3(1, 1, 1);

    // InstancedMesh: a ring of swords planted point-down in the ground.
    const swordParts = extractMeshParts(assets.get('sword').scene);
    const swords = new InstancedModel(swordParts, 16);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      q.setFromEuler(new THREE.Euler(Math.PI, a, 0));
      swords.addInstance(m.compose(new THREE.Vector3(Math.cos(a) * 6, 0.9, Math.sin(a) * 6), q, scale));
    }
    scene.add(swords);

    // BatchedMesh: swords and shields share KayKit's atlas material, so they draw in one call.
    const shieldParts = extractMeshParts(assets.get('shieldRound').scene);
    const { mesh, geometryIds } = buildBatchedMesh([swordParts, shieldParts], 24, swordParts[0].material);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      q.setFromEuler(new THREE.Euler(0, -a + Math.PI / 2, 0));
      const pos = new THREE.Vector3(Math.cos(a) * 9, 0.6, Math.sin(a) * 9);
      addBatchedInstance(mesh, geometryIds[i % 2], m.compose(pos, q, scale));
    }
    scene.add(mesh);
  })().catch((err: unknown) => console.error('Audio/asset demo failed to load', err));

  new GameLoop({
    fixedUpdate() {},
    render(_alpha, frameTime) {
      mixer?.update(frameTime);
      audio.update(camera);
      renderer.render();
    },
  }).start();
}

function createHint(text: string): HTMLDivElement {
  const el = document.createElement('div');
  el.textContent = text;
  Object.assign(el.style, {
    position: 'fixed',
    left: '12px',
    bottom: '12px',
    padding: '6px 10px',
    font: '13px system-ui, sans-serif',
    color: '#fff',
    background: 'rgba(0, 0, 0, 0.45)',
    borderRadius: '4px',
    pointerEvents: 'none',
  });
  document.body.appendChild(el);
  return el;
}
