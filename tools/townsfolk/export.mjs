// Exports the generated townsfolk bodies from Mostafa's GLB-Viewer character generator (offline page), headless.
// Usage: node tools/townsfolk/export.mjs <GLB-Viewer checkout> <out dir> [id ...]
// Each body is an archetype + seed with the page's townsfolk game set (chibi look, KayKit size, KayKit skeleton, one
// palette material, game budget, game materials); the same pair always gives the same file. A PNG preview goes beside it.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { TOWNSFOLK_EXPORTS } from './bodies.mjs';

const { chromium } = createRequire(process.env.PLAYWRIGHT_RESOLVE ?? import.meta.url)('playwright');

const [viewer, outDir, ...only] = process.argv.slice(2);
if (!viewer || !outDir) {
  console.error('usage: node tools/townsfolk/export.mjs <GLB-Viewer checkout> <out dir> [id ...]');
  process.exit(2);
}
const page = path.resolve(viewer, 'character-generator-offline.html');
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
try {
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 900, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(pathToFileURL(page).href);
  await p.waitForFunction(() => window.__chargen?.state?.current);
  await p.uncheck('#bloom').catch(() => {});
  for (const b of TOWNSFOLK_EXPORTS) {
    if (only.length && !only.includes(b.id)) continue;
    await p.selectOption('#archetype', b.archetype);
    await p.fill('#seed', b.seed);
    await p.press('#seed', 'Enter');
    await p.waitForFunction((s) => document.querySelector('#log')?.textContent.includes(`seed "${s}"`), b.seed);
    for (const id of ['#chibi', '#kkScale', '#rig', '#atlas', '#gameMats']) {
      if (!(await p.isChecked(id))) throw new Error(`${b.id}: ${id} is not ticked by the townsfolk game set`);
    }
    if ((await p.isChecked('#ash')) !== !!b.ash) {
      await p.setChecked('#ash', !!b.ash);
      await p.waitForTimeout(400);
    }
    if ((await p.inputValue('#detail')) !== 'game') throw new Error(`${b.id}: detail is not "game budget"`);
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#downloadBtn')]);
    await dl.saveAs(path.join(outDir, `${b.id}.glb`));
    await p.screenshot({ path: path.join(outDir, `${b.id}.png`) });
    const name = await p.evaluate(() => window.__chargen.state.traits.name);
    console.log(`${b.id}: ${b.archetype} seed "${b.seed}"${b.ash ? ' ash' : ''} -> ${name}, ${fs.statSync(path.join(outDir, `${b.id}.glb`)).size} bytes`);
  }
} finally {
  await browser.close();
}
