// Screenshots of the asset swap in the real game (headless Chromium, SwiftShader). Usage:
//   npm run dev -- --port 5199 &   then   node tools/shot-assets.mjs <outDir> [baseUrl] [stopName ...]
// Each stop teleports the player near a point, puts a scripted camera on it (cameraRig.override), waits for the models to
// stream in, then saves <outDir>/<name>.png and prints renderer.info (calls, triangles). Stops are map coordinates (engine
// x, z) plus the camera offset; ground height comes from the heightfield through the teleport.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const { chromium } = createRequire(process.env.PLAYWRIGHT_RESOLVE ?? '/opt/node-tools/node_modules/')('playwright');
const out = process.argv[2] ?? 'shots';
const base = process.argv[3] ?? 'http://localhost:5199/';
const only = process.argv.slice(4);
mkdirSync(out, { recursive: true });

// name: anchor id to look at, look-at height above it, camera offset (dx, dy, dz) from the look-at point, in metres.
const STOPS = {
  'bw-bakery': { anchor: 'kettlewick.bakery-door', look: 3, cam: [-18, 7, 14] },
  'bw-chapel': { anchor: 'chapel.door', look: 4, cam: [-28, 9, 20] },
  'bw-tavern': { anchor: 'kettlewick.tavern-door', look: 3, cam: [-18, 7, 14] },
};
const stops = Object.entries(STOPS).filter(([n]) => only.length === 0 || only.includes(n));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 640 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' || m.text().includes('unavailable')) errors.push(m.text()); });
await page.goto(base + '?tutorial=veteran');
await page.waitForFunction(() => window.__game?.game?.ctx, null, { timeout: 90000 });
await page.waitForTimeout(6000);
for (const [name, s] of stops) {
  const ok = await page.evaluate(async ({ anchor, look, cam }) => {
    const ctx = window.__game.game.ctx;
    const a = ctx.anchors.find(anchor);
    if (!a) return false;
    window.__shot?.release(0);
    const t = ctx.player.teleport({ x: a.position.x + 3, y: a.position.y + 2, z: a.position.z + 3 }, 0);
    for (let i = 0; i < 100 && !t.ready(); i++) await new Promise((r) => setTimeout(r, 100));
    window.__shot = ctx.cameraRig.override({
      position: { x: a.position.x + cam[0], y: a.position.y + cam[1], z: a.position.z + cam[2] },
      lookAt: { x: a.position.x, y: a.position.y + look, z: a.position.z },
      blendIn: 0,
    });
    return true;
  }, s);
  if (!ok) {
    console.log(name, 'anchor missing');
    continue;
  }
  await page.waitForTimeout(5000);
  const info = await page.evaluate(() => {
    const r = window.__game.game.ctx.services.get('graphics')?.renderer;
    return r ? { calls: r.info.render.calls, tris: r.info.render.triangles } : null;
  });
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log(name, JSON.stringify(info));
}
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors');
await browser.close();
