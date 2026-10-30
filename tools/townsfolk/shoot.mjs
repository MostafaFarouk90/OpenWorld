// Eye-level real-game shots of named NPCs, plus the frame's WebGL draw calls at that pose. Usage (dev server running):
//   node tools/townsfolk/shoot.mjs http://localhost:5199/ <outDir> <kind> npcId[,npcId...]
// For each NPC: the Knight stands 6 m in front of it, the camera 4.5 m in front at 1.7 m looking at its chest, the shot waits until
// terrain streaming is idle and the NPC's GLB has replaced its placeholder, then writes <outDir>/<kind>-<npcId>.png and prints the
// draw calls of the last frame (counted on the WebGL context, so before/after runs compare the same thing).
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
const { chromium } = createRequire(process.env.PLAYWRIGHT_RESOLVE ?? import.meta.url)('playwright');

const [base, outDir, kind, list] = process.argv.slice(2);
if (!base || !outDir || !kind || !list) {
  console.error('usage: node tools/townsfolk/shoot.mjs <url> <outDir> <kind> npcId[,npcId...]');
  process.exit(2);
}
const flags = process.env.FLAGS ? process.env.FLAGS.split(',') : [];
const DIST = Number(process.env.DIST) || 4.5;
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('page error:', String(e).slice(0, 200)));
await page.addInitScript(() => {
  // draw calls per frame, counted on every WebGL2 context
  window.__draws = { cur: 0, last: 0 };
  const P = WebGL2RenderingContext.prototype;
  for (const fn of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'drawRangeElements']) {
    const orig = P[fn];
    P[fn] = function (...a) { window.__draws.cur++; return orig.apply(this, a); };
  }
  const raf = window.requestAnimationFrame.bind(window);
  const tick = () => { window.__draws.last = window.__draws.cur; window.__draws.cur = 0; raf(tick); };
  raf(tick);
});
await page.goto(`${base}?tutorial=veteran&quality=medium`);
await page.waitForFunction(() => window.__game?.game?.ctx, null, { timeout: 300000 });
await page.evaluate(() => {
  const cs = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height);
  cs[0].setAttribute('data-env-main', '');
});
await page.addStyleTag({ content: 'body *:not([data-env-main]):not(:has([data-env-main])){visibility:hidden !important}' });

for (const id of list.split(',')) {
  const r = await page.evaluate(
    async ({ id, flags, DIST }) => {
      const g = window.__game;
      const ctx = g.game.ctx;
      for (const f of flags) ctx.state.setFlag(f, true);
      const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
      const frames = async (n) => { for (let i = 0; i < n; i++) await new Promise((res) => requestAnimationFrame(res)); };
      const t0 = performance.now();
      while (ctx.clock.tick < 30 && performance.now() - t0 < 600000) await sleep(500);
      const npcs = ctx.services.get('npcs');
      const h = npcs?.get(id);
      if (!h) return { err: `no npc ${id}` };
      const p = h.root.position;
      const yaw = h.yaw;
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw); // the NPC's forward
      const ground = (x, z) => g.terrain.heightAt(x, z);
      g.__ov?.release(0);
      // the Knight a little to the side, out of the frame's middle; proximity loads the NPC models around him
      const kx = p.x + fx * 6 + fz * 2.5, kz = p.z + fz * 6 - fx * 2.5;
      const tp = ctx.player.teleport({ x: kx, y: ground(kx, kz) + 0.3, z: kz }, Math.atan2(fx, fz));
      const tw = performance.now();
      while (!tp.ready() && performance.now() - tw < 240000) await sleep(250);
      const tm = performance.now();
      while (!npcs.get(id).hasModel && performance.now() - tm < 300000) await sleep(500);
      const cx = p.x + fx * DIST, cz = p.z + fz * DIST;
      g.__ov = g.camera.override({
        position: { x: cx, y: ground(cx, cz) + 1.7, z: cz },
        lookAt: { x: p.x, y: p.y + 1.1, z: p.z },
        fov: 55,
        blendIn: 0,
      });
      let stable = 0;
      const s0 = performance.now();
      while (stable < 30 && performance.now() - s0 < 300000) {
        await frames(1);
        stable = g.terrain.stats.pending === 0 ? stable + 1 : 0;
      }
      await frames(10);
      return { model: npcs.get(id).def.model, hasModel: npcs.get(id).hasModel, draws: window.__draws.last };
    },
    { id, flags, DIST },
  );
  if (r.err) { console.log(r.err); continue; }
  await page.screenshot({ path: path.join(outDir, `${kind}-${id}.png`), timeout: 300000 });
  console.log(`shot ${kind}-${id}: body ${r.model}${r.hasModel ? '' : ' (placeholder)'}, draw calls ${r.draws}`);
}
await browser.close();
