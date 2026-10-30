import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createFakeCore } from '../region/testing/fakeCore';
import { BRIGHTWATER_LAYOUT } from '../region/brightwater.layout';
import { NPC_DEFS } from './npcDefs';
import { NpcManager, type NpcManagerOptions } from './NpcManager';
import { wrapAngle } from './NpcBehavior';
import { fakeLoader } from './npcTestKit';
import { NPC_STRINGS_EN } from './strings.en';
import type { NpcModelLoader } from './types';

const POSTS: Record<string, [number, number, number, number]> = {};
const postYaw = (id: string) => wrapAngle(POSTS[id][3]);
function setup(over: Partial<NpcManagerOptions> = {}, player: { x: number; z: number } | null = { x: 0, z: 0 }) {
  const fc = createFakeCore();
  fc.flags.set('story.m01.tavernDoused', true); // Tobb stands at the Grey Goose once its door is out (density pass)
  fc.ctx.strings.register('en', NPC_STRINGS_EN);
  for (const n of BRIGHTWATER_LAYOUT.npcs) {
    const a = BRIGHTWATER_LAYOUT.anchors.find((x) => x.id === n.post)!;
    fc.ctx.anchors.define({ id: a.id, position: { x: a.x, y: 1.5, z: a.z }, yaw: (a.yawDeg * Math.PI) / 180 });
    POSTS[n.id] = [a.x, 1.5, a.z, (a.yawDeg * Math.PI) / 180];
  }
  fc.ctx.anchors.define({ id: 'elsewhere', position: { x: 100, y: 2, z: -50 }, yaw: Math.PI / 2 });
  const warn = vi.fn();
  const pl = { player };
  const m = new NpcManager(fc.ctx, {
    layoutNpcs: BRIGHTWATER_LAYOUT.npcs,
    defs: NPC_DEFS,
    playerPosition: () => pl.player,
    warn,
    ...over,
  });
  return { fc, m, warn, pl };
}
const interact = (fc: ReturnType<typeof createFakeCore>, id: string) => fc.interactables.get(`npc:${id}`)!.onInteract({} as never);
const never = (): NpcModelLoader => ({ load: () => new Promise(() => {}), instantiate: () => { throw new Error('no'); }, animations: () => [] });
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('spawnAll', () => {
  it('creates one non-hittable immortal neutral actor and placeholder per npc, at the post', () => {
    const { fc, m } = setup();
    m.spawnAll();
    expect(fc.actors.size).toBe(BRIGHTWATER_LAYOUT.npcs.length);
    for (const n of BRIGHTWATER_LAYOUT.npcs) {
      const a = [...fc.actors.values()].find((x) => x.kind === `npc:${n.id}`)!;
      expect(a).toMatchObject({ team: 'neutral', hittable: false, immortal: true });
      expect(a.root!.parent).toBe(fc.scene);
      // Tobb carries his cloak and lute as a second child.
      expect(a.root!.children.length).toBe(n.id === 'tobb' ? 2 : 1);
      const [x, y, z, yaw] = POSTS[n.id];
      expect(a.root!.position.toArray()).toEqual([x, y, z]);
      expect(a.root!.rotation.y).toBeCloseTo(yaw);
      expect(m.get(n.id)!.hasModel).toBe(false);
      expect(m.position(n.id)).toEqual({ x, y, z });
    }
  });
  it('registers a talk interactable per npc with the translated name and radius', () => {
    const { fc, m } = setup();
    m.spawnAll();
    expect(fc.interactables.size).toBe(BRIGHTWATER_LAYOUT.npcs.length);
    const i = fc.interactables.get('npc:stane')!;
    expect(i.kind).toBe('talk');
    expect(i.name).toBe('Marshal Osric Stane');
    expect(i.radius).toBe(2.5);
    expect(i.position(new THREE.Vector3()).toArray()).toEqual([-40, 1.5, 128]);
  });
  it('is synchronous: placeholders exist before any loader promise settles', () => {
    const { fc, m } = setup({ loader: never() });
    m.spawnAll();
    expect(fc.scene.children.length).toBe(BRIGHTWATER_LAYOUT.npcs.length);
  });
  it('throws when called twice', () => {
    const { m } = setup();
    m.spawnAll();
    expect(() => m.spawnAll()).toThrow(/twice/);
  });
  it('throws naming a layout npc without def, and creates nothing', () => {
    const { fc, m } = setup({ defs: NPC_DEFS.filter((d) => d.id !== 'hob') });
    expect(() => m.spawnAll()).toThrow(/"hob"/);
    expect(fc.actors.size).toBe(0);
    expect(fc.scene.children.length).toBe(0);
  });
  it('throws naming a def without layout entry', () => {
    const { m } = setup({ layoutNpcs: BRIGHTWATER_LAYOUT.npcs.filter((n) => n.id !== 'wynn') });
    expect(() => m.spawnAll()).toThrow(/"wynn"/);
  });
  it('throws naming a missing post anchor', () => {
    const { fc, m } = setup();
    fc.anchors.delete('npc-post.edda');
    expect(() => m.spawnAll()).toThrow(/edda.*npc-post\.edda/);
  });
  it('throws on a duplicated id in layout or defs', () => {
    expect(() => setup({ layoutNpcs: [...BRIGHTWATER_LAYOUT.npcs, BRIGHTWATER_LAYOUT.npcs[0]] }).m.spawnAll()).toThrow(/"gaut"/);
    expect(() => setup({ defs: [...NPC_DEFS, NPC_DEFS[0]] }).m.spawnAll()).toThrow(/"gaut"/);
  });
});

