import { describe, expect, it, vi } from 'vitest';
import { GameEvents, type GameEventMap } from '../core/events';
import { WorldState } from '../state/WorldState';
import { ActorRegistry } from './ActorRegistry';
import { BossRegistry, type BossDef } from './BossRegistry';
import { DamageResolver, type DamageRequest } from './DamageResolver';
import { playerInit } from './teams';

const DEF: BossDef = { bossId: 'ashen-prior', nameKey: 'boss.ashen-prior', phases: [0.5], breaksPerPhase: 3, shieldBreakers: ['heartshard-surge'] };

function make() {
  const events = new GameEvents(() => {});
  const actors = new ActorRegistry(events);
  const dr = new DamageResolver(actors, events, () => {});
  const state = new WorldState(events, () => {});
  const report = vi.fn();
  const bosses = new BossRegistry({ events, actors, damage: dr, state, report });
  const player = actors.spawn(playerInit());
  const boss = actors.spawn({ kind: 'prior', team: 'hostile', maxHealth: 100, maxPoise: 10 });
  const seen: { type: keyof GameEventMap; payload: unknown }[] = [];
  events.onAny((t, p) => seen.push({ type: t, payload: p }));
  const of = <K extends keyof GameEventMap>(t: K) => seen.filter((s) => s.type === t).map((s) => s.payload as GameEventMap[K]);
  const hit = (amount: number, extra: Partial<DamageRequest> = {}) =>
    dr.apply({ attackerId: player.id, targetId: boss.id, amount, poise: 0, kind: 'melee', ...extra });
  /** One poise break (poise restored first so every call staggers). */
  const stagger = () => {
    boss.restorePoise();
    dr.stagger(boss.id, player.id, 10);
  };
  return { events, actors, dr, state, report, bosses, player, boss, seen, of, hit, stagger };
}

function started(def: BossDef = DEF) {
  const m = make();
  m.bosses.register(m.boss.id, def);
  m.seen.length = 0;
  return m;
}

