import { describe, expect, it } from 'vitest';
import { BRIGHTWATER_LAYOUT } from '../region/brightwater.layout';
import { createFakeCore } from '../region/testing/fakeCore';
import { fakeLoader } from './npcModels.test';
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
    fc.services.set('assets', { load: () => new Promise(() => {}), instantiate: () => { throw new Error('x'); }, animations: () => [] });
    expect(plugin.setup(fc.ctx)).toBeUndefined();
    expect((fc.services.get('npcs') as NpcsService).get('edda')!.hasModel).toBe(false);
    plugin.dispose!();
  });

  it('swaps models in when the assets service resolves', async () => {
    const fc = world();
    fc.services.set('assets', fakeLoader());
    plugin.setup(fc.ctx);
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

  it('cleans up when setup fails (missing post anchor)', () => {
    const fc = createFakeCore();
    expect(() => plugin.setup(fc.ctx)).toThrow(/post anchor/);
    expect(fc.actors.size).toBe(0);
    expect(fc.systems.size).toBe(0);
  });
});
