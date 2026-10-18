// Frame cost of the Harrowmark crowd (slice 2 thread 17b). Usage, like measure-corridor.mjs:
//   npm run dev -- --port 5199 &   then   node tools/measure-crowds.mjs [baseUrl]
// Opens the gate (story.m06.started + story.m06.route), teleports to each stop, and samples requestAnimationFrame deltas
// and renderer.info with the crowd on, then off (crowds.setEnabled). Headless Chromium renders with SwiftShader, so GPU
// time is pessimistic and only the on/off difference means anything; an integrated-GPU run is still owed.
import { createRequire } from 'node:module';
const { chromium } = createRequire(process.env.PLAYWRIGHT_RESOLVE ?? import.meta.url)('playwright');
const base = process.argv[2] ?? 'http://localhost:5199/';
// [name, feet x, z, look-at x, z]
const stops = [
  ['gate-square', 8500, 1300, 8500, 1400],
  ['market', 8760, 1520, 8800, 1520],
  ['fountain-up-keep-road', 8500, 1730, 8500, 2300],
  ['forge-row', 8200, 1520, 8100, 1520],
];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(base + '?tutorial=veteran');
await page.waitForTimeout(6000);
await page.evaluate(() => {
  const ctx = window.__game.game.ctx;
  ctx.state.setFlag('story.m05.complete', true);
  ctx.state.setFlag('story.m06.started', true);
  ctx.state.setFlag('story.m06.route', 'bribe');
});
for (const [name, x, z, lx, lz] of stops) {
  const r = await page.evaluate(async ([x, z, lx, lz]) => {
    const ctx = window.__game.game.ctx;
    const crowds = ctx.services.get('crowds');
    const renderer = ctx.services.get('graphics')?.renderer;
    const yaw = Math.atan2(-(lx - x), -(lz - z));
    const t = ctx.player.teleport({ x, y: 40, z }, yaw);
    for (let i = 0; i < 100 && !t.ready(); i++) await new Promise((res) => setTimeout(res, 100));
    await new Promise((res) => setTimeout(res, 2500));
    const sample = async () => {
      // renderer.info accumulates across the frames (bloom passes would otherwise reset it mid-frame).
      const FRAMES = 40;
      const times = [];
      if (renderer) {
        renderer.info.autoReset = false;
        renderer.info.reset();
      }
      let last = performance.now();
      await new Promise((res) => {
        const tick = (now) => {
          times.push(now - last);
          last = now;
          times.length < FRAMES ? requestAnimationFrame(tick) : res();
        };
        requestAnimationFrame(tick);
      });
      const frames = FRAMES; // per animation frame, all passes (bloom renders more than once)
      const calls = renderer ? renderer.info.render.calls / frames : 0;
      const tris = renderer ? renderer.info.render.triangles / frames : 0;
      if (renderer) renderer.info.autoReset = true;
      times.shift();
      times.sort((a, b) => a - b);
      return { median: times[Math.floor(times.length / 2)], p95: times[Math.floor(times.length * 0.95)], calls, tris };
    };
    crowds?.setEnabled(true);
    await new Promise((res) => setTimeout(res, 500));
    const on = await sample();
    const stats = crowds?.stats();
    crowds?.setEnabled(false);
    await new Promise((res) => setTimeout(res, 300));
    const off = await sample();
    crowds?.setEnabled(true);
    return { on, off, stats, feet: [ctx.player.feet.x, ctx.player.feet.y, ctx.player.feet.z].map((v) => +v.toFixed(1)) };
  }, [x, z, lx, lz]);
  const f = (v) => v.toFixed(1);
  console.log(`${name.padEnd(22)} on: median ${f(r.on.median)} p95 ${f(r.on.p95)} ms calls ${f(r.on.calls)} tris ${Math.round(r.on.tris)} | off: median ${f(r.off.median)} p95 ${f(r.off.p95)} ms calls ${f(r.off.calls)} tris ${Math.round(r.off.tris)}`);
  console.log(`${''.padEnd(22)} crowd: ${JSON.stringify(r.stats)} feet ${r.feet}`);
  await page.screenshot({ path: `crowds-${name}.png` });
}
if (errors.length) console.log('page errors:', errors.slice(0, 5));
await browser.close();
