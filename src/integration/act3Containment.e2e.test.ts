/**
 * Containment under the Act 3 flag states, read from the committed `?act3=` fixtures on the real save plugin (K16, Phase
 * E): the Greyfen and the Fen Road open on `story.gate.a3`; the Dragonspine, the Spine Road and their faces held shut by
 * `story.phase.dragonspineOpen` through the whole Greyfen block, D05 included; the summit hole shut until its condition;
 * the later acts' land never open. A player pushed back while gliding lands in the open area. The grid sweep per flag
 * state is region/containment.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootFromSave, type ChapterHarness } from './chapterHarness';
import { readAct3Fixture } from '../save/__fixtures__/act3';
import { FEN_ROAD_POINTS, SPINE_ROAD_POINTS } from '../region/act3Containment';
import { fogOpenById } from '../region/fogWall';
import { ACT3_ARRIVAL, type Act3Order } from '../quests/act3Jump';

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

describe('Act 3 containment on the fixtures (Phase E)', () => {
  for (const id of ['m23', 'd05'] as const) {
    it(`greyfen ${id}: the Greyfen and the Fen Road open; the Dragonspine, the Spine Road and the summit held; no later land`, async () => {
      const { c, s } = await boot('greyfen', id);
      expect(c.openRegions()).toEqual(['brightwater', 'harrowmark', 'cinderreach', 'oldsmoke', 'greyfen']);
      expect(c.isOpen(REEDGATE.x, REEDGATE.z)).toBe(true);
      for (const [x, z] of FEN_ROAD_POINTS) expect(c.isOpen(x, z), `fen road (${x}, ${z})`).toBe(true);
      const spine = mid(SPINE_ROAD_POINTS);
      expect(c.isOpen(spine.x, spine.z), 'spine road').toBe(false);
      expect(c.isOpen(LODGE.x, LODGE.z)).toBe(false);
      expect(c.isOpen(HEARTH.x, HEARTH.z)).toBe(false);
      expect(c.isOpen(CALDERA.x, CALDERA.z)).toBe(false);
      expect(c.isOpen(WASTE.x, WASTE.z)).toBe(false);
      expect(fogOpenById('fog.greyfen', s)).toBe(true);
      for (const f of ['fog.dragonspine', 'fog.spine-road', 'fog.summit']) expect(fogOpenById(f, s), f).toBe(false);
      expect(s.getFlag('story.phase.dragonspineOpen')).toBeUndefined();
    }, 60_000);
  }

  it('greyfen d05: finishing D05 live leaves the Dragonspine held (Phase E ends at the peaks)', async () => {
    const { c, s } = await boot('greyfen', 'd05');
    s.setFlag('story.d05.complete', true);
    await h!.runAsync(5);
    expect(c.isOpen(LODGE.x, LODGE.z)).toBe(false);
    expect(fogOpenById('fog.dragonspine', s)).toBe(false);
  }, 60_000);

  it('greyfen m28 (the jump opened the hold): the Dragonspine and the Spine Road open, the summit hole still shut', async () => {
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

  it('a player gliding into the held Dragonspine is pushed back into the open area, once, with containment.pushed', async () => {
    const { c } = await boot('greyfen', 'd05');
    const mm = h!.ctx.services.get('movementMode');
    mm?.set('glide', { position: { x: REEDGATE.x, y: 10, z: REEDGATE.z }, yaw: 0 });
    const pushed = h!.of('containment.pushed').length;
    h!.ctx.player.teleport({ x: LODGE.x, y: 400, z: LODGE.z });
    await h!.runAsync(5);
    const feet = h!.ctx.player.feet;
    expect(c.isOpen(feet.x, feet.z), JSON.stringify(feet)).toBe(true);
    const events = h!.of('containment.pushed').slice(pushed);
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(Math.hypot(events[0].from.x - LODGE.x, events[0].from.z - LODGE.z)).toBeLessThan(1);
  }, 60_000);
});
