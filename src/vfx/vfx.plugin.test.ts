import { describe, expect, it, vi } from 'vitest';
import plugin from './vfx.plugin';
import { fakeContext } from './testContext';
import type { VfxService } from './types';

const damage = (over = {}) =>
  ({ attackerId: 'player', targetId: 'd', amount: 5, poise: 5, kind: 'melee', outcome: 'hit', dealt: 5, poiseDealt: 5, healthAfter: 95, killed: false, saved: false, staggered: false, point: { x: 0, y: 1, z: 0 }, ...over }) as never;

describe('vfx plugin', () => {
  it('provides the vfx service and the systems', () => {
    const t = fakeContext();
    plugin.setup(t.ctx);
    expect(t.services.get('vfx')).toBeDefined();
    expect(t.systems.map((s) => s.id).sort()).toEqual(['vfx-camera', 'vfx-restore', 'vfx-trails', 'vfx-update']);
    plugin.dispose();
  });

  it('applies hit-stop from damage.dealt', () => {
    const t = fakeContext();
    plugin.setup(t.ctx);
    t.ctx.events.emit('damage.dealt', damage());
    expect(t.clock.hitStop).toHaveBeenCalledWith(0.05);
    plugin.dispose();
  });

  it('restores then reapplies camera fx around the camera update, and ages shake with frame time', () => {
    const t = fakeContext();
    plugin.setup(t.ctx);
    const vfx = t.services.get('vfx') as VfxService;
    vfx.shake(0.1, 0.1);
    const byId = Object.fromEntries(t.systems.map((s) => [s.id, s]));
    const base = t.camera.position.clone();
    for (let i = 0; i < 20; i++) {
      byId['vfx-restore'].render!(1, 1 / 60, t.ctx);
      byId['vfx-update'].render!(1, 1 / 60, t.ctx);
      byId['vfx-camera'].render!(1, 1 / 60, t.ctx);
    }
    byId['vfx-restore'].render!(1, 1 / 60, t.ctx);
    expect(t.camera.position.distanceTo(base)).toBeLessThan(1e-6);
    plugin.dispose();
  });

  it('keeps shake running through hit-stop but freezes it when paused', () => {
    const t = fakeContext();
    plugin.setup(t.ctx);
    const vfx = t.services.get('vfx') as VfxService;
    vfx.shake(0.1, 0.05);
    const byId = Object.fromEntries(t.systems.map((s) => [s.id, s]));
    t.clock.frozen = true;
    t.clock.hitStopRemaining = 0.05; // hit-stop
    for (let i = 0; i < 6; i++) {
      byId['vfx-update'].render!(1, 1 / 60, t.ctx);
      byId['vfx-camera'].render!(1, 1 / 60, t.ctx);
    }
    expect((vfx as unknown as { camera: { active: boolean } }).camera.active).toBe(false);
    vfx.shake(0.1, 0.05);
    t.clock.hitStopRemaining = 0; // pause
    for (let i = 0; i < 6; i++) {
      byId['vfx-update'].render!(1, 1 / 60, t.ctx);
      byId['vfx-camera'].render!(1, 1 / 60, t.ctx);
    }
    expect((vfx as unknown as { camera: { active: boolean } }).camera.active).toBe(true);
    plugin.dispose();
  });

  it('survives events for unknown actors and a missing camera', () => {
    const t = fakeContext({ camera: null } as never);
    plugin.setup(t.ctx);
    t.ctx.events.emit('telegraph', { actorId: 'ghost', kind: 'block', attackId: 'x', leadSeconds: 0.5 });
    t.ctx.events.emit('attack.window', { actorId: 'ghost', attackId: 'x', swingId: 1, phase: 'open' });
    t.ctx.events.emit('actor.despawned', { actorId: 'ghost' });
    const byId = Object.fromEntries(t.systems.map((s) => [s.id, s]));
    byId['vfx-update'].render!(1, 0.016, t.ctx);
    byId['vfx-camera'].render!(1, 0.016, t.ctx);
    byId['vfx-trails'].fixedUpdate!(1 / 60, t.ctx);
    plugin.dispose();
  });

  it('rekindle spawns an effect unless it came from a save load; burn drives the vignette', () => {
    const t = fakeContext();
    plugin.setup(t.ctx);
    const vfx = t.services.get('vfx') as VfxService;
    const spawn = vi.spyOn(vfx, 'spawnEffect');
    t.ctx.events.emit('waystone.rekindled', { waystoneId: 'w', cause: 'load' });
    expect(spawn).not.toHaveBeenCalled();
    t.ctx.events.emit('waystone.rekindled', { waystoneId: 'w', cause: 'player' });
    expect(spawn).toHaveBeenCalledWith('waystone-rekindle', expect.anything());
    t.ctx.events.emit('burn.changed', { value: 80, previous: 55 });
    plugin.dispose();
  });

  it('dispose is idempotent', () => {
    const t = fakeContext();
    plugin.setup(t.ctx);
    plugin.dispose();
    plugin.dispose();
  });
});
