import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { ActorRegistry } from '../actors/ActorRegistry';
import type { CombatRegistry } from '../actors/CombatRegistry';
import { DamageResolver } from '../actors/DamageResolver';
import { playerInit } from '../actors/teams';
import { GameEvents, type GameEventMap } from '../core/events';
import { GuardModel } from '../player/GuardModel';
import { BLOCKING, BlockingDummies } from './BlockingDummies';
import { TrainingDummies } from './TrainingDummies';

const DT = 1 / 60;
const SPOT = { feet: { x: 0, y: 0, z: -2 }, yaw: 0 }; // faces +Z, towards the player at the origin

function rig(opts: { playerFeet?: { x: number; y: number; z: number } } = {}) {
  const events = new GameEvents(() => {});
  const actors = new ActorRegistry(events);
  const damage = new DamageResolver(actors, events, () => {});
  const player = actors.spawn(playerInit());
  const scene = new THREE.Group();
  const targets = new Set<unknown>();
  const combat = {
    addTarget: (set: unknown) => {
      targets.add(set);
      return () => targets.delete(set);
    },
  } as unknown as CombatRegistry;
  const feet = { ...(opts.playerFeet ?? { x: 0, y: 0, z: 0 }) };
  const warn = vi.fn();
  const mgr = new BlockingDummies({ scene, actors, damage, events, combat, playerFeet: () => feet, rng: () => 0.5, warn });
  const seen: Array<{ type: keyof GameEventMap; payload: any }> = [];
  events.onAny((type, payload) => seen.push({ type, payload }));
  const of = (t: keyof GameEventMap) => seen.filter((s) => s.type === t).map((s) => s.payload);

  // Stand-in for the player's guard (CombatVerbs.guardModifier + onDamage) on the real GuardModel.
  const guard = new GuardModel();
  let tick = 0;
  damage.addModifier(
    'test.player-guard',
    (req, target) => {
      if (target.id !== player.id || req.outcome === 'immune') return;
      const res = guard.resolve(req, { tick, facingYaw: 0, stamina: { canAfford: () => true } });
      if (res.outcome === 'parried') Object.assign(req, { outcome: 'parried', amount: 0, poise: 0 });
      else if (res.outcome === 'blocked') req.outcome = 'blocked';
    },
    -90,
  );
  events.on('damage.dealt', (r) => {
    if (r.targetId !== player.id) return;
    if (r.outcome === 'parried') events.emit('player.parried', { attackerId: r.attackerId });
    if (r.outcome === 'blocked') events.emit('player.blocked', { attackerId: r.attackerId });
  });
  events.on('attack.window', (e) => guard.onWindow(e, tick));

  const step = (seconds: number) => {
    const n = Math.round(seconds / DT);
    for (let i = 0; i < n; i++) {
      tick++;
      mgr.update(DT);
    }
  };
  const hit = (targetId: string, poise = 10, attackerId: string | null = player.id) =>
    damage.apply({ attackerId, targetId, amount: 10, poise, kind: 'melee', direction: new THREE.Vector3(0, 0, -1) });
  return { events, actors, damage, player, scene, targets, combat, feet, warn, mgr, seen, of, guard, step, hit, tick: () => tick };
}

describe('guard cycle', () => {
  it('is up for 1.2 s then down for 1.0 s, repeating', () => {
    const r = rig({ playerFeet: { x: 50, y: 0, z: 50 } });
    const [d] = r.mgr.place([SPOT]);
    expect(d.state).toBe('up');
    r.step(1.1);
    expect(d.guardUp).toBe(true);
    r.step(0.2); // 1.3 s
    expect(d.state).toBe('down');
    r.step(0.8); // 2.1 s
    expect(d.state).toBe('down');
    r.step(0.2); // 2.3 s
    expect(d.state).toBe('up');
    r.step(1.2); // 3.5 s: down again after 1.2 + 1.0 + 1.2
    expect(d.state).toBe('down');
  });

  it('is deterministic with the same rng and keeps phase when one update spans several boundaries', () => {
    const r = rig({ playerFeet: { x: 50, y: 0, z: 50 } });
    const [d] = r.mgr.place([SPOT]);
    r.mgr.update(2.3); // 1.2 up + 1.0 down + 0.1 into the next up
    expect(d.state).toBe('up');
    r.mgr.update(1.2);
    expect(d.state).toBe('down');
  });

  it('ignores non-positive dt', () => {
    const r = rig();
    const [d] = r.mgr.place([SPOT]);
    r.mgr.update(0);
    r.mgr.update(-1);
    r.mgr.update(Number.NaN);
    expect(d.state).toBe('up');
  });
});

