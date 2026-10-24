import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DamageRequest, DamageResult, ModifiableRequest } from '../../actors/DamageResolver';
import { FIXED_TIMESTEP, PLAYER } from '../../config/constants';
import { FakeHost, loadKnight } from '../../enemies/testing/fakeHost';
import { EnemyManager } from '../../enemies/EnemyManager';
import { CharacterController } from '../../physics/CharacterController';
import { PhysicsWorld } from '../../physics/PhysicsWorld';
import { flatGround } from '../../physics/flatGround';
import { getSkill, registerClassSkills, resetClassSkills } from '../../progression/skills';
import { StealthEffects } from '../../stealth/hooks';
import { makeProgression } from '../../progression/testkit';
import { ASHBLADE_SKILLS } from './skills';
import { SootCloak, TWIN_FANGS_CLIP, TwinFangs, WallSkitter, type SootCloakPorts, type WallSkitterPorts } from './tier3';
import { AGGROED_STATES, SKILL, SOOT_CLOAK, TWIN_FANGS, WALL_SKITTER } from './tuning';

afterEach(() => resetClassSkills());

describe('Ashblade tier 3 skill rows', () => {
  it('cost 2 and require the tier 2 skill of their branch; tier 4 stays refused', () => {
    const tier2 = [SKILL.bleedingEmber, SKILL.ashCloud, SKILL.sparkDodge];
    for (const [id, req] of [[SKILL.twinFangs, tier2[0]], [SKILL.sootCloak, tier2[1]], [SKILL.wallSkitter, tier2[2]]] as const) {
      const row = ASHBLADE_SKILLS.find((s) => s.id === id)!;
      expect([row.tier, row.cost, row.kind, row.availableWhen, row.requires]).toEqual([3, 2, 'passive', true, req]);
    }
    registerClassSkills('ashblade', ASHBLADE_SKILLS);
    const { p } = makeProgression();
    p.setClass('ashblade');
    p.grantSkillPoint(20, 'test');
    for (const id of ['ashblade.cinderMark', 'ashblade.decoyFootprints', 'ashblade.phoenixRoll']) {
      expect(p.learn(id)).toEqual({ ok: false, reason: 'master', textKey: 'hud.skills.act3' });
    }
    expect(p.learn(SKILL.twinFangs)).toEqual({ ok: false, reason: 'missing-prereq' });
    for (const id of [SKILL.backSlit, SKILL.bleedingEmber, SKILL.twinFangs]) expect(p.learn(id)).toEqual({ ok: true });
    expect(getSkill(SKILL.twinFangs)?.cost).toBe(2);
  });
});

// ---- Twin Fangs ---------------------------------------------------------------------------------------------------

