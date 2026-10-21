import { beforeAll, describe, expect, it } from 'vitest';
import { Containment } from '../../region/containment';
import { createFakeCore } from '../../region/testing/fakeCore';
import { PhysicsWorld } from '../../physics/PhysicsWorld';
import { BRIGHTWATER_LAYOUT } from '../../region/brightwater.layout';
import { DEADROAD_LAYOUT } from '../../region/deadroad.layout';
import { FOXFIRE_CHESTS, FOX_CACHE_CHEST_ID, FOX_CACHE_FLAG, FOX_CACHE_POS, buildGold, buildRewards, foxChestId, foxChestPos, takenFlag } from './content';
import { FOX_FIRE_FLAG } from './foxFire';
import { ACT2_POI_GOLD, ACT2_POI_GOLD_CAP, validateLoot } from './loot';
import { ACT2_POI_PLACEMENTS } from './placement.act2';
import { createPoiPlugin, POI_SYSTEM_ID } from './poi.plugin';

let physics: PhysicsWorld;
beforeAll(async () => {
  physics = new PhysicsWorld();
  await physics.init();
});

function rig(flags: Record<string, boolean> = {}, feet = { x: 0, y: 0, z: 0 }) {
  const fc = createFakeCore();
  fc.useRapier(physics.rapier);
  for (const [k, v] of Object.entries(flags)) fc.flags.set(k, v);
  Object.assign(fc.playerFeet, feet);
  fc.services.set('containment', new Containment(fc.ctx.state));
  const gold: number[] = [];
  const unlocked: string[] = [];
  const xp: number[] = [];
  fc.services.set('inventory', { addGold: (n: number) => gold.push(n) });
  fc.services.set('progression', { grantXp: (n: number) => xp.push(n) });
  fc.services.set('codex', { register: () => () => {}, unlock: (id: string) => unlocked.push(id) });
  const plugin = createPoiPlugin({ heightAt: () => 5 });
  plugin.setup(fc.ctx);
  return { fc, plugin, gold, unlocked, xp };
}

const near = (id: string) => {
  const p = ACT2_POI_PLACEMENTS.find((x) => x.site.id === id)!;
  return p;
};

describe('poi plugin: Act 1 start-up', () => {
  it('builds no structures and registers no interactables far from Act 2, but defines anchors and triggers', () => {
    const { fc, plugin } = rig();
    expect([...fc.interactables.keys()].filter((k) => k.includes('poi-a2'))).toEqual([]);
    expect(fc.colliders.size).toBe(0);
    expect(fc.anchors.has('poi.a2.camp-1.main')).toBe(true);
    expect(fc.anchors.has('poi.a2.fox-cache')).toBe(true);
    expect(fc.triggers.has('trg.poi.a2.camp-1.discover')).toBe(true);
    plugin.dispose?.();
    expect(fc.anchors.size).toBe(0);
    expect(fc.triggers.size).toBe(0);
  });

  it('collides with no Act 1 anchor, trigger or structure id', () => {
    const { fc } = rig();
    const act1Anchors = new Set(BRIGHTWATER_LAYOUT.anchors.concat(DEADROAD_LAYOUT.anchors).map((a) => a.id));
    const act1Triggers = new Set(BRIGHTWATER_LAYOUT.triggers.concat(DEADROAD_LAYOUT.triggers).map((t) => t.id));
    for (const id of fc.anchors.keys()) expect(act1Anchors.has(id), id).toBe(false);
    for (const id of fc.triggers.keys()) expect(act1Triggers.has(id), id).toBe(false);
    for (const id of fc.anchors.keys()) expect(id.startsWith('poi.a2.')).toBe(true);
  });

  it('adds spur corridors for road-side sites outside the Cinderreach box and removes them on dispose', () => {
    const fc = createFakeCore();
    fc.useRapier(physics.rapier);
    const c = new Containment(fc.ctx.state);
    fc.services.set('containment', c);
    const plugin = createPoiPlugin({ heightAt: () => 5 });
    plugin.setup(fc.ctx);
    const camp = near('camp-1');
    expect(camp).toBeTruthy();
    expect(() => c.addCorridor({ id: 'corridor.poi.a2.camp-1', points: [[0, 0], [1, 1]], openWhen: {} })).toThrow(/already registered/);
    plugin.dispose?.();
    expect(() => c.addCorridor({ id: 'corridor.poi.a2.camp-1', points: [[0, 0], [1, 1]], openWhen: {} })).not.toThrow();
  });
});

