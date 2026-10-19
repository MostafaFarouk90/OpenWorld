// Screenshots of what the asset swap leaves in the player's hands and under the saddle, in the real game (headless Chromium).
// Usage: npm run dev -- --port 5199 &   then   node tools/shot-gear.mjs <outDir> [baseUrl]
// Writes waystone-dead-road.png, weapon-<class>.png for the five classes, horse-standing.png and horse-mounted.png.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const { chromium } = createRequire(process.env.PLAYWRIGHT_RESOLVE ?? '/opt/node-tools/node_modules/')('playwright');
const out = process.argv[2] ?? 'shots';
const base = process.argv[3] ?? 'http://localhost:5199/';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];

async function open(search = '?tutorial=veteran') {
  const page = await browser.newPage({ viewport: { width: 1000, height: 640 } });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' || m.text().includes('unavailable') || m.text().includes('glb horse')) errors.push(m.text()); });
  await page.goto(base + search);
  await page.waitForFunction(() => window.__game?.game?.ctx, null, { timeout: 90000 });
  await page.waitForTimeout(6000);
  return page;
}

/** Teleports to a ground point and waits for the terrain; the camera is then a scripted shot relative to the feet. */
const stand = (page, at, anchor) =>
  page.evaluate(async ({ at, anchor }) => {
    const ctx = window.__game.game.ctx;
    const a = anchor ? ctx.anchors.find(anchor) : { position: { x: at[0], y: 60, z: at[1] } };
    if (!a) return false;
    const t = ctx.player.teleport({ x: a.position.x + 3, y: a.position.y + 2, z: a.position.z + 3 }, 0);
    for (let i = 0; i < 100 && !t.ready(); i++) await new Promise((r) => setTimeout(r, 100));
    await new Promise((r) => setTimeout(r, 2500));
    return true;
  }, { at, anchor });

const shotFeet = (page, offset, lookUp) =>
  page.evaluate(({ offset, lookUp }) => {
    const ctx = window.__game.game.ctx;
    window.__shot?.release(0);
    const f = () => ctx.player.feet;
    window.__shot = ctx.cameraRig.override({
      position: () => ({ x: f().x + offset[0], y: f().y + offset[1], z: f().z + offset[2] }),
      lookAt: () => ({ x: f().x, y: f().y + lookUp, z: f().z }),
      blendIn: 0,
    });
  }, { offset, lookUp });

// The Dead Road waystone and its surroundings.
{
  const page = await open();
  await page.evaluate(() => {
    const ctx = window.__game.game.ctx;
    const a = ctx.anchors.find('waystone.hollin-ford');
    window.__a = a.position;
  });
  await stand(page, null, 'waystone.hollin-ford');
  await page.evaluate(() => {
    const ctx = window.__game.game.ctx;
    const a = window.__a;
    window.__shot = ctx.cameraRig.override({ position: { x: a.x - 14, y: a.y + 6, z: a.z + 12 }, lookAt: { x: a.x, y: a.y + 1.5, z: a.z }, blendIn: 0 });
  });
  await page.waitForTimeout(5000);
  await page.screenshot({ path: `${out}/waystone-dead-road.png` });
  await page.close();
}

// Each class's weapon in hand, from the front.
for (const cls of ['knight', 'warden', 'emberwright', 'ashblade', 'pathfinder']) {
  const page = await open();
  const ok = await page.evaluate(async (cls) => {
    const ctx = window.__game.game.ctx;
    ctx.state.setFlag('story.m05.complete', true);
    ctx.state.setFlag(`classes.available.${cls}`, true);
    const r = ctx.services.get('classes').choose(cls);
    await new Promise((res) => setTimeout(res, 3000));
    return r;
  }, cls);
  console.log(cls, JSON.stringify(ok));
  await stand(page, null, 'waystone.kettlewick');
  await shotFeet(page, [1.7, 1.4, -3.4], 0.9);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${out}/weapon-${cls}.png` });
  await page.close();
}

// The Ashmare, standing and ridden.
{
  const page = await open();
  await stand(page, null, 'harrowmark.stables.yard');
  await page.evaluate(() => {
    const ctx = window.__game.game.ctx;
    // The mount waits at `harrowmark.stables.ashmare`, which no plugin defines yet: put it at the stables yard for the shot.
    if (!ctx.anchors.find('harrowmark.stables.ashmare')) {
      const y = ctx.anchors.find('harrowmark.stables.yard');
      ctx.anchors.define({ id: 'harrowmark.stables.ashmare', position: { x: y.position.x, y: y.position.y, z: y.position.z }, yaw: 0 });
    }
    ctx.state.setFlag('story.m05.complete', true);
    ctx.state.setFlag('story.m06.started', true);
    ctx.state.setFlag('story.m06.route', 'bribe');
    ctx.state.setFlag('story.m10.ashmare', true);
  });
  await page.waitForTimeout(4000);
  const info = await page.evaluate(() => {
    const ctx = window.__game.game.ctx;
    const m = ctx.services.get('mount');
    const v = m.visual;
    return { glb: !!v?.glb, placed: m.serialize?.().placed };
  });
  console.log('horse', JSON.stringify(info));
  const h = info.placed;
  await page.evaluate((h) => {
    const ctx = window.__game.game.ctx;
    window.__shot?.release(0);
    window.__shot = ctx.cameraRig.override({ position: { x: h.x + 4.5, y: h.y + 2, z: h.z - 3.5 }, lookAt: { x: h.x, y: h.y + 1.2, z: h.z }, blendIn: 0 });
  }, h);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${out}/horse-standing.png` });
  // Mount with H, then gallop forward for a moment.
  await page.evaluate(async (h) => {
    const ctx = window.__game.game.ctx;
    const t = ctx.player.teleport({ x: h.x + 1.2, y: h.y + 1, z: h.z + 0.5 }, 0);
    for (let i = 0; i < 100 && !t.ready(); i++) await new Promise((r) => setTimeout(r, 100));
    const key = (type) => window.dispatchEvent(Object.assign(new Event(type), { code: 'KeyH', repeat: false, preventDefault: () => {} }));
    key('keydown');
    await new Promise((r) => setTimeout(r, 200));
    key('keyup');
    await new Promise((r) => setTimeout(r, 2000));
  }, h);
  console.log('mounted', await page.evaluate(() => window.__game.game.ctx.services.get('mount').mounted()));
  await shotFeet(page, [4.2, 1.9, -3.4], 1.2);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/horse-mounted.png` });
  await page.close();
}
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors');
await browser.close();
