import { GameLoop } from './core/GameLoop';
import { Renderer } from './rendering/Renderer';
import { DebugScene } from './rendering/DebugScene';

const container = document.getElementById('app');
if (!container) throw new Error('Missing #app container');

const renderer = new Renderer(container);
const sceneName = new URLSearchParams(window.location.search).get('scene');

if (sceneName === 'audio') {
  // Loaded on demand so the default scene does not ship the audio and asset demo.
  void import('./demo/AudioAssetsDemo').then(({ startAudioAssetsDemo }) => startAudioAssetsDemo(renderer));
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
