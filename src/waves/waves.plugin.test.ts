import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import devPlugin from './waves.dev.plugin';
import { makeKit, type Kit } from './testKit';

let physics: PhysicsWorld;
let kit: Kit;
beforeEach(async () => {
  physics = new PhysicsWorld();
  await physics.init();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  kit = await makeKit(physics);
});
afterEach(() => {
  kit.teardown();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('waves plugin', () => {
  it('provides the service, the persistable and the system', () => {
    expect(kit.ctx.services.get('waves')).toBeDefined();
    expect(kit.ctx.persist.get('waves')?.version).toBe(1);
    expect(kit.ctx.systems.has('waves.director')).toBe(true);
    expect(kit.ctx.strings.t('waves.structure.cart')).toBe('Brazier cart');
  });
});

describe('dev plugin', () => {
  const run = async (search: string) => {
    vi.stubGlobal('location', { search });
    const k = await makeKit(physics, { anchors: false });
    devPlugin.setup(k.ctx);
    return k;
  };

  it('does nothing without ?waves=', async () => {
    const k = await run('');
    k.run(10);
    expect(k.waves().current).toBeNull();
    k.teardown();
  });

  it('warns for an unknown set', async () => {
    const k = await run('?waves=nope');
    k.run(10);
    expect(k.waves().current).toBeNull();
    k.teardown();
  });

  it('starts the named set with stand-in anchors around the player', async () => {
    const k = await run('?waves=cinderford-raid');
    k.run(5);
    expect(k.waves().current).toEqual({ defId: 'cinderford-raid', index: 0 });
    expect(k.ctx.anchors.find('cinderreach.cinderford.lane.1')).toBeDefined();
    k.teardown();
  });
});