describe('register and state', () => {
  it('registers, emits boss.started and reports state', () => {
    const { bosses, boss, of, seen } = make();
    bosses.register(boss.id, DEF);
    expect(of('boss.started')).toEqual([{ bossId: 'ashen-prior', actorId: boss.id }]);
    expect(seen.filter((s) => s.type.startsWith('boss.'))).toHaveLength(1);
    expect(bosses.active()).toEqual(['ashen-prior']);
    expect(bosses.state('ashen-prior')).toEqual({
      bossId: 'ashen-prior',
      actorId: boss.id,
      nameKey: 'boss.ashen-prior',
      health: 100,
      maxHealth: 100,
      phase: 1,
      phases: 2,
      breaks: 0,
      breaksPerPhase: 3,
      shield: false,
      releaseOpen: false,
      outcome: null,
    });
    expect(bosses.state('nope')).toBeNull();
  });

  it('initial shield comes from the def without an event', () => {
    const { bosses, boss, of } = make();
    bosses.register(boss.id, { ...DEF, shield: true });
    expect(bosses.state('ashen-prior')!.shield).toBe(true);
    expect(of('boss.shield')).toHaveLength(0);
  });

  it('undo unregisters, emits boss.ended once and is idempotent', () => {
    const { bosses, boss, seen } = make();
    const undo = bosses.register(boss.id, DEF);
    seen.length = 0;
    undo();
    undo();
    expect(bosses.active()).toEqual([]);
    expect(bosses.state('ashen-prior')).toBeNull();
    expect(seen.map((e) => [e.type, e.payload])).toEqual([['boss.ended', { bossId: 'ashen-prior', actorId: boss.id, reason: 'unregistered' }]]);
    // a later registration of the same id is not removed by the stale undo
    const undo2 = bosses.register(boss.id, DEF);
    undo();
    expect(bosses.active()).toEqual(['ashen-prior']);
    undo2();
    expect(bosses.active()).toEqual([]);
  });

  it('re-registering after despawn works, silently dropped on despawn', () => {
    const { bosses, boss, actors, of } = make();
    bosses.register(boss.id, DEF);
    actors.despawn(boss.id);
    expect(bosses.active()).toEqual([]);
    expect(of('boss.defeated')).toHaveLength(0);
    const again = actors.spawn({ kind: 'prior', team: 'hostile', maxHealth: 50, maxPoise: 10 });
    bosses.register(again.id, DEF);
    expect(bosses.state('ashen-prior')!.maxHealth).toBe(50);
  });

  it('throws for bad registrations', () => {
    const { bosses, boss, actors, hit, state } = make();
    const other = actors.spawn({ kind: 'prior', team: 'hostile', maxHealth: 10 });
    const dead = actors.spawn({ kind: 'prior', team: 'hostile', maxHealth: 10 });
    actors.get(dead.id)!._dead = true;
    expect(() => bosses.register('ghost', DEF)).toThrow(/unknown actor/);
    expect(() => bosses.register(dead.id, DEF)).toThrow(/dead/);
    expect(() => bosses.register(boss.id, { ...DEF, bossId: 'Bad_Id' })).toThrow(/invalid bossId/);
    expect(() => bosses.register(boss.id, { ...DEF, bossId: '' })).toThrow(/invalid bossId/);
    bosses.register(boss.id, DEF);
    expect(() => bosses.register(boss.id, { ...DEF, bossId: 'other' })).toThrow(/already boss/);
    expect(() => bosses.register(other.id, DEF)).toThrow(/already registered/);
    state.setFlag('boss.done-one.outcome', 'defeated');
    expect(() => bosses.register(other.id, { ...DEF, bossId: 'done-one' })).toThrow(/outcome/);
    hit(0);
    expect(bosses.active()).toEqual(['ashen-prior']);
  });

  it.each([
    ['ascending', { phases: [0.3, 0.6] }],
    ['equal', { phases: [0.5, 0.5] }],
    ['zero', { phases: [0] }],
    ['one', { phases: [1] }],
    ['negative', { phases: [-0.2] }],
    ['NaN', { phases: [NaN] }],
    ['Infinity', { phases: [Infinity] }],
    ['breaks 0', { breaksPerPhase: 0 }],
    ['breaks 1.5', { breaksPerPhase: 1.5 }],
    ['breaks NaN', { breaksPerPhase: NaN }],
    ['window 0', { releaseWindowSeconds: 0 }],
    ['window NaN', { releaseWindowSeconds: NaN }],
    ['window -1', { releaseWindowSeconds: -1 }],
  ] as [string, Partial<BossDef>][])('rejects invalid def: %s', (_n, patch) => {
    const { bosses, boss } = make();
    expect(() => bosses.register(boss.id, { ...DEF, ...patch })).toThrow(/BossRegistry/);
    expect(bosses.active()).toEqual([]);
  });
});

describe('breaks', () => {
  it('counts staggers in phase 1 (not last on a two-phase boss)', () => {
    const { bosses, of, stagger } = started();
    stagger();
    stagger();
    stagger();
    expect(of('boss.break')).toEqual([
      { bossId: 'ashen-prior', phase: 1, breaks: 1, last: false },
      { bossId: 'ashen-prior', phase: 1, breaks: 2, last: false },
      { bossId: 'ashen-prior', phase: 1, breaks: 3, last: false },
    ]);
    expect(bosses.state('ashen-prior')!.releaseOpen).toBe(false);
    expect(of('boss.releaseWindow')).toHaveLength(0);
  });

  it('a break from a hit (poise damage) counts, and from damage.stagger counts', () => {
    const { bosses, hit, stagger } = started();
    hit(1, { poise: 10 });
    expect(bosses.state('ashen-prior')!.breaks).toBe(1);
    stagger();
    expect(bosses.state('ashen-prior')!.breaks).toBe(2);
  });

  it('staggers of other actors are ignored', () => {
    const { bosses, actors, dr, player, of } = started();
    const other = actors.spawn({ kind: 'x', team: 'hostile', maxHealth: 10, maxPoise: 5 });
    dr.stagger(other.id, player.id, 5);
    expect(bosses.state('ashen-prior')!.breaks).toBe(0);
    expect(of('boss.break')).toHaveLength(0);
  });

  it('single-phase boss: third break is last and opens the window', () => {
    const { bosses, of, stagger } = started({ ...DEF, phases: [] });
    expect(bosses.state('ashen-prior')!.phases).toBe(1);
    stagger();
    stagger();
    expect(of('boss.break').map((b) => b.last)).toEqual([false, false]);
    stagger();
    expect(of('boss.break')[2]).toEqual({ bossId: 'ashen-prior', phase: 1, breaks: 3, last: true });
    expect(of('boss.releaseWindow')).toEqual([{ bossId: 'ashen-prior', open: true }]);
    expect(bosses.state('ashen-prior')!.releaseOpen).toBe(true);
  });

  it('third break in the final phase is last and opens the window', () => {
    const { bosses, hit, of, stagger } = started();
    hit(60);
    stagger();
    stagger();
    expect(of('boss.releaseWindow')).toHaveLength(0);
    stagger();
    expect(of('boss.break').at(-1)).toEqual({ bossId: 'ashen-prior', phase: 2, breaks: 3, last: true });
    expect(of('boss.releaseWindow')).toEqual([{ bossId: 'ashen-prior', open: true }]);
    expect(bosses.state('ashen-prior')!.releaseOpen).toBe(true);
  });
});

