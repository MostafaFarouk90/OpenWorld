import * as THREE from 'three';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { FIXED_TIMESTEP } from '../../config/constants';
import { EnemyManager } from '../../enemies/EnemyManager';
import { mercyInteractableId } from '../../enemies/mercy';
import { FakeActor, FakeHost, FakeStatus, loadKnight } from '../../enemies/testing/fakeHost';
import { AI } from '../../enemies/tuning';
import type { SpawnerDef } from '../../enemies/types';
import { BreathOfTheKeepers, ColossusOfSlag, NovaYieldFloor, SunfireNova, type BreathPorts, type ColossusBody, type ColossusPorts, type NovaPorts } from './capstones';
import type { FoeView } from './skills.act3';
import { COLOSSUS, SUNFIRE_NOVA } from './tuning';

const DT = FIXED_TIMESTEP;
let gltf: Awaited<ReturnType<typeof loadKnight>>;
beforeAll(async () => {
  gltf = await loadKnight();
});
beforeEach(() => void vi.spyOn(console, 'warn').mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

const SPAWNERS: SpawnerDef[] = [
  { id: 'soldier', enemy: 'blighted-soldier', count: 1, anchor: 'spawn.a', band: { min: 1, max: 1 }, activation: 'manual', respawn: 'never', leash: false },
  { id: 'wraith', enemy: 'ash-wraith', count: 1, anchor: 'spawn.a', band: { min: 1, max: 1 }, activation: 'manual', respawn: 'never', leash: false },
];
const FIGHTING = new Set(['notice', 'chase', 'telegraph', 'attack', 'recover', 'stagger', 'yield', 'flee']);

/**
 * A real EnemyManager (the Brain, Enemy and mercy rules) with the Colossus driven by its real class. The fake core has no lethal
 * handlers, so the golem's no-kill floor is stood in for by an attacker-band modifier that caps the amount at `health - 1` for a hit
 * whose attacker is a golem: the same outcome the real lethal handler gives (`colossusNoKill`, pinned against the real resolver in
 * capstones.test.ts and capstones.plugin.test.ts), with the poise hit and its `actor.staggered` reaching the Brain as they do there.
 */
function rig(spare: boolean, kind: 'soldier' | 'wraith' = 'soldier') {
  const fake = new FakeHost(gltf.scene, { playerFeet: { x: 0, y: 0, z: 8 } });
  fake.defineAnchor('spawn.a', 0, 0);
  fake.player.health = fake.player.maxHealth = 1e6;
  const manager = new EnemyManager(fake.host, FakeHost.factory(gltf), { spawners: SPAWNERS, seed: 7 });
  if (spare) manager.service.setMercyUnlocked('spare', true);
  fake.host.damage.addModifier(
    'test.golem-floor',
    (req, target, attacker) => {
      if (attacker?.id.startsWith(COLOSSUS.idPrefix) && req.outcome === 'hit') req.amount = Math.min(req.amount, Math.max(0, target.health - 1));
    },
    // Last of all, like a lethal handler: a later multiplier (a stagger bonus) must not turn the capped hit into a kill.
    Number.MAX_SAFE_INTEGER,
  );
  const views = (): FoeView[] => {
    const out: FoeView[] = [];
    const v = new THREE.Vector3();
    for (const a of fake.actorMap.values()) {
      if (a.team !== 'hostile' || !a.root) continue;
      a.worldPosition(v);
      out.push({ id: a.id, x: v.x, y: v.y, z: v.z, live: !a.dead && a.hittable, mercy: a.mercyState?.() });
    }
    return out;
  };
  const golems: FakeActor[] = [];
  const ports = {
    playerId: () => 'player',
    isEmberwright: () => true,
    learned: () => true,
    blockedReason: () => null,
    now: () => 0,
    feet: () => ({ x: fake.playerFeet.x, y: fake.playerFeet.y, z: fake.playerFeet.z }),
    facingYaw: () => 0,
    foe: (id: string) => views().find((f) => f.id === id) ?? null,
    foes: () => views(),
    taken: (id: string) => fake.actorMap.has(id),
    stillThere: (id: string) => fake.actorMap.has(id),
    // allyEngagement.mayEngage: alive, in no mercy state, and fighting the player (a foe in a fight state).
    mayEngage: (id: string) => {
      const e = manager.get(id);
      const a = fake.actorMap.get(id);
      return !!e && !!a && !a.dead && (a.mercyState?.() ?? 'none') === 'none' && FIGHTING.has(e.state);
    },
    apply: (req: unknown) => fake.apply(req as never) as never,
    spawn: (id: string): ColossusBody => {
      const actor = new FakeActor(id, COLOSSUS.kind, { kind: COLOSSUS.kind, team: 'ally', maxHealth: 500, hittable: false });
      fake.actorMap.set(id, actor);
      golems.push(actor);
      return {
        actor,
        place: () => undefined,
        play: () => undefined,
        step: () => undefined,
        dispose: () => void fake.actorMap.delete(id),
      };
    },
  } as unknown as ColossusPorts;
  const colossus = new ColossusOfSlag(ports);
  const died: Array<{ actorId: string; killerId: string | null }> = [];
  fake.bus.on('actor.died', (e) => void died.push({ actorId: e.actorId, killerId: e.killerId }));
  const slams: Array<{ targetId: string; attackerId: string | null }> = [];
  fake.bus.on('damage.dealt', (r) => void (r.attackId === COLOSSUS.attackId && slams.push({ targetId: r.targetId, attackerId: r.attackerId })));
  const tick = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds / DT); i++) {
      colossus.update(DT);
      manager.think(DT);
      manager.animate(DT);
      fake.combatStep(DT);
      manager.react(DT);
    }
  };
  const [id] = manager.service.spawnGroup(kind, { aggro: true });
  tick(0.2);
  return { fake, manager, colossus, tick, id: id!, died, slams, golems };
}