describe('player hits', () => {
  it('blocks a light hit while the guard is up: no health loss, dummy.blocked with ids', () => {
    const r = rig();
    const [d] = r.mgr.place([SPOT]);
    const res = r.hit(d.id, 10)!;
    expect(res.outcome).toBe('blocked');
    expect(res.dealt).toBe(0);
    expect(r.actors.get(d.id)!.health).toBe(100);
    expect(r.of('dummy.blocked')).toEqual([{ dummyId: d.id, byId: 'player' }]);
    expect(d.counts).toEqual({ hitOpen: 0, blocked: 1, guardBroken: 0, parried: 0 });
    expect(r.of('dummy.hitOpen')).toHaveLength(0);
  });

  it('reports a hit on a lowered guard as dummy.hitOpen', () => {
    const r = rig();
    const [d] = r.mgr.place([SPOT]);
    r.step(1.3);
    expect(d.state).toBe('down');
    const res = r.hit(d.id, 10)!;
    expect(res.outcome).toBe('hit');
    expect(r.of('dummy.hitOpen')).toEqual([{ dummyId: d.id, byId: 'player' }]);
    expect(d.counts.hitOpen).toBe(1);
    expect(r.of('dummy.blocked')).toHaveLength(0);
  });

  it('breaks the guard on a heavy hit (poise >= 30), staggers 1.2 s, then raises it again', () => {
    const r = rig({ playerFeet: { x: 50, y: 0, z: 50 } });
    const [d] = r.mgr.place([SPOT]);
    r.step(0.5);
    r.hit(d.id, 30);
    expect(r.of('dummy.guardBroken')).toEqual([{ dummyId: d.id, byId: 'player' }]);
    expect(r.of('dummy.blocked')).toHaveLength(0);
    expect(d.state).toBe('broken');
    expect(d.guardUp).toBe(false);
    r.step(1.1);
    expect(d.state).toBe('broken'); // cannot re-raise before the stagger ends
    r.step(0.2);
    expect(d.state).toBe('up');
    expect(d.counts.guardBroken).toBe(1);
  });

  it('a hit during the stagger lands open', () => {
    const r = rig();
    const [d] = r.mgr.place([SPOT]);
    r.hit(d.id, 40);
    r.hit(d.id, 10);
    expect(d.counts).toEqual({ hitOpen: 1, blocked: 0, guardBroken: 1, parried: 0 });
  });

  it('a heavy hit on a lowered guard is just an open hit', () => {
    const r = rig();
    const [d] = r.mgr.place([SPOT]);
    r.step(1.3);
    r.hit(d.id, 50);
    expect(d.counts).toEqual({ hitOpen: 1, blocked: 0, guardBroken: 0, parried: 0 });
    expect(d.state).toBe('down');
  });

  it('ignores hits from a non-player attacker and from no attacker', () => {
    const r = rig();
    const ally = r.actors.spawn({ kind: 'ally', team: 'ally', maxHealth: 10 });
    const [d] = r.mgr.place([SPOT]);
    r.hit(d.id, 50, ally.id);
    r.hit(d.id, 50, null);
    r.damage.apply({ attackerId: null, targetId: d.id, amount: 1, kind: 'script' });
    expect(d.counts).toEqual({ hitOpen: 0, blocked: 0, guardBroken: 0, parried: 0 });
    expect(d.state).toBe('up');
    expect(r.seen.filter((s) => s.type.startsWith('dummy.'))).toHaveLength(0);
  });

  it('counts each dummy separately', () => {
    const r = rig();
    const [a, b] = r.mgr.place([SPOT, { feet: { x: 10, y: 0, z: 0 }, yaw: 0 }]);
    r.hit(a.id);
    r.hit(a.id);
    r.hit(b.id);
    expect(a.counts.blocked).toBe(2);
    expect(b.counts.blocked).toBe(1);
    expect(a.id).not.toBe(b.id);
  });

  it('is immortal like the other dummies', () => {
    const r = rig();
    const [d] = r.mgr.place([SPOT]);
    r.step(1.3);
    for (let i = 0; i < 20; i++) r.hit(d.id, 10);
    expect(r.actors.get(d.id)!.alive).toBe(true);
    expect(r.actors.get(d.id)!.health).toBe(100);
  });
});

