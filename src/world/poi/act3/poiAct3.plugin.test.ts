import { beforeAll, describe, expect, it } from 'vitest';
import { Containment } from '../../../region/containment';
import { createFakeCore } from '../../../region/testing/fakeCore';
import { PhysicsWorld } from '../../../physics/PhysicsWorld';
import { AnvilRubbings, READABLE_FLAG } from '../../../shrine/act3/rubbings';
import { LAST_ANVIL, rubbingCodexId, rubbingFlag, RUBBINGS_COLLECTION_ID } from '../../../shrine/act3/tuning';
import { codexEntry } from '../../../codex/entries';
import { A3_RUBBING_IDS, ACT3_POI_GOLD, LEAP_CACHE_XP, SONG_STONE_XP, a3DiscoveredFlag, a3TakenFlag } from './content';
import { a3Placed } from './place';
import { ledgeTop } from './fit';
import { REGION_INFO } from '../../../region/regions';
import { ACT3_POI_GOLD_CAP } from './content';
import { createPoiAct3Plugin } from './poiAct3.plugin';

let physics: PhysicsWorld;
beforeAll(async () => {
  physics = new PhysicsWorld();
  await physics.init();
});

/** Greyfen and the Dragonspine open (Act 3 under way): the flags their `openWhen` reads. */
const ACT3_OPEN = Object.fromEntries([...(REGION_INFO.greyfen.openWhen.all ?? []), ...(REGION_INFO.dragonspine.openWhen.all ?? [])].map((k) => [k, true]));
/** Act 2 done, Act 3 not begun: the Deepgate Track and the first Fen Road miles are walkable. */
const ACT2_ONLY = { 'story.gate.a2': true, 'story.d03.complete': true };
const sloped = (x: number, z: number) => 10 + 0.05 * x + 0.03 * z;

function rig(opts: { flags?: Record<string, boolean>; rubbings?: boolean | 'late'; heightAt?: (x: number, z: number) => number } = {}) {
  const fc = createFakeCore();
  fc.useRapier(physics.rapier);
  for (const [k, v] of Object.entries(opts.flags ?? ACT3_OPEN)) fc.flags.set(k, v);
  fc.services.set('containment', new Containment(fc.ctx.state));
  const gold: number[] = [];
  const xp: number[] = [];
  const unlocked: string[] = [];
  const registered: string[] = [];
  const toasts: string[] = [];
  fc.services.set('inventory', { addGold: (n: number) => gold.push(n) });
  fc.services.set('progression', { grantXp: (n: number) => xp.push(n) });
  fc.services.set('codex', {
    register: (e: { id: string }[]) => {
      registered.push(...e.map((x) => x.id));
      return () => {};
    },
    unlock: (id: string) => unlocked.push(id),
  });
  let rubbings: AnvilRubbings | null = null;
  if (opts.rubbings !== false) {
    rubbings = new AnvilRubbings({
      getBool: (k) => fc.ctx.state.getBool(k),
      setFlag: (k, v) => fc.ctx.state.setFlag(k, v),
      emitTaken: () => {},
      unlock: (id) => unlocked.push(id),
      registerCodex: (e) => {
        registered.push(...e.map((x) => x.id));
        return () => {};
      },
      warn: () => {},
    });
    // K9's own six, as the Last Anvil registers them.
    rubbings.register(LAST_ANVIL.rubbingIds.map((id) => ({ id })));
    if (opts.rubbings !== 'late') fc.services.set('anvilRubbings', rubbings);
  }
  const plugin = createPoiAct3Plugin({ heightAt: opts.heightAt ?? (() => 10), toast: (t) => toasts.push(t) });
  plugin.setup(fc.ctx);
  return { fc, plugin, gold, xp, unlocked, registered, toasts, rubbings };
}

function goTo(r: ReturnType<typeof rig>, siteId: string) {
  const p = a3Placed(siteId);
  Object.assign(r.fc.playerFeet, { x: p.pose.x, y: 10, z: p.pose.z });
  r.fc.tick('rules', 1.1);
  return p;
}

