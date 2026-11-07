/**
 * Containment under the Act 4 flag states (L13 PR 1), read from the committed `?act4=` fixtures on the real save plugin:
 * the act start (M35), the city held from the betrayal (M39's fixture: `story.m38.complete`), the end of Phase G (M41 done,
 * M42 not yet accepted) and Phase H (L13 PR 2 retired the hold: accepting M42 opens the Waste). L0's grid sweep over the same states is
 * region/act4Containment.test.ts; this file walks the faces and the no-strand rule in a booted game.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootFromSave, type ChapterHarness } from './chapterHarness';
import { readAct4Fixture } from '../save/__fixtures__/act4';
import { ASH_ROAD_POINTS, ASHGATE_POINT, OCCUPIED_FLAG } from '../region/act4Containment';
import { fogOpenById } from '../region/fogWall';
import { ACT4_PLACES } from '../region/act4/act4Places';
import { gateFaceAnchor, WORKING_GATES } from '../harrowmark/act4/sites';
import { CITY_CENTRE, insideRingWall, M41_CAMP_ANCHOR, REFUGE_REST_ANCHOR } from '../harrowmark/noStrand';
import { heightAt } from '../terrain/heightfield';
import { WASTE_OPEN_FLAG } from '../quests/act4Jump';
import { REFUGE_STONE, servicesAfterM41, unreachable } from './act4Services';
import { vendorOpenByTable } from '../economy/stock';

let h: (ChapterHarness & { loaded: boolean }) | null = null;
let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  h?.dispose();
  h = null;
  vi.restoreAllMocks();
});

const WASTE = ACT4_PLACES['walker-camp'];
const KEEP_COURT = { x: CITY_CENTRE.x - 200, z: CITY_CENTRE.z + 450 };

/** A safe teleport ticked until it settles (the game only advances while the harness runs). */
async function safeTo(p: { x: number; z: number }) {
  const ws = h!.ctx.services.require('waystones');
  let done = false;
  void ws.safeTeleport({ x: p.x, y: heightAt(p.x, p.z) + 0.05, z: p.z }, 0).then(() => (done = true));
  for (let i = 0; i < 60 && !done; i++) await h!.runAsync(15);
  expect(done, 'the safe teleport settled').toBe(true);
  await h!.runAsync(10);
}

async function boot(id: string) {
  h = await bootFromSave(await readAct4Fixture(id), { models: false, virtualClock: true });
  expect(h.loaded, `act4-${id} loaded`).toBe(true);
  expect(h.statuses.filter((s) => s.state !== 'ok')).toEqual([]);
  const persist = warn.mock.calls.map((c: unknown[]) => String(c[0])).filter((m: string) => m.startsWith('Persist:'));
  expect(persist, 'every saved key accepted').toEqual([]);
  return { h, c: h.ctx.services.require('containment'), s: h.ctx.state };
}

/** Puts the player `inward` metres on the city side of a gate's face, lets the walls act, returns the feet. */
async function behindFace(gate: (typeof WORKING_GATES)[number], inward: number) {
  const a = h!.ctx.anchors.find(gateFaceAnchor(gate))!;
  const dx = a.position.x - CITY_CENTRE.x;
  const dz = a.position.z - CITY_CENTRE.z;
  const len = Math.hypot(dx, dz);
  const x = a.position.x - (dx / len) * inward;
  const z = a.position.z - (dz / len) * inward;
  h!.ctx.player.teleport({ x, y: heightAt(x, z) + 0.05, z }, 0);
  await h!.runAsync(20);
  const f = h!.ctx.player.feet;
  return { distOut: Math.hypot(f.x - CITY_CENTRE.x, f.z - CITY_CENTRE.z) - Math.hypot(x - CITY_CENTRE.x, z - CITY_CENTRE.z) };
}