describe('scripted swing', () => {
  it('telegraphs, then swings; a parry emits dummy.parried', () => {
    const r = rig();
    const [d] = r.mgr.place([SPOT]);
    r.step(3.9);
    expect(r.of('telegraph')).toHaveLength(0);
    r.step(0.2); // 4.1 s: delay is exactly 4 s with rng 0.5
    const tele = r.of('telegraph');
    expect(tele).toHaveLength(1);
    expect(tele[0]).toEqual({
      actorId: d.id,
      kind: 'block',
      attackId: BLOCKING.swingAttackId,
      moveId: BLOCKING.swingMoveId,
      swingId: 1,
      leadSeconds: BLOCKING.swingTelegraphSeconds,
    });
    r.step(0.3);
    r.guard.setBlockHeld(true, r.tick()); // pressed shortly before the window opens
    r.step(0.3);
    expect(r.of('player.parried')).toEqual([{ attackerId: d.id }]);
    expect(r.of('dummy.parried')).toEqual([{ dummyId: d.id, byId: 'player' }]);
    expect(d.counts.parried).toBe(1);
    const win = r.of('attack.window');
    expect(win.map((w) => w.phase)).toEqual(['open', 'close']);
    expect(r.actors.get(d.id)!.team).toBe('neutral'); // only hostile during the hit itself
    expect(r.player.health).toBe(100);
  });

  it('hurts a player who does not guard (1 damage) and a held early block is only blocked', () => {
    const r = rig();
    r.mgr.place([SPOT]);
    r.step(4.7);
    expect(r.player.health).toBe(99);
    expect(r.of('dummy.parried')).toHaveLength(0);
  });

  it('swings about every 4 s', () => {
    const r = rig();
    r.mgr.place([SPOT]);
    r.step(12.3);
    expect(r.of('telegraph').length).toBe(3);
  });

  it('does not swing when the player is out of range', () => {
    const r = rig({ playerFeet: { x: 0, y: 0, z: 3 } }); // 5 m away
    r.mgr.place([SPOT]);
    r.step(10);
    expect(r.of('telegraph')).toHaveLength(0);
  });

  it('does not swing when the player is behind the dummy, and swings once they step in front', () => {
    const r = rig({ playerFeet: { x: 0, y: 0, z: -4 } }); // behind: the dummy faces +Z
    r.mgr.place([SPOT]);
    r.step(6);
    expect(r.of('telegraph')).toHaveLength(0);
    r.feet.z = 0;
    r.step(0.1);
    expect(r.of('telegraph')).toHaveLength(1); // ready the moment the player is in front
  });

  it('cancels a telegraphed swing when the guard breaks', () => {
    const r = rig();
    const [d] = r.mgr.place([SPOT]);
    r.step(4.45); // telegraph since 4.0 s; the guard is up again from 4.4 s
    expect(r.of('telegraph')).toHaveLength(1);
    expect(d.state).toBe('up');
    r.hit(d.id, 40);
    r.step(0.1);
    expect(r.of('telegraph.cancelled')).toEqual([{ actorId: d.id, swingId: 1 }]);
    r.step(0.5);
    expect(r.player.health).toBe(100);
    expect(r.of('attack.window')).toHaveLength(0);
  });
});