describe('poi plugin: discovery', () => {
  it('sets the flag, emits discover once and does nothing on re-entry', () => {
    const { fc } = rig();
    fc.fire('trigger.enter', { triggerId: 'trg.poi.a2.camp-1.discover', actorId: 'player' });
    fc.fire('trigger.enter', { triggerId: 'trg.poi.a2.camp-1.discover', actorId: 'player' });
    expect(fc.flags.get('place.poi.a2.camp-1.discovered')).toBe(true);
    expect(fc.emitted.filter((e) => e.type === 'discover')).toEqual([{ type: 'discover', payload: { placeId: 'camp-1', kind: 'poi' } }]);
  });
  it('ignores unrelated triggers and malformed events', () => {
    const { fc } = rig();
    fc.fire('trigger.enter', { triggerId: 'trg.something.else' });
    fc.fire('trigger.enter', undefined);
    expect(fc.emitted.filter((e) => e.type === 'discover')).toHaveLength(0);
  });
});

describe('poi plugin: clusters near the player', () => {
  function atCluster(id: string, flags: Record<string, boolean> = {}) {
    const p = near(id);
    const r = rig(flags, { x: 0, y: 0, z: 0 });
    const a = r.fc.anchors.get(`poi.a2.${id}.main`)!;
    Object.assign(r.fc.playerFeet, { x: a.position.x, y: a.position.y, z: a.position.z });
    r.fc.tick('rules', 1.1);
    return { ...r, p };
  }

  it('builds the cluster within 1.5 km (interactables and colliders) and tears it down after leaving', () => {
    const { fc } = atCluster('cave-2');
    expect(fc.interactables.has('chest:poi-a2-cave-2')).toBe(true);
    expect(fc.interactables.has('use:poi-a2-cave-2-ledge')).toBe(true);
    expect(fc.colliders.size).toBeGreaterThan(0);
    Object.assign(fc.playerFeet, { x: 0, z: 0 });
    fc.tick('rules', 1.1);
    expect([...fc.interactables.keys()].filter((k) => k.includes('poi-a2'))).toEqual([]);
    expect(fc.colliders.size).toBe(0);
  });

  it('pays a Leap cache once: xp, gold, taken flag; a second interact does nothing; survives a flag reload', () => {
    const { fc, gold, xp } = atCluster('cave-2');
    const id = 'use:poi-a2-cave-2-ledge';
    fc.fire('interact', { interactableId: id, kind: 'use', actorId: 'player', action: 'interact' });
    fc.fire('interact', { interactableId: id, kind: 'use', actorId: 'player', action: 'interact' });
    expect(fc.flags.get(takenFlag('cave-2'))).toBe(true);
    expect(xp).toEqual([40]);
    expect(gold).toEqual([ACT2_POI_GOLD[id]]);
    // a later session: the flag is still set, nothing repeats
    fc.fire('save.loaded');
    fc.fire('interact', { interactableId: id, kind: 'use', actorId: 'player', action: 'interact' });
    expect(xp).toEqual([40]);
  });

  it('the pass lore stone also unlocks its codex entry', () => {
    const { fc, unlocked } = atCluster('lore-stone-1');
    fc.fire('interact', { interactableId: 'use:poi-a2-lore-stone-1-ledge', kind: 'use', actorId: 'player', action: 'interact' });
    expect(unlocked).toEqual(['lore.poi.lore-stone-1']);
  });

  it('a failing reward (no progression service) leaves the cache untaken', () => {
    const { fc, plugin } = atCluster('cave-2');
    fc.services.delete('progression');
    fc.fire('interact', { interactableId: 'use:poi-a2-cave-2-ledge', kind: 'use', actorId: 'player', action: 'interact' });
    expect(fc.flags.get(takenFlag('cave-2'))).toBeUndefined();
    plugin.dispose?.();
  });

  it('pays chest gold from the Act 2 table on loot.granted, and ignores other sources', () => {
    const { fc, gold } = atCluster('cave-2');
    fc.fire('loot.granted', { sourceId: 'chest:poi-a2-cave-2', items: [] });
    fc.fire('loot.granted', { sourceId: 'chest:somebody-else', items: [] });
    fc.fire('loot.granted', undefined);
    expect(gold).toEqual([20]);
  });

  it('pays no gold and shows no gold toast when the inventory service is missing', () => {
    const { fc, gold } = atCluster('cave-2');
    fc.services.delete('inventory');
    fc.fire('loot.granted', { sourceId: 'chest:poi-a2-cave-2', items: [] });
    expect(gold).toEqual([]);
  });

  it('a chest opened before a load stays opened after it', () => {
    const { fc } = atCluster('cave-2', { 'chest.poi-a2-cave-2.opened': true });
    fc.fire('save.loaded');
    const reg = fc.interactables.get('chest:poi-a2-cave-2');
    expect(reg?.enabled?.()).toBe(false);
  });
});

