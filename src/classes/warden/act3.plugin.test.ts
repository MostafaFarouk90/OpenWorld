import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COMBAT } from '../../config/constants';
import '../../hud/events';
import { Abilities } from '../../progression/abilities';
import { registerClassStats } from '../../progression/classStats';
import { Progression } from '../../progression/Progression';
import { getSkill, resetClassSkills } from '../../progression/skills';
import { xpForLevel } from '../../progression/tuning';
import { makeCtx, FakeActor } from '../../spells/testHost';
import { WARDEN_T4_EFFECT_IDS, WARDEN_T4_PARTICLES } from '../../vfx/act3Skills/warden';
import { WARDEN_SKILLS } from './skills';
import { EARTHROOT, FRENZIED_HEARTH, SKILL_IDS, SKULLSPLITTER } from './tuning';
import wardenAct3Plugin from './act3.plugin';
import wardenPlugin from './warden.plugin';

type Mod = (req: any, target: any, attacker: any) => void;

function rig() {
  const f = makeCtx();
  (f.ctx as any).strings = { register: vi.fn() };
  const modifiers = new Map<string, { fn: Mod; order: number }>();
  (f.world.damage as any).addModifier = (id: string, fn: Mod, order: number) => {
    if (modifiers.has(id)) throw new Error(`duplicate modifier "${id}"`);
    modifiers.set(id, { fn, order });
    return () => void modifiers.delete(id);
  };
  const actor = f.world.actors.player;
  actor.maxHealth = 150;
  actor.health = 150;
  const flags = new Map<string, unknown>([
    ['story.gate.a3', true],
    ['trainer.warden.masterBook', true],
  ]);
  const progression = new Progression({
    emit: (type, payload) => f.world.events.emit(type as never, payload as never),
    actor: () => actor as never,
    flags: { get: (k) => flags.get(k), set: (k, v) => void flags.set(k, v) },
  });
  registerClassStats('warden', { health: 150, healthPerLevel: 14, stamina: 90, ember: 100 });
  progression.setClass('warden');
  const ember = { value: 100 };
  const abilities = new Abilities({
    progression,
    spells: () => ({ burn: 0, ember: ember.value, maxEmber: 100, spendEmber: (n: number) => ((ember.value -= n), true) }),
    caster: () => actor as never,
    ctx: () => f.ctx,
    emit: (type, payload) => f.world.events.emit(type as never, payload as never),
  });
  const verbs = { busy: false, staggered: false };
  const controller = { activeAttack: () => null, playOneShot: vi.fn(() => true), currentAction: null as string | null };
  f.services.progression = progression;
  f.services.abilities = abilities;
  f.services.combatVerbs = {
    get busy() { return verbs.busy; },
    get staggered() { return verbs.staggered; },
    registerAttackSet: () => ({ ok: true, dispose: () => {} }),
    holdForcedMove: () => {},
  };
  f.services.status = { apply: vi.fn(() => true), list: vi.fn(() => []) };
  const spawned: Array<{ id: string; params: any; stopped: boolean }> = [];
  f.services.vfx = {
    spawnEffect: (id: string, _t: unknown, params: any) => {
      const h = { id, params, stopped: false, stop() { h.stopped = true; } };
      spawned.push(h);
      return h;
    },
  };
  (f.world.player as any).avatar = { root: new THREE.Object3D(), controller };
  return { f, progression, abilities, ember, verbs, controller, modifiers, spawned, actor };
}

beforeEach(() => {
  resetClassSkills();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  wardenAct3Plugin.dispose?.();
  wardenPlugin.dispose?.();
  resetClassSkills();
  vi.restoreAllMocks();
});

const CHAINS = {
  hewer: ['cleavingSwing', 'deepWound', 'whirlingHew', 'skullsplitter'],
  stonehide: ['thickSkin', 'boulderShoulder', 'gritTeeth', 'earthroot'],
  howlcaller: ['warHowl', 'emberRage', 'bloodChant', 'frenziedHearth'],
} as const;
/** Boots both plugins and learns one branch up to its tier 4 skill (the gate flags are set in rig()). */
function boot(r: ReturnType<typeof rig>, branch: keyof typeof CHAINS) {
  wardenPlugin.setup(r.f.ctx);
  wardenAct3Plugin.setup(r.f.ctx);
  r.progression.grantXp(xpForLevel(30), 'test');
  for (const name of CHAINS[branch]) expect(r.progression.learn(`warden.${name}`), name).toEqual({ ok: true });
}

