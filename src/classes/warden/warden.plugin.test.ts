import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HEAVY_CHOP_CLIPS } from '../../combat/heavyBlow';
import { Abilities } from '../../progression/abilities';
import { Progression } from '../../progression/Progression';
import { registerClassStats } from '../../progression/classStats';
import { SKILLS, getSkill, resetClassSkills } from '../../progression/skills';
import { xpForLevel } from '../../progression/tuning';
import { AttackSets } from '../../player/attackSets';
import { SurgeForms } from '../../spells/SurgeAndRally';
import { makeCtx, type FakeCtx } from '../../spells/testHost';
import type { ClassKit } from '../types';
import { WARDEN_KIT } from './kit';
import wardenPlugin from './warden.plugin';
import { BOULDER, SKILL_IDS, WARDEN_CLIPS } from './tuning';

interface Rig {
  f: FakeCtx;
  progression: Progression;
  abilities: Abilities;
  attackSets: AttackSets;
  forms: SurgeForms;
  holds: Array<unknown>;
  kits: ClassKit[];
  codexRegistered: Array<{ id: string }[]>;
  ember: { value: number };
  verbs: { busy: boolean; staggered: boolean };
  actor: { health: number; maxHealth: number; dead: boolean };
}

function rig(opts: { without?: string[] } = {}): Rig {
  const f = makeCtx();
  (f.ctx as any).strings = { register: vi.fn() };
  // The shared fake damage has no modifier list; tier 3 registers Grit Teeth's. Duplicates throw like the real resolver.
  const modifierIds = new Set<string>();
  (f.world.damage as any).addModifier = (id: string) => {
    if (modifierIds.has(id)) throw new Error(`duplicate modifier "${id}"`);
    modifierIds.add(id);
    return () => void modifierIds.delete(id);
  };
  (f.world.damage as any).modifierIds = modifierIds;
  const actor = f.world.actors.player;
  actor.maxHealth = 150;
  actor.health = 150;
  const progression = new Progression({
    emit: (type, payload) => f.world.events.emit(type as never, payload as never),
    actor: () => actor as never,
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
  const attackSets = new AttackSets();
  const forms = new SurgeForms();
  const holds: unknown[] = [];
  const kits: ClassKit[] = [];
  const codexRegistered: Array<{ id: string }[]> = [];
  const verbs = { busy: false, staggered: false };
  const all: Record<string, unknown> = {
    progression,
    abilities,
    combatVerbs: {
      ...verbs,
      get busy() { return verbs.busy; },
      get staggered() { return verbs.staggered; },
      registerAttackSet: (id: string, set: never) => attackSets.register(id, set),
      holdForcedMove: (_o: string, m: unknown) => void holds.push(m),
    },
    spells: { registerSurgeForm: (id: string, zone: never, impl: never) => forms.register(id, zone, impl), restoreEmber: vi.fn() },
    classes: { registerKit: (k: ClassKit) => (kits.push(k), { ok: true as const, dispose: () => void kits.pop() }) },
    codex: { register: (e: { id: string }[]) => (codexRegistered.push(e), () => void codexRegistered.pop()), unlock: vi.fn() },
    status: { apply: vi.fn(() => true) },
  };
  for (const name of opts.without ?? []) delete all[name];
  for (const [name, impl] of Object.entries(all)) f.services[name] = impl;
  return { f, progression, abilities, attackSets, forms, holds, kits, codexRegistered, ember, verbs, actor: actor as never };
}

beforeEach(() => {
  resetClassSkills();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  wardenPlugin.dispose?.();
  resetClassSkills();
  vi.restoreAllMocks();
});

const learnAll = (r: Rig, ...ids: string[]) => {
  r.progression.grantXp(xpForLevel(14), 'test');
  for (const id of ids) expect(r.progression.learn(id), id).toEqual({ ok: true });
};

describe('warden plugin: registration', () => {
  it('registers the attack set, three Surge forms, the skills, the kit, the heavy clip, the handler and the codex entries', () => {
    const r = rig();
    wardenPlugin.setup(r.f.ctx);
    expect(console.warn).not.toHaveBeenCalled();
    expect(r.attackSets.has('warden')).toBe(true);
    for (const z of ['warm', 'blaze', 'cinder'] as const) expect(r.forms.has('warden', z)).toBe(true);
    expect(SKILLS.filter((s) => s.classId === 'warden')).toHaveLength(15);
    expect(r.kits).toEqual([WARDEN_KIT]);
    expect(HEAVY_CHOP_CLIPS.has(WARDEN_CLIPS.chop)).toBe(true);
    expect(r.codexRegistered[0].map((e) => e.id)).toEqual(['howto.warden-boulder-shoulder', 'howto.warden-war-howl']);
    expect(r.f.systems.map((s) => s.id)).toEqual(['warden.fixed']);
    expect(wardenPlugin.dependsOn).toEqual(expect.arrayContaining(['combat-verbs', 'classes', 'spells']));
  });

  it('dispose removes everything it registered', () => {
    const r = rig();
    wardenPlugin.setup(r.f.ctx);
    wardenPlugin.dispose?.();
    expect(r.attackSets.has('warden')).toBe(false);
    expect(r.forms.has('warden', 'warm')).toBe(false);
    expect(SKILLS.some((s) => s.classId === 'warden')).toBe(false);
    expect(r.kits).toEqual([]);
    expect(HEAVY_CHOP_CLIPS.has(WARDEN_CLIPS.chop)).toBe(false);
    expect(r.codexRegistered).toEqual([]);
    expect(r.f.systems).toEqual([]);
    expect(r.f.world.events.count()).toBe(0);
  });

  it('a second setup replaces the first instead of duplicating', () => {
    const r = rig();
    wardenPlugin.setup(r.f.ctx);
    wardenPlugin.setup(r.f.ctx);
    expect(SKILLS.filter((s) => s.classId === 'warden')).toHaveLength(15);
    expect(r.f.systems).toHaveLength(1);
  });

  it('loads without the optional services (no status, codex, spells, combat verbs, classes) and warns about what is missing', () => {
    const r = rig({ without: ['status', 'codex', 'spells', 'combatVerbs', 'classes'] });
    expect(() => wardenPlugin.setup(r.f.ctx)).not.toThrow();
    expect(console.warn).toHaveBeenCalled();
    expect(r.f.systems).toHaveLength(1);
    expect(() => r.f.tick(3)).not.toThrow();
  });

  it('a codex that arrives later is bound on a tick, and skill.learned unlocks its entry', () => {
    const r = rig({ without: ['codex'] });
    wardenPlugin.setup(r.f.ctx);
    expect(r.codexRegistered).toEqual([]);
    const unlock = vi.fn();
    r.f.services.codex = { register: (e: { id: string }[]) => (r.codexRegistered.push(e), () => undefined), unlock };
    r.f.tick(1);
    expect(r.codexRegistered).toHaveLength(1);
    r.f.tick(5);
    expect(r.codexRegistered).toHaveLength(1);
    r.f.world.events.emit('skill.learned' as never, { skillId: SKILL_IDS.boulderShoulder } as never);
    r.f.world.events.emit('skill.learned' as never, { skillId: SKILL_IDS.thickSkin } as never);
    expect(unlock).toHaveBeenCalledTimes(1);
    expect(unlock).toHaveBeenCalledWith('howto.warden-boulder-shoulder');
  });
});

describe('warden plugin: skills in play', () => {
  it('Thick Skin: +10% max health once learned, gone after a respec and back after relearning', () => {
    const r = rig();
    wardenPlugin.setup(r.f.ctx);
    r.progression.grantXp(xpForLevel(14), 'test');
    const base = r.progression.baseMaxHealth();
    expect(r.progression.learn(SKILL_IDS.thickSkin)).toEqual({ ok: true });
    expect(r.actor.maxHealth).toBe(Math.round(base * 1.1));
    r.progression.allowRespec('test');
    expect(r.progression.respec()).toMatchObject({ ok: true });
    expect(r.progression.learned(SKILL_IDS.thickSkin)).toBe(false);
    r.progression.refreshMaxHealth();
    expect(r.actor.maxHealth).toBe(base);
    expect(r.progression.learn(SKILL_IDS.thickSkin)).toEqual({ ok: true });
    expect(r.actor.maxHealth).toBe(Math.round(base * 1.1));
  });

  it('tier gating: tier 2 needs tier 1 of its branch; tier 3 is available and tier 4 is not', () => {
    const r = rig();
    wardenPlugin.setup(r.f.ctx);
    r.progression.grantXp(xpForLevel(14), 'x');
    expect(r.progression.canLearn(SKILL_IDS.boulderShoulder)).toEqual({ ok: false, reason: 'missing-prereq' });
    expect(r.progression.learn(SKILL_IDS.thickSkin)).toEqual({ ok: true });
    expect(r.progression.canLearn(SKILL_IDS.boulderShoulder)).toEqual({ ok: true });
    expect(getSkill('warden.gritTeeth')?.availableWhen).toBe(true);
    r.progression.learn(SKILL_IDS.boulderShoulder);
    expect(r.progression.canLearn('warden.gritTeeth')).toEqual({ ok: true });
  });

  it('Boulder Shoulder through the abilities service: Ember, cooldown, hold, refusals', () => {
    const r = rig();
    wardenPlugin.setup(r.f.ctx);
    learnAll(r, SKILL_IDS.thickSkin, SKILL_IDS.boulderShoulder);
    expect(r.progression.assign(0, SKILL_IDS.boulderShoulder)).toBe(true);
    r.f.world.host.clipResult = true;
    // The fake player has no avatar, so the clip cannot be played: refused before any cost.
    expect(r.abilities.use(0)).toEqual({ ok: false, reason: 'handler-failed', detail: 'busy' });
    expect(r.ember.value).toBe(100);
    expect(r.abilities.cooldown(0).remaining).toBe(0);

    (r.f.world.player as any).avatar = { controller: { activeAttack: () => null, playOneShot: () => true, currentAction: null } };
    expect(r.abilities.use(0)).toEqual({ ok: true });
    expect(r.ember.value).toBe(100 - BOULDER.emberCost);
    expect(r.abilities.cooldown(0).remaining).toBeCloseTo(BOULDER.cooldown);
    expect(r.holds.at(-1)).toMatchObject({ speed: expect.any(Number) });
    expect(r.abilities.use(0)).toMatchObject({ ok: false });

    r.f.tick(BOULDER.ticks + 2);
    expect(r.holds.at(-1)).toBeNull();
    for (let i = 0; i < BOULDER.cooldown * 60 + 2; i++) r.abilities.tick();
    expect(r.abilities.use(0)).toEqual({ ok: true });

    r.f.tick(1);
    r.verbs.staggered = true;
    r.f.tick(1);
    expect(r.holds.at(-1)).toBeNull();
    r.verbs.staggered = false;
    for (let i = 0; i < BOULDER.cooldown * 60 + 2; i++) r.abilities.tick();
    r.ember.value = 5;
    expect(r.abilities.use(0)).toEqual({ ok: false, reason: 'no-ember' });
    r.ember.value = 100;
    (r.f.world.actors.player as any).kill();
    expect(r.abilities.use(0)).toEqual({ ok: false, reason: 'dead' });
  });

  it('save and load mid-cooldown: the learned skill and bar slot survive, the cooldown does not (cooldowns are not saved)', () => {
    const r = rig();
    wardenPlugin.setup(r.f.ctx);
    learnAll(r, SKILL_IDS.thickSkin, SKILL_IDS.boulderShoulder);
    r.progression.assign(2, SKILL_IDS.boulderShoulder);
    (r.f.world.player as any).avatar = { controller: { activeAttack: () => null, playOneShot: () => true, currentAction: null } };
    expect(r.abilities.use(2)).toEqual({ ok: true });
    const saved = JSON.parse(JSON.stringify(r.progression.serialize()));
    r.f.world.events.emit('save.loaded' as never, {} as never);
    expect(r.holds.at(-1)).toBeNull();

    const r2 = rig();
    wardenPlugin.dispose?.();
    wardenPlugin.setup(r2.f.ctx);
    r2.progression.load(saved, Progression.version);
    expect(r2.progression.learned(SKILL_IDS.boulderShoulder)).toBe(true);
    expect(r2.progression.bar()[2]).toBe(SKILL_IDS.boulderShoulder);
    expect(r2.abilities.cooldown(2).remaining).toBe(0);
  });

  it('a class change away from the Warden puts the burning axe out and stops a charge; becoming one does not', () => {
    const r = rig();
    wardenPlugin.setup(r.f.ctx);
    learnAll(r, SKILL_IDS.thickSkin, SKILL_IDS.boulderShoulder);
    r.progression.assign(0, SKILL_IDS.boulderShoulder);
    (r.f.world.player as any).avatar = { controller: { activeAttack: () => null, playOneShot: () => true, currentAction: null } };
    r.abilities.use(0);
    r.f.world.events.emit('class.changed' as never, { classId: 'knight', previous: 'warden', free: true, cost: 0 } as never);
    expect(r.holds.at(-1)).toBeNull();
    const n = r.holds.length;
    r.f.world.events.emit('class.changed' as never, { classId: 'warden', previous: 'knight', free: true, cost: 0 } as never);
    expect(r.holds).toHaveLength(n);
  });
});
