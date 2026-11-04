// Counts the lights in the live scene at a given spot (step 0 of the glow work: how many point lights does the scene already have?).
//   npm run dev -- --port 5199 &
//   node tools/env-pass/count-lights.mjs http://localhost:5199/ 8268 1505 [quality=medium] [env=off]
// Teleports the Knight to x z, waits for the game to settle, then walks the scene graph and prints lights by type, with how many are
// visible, shadow-casting or lit (intensity > 0), plus the env glow pool when the build has one. Software GL: it is a count, not a timing.
import { createRequire } from 'node:module';
const { chromium } = createRequire(process.env.PLAYWRIGHT_RESOLVE ?? import.meta.url)('playwright');
const [base = 'http://localhost:5199/', x = '8268', z = '1505', ...rest] = process.argv.slice(2);
const extra = rest.length ? rest.join('&') : 'quality=medium';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on('pageerror', (e) => console.log('pageerror', String(e).slice(0, 200)));
await page.goto(`${base}?tutorial=veteran&${extra}`);
await page.waitForFunction(() => window.__game?.game?.ctx, null, { timeout: 600000 });
const out = await page.evaluate(
  async ({ x, z }) => {
    const g = window.__game;
    const ctx = g.game.ctx;
    const t0 = performance.now();
    while (ctx.clock.tick < 30 && performance.now() - t0 < 900000) await new Promise((r) => setTimeout(r, 500));
    const tp = ctx.player.teleport({ x, y: g.terrain.heightAt(x, z) + 0.3, z }, 0);
    const t1 = performance.now();
    while (!tp.ready() && performance.now() - t1 < 600000) await new Promise((r) => setTimeout(r, 500));
    for (let i = 0; i < 300; i++) await new Promise((r) => requestAnimationFrame(r));
    const lights = [];
    ctx.scene.traverse((o) => {
      if (o.isLight) lights.push({ type: o.type, name: o.name || o.parent?.name || '', visible: o.visible, castShadow: !!o.castShadow, intensity: o.intensity });
    });
    const by = {};
    for (const l of lights) {
      const k = l.type;
      by[k] ??= { total: 0, visible: 0, lit: 0, shadow: 0 };
      by[k].total++;
      if (l.visible) by[k].visible++;
      if (l.visible && l.intensity > 0) by[k].lit++;
      if (l.castShadow) by[k].shadow++;
    }
    const env = ctx.services.get('env');
    return { tick: ctx.clock.tick, by, point: lights.filter((l) => l.type === 'PointLight'), glow: env?.glow?.() ?? null, quality: ctx.services.get('quality')?.step };
  },
  { x: Number(x), z: Number(z) },
);
console.log(JSON.stringify(out, null, 1));
await browser.close();