describe('phases', () => {
  it('crossing 0.5 starts phase 2 and resets breaks', () => {
    const { bosses, hit, of, stagger } = started();
    stagger();
    stagger();
    hit(49); // 51/100: still phase 1
    expect(bosses.state('ashen-prior')!.phase).toBe(1);
    hit(1); // exactly 0.5 counts
    expect(of('boss.phase')).toEqual([{ bossId: 'ashen-prior', phase: 2, previous: 1 }]);
    expect(bosses.state('ashen-prior')).toMatchObject({ phase: 2, breaks: 0 });
  });

  it('one hit crossing two thresholds emits both phases in order', () => {
    const { bosses, hit, of } = started({ ...DEF, phases: [0.6, 0.3] });
    hit(30);
    hit(50); // 0.7 -> 0.2
    expect(of('boss.phase')).toEqual([
      { bossId: 'ashen-prior', phase: 2, previous: 1 },
      { bossId: 'ashen-prior', phase: 3, previous: 2 },
    ]);
    expect(bosses.state('ashen-prior')!.phase).toBe(3);
  });

  it('phases never regress after a heal', () => {
    const { bosses, hit, dr, boss, of } = started();
    hit(60);
    dr.heal(boss.id, 90);
    hit(1);
    expect(boss.health).toBe(99);
    expect(bosses.state('ashen-prior')!.phase).toBe(2);
    expect(of('boss.phase')).toHaveLength(1);
  });

  it('a hit that crosses a threshold and breaks poise counts the break in the new phase', () => {
    const { bosses, boss, hit, of, stagger } = started();
    stagger();
    stagger();
    boss.restorePoise();
    hit(60, { poise: 10 }); // damage.dealt (phase 2, breaks reset) arrives before actor.staggered
    expect(of('boss.phase')).toHaveLength(1);
    expect(of('boss.break').at(-1)).toEqual({ bossId: 'ashen-prior', phase: 2, breaks: 1, last: false });
    expect(bosses.state('ashen-prior')).toMatchObject({ phase: 2, breaks: 1 });
  });
});