describe('spawnAll rollback', () => {
  it('leaves nothing from the failing npc when interactable registration throws midway, and dispose clears the rest', () => {
    const { fc, m } = setup();
    const blocker = fc.ctx.interaction.register({ id: 'npc:stane', kind: 'talk', name: 'x', radius: 1, position: (o) => o, onInteract: () => {} });
    expect(() => m.spawnAll()).toThrow(/duplicate interactable "npc:stane"/);
    // gaut and edda were spawned before stane failed; stane itself must not be left behind
    expect(fc.scene.children.map((c) => c.name)).toEqual(['npc:gaut', 'npc:edda']);
    expect([...fc.actors.values()].some((a) => a.kind === 'npc:stane')).toBe(false);
    expect(fc.actors.size).toBe(2);
    expect(m.get('stane')).toBeUndefined();
    m.dispose();
    expect(fc.scene.children.length).toBe(0);
    expect(fc.actors.size).toBe(0);
    expect([...fc.interactables.keys()]).toEqual(['npc:stane']); // only the blocker
    void blocker;
  });
  it('throws on the first npc leaves scene, actors and interactables empty', () => {
    const { fc, m } = setup();
    fc.ctx.interaction.register({ id: 'npc:gaut', kind: 'talk', name: 'x', radius: 1, position: (o) => o, onInteract: () => {} });
    expect(() => m.spawnAll()).toThrow(/duplicate/);
    expect(fc.scene.children.length).toBe(0);
    expect(fc.actors.size).toBe(0);
    expect(fc.interactables.size).toBe(1);
  });
});

describe('talking', () => {
  it('calls the dialogue service with dialogue and npc ids', () => {
    const { fc, m } = setup();
    const start = vi.fn();
    fc.services.set('dialogue', { start });
    m.spawnAll();
    interact(fc, 'gaut');
    expect(start).toHaveBeenCalledWith('npc-gaut', 'gaut');
  });
  it('without a dialogue service does not throw, emits npc.talk-unavailable and warns once', () => {
    const { fc, m, warn } = setup();
    m.spawnAll();
    expect(() => interact(fc, 'edda')).not.toThrow();
    expect(fc.emitted.filter((e) => e.type === 'npc.talk-unavailable')).toEqual([
      { type: 'npc.talk-unavailable', payload: { npcId: 'edda' } },
    ]);
    interact(fc, 'hob');
    expect(fc.emitted.filter((e) => e.type === 'npc.talk-unavailable').length).toBe(2);
    expect(warn).toHaveBeenCalledTimes(1);
  });
  it('catches a throwing dialogue service', () => {
    const { fc, m, warn } = setup();
    fc.services.set('dialogue', { start: () => { throw new Error('boom'); } });
    m.spawnAll();
    expect(() => interact(fc, 'gaut')).not.toThrow();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('boom'));
  });
});

