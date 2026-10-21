// Headless smoke of the Phase C quest jumps (A16). Usage, like smoke-act1.mjs (playwright from the global install,
// Chromium at /opt/pw-browsers, never `playwright install`):
//   npm run dev -- --port 5199 &   then   node tools/smoke-act2.mjs http://localhost:5199/ [id ...]
// For each `?act2=<quest>&new`: the jump finishes, the quest is offerable (inactive), every prerequisite is completed, the
// player stands on the ground outside any interior within a few metres of the giver, the River Gate flag is set, containment
// holds the player inside the open area, Hrolf and Aelfreda are joined exactly when their quests are done, no console errors.
// PLAYWRIGHT_RESOLVE=/opt/node-tools/node_modules/ when playwright is not resolvable from here.
import { createRequire } from 'node:module';
const { chromium } = createRequire(process.env.PLAYWRIGHT_RESOLVE ?? import.meta.url)('playwright');

const base = process.argv[2] ?? 'http://localhost:5199/';
const ALL = ['m11', 'm12', 'r06', 'r05', 'm13', 'r07', 'r11', 'm14', 'm15', 'd03'];
const ids = process.argv.length > 3 ? process.argv.slice(3) : ALL;
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
let failed = false;

const GIVER = { m11: 'gaut', m12: 'osgar', r06: 'maud', r05: 'ketta', m13: 'hrolf', r07: 'ketta', r11: 'hrolf', m14: 'aelfreda', m15: 'osgar', d03: 'osgar' };
// Quests done before each jump that matter to the checks (the ?act2= prerequisite table, transitive for the joins).
const AFTER = {
  m11: [], m12: ['m11'], r06: ['m11', 'm12'], r05: ['m11', 'm12'], m13: ['m11', 'm12'], r07: ['m13', 'r05'],
  r11: ['m13'], m14: ['m13'], m15: ['m13', 'm14'], d03: ['m13', 'm14', 'm15'],
};

async function jump(id) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 640 } });
  const errors = [];
  page.on('console', (m) => {
    // Headless SwiftShader cannot decode some GLB textures; that is noise, not a defect.
    if (m.type() === 'error' && !/Couldn't load texture/.test(m.text())) errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${base}?act2=${id}&new`);
  await page.waitForFunction(() => window.__act2?.finished === true, null, { timeout: 120000 });
  await page.waitForTimeout(2500); // the teleport and the giver's post settle
  return { page, errors };
}

const state = (page, id) =>
  page.evaluate(([id, giver, after]) => {
    const ctx = window.__game.game.ctx;
    const q = ctx.services.get('quests');
    const f = ctx.player.feet;
    const g = ctx.services.get('npcs')?.position(giver);
    const c = ctx.services.get('containment');
    return {
      phase: window.__act2.phase,
      quest: q.state(id),
      prereqs: after.every((p) => q.state(p) === 'completed'),
      act1: q.state('d02') === 'completed',
      gate: ctx.state.getBool('story.gate.a2'),
      tutorial: window.__tutorial.complete,
      giverDistance: g ? Math.round(Math.hypot(g.x - f.x, g.z - f.z)) : -1,
      open: c ? c.isOpen(f.x, f.z) : null,
      interior: ctx.services.get('interiors')?.current ?? null,
      grounded: ctx.world?.player?.controller?.grounded ?? null,
      hrolf: ctx.state.getBool('story.m13.hrolfJoined'),
      aelfreda: ctx.state.getBool('story.m14.aelfredaJoined'),
      cardUp: ctx.services.get('actEndingCard')?.active() ?? false,
    };
  }, [id, GIVER[id], AFTER[id]]);

function expectAll(name, s, checks) {
  const bad = Object.entries(checks).filter(([, ok]) => !ok).map(([k]) => k);
  if (bad.length) {
    failed = true;
    console.log(`[${name}] FAILED: ${bad.join(', ')}`);
  }
}

for (const id of ids) {
  const { page, errors } = await jump(id);
  let s = null;
  try {
    s = await state(page, id);
    expectAll(id, s, {
      done: s.phase === 'done',
      offerable: s.quest === 'inactive',
      prereqs: s.prereqs,
      act1Done: s.act1,
      gateOpen: s.gate,
      tutorialComplete: s.tutorial,
      giverNear: s.giverDistance >= 0 && s.giverDistance < 8,
      outside: s.interior === null,
      inOpenArea: s.open !== false,
      onGround: s.grounded !== false,
      hrolf: s.hrolf === AFTER[id].includes('m13'),
      aelfreda: s.aelfreda === AFTER[id].includes('m14'),
      noCard: !s.cardUp,
    });
  } catch (err) {
    errors.push(`step failed: ${String(err).slice(0, 300)}`);
  }
  await page.screenshot({ path: `shot-act2-${id}.png` });
  console.log(`[${id}] errors=${errors.length} ${JSON.stringify(s)}`);
  for (const e of errors) console.log('   ', e.slice(0, 300));
  if (errors.length) failed = true;
  await page.close();
}

await browser.close();
process.exit(failed ? 1 : 0);
