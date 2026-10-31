import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BURN, SURGE } from '../vfx/tuning';
import { Burn } from './Burn';
import { SpellCaster } from './SpellCaster';
import { RALLY_DEF } from './spellDefs';
import { registerRally, registerSurge } from './SurgeAndRally';
import { RALLY_FX, RALLY_SKILL_ID } from './tuning';
import { FakeActor, makeWorld, type World } from './testHost';

const DT = 1 / 60;
let w: World;
let caster: SpellCaster;
let burn: Burn;
let services: Record<string, any>;
const svc = () => ({ provide: () => () => undefined, get: (k: string) => services[k] }) as never;
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
  it('an unknown sound key does not break the cast', () => {
    const spawnEffect = vi.fn();
    services = { audio: { play: () => { throw new Error('Unknown sound'); }, playAt: () => { throw new Error('Unknown sound'); } }, vfx: { spawnEffect, pulseScreen: vi.fn(), shake: vi.fn() } as never };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    registerSurge(w, caster, deps());
    expect(caster.cast('player', SURGE.spellId).ok).toBe(true);
    expect(() => finish()).not.toThrow();
    expect(spawnEffect).toHaveBeenCalled();
    warn.mockRestore();
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
    services = { audio: { play, playAt: play }, vfx: { spawnEffect, pulseScreen, shake } as never };
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
    // Forward is (-sin yaw, -cos yaw): facing yaw pi/2 looks along -X.
    expect(w.damage.applied[0].direction!.x).toBeCloseTo(-1);
    expect(w.damage.applied[0].direction!.z).toBeCloseTo(0);
    off();
    expect(caster.def(SURGE.spellId)).toBeUndefined();
  });
  it('a foe on her feet is pushed where she faces: yaw 0 is -Z', () => {
    registerSurge(w, caster, deps());
    w.actors.add(new FakeActor('onTop', 'hostile', 0, 0));
    w.player.facingYaw = 0;
    caster.cast('player', SURGE.spellId);
    finish();
    expect(w.damage.applied[0].direction!.x).toBeCloseTo(0);
    expect(w.damage.applied[0].direction!.z).toBeCloseTo(-1);
  });
});