describe('shield', () => {
  it('blocks a normal hit as immune with 0 dealt', () => {
    const { bosses, boss, hit, of } = started({ ...DEF, shield: true });
    const r = hit(20, { poise: 10 })!;
    expect(r.outcome).toBe('immune');
    expect(r.dealt).toBe(0);
    expect(boss.health).toBe(100);
    expect(of('damage.dealt')).toHaveLength(1);
    expect(bosses.state('ashen-prior')!.shield).toBe(true);
    expect(of('actor.staggered')).toHaveLength(0);
  });

  it('stays immune against unblockable requests', () => {
    const { boss, hit } = started({ ...DEF, shield: true });
    const r = hit(20, { unblockable: true })!;
    expect(r.outcome).toBe('immune');
    expect(boss.health).toBe(100);
  });

  it('a shieldBreaker hit drops the shield, deals damage, emits boss.shield once', () => {
    const { bosses, boss, hit, of, seen } = started({ ...DEF, shield: true });
    const r = hit(20, { attackId: 'heartshard-surge' })!;
    expect(r.outcome).toBe('hit');
    expect(r.dealt).toBe(20);
    expect(boss.health).toBe(80);
    expect(of('boss.shield')).toEqual([{ bossId: 'ashen-prior', up: false }]);
    expect(bosses.state('ashen-prior')!.shield).toBe(false);
    expect(seen.map((s) => s.type)).toContain('damage.dealt');
    expect(hit(5)!.outcome).toBe('hit');
    expect(of('boss.shield')).toHaveLength(1);
  });

  it('other attackIds do not break it', () => {
    const { boss, hit } = started({ ...DEF, shield: true });
    expect(hit(20, { attackId: 'slash' })!.outcome).toBe('immune');
    expect(boss.health).toBe(100);
  });

  it('setShield raises again and emits only on change', () => {
    const { bosses, hit, of } = started({ ...DEF, shield: true });
    bosses.setShield('ashen-prior', true);
    expect(of('boss.shield')).toHaveLength(0);
    hit(1, { attackId: 'heartshard-surge' });
    bosses.setShield('ashen-prior', true);
    expect(of('boss.shield')).toEqual([
      { bossId: 'ashen-prior', up: false },
      { bossId: 'ashen-prior', up: true },
    ]);
    expect(hit(10)!.outcome).toBe('immune');
    bosses.setShield('ashen-prior', false);
    expect(hit(10)!.outcome).toBe('hit');
  });

  it('setShield on an unknown boss warns and does nothing', () => {
    const { bosses, report, of } = started();
    bosses.setShield('ghost', true);
    expect(report).toHaveBeenCalledTimes(1);
    expect(of('boss.shield')).toHaveLength(0);
  });

  it('does not touch hits on other actors', () => {
    const { actors, dr, player, bosses, boss } = started({ ...DEF, shield: true });
    const other = actors.spawn({ kind: 'x', team: 'hostile', maxHealth: 10 });
    const r = dr.apply({ attackerId: player.id, targetId: other.id, amount: 3, kind: 'melee' })!;
    expect(r.outcome).toBe('hit');
    expect(boss.health).toBe(100);
    expect(bosses.state('ashen-prior')!.shield).toBe(true);
  });

  it('dispose removes the modifier', () => {
    const { bosses, hit, boss, events } = started({ ...DEF, shield: true });
    bosses.dispose();
    expect(hit(10)!.outcome).toBe('hit');
    expect(boss.health).toBe(90);
    expect(events.listenerCount('actor.staggered')).toBe(0);
    expect(events.listenerCount('damage.dealt')).toBe(0);
    expect(events.listenerCount('actor.died')).toBe(0);
    expect(events.listenerCount('actor.despawned')).toBe(0);
    bosses.dispose();
  });
});

