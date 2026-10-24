import { describe, expect, it } from 'vitest';
import { ActorRegistry } from '../actors/ActorRegistry';
import { DamageResolver, type DamageRequest } from '../actors/DamageResolver';
import { playerInit } from '../actors/teams';
import { GameEvents, type GameEventMap } from '../core/events';
import { TRIAL_FLOOR_ID, TRIAL_TUNING, Trials } from './trials';

const DT = 1 / 60;

function make() {
  const events = new GameEvents(() => {});
  const actors = new ActorRegistry(events);
  const dr = new DamageResolver(actors, events, () => {});
  const player = actors.spawn(playerInit());
  const opp = actors.spawn({ kind: 'hrolf-trial', team: 'hostile', maxHealth: 120, maxPoise: 45 });
  const feet = { x: 0, y: 0, z: 0 };
  const hidden: [string, boolean][] = [];
  const trials = new Trials({
    events,
    actors,
    addLethalHandler: (id, fn, order) => dr.addLethalHandler(id, fn, order),
    heal: (id, n) => dr.heal(id, n),
    playerFeet: () => feet,
    setNpcHidden: (id, h) => hidden.push([id, h]),
  });
  const seen: { type: keyof GameEventMap; payload: any }[] = [];
  events.onAny((t, p) => seen.push({ type: t, payload: p }));
  const of = <K extends keyof GameEventMap>(t: K) => seen.filter((s) => s.type === t).map((s) => s.payload as GameEventMap[K]);
  const hit = (attackerId: string | null, targetId: string, amount: number, extra: Partial<DamageRequest> = {}) =>
    dr.apply({ attackerId, targetId, amount, kind: 'melee', ...extra });
  const tick = (seconds: number) => {
    for (let t = 0; t < seconds; t += DT) trials.fixedUpdate(DT);
  };
  /** The other side breaks this one (a poise break). */
  const breakBy = (byId: string, targetId: string) => {
    dr.stagger(targetId, byId, 1000);
    tick(TRIAL_TUNING.pauseSeconds + 0.1);
  };
  return { events, actors, dr, player, opp, feet, trials, hidden, of, hit, tick, breakBy };
}

