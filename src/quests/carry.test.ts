import { describe, it, expect } from 'vitest';
import { CarrySystem, type Carryable, type PickupInteractable } from './carry';

function setup(opts: { missingHome?: string; current?: (q: string, o: string) => boolean } = {}) {
  const handlers = new Map<string, Array<(p: any) => void>>();
  const emitted: Array<[string, any]> = [];
  const bus = {
    on(t: string, l: (p: any) => void) {
      const a = handlers.get(t) ?? []; a.push(l); handlers.set(t, a);
      return () => { a.splice(a.indexOf(l), 1); };
    },
    emit(t: string, p?: unknown) { emitted.push([t, p]); (handlers.get(t) ?? []).slice().forEach((l) => l(p)); },
  };
  const flags = new Map<string, boolean>();
  let mods = 0; let addCalls = 0; let lastMod: any;
  const feet = { x: 5, y: 0, z: 5 };
  const interactables = new Map<string, PickupInteractable>();
  let block = false;
  const warns: string[] = [];
  const vis = new Map<string, { pos: any; on: boolean; yaw?: number }>();
  const carryables: Carryable[] = [1, 2, 3].map((n) => {
    const id = `villager-${n}`;
    vis.set(id, { pos: null, on: true });
    return {
      id, interactableId: `pickup:${id}`,
      home: () => (opts.missingHome === id ? undefined : { x: n * 10, y: 0, z: 0 }),
      setPosition: (p, yaw) => { vis.get(id)!.pos = { ...p }; vis.get(id)!.yaw = yaw; },
      setVisible: (on) => { vis.get(id)!.on = on; },
      deliveredFlag: `quest.m01.villager${n}.delivered`,
      questId: 'm01', objectiveId: 'carry', destination: 'chapel',
    };
  });
  const sys = new CarrySystem({
    bus,
    flags: { get: (k) => flags.get(k) === true, set: (k, v) => { flags.set(k, v); } },
    player: {
      id: () => 'player', feet: () => feet, facingYaw: () => 1.25,
      addMoveModifier: (_s, m) => { mods++; addCalls++; lastMod = m; let done = false; return () => { if (!done) { done = true; mods--; } }; },
    },
    interactables: { register: (i) => { interactables.set(i.id, i); return () => { interactables.delete(i.id); }; } },
    objectiveCurrent: opts.current ?? (() => true),
    carryables,
    isActionHeld: () => block,
    warn: (m) => warns.push(m),
  });
  const pick = (n: number) => interactables.get(`pickup:villager-${n}`)!.onInteract();
  const enabled = (n: number) => interactables.get(`pickup:villager-${n}`)!.enabled!();
  const ev = (t: string) => emitted.filter((e) => e[0] === t).map((e) => e[1]);
  return { sys, bus, emitted, flags, interactables, vis, warns, feet, pick, enabled, ev, get mods() { return mods; }, get addCalls() { return addCalls; }, get lastMod() { return lastMod; }, setBlock: (b: boolean) => { block = b; } };
}

