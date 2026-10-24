// Real-game shots at the shared camera table. Usage (dev server running, playwright as in smoke-act2.mjs):
//   npm run dev -- --port 5199 &
//   node tools/env-pass/shoot-game.mjs http://localhost:5199/ <tile> <before|after> [outDir]
// Writes <outDir|assets/renders/env-pass>/<tile>/<kind>-<cam>.png. HUD hidden, quality medium, veteran tutorial skip. Each shot
// waits until terrain streaming is idle and the camera pose has been stable for 30 frames (not a fixed delay), or fails.
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const { chromium } = createRequire(process.env.PLAYWRIGHT_RESOLVE ?? import.meta.url)('playwright');

const [base = 'http://localhost:5199/', tile, kind = 'after', outRoot = 'assets/renders/env-pass'] = process.argv.slice(2);
const here = path.dirname(fileURLToPath(import.meta.url));
const table = JSON.parse(readFileSync(path.join(here, 'cameras.json'), 'utf8')).tiles[tile];
if (!table) throw new Error(`unknown tile ${tile}`);
const outDir = path.join(outRoot, tile);
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.text().startsWith('env at shot')) console.log(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`${base}?tutorial=veteran&quality=medium`);
await page.waitForFunction(() => window.__game?.game?.ctx, null, { timeout: 900000 });
// HUD off: everything that is neither the game canvas (the largest one; the minimap is a canvas too) nor an ancestor of it.
await page.evaluate(() => {
  const cs = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height);
  cs[0].setAttribute('data-env-main', '');
});
await page.addStyleTag({ content: 'body *:not([data-env-main]):not(:has([data-env-main])){visibility:hidden !important}' });

for (const [name, c] of Object.entries(table.cameras)) {
  const result = await page.evaluate(
    async ({ c }) => {
      const g = window.__game;
      const ground = (x, z) => g.terrain.heightAt(x, z);
      g.__ov?.release(0);
      const [px, py, pz] = c.pos;
      const [lx, ly, lz] = c.look;
      // Park the Knight beside the camera so the terrain streams around the shot.
      // Stand the Knight 4 m ahead of the camera, in frame (a Knight on the camera spot would fill the eye shot).
      const dl = Math.hypot(lx - px, lz - pz) || 1;
      const kx = px + ((lx - px) / dl) * 4;
      const kz = pz + ((lz - pz) / dl) * 4;
      const tp = g.game.ctx.player.teleport({ x: kx, y: ground(kx, kz) + 0.2, z: kz }, 0);
      const t0 = performance.now();
      while (!tp.ready() && performance.now() - t0 < 90000) await new Promise((r) => setTimeout(r, 200));
      // The env plugin culls by distance from the Knight, and a teleport right after load can be dropped (the Knight stays at the
      // spawn), which hid the ground cover and bushes around far shots. Pin the position the env plugin reads to the shot's ground.
      if (!g.__feetPinned) {
        const real = g.game.ctx.player.feet;
        Object.defineProperty(g.game.ctx.player, 'feet', {
          configurable: true,
          get: () => (g.__pin ? new Proxy(real, { get: (t, k) => (k === 'x' ? g.__pin[0] : k === 'z' ? g.__pin[1] : k === 'y' ? g.__pin[2] : Reflect.get(t, k)) }) : real),
        });
        g.__feetPinned = true;
      }
      g.__pin = [kx, kz, ground(kx, kz)];
      g.__ov = g.camera.override({
        position: { x: px, y: ground(px, pz) + py, z: pz },
        lookAt: { x: lx, y: ground(lx, lz) + ly, z: lz },
        fov: c.fov,
        blendIn: 0,
      });
      // The env plugin builds each tile's batches asynchronously (model loads): wait until its drawn count stops growing for 3 s.
      const env = g.game.ctx.services.get?.('env');
      if (env) {
        let last = -1;
        let since = performance.now();
        const e0 = performance.now();
        while ((last < 0 || performance.now() - since < 3000) && performance.now() - e0 < 300000) {
          await new Promise((r) => setTimeout(r, 250));
          const n = !env.drawn('b3')?.ground || !env.drawn('b3')?.wood ? -2 : ['b1', 'b3'].reduce((s, t) => s + Object.values(env.drawn(t) ?? {}).reduce((a, b) => a + b, 0), 0);
          if (n !== last) {
            last = n;
            since = performance.now();
          }
        }
      }
      // Settled: no pending terrain chunks, then 30 consecutive animation frames.
      let stable = 0;
      const s0 = performance.now();
      while (stable < 30 && performance.now() - s0 < 400000) {
        await new Promise((r) => requestAnimationFrame(r));
        stable = g.terrain.stats.pending === 0 ? stable + 1 : 0;
      }
      { const f = g.game.ctx.player.feet; console.log("env at shot", JSON.stringify(env?.drawn("b3")), "ph", env?.placeholders("b3"), "feet", f.x.toFixed(0), f.z.toFixed(0)); }
      // Terrain heights can still change while chunks stream in: re-aim the camera on the settled ground, then let 20 frames pass.
      g.__ov?.release(0);
      g.__ov = g.camera.override({
        position: { x: px, y: ground(px, pz) + py, z: pz },
        lookAt: { x: lx, y: ground(lx, lz) + ly, z: lz },
        fov: c.fov,
        blendIn: 0,
      });
      for (let i = 0; i < 20; i++) await new Promise((r) => requestAnimationFrame(r));
      return stable >= 30;
    },
    { c },
  );
  if (!result) throw new Error(`shot ${name} never settled`);
  await page.screenshot({ path: path.join(outDir, `${kind}-${name}.png`), timeout: 600000 });
  console.log('shot', `${kind}-${name}`);
}
await browser.close();
if (errors.length) console.log('page errors:', errors.slice(0, 5));