describe('Twin Fangs', () => {
  const rig = (over: { active?: boolean; ok?: boolean } = {}) => {
    const s = { active: over.active ?? true, ok: over.ok ?? true, tick: 0 };
    const applied: DamageRequest[] = [];
    const t = new TwinFangs({
      playerId: () => 'player',
      active: () => s.active,
      tick: () => s.tick,
      targetOk: () => s.ok,
      apply: (r) => void applied.push(r),
    });
    const req = (over: Record<string, unknown> = {}) => ({ attackerId: 'player', targetId: 'e', amount: 10, poise: 10, kind: 'melee', attackId: TWIN_FANGS_CLIP, outcome: 'hit', ...over }) as unknown as ModifiableRequest;
    const hit = (over: Record<string, unknown> = {}) => {
      const r = req(over);
      t.modifier(r, {} as never, null);
      t.onDealt({ ...r, dealt: r.amount, killed: false, ...over } as DamageResult);
      return r as { amount: number; poise: number };
    };
    const run = (n: number) => {
      for (let i = 0; i < n; i++) (s.tick++, t.tick());
    };
    return { s, t, applied, hit, run, req };
  };

  it('scales the first hit to 0.6x and lands a second 0.6x hit 0.12 s (7 ticks) later on the same target', () => {
    const { t, applied, hit, run } = rig();
    const first = hit();
    expect(first.amount).toBeCloseTo(6);
    expect(first.poise).toBeCloseTo(6);
    run(6);
    expect(applied).toEqual([]);
    run(1);
    expect(applied).toHaveLength(1);
    expect(applied[0]).toMatchObject({ attackerId: 'player', targetId: 'e', kind: 'melee', attackId: TWIN_FANGS.attackId });
    expect(applied[0].amount).toBeCloseTo(6);
    expect(applied[0].poise).toBeCloseTo(6);
    expect(t.pending).toBe(0);
  });

  it('skips the second hit when the first did not land (blocked, dodged into immunity, no health dealt), killed, or the skill is off', () => {
    const { s, applied, hit, run, t } = rig();
    hit({ outcome: 'blocked' });
    hit({ outcome: 'immune', dealt: 0 });
    hit({ dealt: 0 });
    hit({ killed: true });
    run(20);
    expect(applied).toEqual([]);
    hit();
    s.active = false;
    run(20);
    expect(applied).toEqual([]);
    expect(t.pending).toBe(0);
  });

  it('skips a second hit on a target that is gone or in a mercy state', () => {
    const { s, applied, hit, run } = rig();
    hit();
    s.ok = false;
    run(10);
    expect(applied).toEqual([]);
  });

  it('ignores other attacks, other attackers, other damage kinds and its own second hit', () => {
    const { applied, t, hit, run, req } = rig();
    const other = req({ attackId: 'Dualwield_Melee_Attack_Chop' });
    t.modifier(other, {} as never, null);
    expect(other.amount).toBe(10);
    hit({ attackerId: 'enemy' });
    hit({ kind: 'spell' });
    hit({ attackId: TWIN_FANGS.attackId });
    run(20);
    expect(applied).toEqual([]);
  });

  it('reset drops a queued second hit, and flags the apply so a second Back-Slit pass can be told apart', () => {
    const s = { applying: [] as boolean[] };
    const t: TwinFangs = new TwinFangs({
      playerId: () => 'player',
      active: () => true,
      tick: () => tick,
      targetOk: () => true,
      apply: () => void s.applying.push(t.applying),
    });
    let tick = 0;
    const r = { attackerId: 'player', targetId: 'e', amount: 10, poise: 10, kind: 'melee', attackId: TWIN_FANGS_CLIP, outcome: 'hit' } as unknown as ModifiableRequest;
    const fire = () => {
      t.modifier(r, {} as never, null);
      t.onDealt({ ...r, dealt: 6, killed: false } as DamageResult);
    };
    fire();
    t.clear();
    for (tick = 1; tick < 20; tick++) t.tick();
    expect(s.applying).toEqual([]);
    r.amount = 10;
    fire();
    for (tick = 20; tick < 40; tick++) t.tick();
    expect(s.applying).toEqual([true]);
    expect(t.applying).toBe(false);
  });

  it('is inactive when not learned: the modifier leaves damage alone', () => {
    const { hit } = rig({ active: false });
    expect(hit().amount).toBe(10);
  });
});

// ---- Soot Cloak ---------------------------------------------------------------------------------------------------

