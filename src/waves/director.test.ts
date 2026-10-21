import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { CINDERFORD_ANCHORS, CINDERFORD_RAID } from './defs/cinderford';
import { BARRICADE, CART, DIRECTOR } from './tuning';
import { makeKit, secs, type Kit } from './testKit';

let physics: PhysicsWorld;
let kit: Kit;
beforeEach(async () => {
  physics = new PhysicsWorld();
  await physics.init();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  kit = await makeKit(physics);
});
afterEach(() => {
  kit.teardown();
  vi.restoreAllMocks();
});

const ID = CINDERFORD_RAID.id;
const kills = () => kit.enemies.all();
/** Kills every live wave enemy as the player. */
function killAll() {
  for (const id of kit.enemies.all()) if (kit.ctx.actors.get(id) && !kit.ctx.actors.get(id)!.dead) kit.ctx.damage.kill(id, 'player');
}
function healPlayer() {
  kit.ctx.player.actor.health = kit.ctx.player.actor.maxHealth;
}

describe('start and stop', () => {
  it('starts wave 0 and reports it', () => {
    expect(kit.waves().current).toBeNull();
    expect(kit.waves().start(ID)).toBe(true);
    expect(kit.waves().current).toEqual({ defId: ID, index: 0 });
    expect(kit.of('wave.started')).toEqual([{ defId: ID, index: 0 }]);
  });
  it('refuses an unknown id and a second start', () => {
    expect(kit.waves().start('nope')).toBe(false);
    expect(kit.waves().start(ID)).toBe(true);
    expect(kit.waves().start(ID)).toBe(false);
  });
  it('stop clears everything and emits nothing', () => {
    kit.waves().start(ID);
    kit.runSecs(5);
    kit.clearEvents();
    const live = kills().length;
    expect(live).toBeGreaterThan(0);
    kit.waves().stop();
    expect(kit.waves().current).toBeNull();
    expect(kit.events.filter((e) => /^(waves?|structure)\./.test(e.type))).toEqual([]);
    expect(kit.ctx.actors.all().next().done).toBe(false); // the player remains
    expect([...kit.ctx.actors.all()].filter((a) => a.team !== 'player')).toEqual([]);
    kit.waves().stop(); // idle: no-op
  });
});

describe('wave order, counts and timing', () => {
  it('spawns on the schedule with aggro on', () => {
    kit.waves().start(ID);
    kit.run(2);
    expect(kills().length).toBe(1); // hound at 0 s on lane 1
    kit.runSecs(1.6);
    expect(kills().length).toBe(2); // 1.5 s stagger
    kit.runSecs(1.5);
    expect(kills().length).toBe(4); // 3 s: the first wraith, hounds at 0, 1.5, 3
    expect(kit.enemies.spawnOpts.every((o) => (o as any).aggro === true && (o as any).count === 1)).toBe(true);
    kit.runSecs(2);
    expect(kills().length).toBe(5);
  });

  it('wave 1 clears when all 5 are dead, waits the intermission, then starts wave 2', () => {
    kit.waves().start(ID);
    kit.runSecs(6);
    expect(kit.of('wave.cleared')).toEqual([]);
    killAll();
    kit.run(2);
    expect(kit.of('wave.cleared')).toEqual([{ defId: ID, index: 0 }]);
    kit.runSecs(DIRECTOR.intermissionSeconds - 1);
    expect(kit.of('wave.started')).toHaveLength(1);
    kit.runSecs(1.2);
    expect(kit.of('wave.started')).toEqual([{ defId: ID, index: 0 }, { defId: ID, index: 1 }]);
    expect(kit.waves().current).toEqual({ defId: ID, index: 1 });
  });

  it('does not clear before every scheduled spawn is issued', () => {
    kit.waves().start(ID);
    kit.runSecs(2);
    killAll();
    kit.run(2);
    expect(kit.of('wave.cleared')).toEqual([]);
  });

  it('counts per wave are 5, 7 and 9 kills with two carts (wave 2 and wave 3, one each)', () => {
    const totals = CINDERFORD_RAID.waves.map((w) => w.spawns.reduce((n, s) => n + s.count, 0));
    expect(totals).toEqual([5, 7, 9]);
    expect(CINDERFORD_RAID.waves.map((w) => w.carts.length)).toEqual([0, 1, 1]);
  });
});