describe('release window', () => {
  const finalWindow = (m: ReturnType<typeof started>) => {
    m.stagger();
    m.stagger();
    m.stagger();
  };
  const oneSingle = () => started({ ...DEF, phases: [] });

  it('release before the last break is false', () => {
    const { bosses, state, of, stagger } = oneSingle();
    stagger();
    expect(bosses.release('ashen-prior')).toBe(false);
    expect(bosses.release('ghost')).toBe(false);
    expect(state.hasFlag('boss.ashen-prior.outcome')).toBe(false);
    expect(of('boss.released')).toHaveLength(0);
  });

  it('release inside the window sets the flag, emits boss.released and closes the window', () => {
    const m = oneSingle();
    finalWindow(m);
    expect(m.bosses.release('ashen-prior')).toBe(true);
    expect(m.state.getString('boss.ashen-prior.outcome')).toBe('released');
    expect(m.of('boss.released')).toEqual([{ bossId: 'ashen-prior', actorId: m.boss.id }]);
    expect(m.of('boss.releaseWindow')).toEqual([
      { bossId: 'ashen-prior', open: true },
      { bossId: 'ashen-prior', open: false },
    ]);
    expect(m.bosses.state('ashen-prior')).toMatchObject({ releaseOpen: false, outcome: 'released' });
    expect(m.bosses.release('ashen-prior')).toBe(false);
  });

  it('after release, breaks and phases no longer change', () => {
    const m = oneSingle();
    finalWindow(m);
    m.bosses.release('ashen-prior');
    m.seen.length = 0;
    m.stagger();
    expect(m.of('boss.break')).toHaveLength(0);
  });

  it('window expires through fixedUpdate (default 4s) and release is then false', () => {
    const m = oneSingle();
    finalWindow(m);
    m.bosses.fixedUpdate(3.5);
    expect(m.bosses.state('ashen-prior')!.releaseOpen).toBe(true);
    m.bosses.fixedUpdate(0.5);
    expect(m.of('boss.releaseWindow').at(-1)).toEqual({ bossId: 'ashen-prior', open: false });
    expect(m.bosses.state('ashen-prior')!.releaseOpen).toBe(false);
    expect(m.bosses.release('ashen-prior')).toBe(false);
    m.bosses.fixedUpdate(10);
    expect(m.of('boss.releaseWindow')).toHaveLength(2);
  });

  it('honours a custom releaseWindowSeconds and ignores bad dt', () => {
    const m = started({ ...DEF, phases: [], releaseWindowSeconds: 1 });
    finalWindow(m);
    m.bosses.fixedUpdate(NaN);
    m.bosses.fixedUpdate(-5);
    m.bosses.fixedUpdate(0);
    expect(m.bosses.state('ashen-prior')!.releaseOpen).toBe(true);
    m.bosses.fixedUpdate(1);
    expect(m.bosses.state('ashen-prior')!.releaseOpen).toBe(false);
  });

  it('a fourth final-phase break restarts the timer without a second open event; after expiry it reopens', () => {
    const m = oneSingle();
    finalWindow(m);
    m.bosses.fixedUpdate(3);
    m.stagger();
    expect(m.of('boss.break').at(-1)).toMatchObject({ breaks: 4, last: true });
    expect(m.of('boss.releaseWindow')).toHaveLength(1);
    m.bosses.fixedUpdate(3);
    expect(m.bosses.state('ashen-prior')!.releaseOpen).toBe(true);
    m.bosses.fixedUpdate(1);
    expect(m.bosses.state('ashen-prior')!.releaseOpen).toBe(false);
    m.stagger();
    expect(m.of('boss.releaseWindow').map((w) => w.open)).toEqual([true, false, true]);
    expect(m.bosses.release('ashen-prior')).toBe(true);
  });

  it('despawn closes the window and ends the encounter (vault-reload reset)', () => {
    const m = oneSingle();
    finalWindow(m);
    m.actors.despawn(m.boss.id);
    expect(m.of('boss.releaseWindow').map((e) => e.open)).toEqual([true, false]);
    expect(m.of('boss.ended')).toEqual([{ bossId: 'ashen-prior', actorId: m.boss.id, reason: 'despawned' }]);
    expect(m.bosses.release('ashen-prior')).toBe(false);
  });
});

