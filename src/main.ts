import { GameLoop } from './core/GameLoop';
import { Renderer } from './rendering/Renderer';
import { DebugScene } from './rendering/DebugScene';
import { ThirdPersonCamera } from './rendering/ThirdPersonCamera';
import { TerrainScene } from './terrain/TerrainScene';
import { PhysicsWorld } from './physics/PhysicsWorld';
import { InputManager } from './input/InputManager';
import { Player } from './characters/Player';

const container = document.getElementById('app');
if (!container) throw new Error('Missing #app container');

// `?scene=terrain` shows the streaming terrain demo, `?scene=audio` the audio and asset demo,
// `?scene=combat` the hit detection demo;
// the default is the physics test level.
const sceneName = new URLSearchParams(window.location.search).get('scene');

if (sceneName === 'audio') {
  const renderer = new Renderer(container);
  // Loaded on demand so the other scenes do not ship the audio and asset demo.
  void import('./demo/AudioAssetsDemo').then(({ startAudioAssetsDemo }) => startAudioAssetsDemo(renderer));
} else if (sceneName === 'combat') {
  const renderer = new Renderer(container);
  void import('./demo/CombatDemo').then(({ startCombatDemo }) => startCombatDemo(renderer));
} else if (sceneName === 'terrain') {
  const renderer = new Renderer(container);
  const terrainScene = new TerrainScene(renderer.scene, renderer.camera);
  new GameLoop({
    fixedUpdate(dt) {
      terrainScene.fixedUpdate(dt);
    },
    render(alpha) {
      terrainScene.render(alpha);
      renderer.render();
    },
  }).start();
} else {
  await startPhysicsTestLevel(container);
}

async function startPhysicsTestLevel(container: HTMLElement): Promise<void> {
  const physics = new PhysicsWorld();
  try {
    await physics.init();
  } catch (err) {
    // Without physics nothing can run; show why instead of a blank page with a stalled loop.
    container.textContent = err instanceof Error ? err.message : String(err);
    container.style.cssText = 'color:#fff;font:16px sans-serif;padding:2em';
    throw err;
  }

  const renderer = new Renderer(container);
  const debugScene = new DebugScene(renderer.scene, physics);
  const input = new InputManager(renderer.renderer.domElement);
  const player = new Player(renderer.scene, physics, { x: 0, y: 0, z: 4 });
  const camera = new ThirdPersonCamera(renderer.camera, input, physics, player.controller.collider);

  new GameLoop({
    fixedUpdate() {
      const snapshot = input.sample();
      const move = camera.toWorld(snapshot.moveRight, snapshot.moveForward);
      player.fixedUpdate(snapshot, move.x, move.z);
      physics.step();
      player.postStep();
    },
    render(alpha, frameTime) {
      player.render(alpha, frameTime);
      camera.update(player.feet);
      debugScene.render();
      renderer.render();
    },
  }).start();

  if (import.meta.env.DEV) {
    // Handle for debugging and browser smoke tests; stripped from production builds.
    Object.assign(window, { __game: { physics, player, camera, input } });
  }
}