describe('poi-act3: start-up away from Act 3', () => {
  it('defines anchors and triggers, builds nothing, and dispose removes everything', () => {
    const { fc, plugin } = rig();
    expect(fc.anchors.has('greyfen.poi.stilt-camp.main')).toBe(true);
    expect(fc.anchors.has('dragonspine.poi.hawk-nest.rubbing')).toBe(true);
    expect(fc.triggers.has('trg.greyfen.poi.drowned-church.discover')).toBe(true);
    expect(fc.triggers.has('trg.poi.a3.fen-boundary-stone.discover')).toBe(true);
    expect([...fc.interactables.keys()].filter((k) => k.includes('poi-a3'))).toEqual([]);
    expect(fc.colliders.size).toBe(0);
    plugin.dispose?.();
    expect(fc.anchors.size).toBe(0);
    expect(fc.triggers.size).toBe(0);
  });

  it('puts every leap-gated anchor on its ledge\'s built top on sloped ground (not ground + 1.8 at the anchor)', () => {
    const { fc } = rig({ heightAt: sloped });
    for (const id of ['greyfen.poi.stilt-camp', 'dragonspine.poi.spine-ledge', 'spineroad.poi.spine-crag']) {
      const site = a3Placed(id.split('.')[2]);
      const ledge = site.layout.structures.find((s) => s.role === 'ledge')!;
      const top = ledgeTop(ledge, sloped);
      const a = fc.anchors.get(`${id}.ledge`)!.position;
      expect(a.y, id).toBeCloseTo(top, 5);
      expect(Math.abs(a.y - (sloped(a.x, a.z) + 1.8)), id).toBeGreaterThan(0.01);
    }
    const ledge = a3Placed('spine-ledge').layout.structures.find((s) => s.role === 'ledge')!;
    expect(fc.anchors.get('dragonspine.poi.spine-ledge.rubbing')!.position.y).toBeCloseTo(ledgeTop(ledge, sloped), 5);
  });

  it('adds the two null-land spurs and removes them on dispose', () => {
    const { fc, plugin } = rig();
    const c = fc.services.get('containment') as Containment;
    expect(() => c.addCorridor({ id: 'corridor.poi.a3.spine-crag', points: [[0, 0], [1, 1]], openWhen: {} })).toThrow(/already registered/);
    plugin.dispose?.();
    expect(() => c.addCorridor({ id: 'corridor.poi.a3.spine-crag', points: [[0, 0], [1, 1]], openWhen: {} })).not.toThrow();
  });

  it('registers the song stone codex entry and the six spine rubbings beside K9\'s six', () => {
    const { registered, rubbings } = rig();
    expect(registered).toContain('lore.poi.greyfen-song-stone');
    for (const id of A3_RUBBING_IDS) expect(registered).toContain(rubbingCodexId(id));
    expect(rubbings!.count()).toBe(0);
  });
});

describe('poi-act3: discovery', () => {
  it('sets the flag and emits discover once', () => {
    const { fc, toasts } = rig();
    fc.fire('trigger.enter', { triggerId: 'trg.dragonspine.poi.glass-vein.discover' });
    fc.fire('trigger.enter', { triggerId: 'trg.dragonspine.poi.glass-vein.discover' });
    expect(fc.flags.get(a3DiscoveredFlag('glass-vein'))).toBe(true);
    expect(fc.emitted.filter((e) => e.type === 'discover')).toEqual([{ type: 'discover', payload: { placeId: 'glass-vein', kind: 'poi' } }]);
    expect(toasts).toHaveLength(1);
  });
  it('ignores other triggers and malformed events', () => {
    const { fc } = rig();
    fc.fire('trigger.enter', { triggerId: 'trg.poi.a2.camp-1.discover' });
    fc.fire('trigger.enter', undefined);
    expect(fc.emitted.filter((e) => e.type === 'discover')).toHaveLength(0);
  });
});