describe('death', () => {
  it('sets defeated and emits boss.defeated once', () => {
    const { bosses, hit, state, of, boss, dr } = started();
    hit(500);
    expect(boss.dead).toBe(true);
    expect(state.getString('boss.ashen-prior.outcome')).toBe('defeated');
    expect(of('boss.defeated')).toEqual([{ bossId: 'ashen-prior', actorId: boss.id }]);
    expect(bosses.state('ashen-prior')).toMatchObject({ outcome: 'defeated' });
    // killing blow does not move the phase: dead bosses are frozen
    expect(of('boss.phase')).toHaveLength(0);
    dr.kill(boss.id);
    expect(of('boss.defeated')).toHaveLength(1);
  });

  it('death closes an open release window', () => {
    const m = started({ ...DEF, phases: [] });
    m.stagger();
    m.stagger();
    m.stagger();
    m.hit(500);
    expect(m.of('boss.releaseWindow').map((w) => w.open)).toEqual([true, false]);
    expect(m.bosses.release('ashen-prior')).toBe(false);
  });

  it('death in the same batch as the last break is a defeat and release is refused', () => {
    const m = started({ ...DEF, phases: [] });
    m.stagger();
    m.stagger();
    m.boss.restorePoise();
    m.events.batch(() => {
      m.dr.stagger(m.boss.id, m.player.id, 10);
      m.dr.kill(m.boss.id, m.player.id);
    });
    expect(m.of('boss.break').at(-1)).toMatchObject({ breaks: 3, last: true });
    expect(m.of('boss.defeated')).toHaveLength(1);
    expect(m.state.getString('boss.ashen-prior.outcome')).toBe('defeated');
    expect(m.bosses.release('ashen-prior')).toBe(false);
    expect(m.bosses.state('ashen-prior')!.releaseOpen).toBe(false);
  });

  it('release then death keeps released', () => {
    const m = started({ ...DEF, phases: [] });
    m.stagger();
    m.stagger();
    m.stagger();
    m.bosses.release('ashen-prior');
    m.dr.kill(m.boss.id, m.player.id);
    expect(m.state.getString('boss.ashen-prior.outcome')).toBe('released');
    expect(m.of('boss.defeated')).toHaveLength(0);
  });

  it('a boss with an outcome cannot be registered again, even after despawn', () => {
    const m = started();
    m.hit(500);
    m.actors.despawn(m.boss.id);
    const again = m.actors.spawn({ kind: 'prior', team: 'hostile', maxHealth: 10 });
    expect(() => m.bosses.register(again.id, DEF)).toThrow(/outcome/);
  });
});

describe('robustness', () => {
  it('events for unknown actors do not throw or emit', () => {
    const { events, seen, report } = started();
    events.emit('actor.staggered', { actorId: 'ghost', byId: null });
    events.emit('actor.despawned', { actorId: 'ghost' });
    events.emit('actor.died', { actorId: 'ghost', killerId: null, kind: 'x', team: 'hostile', level: 1, spawnTag: undefined });
    expect(seen.filter((s) => s.type.startsWith('boss.'))).toHaveLength(0);
    expect(report).not.toHaveBeenCalled();
  });
});

describe('v0.4 review fixes', () => {
  it('boss.shield follows the breaking hit\'s own damage.dealt', () => {
    const { hit, seen } = started({ ...DEF, shield: true });
    hit(20, { attackId: 'heartshard-surge' });
    const types = seen.map((e) => e.type);
    expect(types.indexOf('damage.dealt')).toBeLessThan(types.indexOf('boss.shield'));
  });

  it('a breaker the boss blocks leaves the shield up', () => {
    const { bosses, dr, hit, of } = started({ ...DEF, shield: true });
    const off = dr.addModifier('test.boss-block', (req) => {
      req.outcome = 'blocked';
      req.amount = 0;
    }, -50);
    expect(hit(20, { attackId: 'heartshard-surge' })!.outcome).toBe('blocked');
    expect(bosses.state('ashen-prior')!.shield).toBe(true);
    expect(of('boss.shield')).toHaveLength(0);
    off();
  });

  it('staggers while shielded (a parry) are no breaks and never open the release window', () => {
    const { bosses, stagger, hit, of } = started({ ...DEF, phases: [], breaksPerPhase: 1, shield: true });
    stagger();
    stagger();
    expect(of('boss.break')).toHaveLength(0);
    expect(bosses.state('ashen-prior')!.releaseOpen).toBe(false);
    hit(1, { attackId: 'heartshard-surge' });
    stagger();
    expect(of('boss.break')).toEqual([{ bossId: 'ashen-prior', phase: 1, breaks: 1, last: true }]);
    expect(bosses.state('ashen-prior')!.releaseOpen).toBe(true);
  });

  it('a boss registered below a threshold starts in that phase without boss.phase', () => {
    const { bosses, boss, dr, player, of } = make();
    dr.apply({ attackerId: player.id, targetId: boss.id, amount: 60, poise: 0, kind: 'melee' });
    bosses.register(boss.id, DEF);
    expect(bosses.state('ashen-prior')!.phase).toBe(2);
    expect(of('boss.phase')).toHaveLength(0);
  });

  it('dispose emits no boss.ended', () => {
    const { bosses, of } = started();
    bosses.dispose();
    expect(of('boss.ended')).toHaveLength(0);
  });
});
