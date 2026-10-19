// Side-by-side render of every enemy type in the real game (headless Chromium). Usage:
//   npm run dev -- --port 5199 &   then   node tools/shot-enemies.mjs <outFile.png> [baseUrl]
// Imports src/demo/enemyLineup.ts through the dev server, stands the row in front of the player and frames it.
import { createRequire } from 'node:module';
const { chromium } = createRequire(process.env.PLAYWRIGHT_RESOLVE ?? '/opt/node-tools/node_modules/')('playwright');
const out = process.argv[2] ?? 'enemies.png';
const base = process.argv[3] ?? 'http://localhost:5199/';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1800, height: 560 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(base + '?tutorial=veteran');
await page.waitForFunction(() => window.__game?.game?.ctx, null, { timeout: 90000 });
await page.waitForTimeout(6000);
const names = await page.evaluate(async () => {
  const ctx = window.__game.game.ctx;
  const f = ctx.player.feet;
  const { buildEnemyLineup } = await import('/src/demo/enemyLineup.ts');
  const THREE_V = f.constructor;
  const centre = new THREE_V(f.x, f.y, f.z - 18);
  const lineup = await buildEnemyLineup(ctx, centre);
  window.__lineup = lineup;
  let last = performance.now();
  const tick = (now) => { lineup.update(Math.min(0.05, (now - last) / 1000)); last = now; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  window.__shot?.release(0);
  window.__shot = ctx.cameraRig.override({
    position: { x: centre.x, y: centre.y + 2.1, z: centre.z + 19 },
    lookAt: { x: centre.x, y: centre.y + 1.2, z: centre.z },
    fov: 30,
    blendIn: 0,
  });
  return lineup.names;
});
console.log(names.join(' | '));
await page.waitForTimeout(4000);
await page.screenshot({ path: out });
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors');
await browser.close();
