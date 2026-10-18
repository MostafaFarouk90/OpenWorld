import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServiceMap } from '../vfx/ports';
import { BURN, RALLY, SURGE } from '../vfx/tuning';
import { Burn } from './Burn';
import { SpellCaster } from './SpellCaster';
import { registerRally, registerSurge } from './SurgeAndRally';
import { FakeActor, makeWorld, type World } from './testHost';

const DT = 1 / 60;
let w: World;
let caster: SpellCaster;
let burn: Burn;
let services: Partial<ServiceMap>;
const svc = () => ({ provide: () => () => undefined, get: (k: keyof ServiceMap) => services[k] }) as never;
const deps = () => ({ damage: w.damage, clock: w.clock, services: svc(), burn });
const finish = (s = 3) => { for (let i = 0; i < s / DT; i++) caster.update(DT); };

beforeEach(() => {
  w = makeWorld();
  caster = new SpellCaster(w.host);
  burn = new Burn();
  services = {};
  w.actors.player.health = 50;
});

describe('Surge', () => {
  it('hits only hostiles in range, heals, adds burn, one apply per target with direction', () => {
    registerSurge(w, caster, deps());
    w.actors.add(new FakeActor('a', 'hostile', 3, 0));
    w.actors.add(new FakeActor('b', 'hostile', 0, -5));
    w.actors.add(new FakeActor('far', 'hostile', 20, 0));
    w.actors.add(new FakeActor('ally', 'ally', 1, 1));
    w.actors.add(new FakeActor('npc', 'neutral', 1, 0));
    w.actors.add(new FakeActor('dead', 'hostile', 2, 0)).kill();
    expect(caster.cast('player', SURGE.spellId).ok).toBe(true);
    finish();
    expect(w.damage.applied.map((r) => r.targetId).sort()).toEqual(['a', 'b']);
    const a = w.damage.applied.find((r) => r.targetId === 'a')!;
    expect(a).toMatchObject({ attackerId: 'player', amount: SURGE.damage, poise: SURGE.poise, kind: 'spell', attackId: 'heartshard-surge' });
    expect(a.direction).toEqual({ x: 1, y: 0, z: 0 });
    expect(a.point).toMatchObject({ x: 3, z: 0 });
    const b = w.damage.applied.find((r) => r.targetId === 'b')!;
    expect(b.direction!.z).toBe(-1);
    expect(w.damage.healed).toEqual([{ id: 'player', amount: 100 * SURGE.healFraction }]);
    expect(w.actors.player.health).toBe(55);
    expect(burn.value).toBe(BURN.surgeGain);
    expect(w.clock.hitStops).toEqual([SURGE.hitStop]);
    expect(w.ember.value).toBe(100 - SURGE.emberCost);
  });
  it('blaze radius is 8 m and cinder 10 m with cinder poise', () => {
    registerSurge(w, caster, deps());
    w.actors.add(new FakeActor('seven', 'hostile', 7, 0));
    w.actors.add(new FakeActor('nine', 'hostile', 9, 0));
    w.actors.add(new FakeActor('eleven', 'hostile', 11, 0));
    burn.add(40, 't');
    caster.cast('player', SURGE.spellId);
    finish();
    expect(w.damage.applied.map((r) => r.targetId)).toEqual(['seven']);
    burn.clear('x'); burn.add(75, 't');
    w.damage.applied.length = 0;
    w.ember.restore(100);
    finish(7);
    caster.cast('player', SURGE.spellId);
    finish();
    expect(w.damage.applied.map((r) => r.targetId)).toEqual(['seven', 'nine']);
    expect(w.damage.applied[0].poise).toBe(SURGE.cinderPoise);
  });
  it('tolerates missing vfx/audio and uses them when present', () => {
    registerSurge(w, caster, deps());
    caster.cast('player', SURGE.spellId);
    finish();
    expect(burn.value).toBe(25);
    const play = vi.fn();
    const spawnEffect = vi.fn();
    const pulseScreen = vi.fn();
    const shake = vi.fn();
    services = { audio: { play }, vfx: { spawnEffect, pulseScreen, shake } as never };
    burn.add(15, 't'); // blaze
    finish(7);
    caster.cast('player', SURGE.spellId);
    expect(play).toHaveBeenCalledWith('sfx.surge.charge');
    finish();
    expect(play.mock.calls.map((c) => c[0])).toEqual(['sfx.surge.charge', 'sfx.surge.release']);
    expect(spawnEffect).toHaveBeenCalledWith('surge', { position: { x: 0, y: 0, z: 0 }, scale: 8 / 6 }, { zone: 'blaze' });
    expect(pulseScreen).toHaveBeenCalled();
    expect(shake).toHaveBeenCalled();
  });
  it('is still castable at Burn 100', () => {
    registerSurge(w, caster, deps());
    burn.add(100, 't');
    expect(caster.cast('player', SURGE.spellId).ok).toBe(true);
    finish();
    expect(burn.value).toBe(100);
  });
  it('overlapping target gets a facing-based direction; unregister removes the spell', () => {
    const off = registerSurge(w, caster, deps());
    w.actors.add(new FakeActor('onTop', 'hostile', 0, 0));
    w.player.facingYaw = Math.PI / 2;
    caster.cast('player', SURGE.spellId);
    finish();
    expect(w.damage.applied[0].direction!.x).toBeCloseTo(1);
    off();
    expect(caster.def(SURGE.spellId)).toBeUndefined();
  });
});