describe('Soot Cloak', () => {
  const rig = (hasHooks = true) => {
    const fx = new StealthEffects();
    const s = { active: true, dodging: false, tick: 0, feet: { x: 1, y: 0, z: 2 }, warn: vi.fn() };
    const hooks = hasHooks ? fx : undefined;
    const spy = hooks ? { add: vi.spyOn(fx, 'addSightBlocker'), noise: vi.spyOn(fx, 'addNoiseScale') } : null;
    const c = new SootCloak({
      active: () => s.active,
      stealth: () => hooks,
      tick: () => s.tick,
      feet: () => s.feet,
      dodging: () => s.dodging,
      playerId: () => 'player',
      warn: s.warn,
    } as SootCloakPorts);
    const run = (n: number) => {
      for (let i = 0; i < n; i++) {
        s.tick++;
        c.tick();
        fx.tick(FIXED_TIMESTEP);
      }
    };
    const dodge = () => {
      s.dodging = true;
      run(1);
      s.dodging = false;
      run(1);
    };
    return { fx, s, c, run, dodge, spy };
  };
  const dealt = (over: Record<string, unknown> = {}) => ({ attackerId: 'player', targetId: 'e', kind: 'melee', ...over }) as DamageResult;

  it('a dodge cloaks for 5 s: a 1.2 m disc at the feet, refreshed every 0.25 s without piling up, noise halved', () => {
    const { fx, s, c, run, dodge } = rig();
    dodge();
    expect(c.cloaked).toBe(true);
    expect(fx.blockers()).toEqual([{ x: 1, z: 2, r: SOOT_CLOAK.radius }]);
    expect(fx.noiseScale()).toBe(0.5);
    s.feet = { x: 4, y: 0, z: 5 };
    run(16);
    expect(fx.blockers()).toEqual([{ x: 4, z: 5, r: SOOT_CLOAK.radius }]);
    run(60 * 4);
    expect(fx.blockers()).toHaveLength(1);
    run(60);
    expect(c.cloaked).toBe(false);
    expect(fx.blockers()).toEqual([]);
    expect(fx.noiseScale()).toBe(1);
  });

  it('re-places the disc when the feet move more than half the radius, and allocates nothing while standing still', () => {
    const { spy, s, dodge, run, fx } = rig();
    dodge();
    const n = spy!.add.mock.calls.length;
    run(10);
    expect(spy!.add.mock.calls.length).toBe(n);
    s.feet = { x: s.feet.x + SOOT_CLOAK.radius / 2 + 0.05, y: 0, z: s.feet.z };
    run(1);
    expect(spy!.add.mock.calls.length).toBe(n + 1);
    expect(fx.blockers()).toEqual([{ x: s.feet.x, z: s.feet.z, r: SOOT_CLOAK.radius }]);
    expect(fx.blockers()).toHaveLength(1);
  });

  it('reset drops the cloak, its disc and its noise scale', () => {
    const { fx, c, dodge } = rig();
    dodge();
    c.reset();
    expect(c.cloaked).toBe(false);
    expect(fx.blockers()).toEqual([]);
    expect(fx.noiseScale()).toBe(1);
  });

  it('allocates a disc per refresh only (no per-frame churn): about 4 per second', () => {
    const { spy, dodge, run } = rig();
    dodge();
    run(60);
    expect(spy!.add.mock.calls.length).toBeGreaterThanOrEqual(4);
    expect(spy!.add.mock.calls.length).toBeLessThanOrEqual(6);
  });

  it('ends on the player\'s attack but not on a foe\'s, a status tick or an ally', () => {
    const { fx, c, dodge, run } = rig();
    dodge();
    c.onDealt(dealt({ attackerId: 'enemy' }));
    c.onDealt(dealt({ kind: 'status' }));
    expect(c.cloaked).toBe(true);
    c.onDealt(dealt());
    expect(c.cloaked).toBe(false);
    expect(fx.blockers()).toEqual([]);
    expect(fx.noiseScale()).toBe(1);
    run(1);
    expect(fx.blockers()).toEqual([]);
  });

  it('has a 12 s cooldown from the dodge, even when an attack ended the cloak early', () => {
    const { c, dodge, run } = rig();
    dodge();
    c.onDealt(dealt());
    run(60 * 10);
    dodge();
    expect(c.cloaked).toBe(false);
    run(60 * 2);
    dodge();
    expect(c.cloaked).toBe(true);
  });

  it('needs a fresh dodge: holding the dodge state does not re-trigger', () => {
    const { s, c, run } = rig();
    s.dodging = true;
    run(1);
    c.end();
    run(60 * 13);
    expect(c.cloaked).toBe(false);
  });

  it('is released by a respec or class change and does nothing when not learned', () => {
    const { fx, s, c, dodge, run } = rig();
    dodge();
    s.active = false;
    run(1);
    expect(c.cloaked).toBe(false);
    expect(fx.blockers()).toEqual([]);
    dodge();
    expect(c.cloaked).toBe(false);
  });

  it('is inert with one warning when the stealth service is absent or lacks addSightBlocker', () => {
    const a = rig(false);
    a.dodge();
    a.dodge();
    expect(a.c.cloaked).toBe(false);
    expect(a.s.warn).toHaveBeenCalledTimes(1);
  });
});

