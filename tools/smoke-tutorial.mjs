// Headless smoke of the Knighting Day tutorial (thread 9). Usage:
//   npm run dev -- --port 5199 &   then   node tools/smoke-tutorial.mjs http://localhost:5199/
// Checks: the start screen on a fresh profile and Begin -> T01; ?tutorial=t05 runs the crack and spawns the
// churchyard wraiths; ?tutorial=t15 starts at the gate; no console errors. Waits on game state, not wall time.
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:5199/';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
let failed = false;

async function open(query) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 640 } });
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(base + query);
  await page.waitForFunction(() => !!window.__tutorial, null, { timeout: 60000 });
  return { page, errors };
}

const state = (page) =>
  page.evaluate(() => {
    const d = window.__tutorial;
    const g = window.__game?.game;
    const enemies = g?.ctx.services.get('enemies');
    return {
      beat: d.beat,
      complete: d.complete,
      context: g?.ctx.input.contexts.top(),
      t05: enemies?.alive('t05.churchyard').length ?? -1,
      t15: enemies?.alive('t15.gate').length ?? -1,
    };
  });

async function check(name, query, steps) {
  const { page, errors } = await open(query);
  let info = '';
  try {
    info = await steps(page);
  } catch (err) {
    errors.push(`step failed: ${String(err).slice(0, 300)}`);
  }
  await page.screenshot({ path: `shot-tutorial-${name}.png` });
  console.log(`[${name}] errors=${errors.length} ${info}`);
  for (const e of errors) console.log('   ', e.slice(0, 300));
  if (errors.length) failed = true;
  await page.close();
}

await check('start-screen', '', async (page) => {
  await page.waitForSelector('.tutorial-start button', { timeout: 30000 });
  await page.click('.tutorial-start button');
  await page.waitForFunction(() => window.__tutorial.beat === 't01', null, { timeout: 10000 });
  return JSON.stringify(await state(page));
});

await check('t05', '?tutorial=t05', async (page) => {
  await page.waitForFunction(() => window.__tutorial.beat === 't05', null, { timeout: 30000 });
  await page.waitForFunction(
    () => (window.__game?.game.ctx.services.get('enemies')?.alive('t05.churchyard').length ?? 0) === 3,
    null,
    { timeout: 60000 },
  );
  return JSON.stringify(await state(page));
});

await check('t15', '?tutorial=t15', async (page) => {
  await page.waitForFunction(() => window.__tutorial.beat === 't15', null, { timeout: 30000 });
  return JSON.stringify(await state(page));
});

await browser.close();
process.exit(failed ? 1 : 0);