describe('tier 4 rows', () => {
  it('Skullsplitter and Earthroot carry cooldown and Ember; Frenzied Hearth is a passive without a cost', () => {
    expect(WARDEN_SKILLS.find((s) => s.id === SKILL_IDS.skullsplitter)).toMatchObject({ cooldown: 10, emberCost: 20, kind: 'active', tier: 4 });
    expect(WARDEN_SKILLS.find((s) => s.id === SKILL_IDS.earthroot)).toMatchObject({ cooldown: 20, emberCost: 20, kind: 'active', tier: 4 });
    const p = WARDEN_SKILLS.find((s) => s.id === SKILL_IDS.frenziedHearth)!;
    expect(p).toMatchObject({ kind: 'passive', tier: 4 });
    expect(p.emberCost).toBeUndefined();
    expect(p.cooldown).toBeUndefined();
  });

  it('are refused before the Act 3 gate and learnable with both flags', () => {
    const r = rig();
    wardenPlugin.setup(r.f.ctx);
    r.progression.grantXp(xpForLevel(30), 'x');
    for (const name of CHAINS.hewer.slice(0, 3)) expect(r.progression.learn(`warden.${name}`)).toEqual({ ok: true });
    (r.progression as any).deps.flags.set('story.gate.a3', undefined as never);
    expect(r.progression.canLearn(SKILL_IDS.skullsplitter)).toEqual({ ok: false, reason: 'master', textKey: 'hud.skills.act3' });
    expect(getSkill(SKILL_IDS.skullsplitter)).toBeTruthy();
  });
});

describe('plugin wiring', () => {
  it('registers two modifiers at the stated orders, setup twice is fine, dispose releases everything', () => {
    const r = rig();
    wardenPlugin.setup(r.f.ctx);
    wardenAct3Plugin.setup(r.f.ctx);
    const mine = [EARTHROOT.modifierId, FRENZIED_HEARTH.modifierId];
    for (const id of mine) expect(r.modifiers.has(id), id).toBe(true);
    expect(r.modifiers.get(EARTHROOT.modifierId)!.order).toBe(-30);
    expect(r.modifiers.get(FRENZIED_HEARTH.modifierId)!.order).toBe(10);
    expect(() => wardenAct3Plugin.setup(r.f.ctx)).not.toThrow();
    wardenAct3Plugin.dispose?.();
    for (const id of mine) expect(r.modifiers.has(id), id).toBe(false);
    expect(r.f.systems.filter((s) => (s as any).id === 'warden.act3.fixed')).toEqual([]);
    expect((console.warn as any).mock.calls.filter((c: string[]) => /Skullsplitter|Earthroot/.test(String(c[0])))).toEqual([]);
  });

  it('loads without the abilities, status and vfx services', () => {
    const r = rig();
    delete r.f.services.abilities;
    delete r.f.services.vfx;
    wardenPlugin.setup(r.f.ctx);
    expect(() => wardenAct3Plugin.setup(r.f.ctx)).not.toThrow();
    expect(() => r.f.tick(3)).not.toThrow();
  });
});