describe('models', () => {
  it('swaps placeholders for models, playing Idle; loads each GLB once', async () => {
    const l = fakeLoader();
    const spy = vi.spyOn(l, 'load');
    const { fc, m } = setup({ loader: l });
    m.spawnAll();
    const before = fc.actors.get('npc:gaut#1')!.root!.children[0];
    await m.loadModels();
    // the carters wear generated townsfolk bodies (townsfolkBodies.ts), which load with Knight.glb for their clips
    expect([...new Set(spy.mock.calls.map((c) => c[0]))].sort()).toEqual(
      ['barbarian', 'knight', 'mage', 'rogueHooded', 'town-farmer-a', 'town-farmer-b', 'town-villager-b'], // carter-2 was the only rogue
    );
    expect(m.get('gaut')!.hasModel).toBe(true);
    const after = m.get('gaut')!.root.children;
    expect(after.length).toBe(1);
    expect(after[0]).not.toBe(before);
    void fc;
  });
  it('two npcs sharing a GLB have distinct clones and independent mixers', async () => {
    const { m } = setup({ loader: fakeLoader() });
    m.spawnAll();
    await m.loadModels();
    const a = m.get('stane')!.root.children[0];
    const b = m.get('wynn')!.root.children[0];
    expect(a).not.toBe(b);
    const ta = a.getObjectByName('root')!;
    const tb = b.getObjectByName('root')!;
    expect(ta).not.toBe(tb);
    // Different start offsets, and they keep animating on their own bones.
    m.fixedUpdateAnimation(0.1);
    expect(ta.position.y).not.toBeCloseTo(tb.position.y, 3);
  });
  it('a loader that rejects leaves placeholders, warns once per model, and loadModels resolves', async () => {
    const l = fakeLoader();
    l.load = () => Promise.reject(new Error('404'));
    const { m, warn } = setup({ loader: l });
    m.spawnAll();
    await expect(m.loadModels()).resolves.toBeUndefined();
    expect(m.get('gaut')!.hasModel).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('404'));
    // five KayKit GLBs and the carters' three generated bodies (whose KayKit fallbacks are among the five)
    expect(warn).toHaveBeenCalledTimes(8);
    expect(m.get('carter-1')!.hasModel).toBe(false);
  });
  it('an instantiate failure keeps the placeholder and does not reject', async () => {
    const l = fakeLoader();
    l.instantiate = () => { throw new Error('bad glb'); };
    const { m, warn } = setup({ loader: l });
    m.spawnAll();
    await expect(m.loadModels()).resolves.toBeUndefined();
    expect(m.get('gaut')!.hasModel).toBe(false);
    expect(warn).toHaveBeenCalled();
  });
  it('a loader that never resolves leaves placeholders and the rest working', async () => {
    const { fc, m } = setup({ loader: never() });
    m.spawnAll();
    void m.loadModels();
    await flush();
    expect(m.get('gaut')!.hasModel).toBe(false);
    expect(() => { m.fixedUpdateBehaviour(1 / 60); m.fixedUpdateAnimation(1 / 60); }).not.toThrow();
    expect(fc.scene.children.length).toBe(BRIGHTWATER_LAYOUT.npcs.length);
  });
  it('does not mutate the shared source material when tinting', async () => {
    const l = fakeLoader();
    const { m } = setup({ loader: l });
    m.spawnAll();
    await m.loadModels();
    expect(l.src.mat.color.getHex()).toBe(0xffffff);
  });
  it('falls back to the first clip containing Idle, and to no animation', async () => {
    const l = fakeLoader();
    l.src.clips.splice(0, 1, new THREE.AnimationClip('Idle_B', 1, [new THREE.VectorKeyframeTrack('root.position', [0, 1], [0, 0, 0, 0, 1, 0])]));
    const { m } = setup({ loader: l });
    m.spawnAll();
    await m.loadModels();
    const bone = m.get('gaut')!.root.children[0].getObjectByName('root')!;
    m.fixedUpdateAnimation(0.5);
    const y = bone.position.y;
    m.fixedUpdateAnimation(0.1);
    expect(bone.position.y).not.toBe(y);

    const l2 = fakeLoader();
    l2.src.clips.length = 0;
    const s2 = setup({ loader: l2 });
    s2.m.spawnAll();
    await s2.m.loadModels();
    expect(s2.m.get('gaut')!.hasModel).toBe(true);
    expect(() => s2.m.fixedUpdateAnimation(0.1)).not.toThrow();
  });
  it('skips mixers of npcs beyond the cull distance (null player advances all)', async () => {
    const { m, pl } = setup({ loader: fakeLoader() });
    m.spawnAll();
    await m.loadModels();
    const bone = (id: string) => m.get(id)!.root.children[0].getObjectByName('root')!;
    pl.player = { x: -40, z: 128 }; // at stane; others >80 m away (gaut is ~104 m)
    const g0 = bone('gaut').position.y;
    const s0 = bone('stane').position.y;
    m.fixedUpdateAnimation(0.2);
    expect(bone('gaut').position.y).toBe(g0);
    expect(bone('stane').position.y).not.toBe(s0);
    pl.player = null;
    m.fixedUpdateAnimation(0.2);
    expect(bone('gaut').position.y).not.toBe(g0);
  });
  it('dispose before the model arrives swaps nothing in', async () => {
    const { fc, m } = setup({ loader: fakeLoader() });
    m.spawnAll();
    const p = m.loadModels();
    m.dispose();
    await p;
    expect(fc.scene.children.length).toBe(0);
  });
});