describe('Surge edges', () => {
  it('hits at exactly 6.0 m and misses at 6.01 m', () => {
    registerSurge(w, caster, deps());
    w.actors.add(new FakeActor('edge', 'hostile', 6, 0));
    w.actors.add(new FakeActor('out', 'hostile', 0, 6.01));
    caster.cast('player', SURGE.spellId);
    finish();
    expect(w.damage.applied.map((r) => r.targetId)).toEqual(['edge']);
  });
  it('leaves neutral dummies and actors that die before release untouched', () => {
    registerSurge(w, caster, deps());
    w.actors.add(new FakeActor('dummy', 'neutral', 1, 0));
    const doomed = w.actors.add(new FakeActor('doomed', 'hostile', 2, 0));
    const live = w.actors.add(new FakeActor('live', 'hostile', 3, 0));
    caster.cast('player', SURGE.spellId);
    doomed.kill();
    finish();
    expect(w.damage.applied.map((r) => r.targetId)).toEqual([live.id]);
  });
  it('G and Q requested on the same tick: the second returns busy', () => {
    registerSurge(w, caster, deps());
    registerRally(w, caster, { services: svc() });
    expect(caster.cast('player', SURGE.spellId).ok).toBe(true);
    expect(caster.cast('player', 'rally-cry')).toEqual({ ok: false, reason: 'busy' });
    finish();
    expect(w.ember.value).toBe(100 - SURGE.emberCost);
  });
  it('is refused while the player is attacking', () => {
    registerSurge(w, caster, deps());
    w.host.busy = true;
    expect(caster.cast('player', SURGE.spellId)).toEqual({ ok: false, reason: 'busy' });
    expect(w.ember.value).toBe(100);
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
    expect(w.ember.value).toBe(100); // thread 5 owns the Ember cost
  });
  it('plays vfx (radius param, scale 1) and sound, and does not call reportTrigger', () => {
    const play = vi.fn();
    const spawnEffect = vi.fn();
    const reportTrigger = vi.fn();
    services = { audio: { play, playAt: play }, vfx: { spawnEffect } as never, abilities: { registerHandler: () => ({ ok: true, dispose: () => undefined }), reportTrigger } as never };
    const buffs: unknown[] = [];
    (w.host.events as { on(t: string, f: (p: unknown) => void): unknown }).on('buff.applied', (p) => buffs.push(p));
    registerRally(w, caster, { services: svc() });
    caster.cast('player', 'rally-cry');
    finish();
    expect(play.mock.calls[0][0]).toBe('sfx.rally');
    expect(spawnEffect).toHaveBeenCalledTimes(1);
    expect(spawnEffect).toHaveBeenCalledWith('skill-q', { position: { x: 0, y: 0, z: 0 }, scale: 1 }, { radius: 8, color: RALLY_FX.color });
    expect(reportTrigger).not.toHaveBeenCalled();
    expect(buffs).toEqual([{ id: 'knight.rallyCry', nameKey: 'skill.knight.rallyCry.name', seconds: 3 }]);
  });
  it('the abilities handler casts for the Actor, is free, refuses with the caster reason, and unregisters on dispose', () => {
    const off = vi.fn();
    let handler: ((a: { skillId: string; slot: number; caster: { id: string } | undefined; ctx?: unknown }) => unknown) | undefined;
    services = { abilities: { registerHandler: (id: string, h: typeof handler) => { expect(id).toBe('knight.rallyCry'); expect(id).toBe(RALLY_SKILL_ID); handler = h; return { ok: true, dispose: off }; } } as never };
    const reg = registerRally(w, caster, { services: svc() });
    expect(RALLY_DEF.emberCost).toBe(0);
    expect(RALLY_DEF.cooldown).toBe(0);
    const args = { skillId: RALLY_SKILL_ID, slot: 0, caster: w.actors.player, ctx: {} };
    expect(handler!(args)).toEqual({ ok: true });
    expect(w.ember.value).toBe(100);
    expect(handler!(args)).toEqual({ ok: false, reason: 'busy' });
    finish();
    expect(caster.cooldown('rally-cry')).toBe(0); // thread 5 starts the real cooldown
    expect(w.ember.value).toBe(100);
    // falls back to the player id without a caster
    expect(handler!({ ...args, caster: undefined })).toEqual({ ok: true });
    finish();
    w.host.staggered = true;
    expect(handler!(args)).toEqual({ ok: false, reason: 'staggered' });
    w.host.staggered = false;
    w.host.blocked = true;
    expect(handler!(args)).toEqual({ ok: false, reason: 'blocked' });
    reg.dispose();
    expect(off).toHaveBeenCalledTimes(1);
    expect(caster.def('rally-cry')).toBeUndefined();
  });
  it('a second registration throwing is logged once and not retried; a direct cast stays free', () => {
    const registerHandler = vi.fn(() => ({ ok: false as const, reason: 'duplicate' }));
    services = { abilities: { registerHandler } as never };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const reg = registerRally(w, caster, { services: svc() });
    expect(reg.bindAbilities()).toBe(false);
    expect(reg.bindAbilities()).toBe(false);
    expect(registerHandler).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(caster.cast('player', 'rally-cry').ok).toBe(true);
    expect(w.ember.value).toBe(100);
    reg.dispose();
    warn.mockRestore();
  });
  it('is castable without the abilities service and binds it later', () => {
    const reg = registerRally(w, caster, { services: svc() });
    expect(reg.bindAbilities()).toBe(false);
    expect(caster.cast('player', 'rally-cry').ok).toBe(true);
    finish();
    const registerHandler = vi.fn(() => ({ ok: true as const, dispose: () => undefined }));
    services = { abilities: { registerHandler } as never };
    expect(reg.bindAbilities()).toBe(true);
    reg.bindAbilities();
    expect(registerHandler).toHaveBeenCalledTimes(1);
  });
});