/** Plays the set forward: kills every enemy, optionally every cart, until wave `index` is running. */
function driveTo(index: number, opts: { stopCarts?: boolean } = {}) {
  for (let i = 0; i < secs(400); i++) {
    const cur = kit.waves().current;
    if (cur && cur.index >= index && kit.director().phase === 'running') return;
    if (i % 10 === 0) {
      killAll();
      if (opts.stopCarts !== false) for (const c of kit.director().parts?.carts.all ?? []) if (c.active) kit.ctx.damage.kill(c.actor.id, 'player');
    }
    healPlayer();
    kit.run(1);
  }
  throw new Error('driveTo timed out');
}

/** Runs until `done()` or throws. */
function until(done: () => boolean, seconds = 120, each?: () => void) {
  for (let i = 0; i < secs(seconds); i++) {
    if (done()) return;
    each?.();
    healPlayer();
    kit.run(1);
  }
  throw new Error('until timed out');
}

const barricadeHealth = () => kit.director().parts!.barricade.health;
const cartId1 = `${ID}.cart.1.1`;
const cartId2 = `${ID}.cart.2.1`;

describe('carts and the barricade', () => {
  it('an unstopped cart reaches the barricade and deals 250; the wave clears only after it', () => {
    kit.waves().start(ID);
    driveTo(1);
    kit.clearEvents();
    until(() => kit.of('structure.damaged').some((e) => e.id === CINDERFORD_RAID.barricadeId && e.health === 150), 80, killAll);
    expect(barricadeHealth()).toBe(BARRICADE.maxHealth - CART.impactDamage);
    expect(kit.of('structure.damaged').some((e) => e.id === cartId1 && e.health === CART.maxHealth)).toBe(true);
    until(() => kit.of('wave.cleared').length > 0, 30, killAll);
    expect(kit.of('wave.cleared')).toEqual([{ defId: ID, index: 1 }]);
    expect(kit.of('waves.failed')).toEqual([]);
    expect(kit.of('structure.destroyed')).toEqual([]); // an arrival is not a destruction
  });

  it('a cart stopped on its lane never arrives and the barricade is untouched', () => {
    kit.waves().start(ID);
    driveTo(1);
    until(() => kit.director().parts!.carts.all.length > 0, 20, killAll);
    kit.run(secs(5));
    const cart = kit.director().parts!.carts.all[0];
    kit.ctx.damage.kill(cart.actor.id, 'player');
    expect(kit.of('structure.destroyed')).toEqual([{ id: cartId1 }]);
    until(() => kit.of('wave.cleared').length > 0, 30, killAll);
    expect(barricadeHealth()).toBe(400);
    expect(kit.of('structure.damaged').filter((e) => e.id === CINDERFORD_RAID.barricadeId).every((e) => e.health === 400)).toBe(true);
  });

  it('one leaked cart is survivable, a second fails the wave and restarts that wave with the wave-start barricade', () => {
    kit.waves().start(ID);
    driveTo(1);
    kit.clearEvents();
    until(() => kit.of('wave.cleared').length > 0, 120, killAll); // leak cart 1
    expect(barricadeHealth()).toBe(150);
    until(() => kit.waves().current?.index === 2, 30, killAll);
    kit.clearEvents();
    // wake a militiaman so the restart has someone to revive
    const man = kit.director().parts!.defenders.all[0];
    kit.ctx.damage.kill(man.id);
    expect(man.state).toBe('down');
    until(() => kit.of('waves.failed').length > 0, 120, killAll); // leak cart 2
    expect(kit.of('waves.failed')).toEqual([{ defId: ID, index: 2 }]);
    expect(kit.of('structure.destroyed')).toEqual([{ id: CINDERFORD_RAID.barricadeId }]);
    expect(kit.waves().current).toEqual({ defId: ID, index: 2 });
    // the wave is despawned during the beat
    expect(kit.enemies.all().filter((a) => kit.ctx.actors.get(a) && !kit.ctx.actors.get(a)!.dead)).toEqual([]);
    expect(kit.director().parts!.carts.all).toEqual([]);
    kit.runSecs(DIRECTOR.restartBeatSeconds - 0.5);
    expect(kit.of('wave.started')).toEqual([]);
    kit.runSecs(0.7);
    expect(kit.of('wave.started')).toEqual([{ defId: ID, index: 2 }]); // the current wave, not wave 0
    expect(barricadeHealth()).toBe(150);
    expect(kit.of('structure.damaged').at(-1)).toEqual({ id: CINDERFORD_RAID.barricadeId, health: 150 });
    expect(kit.director().parts!.defenders.all.every((d) => d.state === 'post' && d.actor.health === d.actor.maxHealth)).toBe(true);
    // enemies are issued afresh and a cart comes again
    until(() => kit.director().parts!.carts.all.length > 0 && kit.enemies.all().filter((a) => !kit.ctx.actors.get(a)?.dead).length >= 9, 30);
    const members = kit.enemies.all().filter((a) => kit.ctx.actors.get(a) && !kit.ctx.actors.get(a)!.dead);
    expect(members.every((a) => kit.ctx.actors.get(a)!.health === 40)).toBe(true);
    expect(kit.enemies.calls.filter((c) => c.startsWith('reset:')).length).toBeGreaterThan(0);
    expect(kit.director().parts!.carts.all[0].id).toBe(cartId2);
  });
});

