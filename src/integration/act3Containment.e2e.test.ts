/**
 * Containment under the Act 3 flag states, read from the committed `?act3=` fixtures on the real save plugin (K16, Phase
 * E, and Phase F since K16 PR 2 retired the Dragonspine hold): the Greyfen, the Fen Road, the Dragonspine and the Spine
 * Road open on `story.gate.a3` (a Phase E save carries over); the summit hole shut until its condition;
 * the later acts' land never open. A player pushed back while gliding lands in the open area. The grid sweep per flag
 * state is region/containment.test.ts.
 */
import { Vector3 } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootFromSave, type ChapterHarness } from './chapterHarness';
import { readAct3Fixture } from '../save/__fixtures__/act3';
import { FEN_ROAD_POINTS, SPINE_ROAD_POINTS } from '../region/act3Containment';
import { fogOpenById } from '../region/fogWall';
import { ACT3_ARRIVAL, act3JumpWaystones, blockOf, type Act3Order } from '../quests/act3Jump';

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

// Engine coordinates: Reedgate, Wyrmwatch Lodge, the Wyrm's Hearth (inside the summit hole), the Caldera, the Ashen Waste.
const REEDGATE = ACT3_ARRIVAL.greyfen;
const LODGE = ACT3_ARRIVAL.spine;
const HEARTH = { x: 13600, z: 15600 };
const CALDERA = { x: 12000, z: 9000 };
const WASTE = { x: 9000, z: 7000 };
const mid = (pts: readonly (readonly [number, number])[]) => {
  const [x, z] = pts[Math.floor(pts.length / 2)];
  return { x, z };
};

async function boot(order: Act3Order, id: string) {
  h = await bootFromSave(await readAct3Fixture(order, id), { models: false, virtualClock: true });
  expect(h.loaded, `act3-${order}-${id} loaded`).toBe(true);
  expect(h.statuses.filter((s) => s.state !== 'ok')).toEqual([]);
  const persist = warn.mock.calls.map((c: unknown[]) => String(c[0])).filter((m: string) => m.startsWith('Persist:'));
  expect(persist, 'every saved key accepted').toEqual([]);
  return { h, c: h.ctx.services.require('containment'), s: h.ctx.state };
}