describe('poi plugin: Fox-Fire chests', () => {
  const f = FOXFIRE_CHESTS[0];
  const pos = foxChestPos(f);
  const id = foxChestId(f.n);

  it('is absent without the buff, present within 20 m with it, gone beyond 20 m or when the buff ends', () => {
    const { fc } = rig({}, { x: pos.x, y: 0, z: pos.z });
    fc.tick('rules');
    expect(fc.interactables.has(id)).toBe(false);
    fc.flags.set(FOX_FIRE_FLAG, true);
    fc.tick('rules');
    expect(fc.interactables.has(id)).toBe(true);
    fc.playerFeet.x = pos.x + 21;
    fc.tick('rules');
    expect(fc.interactables.has(id)).toBe(false);
    fc.playerFeet.x = pos.x + 19;
    fc.tick('rules');
    expect(fc.interactables.has(id)).toBe(true);
    fc.flags.set(FOX_FIRE_FLAG, false);
    fc.tick('rules');
    expect(fc.interactables.has(id)).toBe(false);
  });

  it('pays loot once across hide and reveal cycles, and an opened chest never returns', () => {
    const { fc } = rig({ [FOX_FIRE_FLAG]: true }, { x: pos.x, y: 0, z: pos.z });
    fc.tick('rules');
    fc.interactables.get(id)!.onInteract(undefined as never);
    expect(fc.emitted.filter((e) => e.type === 'loot.granted' && (e.payload as { sourceId: string }).sourceId === id)).toHaveLength(1);
    fc.tick('rules');
    expect(fc.interactables.has(id)).toBe(false);
    fc.flags.set(FOX_FIRE_FLAG, false);
    fc.tick('rules');
    fc.flags.set(FOX_FIRE_FLAG, true);
    fc.tick('rules');
    expect(fc.interactables.has(id)).toBe(false);
  });

  it('a save loaded during the buff reveals the chest', () => {
    const { fc } = rig({}, { x: pos.x, y: 0, z: pos.z });
    fc.flags.set(FOX_FIRE_FLAG, true);
    fc.fire('save.loaded');
    expect(fc.interactables.has(id)).toBe(true);
  });
});

describe('poi plugin: fox cache', () => {
  it('stays hidden until fox.cache arrives, then is openable once, and the reveal survives a load', () => {
    const { fc } = rig();
    expect(fc.interactables.has(FOX_CACHE_CHEST_ID)).toBe(false);
    fc.fire('fox.cache', { foxId: 'kindling-fox-1' });
    expect(fc.flags.get(FOX_CACHE_FLAG)).toBe(true);
    expect(fc.interactables.has(FOX_CACHE_CHEST_ID)).toBe(true);
    fc.interactables.get(FOX_CACHE_CHEST_ID)!.onInteract(undefined as never);
    fc.tick('rules');
    expect(fc.interactables.has(FOX_CACHE_CHEST_ID)).toBe(false);
    fc.fire('save.loaded');
    fc.tick('rules');
    expect(fc.interactables.has(FOX_CACHE_CHEST_ID)).toBe(false);
  });

  it('ignores a fox.cache event with no fox id', () => {
    const { fc } = rig();
    fc.fire('fox.cache', {});
    fc.fire('fox.cache', undefined);
    fc.fire('fox.cache', { foxId: 7 });
    expect(fc.flags.get(FOX_CACHE_FLAG)).toBeUndefined();
    expect(fc.interactables.has(FOX_CACHE_CHEST_ID)).toBe(false);
  });

  it('a save with the reveal flag shows the cache on load', () => {
    const { fc } = rig();
    fc.flags.set(FOX_CACHE_FLAG, true);
    fc.fire('save.loaded');
    expect(fc.interactables.has(FOX_CACHE_CHEST_ID)).toBe(true);
    expect(FOX_CACHE_POS.x).toBeGreaterThan(16000);
  });
});

describe('poi content tables', () => {
  it('gold total stays within the cap and loot validates', () => {
    expect(validateLoot()).toEqual([]);
    const total = Object.values(buildGold()).reduce((a, b) => a + b, 0);
    expect(total).toBeLessThanOrEqual(ACT2_POI_GOLD_CAP);
  });
  it('rewards exist for every Leap spot and the system id is stable', () => {
    expect(buildRewards(buildGold())).toHaveLength(5);
    expect(POI_SYSTEM_ID).toBe('poi.tick');
  });
});

describe('poi plugin: saves and strings', () => {
  it('writes no flags at start-up for an Act 1 save and registers its strings and codex text', () => {
    const before = { 'story.m05.complete': true, 'chest.farm.opened': true };
    const { fc } = rig(before);
    expect([...fc.flags.keys()].sort()).toEqual(Object.keys(before).sort());
    expect(fc.strings.get('codex.lore.poi-lore-stone-1.name')).toBeTruthy();
    expect(fc.strings.get('poi.a2.found')).toContain('{name}');
    for (const t of ['camp', 'cave', 'ruin', 'lore-stone', 'wyrm-nest', 'hunter-pen', 'vista']) expect(fc.strings.has(`poi.a2.name.${t}`)).toBe(true);
  });
  it('a double setup throws on duplicate ids and leaves nothing behind', () => {
    const { fc, plugin } = rig();
    expect(() => plugin.setup(fc.ctx)).toThrow();
    plugin.dispose?.();
    expect(fc.anchors.size).toBe(0);
    expect(fc.strings.size).toBe(0);
  });
});