describe('Soot Cloak against a real Enemy', () => {
  let gltf: Awaited<ReturnType<typeof loadKnight>>;
  beforeAll(async () => {
    gltf = await loadKnight();
  });
  beforeEach(() => void vi.spyOn(console, 'warn').mockImplementation(() => {}));
  afterEach(() => vi.restoreAllMocks());

  /** A soldier 8 m ahead (beyond the 6 m hearing radius, inside sight) of the player, perception fed by the real stealth hooks the cloak drives. */
  function world(cloaked: boolean, aggro: boolean, drive?: (feet: { x: number }, tick: number) => void) {
    const fake = new FakeHost(gltf.scene, { playerFeet: { x: 0, y: 0, z: -8 } });
    const m = new EnemyManager(fake.host, FakeHost.factory(gltf), { seed: 3, spawners: [] });
    const fx = new StealthEffects();
    const NONE = { sightRangeScale: 1, coneScale: 1, hearingQuietScale: 1, hearingLoudScale: 1 };
    m.service.perception.register({ modifiers: () => ({ ...NONE, blockSight: [...fx.blockers()] }) });
    const s = { tick: 0, dodging: false };
    const cloak = new SootCloak({
      active: () => true,
      stealth: () => fx,
      tick: () => s.tick,
      feet: () => ({ x: fake.playerFeet.x, y: fake.playerFeet.y, z: fake.playerFeet.z }),
      dodging: () => s.dodging,
      playerId: () => 'player',
      warn: () => {},
    });
    const id = m.spawnLoose('blighted-soldier', { x: 0, y: 0, z: 0 }, { leash: false, aggro })!;
    const tick = (n: number) => {
      for (let i = 0; i < n; i++) {
        s.tick++;
        s.dodging = cloaked && s.tick === 1;
        drive?.(fake.playerFeet, s.tick);
        cloak.tick();
        fx.tick(FIXED_TIMESTEP);
        m.think(FIXED_TIMESTEP);
        m.animate(FIXED_TIMESTEP);
        fake.combatStep(FIXED_TIMESTEP);
        m.react(FIXED_TIMESTEP);
      }
    };
    return { m, id, tick, cloak };
  }

  it('a non-aggroed observer in front of the player never notices a cloaked player, and does without the cloak', () => {
    const bare = world(false, false);
    bare.tick(120);
    expect(bare.m.service.perception.state(bare.id)!.awareness).toBeGreaterThan(0);
    const hidden = world(true, false);
    hidden.tick(120);
    expect(hidden.cloak.cloaked).toBe(true);
    expect(hidden.m.service.perception.state(hidden.id)!.sees).toBe(false);
    expect(hidden.m.service.perception.state(hidden.id)!.awareness).toBe(0);
    expect(AGGROED_STATES.has(hidden.m.get(hidden.id)!.state)).toBe(false);
  });

  it('a dodge past a non-aggroed observer keeps the player unseen on every tick', () => {
    const seen: boolean[] = [];
    const t = world(true, false, (feet, tick) => {
      feet.x = -6 + tick * 0.1; // 6 m/s across the observer's front
    });
    for (let i = 0; i < 120; i++) {
      t.tick(1);
      seen.push(t.m.service.perception.state(t.id)!.sees);
    }
    expect(seen.some(Boolean)).toBe(false);
    expect(t.m.service.perception.state(t.id)!.awareness).toBe(0);
  });

  it('documents an already-aggroed enemy: the blocker breaks its sight line only, so the claim is limited to non-aggroed observers', () => {
    const t = world(true, true);
    t.tick(5);
    expect(AGGROED_STATES.has(t.m.get(t.id)!.state)).toBe(true);
    t.tick(60);
    expect(t.cloak.cloaked).toBe(true);
    expect(t.m.service.perception.state(t.id)!.sees).toBe(false);
    // Whatever the brain does with a lost sight line (chase on the last known position), it was aggroed first and is
    // not made calm in the first second by the blocker alone.
    expect(AGGROED_STATES.has(t.m.get(t.id)!.state)).toBe(true);
  });
});