describe('Act 4 containment on the fixtures', () => {
  it('act start (M35): Harrowmark open, the gates open, the Ash Road and the Waste shut', async () => {
    const { c, s } = await boot('m35');
    expect(s.getFlag('story.gate.a4')).toBe(true);
    expect(s.getBool(WASTE_OPEN_FLAG)).toBe(false);
    expect(c.isOpen(CITY_CENTRE.x, CITY_CENTRE.z)).toBe(true);
    expect(c.isOpen(ASHGATE_POINT.x, ASHGATE_POINT.z)).toBe(false);
    expect(c.isOpen(WASTE.x, WASTE.z)).toBe(false);
    for (const g of WORKING_GATES) expect(fogOpenById(`fog.harrowmark.gate.${g}`, s), g).toBe(true);
    expect(fogOpenById('fog.ashen-waste', s)).toBe(false);
    for (const g of WORKING_GATES) expect((await behindFace(g, 4)).distOut, `${g} lets the player through`).toBeLessThan(1);
  }, 120_000);

  it('the held city (M39\'s fixture): every working gate is shut from outside, the city stone is dark, nobody is stranded', async () => {
    const { s } = await boot('m39');
    expect(s.getFlag(OCCUPIED_FLAG)).toBe(true);
    for (const g of WORKING_GATES) expect(fogOpenById(`fog.harrowmark.gate.${g}`, s), g).toBe(false);
    // A player who reaches a shut gate's face from outside is pushed back out.
    for (const g of WORKING_GATES) expect((await behindFace(g, 3)).distOut, `${g} pushes out`).toBeGreaterThan(1);
    const ws = h!.ctx.services.require('waystones');
    expect(ws.isDark('harrowmark-gate')).toBe(true);
    ws.rekindle('harrowmark-gate');
    expect((await ws.travel('harrowmark-gate'))).toEqual({ ok: false, reason: 'dark' });
    // A safe teleport into the streets lands at the M41 camp (before M41).
    await safeTo(KEEP_COURT);
    const f = h!.ctx.player.feet;
    expect(insideRingWall(f.x, f.z), 'not inside the walls').toBe(false);
    const camp = h!.ctx.anchors.find(M41_CAMP_ANCHOR)!.position;
    expect(Math.hypot(f.x - camp.x, f.z - camp.z)).toBeLessThan(15);
  }, 120_000);

  it('Phase G end (M41 done, M42 not yet accepted): the Ash Road and Ashgate open, the Waste\'s edge shut', async () => {
    const { c, s } = await boot('m41');
    s.setFlag('story.m41.complete', true);
    await h!.runAsync(10);
    expect(s.getBool('story.m42.started')).toBe(false);
    for (const [x, z] of ASH_ROAD_POINTS) expect(c.isOpen(x, z), `ash road (${x}, ${z})`).toBe(true);
    expect(c.isOpen(ASHGATE_POINT.x, ASHGATE_POINT.z)).toBe(true);
    expect(c.isOpen(WASTE.x, WASTE.z)).toBe(false);
    expect(fogOpenById('fog.ashen-waste', s)).toBe(true);
    expect(fogOpenById('fog.waste-edge', s)).toBe(false);
    expect(fogOpenById('fog.waste-north', s)).toBe(false);
    // A stranded spot now resolves to the refuge.
    await safeTo(KEEP_COURT);
    const rest = h!.ctx.anchors.find(REFUGE_REST_ANCHOR)!.position;
    const f = h!.ctx.player.feet;
    expect(Math.hypot(f.x - rest.x, f.z - rest.z)).toBeLessThan(15);
  }, 120_000);

  it('Phase G end: waystone travel to the refuge stone and back out, both ways (coordinator ruling D)', async () => {
    const { s } = await boot('m41');
    s.setFlag('story.m38.complete', true);
    s.setFlag('story.m41.complete', true);
    await h!.runAsync(10);
    const ws = h!.ctx.services.require('waystones');
    expect(ws.ids()).toContain(REFUGE_STONE);
    expect(ws.rekindle(REFUGE_STONE).ok || ws.isLit(REFUGE_STONE)).toBe(true);
    expect(ws.isDark(REFUGE_STONE)).toBe(false);
    // Another lit stone outside the walls.
    const other = ws.litIds().find((id) => id !== REFUGE_STONE && !ws.isDark(id) && !insideRingWall(ws.position(id)!.x, ws.position(id)!.z))!;
    expect(other, 'a lit stone outside the walls').toBeTruthy();
    const go = async (to: string) => {
      let r: unknown = null;
      void ws.travel(to).then((v) => (r = v));
      for (let i = 0; i < 80 && r === null; i++) await h!.runAsync(15);
      expect(r, `travel to ${to}`).toEqual({ ok: true });
      await h!.runAsync(10);
      const at = ws.position(to)!;
      const f = h!.ctx.player.feet;
      expect(Math.hypot(f.x - at.x, f.z - at.z), `at ${to}`).toBeLessThan(12);
    };
    await go(REFUGE_STONE);
    await go(other);
    await go(REFUGE_STONE);
  }, 120_000);

  it('Phase G end: every service a player used inside the walls stands outside them (vendors, trainers, companions, the refuge stone)', async () => {
    const { s } = await boot('m41');
    s.setFlag('story.m38.complete', true);
    s.setFlag('story.m41.complete', true);
    await h!.runAsync(10);
    const ws = h!.ctx.services.require('waystones');
    ws.rekindle(REFUGE_STONE);
    const rows = servicesAfterM41({
      flags: s,
      anchor: (id) => h!.ctx.anchors.find(id)?.position,
      vendorOpen: (v) => vendorOpenByTable(v, s),
      stoneLit: (id) => ws.isLit(id),
      stoneDark: (id) => ws.isDark(id),
    });
    expect(rows.filter((r) => r.kind === 'vendor').length, 'Harrowmark vendors found').toBeGreaterThan(3);
    expect(rows.filter((r) => r.kind === 'trainer').length).toBeGreaterThan(3);
    expect(unreachable(rows)).toEqual([]);
  }, 120_000);

  it('Phase H (M42\'s fixture): accepting M42 opens the Waste (the hold is retired); the north band never opens', async () => {
    const { c, s } = await boot('m42');
    expect(s.getBool(WASTE_OPEN_FLAG)).toBe(false);
    expect(c.isOpen(WASTE.x, WASTE.z)).toBe(false);
    s.setFlag('story.m42.started', true);
    await h!.runAsync(10);
    expect(c.isOpen(WASTE.x, WASTE.z)).toBe(true);
    expect(fogOpenById('fog.waste-edge', s)).toBe(true);
    expect(fogOpenById('fog.waste-north', s)).toBe(false);
    expect(c.isOpen(12500, 10950)).toBe(false);
  }, 120_000);
});