describe('proximity loading', () => {
  it('loads only GLBs within the load radius; a far npc stays a placeholder until the player approaches', async () => {
    const l = fakeLoader();
    const { m, pl } = setup({ loader: l });
    m.spawnAll();
    pl.player = { x: -40, z: 128 }; // at stane; gaut (knight) is ~110 m away, beyond modelLoadRadius
    m.fixedUpdateBehaviour(1 / 60);
    await flush();
    expect(m.get('stane')!.hasModel).toBe(true);
    expect(m.get('edda')!.hasModel).toBe(true); // 65 m
    expect(m.get('gaut')!.hasModel).toBe(false);
    expect(l.loads).not.toContain('knight');
    pl.player = { x: -3, z: 24 }; // walks to gaut
    m.fixedUpdateBehaviour(1 / 60);
    await flush();
    expect(m.get('gaut')!.hasModel).toBe(true);
    expect(l.loads.filter((x) => x === 'knight').length).toBe(1);
  });
  it('loads nothing without a player position, and never reloads a model already requested', async () => {
    const l = fakeLoader();
    const { m, pl } = setup({ loader: l }, null);
    m.spawnAll();
    m.fixedUpdateBehaviour(1 / 60);
    await flush();
    expect(l.loads.length).toBe(0);
    pl.player = { x: 0, z: 0 };
    m.fixedUpdateBehaviour(1 / 60);
    m.fixedUpdateBehaviour(1 / 60);
    await flush();
    expect(l.loads.filter((x) => x === 'mage').length).toBeLessThanOrEqual(1);
  });
});

describe('place', () => {
  it('moves the npc, its actor root and its interactable', () => {
    const { fc, m } = setup();
    m.spawnAll();
    expect(m.place('hob', 'elsewhere')).toBe(true);
    expect(m.position('hob')).toEqual({ x: 100, y: 2, z: -50 });
    const root = m.get('hob')!.root;
    expect(root.position.toArray()).toEqual([100, 2, -50]);
    expect(root.rotation.y).toBeCloseTo(Math.PI / 2);
    expect(fc.interactables.get('npc:hob')!.position(new THREE.Vector3()).toArray()).toEqual([100, 2, -50]);
  });
  it('a placed npc turns back to the new post yaw, not the old one', () => {
    const { m, pl } = setup({}, null);
    m.spawnAll();
    m.place('hob', 'elsewhere');
    for (let i = 0; i < 120; i++) m.fixedUpdateBehaviour(1 / 60);
    expect(m.get('hob')!.yaw).toBeCloseTo(Math.PI / 2);
    void pl;
  });
  it('returns false and changes nothing for unknown ids', () => {
    const { m } = setup();
    m.spawnAll();
    const before = m.position('hob');
    expect(m.place('nobody', 'elsewhere')).toBe(false);
    expect(m.place('hob', 'nowhere')).toBe(false);
    expect(m.position('hob')).toEqual(before);
    expect(m.position('nobody')).toBeUndefined();
    expect(m.get('nobody')).toBeUndefined();
  });
});