describe('poi-act3: clusters, rewards and chests', () => {
  it('builds a cluster near the player (chest, cache, colliders) and tears it down when the player leaves', () => {
    const r = rig();
    goTo(r, 'stilt-camp');
    expect(r.fc.interactables.has('chest:poi-a3-stilt-camp')).toBe(true);
    expect(r.fc.interactables.has('use:poi-a3-stilt-camp-ledge')).toBe(true);
    expect(r.fc.colliders.size).toBeGreaterThan(0);
    Object.assign(r.fc.playerFeet, { x: 0, z: 0 });
    r.fc.tick('rules', 1.1);
    expect([...r.fc.interactables.keys()].filter((k) => k.includes('poi-a3'))).toEqual([]);
    expect(r.fc.colliders.size).toBe(0);
  });

  it('a Leap cache pays XP and gold once, and stays taken across a load into a fresh game', () => {
    const r = rig();
    goTo(r, 'spine-crag');
    const id = 'use:poi-a3-spine-crag-ledge';
    r.fc.fire('interact', { interactableId: id, kind: 'use' });
    r.fc.fire('interact', { interactableId: id, kind: 'use' });
    expect(r.xp).toEqual([LEAP_CACHE_XP]);
    expect(r.gold).toEqual([ACT3_POI_GOLD[id]]);
    expect(r.fc.flags.get(a3TakenFlag('spine-crag'))).toBe(true);
    const saved = Object.fromEntries(r.fc.flags);
    r.plugin.dispose?.();
    const again = rig({ flags: saved as Record<string, boolean> });
    again.fc.fire('save.loaded');
    goTo(again, 'spine-crag');
    expect(again.fc.interactables.get(id)?.enabled?.()).toBe(false);
    again.fc.fire('interact', { interactableId: id, kind: 'use' });
    expect(again.xp).toEqual([]);
    expect(again.gold).toEqual([]);
  });

  it('the Act 3 gold stays under its cap', () => {
    expect(Object.values(ACT3_POI_GOLD).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(ACT3_POI_GOLD_CAP);
  });

  it('in Act 2 (Deepgate Track and the first Fen Road miles walkable) no cluster builds, dressing included', () => {
    const r = rig({ flags: ACT2_ONLY });
    for (const at of [{ x: 20300, z: 9900 }, { x: 17900, z: 11200 }, { x: 7800, z: 3800 }, { x: 5700, z: 9600 }, { x: 13900, z: 13480 }]) {
      Object.assign(r.fc.playerFeet, { ...at, y: 10 });
      r.fc.tick('rules', 1.1);
      expect(r.fc.colliders.size, JSON.stringify(at)).toBe(0);
      expect([...r.fc.interactables.keys()].filter((k) => k.includes('poi-a3')), JSON.stringify(at)).toEqual([]);
    }
    // The gate opens: the Fen Road cluster under the player builds on the next sync, the Dragonspine ones still wait.
    r.fc.ctx.state.setFlag('story.gate.a3', true);
    Object.assign(r.fc.playerFeet, { x: 5700, z: 9600 });
    r.fc.tick('rules', 1.1);
    expect(r.fc.interactables.has('chest:poi-a3-stilt-camp')).toBe(true);
  });

  it('a failing reward (no progression service) leaves the cache untaken', () => {
    const r = rig();
    goTo(r, 'spine-crag');
    r.fc.services.delete('progression');
    r.fc.fire('interact', { interactableId: 'use:poi-a3-spine-crag-ledge', kind: 'use' });
    expect(r.fc.flags.get(a3TakenFlag('spine-crag'))).toBeUndefined();
  });

  it('the song stone pays XP once and unlocks its codex entry', () => {
    const r = rig();
    goTo(r, 'greyfen-song-stone');
    r.fc.fire('interact', { interactableId: 'use:poi-a3-greyfen-song-stone', kind: 'use' });
    expect(r.xp).toEqual([SONG_STONE_XP]);
    expect(r.unlocked).toContain('lore.poi.greyfen-song-stone');
  });

  it('pays chest gold from its own table and ignores Act 2 and unknown sources', () => {
    const r = rig();
    r.fc.fire('loot.granted', { sourceId: 'chest:poi-a3-hunter-cairn', items: [] });
    r.fc.fire('loot.granted', { sourceId: 'chest:poi-a2-cave-2', items: [] });
    r.fc.fire('loot.granted', undefined);
    expect(r.gold).toEqual([30]);
  });
});

describe('poi-act3: the six Dragonspine rubbings', () => {
  it('before M30 and M32: taking one sets its flag, toasts the locked text, leaves K9\'s six untouched, unlocks only the collection', () => {
    const r = rig();
    goTo(r, 'hawk-nest');
    const it = r.fc.interactables.get('use:poi-a3-rubbing-spine-1')!;
    expect(it.holdSeconds).toBe(3);
    expect(it.enabled?.()).toBe(true);
    it.onInteract(undefined as never);
    expect(r.fc.flags.get(rubbingFlag('spine-1'))).toBe(true);
    expect(r.toasts.at(-1)).toBe('rubbing.locked');
    for (const id of LAST_ANVIL.rubbingIds) expect(r.rubbings!.taken(id)).toBe(false);
    expect(r.rubbings!.count()).toBe(1);
    expect(r.unlocked).toEqual([RUBBINGS_COLLECTION_ID]);
    expect(it.enabled?.()).toBe(false);
    it.onInteract(undefined as never);
    expect(r.rubbings!.count()).toBe(1);
  });

  it('after M32 a take unlocks its lore at once, with the titled toast', () => {
    const r = rig({ flags: { ...ACT3_OPEN, [READABLE_FLAG]: true } });
    goTo(r, 'glass-vein');
    r.fc.interactables.get('use:poi-a3-rubbing-spine-4')!.onInteract(undefined as never);
    expect(r.unlocked).toContain(rubbingCodexId('spine-4'));
    expect(r.toasts.at(-1)).toBe('rubbing.taken');
  });

  it('a rubbing taken before M32 opens when the M32 flag lands (K9 re-derives)', () => {
    const r = rig();
    goTo(r, 'frozen-camp');
    r.fc.interactables.get('use:poi-a3-rubbing-spine-3')!.onInteract(undefined as never);
    expect(r.unlocked).not.toContain(rubbingCodexId('spine-3'));
    r.fc.flags.set(READABLE_FLAG, true);
    r.rubbings!.derive();
    expect(r.unlocked).toContain(rubbingCodexId('spine-3'));
  });

  it('registers the rubbings once K9\'s service appears after setup (no hard dependency on its plugin)', () => {
    const r = rig({ rubbings: 'late' });
    expect(r.rubbings!.readable).toBeDefined();
    r.fc.services.set('anvilRubbings', r.rubbings!);
    goTo(r, 'hawk-nest');
    const it = r.fc.interactables.get('use:poi-a3-rubbing-spine-1')!;
    expect(it.enabled?.()).toBe(true);
    it.onInteract(undefined as never);
    expect(r.rubbings!.taken('spine-1')).toBe(true);
    r.fc.tick('rules', 1.1); // a second sync registers nothing twice (register refuses duplicates by throwing)
  });

  it('without the anvilRubbings service: a warning, the stones have no prompt, nothing throws', () => {
    const r = rig({ rubbings: false });
    goTo(r, 'hunter-cairn');
    const it = r.fc.interactables.get('use:poi-a3-rubbing-spine-2')!;
    expect(it.enabled?.()).toBe(false);
    expect(() => it.onInteract(undefined as never)).not.toThrow();
  });

  it('the codex entry shape matches K9\'s (lore tab, rubbing-<id> slug)', () => {
    expect(codexEntry('lore', rubbingCodexId('spine-6'), 'rubbing-spine-6').id).toBe('lore.rubbing.spine-6');
  });
});