describe('the player and the player\'s place', () => {
  it('player death fails the wave; the restart waits until the player is back', () => {
    kit.waves().start(ID);
    kit.runSecs(4);
    kit.clearEvents();
    kit.ctx.damage.kill('player');
    expect(kit.of('waves.failed')).toEqual([{ defId: ID, index: 0 }]);
    kit.runSecs(DIRECTOR.restartBeatSeconds + 10);
    expect(kit.of('wave.started')).toEqual([]);
    kit.ctx.damage.revive('player', 1, 'respawn');
    kit.runSecs(DIRECTOR.restartBeatSeconds - 0.5);
    expect(kit.of('wave.started')).toEqual([]);
    kit.runSecs(0.7);
    expect(kit.of('wave.started')).toEqual([{ defId: ID, index: 0 }]);
  });

  it('a death while the player respawns far away holds the restart until the player returns', async () => {
    kit.teardown();
    const feet = { x: 0, y: 0, z: 0 };
    kit = await makeKit(physics, { feet });
    feet.x = kit.at.x;
    kit.waves().start(ID);
    kit.runSecs(2);
    kit.ctx.damage.kill('player');
    kit.ctx.damage.revive('player', 1, 'respawn');
    feet.x = kit.at.x + 2000;
    kit.clearEvents();
    kit.runSecs(20);
    expect(kit.of('wave.started')).toEqual([]);
    feet.x = kit.at.x + 5;
    kit.runSecs(DIRECTOR.restartBeatSeconds + 0.5);
    expect(kit.of('wave.started')).toEqual([{ defId: ID, index: 0 }]);
  });

  it('pauses while the player is beyond the radius and resumes from where it was', async () => {
    kit.teardown();
    const feet = { x: 0, y: 0, z: 0 };
    kit = await makeKit(physics, { feet });
    feet.x = kit.at.x;
    kit.waves().start(ID);
    kit.runSecs(2);
    const before = kit.enemies.all().length;
    expect(before).toBe(2);
    feet.x = kit.at.x + DIRECTOR.activeRadius + 5;
    kit.runSecs(30);
    expect(kit.enemies.all().length).toBe(before);
    feet.x = kit.at.x + 3;
    kit.runSecs(8);
    expect(kit.enemies.all().length).toBe(5);
  });
});

describe('pause rules for interiors and travel', () => {
  it('waits while the player is in an interior or travelling', async () => {
    kit.teardown();
    const interior = { current: null as string | null };
    const travelling = { value: false };
    kit = await makeKit(physics, { interior, travelling });
    kit.waves().start(ID);
    kit.runSecs(1);
    const n = kit.enemies.all().length;
    interior.current = 'underways';
    kit.runSecs(20);
    expect(kit.enemies.all().length).toBe(n);
    interior.current = null;
    travelling.value = true;
    kit.runSecs(20);
    expect(kit.enemies.all().length).toBe(n);
    travelling.value = false;
    kit.runSecs(8);
    expect(kit.enemies.all().length).toBe(5);
  });
});

