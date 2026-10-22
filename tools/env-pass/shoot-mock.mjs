// Design-mock shots from the shared camera table. Usage: node tools/env-pass/shoot-mock.mjs <tile> [outDir]
// Serves the repo root with a tiny static server (the mock imports three from node_modules).
import { createRequire } from 'node:module';
import http from 'node:http';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
const { chromium } = createRequire(process.env.PLAYWRIGHT_RESOLVE ?? import.meta.url)('playwright');
const [tile, outRoot = 'assets/renders/env-pass'] = process.argv.slice(2);
const root = process.cwd();
const types = { '.html': 'text/html', '.json': 'application/json', '.js': 'text/javascript', '.mjs': 'text/javascript' };
const server = http.createServer((req, res) => {
  const f = path.join(root, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, ''));
  if (!f.startsWith(root) || !existsSync(f)) { res.statusCode = 404; return res.end(); }
  res.setHeader('content-type', types[path.extname(f)] ?? 'application/octet-stream');
  res.end(readFileSync(f));
}).listen(0);
const port = server.address().port;
const entry = JSON.parse(readFileSync('tools/env-pass/cameras.json', 'utf8')).tiles[tile];
if (!entry?.spec && !entry?.placements) { console.log(`no design spec for ${tile}`); process.exit(1); }
const cams = Object.keys(entry.cameras);
const outDir = path.join(outRoot, tile);
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
for (const cam of cams) {
  await page.goto(`http://localhost:${port}/tools/env-pass/${entry.placements ? 'placement-mock' : 'design-mock'}.html?tile=${tile}&view=${cam}&mode=design`);
  await page.waitForFunction(() => window.__done, null, { timeout: 60000 });
  await page.screenshot({ path: path.join(outDir, `design-${cam}.png`) });
  console.log('mock', cam);
}
await browser.close();
server.close();
