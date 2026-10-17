// Manual browser smoke test for the physics test level (not part of `npm test`).
// Usage: start `npm run dev`, then `npm i --no-save playwright && node scripts/physics-smoke.mjs [url]`.
// Drives the player with real key presses and checks console errors and controller behaviour.
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:5173/';
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(url);
await page.waitForFunction(() => window.__game, null, { timeout: 15000 });
const wait = (ms) => page.waitForTimeout(ms);
const feet = () =>
  page.evaluate(() => {
    const f = window.__game.player.controller.interpolatedFeet(1, { x: 0, y: 0, z: 0 });
    return { x: f.x, y: f.y, z: f.z };
  });
const teleport = (x, z) =>
  page.evaluate(
    ([x, z]) => {
      window.__game.camera.yaw = 0;
      window.__game.player.controller.teleport({ x, y: 0, z });
    },
    [x, z],
  );
async function walk(key, ms) {
  await page.keyboard.down(key);
  await wait(ms);
  await page.keyboard.up(key);
  await wait(400);
}

const checks = [];
const check = (name, ok, value) => checks.push({ name, ok, value: JSON.stringify(value) });

await wait(1000);
check('settles on ground at spawn', Math.abs((await feet()).y) < 0.05, await feet());
await teleport(-5, -5); await walk('w', 1200);
check('steps over 0.35 m box', (await feet()).z < -7.5, await feet());
await teleport(-2, -5); await walk('w', 1200);
check('blocked by 0.6 m box', (await feet()).z > -7 && Math.abs((await feet()).y) < 0.05, await feet());
await teleport(13, 6); await walk('w', 1500);
check('climbs 40° ramp', (await feet()).y > 1, await feet());
await teleport(18, 6); await walk('w', 1500);
check('blocked by 55° ramp', (await feet()).y < 0.2, await feet());
await teleport(-10, 4); await walk('s', 1800);
check('climbs stairs', (await feet()).y > 1.5, await feet());
await teleport(0, 0); await wait(300); await page.keyboard.press('Space'); await wait(350);
check('jumps', (await feet()).y > 0.5, await feet());
await page.keyboard.press('F3'); await wait(300); // physics wireframe overlay on
await page.screenshot({ path: 'physics-smoke.png' });
await page.keyboard.press('F3');
check('no console errors or warnings', errors.length === 0, errors);

for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}  ${c.value}`);
await browser.close();
process.exit(checks.every((c) => c.ok) ? 0 : 1);
