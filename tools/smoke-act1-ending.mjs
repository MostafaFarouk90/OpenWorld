// Real-game smoke of the act's end (slice 2 thread 21). Usage as smoke-act1.mjs, plus the Grimtooth branch:
//   node tools/smoke-act1-ending.mjs http://localhost:5199/ released|defeated
// Real-game run: ?act1=d02&new -> Rook's offer by keys -> Underways door by F -> kennels -> Grimtooth fight (watched) ->
// window -> Calm by holding T -> out -> Rook hand-in -> card (closed by a key) -> camp read by F.
import { createRequire } from 'node:module';
const { chromium } = createRequire(process.env.PLAYWRIGHT_RESOLVE ?? import.meta.url)('playwright');
const base = process.argv[2] ?? 'http://localhost:5199/';
const branch = process.argv[3] ?? 'released';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 640 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const wait = (ms) => page.waitForTimeout(ms);
const ev = (fn, arg) => page.evaluate(fn, arg);
const shot = (n) => page.screenshot({ path: `grim-${branch}-${n}.png` });

await page.goto(`${base}?act1=d02&new`);
await page.waitForFunction(() => window.__act1?.finished === true, null, { timeout: 120000 });
await wait(2500);
await ev(() => {
  const ctx = window.__game.game.ctx;
  window.__log = [];
  for (const t of ['boss.started', 'boss.phase', 'boss.released', 'boss.defeated', 'boss.ended', 'actor.staggered', 'status.applied', 'enemy.spawned', 'act.ended', 'hud.actEnding.closed', 'dialogue.started', 'dialogue.ended', 'quest.completed', 'quest.objectiveCompleted', 'interior.entered', 'mercy'])
    ctx.events.on(t, (p) => window.__log.push({ t, at: Math.round(performance.now()), p: JSON.parse(JSON.stringify(p ?? null, (k, v) => (typeof v === 'object' && v && v.isVector3 ? [v.x, v.y, v.z].map((n) => +n.toFixed(1)) : v))) }));
  ctx.events.on('damage.applied', (p) => { if (p?.targetId === ctx.player.actor.id) window.__log.push({ t: 'player.hit', at: Math.round(performance.now()), p: { by: ctx.actors.get(p.attackerId)?.kind, move: p.moveId ?? p.tag ?? null, amount: p.amount } }); });
});
const focus = () => ev(() => window.__game.game.ctx.interaction.focusFor('interact')?.id ?? null);
const dlg = () => ev(() => window.__game.game.ctx.services.get('dialogue').active);
async function talkThrough(pick = '1') {
  for (let i = 0; i < 80 && (await dlg()); i++) {
    const choices = await ev(() => document.querySelector('.dialogue-choices')?.children.length ?? 0);
    await page.keyboard.press(choices ? `Digit${pick}` : 'KeyF');
    await wait(350);
  }
}
const heal = () => ev(() => { const p = window.__game.game.ctx.player.actor; p.health = p.maxHealth; });

// 1. Rook's offer.
log('focus at jump', await focus());
async function faceNpc(id) {
  for (const d of [1.6, 1.2, 0.9]) for (const ang of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    await ev(async ([id, d, ang]) => {
      const ctx = window.__game.game.ctx;
      const r = ctx.services.get('npcs').position(id);
      const x = r.x + Math.sin(ang) * d, z = r.z + Math.cos(ang) * d;
      await ctx.services.get('waystones').safeTeleport({ x, y: r.y, z }, Math.atan2(x - r.x, z - r.z));
    }, [id, d, ang]);
    await wait(700);
    const f = await focus();
    if (f && f.includes(id)) return f;
  }
  return focus();
}
log('rook focus', await faceNpc('rook'));
await page.keyboard.press('KeyF'); await wait(800);
log('dialogue open', await dlg());
await shot('1-rook');
await talkThrough('1');
const q = () => ev(() => { const s = window.__game.game.ctx.services.get('quests'); return { d02: s.state('d02'), o: ['o1','o2','o3','o4','o5'].map((o) => s.objectiveDone('d02', o)) }; });
log('after Rook', JSON.stringify(await q()));

