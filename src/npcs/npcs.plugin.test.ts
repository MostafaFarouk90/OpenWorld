import { describe, expect, it, vi } from 'vitest';
import { BRIGHTWATER_LAYOUT } from '../region/brightwater.layout';
import { createFakeCore } from '../region/testing/fakeCore';
import { fakeLoader } from './npcTestKit';
import plugin from './npcs.plugin';
import type { NpcsService } from './types';

function world() {
  const fc = createFakeCore();
  for (const n of BRIGHTWATER_LAYOUT.npcs) {
    const a = BRIGHTWATER_LAYOUT.anchors.find((x) => x.id === n.post)!;
    fc.ctx.anchors.define({ id: a.id, position: { x: a.x, y: 0, z: a.z }, yaw: 0 });
  }
  return fc;
}

describe('npcs plugin', () => {
  it('declares its id and dependencies', () => {
    expect(plugin.id).toBe('npcs');
    expect(plugin.dependsOn).toEqual(['core', 'region']);
  });

  it('spawns placeholders synchronously, provides the service and registers systems', () => {
    const fc = world();
    expect(plugin.setup(fc.ctx)).toBeUndefined();
    expect(fc.actors.size).toBe(6);
    expect(fc.interactables.size).toBe(6);
    expect(fc.strings.get('npc.silent')).toBe('They have nothing to say yet.');
    const svc = fc.services.get('npcs') as NpcsService;
    expect(svc.get('gaut')).toBeDefined();
    expect(fc.systems.get('npcs-behaviour')).toMatchObject({ fixedPhase: 'intent', order: -50 });
    expect(fc.systems.get('npcs-anim')).toMatchObject({ fixedPhase: 'animation', order: 150 });
    expect(() => { fc.tick('intent'); fc.tick('animation'); }).not.toThrow();
    plugin.dispose!();
  });

  it('returns immediately with a loader that never resolves', () => {
    const fc = world();
    (fc.ctx as { assets: unknown }).assets = { load: () => new Promise(() => {}), instantiate: () => { throw new Error('x'); }, animations: () => [] };
    fc.playerFeet.x = 25; fc.playerFeet.z = 131;
    expect(plugin.setup(fc.ctx)).toBeUndefined();
    expect((fc.services.get('npcs') as NpcsService).get('edda')!.hasModel).toBe(false);
    plugin.dispose!();
  });

  it('swaps models in by proximity when ctx.assets is a loader (setup itself loads nothing)', async () => {
    const fc = world();
    const loader = fakeLoader();
    (fc.ctx as { assets: unknown }).assets = loader;
    fc.playerFeet.x = 25; fc.playerFeet.z = 131; // at edda
    plugin.setup(fc.ctx);
    expect(loader.loads.length).toBe(0);
    expect((fc.services.get('npcs') as NpcsService).get('edda')!.hasModel).toBe(false);
    fc.tick('intent');
    await new Promise((r) => setTimeout(r, 0));
    expect((fc.services.get('npcs') as NpcsService).get('edda')!.hasModel).toBe(true);
    plugin.dispose!();
  });

  it('dispose removes everything, is repeatable, and allows a fresh setup', () => {
    const fc = world();
    plugin.setup(fc.ctx);
    plugin.dispose!();
    plugin.dispose!();
    expect(fc.actors.size).toBe(0);
    expect(fc.interactables.size).toBe(0);
    expect(fc.scene.children.length).toBe(0);
    expect(fc.systems.size).toBe(0);
    expect(fc.services.has('npcs')).toBe(false);
  });

  it('ignores a services-registered assets loader (only ctx.assets counts)', async () => {
    const fc = world();
    fc.services.set('assets', fakeLoader());
    plugin.setup(fc.ctx);
    fc.tick('intent');
    await new Promise((r) => setTimeout(r, 0));
    expect((fc.services.get('npcs') as NpcsService).get('edda')!.hasModel).toBe(false);
    plugin.dispose!();
  });

  it('teardown still runs every remover and disposes the manager when one throws', () => {
    const fc = world();
    const add = fc.ctx.systems.add;
    fc.ctx.systems.add = (s) => {
      const off = add(s);
      return s.id === 'npcs-behaviour' ? () => { throw new Error('remover boom'); } : off;
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    plugin.setup(fc.ctx);
    expect(() => plugin.dispose!()).not.toThrow();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
    expect(fc.services.has('npcs')).toBe(false);
    expect(fc.systems.has('npcs-anim')).toBe(false);
    expect(fc.actors.size).toBe(0);
    expect(fc.interactables.size).toBe(0);
    expect(fc.scene.children.length).toBe(0);
  });

  it('cleans up when setup fails (missing post anchor)', () => {
    const fc = createFakeCore();
    expect(() => plugin.setup(fc.ctx)).toThrow(/post anchor/);
    expect(fc.actors.size).toBe(0);
    expect(fc.systems.size).toBe(0);
  });
});