describe('Act 3 containment on the fixtures (Phase F: the Dragonspine hold retired)', () => {
  // A Phase E save (the Greyfen block, D05 included, written before the hold was retired) carries into Phase F: the
  // Dragonspine, the Spine Road and the lodge open, M28 is offered, the summit hole stays shut, no later land opens.
  for (const id of ['m23', 'd05'] as const) {
    it(`greyfen ${id} (a Phase E save): the Greyfen, the Fen Road, the Dragonspine and the Spine Road open; the summit held; M28 offered`, async () => {
      const { c, s } = await boot('greyfen', id);
      expect(c.openRegions()).toEqual(['brightwater', 'harrowmark', 'cinderreach', 'oldsmoke', 'greyfen', 'dragonspine']);
      expect(c.isOpen(REEDGATE.x, REEDGATE.z)).toBe(true);
      for (const [x, z] of FEN_ROAD_POINTS) expect(c.isOpen(x, z), `fen road (${x}, ${z})`).toBe(true);
      for (const [x, z] of SPINE_ROAD_POINTS) expect(c.isOpen(x, z), `spine road (${x}, ${z})`).toBe(true);
      expect(c.isOpen(LODGE.x, LODGE.z)).toBe(true);
      expect(c.isOpen(HEARTH.x, HEARTH.z)).toBe(false);
      expect(c.isOpen(CALDERA.x, CALDERA.z)).toBe(false);
      expect(c.isOpen(WASTE.x, WASTE.z)).toBe(false);
      for (const f of ['fog.greyfen', 'fog.dragonspine', 'fog.spine-road']) expect(fogOpenById(f, s), f).toBe(true);
      expect(fogOpenById('fog.summit', s)).toBe(false);
      expect(s.getFlag('story.phase.dragonspineOpen')).toBeUndefined();
      const quests = h!.ctx.services.require('quests');
      expect(quests.state('m28')).toBe('inactive');
      expect(quests.start('m28'), 'M28 is offered on the Act 3 gate alone').toBe(true);
    }, 60_000);
  }

  it('an old save still carrying the retired story.phase.dragonspineOpen loads silently, with the Dragonspine open', async () => {
    const save = JSON.parse(JSON.stringify(await readAct3Fixture('greyfen', 'd05'))) as { entries: Record<string, { data: { flags: Record<string, unknown> } }> };
    save.entries['world-state'].data.flags['story.phase.dragonspineOpen'] = true;
    h = await bootFromSave(save, { models: false, virtualClock: true });
    expect(h.loaded).toBe(true);
    expect(h.statuses.filter((x) => x.state !== 'ok')).toEqual([]);
    const said = warn.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(said.filter((m: string) => /dragonspineOpen|Persist:/.test(m))).toEqual([]);
    const c = h.ctx.services.require('containment');
    expect(c.openRegions()).toContain('dragonspine');
    expect(c.isOpen(LODGE.x, LODGE.z)).toBe(true);
    expect(c.isOpen(HEARTH.x, HEARTH.z)).toBe(false);
  }, 60_000);

  it('greyfen m28: the Dragonspine and the Spine Road open, the summit hole still shut', async () => {
    const { c, s } = await boot('greyfen', 'm28');
    expect(c.openRegions()).toContain('dragonspine');
    expect(c.isOpen(LODGE.x, LODGE.z)).toBe(true);
    const spine = mid(SPINE_ROAD_POINTS);
    expect(c.isOpen(spine.x, spine.z)).toBe(true);
    expect(c.isOpen(HEARTH.x, HEARTH.z)).toBe(false);
    expect(fogOpenById('fog.summit', s)).toBe(false);
  }, 60_000);

  it('greyfen m31: the summit opens on M23 to M30, D05 and R16', async () => {
    const { c, s } = await boot('greyfen', 'm31');
    expect(c.isOpen(HEARTH.x, HEARTH.z)).toBe(true);
    expect(fogOpenById('fog.summit', s)).toBe(true);
    expect(c.isOpen(CALDERA.x, CALDERA.z)).toBe(false);
  }, 60_000);

  // The containment grid with a glider: the summit hole is the shut land a Phase F player can glide at.
  it('a player gliding into the shut summit is pushed back into the open area, once, with containment.pushed', async () => {
    const { c } = await boot('greyfen', 'm28');
    const mm = h!.ctx.services.require('movementMode');
    mm.set('glide', { position: { x: LODGE.x, y: 400, z: LODGE.z }, yaw: 0 });
    const pushed = h!.of('containment.pushed').length;
    h!.ctx.player.teleport({ x: HEARTH.x, y: 900, z: HEARTH.z });
    await h!.runAsync(5);
    const feet = h!.ctx.player.feet;
    expect(c.isOpen(feet.x, feet.z), JSON.stringify(feet)).toBe(true);
    const events = h!.of('containment.pushed').slice(pushed);
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(Math.hypot(events[0].from.x - HEARTH.x, events[0].from.z - HEARTH.z)).toBeLessThan(1);
  }, 60_000);

  // November fix: a jump into the Dragonspine lit no Dragonspine stone, so the first death respawned the player about 7 km away.
  it.each([['greyfen', 'm28'], ['greyfen', 'm31'], ['spine', 'm29'], ['greyfen', 'm25']] as const)(
    '%s %s: a death respawns the player at the block\'s arrival stone, and the stones they have are lit for travel',
    async (order, id) => {
      await boot(order, id);
      const ws = h!.ctx.services.require('waystones');
      const arrival = blockOf(id) === 'greyfen' ? REEDGATE : LODGE;
      expect(ws.respawnPoint().waystoneId).toBe(blockOf(id) === 'greyfen' ? 'reedgate' : 'wyrmwatch-lodge');
      // Away from the stone (as after a walk up the road), then the respawn.
      await h!.teleport({ x: arrival.x + 40, z: arrival.z + 40 }, 4);
      let done = false;
      void ws.respawnPlayer().then(() => (done = true));
      for (let i = 0; i < 40 && !done; i++) await h!.runAsync(15);
      expect(done, 'the respawn finished').toBe(true);
      const f = h!.ctx.player.feet;
      expect(Math.hypot(f.x - arrival.x, f.z - arrival.z), JSON.stringify(f)).toBeLessThan(25);
      for (const w of act3JumpWaystones(id, order).filter((x) => h!.ctx.anchors.find(`waystone.${x}`))) expect(ws.isLit(w), w).toBe(true);
    },
    90_000,
  );
});

// K13 report (2026-11-03): after the replay's harmless "rank refused" (rank 1 already held) and "Hearth Rite refused
// (no-scars)" warnings, the era party must still be seated on the live service, beside the arriving player.
describe('the era kit on a loaded Dragonspine fixture', () => {
  it.each([['spine', 'm28'], ['greyfen', 'm28'], ['greyfen', 'm31']] as const)('%s %s: Aelfreda and Hrolf are the party, joined, beside the player', async (order, id) => {
    const { h } = await boot(order, id);
    await h.runAsync(30);
    const comp = h.ctx.services.require('companions');
    expect(comp.maxActive()).toBe(2);
    expect([...comp.active()].sort()).toEqual(['aelfreda', 'hrolf']);
    for (const c of ['aelfreda', 'hrolf']) {
      expect(comp.isActive(c), c).toBe(true);
      expect(comp.rank(c), c).toBeGreaterThanOrEqual(1);
      const actor = comp.actorId(c);
      const a = actor ? h.ctx.actors.get(actor) : undefined;
      expect(a, `${c} has an actor`).toBeDefined();
      const pos = a!.worldPosition(new Vector3(Number.NaN, 0, Number.NaN));
      const feet = h.ctx.player.feet;
      expect(Math.hypot(pos.x - feet.x, pos.z - feet.z), `${c} beside the player`).toBeLessThan(25);
    }
    expect(h.ctx.services.require('inventory').equipped('armour')).toBe('ashplate');
  }, 60_000);
});