describe('the non-lethal trial service', () => {
  it('holds both sides at 1 HP, falls and status ticks included, before Second Wind', () => {
    const t = make();
    expect(t.trials.start({ id: 'm13.trial', opponentId: t.opp.id, standInNpcId: 'hrolf' })).toBe(true);
    expect(t.hidden).toEqual([['hrolf', true]]);
    const r = t.hit(t.player.id, t.opp.id, 999)!;
    expect(r).toMatchObject({ killed: false, saved: true, healthAfter: 1 });
    expect(t.of('actor.saved')[0].handlerId).toBe(TRIAL_FLOOR_ID);
    t.tick(TRIAL_TUNING.pauseSeconds + 0.1);
    expect(t.hit(t.opp.id, t.player.id, 9999)!.killed).toBe(false);
    t.tick(TRIAL_TUNING.pauseSeconds + 0.1);
    expect(t.hit(null, t.player.id, 9999, { kind: 'fall' })!.killed).toBe(false);
    expect(t.hit(null, t.opp.id, 9999, { kind: 'status', statusId: 'b#1', statusKind: 'bleed' })!.killed).toBe(false);
    // A Second Wind style handler at -100 never runs inside a trial.
    let secondWind = 0;
    t.dr.addLethalHandler('second-wind', () => (secondWind++, false), -100);
    t.hit(t.opp.id, t.player.id, 9999);
    expect(secondWind).toBe(0);
  });

  it('three yield breaks win; each break heals both and pauses', () => {
    const t = make();
    t.trials.start({ id: 'm13.trial', opponentId: t.opp.id, standInNpcId: 'hrolf' });
    t.hit(t.player.id, t.opp.id, 40);
    t.breakBy(t.player.id, t.opp.id);
    expect(t.trials.state()).toMatchObject({ player: 1, opponent: 0 });
    expect(t.opp.health).toBe(120);
    t.breakBy(t.player.id, t.opp.id);
    t.breakBy(t.player.id, t.opp.id);
    expect(t.of('trial.won')).toEqual([{ trialId: 'm13.trial' }]);
    expect(t.of('trial.ended')).toEqual([{ trialId: 'm13.trial', reason: 'won' }]);
    expect(t.trials.state()).toBeNull();
    expect(t.hidden.at(-1)).toEqual(['hrolf', false]);
    // Outside a trial the floor is gone.
    expect(t.hit(t.player.id, t.opp.id, 9999)!.killed).toBe(true);
  });

  it('a side held at its floor is a break for the other side', () => {
    const t = make();
    t.trials.start({ id: 'tr', opponentId: t.opp.id });
    t.hit(t.opp.id, t.player.id, 9999);
    t.tick(DT * 2);
    expect(t.of('trial.break')).toEqual([{ trialId: 'tr', by: 'opponent', player: 0, opponent: 1 }]);
    expect(t.player.health).toBe(t.player.maxHealth);
  });

  it('a lethal blow from a companion holds the opponent at its floor but is not a break for Cael', () => {
    const t = make();
    const ally = t.actors.spawn({ kind: 'companion', team: 'ally', maxHealth: 50 });
    t.trials.start({ id: 'tr', opponentId: t.opp.id });
    t.hit(ally.id, t.opp.id, 9999);
    t.tick(DT * 2);
    expect(t.opp.health).toBe(1);
    expect(t.of('trial.break')).toEqual([]);
    expect(t.trials.state()).toMatchObject({ player: 0, opponent: 0 });
    // Cael's own blow still breaks.
    t.opp.health = t.opp.maxHealth;
    t.hit(t.player.id, t.opp.id, 9999);
    t.tick(DT * 2);
    expect(t.of('trial.break')).toEqual([{ trialId: 'tr', by: 'player', player: 1, opponent: 0 }]);
  });

  it('a loss restarts with the score reset (default); onLoss end finishes it', () => {
    const t = make();
    t.trials.start({ id: 'tr', opponentId: t.opp.id });
    t.breakBy(t.player.id, t.opp.id);
    for (let i = 0; i < 3; i++) t.breakBy(t.opp.id, t.player.id);
    expect(t.of('trial.lost')).toEqual([{ trialId: 'tr' }]);
    expect(t.trials.state()).toMatchObject({ id: 'tr', player: 0, opponent: 0 });
    expect(t.of('trial.ended')).toEqual([]);
    t.trials.stop('tr');
    const u = make();
    u.trials.start({ id: 'tr', opponentId: u.opp.id, onLoss: 'end', breaksToWin: 1 });
    u.breakBy(u.opp.id, u.player.id);
    expect(u.of('trial.ended')).toEqual([{ trialId: 'tr', reason: 'lost' }]);
  });

  it('breaks inside the pause do not count', () => {
    const t = make();
    t.trials.start({ id: 'tr', opponentId: t.opp.id });
    t.dr.stagger(t.opp.id, t.player.id, 1000);
    t.opp.restorePoise();
    t.dr.stagger(t.opp.id, t.player.id, 1000);
    expect(t.trials.state()).toMatchObject({ player: 1 });
  });

  it('a floor or chip damage inside the pause is not scored and both sides start the next round full', () => {
    const t = make();
    t.trials.start({ id: 'tr', opponentId: t.opp.id });
    t.breakBy(t.player.id, t.opp.id);
    expect(t.trials.state()).toMatchObject({ player: 1, opponent: 0 });
    t.dr.stagger(t.opp.id, t.player.id, 1000);
    expect(t.trials.state()).toMatchObject({ player: 2 });
    // In the pause: the opponent floors Cael and chips at him.
    t.hit(t.opp.id, t.player.id, 9999);
    t.tick(0.5);
    expect(t.trials.state()).toMatchObject({ player: 2, opponent: 0 });
    t.tick(TRIAL_TUNING.pauseSeconds);
    expect(t.trials.state()).toMatchObject({ player: 2, opponent: 0 });
    expect(t.player.health).toBe(t.player.maxHealth);
    expect(t.opp.health).toBe(t.opp.maxHealth);
  });

  it('beginLoad (the companions save entry, before save.loaded) ends the old trial; a trial started by a load-time gate survives save.loaded', () => {
    const t = make();
    t.trials.start({ id: 'old', opponentId: t.opp.id, standInNpcId: 'hrolf' });
    t.trials.beginLoad();
    expect(t.of('trial.ended')).toEqual([{ trialId: 'old', reason: 'loaded' }]);
    // A quest gate restarts it while save.loaded is delivered, before the trials' own listener.
    expect(t.trials.start({ id: 'new', opponentId: t.opp.id, standInNpcId: 'hrolf' })).toBe(true);
    t.events.emit('save.loaded', { slot: 's' });
    expect(t.trials.state()).toMatchObject({ id: 'new' });
    expect(t.hidden.at(-1)).toEqual(['hrolf', true]);
    // The next load without the companions entry (an old save) still ends it.
    t.events.emit('save.loaded', { slot: 's' });
    expect(t.trials.state()).toBeNull();
  });

  it('yield ends it as yielded (M31 F2); stop ends it as stopped', () => {
    const t = make();
    t.trials.start({ id: 'tr', opponentId: t.opp.id });
    expect(t.trials.yield('other')).toBe(false);
    expect(t.trials.yield('tr')).toBe(true);
    expect(t.of('trial.ended')).toEqual([{ trialId: 'tr', reason: 'yielded' }]);
    t.trials.start({ id: 'tr2', opponentId: t.opp.id });
    expect(t.trials.stop('tr2')).toBe(true);
    expect(t.of('trial.ended').at(-1)).toEqual({ trialId: 'tr2', reason: 'stopped' });
  });

  it('ends on a teleport, a fast travel, the opponent despawning, Cael walking off, and a load', () => {
    const cases: [string, (t: ReturnType<typeof make>) => void][] = [
      ['teleport', (t) => ((t.feet.x = 50), t.tick(DT * 2))],
      ['teleport', (t) => t.events.emit('fastTravel', { fromId: 'a', toId: 'b' })],
      ['despawned', (t) => t.actors.despawn(t.opp.id)],
      ['distance', (t) => {
        for (let i = 0; i < 40; i++) {
          t.feet.z -= 1;
          t.tick(DT);
        }
      }],
      ['loaded', (t) => t.events.emit('save.loaded', { slot: 's' })],
    ];
    for (const [reason, act] of cases) {
      const t = make();
      t.trials.start({ id: 'tr', opponentId: t.opp.id, standInNpcId: 'hrolf' });
      act(t);
      expect(t.of('trial.ended'), reason).toEqual([{ trialId: 'tr', reason }]);
      expect(t.hidden.at(-1)).toEqual(['hrolf', false]);
    }
  });

  it('refuses a second trial, a missing or dead opponent, the player as opponent and a bad break count', () => {
    const t = make();
    expect(t.trials.start({ id: 'x', opponentId: 'nobody' })).toBe(false);
    expect(t.trials.start({ id: 'x', opponentId: t.player.id })).toBe(false);
    expect(t.trials.start({ id: 'x', opponentId: t.opp.id, breaksToWin: 0 })).toBe(false);
    expect(t.trials.start({ id: '', opponentId: t.opp.id })).toBe(false);
    expect(t.trials.start({ id: 'x', opponentId: t.opp.id })).toBe(true);
    expect(t.trials.start({ id: 'y', opponentId: t.opp.id })).toBe(false);
    expect(t.of('trial.started')).toEqual([{ trialId: 'x', opponentId: t.opp.id, breaksToWin: 3 }]);
  });
});
