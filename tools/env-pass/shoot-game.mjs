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
// On a loaded machine software rendering runs at a frame every few seconds, and the waits below count frames: FRAMES=0.25 quarters them
// (quick looks while iterating; final shots use the default). CAMS=eye,drone limits the poses; VIEW=960x540 shrinks the viewport.
const FRAMES = Number(process.env.FRAMES) || 1;
const only = process.env.CAMS ? process.env.CAMS.split(',') : null;
// FLAGS=story.m05.complete sets story flags before the first pose (the Dead Road shots stand east of the fog wall, which only lowers after M05).
const flags = process.env.FLAGS ? process.env.FLAGS.split(',') : [];
const [vw, vh] = (process.env.VIEW ?? '1280x720').split('x').map(Number);
const here = path.dirname(fileURLToPath(import.meta.url));
// `tile` may name several camera tiles, comma separated (d1-gate,d1-crest): they share one page, so the game loads once.
const allTables = JSON.parse(readFileSync(path.join(here, 'cameras.json'), 'utf8')).tiles;
for (const t of tile.split(',')) if (!allTables[t]) throw new Error(`unknown tile ${t}`);

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: vw, height: vh } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('crash', () => console.log('PAGE CRASHED'));
if (process.env.CONSOLE) page.on('console', (m) => console.log('console:', m.text().slice(0, 200)));
await page.goto(`${base}?tutorial=veteran&quality=medium`);
await page.waitForFunction(() => window.__game?.game?.ctx, null, { timeout: 180000 });
// SETTLE_MS=600000 lengthens the settle wait on a loaded machine (default 120 s).
await page.evaluate((ms) => { window.__settleMs = ms; }, Number(process.env.SETTLE_MS) || 0);
// HUD off: everything that is neither the game canvas (the largest one; the minimap is a canvas too) nor an ancestor of it.
await page.evaluate(() => {
  const cs = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height);
  cs[0].setAttribute('data-env-main', '');
});
await page.addStyleTag({ content: 'body *:not([data-env-main]):not(:has([data-env-main])){visibility:hidden !important}' });

for (const tileName of tile.split(',')) {
const table = allTables[tileName];
const outDir = path.join(outRoot, tileName);
mkdirSync(outDir, { recursive: true });
for (const [name, c] of Object.entries(table.cameras)) {
  if (only && !only.includes(name)) continue;
  const result = await page.evaluate(
    async ({ c, base, FRAMES, flags }) => {
      const g = window.__game;
      for (const f of flags) g.game.ctx.state.setFlag(f, true);
      const ground = (x, z) => g.terrain.heightAt(x, z);
      g.__ov?.release(0);
      const [px, py, pz] = c.pos;
      const [lx, ly, lz] = c.look;
      // The Knight stays where it is (on a loaded machine a far teleport falls out of the world); the env plugin measures its culling
      // from the camera instead. Meadow blades follow the Knight, so shots far from the spawn show the tile's own rows only.
      const t0 = performance.now();
      const env0 = g.game.ctx.services.get('env');
      env0?.focus({ x: px, z: pz });
      // Stand the Knight in frame: eye shots put him 4 m ahead of the camera (scale reference, and the meadow blades follow him);
      // other shots put him under the camera. Teleport the way the game does and wait for the colliders under him.
      const ahead = c.pos[1] < 5 ? 4 : 0;
      const dl = Math.hypot(lx - px, lz - pz) || 1;
      const kx = px + ((lx - px) / dl) * ahead;
      const kz = pz + ((lz - pz) / dl) * ahead;
      // The game loop starts ticking only after loading ends (minutes on a loaded machine): teleporting before that never completes.
      const tl = performance.now();
      while (g.game.ctx.clock.tick < 30 && performance.now() - tl < 600000) await new Promise((r) => setTimeout(r, 500));
      const tp = g.game.ctx.player.teleport({ x: kx, y: ground(kx, kz) + 0.3, z: kz }, Math.atan2(-(lx - px), -(lz - pz)));
      const tw = performance.now();
      while (!tp.ready() && performance.now() - tw < 240000) await new Promise((r) => setTimeout(r, 250));
      const f0 = g.game.ctx.player.feet;
      const stood = tp.ready() && Math.hypot(f0.x - kx, f0.z - kz) < 3;
      if (stood) {
        env0?.focus(null);
        for (let i = 0; i < Math.round(120 * FRAMES); i++) await new Promise((r) => requestAnimationFrame(r)); // let the blades grow in around him
      }
      // The env plugin builds its models one id at a time; wait until the tile's instance count has stopped growing (and exists).
      const env = g.game.ctx.services.get('env');
      let last = -1;
      let same = 0;
      while (same < Math.round(180 * FRAMES) && performance.now() - t0 < 600000) {
        await new Promise((r) => requestAnimationFrame(r));
        const d = env?.drawn(base);
        const total = d ? Object.values(d).reduce((a, b) => a + b, 0) : -1;
        same = total === last && total >= 0 && d.ground > 0 ? same + 1 : 0;
        last = total;
      }
      g.__ov = g.camera.override({
        position: { x: px, y: ground(px, pz) + py, z: pz },
        lookAt: { x: lx, y: ground(lx, lz) + ly, z: lz },
        fov: c.fov,
        blendIn: 0,
      });
      // Settled: no pending terrain chunks, then 30 consecutive animation frames.
      let stable = 0;
      const s0 = performance.now();
      while (stable < Math.round(30 * FRAMES) && performance.now() - s0 < (Number(window.__settleMs) || 120000)) {
        await new Promise((r) => requestAnimationFrame(r));
        stable = g.terrain.stats.pending === 0 ? stable + 1 : 0;
      }
      return stable >= Math.round(30 * FRAMES) ? (stood ? 'stood' : 'focus') : false;
    },
    { c, base: tileName.split('-')[0], FRAMES, flags },
  );
  if (!result) throw new Error(`shot ${name} never settled`);
  if (result === 'focus') console.log(`warning: ${name}: the Knight could not stand at the camera; culling follows the camera and the meadow blades are missing`);
  await page.screenshot({ path: path.join(outDir, `${kind}-${name}.png`), timeout: 300000 });
  console.log('shot', `${kind}-${name}`);
}
}
await browser.close();
if (errors.length) console.log('page errors:', errors.slice(0, 5));