describe('Skullsplitter through the abilities service', () => {
  it('Ember 20, cooldown 10, the chop clip, a hit on the nearest foe in the arc, a refusal costs nothing', () => {
    const r = rig();
    boot(r, 'hewer');
    r.progression.assign(0, SKILL_IDS.skullsplitter);
    r.f.world.actors.add(new FakeActor('wolf', 'hostile', 0, -1));
    r.verbs.busy = true;
    expect(r.abilities.use(0)).toEqual({ ok: false, reason: 'handler-failed', detail: 'busy' });
    expect(r.ember.value).toBe(100);
    r.verbs.busy = false;
    expect(r.abilities.use(0)).toEqual({ ok: true });
    expect(r.ember.value).toBe(100 - SKULLSPLITTER.emberCost);
    expect(r.abilities.cooldown(0).remaining).toBeCloseTo(10);
    expect(r.controller.playOneShot).toHaveBeenCalledWith(SKULLSPLITTER.clip, { lockMove: true });
    r.f.tick(SKULLSPLITTER.ticks);
    expect(r.f.world.damage.applied).toHaveLength(1);
    expect(r.f.world.damage.applied[0]).toMatchObject({ targetId: 'wolf', poise: 40, attackId: SKULLSPLITTER.attackId });
    expect(r.spawned.map((s) => s.id)).toEqual(['skullsplitter']);
    expect(r.spawned[0].params.staggered).toBe(false);
    expect(r.abilities.use(0)).toMatchObject({ ok: false });
  });

  it('doubles on a foe that an actor.staggered flagged a moment ago', () => {
    const r = rig();
    boot(r, 'hewer');
    r.progression.assign(0, SKILL_IDS.skullsplitter);
    r.f.world.actors.add(new FakeActor('wolf', 'hostile', 0, -1));
    r.f.world.events.emit('actor.staggered' as never, { actorId: 'wolf', byId: 'player' } as never);
    r.abilities.use(0);
    r.f.tick(SKULLSPLITTER.ticks);
    expect(r.f.world.damage.applied[0].amount).toBeCloseTo(COMBAT.baseDamage * 1.6 * 2);
    expect(r.spawned[0].params.staggered).toBe(true);
  });

  it('doubles on a foe whose enemies-service view state is stagger', () => {
    const r = rig();
    boot(r, 'hewer');
    r.progression.assign(0, SKILL_IDS.skullsplitter);
    r.f.world.actors.add(new FakeActor('boar', 'hostile', 0, -1));
    r.f.services.enemies = { view: (id: string) => (id === 'boar' ? { state: 'stagger' } : undefined) };
    r.abilities.use(0);
    r.f.tick(SKULLSPLITTER.ticks);
    expect(r.f.world.damage.applied[0].amount).toBeCloseTo(COMBAT.baseDamage * 1.6 * 2);
  });

  it('a dodge or stagger cancels the chop, class change clears it', () => {
    const r = rig();
    boot(r, 'hewer');
    r.progression.assign(0, SKILL_IDS.skullsplitter);
    r.f.world.actors.add(new FakeActor('wolf', 'hostile', 0, -1));
    r.abilities.use(0);
    r.f.tick(3);
    r.controller.currentAction = 'dodge';
    r.f.tick(SKULLSPLITTER.ticks);
    expect(r.f.world.damage.applied).toEqual([]);
  });
});

describe('Earthroot through the abilities service', () => {
  it('Ember 20, cooldown 20, locks the move under its own source, strips for 5 s, ends on expiry', () => {
    const r = rig();
    boot(r, 'stonehide');
    r.progression.assign(0, SKILL_IDS.earthroot);
    expect(r.abilities.use(0)).toEqual({ ok: true });
    expect(r.ember.value).toBe(100 - EARTHROOT.emberCost);
    expect(r.abilities.cooldown(0).remaining).toBeCloseTo(20);
    const mods = [...(r.f.world.player as any).modifiers.values()];
    expect(mods).toEqual([{ source: 'warden.earthroot', mod: { lockMove: true } }]);
    expect(r.spawned.map((s) => s.id)).toEqual(['earthroot']);
    expect(r.spawned[0].params.seconds).toBe(5);
    r.f.tick(60 * 5 + 2);
    expect((r.f.world.player as any).modifiers.size).toBe(0);
    expect(r.spawned[0].stopped).toBe(true);
  });

  it('a dodge ends it early; busy and staggered refuse without cost', () => {
    const r = rig();
    boot(r, 'stonehide');
    r.progression.assign(0, SKILL_IDS.earthroot);
    r.verbs.staggered = true;
    expect(r.abilities.use(0)).toMatchObject({ ok: false, detail: 'staggered' });
    expect(r.ember.value).toBe(100);
    r.verbs.staggered = false;
    r.abilities.use(0);
    r.f.tick(30);
    expect((r.f.world.player as any).modifiers.size).toBe(1);
    r.controller.currentAction = 'dodge';
    r.f.tick(1);
    expect((r.f.world.player as any).modifiers.size).toBe(0);
    expect(r.spawned[0].stopped).toBe(true);
  });

  it('the modifier zeroes poise; a hostile hit taken releases the shockwave through damage.apply and its effect', () => {
    const r = rig();
    boot(r, 'stonehide');
    r.progression.assign(0, SKILL_IDS.earthroot);
    r.f.world.actors.add(new FakeActor('wolf', 'hostile', 1, 0));
    r.abilities.use(0);
    const q = { poise: 30 };
    r.modifiers.get(EARTHROOT.modifierId)!.fn(q, { id: 'player' }, null);
    expect(q.poise).toBe(0);
    r.f.world.events.emit('damage.dealt' as never, { attackerId: 'wolf', targetId: 'player', amount: 8, poise: 0, kind: 'melee', outcome: 'hit', dealt: 8, poiseDealt: 0, healthAfter: 142, killed: false, saved: false, staggered: false } as never);
    expect(r.f.world.damage.applied).toHaveLength(1);
    expect(r.f.world.damage.applied[0]).toMatchObject({ targetId: 'wolf', poise: 20, attackId: EARTHROOT.attackId });
    expect(r.spawned.map((s) => s.id)).toEqual(['earthroot', 'earthroot-shock']);
  });

  it('death and a class change clear it', () => {
    for (const ev of ['actor.died', 'class.changed', 'save.loaded']) {
      const r = rig();
      boot(r, 'stonehide');
      r.progression.assign(0, SKILL_IDS.earthroot);
      r.abilities.use(0);
      const payload = ev === 'actor.died' ? { actorId: 'player', killerId: null, kind: 'p', team: 'player', level: 1 } : { classId: 'knight', previous: 'warden', free: true, cost: 0 };
      r.f.world.events.emit(ev as never, payload as never);
      expect((r.f.world.player as any).modifiers.size, ev).toBe(0);
      wardenAct3Plugin.dispose?.();
      wardenPlugin.dispose?.();
      resetClassSkills();
    }
  });
});