describe('clearing', () => {
  it('spared, calmed and released members that are walking off count as cleared', () => {
    kit.waves().start(ID);
    kit.runSecs(6);
    const ids = kit.enemies.all();
    expect(ids).toHaveLength(5);
    kit.enemies.states.set(ids[0], 'spared');
    kit.enemies.states.set(ids[1], 'calmed');
    kit.enemies.states.set(ids[2], 'released');
    kit.enemies.states.set(ids[3], 'yield');
    kit.run(5);
    expect(kit.of('wave.cleared')).toEqual([]); // 'yield' still open, one alive
    kit.enemies.states.set(ids[3], 'spared');
    kit.ctx.damage.kill(ids[4], 'player');
    kit.run(5);
    expect(kit.of('wave.cleared')).toEqual([{ defId: ID, index: 0 }]);
  });

  it('the last wave completes the set: cleared with the final index, no more waves, start() refuses a done set', () => {
    kit.waves().start(ID);
    driveTo(2);
    kit.clearEvents();
    until(() => kit.of('wave.cleared').length > 0, 120, () => {
      killAll();
      for (const c of kit.director().parts?.carts.all ?? []) if (c.active) kit.ctx.damage.kill(c.actor.id, 'player');
    });
    expect(kit.of('wave.cleared')).toEqual([{ defId: ID, index: CINDERFORD_RAID.waves.length - 1 }]);
    kit.runSecs(DIRECTOR.intermissionSeconds + 2);
    expect(kit.of('wave.started')).toEqual([]);
    expect(kit.waves().current).toBeNull();
    expect(kit.waves().start(ID)).toBe(false);
    expect(kit.director().parts).toBeNull();
    expect([...kit.ctx.actors.all()].filter((a) => a.kind === 'militia' || a.kind === CART.kind)).toEqual([]);
  });

  it('wave enemies come for the player: spawned with aggro on and from leash-free spawners (no leash-back)', async () => {
    const { WAVE_SPAWNERS } = await import('./spawners');
    expect(WAVE_SPAWNERS.length).toBeGreaterThan(0);
    for (const sp of WAVE_SPAWNERS) {
      expect(sp.leash).toBe(false);
      expect(sp.ephemeral).toBe(true);
      expect(sp.activation).toBe('manual');
      expect(sp.respawn).toBe('never');
      expect(sp.tag).toBe('m12');
    }
    kit.waves().start(ID);
    kit.runSecs(6);
    expect(kit.enemies.spawnOpts.length).toBe(5);
    expect(kit.enemies.spawnOpts.every((o) => (o as { aggro?: boolean }).aggro === true && (o as { leash?: boolean }).leash === undefined)).toBe(true);
  });
});

describe('edges at start', () => {
  it('start() fails, with a warning, when the barricade anchors are missing or the enemies service is', async () => {
    kit.teardown();
    kit = await makeKit(physics, { anchors: false });
    expect(kit.waves().start(ID)).toBe(false);
    expect(kit.waves().current).toBeNull();
    kit.teardown();
    kit = await makeKit(physics);
    const unprovide = (kit.ctx.services as any).impls;
    unprovide.delete('enemies');
    expect(kit.waves().start(ID)).toBe(false);
  });

  it('an idle director costs nothing and leaves Act 1 damage alone', () => {
    const find = vi.spyOn(kit.ctx.anchors, 'find');
    const get = vi.spyOn(kit.ctx.services, 'get');
    kit.run(120);
    expect(find).not.toHaveBeenCalled();
    expect(get.mock.calls.filter(([n]) => ['enemies', 'interiors', 'waystones', 'allyEngagement'].includes(n as string))).toEqual([]);
    expect(kit.director().parts).toBeNull();
    const foe = kit.ctx.actors.spawn({ kind: 'ash-wraith', team: 'hostile', maxHealth: 30, maxPoise: 10 });
    const r = kit.ctx.damage.apply({ attackerId: 'player', targetId: foe.id, amount: 10, poise: 4, kind: 'melee', attackId: 'x' });
    expect(r).toMatchObject({ dealt: 10, poiseDealt: 4 });
  });

  it('knows its structures for the HUD: kinds and max health, undefined otherwise', () => {
    expect(kit.waves().structure(CINDERFORD_RAID.barricadeId)).toEqual({ kind: 'barricade', maxHealth: 400 });
    expect(kit.waves().structure(cartId1)).toEqual({ kind: 'cart', maxHealth: 600 });
    expect(kit.waves().structure(cartId2)).toEqual({ kind: 'cart', maxHealth: 600 });
    expect(kit.waves().structure(`${ID}.cart.0.1`)).toBeUndefined();
    expect(kit.waves().structure('nope')).toBeUndefined();
  });

  it('data: Cinderford uses the anchor ids A3 publishes and a closer entry marked for the wyrm', () => {
    expect(CINDERFORD_ANCHORS.lanes['1']).toBe('cinderreach.cinderford.lane.1');
    expect(CINDERFORD_ANCHORS.lanes.wyrm).toBe('cinderreach.cinderford.wyrm.approach');
    expect(CINDERFORD_ANCHORS.barricade).toHaveLength(4);
    expect(CINDERFORD_ANCHORS.militia[5]).toBe('cinderreach.m12.militia.6');
    const closers = CINDERFORD_RAID.waves[2].spawns.filter((s) => s.lane === 'wyrm');
    expect(closers).toHaveLength(1);
  });
});
