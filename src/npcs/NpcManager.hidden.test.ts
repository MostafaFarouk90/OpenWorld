// A5 (Act 2, additive): `npcs.setHidden` hides an NPC's figure and turns its talk off while a stand-in plays it
// (Gaut on the escort horse, Hrolf in his trial); not saved, and its owner shows it again when it ends.
import { describe, expect, it, vi } from 'vitest';
import { BRIGHTWATER_LAYOUT } from '../region/brightwater.layout';
import { createFakeCore } from '../region/testing/fakeCore';
import { NPC_DEFS } from './npcDefs';
import { NpcManager } from './NpcManager';
import { fakeLoader } from './npcTestKit';
import { NPC_STRINGS_EN } from './strings.en';

function setup(loader?: ReturnType<typeof fakeLoader>) {
  const fc = createFakeCore();
  fc.ctx.strings.register('en', NPC_STRINGS_EN);
  for (const a of BRIGHTWATER_LAYOUT.anchors) {
    if (a.tags?.includes('npc-post') || a.id === 'ford.carters.walk-off') fc.ctx.anchors.define({ id: a.id, position: { x: a.x, y: 2, z: a.z }, yaw: 0 });
  }
  const m = new NpcManager(fc.ctx, { layoutNpcs: BRIGHTWATER_LAYOUT.npcs, defs: NPC_DEFS, playerPosition: () => null, warn: vi.fn(), loader });
  m.spawnAll();
  const talk = () => fc.interactables.get('npc:gaut') as { enabled?: () => boolean } | undefined;
  return { fc, m, talk };
}

describe('NpcManager.setHidden (A5)', () => {
  it('hides the figure and the talk prompt, and shows them again', () => {
    const { m, talk } = setup();
    const h = m.get('gaut')!;
    const figure = h.root.children[0];
    expect(m.setHidden('gaut', true)).toBe(true);
    expect(figure.visible).toBe(false);
    expect(talk()!.enabled!()).toBe(false);
    // The root stays as the interiors' occupant hider left it.
    expect(h.root.visible).toBe(true);
    expect(m.setHidden('gaut', false)).toBe(true);
    expect(figure.visible).toBe(true);
    expect(talk()!.enabled!()).toBe(true);
  });

  it('false for an id not registered yet, which then spawns hidden when it registers', () => {
    const fc = createFakeCore();
    fc.ctx.strings.register('en', NPC_STRINGS_EN);
    const spec = BRIGHTWATER_LAYOUT.npcs.find((n) => n.id === 'gaut')!;
    for (const a of BRIGHTWATER_LAYOUT.anchors) if (a.id === spec.post) fc.ctx.anchors.define({ id: a.id, position: { x: a.x, y: 2, z: a.z }, yaw: 0 });
    const m = new NpcManager(fc.ctx, { layoutNpcs: [], defs: [], playerPosition: () => null, warn: vi.fn() });
    m.spawnAll();
    expect(m.setHidden('gaut', true)).toBe(false);
    m.register([spec], [NPC_DEFS.find((d) => d.id === 'gaut')!]);
    expect(m.get('gaut')!.root.children[0].visible).toBe(false);
    expect(m.setHidden('gaut', false)).toBe(true);
    expect(m.get('gaut')!.root.children[0].visible).toBe(true);
  });

  it('a hide survives save.loaded (the escort or trial that set it ends it)', () => {
    const { fc, m } = setup();
    m.setHidden('gaut', true);
    fc.ctx.events.emit('save.loaded', { slot: 's' });
    expect(m.get('gaut')!.root.children[0].visible).toBe(false);
  });

  it('stays hidden across the GLB swap', async () => {
    const loader = fakeLoader();
    const { m } = setup(loader);
    m.setHidden('gaut', true);
    // Loads by proximity: drive the model in with the player beside him.
    const pos = m.position('gaut')!;
    (m as unknown as { loadNear(p: { x: number; z: number }): void }).loadNear({ x: pos.x, z: pos.z });
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    const h = m.get('gaut')!;
    expect(h.hasModel).toBe(true);
    expect(h.root.children.every((c) => !c.visible)).toBe(true);
  });
});