describe('Colossus of Slag against a real Enemy and Brain', () => {
  it('a spareable foe the golem brings low yields instead of dying, is not hit again while it kneels, and the player spares it', () => {
    const s = rig(true);
    const actor = s.fake.actorMap.get(s.id)!;
    actor.health = 12; // the slam (15) would kill it: the floor leaves it at 1 HP and its poise break reaches the Brain
    expect(s.colossus.cast()).toEqual({ ok: true });
    for (let i = 0; i < 12 * 60 && s.slams.length === 0; i++) s.tick(DT);
    s.tick(0.3);
    expect(s.slams).toHaveLength(1);
    expect(s.slams[0]).toEqual({ targetId: s.id, attackerId: 'colossus:1' });
    expect(actor.dead).toBe(false);
    expect(actor.health).toBe(1);
    expect(s.manager.get(s.id)!.state).toBe('yield');
    expect(s.manager.get(s.id)!.mercyState()).toBe('yielding');
    expect(s.fake.bus.of('enemies.yield')).toHaveLength(1);
    expect(s.died).toEqual([]);
    // Kneeling: the golem leaves it alone for as long as the window is open (the resolver would drop the ally hit as well).
    s.tick(AI.yieldSeconds - 1);
    expect(s.manager.get(s.id)!.state).toBe('yield');
    expect(s.slams).toHaveLength(1);
    const hold = s.fake.interactables.get(mercyInteractableId(s.manager.get(s.id)!.slug))!;
    expect(hold.enabled!()).toBe(true);
    hold.onInteract(s.fake.player);
    expect(s.fake.bus.of('mercy')).toEqual([expect.objectContaining({ verb: 'spare', actorId: s.id })]);
    expect(s.died).toEqual([]);
  });

  it('the golem never lands the killing blow on a foe that cannot yield (Spare locked, or a wraith); the player finishing it is the killer', () => {
    for (const [spare, kind] of [[false, 'soldier'], [true, 'wraith']] as const) {
      const s = rig(spare, kind);
      const actor = s.fake.actorMap.get(s.id)!;
      actor.health = 12;
      s.colossus.cast();
      s.tick(12);
      expect(s.slams.length, kind).toBeGreaterThanOrEqual(2);
      expect(actor.dead, kind).toBe(false);
      expect(actor.health, kind).toBe(1);
      expect(s.died, kind).toEqual([]);
      expect(s.fake.bus.of('enemies.yield'), kind).toEqual([]);
      // The player's own blow kills it and the experience is the player's.
      s.fake.apply({ attackerId: 'player', targetId: s.id, amount: 5, poise: 0, kind: 'melee', attackId: 'x' } as never);
      expect(s.died, kind).toEqual([{ actorId: s.id, killerId: 'player' }]);
    }
  });

  it('a healthy foe is slammed down in steps and left at 1 HP, never killed, over a full 30 s', () => {
    const s = rig(false);
    const actor = s.fake.actorMap.get(s.id)!;
    s.colossus.cast();
    s.tick(30.2);
    expect(s.colossus.active).toBe(false);
    expect(actor.dead).toBe(false);
    expect(actor.health).toBeGreaterThanOrEqual(1);
    expect(s.died).toEqual([]);
    expect(s.golems).toHaveLength(1);
  });
});