describe('Surge forms', () => {
  it('the Knight form is built in; registration validates and refuses duplicates', async () => {
    const { createSurgeForms } = await import('./SurgeAndRally');
    const forms = createSurgeForms();
    expect(forms.has('knight', 'warm') && forms.has('knight', 'blaze') && forms.has('knight', 'cinder')).toBe(true);
    const impl = vi.fn();
    expect(forms.register('warden', 'blaze', impl).ok).toBe(true);
    expect(forms.register('warden', 'blaze', impl)).toEqual({ ok: false, reason: 'duplicate' });
    expect(forms.register('', 'warm', impl)).toEqual({ ok: false, reason: 'bad-class' });
    expect(forms.register('x', 'lava' as never, impl)).toEqual({ ok: false, reason: 'bad-zone' });
    expect(forms.register('x', 'warm', null as never)).toEqual({ ok: false, reason: 'bad-impl' });
  });
  it('dispose frees the slot; an unknown class plays the Knight form with one warning', async () => {
    const { createSurgeForms } = await import('./SurgeAndRally');
    const forms = createSurgeForms();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const r = forms.register('mage', 'warm', vi.fn());
    if (!r.ok) throw new Error('register');
    r.dispose();
    expect(forms.has('mage', 'warm')).toBe(false);
    expect(forms.resolve('mage', 'warm')).toBe(forms.resolve('knight', 'warm'));
    forms.resolve('mage', 'warm');
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
  it('the cast runs the class form with the zone numbers; heal and Burn stay shared', async () => {
    const { createSurgeForms } = await import('./SurgeAndRally');
    const forms = createSurgeForms();
    const impl = vi.fn();
    forms.register('warden', 'blaze', impl);
    burn.add(45, 't');
    const useShard = vi.fn((g: number, s: string) => burn.useShard(g, s));
    registerSurge(w, caster, { ...deps(), forms, classId: () => 'warden', useShard });
    w.actors.add(new FakeActor('a', 'hostile', 3, 0));
    caster.cast('player', SURGE.spellId);
    finish();
    expect(impl).toHaveBeenCalledWith(expect.objectContaining({ casterId: 'player', zone: 'blaze', radius: 8, poise: SURGE.poise }));
    expect(w.damage.applied).toHaveLength(0); // the Knight's damage loop did not run
    expect(useShard).toHaveBeenCalledWith(BURN.surgeGain, 'surge');
    expect(w.damage.healed).toHaveLength(1);
  });
  it('a form receives services and the clock, and suppressRing skips only the shared ring', async () => {
    const { createSurgeForms } = await import('./SurgeAndRally');
    const spawnEffect = vi.fn();
    const pulseScreen = vi.fn();
    const shake = vi.fn();
    services = { vfx: { spawnEffect, pulseScreen, shake } as never };
    const forms = createSurgeForms();
    const seen: Array<{ services: unknown; clock: unknown }> = [];
    forms.register('warden', 'warm', (c) => { seen.push({ services: c.services, clock: c.clock }); c.suppressRing(); });
    registerSurge(w, caster, { ...deps(), forms, classId: () => 'warden' });
    caster.cast('player', SURGE.spellId);
    finish();
    expect(seen).toHaveLength(1);
    expect((seen[0]!.services as { get(k: string): unknown }).get('vfx')).toBeDefined();
    expect(seen[0]!.clock).toBe(w.clock);
    expect(spawnEffect).not.toHaveBeenCalledWith('surge', expect.anything(), expect.anything());
    expect(pulseScreen).toHaveBeenCalled();
    expect(shake).toHaveBeenCalled();
    expect(w.clock.hitStops).toEqual([SURGE.hitStop]);
  });
  it('the ring is drawn when the form does not suppress it', async () => {
    const { createSurgeForms } = await import('./SurgeAndRally');
    const spawnEffect = vi.fn();
    services = { vfx: { spawnEffect, pulseScreen: vi.fn(), shake: vi.fn() } as never };
    registerSurge(w, caster, { ...deps(), forms: createSurgeForms(), classId: () => 'knight' });
    caster.cast('player', SURGE.spellId);
    finish();
    expect(spawnEffect).toHaveBeenCalledWith('surge', expect.anything(), expect.anything());
  });
  it('no class (null) plays as the Knight; a throwing-free missing form just skips the damage', async () => {
    const { createSurgeForms } = await import('./SurgeAndRally');
    registerSurge(w, caster, { ...deps(), forms: createSurgeForms(), classId: () => null });
    w.actors.add(new FakeActor('a', 'hostile', 3, 0));
    caster.cast('player', SURGE.spellId);
    finish();
    expect(w.damage.applied.map((r) => r.targetId)).toEqual(['a']);
  });
});
