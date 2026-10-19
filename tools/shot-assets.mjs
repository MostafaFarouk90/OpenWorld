// Screenshots of the asset swap in the real game (headless Chromium, SwiftShader). Usage:
//   npm run dev -- --port 5199 &   then   node tools/shot-assets.mjs <outDir> [baseUrl] [stopName ...]
// Each stop teleports the player near a point, puts a scripted camera on it (cameraRig.override), waits for the models to
// stream in, then saves <outDir>/<name>.png and prints renderer.info (calls, triangles). Stops are map coordinates (engine
// x, z) plus the camera offset; ground height comes from the heightfield through the teleport.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const { chromium } = createRequire(process.env.PLAYWRIGHT_RESOLVE ?? '/opt/node-tools/node_modules/')('playwright');
const out = process.argv[2] ?? 'shots';
const base = process.argv[3] ?? 'http://localhost:5199/';
const only = process.argv.slice(4);
mkdirSync(out, { recursive: true });

// name: anchor id to look at, look-at height above it, camera offset (dx, dy, dz) from the look-at point, in metres.
const STOPS = {
  'bw-bakery': { anchor: 'kettlewick.bakery-door', look: 3, cam: [-18, 7, 14] },
  'bw-chapel': { anchor: 'chapel.door', look: 4, cam: [-28, 9, 20] },
  'bw-tavern': { anchor: 'kettlewick.tavern-door', look: 3, cam: [-18, 7, 14] },
  'hm-south-gate': { at: [8500, 1250], look: 8, cam: [30, 12, -70], open: true },
  'hm-forge-row': { anchor: 'harrowmark.forge-row.centre', look: 4, cam: [-45, 14, 50], open: true },
  'hm-keep': { anchor: 'harrowmark.keep-hall.door', look: 12, cam: [-60, 25, -110], open: true },
  'in-keep-hall': { anchor: 'harrowmark.keep-hall.entry', enter: ['keep-hall', 'keep-hall'], look: 2, cam: [2, 2.2, 4], lookOff: [0, 1.5, -12], open: true },
  'in-archive': { anchor: 'harrowmark.archive.entry', enter: ['archive', 'archive'], look: 2, cam: [0, 3, 8], lookOff: [0, 1.5, -8], open: true },
  'in-underways': { anchor: 'harrowmark.underways.entry', enter: ['underways', 'underways'], look: 2, cam: [0, 3, 8], lookOff: [0, 1.5, -8], open: true },
  'in-tilted-anvil': { anchor: 'harrowmark.tilted-anvil.entry', enter: ['tilted-anvil', 'tilted-anvil'], look: 2, cam: [2, 2.2, 4], lookOff: [0, 1.5, -8], open: true },
  'hm-ward': { anchor: 'harrowmark.hide.rooftop-chimney-1', look: 4, cam: [-45, 18, -45], open: true },
  'hm-chapel': { anchor: 'harrowmark.chapel.door', look: 8, cam: [-50, 20, -60], open: true },
  'hm-street-level': { anchor: 'harrowmark.square.fountain', look: 6, cam: [-30, 3, 8], lookOff: [30, 6, 0], open: true },
  'hm-forge-street': { anchor: 'harrowmark.forge-row.centre', look: 5, cam: [0, 3, -30], lookOff: [0, 5, 20], open: true },
  'hm-main-street': { anchor: 'harrowmark.square.fountain', look: 4, cam: [0, 10, -60], open: true },
};
const stops = Object.entries(STOPS).filter(([n]) => only.length === 0 || only.includes(n));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 640 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' || m.text().includes('unavailable')) errors.push(m.text()); });
await page.goto(base + '?tutorial=veteran');
await page.waitForFunction(() => window.__game?.game?.ctx, null, { timeout: 90000 });
await page.waitForTimeout(6000);
for (const [name, s] of stops) {
  const ok = await page.evaluate(async ({ anchor, at, look, cam, open, enter, lookOff }) => {
    const ctx = window.__game.game.ctx;
    if (open) {
      ctx.state.setFlag('story.m05.complete', true);
      ctx.state.setFlag('story.m06.started', true);
      ctx.state.setFlag('story.m06.route', 'bribe');
    }
    const a = at ? { position: { x: at[0], y: 60, z: at[1] } } : ctx.anchors.find(anchor);
    if (!a) return false;
    window.__shot?.release(0);
    if (enter) {
      for (const f of ['story.m08.keepOpen', 'story.m09.houseOpen', 'story.d02.underwaysOpen', 'world.harrowmark.inn.room']) ctx.state.setFlag(f, true);
      const door = ctx.anchors.find(`harrowmark.door.${enter[1]}`) ?? ctx.anchors.find(`harrowmark.${enter[1]}.door`);
      if (door) ctx.player.teleport({ x: door.position.x, y: door.position.y + 1, z: door.position.z }, 0);
      await new Promise((r) => setTimeout(r, 2500));
      await ctx.services.get('interiors').enter(enter[0], enter[1]);
      await new Promise((r) => setTimeout(r, 1500));
    }
    if (!enter) {
      const t = ctx.player.teleport({ x: a.position.x + 3, y: a.position.y + 2, z: a.position.z + 3 }, 0);
      for (let i = 0; i < 100 && !t.ready(); i++) await new Promise((r) => setTimeout(r, 100));
    }
    if (enter) return true; // inside: the follow camera behind the player
    window.__shot = ctx.cameraRig.override({
      position: { x: a.position.x + cam[0], y: a.position.y + cam[1], z: a.position.z + cam[2] },
      lookAt: { x: a.position.x + (lookOff?.[0] ?? 0), y: a.position.y + (lookOff?.[1] ?? look), z: a.position.z + (lookOff?.[2] ?? 0) },
      blendIn: 0,
    });
    return true;
  }, s);
  if (!ok) {
    console.log(name, 'anchor missing');
    continue;
  }
  await page.waitForTimeout(5000);
  const info = await page.evaluate(() => {
    const r = window.__game.game.ctx.services.get('graphics')?.renderer;
    return r ? { calls: r.info.render.calls, tris: r.info.render.triangles } : null;
  });
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log(name, JSON.stringify(info));
}
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors');
await browser.close();
