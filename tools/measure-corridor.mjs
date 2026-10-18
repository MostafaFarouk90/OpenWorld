// Frame time along the Dead Road corridor (slice 2 thread 4). Usage: node tools/measure-corridor.mjs [baseUrl]
// Teleports the player to each stop, waits for the terrain to stream, and samples requestAnimationFrame deltas.
// Software GL (SwiftShader) makes the absolute numbers pessimistic; compare stops against each other.
import { createRequire } from 'node:module';
const { chromium } = createRequire(process.env.PLAYWRIGHT_RESOLVE ?? import.meta.url)('playwright');
const base = process.argv[2] ?? 'http://localhost:5199/';
const stops = [
  ['kettlewick', 0, 120], ['lane-junction', 0, -150], ['ford', -400, -150], ['reed-island', 55, -300],
  ['wardstones', 540, -146], ['shrine', 965, -165], ['fog-wall', 1085, -150],
];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 640 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(base + '?tutorial=veteran');
await page.waitForTimeout(6000);
for (const offset of [0, 300]) {
  for (const [name, x, z] of stops) {
    const r = await page.evaluate(async ([x, z, offset]) => {
      const g = window.__game;
      const w = g.world;
      g.game.ctx.graphics?.setViewDistanceOffset?.(offset);
      g.game.ctx.player.teleport({ x, y: 120, z });
      await new Promise((res) => setTimeout(res, 2500));
      const times = [];
      let last = performance.now();
      await new Promise((res) => {
        const tick = (t) => { times.push(t - last); last = t; times.length < 120 ? requestAnimationFrame(tick) : res(); };
        requestAnimationFrame(tick);
      });
      times.sort((a, b) => a - b);
      return { median: times[60], p95: times[Math.floor(times.length * 0.95)], y: +w.player.feet.y.toFixed(1) };
    }, [x, z, offset]);
    console.log(`${name.padEnd(14)} viewOffset=${String(offset).padEnd(4)} median=${r.median.toFixed(1)}ms p95=${r.p95.toFixed(1)}ms y=${r.y}`);
  }
}
if (errors.length) console.log('page errors:', errors.slice(0, 3));
await browser.close();
