import { GameLoop } from './core/GameLoop';
import { Renderer } from './rendering/Renderer';
import { DebugScene } from './rendering/DebugScene';
import { startAudioAssetsDemo } from './demo/AudioAssetsDemo';

const container = document.getElementById('app');
if (!container) throw new Error('Missing #app container');

const renderer = new Renderer(container);
const sceneName = new URLSearchParams(window.location.search).get('scene');

if (sceneName === 'audio') {
  startAudioAssetsDemo(renderer);
} else {
  const debugScene = new DebugScene(renderer.scene, renderer.camera);

  const loop = new GameLoop({
    fixedUpdate(dt) {
      debugScene.fixedUpdate(dt);
    },
    render(alpha) {
      debugScene.render(alpha);
      renderer.render();
    },
  });

  loop.start();
}