describe('behaviour wiring', () => {
  it('glances at a near player, faces them during a dialogue, and returns afterwards', () => {
    const { fc, m, pl } = setup({}, { x: 100, z: 100 });
    m.spawnAll();
    const step = (s: number) => { for (let i = 0; i < s * 60; i++) m.fixedUpdateBehaviour(1 / 60); };
    step(1);
    expect(m.get('hob')!.yaw).toBeCloseTo(postYaw('hob')); // player far
    pl.player = { x: 42 + 30, z: 47 }; // 30 m east: outside glance radius
    step(1);
    expect(m.get('hob')!.yaw).toBeCloseTo(postYaw('hob'));
    fc.fire('dialogue.started', { dialogueId: 'npc-hob', npcId: 'hob' });
    step(1);
    expect(m.get('hob')!.yaw).toBeCloseTo(-Math.PI / 2); // +X player: yaw 0 faces -Z
    expect(m.get('gaut')!.yaw).toBeCloseTo(postYaw('gaut')); // others unaffected
    fc.fire('dialogue.ended', { dialogueId: 'npc-hob', npcId: 'hob' });
    step(1);
    expect(m.get('hob')!.yaw).toBeCloseTo(postYaw('hob'));
    expect(m.get('hob')!.root.rotation.y).toBeCloseTo(postYaw('hob'));
  });
  it('ignores malformed or unknown dialogue events', () => {
    const { fc, m } = setup({}, { x: 72, z: 47 });
    m.spawnAll();
    fc.fire('dialogue.started', undefined);
    fc.fire('dialogue.started', { npcId: 'ghost' });
    fc.fire('dialogue.ended', null);
    m.fixedUpdateBehaviour(1 / 60);
    expect(m.get('hob')!.yaw).toBeCloseTo(postYaw('hob'));
  });
});

describe('dispose', () => {
  it('is idempotent and leaves nothing behind', async () => {
    const { fc, m } = setup({ loader: fakeLoader() });
    m.spawnAll();
    await m.loadModels();
    m.dispose();
    expect(() => m.dispose()).not.toThrow();
    expect(fc.scene.children.length).toBe(0);
    expect(fc.actors.size).toBe(0);
    expect(fc.interactables.size).toBe(0);
    // listeners removed: firing does not throw or re-add state
    expect(() => fc.fire('dialogue.started', { npcId: 'gaut' })).not.toThrow();
    expect(() => m.fixedUpdateBehaviour(0.1)).not.toThrow();
    expect(m.get('gaut')).toBeUndefined();
    expect(() => m.spawnAll()).toThrow();
  });
});

describe('talk interactables are live while a talk objective names them', () => {
  const fakeQuests = (views: Record<string, Array<{ current: boolean; def: { type: string; target?: string | string[] } }>>) => ({
    active: () => Object.keys(views),
    objectives: (id: string) => views[id] ?? [],
    npcObjectiveLive: (npc: string) =>
      Object.values(views).some((vs) => vs.some((v) => v.current && v.def.type === 'talk' && (Array.isArray(v.def.target) ? v.def.target.includes(npc) : v.def.target === npc))),
  });
  const live = (fc: ReturnType<typeof createFakeCore>, id: string) => fc.interactables.get(`npc:${id}`)!.live?.();

  it('is not live with no quests service, and not live with no talk objective', () => {
    const { fc, m } = setup();
    m.spawnAll();
    expect(live(fc, 'tobb')).toBe(false);
    fc.services.set('quests', fakeQuests({ q: [{ current: true, def: { type: 'goTo', target: 'tobb' } }] }));
    expect(live(fc, 'tobb')).toBe(false);
    m.dispose();
  });

  it('is live for the named npc only, and only while the objective is current', () => {
    const { fc, m } = setup();
    m.spawnAll();
    const views = { q: [{ current: true, def: { type: 'talk', target: 'tobb' } }] };
    fc.services.set('quests', fakeQuests(views));
    expect(live(fc, 'tobb')).toBe(true);
    const other = BRIGHTWATER_LAYOUT.npcs.find((n) => n.id !== 'tobb')!.id;
    expect(live(fc, other)).toBe(false);
    views.q[0].current = false;
    expect(live(fc, 'tobb')).toBe(false);
    m.dispose();
  });

  it('a list of targets makes each named npc live', () => {
    const { fc, m } = setup();
    m.spawnAll();
    const [a, b] = BRIGHTWATER_LAYOUT.npcs.map((n) => n.id);
    fc.services.set('quests', fakeQuests({ q: [{ current: true, def: { type: 'talk', target: [a, b] } }] }));
    expect(live(fc, a)).toBe(true);
    expect(live(fc, b)).toBe(true);
    m.dispose();
  });
});