// ---- Nova and Breath leave a kneeling foe alone -------------------------------------------------------------------------------

/** A real EnemyManager with the Nova and the Breath driven by their real classes (the core's damage rules are the fake's). */
function casterRig(floor = true) {
  const fake = new FakeHost(gltf.scene, { playerFeet: { x: 0, y: 0, z: 4 } });
  fake.defineAnchor('spawn.a', 0, 0);
  fake.player.health = fake.player.maxHealth = 1e6;
  fake.status = new FakeStatus();
  const manager = new EnemyManager(fake.host, FakeHost.factory(gltf), { spawners: SPAWNERS, seed: 7 });
  manager.service.setMercyUnlocked('spare', true);
  const views = (): FoeView[] => {
    const out: FoeView[] = [];
    const v = new THREE.Vector3();
    for (const a of fake.actorMap.values()) {
      if (a.team !== 'hostile' || !a.root) continue;
      a.worldPosition(v);
      out.push({ id: a.id, x: v.x, y: v.y, z: v.z, live: !a.dead && a.hittable, mercy: a.mercyState?.() });
    }
    return out;
  };
  if (floor) {
    const yieldFloor = new NovaYieldFloor({
      playerId: () => 'player',
      // The same read the plugin makes.
      canYield: (id: string) => manager.service.mercyUnlocked('spare') && manager.service.ground.get(id)?.def.mercy?.when === 'yielding',
    });
    fake.host.damage.addModifier(SUNFIRE_NOVA.yieldFloorId, yieldFloor.modify as never, SUNFIRE_NOVA.yieldFloorOrder);
  }
  const common = {
    playerId: () => 'player',
    isEmberwright: () => true,
    learned: () => true,
    blockedReason: () => null,
    now: () => 0,
    feet: () => ({ x: fake.playerFeet.x, y: fake.playerFeet.y, z: fake.playerFeet.z }),
    facingYaw: () => 0, // forward is -z: the foe at the origin is dead ahead
    foe: (id: string) => views().find((f) => f.id === id) ?? null,
    foes: () => views(),
    apply: (req: unknown) => fake.apply(req as never) as never,
    ignite: (id: string, spec: unknown) => (fake.status as FakeStatus).apply(id, spec as never),
    statuses: () => [],
    interrupted: () => false,
    lockMove: () => () => undefined,
  };
  const nova = new SunfireNova(common as unknown as NovaPorts);
  const breath = new BreathOfTheKeepers({ ...common, allies: () => [], heal: () => 0 } as unknown as BreathPorts);
  const [id] = manager.service.spawnGroup('soldier', { aggro: true });
  const revoked: unknown[] = [];
  fake.bus.on('mercy.revoked', (e) => void revoked.push(e));
  const hits: string[] = [];
  fake.bus.on('damage.dealt', (r) => void (r.attackerId === 'player' && hits.push(r.attackId ?? '')));
  const tick = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds / DT); i++) {
      nova.update(DT);
      breath.update(DT);
      manager.think(DT);
      manager.animate(DT);
      fake.combatStep(DT);
      manager.react(DT);
    }
  };
  tick(0.1);
  return { fake, manager, nova, breath, tick, id: id!, revoked, hits };
}

