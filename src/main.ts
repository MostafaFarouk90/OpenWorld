import { GameLoop } from './core/GameLoop';
import { Renderer } from './rendering/Renderer';
import { DebugScene } from './rendering/DebugScene';
import { TerrainScene } from './terrain/TerrainScene';

const container = document.getElementById('app');
if (!container) throw new Error('Missing #app container');

const renderer = new Renderer(container);
// `?scene=terrain` shows the streaming terrain demo; the default is the debug scene.
const sceneName = new URLSearchParams(window.location.search).get('scene');
const activeScene =
  sceneName === 'terrain'
    ? new TerrainScene(renderer.scene, renderer.camera)
    : new DebugScene(renderer.scene, renderer.camera);

const loop = new GameLoop({
  fixedUpdate(dt) {
    activeScene.fixedUpdate(dt);
  },
  render(alpha) {
    activeScene.render(alpha);
    renderer.render();
  },
});

loop.start();
