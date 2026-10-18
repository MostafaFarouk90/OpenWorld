import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { GameSystem } from '../core/systems';
import { Door } from './Door';
import { InteractionSystem } from './InteractionSystem';
import { fakeActions, fakeContexts, makeWorld } from './testkit';

const DT = 1 / 60;

function setup(flagOpen?: boolean, optsExtra: Record<string, unknown> = {}) {
  const w = makeWorld();
  const actor = w.actors.spawn({ id: 'player', kind: 'player', team: 'player', maxHealth: 10 });
  const input = fakeActions();
  const interaction = new InteractionSystem({
    events: w.events,
    actions: () => input.actions,
    contexts: fakeContexts().stack,
    player: () => ({ actor, feet: new THREE.Vector3(0, 0, 0), facingYaw: 0, moving: true }),
    warn: () => {},
  });
  if (flagOpen !== undefined) w.state.setFlag('door.bakery.open', flagOpen);
  const pivot = new THREE.Object3D();
  pivot.position.set(0, 0, -1);
  const collider = { setEnabled: vi.fn() };
  const added: GameSystem[] = [];
  const systems = { add: (s: GameSystem) => (added.push(s), () => void added.splice(added.indexOf(s), 1)) };
  const door = new Door({ interaction, state: w.state, events: w.events, systems }, {
    id: 'door:bakery', pivot, openAngle: Math.PI / 2, seconds: 1, collider, ...optsExtra,
  });
  const use = () => {
    input.release();
    input.press();
    interaction.fixedUpdate(DT);
    input.release();
  };
  const anim = (n: number) => {
    for (let i = 0; i < n; i++) added[0].fixedUpdate!(DT, undefined as never);
  };
  return { ...w, interaction, pivot, collider, door, added, use, anim, input };
}

