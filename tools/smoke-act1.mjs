// Headless smoke of the Act 1 quest jumps (slice 2 threads 10 and 21). Usage, like smoke-tutorial.mjs (playwright from
// the global install, Chromium at /opt/pw-browsers, never `playwright install`):
//   npm run dev -- --port 5199 &   then   node tools/smoke-act1.mjs http://localhost:5199/
// For each `?act1=<quest>&new`: the jump finishes, the quest is active, the giver stands near the player, the
// quest's own gate holds (Tobb joined for M05 and D01, R02's blocking dummies in the yard), no console errors.
// For each Harrowmark `?act1=<quest>&new`: the jump finishes, the quest is offerable (not started), the player stands
// on the ground outside any interior within a few metres of its giver, no console errors.
// Then the fog wall: standing on the M05 jump (M05 not complete), solid, and its toast shows on entry.
import { createRequire } from 'node:module';
const { chromium } = createRequire(process.env.PLAYWRIGHT_RESOLVE ?? import.meta.url)('playwright');

const base = process.argv[2] ?? 'http://localhost:5199/';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
let failed = false;

const GIVER = {
  m03: 'aelfreda', m04: 'gaut', m05: 'tobb', d01: 'aelfreda', r01: 'wynn', r02: 'stane',
  m06: 'rook', m07: 'aldith', m08: 'wystan', m09: 'merrin', m10: 'gerta', r03: 'aldith', r04: 'whitlock', d02: 'rook',
};

async function jump(id) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 640 } });
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${base}?act1=${id}&new`);
  await page.waitForFunction(() => window.__act1?.finished === true, null, { timeout: 90000 });
  await page.waitForTimeout(2500); // the teleport and the giver's post settle
  return { page, errors };
}

const state = (page, id) =>
  page.evaluate(([id, giver]) => {
    const ctx = window.__game.game.ctx;
    const q = ctx.services.get('quests');
    const f = ctx.player.feet;
    const g = ctx.services.get('npcs')?.position(giver);
    return {
      phase: window.__act1.phase,
      quest: q.state(id),
      tutorial: window.__tutorial.complete,
      giverDistance: g ? Math.round(Math.hypot(g.x - f.x, g.z - f.z)) : -1,
      tobb: ctx.services.get('companions')?.active() ?? [],
      blockingDummies: [...ctx.actors.all()].filter((a) => a.kind === 'blocking-dummy').length,
      release: ctx.state.getBool('enemies.mercy.release'),
      spare: ctx.state.getBool('enemies.mercy.spare'),
      fogOpen: ctx.state.getBool('story.m05.complete'),
      interior: ctx.services.get('interiors')?.current ?? null,
      grounded: ctx.world?.player?.controller?.grounded ?? null,
    };
  }, [id, GIVER[id]]);

function expectAll(name, s, checks) {
  const bad = Object.entries(checks).filter(([, ok]) => !ok).map(([k]) => k);
  if (bad.length) {
    failed = true;
    console.log(`[${name}] FAILED: ${bad.join(', ')}`);
  }
}

for (const id of ['m03', 'm04', 'm05', 'd01', 'r01', 'r02']) {
  const { page, errors } = await jump(id);
  let s = null;
  try {
    s = await state(page, id);
    expectAll(id, s, {
      done: s.phase === 'done',
      active: s.quest === 'active',
      tutorialComplete: s.tutorial,
      // Gaut waits at the ford once M04 is accepted (quest post); every other giver stands at the jump point.
      giverNear: id === 'm04' ? s.giverDistance > 0 : s.giverDistance >= 0 && s.giverDistance < 40,
      tobb: (id === 'm05' || id === 'd01') === s.tobb.includes('tobb'),
      dummies: (id === 'r02') === (s.blockingDummies === 3),
      mercy: id === 'd01' ? s.release && s.spare : id === 'm03' || id === 'r01' || id === 'r02' ? !s.release && !s.spare : true,
      // The wall opens on story.m05.complete: standing through M05, open from the D01 jump on.
      fogStands: id === 'd01' ? s.fogOpen : !s.fogOpen,
    });
  } catch (err) {
    errors.push(`step failed: ${String(err).slice(0, 300)}`);
  }
  await page.screenshot({ path: `shot-act1-${id}.png` });
  console.log(`[${id}] errors=${errors.length} ${JSON.stringify(s)}`);
  for (const e of errors) console.log('   ', e.slice(0, 300));
  if (errors.length) failed = true;
  await page.close();
}

for (const id of ['m06', 'm07', 'm08', 'm09', 'm10', 'r03', 'r04', 'd02']) {
  const { page, errors } = await jump(id);
  let s = null;
  try {
    s = await state(page, id);
    expectAll(id, s, {
      done: s.phase === 'done',
      offerable: s.quest === 'inactive',
      tutorialComplete: s.tutorial,
      giverNear: s.giverDistance >= 0 && s.giverDistance < 6,
      outside: s.interior === null,
      onGround: s.grounded !== false,
      fogOpen: s.fogOpen,
    });
  } catch (err) {
    errors.push(`step failed: ${String(err).slice(0, 300)}`);
  }
  await page.screenshot({ path: `shot-act1-${id}.png` });
  console.log(`[${id}] errors=${errors.length} ${JSON.stringify(s)}`);
  for (const e of errors) console.log('   ', e.slice(0, 300));
  if (errors.length) failed = true;
  await page.close();
}

// The fog wall while M05 is active: walk into it from the road.
{
  const { page, errors } = await jump('m05');
  try {
    const r = await page.evaluate(async () => {
      const ctx = window.__game.game.ctx;
      const fog = ctx.anchors.get('fog.harrowmark').position;
      const ws = ctx.services.get('waystones');
      await ws.safeTeleport({ x: fog.x - 30, y: fog.y, z: fog.z }, Math.PI / 2);
      await new Promise((res) => setTimeout(res, 1500));
      // Push east through the trigger and against the wall for 4 s.
      const toast = () => [...document.querySelectorAll('.owg-toast')].some((el) => /ash-fall/.test(el.textContent ?? ''));
      let toastSeen = false;
      const entered = [];
      ctx.events.on('trigger.enter', (e) => entered.push(e.triggerId));
      for (let i = 0; i < 40; i++) {
        ctx.player.teleport({ x: fog.x - 20 + i, y: fog.y + 1, z: fog.z });
        await new Promise((res) => setTimeout(res, 100));
        toastSeen ||= toast();
      }
      // Then once well past it (the sweep's queued teleports race the push-back at a low frame rate): it puts the player back.
      ctx.player.teleport({ x: fog.x + 10, y: fog.y + 1, z: fog.z });
      await new Promise((res) => setTimeout(res, 4000));
      return {
        x: Math.round(ctx.player.feet.x), wallX: Math.round(fog.x), toastSeen, open: ctx.state.getBool('story.m05.complete'),
        fogTrigger: entered.includes('trg.fog.harrowmark'), modal: ctx.hud.modalOpen,
      };
    });
    console.log(`[fog] ${JSON.stringify(r)}`);
    expectAll('fog', r, { pushedBack: r.x <= r.wallX + 2, toastShown: r.toastSeen, closed: !r.open });
  } catch (err) {
    errors.push(`fog step failed: ${String(err).slice(0, 300)}`);
  }
  await page.screenshot({ path: 'shot-act1-fog.png' });
  for (const e of errors) console.log('   ', e.slice(0, 300));
  if (errors.length) failed = true;
  await page.close();
}

await browser.close();
process.exit(failed ? 1 : 0);