describe('Rally', () => {
  it('restores 10% stamina to the caster and allies in range only', () => {
    registerRally(w, caster, { services: svc() });
    const near = w.actors.add(new FakeActor('near', 'ally', 5, 0));
    const far = w.actors.add(new FakeActor('far', 'ally', 12, 0));
    const foe = w.actors.add(new FakeActor('foe', 'hostile', 1, 0));
    const dead = w.actors.add(new FakeActor('dead', 'ally', 1, 1));
    dead.kill();
    expect(caster.cast('player', 'rally-cry').ok).toBe(true);
    finish();
    expect(w.actors.player.stamina).toBe(10);
    expect(near.stamina).toBe(10);
    expect([far.stamina, foe.stamina, dead.stamina]).toEqual([0, 0, 0]);
    expect(w.ember.value).toBe(100 - RALLY.emberCost);
  });
  it('registers and unregisters the abilities handler, reports the trigger, plays vfx and sound', () => {
    const off = vi.fn();
    let handler: ((c: { casterId: string }) => boolean) | undefined;
    const reportTrigger = vi.fn();
    const play = vi.fn();
    const spawnEffect = vi.fn();
    services = {
      abilities: { registerHandler: (id, h) => { expect(id).toBe(RALLY.skillId); handler = h; return off; }, reportTrigger },
      audio: { play },
      vfx: { spawnEffect } as never,
    };
    const reg = registerRally(w, caster, { services: svc() });
    expect(handler!({ casterId: 'player' })).toBe(true);
    expect(handler!({ casterId: 'player' })).toBe(false); // busy
    finish();
    expect(reportTrigger).toHaveBeenCalledWith(RALLY.skillId);
    expect(play.mock.calls[0][0]).toBe('sfx.rally');
    expect(spawnEffect.mock.calls[0][0]).toBe('skill-q');
    reg.dispose();
    expect(off).toHaveBeenCalledTimes(1);
    expect(caster.def('rally-cry')).toBeUndefined();
  });
  it('is castable without the abilities service and binds it later', () => {
    const reg = registerRally(w, caster, { services: svc() });
    expect(reg.bindAbilities()).toBe(false);
    expect(caster.cast('player', 'rally-cry').ok).toBe(true);
    finish();
    const registerHandler = vi.fn(() => () => undefined);
    services = { abilities: { registerHandler, reportTrigger: vi.fn() } };
    expect(reg.bindAbilities()).toBe(true);
    reg.bindAbilities();
    expect(registerHandler).toHaveBeenCalledTimes(1);
  });
});