describe('Door', () => {
  it('starts closed, collider enabled, registers an animation-phase system', () => {
    const t = setup();
    expect(t.door.open).toBe(false);
    expect(t.pivot.rotation.y).toBe(0);
    expect(t.collider.setEnabled).toHaveBeenLastCalledWith(true);
    expect(t.added[0].fixedPhase).toBe('animation');
  });
  it('toggles open: flag set, collider off at once, animates over seconds', () => {
    const t = setup();
    t.use();
    expect(t.door.open).toBe(true);
    expect(t.state.getBool('door.bakery.open')).toBe(true);
    expect(t.collider.setEnabled).toHaveBeenLastCalledWith(false);
    t.anim(30);
    expect(t.pivot.rotation.y).toBeCloseTo(Math.PI / 4, 5);
    t.anim(40);
    expect(t.pivot.rotation.y).toBeCloseTo(Math.PI / 2, 10);
  });
  it('closes again and re-enables the collider only when fully closed', () => {
    const t = setup();
    t.use();
    t.anim(70);
    t.collider.setEnabled.mockClear();
    t.use();
    expect(t.door.open).toBe(false);
    expect(t.state.getBool('door.bakery.open')).toBe(false);
    t.anim(30);
    expect(t.collider.setEnabled).not.toHaveBeenCalled();
    t.anim(40);
    expect(t.pivot.rotation.y).toBe(0);
    expect(t.collider.setEnabled).toHaveBeenCalledWith(true);
  });
  it('reversing mid-swing continues from the current angle', () => {
    const t = setup();
    t.use();
    t.anim(30);
    t.use();
    t.anim(15);
    expect(t.pivot.rotation.y).toBeCloseTo(Math.PI / 8, 5);
  });
  it('locked door does nothing and prompts interact.locked', () => {
    let locked = true;
    const t = setup(undefined, { locked: () => locked });
    const emitted = vi.fn();
    t.events.onAny(emitted);
    t.interaction.fixedUpdate(DT);
    expect(t.interaction.focus?.promptKey).toBe('interact.locked');
    t.use();
    expect(t.door.open).toBe(false);
    expect(t.state.hasFlag('door.bakery.open')).toBe(false);
    expect(emitted.mock.calls.filter(([type]) => type !== 'interact')).toEqual([]);
    locked = false;
    t.interaction.fixedUpdate(DT);
    expect(t.interaction.focus?.promptKey).toBe('interact.door');
    t.use();
    expect(t.door.open).toBe(true);
  });
  it('reads an open flag at construction: snapped open, collider off', () => {
    const t = setup(true);
    expect(t.door.open).toBe(true);
    expect(t.pivot.rotation.y).toBeCloseTo(Math.PI / 2, 10);
    expect(t.collider.setEnabled).toHaveBeenLastCalledWith(false);
  });
  it('save.loaded snaps to the saved state without animating', () => {
    const t = setup();
    t.use();
    t.state.setFlag('door.bakery.open', false);
    t.events.emit('save.loaded', { slot: 'a' });
    expect(t.door.open).toBe(false);
    expect(t.pivot.rotation.y).toBe(0);
    expect(t.collider.setEnabled).toHaveBeenLastCalledWith(true);
    t.state.setFlag('door.bakery.open', true);
    t.events.emit('save.loaded', { slot: 'a' });
    expect(t.pivot.rotation.y).toBeCloseTo(Math.PI / 2, 10);
    expect(t.collider.setEnabled).toHaveBeenLastCalledWith(false);
  });
  it('works without ctx.systems via fixedUpdate, and without a collider', () => {
    const w = makeWorld();
    const interaction = new InteractionSystem({
      events: w.events, actions: () => fakeActions().actions, contexts: fakeContexts().stack,
      player: () => ({ actor: w.actors.spawn({ kind: 'player', team: 'player', maxHealth: 1 }), feet: new THREE.Vector3(), facingYaw: 0, moving: true }),
    });
    const pivot = new THREE.Object3D();
    const door = new Door({ interaction, state: w.state, events: w.events }, { id: 'door:x', pivot, openAngle: 1, seconds: 0.5 });
    w.state.setFlag('door.x.open', true);
    w.events.emit('save.loaded', { slot: 's' });
    expect(pivot.rotation.y).toBe(1);
    door.fixedUpdate(DT);
  });
  it('seconds 0 opens instantly on the next update', () => {
    const t = setup(undefined, { seconds: 0 });
    t.use();
    t.anim(1);
    expect(t.pivot.rotation.y).toBeCloseTo(Math.PI / 2, 10);
  });
  it('dispose unregisters the interactable and event listener, and allows re-registering the id', () => {
    const t = setup();
    t.door.dispose();
    t.interaction.fixedUpdate(DT);
    expect(t.interaction.focus).toBeNull();
    t.state.setFlag('door.bakery.open', true);
    t.events.emit('save.loaded', { slot: 'a' });
    expect(t.door.open).toBe(false);
    expect(t.added).toHaveLength(0);
  });
  it('rejects bad ids and options', () => {
    const t = setup();
    const ctx = { interaction: t.interaction, state: t.state, events: t.events };
    const o = { pivot: new THREE.Object3D(), openAngle: 1, seconds: 1 };
    expect(() => new Door(ctx, { ...o, id: 'chest:x' })).toThrow(/door:<name>/);
    expect(() => new Door(ctx, { ...o, id: 'door:bad name' })).toThrow();
    expect(() => new Door(ctx, { ...o, id: 'door:y', openAngle: NaN })).toThrow();
    expect(() => new Door(ctx, { ...o, id: 'door:y', seconds: -1 })).toThrow();
  });
  it('duplicate door id throws', () => {
    const t = setup();
    expect(() => new Door({ interaction: t.interaction, state: t.state, events: t.events }, {
      id: 'door:bakery', pivot: new THREE.Object3D(), openAngle: 1, seconds: 1,
    })).toThrow(/duplicate/);
  });
});