describe('Frenzied Hearth in the plugin', () => {
  it('below 30% the modifier zeroes poise, the poise bar refills each tick and the steam runs; above it nothing', () => {
    const r = rig();
    boot(r, 'howlcaller');
    const mod = r.modifiers.get(FRENZIED_HEARTH.modifierId)!.fn;
    const q = { poise: 30 };
    mod(q, { id: 'player' }, null);
    expect(q.poise).toBe(30);
    r.actor.health = r.actor.maxHealth * 0.2;
    mod(q, { id: 'player' }, null);
    expect(q.poise).toBe(0);
    r.f.tick(2);
    expect(r.spawned.map((s) => s.id)).toEqual(['frenzied-hearth']);
    r.actor.health = r.actor.maxHealth * 0.5;
    r.f.tick(1);
    expect(r.spawned[0].stopped).toBe(true);
  });

  it('exactly 30% of a max lowered as Burn would is not below', () => {
    const r = rig();
    boot(r, 'howlcaller');
    const mod = r.modifiers.get(FRENZIED_HEARTH.modifierId)!.fn;
    r.actor.maxHealth = 100;
    r.actor.health = 30;
    const q = { poise: 30 };
    mod(q, { id: 'player' }, null);
    expect(q.poise).toBe(30);
    r.actor.health = 29;
    mod(q, { id: 'player' }, null);
    expect(q.poise).toBe(0);
  });

  it('a melee hit landed below 30% heals 2% of the current max through damage.heal, once per swing', () => {
    const r = rig();
    boot(r, 'howlcaller');
    r.actor.maxHealth = 100;
    r.actor.health = 10;
    const hit = { attackerId: 'player', targetId: 'wolf', amount: 8, poise: 8, kind: 'melee', outcome: 'hit', dealt: 8, poiseDealt: 0, healthAfter: 90, killed: false, saved: false, staggered: false, swingId: 3 };
    r.f.world.events.emit('damage.dealt' as never, hit as never);
    r.f.world.events.emit('damage.dealt' as never, hit as never);
    expect(r.f.world.damage.healed).toEqual([{ id: 'player', amount: 2 }]);
  });

  it('unlearned does nothing', () => {
    const r = rig();
    wardenPlugin.setup(r.f.ctx);
    wardenAct3Plugin.setup(r.f.ctx);
    r.actor.health = 10;
    r.f.tick(3);
    const q = { poise: 30 };
    r.modifiers.get(FRENZIED_HEARTH.modifierId)!.fn(q, { id: 'player' }, null);
    expect(q.poise).toBe(30);
    expect(r.spawned).toEqual([]);
  });
});

describe('presets', () => {
  it('the four ids are the ones the plugin spawns', () => {
    expect([...WARDEN_T4_EFFECT_IDS].sort()).toEqual([SKULLSPLITTER.effect, EARTHROOT.effect, EARTHROOT.shockEffect, FRENZIED_HEARTH.effect].sort());
    for (const id of WARDEN_T4_EFFECT_IDS) expect(WARDEN_T4_PARTICLES[id]).toBeGreaterThan(0);
  });
});
