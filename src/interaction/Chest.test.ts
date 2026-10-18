import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { Chest } from './Chest';
import { InteractionSystem } from './InteractionSystem';
import { fakeActions, fakeContexts, makeWorld } from './testkit';

const DT = 1 / 60;
const loot = [{ itemId: 'bread', count: 2 }, { itemId: 'coin', count: 5 }];

function setup(opened?: boolean, l = loot, extra: { canOpen?: () => boolean; onRefused?: () => void } = {}) {
  const w = makeWorld();
  const actor = w.actors.spawn({ id: 'player', kind: 'player', team: 'player', maxHealth: 10 });
  const input = fakeActions();
  const interaction = new InteractionSystem({
    events: w.events, actions: () => input.actions, contexts: fakeContexts().stack,
    player: () => ({ actor, feet: new THREE.Vector3(), facingYaw: 0, moving: true }),
  });
  if (opened !== undefined) w.state.setFlag('chest.bakery-barrel.opened', opened);
  const object = new THREE.Object3D();
  object.position.set(0, 0, -1);
  const granted = vi.fn();
  w.events.on('loot.granted', granted);
  const chest = new Chest({ interaction, state: w.state, events: w.events }, { id: 'chest:bakery-barrel', object, loot: l, ...extra });
  const use = () => {
    input.release();
    input.press();
    interaction.fixedUpdate(DT);
    input.release();
    interaction.fixedUpdate(DT);
  };
  return { ...w, interaction, chest, granted, use, input };
}

describe('Chest veto (v0.5)', () => {
  it('a locked chest stays shut and focusable, calls onRefused, and opens once the veto passes', () => {
    let unlocked = false;
    const onRefused = vi.fn();
    const t = setup(undefined, loot, { canOpen: () => unlocked, onRefused });
    t.use();
    expect(onRefused).toHaveBeenCalledTimes(1);
    expect(t.chest.opened).toBe(false);
    expect(t.granted).not.toHaveBeenCalled();
    expect(t.state.getBool('chest.bakery-barrel.opened')).toBe(false);
    t.interaction.fixedUpdate(DT);
    expect(t.interaction.focus?.id).toBe('chest:bakery-barrel');
    unlocked = true;
    t.use();
    expect(t.chest.opened).toBe(true);
    expect(t.granted).toHaveBeenCalledTimes(1);
    expect(onRefused).toHaveBeenCalledTimes(1);
  });
  it('a throwing veto or onRefused keeps the chest shut without breaking the interaction', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const t = setup(undefined, loot, { canOpen: () => { throw new Error('boom'); }, onRefused: () => { throw new Error('bang'); } });
    expect(() => t.use()).not.toThrow();
    expect(t.chest.opened).toBe(false);
    expect(t.granted).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
  it('a non-boolean truthy veto result does not open (only true does)', () => {
    const t = setup(undefined, loot, { canOpen: (() => 1) as unknown as () => boolean });
    t.use();
    expect(t.chest.opened).toBe(false);
  });
});

describe('Chest', () => {
  it('opens once: grants loot, sets the flag, then is disabled', () => {
    const t = setup();
    expect(t.chest.opened).toBe(false);
    t.use();
    expect(t.chest.opened).toBe(true);
    expect(t.granted).toHaveBeenCalledTimes(1);
    expect(t.granted).toHaveBeenCalledWith({ sourceId: 'chest:bakery-barrel', items: loot });
    expect(t.state.getBool('chest.bakery-barrel.opened')).toBe(true);
    expect(t.interaction.focus).toBeNull();
    t.use();
    expect(t.granted).toHaveBeenCalledTimes(1);
  });
  it('payload is a copy: mutating the input or the event does not leak', () => {
    const src = [{ itemId: 'a', count: 1 }];
    const t = setup(undefined, src);
    src[0].count = 99;
    t.use();
    expect(t.granted.mock.calls[0][0].items).toEqual([{ itemId: 'a', count: 1 }]);
  });
  it('already opened at construction: empty, never grants', () => {
    const t = setup(true);
    expect(t.chest.opened).toBe(true);
    t.interaction.fixedUpdate(DT);
    expect(t.interaction.focus).toBeNull();
    t.use();
    expect(t.granted).not.toHaveBeenCalled();
  });
  it('save.loaded re-syncs from the flag (both directions)', () => {
    const t = setup();
    t.state.setFlag('chest.bakery-barrel.opened', true);
    t.events.emit('save.loaded', { slot: 's' });
    expect(t.chest.opened).toBe(true);
    t.use();
    expect(t.granted).not.toHaveBeenCalled();
    t.state.setFlag('chest.bakery-barrel.opened', false);
    t.events.emit('save.loaded', { slot: 's' });
    expect(t.chest.opened).toBe(false);
    t.use();
    expect(t.granted).toHaveBeenCalledTimes(1);
  });
  it.each([
    [[{ itemId: 'a', count: 0 }]],
    [[{ itemId: 'a', count: -1 }]],
    [[{ itemId: 'a', count: 1.5 }]],
    [[{ itemId: 'a', count: NaN }]],
    [[{ itemId: '', count: 1 }]],
  ])('invalid loot %j throws at construction', (bad) => {
    expect(() => setup(undefined, bad)).toThrow(/invalid loot/);
  });
  it('empty loot is allowed', () => {
    const t = setup(undefined, []);
    t.use();
    expect(t.granted).toHaveBeenCalledWith({ sourceId: 'chest:bakery-barrel', items: [] });
  });
  it('rejects a non-chest id and bad names', () => {
    const t = setup();
    const ctx = { interaction: t.interaction, state: t.state, events: t.events };
    expect(() => new Chest(ctx, { id: 'door:x', object: new THREE.Object3D(), loot })).toThrow(/chest:<name>/);
    expect(() => new Chest(ctx, { id: 'chest:a b', object: new THREE.Object3D(), loot })).toThrow();
  });
  it('dispose unregisters and stops listening', () => {
    const t = setup();
    t.chest.dispose();
    t.interaction.fixedUpdate(DT);
    expect(t.interaction.focus).toBeNull();
    t.state.setFlag('chest.bakery-barrel.opened', true);
    t.events.emit('save.loaded', { slot: 's' });
    expect(t.chest.opened).toBe(false);
  });
});
