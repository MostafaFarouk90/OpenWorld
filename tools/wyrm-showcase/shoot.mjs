// Headless renders of the wyrm showcase (headless Chromium, SwiftShader). Usage:
//   npx vite --port 5198 &   then   node tools/wyrm-showcase/shoot.mjs <outDir> [prefix] [baseUrl]
// Writes <prefix>-<view>.png for each view below (frozen clock, `?t=`), and fails on console errors.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
const { chromium } = createRequire(process.env.PLAYWRIGHT_RESOLVE ?? '/opt/node-tools/node_modules/')('playwright');
const outDir = process.argv[2] ?? '.';
const prefix = process.argv[3] ?? 'wyrms';
const base = process.argv[4] ?? 'http://localhost:5198/tools/wyrm-showcase/';
const VIEWS = { all: 'cam=all', orsk: 'cam=orsk', 'orsk-side': 'cam=orsk-side', ember: 'cam=ember', wyrmling: 'cam=wyrmling' };
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
for (const [name, q] of Object.entries(VIEWS)) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 720 } });
  page.on('pageerror', (e) => errors.push(`${name}: ${e}`));
  page.on('console', (m) => m.type() === 'error' && !/favicon\.ico$/.test(m.location()?.url ?? '') && errors.push(`${name}: ${m.text()}`));
  await page.goto(`${base}?${q}&t=1`);
  await page.waitForFunction(() => window.__showcase?.ready, null, { timeout: 90000 });
  const file = join(outDir, `${prefix}-${name}.png`);
  await page.locator('canvas').screenshot({ path: file });
  console.log(file);
  await page.close();
}
await browser.close();
if (errors.length) {
  console.error('ERRORS:\n' + errors.join('\n'));
  process.exit(1);
}