// 2. The Underways door.
await ev(async () => {
  const ctx = window.__game.game.ctx;
  const a = ctx.anchors.find('harrowmark.underways.door');
  const fx = -Math.sin(a.yaw), fz = -Math.cos(a.yaw);
  const ws = ctx.services.get('waystones');
  await ws.safeTeleport({ x: a.position.x + fx * 1.2, y: a.position.y, z: a.position.z + fz * 1.2 }, Math.atan2(fx, fz));
});
for (let i = 0; i < 40 && (await focus()) !== 'door:underways'; i++) await wait(250);
log('door focus', await focus());
await page.keyboard.press('KeyF');
await page.waitForFunction(() => window.__game.game.ctx.services.get('interiors').current === 'underways', null, { timeout: 30000 });
await wait(2000);
await shot('2-underways');
log('inside', JSON.stringify(await q()));

// 3. Kennels (shortcut: lethal hits as the player once they spawn).
for (let i = 0; i < 40; i++) {
  const done = await ev(async () => {
    const ctx = window.__game.game.ctx;
    const k = ctx.anchors.find('underways.spawn.hound-1').position;
    if (ctx.player.feet.distanceTo(k) > 3) ctx.player.teleport({ x: k.x + 1.5, y: k.y + 0.1, z: k.z });
    for (const a of ctx.actors.all()) if (!a.dead && a.kind === 'ember-hound') ctx.damage.apply({ attackerId: ctx.player.actor.id, targetId: a.id, amount: 1e5, poise: 1e5, kind: 'melee' });
    return ctx.services.get('quests').objectiveDone('d02', 'o3');
  });
  await heal();
  if (done) break;
  await wait(500);
}
log('kennels', JSON.stringify(await q()));

// 4. Arena: walk in by the trigger, then watch him fight for 40 s (player kept alive).
await ev(() => {
  const ctx = window.__game.game.ctx;
  const t = ctx.triggers.triggers.get('trg.underways.arena').def.shape.center;
  ctx.player.teleport({ x: t.x, y: t.y, z: t.z });
});
const bossState = () => ev(() => window.__game.game.ctx.bosses.state('gaffer-grimtooth'));
for (let i = 0; i < 40 && !(await bossState()); i++) await wait(250);
await wait(500);
const bar = await ev(() => [...document.querySelectorAll('[class*=boss]')].filter((e) => e.offsetParent).map((e) => e.className).slice(0, 3));
log('boss', JSON.stringify(await bossState()), 'bar', JSON.stringify(bar));
await shot('3-intro');
const fps = await ev(() => new Promise((r) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(f); else r(n); }; requestAnimationFrame(f); }));
log('fps', fps);
// Let him fight for 40 s (the player kept alive).
await ev(() => {
  const ctx = window.__game.game.ctx;
  window.__mv = setInterval(() => { ctx.player.actor.health = ctx.player.actor.maxHealth; }, 50);
});
for (let i = 0; i < 8; i++) {
  await wait(5000);
  await page.keyboard.press('Digit1'); // a swing now and then (left attack) so he reacts
}
await shot('4-fight');
// Then breaks the way his plugin test does, as the player.
const st = await ev(async () => {
  const ctx = window.__game.game.ctx;
  const S = () => ctx.bosses.state('gaffer-grimtooth');
  const hit = (amount, poise) => ctx.damage.apply({ attackerId: ctx.player.actor.id, targetId: S().actorId, amount, poise, kind: 'melee' });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  hit(1, 1e4); await sleep(3500);
  hit(S().health - S().maxHealth * 0.6, 1e4); await sleep(3500);
  return { p2: S().phase };
});
log('phase 2', JSON.stringify(st));
const stand = async (d, ang) => ev(async ([d, ang]) => {
  const ctx = window.__game.game.ctx;
  const b = ctx.actors.get(ctx.bosses.state('gaffer-grimtooth').actorId);
  const at = b.root.position;
  const x = at.x + Math.sin(ang) * d, z = at.z + Math.cos(ang) * d;
  ctx.player.teleport({ x, y: at.y + 0.1, z }, Math.atan2(x - at.x, z - at.z));
}, [d, ang]);
// The phase 3 crossing that breaks him: the window opens.
await ev(() => { const ctx = window.__game.game.ctx; const S = ctx.bosses.state('gaffer-grimtooth'); ctx.damage.apply({ attackerId: ctx.player.actor.id, targetId: S.actorId, amount: S.health - S.maxHealth * 0.3, poise: 1e4, kind: 'melee' }); });
const opened = Date.now();
log('window', JSON.stringify(await bossState()));
await shot('5-window');
if (branch === 'released') {
  let mf = null;
  search: for (const d of [2.2, 1.6, 2.8]) for (const ang of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    await stand(d, ang);
    await wait(250);
    mf = await ev(() => window.__game.game.ctx.interaction.focusFor('mercy')?.id ?? null);
    if (mf) break search;
  }
  log('mercy focus', mf, 'after', Date.now() - opened, 'ms of the window');
  log('bread', await ev(() => window.__game.game.ctx.services.get('inventory').count('hearth-bread')));
  await page.keyboard.down('KeyT'); await wait(2000); await page.keyboard.up('KeyT');
} else {
  await ev(() => { const ctx = window.__game.game.ctx; ctx.damage.apply({ attackerId: ctx.player.actor.id, targetId: ctx.bosses.state('gaffer-grimtooth').actorId, amount: 1e6, poise: 0, kind: 'melee' }); });
}
await wait(4000);
await ev(() => clearInterval(window.__mv));
log('outcome', await ev(() => window.__game.game.ctx.state.getFlag('boss.gaffer-grimtooth.outcome')), JSON.stringify(await q()));
await shot('6-after');

