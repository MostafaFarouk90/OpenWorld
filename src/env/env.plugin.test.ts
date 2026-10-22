import { describe, expect, it } from 'vitest';
import { createFakeCore } from '../region/testing/fakeCore';
import { createEnvPlugin, envEnabled } from './env.plugin';

const tick = () => new Promise((r) => setTimeout(r, 50));

describe('env plugin', () => {
  it('does nothing without tiles', () => {
    const fc = createFakeCore();
    const plugin = createEnvPlugin({ tiles: {} });
    plugin.setup(fc.ctx);
    expect(fc.ctx.services.get('env')?.drawn('b1')).toBeNull();
    plugin.dispose?.();
  });

  it('builds a registered tile into the scene and reports it', async () => {
    const fc = createFakeCore();
    const plugin = createEnvPlugin({ tiles: { t: [{ id: 'oak-b', x: 1, z: 2 }, { id: 'barrel', x: 3, z: 4 }] }, heightAt: () => 0 });
    plugin.setup(fc.ctx);
    await tick();
    const env = fc.ctx.services.get('env')!;
    expect(env.drawn('t')).toMatchObject({ tree: 1, prop: 1 });
    expect(env.placeholders('t')).toBe(2);
    expect(fc.ctx.scene.children.some((c) => c.name === 'env.placements')).toBe(true);
    plugin.dispose?.();
    expect(fc.ctx.scene.children.some((c) => c.name === 'env.placements')).toBe(false);
  });

  it('is switched off by ?env=off', () => {
    expect(envEnabled('')).toBe(true);
    expect(envEnabled('?env=off')).toBe(false);
  });
});
