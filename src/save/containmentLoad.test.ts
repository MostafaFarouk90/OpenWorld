/**
 * v0.6 containment across a load (all real plugins): a Phase C save inside Cinderreach continues where it was saved,
 * with no push-back and no containment toast; the same position in an Act 1 save (no `story.gate.a2`) lands clamped
 * at Harrowmark's east edge, never in Cinderreach.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootFromSave, type ChapterHarness } from '../integration/chapterHarness';
import { heightAt } from '../terrain/heightfield';
import { CONTAINMENT_TOAST_KEY } from '../region/containmentSystem';
import { ACT1_FIXTURES, readAct1Fixture, type Act1Fixture } from './__fixtures__/act1';

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

// Engine (18000, 2500): Cinderreach (engine x 15500..22500, z -500..5500).
const AT = { x: 18000, z: 2500 };

async function loadAt(fixture: Act1Fixture, mutate?: (flags: Record<string, unknown>) => void) {
  const f = await readAct1Fixture(fixture);
  const entries = f.entries as Record<string, { data: Record<string, unknown> }>;
  entries['player-position'].data = { x: AT.x, y: heightAt(AT.x, AT.z) + 0.05, z: AT.z, yaw: 0 };
  mutate?.(entries['world-state'].data.flags as Record<string, unknown>);
  h = await bootFromSave(f, { models: false, virtualClock: true });
  expect(h.loaded).toBe(true);
}

const toasts = () => h!.of('hud.toast').filter((e) => (e as { textKey?: string }).textKey === CONTAINMENT_TOAST_KEY);

describe('containment across a load', () => {
  it('Phase C save inside Cinderreach: stays there, no push-back, no toast', async () => {
    await loadAt(ACT1_FIXTURES.complete);
    expect(h!.ctx.state.getFlag('story.gate.a2')).toBe(true);
    const c = h!.ctx.services.require('containment');
    expect(c.openRegions()).toContain('cinderreach');
    h!.run(120);
    const f = h!.ctx.player.feet;
    expect(Math.hypot(f.x - AT.x, f.z - AT.z)).toBeLessThan(1);
    expect(toasts()).toEqual([]);
  }, 60_000);

  it('the same spot in a save before the act ended: lands clamped into the open area', async () => {
    // M10 done, D02 not started: the act has not ended (the complete fixture would re-derive the gate on load).
    await loadAt(ACT1_FIXTURES.m10Ashmare);
    expect(h!.ctx.state.getFlag('story.gate.a2')).toBeUndefined();
    h!.run(120);
    const f = h!.ctx.player.feet;
    const c = h!.ctx.services.require('containment');
    expect(c.openRegions()).not.toContain('cinderreach');
    expect(c.isOpen(f.x, f.z)).toBe(true);
    // Harrowmark's east edge is engine x 10500; the clamp lands just inside it.
    expect(f.x).toBeLessThan(10500);
    expect(f.x).toBeGreaterThan(10400);
  }, 60_000);
});