// 5. Out and hand in.
await ev(() => window.__game.game.ctx.services.get('interiors').exit());
await page.waitForFunction(() => window.__game.game.ctx.services.get('interiors').current === null, null, { timeout: 30000 });
await wait(1500);
log('rook focus', await faceNpc('rook'));
await page.keyboard.press('KeyF'); await wait(800);
await talkThrough('1');
log('after hand-in', JSON.stringify(await q()), 'gate', await ev(() => window.__game.game.ctx.state.getFlag('story.gate.a2')));
await wait(1500);
const card = () => ev(() => { const e = document.querySelector('[class*=ending]'); return e ? { shown: !!e.offsetParent, text: e.textContent.slice(0, 160) } : null; });
log('card', JSON.stringify(await card()));
await shot('7-card');
await wait(1200);
await page.keyboard.press('Space'); await wait(1500);
log('card after key', JSON.stringify(await card()), 'dialogue', await dlg());
await shot('8-camp');
await talkThrough('1');
log('campSeen', await ev(() => window.__game.game.ctx.state.getFlag('story.d02.campSeen')));
const wc = await ev(() => window.__game.game.ctx.services.get('harrowmark').worldChange());
log('worldChange', JSON.stringify(wc));
await shot('9-end');
const L = await ev(() => window.__log);
const counts = {}; for (const e of L) counts[e.t] = (counts[e.t] ?? 0) + 1;
log('event counts', JSON.stringify(counts));
for (const e of L.filter((e) => /boss|act|actEnding|mercy|status|player.hit/.test(e.t))) console.log('  ', e.at, e.t, JSON.stringify(e.p).slice(0, 200));
log('errors', errors.length); for (const e of errors.slice(0, 20)) console.log('   ', e.slice(0, 300));
const ok = !errors.length && (await ev(() => window.__game.game.ctx.state.getFlag('story.d02.campSeen'))) === true;
await browser.close();
process.exit(ok ? 0 : 1);
