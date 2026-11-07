/**
 * The occupation lifts on `world.afterEnding` and re-derives on load (Act 5 N13, plans/act5-N13.md section 3, the brief's
 * named test), on a booted game with every real plugin from Act 4's committed M46 fixture (the city held since M38), as
 * the Act 4 containment e2e test does. One boot loads the held save, then the after-ending save over it, then the held save
 * again (each a real load through the save plugin), and checks every piece of the city both ways.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootFromSave, type ChapterHarness } from '../integration/chapterHarness';
import { fogOpenById } from '../region/fogWall';
import { WORKING_GATES } from '../harrowmark/act4/sites';
import { stoneIsDark } from '../harrowmark/noStrand';
import { vendorAnchor } from '../economy/stock';
import { trainerPlacement, DEFAULT_KITS } from '../classes/kits';
import { strandedSave } from './testing';
import { afterEndingParts } from './afterEnding.plugin';

const TIMEOUT = 600_000;
let h: (ChapterHarness & { loaded: boolean }) | null = null;
beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  h?.dispose();
  h = null;
  vi.restoreAllMocks();
});

const TOWNSFOLK = ['aldith', 'whitlock', 'wace', 'stallholder-1', 'guild-doorman', 'sexton', 'sergeant', 'crabbe'];

/** Loads `file` over the running game through the save plugin's in-memory load (`loadFile`, as the `?act3=` fixtures load: a real `save.loaded`). */
async function loadOver(file: unknown): Promise<void> {
  let done: boolean | null = null;
  void h!.ctx.services.require('save').loadFile!(JSON.parse(JSON.stringify(file))).then((v) => (done = v));
  for (let i = 0; i < 40 && done === null; i++) await h!.runAsync(15);
  await h!.runAsync(30);
  expect(done, 'the load went through').toBe(true);
}

function city() {
  const c = h!.ctx;
  const npc = (id: string) => [...c.actors.all()].some((a) => a.kind === `npc:${id}`);
  const stone = c.anchors.find('waystone.harrowmark-gate');
  return {
    faces: WORKING_GATES.map((g) => fogOpenById(`fog.harrowmark.gate.${g}`, c.state)),
    townsfolk: TOWNSFOLK.filter(npc),
    stoneDark: stoneIsDark('harrowmark-gate', stone?.position, c.state),
    ash: !!c.scene.getObjectByName('harrowmark-ash-state')?.parent,
    fountain: !!c.scene.getObjectByName('harrowmark-world-change-a3')?.parent,
    closedStalls: !!c.scene.getObjectByName('harrowmark-closed-stalls')?.parent,
    wystan: vendorAnchor('wystan', c.state),
    knight: trainerPlacement(DEFAULT_KITS.knight, c.state).deskAnchor,
    tint: c.services.get('worldTint')?.current ?? null,
  };
}

describe('the occupation lifts on world.afterEnding (N13)', () => {
  it('held, then lifted after the ending, then held again: every piece re-derives on each load', async () => {
    const held = await strandedSave(false, 'rekindle', []);
    const after = await strandedSave(true, 'let-it-die', []);
    h = await bootFromSave(held, { models: true, virtualClock: true });
    expect(h.loaded).toBe(true);
    expect(h.statuses.filter((s) => s.state !== 'ok').map((s) => s.id)).toEqual([]);
    const heldState = {
      faces: WORKING_GATES.map(() => false),
      townsfolk: [],
      stoneDark: true,
      ash: true,
      fountain: false,
      closedStalls: true,
      wystan: 'ashgate.refuge.shop.wystan',
      knight: 'ashgate.refuge.trainer.rook',
      tint: null,
    };
    expect(city()).toEqual(heldState);

    await loadOver(after);
    expect(city()).toEqual({
      faces: WORKING_GATES.map(() => true),
      townsfolk: TOWNSFOLK,
      stoneDark: false,
      ash: false,
      fountain: true,
      closedStalls: false,
      wystan: 'shop.wystan',
      knight: 'harrowmark.bastion.trainer.gaut',
      tint: 'let-it-die',
    });
    // the dragons fly under Let It Die (not actors: no actor kind names one)
    expect(afterEndingParts()?.look?.flights.length).toBe(3);
    expect([...h.ctx.actors.all()].some((a) => String(a.kind).includes('dragon-after'))).toBe(false);
    // a load never wakes: the player stays where the save put them
    expect(afterEndingParts()?.service.woken).toBe(false);

    await loadOver(held);
    expect(city()).toEqual(heldState);
    expect(afterEndingParts()?.look?.flights.length).toBe(0);
  }, TIMEOUT);

  it('wake() after the flags are set lands Cael at the Rim Camp fire', async () => {
    h = await bootFromSave(await strandedSave(true, 'rekindle', []), { models: false, virtualClock: true });
    expect(h.loaded).toBe(true);
    const svc = h.ctx.services.require('afterEnding');
    let done = false;
    void svc.wake().then(() => (done = true));
    for (let i = 0; i < 60 && !done; i++) await h.runAsync(15);
    expect(done).toBe(true);
    const f = h.ctx.player.feet;
    const { WAKE_POINT } = await import('./wake');
    expect(Math.hypot(f.x - WAKE_POINT.x, f.z - WAKE_POINT.z)).toBeLessThan(2);
    expect(svc.lines).toEqual(['afterEnding.wake.rekindle']);
    expect(h.ctx.services.get('worldTint')?.current).toBe('rekindle');
  }, TIMEOUT);
});