describe('placement and cleanup', () => {
  it('warns about and skips invalid spots', () => {
    const r = rig();
    const handles = r.mgr.place([
      SPOT,
      { feet: { x: Number.NaN, y: 0, z: 0 }, yaw: 0 },
      { feet: { x: 1, y: 0, z: 1 }, yaw: Number.POSITIVE_INFINITY },
      { feet: undefined as never, yaw: 0 },
    ]);
    expect(handles).toHaveLength(1);
    expect(r.warn).toHaveBeenCalledTimes(3);
    expect(r.warn.mock.calls[0][0]).toContain('invalid spot');
  });

  it('places meshes with a visible shield plate that lowers with the guard', () => {
    const r = rig();
    const [d] = r.mgr.place([SPOT]);
    expect(d.root.position.toArray()).toEqual([0, 0, -2]);
    const plate = d.root.getObjectByName('BlockDummyShield')!;
    const up = plate.position.y;
    r.step(1.3);
    r.step(0.5);
    expect(plate.position.y).toBeLessThan(up);
    r.step(1.0);
    expect(plate.position.y).toBeCloseTo(up, 5);
  });

  it('replaces the previous dummies on a second call', () => {
    const r = rig();
    const [first] = r.mgr.place([SPOT]);
    const second = r.mgr.place([SPOT, SPOT]);
    expect(r.actors.get(first.id)).toBeUndefined();
    expect(first.root.parent).toBeNull();
    expect(second).toHaveLength(2);
    expect(r.scene.children).toHaveLength(2);
    expect(r.targets.size).toBe(2);
    r.hit(first.id); // a removed dummy no longer counts anything
    expect(first.counts.blocked).toBe(0);
  });

  it('dispose removes actors, meshes, hurtboxes, listeners and the modifier', () => {
    const r = rig();
    const modsBefore = (r.damage as unknown as { modifiers: unknown[] }).modifiers.length;
    const [d] = r.mgr.place([SPOT]);
    expect((r.damage as unknown as { modifiers: unknown[] }).modifiers.length).toBe(modsBefore);
    r.mgr.dispose();
    expect(r.actors.get(d.id)).toBeUndefined();
    expect(r.scene.children).toHaveLength(0);
    expect(r.targets.size).toBe(0);
    expect(r.mgr.handles).toHaveLength(0);
    // The modifier left with the manager: an ordinary dummy still resolves normally.
    const plain = r.actors.spawn({ kind: 'dummy', team: 'neutral', maxHealth: 10, immortal: true });
    expect(r.hit(plain.id, 50)!.outcome).toBe('hit');
    r.events.emit('player.parried', { attackerId: d.id });
    expect(r.of('dummy.parried')).toHaveLength(0);
    r.step(5);
    expect(r.of('telegraph')).toHaveLength(0);
    r.mgr.dispose(); // idempotent
  });

  it('a handle disposes just its own dummy', () => {
    const r = rig();
    const [a, b] = r.mgr.place([SPOT, { feet: { x: 9, y: 0, z: 9 }, yaw: 0 }]);
    a.dispose();
    expect(r.actors.get(a.id)).toBeUndefined();
    expect(r.actors.get(b.id)).toBeDefined();
    expect(r.mgr.handles).toHaveLength(1);
    a.dispose();
  });
});

describe('DummiesService.placeBlocking', () => {
  it('warns and returns [] until the game is wired, then places through the service', () => {
    const warn = vi.fn();
    const svc = new TrainingDummies(warn);
    expect(svc.placeBlocking([SPOT])).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('before the game is wired'));

    const r = rig();
    r.mgr.dispose(); // the service builds its own manager on the same resolver
    svc.configureBlocking({
      scene: r.scene,
      actors: r.actors,
      damage: r.damage,
      events: r.events,
      combat: r.combat,
      playerFeet: () => r.feet,
    });
    const handles = svc.placeBlocking([SPOT]);
    expect(handles).toHaveLength(1);
    svc.updateBlocking(0.1);
    expect(svc.placeBlocking([SPOT, SPOT])).toHaveLength(2);
    expect(r.scene.children).toHaveLength(2);
    svc.disposeBlocking();
    expect(r.scene.children).toHaveLength(0);
  });
});
