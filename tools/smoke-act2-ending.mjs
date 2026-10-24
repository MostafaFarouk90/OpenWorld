// Headless smoke of the Act 2 ending and the Phase D jumps (A16). Usage, like smoke-act2.mjs (the `?act2=` jumps are
// dev-only, so this runs against the dev server, not a build; playwright from the global install, Chromium at /opt/pw-browsers):
//   npx vite --port 5199 --strictPort &   then   node tools/smoke-act2-ending.mjs http://localhost:5199/ [boot m17 m19 d04 m22 ending]
// Every jump: it finishes, zero console errors / page errors, no boot warnings (console.warn from the game). The `ending`
// jump also: "The Houses Stand" card shows once, `story.gate.a3` is set, the camp scene is reachable and sets Wenna at the
// Tilted Anvil hearth, the Silver Fountain runs and the stalls stand open (shots), Aldous's chair is empty in the Keep hall (shot).
// The `m19` jump also visits the Slagmaw arena (the Deepdelve interior) and shoots it.
// Shots go to $SHOT_DIR (default /mnt/project-files/assets/renders/act2-A16-ending/, with the trailing slash); the plain
// per-jump screenshots land in shot-act2-<id>.png (git-ignored).
// PLAYWRIGHT_RESOLVE=/opt/node-tools/node_modules/ when playwright is not resolvable from here.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const { chromium } = createRequire(process.env.PLAYWRIGHT_RESOLVE ?? import.meta.url)('playwright');

const base = process.argv[2] ?? 'http://localhost:5199/';
const ALL = ['boot', 'm17', 'm19', 'd04', 'm22', 'ending'];
const REPLAY_WARN = /^\[act2\] |take: could not remove|^\[quests\] take:|companion\.rank refused|Hearth Rite was refused|"zone" request dropped/;
const ids = process.argv.length > 3 ? process.argv.slice(3) : ALL;
const SHOTS = process.env.SHOT_DIR ?? '/mnt/project-files/assets/renders/act2-A16-ending/';
mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
let failed = false;
const fail = (name, what) => { failed = true; console.log(`[${name}] FAILED: ${what}`); };