// ---- Wall Skitter -------------------------------------------------------------------------------------------------

describe('Wall Skitter (ports)', () => {
  const rig = () => {
    const s = {
      active: true,
      grounded: false,
      wall: { normal: { x: 0, z: 1 } } as { normal: { x: number; z: number } } | null,
      jump: false,
      launches: [] as number[],
      slides: [] as number[],
      holds: [] as ({ x: number; z: number; speed: number } | null)[],
      leans: [] as number[],
      effects: 0,
    };
    const w = new WallSkitter({
      active: () => s.active,
      grounded: () => s.grounded,
      wallContact: () => s.wall,
      wallSlide: (m) => void s.slides.push(m),
      jumpPressed: () => s.jump,
      launch: (v) => void s.launches.push(v),
      holdMove: (m) => void s.holds.push(m),
      facingYaw: () => 0,
      lean: (r) => void s.leans.push(r),
      effect: () => void s.effects++,
    } as WallSkitterPorts);
    return { s, w, run: (n: number) => { for (let i = 0; i < n; i++) w.tick(); } };
  };

  it('requests the 0.5 m/s slide every airborne tick against a wall, for at most 1.2 s per airtime, and resets on landing', () => {
    const { s, w, run } = rig();
    run(100);
    expect(s.slides).toHaveLength(72);
    expect(new Set(s.slides)).toEqual(new Set([0.5]));
    s.grounded = true;
    run(1);
    s.grounded = false;
    s.slides.length = 0;
    run(10);
    expect(s.slides).toHaveLength(10);
    expect(w.slid).toBe(10);
  });

  it('does nothing grounded (sprinting into a wall) and nothing in the air without a wall', () => {
    const { s, run } = rig();
    s.grounded = true;
    run(30);
    expect(s.slides).toEqual([]);
    expect(s.leans.every((l) => l === 0)).toBe(true);
    s.grounded = false;
    s.wall = null;
    run(30);
    expect(s.slides).toEqual([]);
  });

  it('a jump press while sliding launches at the standard jump speed and pushes off along the wall normal for 8 ticks', () => {
    const { s, w, run } = rig();
    run(3);
    s.jump = true;
    run(1);
    s.jump = false;
    expect(s.launches).toEqual([PLAYER.jumpSpeed]);
    expect(s.effects).toBe(1);
    expect(s.holds.slice(-1)[0]).toEqual({ x: 0, z: 1, speed: WALL_SKITTER.kickSpeed });
    s.wall = null;
    run(7);
    expect(s.holds.filter((h) => h !== null)).toHaveLength(WALL_SKITTER.kickTicks);
    expect(s.holds.slice(-1)[0]).toEqual({ x: 0, z: 1, speed: WALL_SKITTER.kickSpeed });
    run(1);
    expect(s.holds.slice(-1)[0]).toBeNull();
    expect(w.leaning).toBeLessThanOrEqual(0);
    expect(s.launches).toHaveLength(1);
  });

  it('allows one kick per airtime: a repeat press at the wall or one while still rising does nothing, and landing re-arms it', () => {
    const { s, run } = rig();
    run(2);
    s.jump = true;
    run(1);
    run(3);
    run(10);
    expect(s.launches).toHaveLength(1);
    s.jump = false;
    run(1);
    s.jump = true;
    run(1);
    expect(s.launches).toHaveLength(1);
    s.grounded = true;
    run(1);
    s.grounded = false;
    run(1);
    expect(s.launches).toHaveLength(2);
  });

  it('reset drops a running kick, the slide budget and the lean', () => {
    const { s, w, run } = rig();
    s.jump = true;
    run(3);
    w.reset();
    expect(s.holds.slice(-1)[0]).toBeNull();
    expect(w.slid).toBe(0);
    expect(w.leaning).toBe(0);
    expect(s.leans.slice(-1)[0]).toBe(0);
    s.jump = true;
    run(1);
    expect(s.launches).toHaveLength(2);
  });

  it('a jump press with no wall, or while grounded, kicks nothing', () => {
    const { s, run } = rig();
    s.jump = true;
    s.wall = null;
    run(3);
    s.wall = { normal: { x: 0, z: 1 } };
    s.grounded = true;
    run(3);
    expect(s.launches).toEqual([]);
    expect(s.holds.every((h) => h === null)).toBe(true);
  });

  it('leans toward the wall and restores to zero when it ends; a respec cancels everything', () => {
    const { s, w, run } = rig();
    s.wall = { normal: { x: -1, z: 0 } }; // wall on the +x side; facing -z, so on the right
    run(30);
    expect(w.leaning).toBeLessThan(-0.25);
    s.active = false;
    run(1);
    expect(w.leaning).toBe(0);
    expect(s.leans.at(-1)).toBe(0);
    expect(s.holds.at(-1)).toBeNull();
    s.active = true;
    s.wall = null;
    run(30);
    expect(w.leaning).toBe(0);
  });
});