describe('CarrySystem', () => {
  it('pickup sets the modifier and emits carry.picked', () => {
    const t = setup();
    t.pick(1);
    expect(t.mods).toBe(1);
    expect(t.lastMod.speedScale).toBe(0.6);
    expect(t.lastMod.lockActions).toContain('dodge');
    expect(t.lastMod.lockActions).not.toContain('block');
    expect(t.ev('carry.picked')).toEqual([{ carryId: 'villager-1' }]);
  });
  it('block-held pickup yields picked then dropped', () => {
    const t = setup(); t.setBlock(true);
    t.pick(1);
    expect(t.emitted.map((e) => e[0]).filter((x) => x.startsWith('carry.'))).toEqual(['carry.picked', 'carry.dropped']);
    expect(t.mods).toBe(0);
  });
  it('locks surgeLeap and mount', () => {
    const t = setup(); t.pick(1);
    expect(t.lastMod.lockActions).toEqual(expect.arrayContaining(['surgeLeap', 'mount']));
  });
  it('drops with reason objective when the objective stops being current', () => {
    let cur = true;
    const t = setup({ current: () => cur }); t.pick(1);
    t.sys.update(0.016);
    expect(t.mods).toBe(1);
    cur = false;
    t.sys.update(0.016);
    expect(t.mods).toBe(0);
    expect(t.ev('carry.dropped')).toEqual([{ carryId: 'villager-1', reason: 'objective' }]);
  });
  it('damage hit drops with reason damaged; other outcomes and targets do not', () => {
    const t = setup(); t.pick(1);
    t.bus.emit('damage.dealt', { targetId: 'player', outcome: 'blocked' });
    t.bus.emit('damage.dealt', { targetId: 'wraith', outcome: 'hit' });
    expect(t.mods).toBe(1);
    t.feet.x = 7;
    t.bus.emit('damage.dealt', { targetId: 'player', outcome: 'hit' });
    expect(t.mods).toBe(0);
    expect(t.ev('carry.dropped')).toEqual([{ carryId: 'villager-1', reason: 'damaged' }]);
    expect(t.vis.get('villager-1')!.pos.x).toBe(7);
    expect(t.enabled(1)).toBe(true);
  });
  it('a carried villager follows the player\'s feet and facing; a dropped or home one stands without a carrier yaw', () => {
    const t = setup(); t.pick(1);
    expect(t.vis.get('villager-1')!.pos).toEqual({ x: 5, y: 0, z: 5 });
    expect(t.vis.get('villager-1')!.yaw).toBe(1.25);
    t.bus.emit('damage.dealt', { targetId: 'player', outcome: 'hit' });
    expect(t.vis.get('villager-1')!.yaw).toBeUndefined();
  });
  it('death drops', () => {
    const t = setup(); t.pick(1);
    t.bus.emit('actor.died', { actorId: 'wraith' });
    expect(t.mods).toBe(1);
    t.bus.emit('actor.died', { actorId: 'player' });
    expect(t.mods).toBe(0);
    expect(t.ev('carry.dropped')[0].reason).toBe('death');
  });
  it('dialogue start does not drop', () => {
    const t = setup(); t.pick(1);
    t.bus.emit('dialogue.started', { dialogueId: 'x', npcId: 'gaut' });
    expect(t.mods).toBe(1);
    expect(t.ev('carry.dropped')).toEqual([]);
  });
  it('save.loaded drops to home and re-syncs delivered villagers', () => {
    const t = setup(); t.pick(1);
    t.flags.set('quest.m01.villager2.delivered', true);
    t.bus.emit('save.loaded', { slot: 'a' });
    expect(t.mods).toBe(0);
    expect(t.ev('carry.dropped')).toEqual([{ carryId: 'villager-1', reason: 'load' }]);
    expect(t.vis.get('villager-1')!.pos).toEqual({ x: 10, y: 0, z: 0 });
    expect(t.vis.get('villager-2')!.on).toBe(false);
    expect(t.enabled(2)).toBe(false);
    expect(t.enabled(1)).toBe(true);
    expect(t.vis.get('villager-1')!.on).toBe(true);
  });
  it('constructor hides already delivered villagers', () => {
    const t = setup();
    t.flags.set('quest.m01.villager3.delivered', true);
    t.bus.emit('save.loaded', {});
    expect(t.vis.get('villager-3')!.on).toBe(false);
  });
  it('holding block drops voluntarily', () => {
    const t = setup(); t.pick(1);
    t.sys.update(0.016);
    expect(t.mods).toBe(1);
    t.setBlock(true);
    t.sys.update(0.016);
    expect(t.mods).toBe(0);
    expect(t.ev('carry.dropped')[0].reason).toBe('voluntary');
  });
  it('visual follows the player while carried', () => {
    const t = setup(); t.pick(1);
    t.feet.x = 20; t.sys.update(0.016);
    expect(t.vis.get('villager-1')!.pos.x).toBe(20);
  });
  it('second pickup while carrying is ignored and not enabled', () => {
    const t = setup(); t.pick(1);
    expect(t.enabled(2)).toBe(false);
    t.pick(2);
    expect(t.addCalls).toBe(1);
    expect(t.ev('carry.picked').length).toBe(1);
  });
  it('not enabled when objective is not current; pickup refused', () => {
    const t = setup({ current: () => false });
    expect(t.enabled(1)).toBe(false);
    t.pick(1);
    expect(t.mods).toBe(0);
    expect(t.ev('carry.picked')).toEqual([]);
  });
  it('delivery at right trigger emits once and sets flag', () => {
    const t = setup(); t.pick(1);
    t.bus.emit('trigger.enter', { triggerId: 'chapel', actorId: 'player' });
    t.bus.emit('trigger.enter', { triggerId: 'chapel', actorId: 'player' });
    expect(t.ev('carry.delivered')).toEqual([{ carryId: 'villager-1', destinationId: 'chapel' }]);
    expect(t.flags.get('quest.m01.villager1.delivered')).toBe(true);
    expect(t.vis.get('villager-1')!.on).toBe(false);
    expect(t.mods).toBe(0);
    expect(t.enabled(1)).toBe(false);
  });
  it('wrong trigger or other actor does nothing', () => {
    const t = setup(); t.pick(1);
    t.bus.emit('trigger.enter', { triggerId: 'bakery', actorId: 'player' });
    t.bus.emit('trigger.enter', { triggerId: 'chapel', actorId: 'wraith' });
    expect(t.ev('carry.delivered')).toEqual([]);
    expect(t.mods).toBe(1);
  });
  it('delivery when not carrying does nothing', () => {
    const t = setup();
    t.bus.emit('trigger.enter', { triggerId: 'chapel', actorId: 'player' });
    expect(t.ev('carry.delivered')).toEqual([]);
    expect(t.flags.size).toBe(0);
  });
  it('three villagers delivered one by one', () => {
    const t = setup();
    for (const n of [1, 2, 3]) {
      t.pick(n);
      t.bus.emit('trigger.enter', { triggerId: 'chapel', actorId: 'player' });
      expect(t.mods).toBe(0);
    }
    expect(t.ev('carry.delivered').map((e) => e.carryId)).toEqual(['villager-1', 'villager-2', 'villager-3']);
  });
  it('dropped villager can be picked up again', () => {
    const t = setup(); t.pick(1);
    t.bus.emit('actor.died', { actorId: 'player' });
    t.pick(1);
    expect(t.mods).toBe(1);
    expect(t.ev('carry.picked').length).toBe(2);
  });
  it('dispose removes modifier and interactables, drops with dispose', () => {
    const t = setup(); t.pick(1);
    t.sys.dispose();
    expect(t.mods).toBe(0);
    expect(t.interactables.size).toBe(0);
    expect(t.ev('carry.dropped')[0].reason).toBe('dispose');
    t.bus.emit('actor.died', { actorId: 'player' });
    expect(t.ev('carry.dropped').length).toBe(1);
    t.sys.dispose();
  });
  it('missing home is skipped with one warning', () => {
    const t = setup({ missingHome: 'villager-2' });
    expect(t.interactables.has('pickup:villager-2')).toBe(false);
    t.bus.emit('save.loaded', {});
    t.bus.emit('save.loaded', {});
    expect(t.warns.length).toBe(1);
    expect(t.interactables.size).toBe(2);
  });
  it('modifier is never leaked across mixed sequences', () => {
    const t = setup();
    t.pick(1); t.bus.emit('damage.dealt', { targetId: 'player', outcome: 'hit' });
    t.pick(1); t.bus.emit('trigger.enter', { triggerId: 'chapel', actorId: 'player' });
    t.pick(2); t.bus.emit('save.loaded', {});
    t.pick(2); t.setBlock(true); t.sys.update(0); t.setBlock(false);
    expect(t.mods).toBe(0);
    t.pick(3); expect(t.mods).toBe(1);
    t.sys.dispose();
    expect(t.mods).toBe(0);
  });
});
