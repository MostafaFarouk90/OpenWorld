// December roadmap T1: re-shoots the tester guide's per-quest journal pictures (docs/tester-guide/images/actN/<id>-giver-
// journal.jpg) from the debug jumps the guide lists. The first capture (2026-11-12) was a throwaway script; this one is kept
// so the guide can be refreshed after a change. Debug jumps exist only in a dev build:
//
//   npm run dev -- --port 5199 &
//   node scripts/capture-tester-guide.mjs http://localhost:5199/ [act-2.md,...] [quest ids, comma separated]
//
// Each quest: load `?actN=<id>&new`, wait for the world, close the boot card if one shows, open the journal (J), save a
// JPEG (quality 72, 1280x720). A quest whose page logs an error is reported and the run carries on; the exit code is 1
// if any quest failed. Needs Playwright with a Chromium (the cloud sessions have both).
import { readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:5199/';
const GUIDE = 'docs/tester-guide';
const pages = (process.argv[3] ?? readdirSync(GUIDE).filter((f) => /^act-\d\.md$/.test(f)).join(',')).split(',').filter(Boolean);
const only = process.argv[4] ? new Set(process.argv[4].split(',')) : null;

/** `?act2=m11&new` and friends, from the guide's quest tables. */
function jumpsIn(file) {
  const text = readFileSync(join(GUIDE, file), 'utf8');
  const out = new Map();
  for (const m of text.matchAll(/`\?(act\d)=([a-z0-9-]+)&new([^`]*)`/g)) {
    const [, act, id, rest] = m;
    if (!out.has(id)) out.set(id, { act, id, query: `?${act}=${id}&new${rest}` });
  }
  return [...out.values()];
}

const executablePath = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium';
const browser = await chromium.launch({ executablePath, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let failed = 0;
let shot = 0;
for (const file of pages) {
  for (const j of jumpsIn(file)) {
    if (only && !only.has(j.id)) continue;
    const dir = join(GUIDE, 'images', j.act);
    mkdirSync(dir, { recursive: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    try {
      await page.goto(BASE + j.query);
      await page.waitForFunction(() => !!window.__game?.world?.avatar, null, { timeout: 120_000 });
      await page.waitForTimeout(4000); // streaming terrain and NPCs settle
      await page.keyboard.press('KeyJ');
      await page.waitForTimeout(800);
      const path = join(dir, `${j.id}-giver-journal.jpg`);
      await page.screenshot({ path, type: 'jpeg', quality: 72 });
      shot++;
      console.log(`${j.query}  ->  ${path}${errors.length ? `  (${errors.length} console errors)` : ''}`);
      if (errors.length) failed++;
    } catch (e) {
      failed++;
      console.log(`${j.query}  FAILED: ${e instanceof Error ? e.message.split('\n')[0] : e}`);
    }
    await page.close();
  }
}
await browser.close();
console.log(`${shot} pictures, ${failed} with problems`);
process.exit(failed ? 1 : 0);
