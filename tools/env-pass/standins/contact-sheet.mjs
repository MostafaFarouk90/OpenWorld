// Renders the offline contact sheet: node tools/env-pass/standins/contact-sheet.mjs <out.png> [glbDir]
// Serves the repo root on a local port, opens contact-sheet.html in headless Chromium (software GL), writes the PNG.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(process.env.PLAYWRIGHT_RESOLVE ?? import.meta.url)('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const [out = 'contact-sheet.png', dir = '/public/assets/env-standin/'] = process.argv.slice(2);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.glb': 'model/gltf-binary' };
const server = createServer((req, res) => {
  const f = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(root) || !existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': types[path.extname(f)] ?? 'application/octet-stream' });
  createReadStream(f).pipe(res);
}).listen(0);
const port = server.address().port;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
page.on('response', (r) => r.status() >= 400 && console.log(r.status(), r.url()));
page.on('crash', () => console.log('PAGE CRASHED'));
page.on('pageerror', (e) => console.log('pageerror', e));
page.on('console', (m) => m.type() === 'error' && console.log('console', m.text()));
await page.goto(`http://localhost:${port}/tools/env-pass/standins/contact-sheet.html?dir=${encodeURIComponent(dir)}`);
await page.waitForFunction(() => window.__done, null, { timeout: 120000 });
await page.screenshot({ path: out });
await browser.close();
server.close();
console.log('wrote', out);