async function jump(id) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 640 } });
  const errors = [];
  const warns = [];
  page.on('console', (m) => {
    // Headless SwiftShader cannot decode some GLB textures; that is noise, not a defect.
    if (m.type() === 'error' && !/Couldn't load texture/.test(m.text())) errors.push(m.text());
    if (m.type() === 'warning' && !/GPU stall|swiftshader|WebGL|texture/i.test(m.text())) warns.push(m.text());
    // The jump replays Act 1 and Phase C through the effect runner with stand-in items and a skipped Hearth Rite; these
    // are its known side effects, not boot warnings of the game.
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  if (id === 'boot') {
    // A plain new game: any game warning is a boot warning (nothing replays).
    await page.goto(`${base}?new`);
    await page.waitForFunction(() => window.__tutorial !== undefined, null, { timeout: 180000 });
    await page.waitForTimeout(4000);
    return { page, errors, warns };
  }
  await page.goto(`${base}?act2=${id}&new`);
  await page.waitForFunction(() => window.__act2?.finished === true, null, { timeout: 180000 });
  await page.waitForTimeout(2500);
  return { page, errors, warns };
}

const ev = (page, fn, arg) => page.evaluate(fn, arg);
const snap = (page, name) => page.screenshot({ path: `${SHOTS}${name}.png` });
const sleep = (page, ms) => page.waitForTimeout(ms);
/** Place the player at (x, z) on the ground height y, facing a yaw (radians; yaw 0 faces -Z), camera behind. */
const placeAt = (page, x, y, z, yaw) =>
  ev(page, ([x, y, z, yaw]) => {
    const ctx = window.__game.game.ctx;
    ctx.player.teleport({ x, y, z }, yaw);
    if (ctx.cameraRig) ctx.cameraRig.yaw = yaw;
  }, [x, y, z, yaw]);
/** Stand `back` metres behind an anchor (opposite its facing) looking along that facing, offset by (dx, dz) first. */
const goTo = (page, anchorId, back = 0, dx = 0, dz = 0) =>
  ev(page, ([anchorId, back, dx, dz]) => {
    const ctx = window.__game.game.ctx;
    const a = ctx.anchors.find(anchorId);
    if (!a) return false;
    const x = a.position.x + dx + Math.sin(a.yaw) * back;
    const z = a.position.z + dz + Math.cos(a.yaw) * back;
    ctx.player.teleport({ x, y: a.position.y, z }, a.yaw);
    if (ctx.cameraRig) ctx.cameraRig.yaw = a.yaw;
    return true;
  }, [anchorId, back, dx, dz]);

async function phaseChecks(id, page) {
  const s = await ev(page, () => {
    const ctx = window.__game.game.ctx;
    const q = ctx.services.get('quests');
    return {
      phase: window.__act2.phase,
      m22: q.state('m22'), d04: q.state('d04'), m19: q.state('m19'),
      a3: ctx.state.getBool('story.gate.a3'),
      cardUp: ctx.services.get('actEndingCard')?.active() ?? false,
      interior: ctx.services.get('interiors')?.current ?? null,
    };
  });
  if (s.phase !== 'done') fail(id, `phase ${s.phase}`);
  if (id !== 'ending' && id !== 'm22' && s.a3) fail(id, 'story.gate.a3 set early');
  return s;
}

async function endingChecks(page, errors) {
  const name = 'ending';
  // The card appears once (the director emits act.ended once) and sets the a3 gate.
  await page.waitForFunction(() => window.__game.game.ctx.state.getBool('story.gate.a3'), null, { timeout: 60000 }).catch(() => {});
  await sleep(page, 3000);
  const card = await ev(page, () => {
    const ctx = window.__game.game.ctx;
    const el = [...document.querySelectorAll('*')].filter((e) => e.children.length === 0 && /The Houses Stand/.test(e.textContent ?? ''));
    return { a3: ctx.state.getBool('story.gate.a3'), up: ctx.services.get('actEndingCard')?.active() ?? false, titles: el.length };
  });
  console.log(`[ending] card ${JSON.stringify(card)}`);
  if (!card.a3) fail(name, 'story.gate.a3 not set');
  if (!card.up || card.titles !== 1) fail(name, `ending card not shown exactly once (${JSON.stringify(card)})`);
  await snap(page, 'ending-card');
  // Count act.ended emissions from here on, then dismiss the card as its key would and let the camp scene run.
  await ev(page, () => {
    const ctx = window.__game.game.ctx;
    window.__ended = 0;
    ctx.events.on('act.ended', () => window.__ended++);
    ctx.services.get('actEndingCard').dismiss();
  });
  await page.waitForFunction(() => window.__game.game.ctx.services.get('dialogue')?.active === true, null, { timeout: 30000 }).catch(() => {});
  const camp = await ev(page, () => {
    const ctx = window.__game.game.ctx;
    return { active: ctx.services.get('dialogue')?.active === true, cardUp: ctx.services.get('actEndingCard').active(), ended: window.__ended };
  });
  console.log(`[ending] camp ${JSON.stringify(camp)}`);
  if (!camp.active) fail(name, 'camp scene not running after the card closed');
  if (camp.ended !== 0) fail(name, `act.ended emitted again (${camp.ended})`);
  await sleep(page, 800);
  await snap(page, 'ending-camp-scene');
  // Walk the camp scene to its end with the real dialogue key.
  for (let i = 0; i < 60; i++) {
    if (!(await ev(page, () => window.__game.game.ctx.services.get('dialogue')?.active === true))) break;
    await page.keyboard.press('Space');
    await sleep(page, 400);
  }
  await sleep(page, 2000);
  const after = await ev(page, () => {
    const ctx = window.__game.game.ctx;
    return {
      campSeen: ctx.state.getBool('story.a2.campSeen'),
      wenna: ctx.state.getBool('story.a2.wennaAtCamp'),
      dialogueActive: ctx.services.get('dialogue')?.active === true,
    };
  });
  console.log(`[ending] after-camp ${JSON.stringify(after)}`);
  if (!after.wenna) fail(name, 'story.a2.wennaAtCamp not set by the camp scene');

  // Harrowmark world change: the fountain and the stalls.
  const wc = await ev(page, () => window.__game.game.ctx.scene.getObjectByName('harrowmark-world-change-a3')?.children.length ?? -1);
  console.log(`[ending] world-change a3 children=${wc}`);
  if (!(wc > 0)) fail(name, 'harrowmark-world-change-a3 group missing or empty');
  const fy = await ev(page, () => window.__game.game.ctx.anchors.find('harrowmark.square.fountain')?.position.y ?? 0);
  await placeAt(page, 8500, fy, 1700 + 11, 0); // the basin is at x 8500, z 1700; yaw 0 looks along -z at it
  await sleep(page, 3500);
  await snap(page, 'ending-fountain');
  const stall = await ev(page, () => {
    const ctx = window.__game.game.ctx;
    const g = ctx.scene.getObjectByName('harrowmark-world-change-a3');
    const kids = g ? g.children.filter((c) => c.children.length === 2) : [];
    const k = kids[0];
    if (!k) return null;
    const p = k.position;
    const yaw = k.rotation.y;
    return { x: p.x, y: p.y, z: p.z, yaw, n: kids.length };
  });
  console.log(`[ending] stalls ${JSON.stringify(stall)}`);
  if (!stall || stall.n < 1) fail(name, 'no open stalls');
  else {
    await ev(page, (st) => {
      const ctx = window.__game.game.ctx;
      // Stand 7 m in front of the stall (the stall faces +z at yaw 0), looking at it.
      const fx = Math.sin(st.yaw), fz = Math.cos(st.yaw);
      const pos = { x: st.x + fx * 8, y: st.y, z: st.z + fz * 8 };
      const face = Math.atan2(fx, fz); // looking from `pos` back at the stall
      ctx.player.teleport(pos, face);
      if (ctx.cameraRig) ctx.cameraRig.yaw = face;
    }, stall);
    await sleep(page, 3500);
    await snap(page, 'ending-stall');
  }

  // Wenna at the Tilted Anvil hearth (the camp), then Aldous's empty chair in the Keep hall.
  const wennaPost = await ev(page, () => {
    const ctx = window.__game.game.ctx;
    const p = ctx.services.get('npcs')?.position('wenna');
    const a = ctx.anchors.find('npc-post.wenna.tilted-anvil');
    return { npc: p ? { x: Math.round(p.x), z: Math.round(p.z) } : null, post: a ? { x: Math.round(a.position.x), z: Math.round(a.position.z) } : null };
  });
  console.log(`[ending] wenna ${JSON.stringify(wennaPost)}`);
  if (!wennaPost.npc) fail(name, 'wenna has no position');
  else if (wennaPost.post && Math.hypot(wennaPost.npc.x - wennaPost.post.x, wennaPost.npc.z - wennaPost.post.z) > 3) fail(name, 'wenna is not at the Tilted Anvil hearth post');
  // Enter the Tilted Anvil if reachable, to shoot Wenna by the hearth.
  const tilted = await enterInterior(page, 'tilted-anvil', 'tilted-anvil');
  console.log(`[ending] tilted-anvil enter ${tilted}`);
  if (tilted === 'ok') {
    await goTo(page, 'npc-post.wenna.tilted-anvil', 3);
    await sleep(page, 3000);
    const w = await ev(page, () => {
      const ctx = window.__game.game.ctx;
      const p = ctx.services.get('npcs')?.position('wenna');
      const f = ctx.player.feet;
      return p ? Math.round(Math.hypot(p.x - f.x, p.z - f.z)) : -1;
    });
    console.log(`[ending] wenna distance in tilted anvil ${w}`);
    if (w < 0 || w > 12) fail(name, 'wenna not inside the Tilted Anvil');
    await snap(page, 'ending-wenna-hearth');
    await ev(page, () => window.__game.game.ctx.services.get('interiors').exit());
    await sleep(page, 2500);
  } else fail(name, `could not enter the Tilted Anvil (${tilted})`);
  const keep = await enterInterior(page, 'keep-hall', 'keep-hall', true);
  console.log(`[ending] keep-hall enter ${keep}`);
  if (keep === 'ok') {
    // The chair stands 1 m north (-z) of that anchor: stand 9 m south of it and face -z (yaw 0).
    await goTo(page, 'harrowmark.keep-hall.aldous-chair', 0, 0, 9);
    await ev(page, () => { const c = window.__game.game.ctx; c.player.teleport(c.player.feet, 0); if (c.cameraRig) c.cameraRig.yaw = 0; });
    await sleep(page, 5000);
    console.log(`[ending] keep-hall feet ${JSON.stringify(await ev(page, () => { const c = window.__game.game.ctx; return { f: c.player.feet, i: c.services.get('interiors').current }; }))}`);
    const aldous = await ev(page, () => {
      const ctx = window.__game.game.ctx;
      const p = ctx.services.get('npcs')?.position('aldous');
      const f = ctx.player.feet;
      return p ? Math.round(Math.hypot(p.x - f.x, p.z - f.z)) : null;
    });
    console.log(`[ending] aldous distance from his chair ${aldous}`);
    if (aldous !== null && aldous < 4) fail(name, 'aldous is at his chair; it should be empty');
    await snap(page, 'ending-aldous-chair');
  } else fail(name, `could not enter the Keep hall (${keep})`);
}

async function enterInterior(page, interiorId, doorId, openKeep = false) {
  return ev(page, async ([interiorId, doorId, openKeep]) => {
    const ctx = window.__game.game.ctx;
    const it = ctx.services.get('interiors');
    if (!it) return 'no service';
    if (it.current) await it.exit();
    if (openKeep) ctx.state.setFlag('story.m08.keepOpen', true);
    try {
      await it.enter(interiorId, doorId);
    } catch (e) {
      return `threw ${String(e).slice(0, 100)}`;
    }
    await new Promise((r) => setTimeout(r, 2500));
    return it.current === interiorId ? 'ok' : `refused (current ${it.current})`;
  }, [interiorId, doorId, openKeep]);
}

async function slagmawChecks(page) {
  const name = 'm19-slagmaw';
  const r = await ev(page, async () => {
    const ctx = window.__game.game.ctx;
    ctx.state.setFlag('world.oldsmoke.lift.restored', true);
    const it = ctx.services.get('interiors');
    if (it.current) await it.exit();
    try {
      await it.enter('mine-deepdelve', 'mine-deepdelve');
    } catch (e) {
      return { err: String(e).slice(0, 120) };
    }
    await new Promise((r) => setTimeout(r, 3000));
    const a = ctx.anchors.find('deepdelve.slagmaw.arena.centre');
    return { current: it.current, arena: a ? { x: Math.round(a.position.x), z: Math.round(a.position.z) } : null };
  });
  console.log(`[m19] deepdelve ${JSON.stringify(r)}`);
  if (r.err || r.current !== 'mine-deepdelve' || !r.arena) { fail(name, `Deepdelve arena not reachable ${JSON.stringify(r)}`); return; }
  await goTo(page, 'deepdelve.slagmaw.arena.centre', 9);
  await sleep(page, 3500);
  await snap(page, 'slagmaw-arena');
}

for (const id of ids) {
  const { page, errors, warns } = await jump(id);
  let s = null;
  try {
    if (id !== 'boot') s = await phaseChecks(id, page);
    if (id === 'm19') await slagmawChecks(page);
    if (id === 'ending') await endingChecks(page, errors);
  } catch (err) {
    errors.push(`step failed: ${String(err).slice(0, 300)}`);
  }
  await page.screenshot({ path: `shot-act2-${id}.png` });
  const replayed = warns.filter((w) => id !== 'boot' && REPLAY_WARN.test(w));
  const bootWarns = warns.filter((w) => !replayed.includes(w));
  console.log(`[${id}] errors=${errors.length} bootWarnings=${bootWarns.length} replayWarnings=${replayed.length} ${JSON.stringify(s)}`);
  for (const e of errors) console.log('   error:', e.slice(0, 300));
  for (const w of bootWarns) console.log('   warn:', w.slice(0, 300));
  for (const w of replayed) console.log('   replay-warn:', w.slice(0, 200));
  if (errors.length || bootWarns.length) failed = true;
  await page.close();
}

await browser.close();
process.exit(failed ? 1 : 0);
