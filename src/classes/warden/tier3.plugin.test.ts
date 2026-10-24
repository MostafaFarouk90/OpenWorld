import * as THREE from 'three';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { FIXED_TIMESTEP } from '../../config/constants';
import { EnemyManager } from '../../enemies/EnemyManager';
import { FakeHost, loadKnight } from '../../enemies/testing/fakeHost';
import type { SpawnerDef } from '../../enemies/types';
import '../../hud/events';
import { Abilities } from '../../progression/abilities';
import { registerClassStats } from '../../progression/classStats';
import { Progression } from '../../progression/Progression';
import { getSkill, resetClassSkills } from '../../progression/skills';
import { xpForLevel } from '../../progression/tuning';
import { makeCtx, FakeActor } from '../../spells/testHost';
import { WARDEN_SKILLS } from './skills';
import { BLOOD_CHANT, GRIT_TEETH, SKILL_IDS, WHIRLING_HEW } from './tuning';
import { WhirlingHew } from './tier3';
import wardenPlugin from './warden.plugin';

function rig() {
  const f = makeCtx();
  (f.ctx as any).strings = { register: vi.fn() };
  const modifierIds = new Set<string>();
  (f.world.damage as any).addModifier = (id: string) => {
    if (modifierIds.has(id)) throw new Error(`duplicate modifier "${id}"`);
    modifierIds.add(id);
    return () => void modifierIds.delete(id);
  };
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
  const verbs = { busy: false, staggered: false };
  const status = { apply: vi.fn(() => true), list: vi.fn(() => []) };
  f.services.progression = progression;
  f.services.abilities = abilities;
  f.services.combatVerbs = {
    get busy() { return verbs.busy; },
    get staggered() { return verbs.staggered; },
    registerAttackSet: () => ({ ok: true, dispose: () => {} }),
    holdForcedMove: () => {},
  };
  f.services.status = status;
  const spawned: Array<{ id: string; stopped: boolean }> = [];
  f.services.vfx = {
    spawnEffect: (id: string) => {
      const h = { id, stopped: false, stop() { h.stopped = true; } };
      spawned.push(h);
      return h;
    },
  };
  (f.world.player as any).avatar = { root: new THREE.Object3D(), controller: { activeAttack: () => null, playOneShot: () => true, currentAction: null } };
  return { f, progression, abilities, ember, verbs, status, modifierIds, spawned, actor };
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

const learnAll = (r: ReturnType<typeof rig>, ...ids: string[]) => {
  r.progression.grantXp(xpForLevel(14), 'test');
  for (const id of ids) expect(r.progression.learn(id), id).toEqual({ ok: true });
};
const T1_2 = [SKILL_IDS.cleavingSwing, SKILL_IDS.deepWound, SKILL_IDS.thickSkin, SKILL_IDS.boulderShoulder, SKILL_IDS.warHowl, SKILL_IDS.emberRage];

describe('tier 3 skill defs', () => {
  it('cost 2, require the tier 2 skill of their branch, are available', () => {
    wardenPlugin.setup(rig().f.ctx);
    const want: Array<[string, string, 'active' | 'passive']> = [
      [SKILL_IDS.whirlingHew, SKILL_IDS.deepWound, 'active'],
      [SKILL_IDS.gritTeeth, SKILL_IDS.boulderShoulder, 'passive'],
      [SKILL_IDS.bloodChant, SKILL_IDS.emberRage, 'active'],
    ];
    for (const [id, requires, kind] of want) {
      expect(getSkill(id), id).toMatchObject({ tier: 3, cost: 2, requires, kind, availableWhen: true });
    }
    expect(WARDEN_SKILLS.find((s) => s.id === SKILL_IDS.whirlingHew)).toMatchObject({ cooldown: 14, emberCost: 20 });
    expect(WARDEN_SKILLS.find((s) => s.id === SKILL_IDS.bloodChant)).toMatchObject({ cooldown: 45, emberCost: 25 });
    expect(WARDEN_SKILLS.find((s) => s.id === SKILL_IDS.gritTeeth)?.emberCost).toBeUndefined();
  });

  it('are learnable only after tier 2; tier 4 is refused', () => {
    const r = rig();
    wardenPlugin.setup(r.f.ctx);
    r.progression.grantXp(xpForLevel(14), 'x');
    expect(r.progression.canLearn(SKILL_IDS.whirlingHew)).toEqual({ ok: false, reason: 'missing-prereq' });
    for (const id of T1_2) expect(r.progression.learn(id)).toEqual({ ok: true });
    for (const id of [SKILL_IDS.whirlingHew, SKILL_IDS.gritTeeth, SKILL_IDS.bloodChant]) expect(r.progression.learn(id), id).toEqual({ ok: true });
    for (const id of ['warden.skullsplitter', 'warden.earthroot', 'warden.frenziedHearth']) {
      expect(r.progression.canLearn(id), id).toEqual({ ok: false, reason: 'master', textKey: 'hud.skills.act3' });
    }
  });
});

describe('tier 3 in the plugin', () => {
  it('registers the Grit Teeth modifier and two handlers; setup twice does not throw and dispose releases everything', () => {
    const r = rig();
    wardenPlugin.setup(r.f.ctx);
    expect([...r.modifierIds]).toEqual([GRIT_TEETH.modifierId]);
    expect(() => wardenPlugin.setup(r.f.ctx)).not.toThrow();
    expect([...r.modifierIds]).toEqual([GRIT_TEETH.modifierId]);
    expect((console.warn as any).mock.calls.filter((c: string[]) => /Whirling|Blood|Grit/.test(String(c[0])))).toEqual([]);
    learnAll(r, ...T1_2, SKILL_IDS.whirlingHew, SKILL_IDS.bloodChant);
    wardenPlugin.dispose?.();
    expect(r.modifierIds.size).toBe(0);
    expect(r.f.systems).toEqual([]);
    expect(r.f.world.events.count()).toBe(0);
    r.progression.assign(0, SKILL_IDS.whirlingHew);
    expect(r.abilities.use(0)).toMatchObject({ ok: false });
    expect(r.ember.value).toBe(100);
    wardenPlugin.setup(r.f.ctx);
    expect(r.abilities.use(0)).toEqual({ ok: true });
  });

  it('Whirling Hew through the abilities service: Ember 20, cooldown 14, hits after the blade is hot, refusals cost nothing', () => {
    const r = rig();
    wardenPlugin.setup(r.f.ctx);
    learnAll(r, ...T1_2, SKILL_IDS.whirlingHew);
    r.progression.assign(0, SKILL_IDS.whirlingHew);
    r.f.world.actors.add(new FakeActor('wolf', 'hostile', 1, 0));
    r.verbs.busy = true;
    expect(r.abilities.use(0)).toEqual({ ok: false, reason: 'handler-failed', detail: 'busy' });
    expect(r.ember.value).toBe(100);
    r.verbs.busy = false;
    expect(r.abilities.use(0)).toEqual({ ok: true });
    expect(r.ember.value).toBe(100 - WHIRLING_HEW.emberCost);
    expect(r.abilities.cooldown(0).remaining).toBeCloseTo(14);
    expect(r.spawned.map((s) => s.id)).toEqual(['whirling-hew']);
    r.f.tick(WHIRLING_HEW.ticks);
    expect(r.f.world.damage.applied).toHaveLength(1);
    expect(r.f.world.damage.applied[0]).toMatchObject({ targetId: 'wolf', attackId: WHIRLING_HEW.attackId });
    expect(r.abilities.use(0)).toMatchObject({ ok: false });
  });

  it('Whirling Hew: a stagger mid-swing cancels it; a respec stops it', () => {
    const r = rig();
    wardenPlugin.setup(r.f.ctx);
    learnAll(r, ...T1_2, SKILL_IDS.whirlingHew);
    r.progression.assign(0, SKILL_IDS.whirlingHew);
    r.f.world.actors.add(new FakeActor('wolf', 'hostile', 1, 0));
    r.abilities.use(0);
    r.f.tick(3);
    r.verbs.staggered = true;
    r.f.tick(WHIRLING_HEW.ticks);
    expect(r.f.world.damage.applied).toEqual([]);
  });

  it('Grit Teeth: a player stagger starts its buff and effect; it ends with a class change', () => {
    const r = rig();
    wardenPlugin.setup(r.f.ctx);
    learnAll(r, ...T1_2, SKILL_IDS.gritTeeth);
    const evs = r.f.world.events;
    evs.emit('actor.staggered' as never, { actorId: 'player', byId: null } as never);
    expect(evs.log.filter((l) => l.type === 'buff.applied').map((l) => (l.payload as any).id)).toEqual([GRIT_TEETH.buffId]);
    expect(r.spawned.map((s) => s.id)).toEqual(['grit-teeth']);
    evs.emit('class.changed' as never, { classId: 'knight', previous: 'warden', free: true, cost: 0 } as never);
    expect(r.spawned[0].stopped).toBe(true);
  });

  it('Grit Teeth unlearned does nothing', () => {
    const r = rig();
    wardenPlugin.setup(r.f.ctx);
    r.f.world.events.emit('actor.staggered' as never, { actorId: 'player', byId: null } as never);
    expect(r.spawned).toEqual([]);
  });

  it('Blood Chant through the abilities service: Ember 25, cooldown 45, buff and rune for 20 s, ends on expiry', () => {
    const r = rig();
    wardenPlugin.setup(r.f.ctx);
    learnAll(r, ...T1_2, SKILL_IDS.bloodChant);
    r.progression.assign(1, SKILL_IDS.bloodChant);
    expect(r.abilities.use(1)).toEqual({ ok: true });
    expect(r.ember.value).toBe(100 - BLOOD_CHANT.emberCost);
    expect(r.abilities.cooldown(1).remaining).toBeCloseTo(45);
    expect(r.spawned.map((s) => s.id)).toEqual(['blood-rune']);
    const applied = r.f.world.events.log.filter((l) => l.type === 'buff.applied');
    expect(applied.map((l) => l.payload)).toEqual([{ id: BLOOD_CHANT.buffId, nameKey: BLOOD_CHANT.nameKey, seconds: 20 }]);
    r.f.tick(60 * 20 + 2);
    expect(r.f.world.events.log.filter((l) => l.type === 'buff.removed').map((l) => (l.payload as any).id)).toEqual([BLOOD_CHANT.buffId]);
    expect(r.spawned[0].stopped).toBe(true);
  });

  it('Blood Chant: an ally hit during the buff reaches the status service; none after the class changes', () => {
    const r = rig();
    wardenPlugin.setup(r.f.ctx);
    learnAll(r, ...T1_2, SKILL_IDS.bloodChant);
    r.progression.assign(1, SKILL_IDS.bloodChant);
    r.f.world.actors.add(new FakeActor('hrolf', 'ally', 3, 0));
    r.f.world.actors.add(new FakeActor('wolf', 'hostile', 1, 0));
    r.abilities.use(1);
    const hit = { attackerId: 'hrolf', targetId: 'wolf', amount: 5, poise: 5, kind: 'melee', outcome: 'hit', dealt: 5, poiseDealt: 0, healthAfter: 90, killed: false, saved: false, staggered: false };
    r.f.world.events.emit('damage.dealt' as never, hit as never);
    expect(r.status.apply).toHaveBeenCalledWith('wolf', expect.objectContaining({ id: 'warden.bloodChant.bleed', kind: 'bleed', dps: 2, seconds: 5, sourceId: 'hrolf' }));
    r.f.world.events.emit('class.changed' as never, { classId: 'knight', previous: 'warden', free: true, cost: 0 } as never);
    r.status.apply.mockClear();
    r.f.world.events.emit('damage.dealt' as never, hit as never);
    expect(r.status.apply).not.toHaveBeenCalled();
  });

  it('loads without the abilities, status and vfx services', () => {
    const r = rig();
    delete r.f.services.abilities;
    delete r.f.services.status;
    delete r.f.services.vfx;
    expect(() => wardenPlugin.setup(r.f.ctx)).not.toThrow();
    expect(() => r.f.tick(3)).not.toThrow();
    expect(console.warn).toHaveBeenCalled();
  });
});

describe('Whirling Hew against a real EnemyManager (mercy)', () => {
  const DT = FIXED_TIMESTEP;
  let gltf: Awaited<ReturnType<typeof loadKnight>>;
  beforeAll(async () => {
    gltf = await loadKnight();
  });
  const SPAWNERS: SpawnerDef[] = [
    { id: 'pair', enemy: 'blighted-soldier', count: 2, anchor: 'spawn.pair', band: { min: 1, max: 1 }, activation: 'manual', respawn: 'never', leash: false },
  ];

  it('does not strike a foe yielding or staggered for mercy; it still hits the other', () => {
    const fake = new FakeHost(gltf.scene, { playerFeet: { x: 0, y: 0, z: -1.5 } });
    fake.defineAnchor('spawn.pair', 0, 0);
    const manager = new EnemyManager(fake.host, FakeHost.factory(gltf), { spawners: SPAWNERS, seed: 7 });
    manager.service.setMercyUnlocked('spare', true);
    const tick = (n: number) => {
      for (let i = 0; i < n; i++) {
        manager.think(DT);
        manager.animate(DT);
        fake.combatStep(DT);
        manager.react(DT);
      }
    };
    const ids = manager.service.spawnGroup('pair', { aggro: true });
    tick(6);
    const broken = fake.actorMap.get(ids[0])!;
    broken.health = broken.maxHealth * 0.4;
    fake.stagger(ids[0], 'player');
    tick(2);
    expect(broken.mercyState?.()).not.toBe('none');
    expect(fake.actorMap.get(ids[1])!.mercyState?.()).toBe('none');

    const applied: any[] = [];
    const hew = new WhirlingHew(
      {
        actors: { get: (id: string) => fake.actorMap.get(id), all: () => fake.actorMap.values(), player: fake.player } as never,
        damage: { apply: (req) => void applied.push(req) },
        feet: () => fake.playerFeet,
        blockedReason: () => null,
        playClip: () => true,
        interrupted: () => false,
        reportTrigger: () => {},
        skillId: SKILL_IDS.whirlingHew,
      },
      () => fake.player.id,
    );
    expect(hew.start()).toEqual({ ok: true });
    for (let i = 0; i < WHIRLING_HEW.ticks; i++) hew.tick();
    expect(applied.map((a) => a.targetId)).toEqual([ids[1]]);
    expect(manager.get(ids[0])!.mercyState()).not.toBe('none');
  });
});