describe('Sunfire Nova and Breath of the Keepers against a real Enemy and Brain', () => {
  /** The soldier kneels (a poise break under half health with Spare unlocked). */
  const kneel = (s: ReturnType<typeof casterRig>) => {
    const actor = s.fake.actorMap.get(s.id)!;
    actor.health = actor.maxHealth * 0.4;
    s.fake.stagger(s.id, 'player');
    s.tick(0.3);
    expect(s.manager.get(s.id)!.state).toBe('yield');
    return actor;
  };

  it('the Nova ring passes over a kneeling foe without touching it: no hit, no ignite, Spare still open, nothing revoked', () => {
    const s = casterRig();
    const actor = kneel(s);
    const hp = actor.health;
    s.hits.length = 0;
    expect(s.nova.cast()).toMatchObject({ ok: false, reason: 'no-target' }); // a kneeling foe is not a target either
    s.fake.stagger(s.id, 'player');
    expect(s.manager.get(s.id)!.state).toBe('yield');
    // With a second, fighting foe in range the ring does come, and still leaves the kneeling one alone.
    const [other] = s.manager.service.spawnGroup('wraith', { aggro: true });
    s.tick(0.2);
    expect(s.nova.cast()).toEqual({ ok: true });
    s.tick(1.4);
    expect(s.hits).toContain(SUNFIRE_NOVA.attackId);
    expect(s.fake.actorMap.get(other!)!.health).toBeLessThan(s.fake.actorMap.get(other!)!.maxHealth);
    expect(actor.health).toBe(hp);
    expect(s.manager.get(s.id)!.mercyState()).toBe('yielding');
    expect((s.fake.status as FakeStatus).calls.filter((c) => c.actorId === s.id)).toEqual([]);
    expect(s.revoked).toEqual([]);
  });

  it('the Breath cone passes over a kneeling foe without touching it', () => {
    const s = casterRig();
    const actor = kneel(s);
    const hp = actor.health;
    s.hits.length = 0;
    expect(s.breath.cast()).toEqual({ ok: true });
    s.tick(1.2); // the yield window is 2 s and 0.3 s of it has gone: the four ticks in it all pass the kneeling foe by
    expect(s.breath.ticksDone).toBe(4);
    expect(s.hits).toEqual([]);
    expect(actor.health).toBe(hp);
    expect(s.manager.get(s.id)!.mercyState()).toBe('yielding');
    expect((s.fake.status as FakeStatus).calls).toEqual([]);
    expect(s.revoked).toEqual([]);
  });

  it('the Nova on a yield-capable foe below half health and at or under 30 HP leaves it at 1 HP and it yields, spareable (the ring cannot kill it)', () => {
    const s = casterRig();
    const actor = s.fake.actorMap.get(s.id)!;
    actor.health = 25; // under the 50% line (60 max) but its poise is not broken yet
    expect(s.nova.cast()).toEqual({ ok: true });
    s.tick(1.4);
    expect(actor.dead).toBe(false);
    expect(actor.health).toBe(1);
    expect(s.manager.get(s.id)!.state).toBe('yield');
    expect(s.manager.get(s.id)!.mercyState()).toBe('yielding');
    expect(s.revoked).toEqual([]);
  });

  it('the control: without the floor the same Nova kills that foe, so the floor is what keeps it alive', () => {
    const s = casterRig(false);
    const actor = s.fake.actorMap.get(s.id)!;
    actor.health = 25;
    s.nova.cast();
    s.tick(1.4);
    expect(actor.dead).toBe(true);
  });

  it('the Nova on a healthy foe in the ring staggers it and does not kill it; the damage and poise are the pipeline\'s', () => {
    const s = casterRig();
    const actor = s.fake.actorMap.get(s.id)!;
    expect(s.nova.cast()).toEqual({ ok: true });
    s.tick(1.4);
    expect(actor.dead).toBe(false);
    expect(actor.health).toBeLessThanOrEqual(actor.maxHealth - 30 + 1e-6);
    expect(actor.poise).toBe(0);
    expect((s.fake.status as FakeStatus).calls.some((c) => c.actorId === s.id && c.spec.id === SUNFIRE_NOVA.igniteId)).toBe(true);
  });
});
