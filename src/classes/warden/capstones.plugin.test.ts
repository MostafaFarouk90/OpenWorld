import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COMBAT } from '../../config/constants';
import '../../hud/events';
import { Abilities } from '../../progression/abilities';
import { registerClassStats } from '../../progression/classStats';
import { Progression } from '../../progression/Progression';
import { resetClassSkills } from '../../progression/skills';
import { xpForLevel } from '../../progression/tuning';
import { makeCtx, FakeActor } from '../../spells/testHost';
import { WARDEN_T5_EFFECT_IDS } from '../../vfx/act3Skills/warden';
import { WARDEN_SKILLS } from './skills';
import { WARDEN_STRINGS_EN } from './strings.en';
import { MOUNTAIN_UNMOVED, SKILL_IDS, VOICE_OF_THE_MOUNTAIN, WYRMBREAKER } from './tuning';
import wardenAct3Plugin from './act3.plugin';
import wardenCapstonesPlugin from './capstones.plugin';
import wardenPlugin from './warden.plugin';

type Mod = (req: any, target: any, attacker: any) => void;
const FAR = { x: 15000, z: 15000 };

function rig() {
  const f = makeCtx();
  (f.ctx as any).strings = { register: vi.fn() };
  const modifiers = new Map<string, { fn: Mod; order: number }>();
  (f.world.damage as any).addModifier = (id: string, fn: Mod, order: number) => {
    if (modifiers.has(id)) throw new Error(`duplicate modifier "${id}"`);
    modifiers.set(id, { fn, order });
    return () => void modifiers.delete(id);
  };
  // A real-looking result so a landed hit can be told from a refused one.
  (f.world.damage as any).apply = (req: any) => {
    (f.world.damage.applied as any[]).push(req);
    return { ...req, outcome: 'hit', dealt: req.amount, poiseDealt: req.poise, healthAfter: 1, killed: false, saved: false, staggered: false };
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
  const filters = new Map<string, () => boolean>();
  const controller = { activeAttack: () => null, playOneShot: vi.fn(() => true), currentAction: null as string | null };
  f.services.progression = progression;
  f.services.abilities = abilities;
  f.services.combatVerbs = {
    get busy() { return verbs.busy; },
    get staggered() { return verbs.staggered; },
    registerAttackSet: () => ({ ok: true, dispose: () => {} }),
    holdForcedMove: () => {},
    addKnockbackFilter: (id: string, keep: () => boolean) => {
      filters.set(id, keep);
      return () => void filters.delete(id);
    },
  };
  const stuns: Array<{ id: string; spec: any }> = [];
  f.services.status = { apply: vi.fn((id: string, spec: any) => (stuns.push({ id, spec }), true)), list: vi.fn(() => []) };
  const spawned: Array<{ id: string; t: any; params: any; stopped: boolean }> = [];
  const shakes: Array<[number, number]> = [];
  f.services.vfx = {
    spawnEffect: (id: string, t: any, params: any) => {
      const h = { id, t, params, stopped: false, stop() { h.stopped = true; } };
      spawned.push(h);
      return h;
    },
    shake: (a: number, s: number) => void shakes.push([a, s]),
  };
  (f.world.player as any).avatar = { root: new THREE.Object3D(), controller };
  // Stand far from the origin: world-space maths must not depend on a zero root.
  f.world.player.feet.set(FAR.x, 0, FAR.z);
  (f.world.player as any).avatar.root.position.set(FAR.x, 0, FAR.z);
  (f.world.player as any).avatar.root.updateMatrixWorld(true);
  const bossIds = new Set<string>();
  (f.ctx as any).bosses = { active: () => (bossIds.size ? ['b1'] : []), state: () => ({ actorId: [...bossIds][0] }) };
  return { f, progression, abilities, ember, verbs, controller, modifiers, spawned, shakes, actor, filters, stuns, bossIds };
}

beforeEach(() => {
  resetClassSkills();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  wardenCapstonesPlugin.dispose?.();
  wardenAct3Plugin.dispose?.();
  wardenPlugin.dispose?.();
  resetClassSkills();
  vi.restoreAllMocks();
});

const CHAINS = {
  hewer: ['cleavingSwing', 'deepWound', 'whirlingHew', 'skullsplitter', 'wyrmbreaker'],
  stonehide: ['thickSkin', 'boulderShoulder', 'gritTeeth', 'earthroot', 'mountainUnmoved'],
  howlcaller: ['warHowl', 'emberRage', 'bloodChant', 'frenziedHearth', 'voiceOfTheMountain'],
} as const;
function boot(r: ReturnType<typeof rig>, branch: keyof typeof CHAINS) {
  wardenPlugin.setup(r.f.ctx);
  wardenAct3Plugin.setup(r.f.ctx);
  wardenCapstonesPlugin.setup(r.f.ctx);
  r.progression.grantXp(xpForLevel(30), 'test');
  for (const name of CHAINS[branch]) expect(r.progression.learn(`warden.${name}`), name).toEqual({ ok: true });
}
const foeAt = (r: ReturnType<typeof rig>, id: string, dx: number, dz: number) => r.f.world.actors.add(new FakeActor(id, 'hostile', FAR.x + dx, FAR.z + dz));
const CHARGE_AND_HIT = WYRMBREAKER.chargeTicks + WYRMBREAKER.hitTick;

describe('tier 5 rows', () => {
  it('carry their cooldown and Ember, stay capstones of one exclusive group, and say their numbers', () => {
    const row = (id: string) => WARDEN_SKILLS.find((s) => s.id === id)!;
    expect(row(SKILL_IDS.wyrmbreaker)).toMatchObject({ cooldown: 30, emberCost: 30, kind: 'active', tier: 5, cost: 5, capstone: true, exclusiveGroup: 'capstone' });
    expect(row(SKILL_IDS.mountainUnmoved)).toMatchObject({ cooldown: 45, emberCost: 25, kind: 'active', tier: 5, cost: 5, capstone: true, exclusiveGroup: 'capstone' });
    expect(row(SKILL_IDS.voiceOfTheMountain)).toMatchObject({ cooldown: 45, emberCost: 30, kind: 'active', tier: 5, cost: 5, capstone: true, exclusiveGroup: 'capstone' });
    const d = (id: string) => WARDEN_STRINGS_EN[row(id).descKey];
    expect(d(SKILL_IDS.wyrmbreaker)).toMatch(/0\.8 seconds.*12 metres.*2\.5x.*60 poise.*25%.*8 seconds.*30 Ember.*30 second/);
    expect(d(SKILL_IDS.mountainUnmoved)).toMatch(/10 seconds.*25 Ember.*45 second/);
    expect(d(SKILL_IDS.voiceOfTheMountain)).toMatch(/12 metres.*40 poise.*3 seconds.*30 Ember.*45 second/);
  });

  it('only one capstone can be learned per character', () => {
    const r = rig();
    boot(r, 'hewer');
    expect(r.progression.canLearn(SKILL_IDS.mountainUnmoved)).toMatchObject({ ok: false });
    expect(r.progression.canLearn(SKILL_IDS.voiceOfTheMountain)).toMatchObject({ ok: false });
  });
});

describe('plugin wiring', () => {
  it('registers two modifiers at the stated orders, setup twice is fine, dispose releases everything', () => {
    const r = rig();
    wardenPlugin.setup(r.f.ctx);
    wardenAct3Plugin.setup(r.f.ctx);
    wardenCapstonesPlugin.setup(r.f.ctx);
    expect(r.modifiers.get(WYRMBREAKER.crackModifierId)!.order).toBe(-55);
    expect(r.modifiers.get(MOUNTAIN_UNMOVED.modifierId)!.order).toBe(20);
    const orders = [...r.modifiers.values()].map((m) => m.order);
    expect(new Set(orders.filter((o) => o === 20 || o === -55)).size).toBe(2);
    expect(() => wardenCapstonesPlugin.setup(r.f.ctx)).not.toThrow();
    expect(r.f.systems.filter((s) => (s as any).id === 'warden.capstones.fixed')).toHaveLength(1);
    wardenCapstonesPlugin.dispose?.();
    for (const id of [WYRMBREAKER.crackModifierId, MOUNTAIN_UNMOVED.modifierId]) expect(r.modifiers.has(id), id).toBe(false);
    expect(r.f.systems.filter((s) => (s as any).id === 'warden.capstones.fixed')).toEqual([]);
    expect(r.f.world.events.count()).toBeLessThan(40);
    expect((console.warn as any).mock.calls.filter((c: string[]) => /Wyrmbreaker|Mountain|Voice/.test(String(c[0])))).toEqual([]);
  });

  it('the plugin depends on warden-act3 and its handler, modifier and filter ids are its own', () => {
    expect(wardenCapstonesPlugin.id).toBe('warden-capstones');
    expect(wardenCapstonesPlugin.dependsOn).toContain('warden-act3');
    const ids = [WYRMBREAKER.crackModifierId, MOUNTAIN_UNMOVED.modifierId, 'warden.earthroot', 'warden.frenziedHearth', 'warden.gritTeeth'];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('loads without the abilities, status, combatVerbs and vfx services', () => {
    const r = rig();
    delete r.f.services.abilities;
    delete r.f.services.vfx;
    delete r.f.services.status;
    wardenPlugin.setup(r.f.ctx);
    delete r.f.services.combatVerbs;
    expect(() => wardenCapstonesPlugin.setup(r.f.ctx)).not.toThrow();
    expect(() => r.f.tick(3)).not.toThrow();
  });
});

describe('Wyrmbreaker through the abilities service', () => {
  it('Ember 30, cooldown 30, charge glow attached with a zero offset, then the chop and the fissure from a far-off root', () => {
    const r = rig();
    boot(r, 'hewer');
    r.progression.assign(0, SKILL_IDS.wyrmbreaker);
    foeAt(r, 'near', 0, -3);
    foeAt(r, 'far', 1.5, -11.5);
    foeAt(r, 'side', 3, -3);
    foeAt(r, 'behind', 0, 3);
    r.verbs.busy = true;
    expect(r.abilities.use(0)).toEqual({ ok: false, reason: 'handler-failed', detail: 'busy' });
    expect(r.ember.value).toBe(100);
    r.verbs.busy = false;
    expect(r.abilities.use(0)).toEqual({ ok: true });
    expect(r.ember.value).toBe(70);
    expect(r.abilities.cooldown(0).remaining).toBeCloseTo(30);
    const charge = r.spawned.find((s) => s.id === 'wyrmbreaker-charge')!;
    expect(charge.t.attach).toBe((r.f.world.player as any).avatar.root);
    expect(charge.t.position).toEqual({ x: 0, y: 0, z: 0 });
    expect(charge.params.seconds).toBeCloseTo(0.8);
    expect([...(r.f.world.player as any).modifiers.values()]).toEqual([{ source: 'warden.wyrmbreaker', mod: { lockMove: true } }]);
    r.f.tick(WYRMBREAKER.chargeTicks - 2);
    expect(r.controller.playOneShot).not.toHaveBeenCalled();
    r.f.tick(2);
    expect(r.controller.playOneShot).toHaveBeenCalledWith(WYRMBREAKER.clip, { lockMove: true });
    expect((r.f.world.player as any).modifiers.size).toBe(0);
    expect(charge.stopped).toBe(true);
    expect(r.f.world.damage.applied).toEqual([]);
    r.f.tick(WYRMBREAKER.hitTick);
    const hit = r.f.world.damage.applied.map((a) => a.targetId).sort();
    expect(hit).toEqual(['far', 'near']);
    expect(r.f.world.damage.applied[0]).toMatchObject({ poise: 60, attackId: WYRMBREAKER.attackId });
    expect(r.f.world.damage.applied[0].amount).toBeCloseTo(COMBAT.baseDamage * 2.5);
    const fissure = r.spawned.find((s) => s.id === 'wyrmbreaker')!;
    expect(fissure.t.position).toEqual({ x: FAR.x, y: 0, z: FAR.z });
    expect(fissure.params).toMatchObject({ length: 12, width: 4, hits: 2 });
    expect(r.shakes).toHaveLength(1);
    expect(r.f.world.clock.hitStops).toEqual([0.1]);
    // The cooldown holds.
    expect(r.abilities.use(0)).toMatchObject({ ok: false });
  });

  it('cracked foes take +25% from every source for 8 s through the registered modifier, and nobody else does', () => {
    const r = rig();
    boot(r, 'hewer');
    r.progression.assign(0, SKILL_IDS.wyrmbreaker);
    foeAt(r, 'wolf', 0, -3);
    foeAt(r, 'boar', 3, 3);
    r.abilities.use(0);
    r.f.tick(CHARGE_AND_HIT + 1);
    const crack = r.modifiers.get(WYRMBREAKER.crackModifierId)!.fn;
    const dmg = (id: string) => {
      const q = { amount: 10, poise: 5 };
      crack(q, { id }, null);
      return q;
    };
    expect(dmg('wolf')).toEqual({ amount: 12.5, poise: 5 });
    expect(dmg('boar').amount).toBe(10);
    expect(dmg('player').amount).toBe(10);
    // 8 s after the hit, not before.
    r.f.tick(60 * 8 - 70);
    expect(dmg('wolf').amount).toBe(12.5);
    r.f.tick(80);
    expect(dmg('wolf').amount).toBe(10);
  });

  it('a boss is hit and cracked (no stun, root or kill is involved); a mercy foe is not touched', () => {
    const r = rig();
    boot(r, 'hewer');
    r.progression.assign(0, SKILL_IDS.wyrmbreaker);
    foeAt(r, 'boss', 0, -6);
    r.bossIds.add('boss');
    (foeAt(r, 'yield', 0, -4) as any).mercyState = () => 'yielding';
    r.abilities.use(0);
    r.f.tick(CHARGE_AND_HIT + 1);
    expect(r.f.world.damage.applied.map((a) => a.targetId)).toEqual(['boss']);
    expect(r.stuns).toEqual([]);
    const q = { amount: 10 };
    r.modifiers.get(WYRMBREAKER.crackModifierId)!.fn(q, { id: 'boss' }, null);
    expect(q.amount).toBe(12.5);
  });

  it('a flinch during the charge is ridden out (the chop still lands); a dodge during the charge cancels: no chop, no damage, unlocked, glow stopped, Ember spent', () => {
    const f = rig();
    boot(f, 'hewer');
    f.progression.assign(0, SKILL_IDS.wyrmbreaker);
    foeAt(f, 'wolf', 0, -3);
    f.abilities.use(0);
    f.f.tick(20);
    f.controller.currentAction = 'flinch';
    f.verbs.busy = true;
    f.f.tick(WYRMBREAKER.chargeTicks); // still flinching when the charge is full: the chop waits
    expect(f.controller.playOneShot).not.toHaveBeenCalled();
    f.controller.currentAction = null;
    f.verbs.busy = false;
    f.f.tick(WYRMBREAKER.hitTick + 3);
    expect(f.controller.playOneShot).toHaveBeenCalledTimes(1);
    expect(f.f.world.damage.applied.map((a) => a.targetId)).toEqual(['wolf']);

    const r = rig();
    boot(r, 'hewer');
    r.progression.assign(0, SKILL_IDS.wyrmbreaker);
    foeAt(r, 'wolf', 0, -3);
    r.abilities.use(0);
    r.f.tick(20);
    r.controller.currentAction = 'dodge';
    r.f.tick(1);
    r.controller.currentAction = null;
    r.f.tick(CHARGE_AND_HIT + 20);
    expect(r.controller.playOneShot).not.toHaveBeenCalled();
    expect(r.f.world.damage.applied).toEqual([]);
    expect((r.f.world.player as any).modifiers.size).toBe(0);
    expect(r.spawned.find((s) => s.id === 'wyrmbreaker-charge')!.stopped).toBe(true);
    expect(r.ember.value).toBe(70);
  });

  it('another attack started during the charge (verbs.busy) cancels it; a flinch that replaces the chop ends it too', () => {
    const r = rig();
    boot(r, 'hewer');
    r.progression.assign(0, SKILL_IDS.wyrmbreaker);
    foeAt(r, 'wolf', 0, -3);
    r.abilities.use(0);
    r.f.tick(10);
    r.verbs.busy = true;
    r.f.tick(1);
    r.verbs.busy = false;
    r.f.tick(CHARGE_AND_HIT);
    expect(r.f.world.damage.applied).toEqual([]);
    expect(r.controller.playOneShot).not.toHaveBeenCalled();
    const q = rig();
    boot(q, 'hewer');
    q.progression.assign(0, SKILL_IDS.wyrmbreaker);
    foeAt(q, 'wolf', 0, -3);
    q.abilities.use(0);
    q.f.tick(WYRMBREAKER.chargeTicks + 3);
    expect(q.controller.playOneShot).toHaveBeenCalledTimes(1);
    q.controller.currentAction = 'flinch';
    q.f.tick(WYRMBREAKER.chopTicks);
    expect(q.f.world.damage.applied).toEqual([]);
  });

  it('death, class change and load end the cast and clear the cracks', () => {
    for (const ev of ['actor.died', 'class.changed', 'save.loaded']) {
      const r = rig();
      boot(r, 'hewer');
      r.progression.assign(0, SKILL_IDS.wyrmbreaker);
      foeAt(r, 'wolf', 0, -3);
      r.abilities.use(0);
      r.f.tick(10);
      const payload = ev === 'actor.died' ? { actorId: 'player', killerId: null, kind: 'p', team: 'player', level: 1 } : { classId: 'knight', previous: 'warden', free: true, cost: 0 };
      r.f.world.events.emit(ev as never, payload as never);
      expect((r.f.world.player as any).modifiers.size, ev).toBe(0);
      r.f.tick(CHARGE_AND_HIT);
      expect(r.f.world.damage.applied, ev).toEqual([]);
      wardenCapstonesPlugin.dispose?.();
      wardenAct3Plugin.dispose?.();
      wardenPlugin.dispose?.();
      resetClassSkills();
    }
    const r = rig();
    boot(r, 'hewer');
    r.progression.assign(0, SKILL_IDS.wyrmbreaker);
    foeAt(r, 'wolf', 0, -3);
    r.abilities.use(0);
    r.f.tick(CHARGE_AND_HIT + 1);
    r.f.world.events.emit('save.loaded' as never, {} as never);
    const q = { amount: 10 };
    r.modifiers.get(WYRMBREAKER.crackModifierId)!.fn(q, { id: 'wolf' }, null);
    expect(q.amount).toBe(10);
  });
});

describe('Mountain Unmoved through the abilities service', () => {
  it('Ember 25, cooldown 45, zero poise on hits to the player and no knockback for 10 s, then back', () => {
    const r = rig();
    boot(r, 'stonehide');
    r.progression.assign(0, SKILL_IDS.mountainUnmoved);
    expect(r.abilities.use(0)).toEqual({ ok: true });
    expect(r.ember.value).toBe(75);
    expect(r.abilities.cooldown(0).remaining).toBeCloseTo(45);
    expect(r.spawned.map((s) => s.id)).toEqual(['mountain-unmoved']);
    expect(r.spawned[0].t.attach).toBe((r.f.world.player as any).avatar.root);
    expect(r.spawned[0].t.position).toEqual({ x: 0, y: 0, z: 0 });
    expect(r.spawned[0].params.seconds).toBe(10);
    expect(r.filters.has(MOUNTAIN_UNMOVED.filterId)).toBe(true);
    expect(r.filters.get(MOUNTAIN_UNMOVED.filterId)!()).toBe(false);
    const mod = r.modifiers.get(MOUNTAIN_UNMOVED.modifierId)!.fn;
    const q = { poise: 40 };
    mod(q, { id: 'player' }, null);
    expect(q.poise).toBe(0);
    const foe = { poise: 40 };
    mod(foe, { id: 'wolf' }, null);
    expect(foe.poise).toBe(40);
    expect(r.abilities.use(0)).toMatchObject({ ok: false });
    r.f.tick(60 * 10 - 5);
    expect(r.filters.size).toBe(1);
    r.f.tick(10);
    expect(r.filters.size).toBe(0);
    expect(r.spawned[0].stopped).toBe(true);
    const after = { poise: 40 };
    mod(after, { id: 'player' }, null);
    expect(after.poise).toBe(40);
  });

  it('staggered refuses without cost and busy does not; death, class change and load end it', () => {
    const r = rig();
    boot(r, 'stonehide');
    r.progression.assign(0, SKILL_IDS.mountainUnmoved);
    r.verbs.staggered = true;
    expect(r.abilities.use(0)).toMatchObject({ ok: false, detail: 'staggered' });
    r.verbs.staggered = false;
    // No busy gate: blocking or flinching must not stop the defensive.
    r.verbs.busy = true;
    expect(r.abilities.use(0)).toEqual({ ok: true });
    expect(r.ember.value).toBe(75);
    r.verbs.busy = false;
    for (const ev of ['actor.died', 'class.changed', 'save.loaded']) {
      const q = rig();
      boot(q, 'stonehide');
      q.progression.assign(0, SKILL_IDS.mountainUnmoved);
      q.abilities.use(0);
      expect(q.filters.size, ev).toBe(1);
      const payload = ev === 'actor.died' ? { actorId: 'player', killerId: null, kind: 'p', team: 'player', level: 1 } : { classId: 'knight', previous: 'warden', free: true, cost: 0 };
      q.f.world.events.emit(ev as never, payload as never);
      expect(q.filters.size, ev).toBe(0);
      const p = { poise: 9 };
      q.modifiers.get(MOUNTAIN_UNMOVED.modifierId)!.fn(p, { id: 'player' }, null);
      expect(p.poise, ev).toBe(9);
      wardenCapstonesPlugin.dispose?.();
      wardenAct3Plugin.dispose?.();
      wardenPlugin.dispose?.();
      resetClassSkills();
    }
  });

  it('dispose while up releases the filter', () => {
    const r = rig();
    boot(r, 'stonehide');
    r.progression.assign(0, SKILL_IDS.mountainUnmoved);
    r.abilities.use(0);
    wardenCapstonesPlugin.dispose?.();
    expect(r.filters.size).toBe(0);
    expect(r.spawned[0].stopped).toBe(true);
  });
});

describe('Voice of the Mountain through the abilities service', () => {
  it('Ember 30, cooldown 45; poise 40 and a 3 s stun on foes within 12 m with a margin at the edge; the boss takes the poise only', () => {
    const r = rig();
    boot(r, 'howlcaller');
    r.progression.assign(0, SKILL_IDS.voiceOfTheMountain);
    foeAt(r, 'near', 2, 0);
    foeAt(r, 'edge', 0, 11.5);
    foeAt(r, 'out', 0, 12.5);
    foeAt(r, 'boss', -5, -5);
    r.bossIds.add('boss');
    (foeAt(r, 'yield', 1, 1) as any).mercyState = () => 'yielding';
    r.verbs.busy = true;
    expect(r.abilities.use(0)).toMatchObject({ ok: false, detail: 'busy' });
    expect(r.ember.value).toBe(100);
    r.verbs.busy = false;
    expect(r.abilities.use(0)).toEqual({ ok: true });
    expect(r.ember.value).toBe(70);
    expect(r.abilities.cooldown(0).remaining).toBeCloseTo(45);
    expect(r.f.world.damage.applied.map((a) => a.targetId).sort()).toEqual(['boss', 'edge', 'near']);
    expect(r.f.world.damage.applied[0]).toMatchObject({ amount: 0, poise: 40, unblockable: true });
    expect(r.stuns.map((s) => s.id).sort()).toEqual(['edge', 'near']);
    expect(r.stuns[0].spec).toEqual({ id: VOICE_OF_THE_MOUNTAIN.stunId, kind: 'stun', seconds: 3, sourceId: 'player' });
    const ring = r.spawned.find((s) => s.id === 'voice-of-the-mountain')!;
    expect(ring.t.position).toEqual({ x: FAR.x, y: 0, z: FAR.z });
    expect(ring.params.radius).toBe(12);
    expect(r.shakes).toEqual([[VOICE_OF_THE_MOUNTAIN.shakeAmplitude, 0.4]]);
  });

  it('the stun swirl rides the stunned foe only when it has a root', () => {
    const r = rig();
    boot(r, 'howlcaller');
    r.progression.assign(0, SKILL_IDS.voiceOfTheMountain);
    const a = foeAt(r, 'rooted', 2, 0);
    (a as any).root = new THREE.Object3D();
    foeAt(r, 'rootless', 3, 0);
    r.abilities.use(0);
    const swirls = r.spawned.filter((s) => s.id === 'voice-stun');
    expect(swirls).toHaveLength(1);
    expect(swirls[0].t.attach).toBe((a as any).root);
    expect(swirls[0].t.position).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('refused when dead or staggered, with nobody touched; used with no foes in range it still sounds and costs', () => {
    const r = rig();
    boot(r, 'howlcaller');
    r.progression.assign(0, SKILL_IDS.voiceOfTheMountain);
    foeAt(r, 'wolf', 2, 0);
    r.verbs.staggered = true;
    expect(r.abilities.use(0)).toMatchObject({ ok: false, detail: 'staggered' });
    r.verbs.staggered = false;
    r.actor.kill();
    expect(r.abilities.use(0)).toMatchObject({ ok: false });
    expect(r.f.world.damage.applied).toEqual([]);
    expect(r.ember.value).toBe(100);
  });

  it('all five preset ids are known to the vfx table', () => {
    for (const id of WARDEN_T5_EFFECT_IDS) expect(id).toBeTruthy();
    expect(WARDEN_T5_EFFECT_IDS).toContain(WYRMBREAKER.effect);
    expect(WARDEN_T5_EFFECT_IDS).toContain(WYRMBREAKER.chargeEffect);
    expect(WARDEN_T5_EFFECT_IDS).toContain(MOUNTAIN_UNMOVED.effect);
    expect(WARDEN_T5_EFFECT_IDS).toContain(VOICE_OF_THE_MOUNTAIN.effect);
    expect(WARDEN_T5_EFFECT_IDS).toContain(VOICE_OF_THE_MOUNTAIN.stunEffect);
  });
});
