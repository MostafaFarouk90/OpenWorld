// v0.6 pull (DamageRequest.pull, actor.pulled, the player's forced move) and root (StatusEngine, the enemy read).
import { describe, expect, it, vi } from 'vitest';
import { GameEvents, type GameEventMap } from '../core/events';
import { readStatusData } from '../enemies/statusData';
import { StatusEngine } from '../status/StatusEngine';
import { ActorRegistry } from './ActorRegistry';
import { DamageResolver, type DamageRequest } from './DamageResolver';
import { PULL_SECONDS, PULL_STOP_SHORT, PlayerPull, type PullPorts } from './pull';
import { playerInit } from './teams';

function make() {
  const events = new GameEvents(() => {});
  const actors = new ActorRegistry(events);
  const dr = new DamageResolver(actors, events, () => {});
  const player = actors.spawn(playerInit());
  const foe = actors.spawn({ kind: 'drowned-chain', team: 'hostile', maxHealth: 30 });
  const pulled: GameEventMap['actor.pulled'][] = [];
  events.on('actor.pulled', (e) => void pulled.push(e));
  const hit = (extra: Partial<DamageRequest>) =>
    dr.apply({ attackerId: foe.id, targetId: player.id, amount: 5, kind: 'melee', pull: { distance: 4 }, ...extra });
  return { events, actors, dr, player, foe, pulled, hit };
}

describe('DamageRequest.pull', () => {
  it('a landed hit emits actor.pulled with the source and distance', () => {
    const t = make();
    t.hit({});
    expect(t.pulled).toEqual([{ actorId: t.player.id, fromId: t.foe.id, distance: 4 }]);
  });
  it('no pull on immune, on a kill, without an attacker or with a bad distance', () => {
    const t = make();
    t.player.invulnerable = true;
    t.hit({});
    t.player.invulnerable = false;
    t.hit({ pull: { distance: 0 } });
    t.hit({ pull: { distance: Number.NaN } });
    t.hit({ attackerId: null });
    t.hit({ pull: undefined });
    t.hit({ amount: 9999 });
    expect(t.pulled).toEqual([]);
  });
  it('a blocked hit does not pull', () => {
    const t = make();
    t.dr.addModifier('block', (req) => void (req.outcome = 'blocked'));
    t.hit({});
    expect(t.pulled).toEqual([]);
  });
});

describe('PlayerPull', () => {
  const DT = 1 / 60;
  function rig(over: Partial<PullPorts> = {}) {
    const feet = { x: 0, y: 0, z: 0 };
    const holds: ({ x: number; z: number; speed: number } | null)[] = [];
    let inv = false;
    const ports: PullPorts = {
      playerId: () => 'player',
      invulnerable: () => inv,
      playerFeet: () => feet,
      sourcePosition: (id) => (id === 'chain' ? { x: 10, z: 0 } : null),
      heightAt: () => 0,
      hold: (m) => {
        holds.push(m);
        // The verbs would move the player; stand in for the controller.
        if (m) {
          feet.x += m.x * m.speed * DT;
          feet.z += m.z * m.speed * DT;
        }
      },
      ...over,
    };
    return { pull: new PlayerPull(ports, DT), feet, holds, setInv: (v: boolean) => (inv = v) };
  }
  const run = (p: PlayerPull, ticks: number) => {
    for (let i = 0; i < ticks; i++) p.fixedUpdate();
  };

  it('moves 4 m toward the source over 0.25 s, then releases the hold', () => {
    const t = rig();
    t.pull.onPulled({ actorId: 'player', fromId: 'chain', distance: 4 });
    expect(t.pull.pulling).toBe(true);
    run(t.pull, Math.round(PULL_SECONDS / DT) + 2);
    expect(t.feet.x).toBeCloseTo(4, 5);
    expect(t.feet.z).toBe(0);
    expect(t.holds.at(-1)).toBeNull();
    expect(t.pull.pulling).toBe(false);
  });
  it('stops short of the source', () => {
    const t = rig();
    t.pull.onPulled({ actorId: 'player', fromId: 'chain', distance: 50 });
    run(t.pull, 30);
    expect(t.feet.x).toBeCloseTo(10 - PULL_STOP_SHORT, 5);
  });
  it('ignored with i-frames, for another actor, or with the source gone', () => {
    const t = rig();
    t.setInv(true);
    t.pull.onPulled({ actorId: 'player', fromId: 'chain', distance: 4 });
    t.setInv(false);
    t.pull.onPulled({ actorId: 'someone', fromId: 'chain', distance: 4 });
    t.pull.onPulled({ actorId: 'player', fromId: 'gone', distance: 4 });
    expect(t.pull.pulling).toBe(false);
  });
  it('a dodge mid-pull ends it', () => {
    const t = rig();
    t.pull.onPulled({ actorId: 'player', fromId: 'chain', distance: 4 });
    run(t.pull, 3);
    t.setInv(true);
    run(t.pull, 1);
    expect(t.pull.pulling).toBe(false);
    expect(t.feet.x).toBeLessThan(1);
  });
  it('stops at a ledge', () => {
    const t = rig({ heightAt: (x) => (x > 2 ? -5 : 0) });
    t.pull.onPulled({ actorId: 'player', fromId: 'chain', distance: 8 });
    run(t.pull, 30);
    expect(t.feet.x).toBeLessThanOrEqual(2.1);
    expect(t.feet.x).toBeGreaterThan(1.5);
  });
});

describe('root status', () => {
  function engine() {
    const view = vi.fn();
    const e = new StatusEngine({
      actor: () => ({ dead: false, hittable: true, team: 'hostile' }),
      tick: () => true,
      applied: () => {},
      expired: () => {},
      view,
    });
    return { e, view };
  }
  it('is accepted, shows as rooted in the view and ends on time', () => {
    const { e } = engine();
    expect(e.apply('a', { id: 'r1', kind: 'root', seconds: 1, sourceId: null })).toBe(true);
    expect(e.apply('a', { id: 'r2', kind: 'root', seconds: 2, sourceId: null })).toBe(true);
    expect(e.view('a')).toEqual({ stunned: false, stunRemaining: 0, slow: 0, rooted: true });
    e.update(1.1);
    expect(e.has('a', 'root')).toBe(true);
    e.update(1);
    expect(e.has('a', 'root')).toBe(false);
    expect(e.view('a')).toEqual({ stunned: false, stunRemaining: 0, slow: 0 });
  });
  it('an enemy reads a root as speed 0 (a slow keeps its 0.1 floor)', () => {
    expect(readStatusData({ stunned: false, stunRemaining: 0, slow: 0, rooted: true })).toEqual({ stunSeconds: 0, speedScale: 0 });
    expect(readStatusData({ stunned: false, stunRemaining: 0, slow: 0.95 }).speedScale).toBeCloseTo(0.1);
  });
});
