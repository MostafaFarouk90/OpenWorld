// Contact sheet of runtime environment glbs with a 1.8 m Knight silhouette. Usage: node tools/env-pass/grid.mjs <out.png> <id,id,...>
// Serves the repo root (like shoot-mock.mjs) and renders grid.html in headless Chromium.
import { createRequire } from 'node:module';
import http from 'node:http';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const { chromium } = createRequire(process.env.PLAYWRIGHT_RESOLVE ?? import.meta.url)('playwright');
const [outFile, ids] = process.argv.slice(2);
if (!outFile || !ids) throw new Error('usage: grid.mjs <out.png> <id,id,...>');
const root = process.cwd();
const types = { '.html': 'text/html', '.json': 'application/json', '.js': 'text/javascript', '.mjs': 'text/javascript', '.glb': 'model/gltf-binary' };
const server = http.createServer((req, res) => {
  const f = path.join(root, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, ''));
  if (!f.startsWith(root) || !existsSync(f)) { res.statusCode = 404; return res.end(); }
  res.setHeader('content-type', types[path.extname(f)] ?? 'application/octet-stream');
  res.end(readFileSync(f));
}).listen(0);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1800, height: 1200 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(`http://localhost:${server.address().port}/tools/env-pass/grid.html?ids=${ids}`);
await page.waitForFunction('window.__done', null, { timeout: 120000 });
const data = await page.evaluate(() => document.querySelector('canvas').toDataURL('image/png'));
writeFileSync(outFile, Buffer.from(data.split(',')[1], 'base64'));
await browser.close(); server.close();
