// N3: a manual save taken while Cael stands in lava, through every real plugin and the real save plugin (fake IndexedDB).
// The save must finish (no hang while the throw to a lip runs), store the lip rather than the lava, and load onto the lip.
// The save is also taken during the throw itself (the safe teleport's fade), when it is deferred and written once safe.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootFromSave, type ChapterHarness } from '../../integration/chapterHarness';
import { ACT1_FIXTURES, readAct1Fixture } from '../../save/__fixtures__/act1';
import { heightAt } from '../../terrain/heightfield';

const hs: ChapterHarness[] = [];
beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => {
  for (const h of hs.splice(0)) h.dispose();
  vi.restoreAllMocks();
});

async function withPool() {
  const h = await bootFromSave(await readAct1Fixture(ACT1_FIXTURES.m07ClassChosen), { models: false });
  hs.push(h);
  expect(h.loaded).toBe(true);
  const f = h.ctx.player.feet;
  const x = f.x + 40;
  const z = f.z;
  await h.teleport({ x: x + 6, z }, 30);
  const g = (px: number, pz: number) => heightAt(px, pz);
  const lips = [
    { x: x + 6, y: g(x + 6, z) + 0.05, z },
    { x: x - 6, y: g(x - 6, z) + 0.05, z },
  ];
  h.ctx.services.require('lava').add({ id: 'test.save.pool', shape: { kind: 'box', x0: x - 3, z0: z - 10, x1: x + 3, z1: z + 10 }, surfaceY: g(x, z) + 0.6, damagePctPerS: 15, safeLips: lips });
  return { h, x, z, lips };
}

async function settle<T>(h: ChapterHarness, p: Promise<T>): Promise<T | 'hung'> {
  let out: T | 'hung' = 'hung';
  void p.then((v) => (out = v));
  for (let i = 0; i < 40 && out === 'hung'; i++) await h.runAsync(15);
  return out;
}

describe('a save taken in lava', () => {
  it('finishes, stores the lip, and loads onto the lip', async () => {
    const { h, x, z, lips } = await withPool();
    const save = h.ctx.services.require('save');
    let outcome: Promise<{ ok: boolean; reason?: string }> | null = null;
    const off = h.ctx.events.on('lava.entered', () => {
      outcome = save.saveNow('manual');
    });
    h.ctx.player.teleport({ x: x + 1, y: heightAt(x + 1, z) + 0.05, z });
    for (let i = 0; i < 6 && !outcome; i++) h.run(1);
    off?.();
    expect(outcome).not.toBeNull();
    const r = await settle(h, outcome!);
    expect(r).toEqual(expect.objectContaining({ ok: true }));
    const stored = h.fake.peek('slot-0');
    const h2 = await bootFromSave(stored, { models: false });
    hs.push(h2);
    expect(h2.loaded).toBe(true);
    const feet = h2.ctx.player.feet;
    expect(Math.hypot(feet.x - lips[0]!.x, feet.z - lips[0]!.z)).toBeLessThan(0.6);
  }, 240_000);

  it('during the throw it is deferred, then written once the throw lands, at the lip', async () => {
    const { h, x, z, lips } = await withPool();
    const save = h.ctx.services.require('save');
    h.ctx.player.teleport({ x: x + 1, y: heightAt(x + 1, z) + 0.05, z });
    let thrownSave: Promise<{ ok: boolean; reason?: string }> | null = null;
    // the throw starts at 0.4 s; ask for the save in the fade
    for (let i = 0; i < 60 && !thrownSave; i++) {
      h.run(1);
      if (h.ctx.services.get('waystones')?.travelling) thrownSave = save.saveNow('manual');
    }
    expect(thrownSave).not.toBeNull();
    const r = await settle(h, thrownSave!);
    expect(r).toEqual(expect.objectContaining({ ok: false, reason: 'deferred' }));
    await h.runAsync(300);
    const feet = h.ctx.player.feet;
    expect(Math.hypot(feet.x - lips[0]!.x, feet.z - lips[0]!.z)).toBeLessThan(0.6);
    const stored = h.fake.peek('slot-0') as { savedAt?: number } | undefined;
    const h2 = await bootFromSave(stored, { models: false });
    hs.push(h2);
    const f2 = h2.ctx.player.feet;
    expect(Math.hypot(f2.x - lips[0]!.x, f2.z - lips[0]!.z)).toBeLessThan(0.6);
  }, 240_000);
});