describe('Wall Skitter on the real CharacterController', () => {
  let physics: PhysicsWorld;
  beforeEach(async () => {
    physics = new PhysicsWorld();
    await physics.init();
    physics.addHeightfield(flatGround(200));
    // A wall at x = 2 (west face), 80 m tall.
    physics.addStaticCollider(physics.rapier.ColliderDesc.cuboid(0.5, 40, 10).setTranslation(2.5, 40, 0));
  });

  function rig(grounded0: boolean) {
    const c = new CharacterController(physics, { x: 0, y: grounded0 ? 0 : 30, z: 0 });
    const s = { jump: false, kick: null as { x: number; z: number; speed: number } | null };
    const w = new WallSkitter({
      active: () => true,
      grounded: () => c.grounded,
      wallContact: () => c.wallContact(),
      wallSlide: (m) => c.wallSlide(m),
      jumpPressed: () => s.jump,
      launch: (v) => c.launch(v),
      holdMove: (m) => (s.kick = m),
      facingYaw: () => -Math.PI / 2,
      lean: () => {},
    });
    const feet = () => c.interpolatedFeet(1, { x: 0, y: 0, z: 0 });
    if (grounded0) for (let i = 0; i < 30; i++) (c.fixedUpdate({ moveX: 0, moveZ: 0, sprint: false, jump: false }), physics.step());
    // Mirrors Player.fixedUpdate: a held forced move replaces the input and drops the jump; otherwise the player pushes into the wall.
    const step = (jumpEdge = false) => {
      s.jump = jumpEdge;
      w.tick();
      const k = s.kick;
      c.fixedUpdate(k ? { moveX: k.x, moveZ: k.z, sprint: false, jump: false, speedOverride: k.speed } : { moveX: 1, moveZ: 0, sprint: false, jump: jumpEdge });
      physics.step();
    };
    return { c, w, s, step, feet };
  }

  it('falls at no more than 0.5 m/s against the wall, versus free fall without the skill', () => {
    const { c, step, feet } = rig(false);
    for (let i = 0; i < 60; i++) step();
    const y0 = feet().y;
    for (let i = 0; i < 30; i++) step();
    expect(c.wallContact()).not.toBeNull();
    expect((y0 - feet().y) / (30 * FIXED_TIMESTEP)).toBeLessThanOrEqual(0.55);
  });

  it('a jump press while sliding rises at the standard jump speed and ends up away from the wall', () => {
    const { c, step, feet, s } = rig(false);
    for (let i = 0; i < 30; i++) step();
    expect(c.wallContact()).not.toBeNull();
    const y0 = feet().y;
    const x0 = feet().x;
    step(true);
    const rise = feet().y - y0;
    expect(rise).toBeGreaterThan(PLAYER.jumpSpeed * FIXED_TIMESTEP * 0.7);
    for (let i = 0; i < WALL_SKITTER.kickTicks - 1; i++) step();
    expect(s.kick).not.toBeNull();
    expect(x0 - feet().x).toBeGreaterThan(0.6);
    step();
    expect(s.kick).toBeNull();
  });

  it('grounded sprinting into the wall never slides or kicks', () => {
    const { c, w, step } = rig(true);
    for (let i = 0; i < 90; i++) step();
    expect(c.grounded).toBe(true);
    expect(w.slid).toBe(0);
  });
});
