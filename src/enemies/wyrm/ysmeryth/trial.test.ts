import { describe, expect, it, vi } from 'vitest';
import { ActorRegistry } from '../../../actors/ActorRegistry';
import { DamageResolver } from '../../../actors/DamageResolver';
import { playerInit } from '../../../actors/teams';
import type { StatusService } from '../../../actors/status';
import { GameEvents } from '../../../core/events';
import { TRIAL_TUNING, Trials } from '../../../companions/trials';
import { trialOpts, YSMERYTH, YSMERYTH_IDS } from './def';
import type { YsmerythBeat } from './events';
import type { YsmerythHandle } from './overlay';
import { CALL_GUARD_SECONDS, YsmerythTrial } from './trial';

const DT = 1 / 60;
const CENTRE = { x: 1000, y: 0, z: 2000 };
const LAND = { x: 1000, y: 0, z: 2021 };

/** The real K0 trial service, a fake Ysmeryth handle, and the controller between them. */
function make(opts: { anchors?: boolean; enemies?: boolean } = {}) {
  const events = new GameEvents(() => {});
  const actors = new ActorRegistry(events);
  const dr = new DamageResolver(actors, events, () => {});
  const player = actors.spawn(playerInit());
  const feet = { x: CENTRE.x, y: 0, z: CENTRE.z - 10 };
  const stuns: Array<{ id: string; seconds: number }> = [];
  const status = { apply: (id: string, s: { seconds: number }) => (stuns.push({ id, seconds: s.seconds }), true) } as unknown as StatusService;
  const trials = new Trials({
    events,
    actors,
    addLethalHandler: (id, fn, order) => dr.addLethalHandler(id, fn, order),
    heal: (id, n) => dr.heal(id, n),
    playerFeet: () => feet,
    status: () => status,
  });
  const spawned: string[] = [];
  const invuln = new Map<string, boolean>();
  const beats: YsmerythBeat[] = [];
  const unlocked: string[] = [];
  const warnings: string[] = [];
  let opp: ReturnType<typeof actors.spawn> | null = null;
  const enemies = {
    alive: (id: string) => (id === YSMERYTH_IDS.spawnerId && opp && !opp.dead ? [opp.id] : []),
    spawnGroup: (id: string) => {
      if (id !== YSMERYTH_IDS.spawnerId) return [];
      opp = actors.spawn({ kind: 'ysmeryth', team: 'hostile', maxHealth: 3000, maxPoise: 260 });
      spawned.push(opp.id);
      // The overlay tracks itself when she spawns.
      handle.untrack = c.hub.track!(opp.id, handle);
      return [opp.id];
    },
  };
  const c = new YsmerythTrial({
    trials: () => trials,
    enemies: () => (opts.enemies === false ? undefined : enemies),
    anchor: (id) => (opts.anchors === false ? undefined : id === YSMERYTH_IDS.arenaCentre ? CENTRE : id === YSMERYTH_IDS.landMark ? LAND : undefined),
    playerId: () => player.id,
    setInvulnerable: (id, on) => void invuln.set(id, on),
    emit: (b) => void beats.push(b),
    unlockCodex: (id) => void unlocked.push(id),
    warn: (m) => void warnings.push(m),
  });
  // A stand-in for the overlay: flies when asked and reports through the hub like the real one.
  const handle = {
    untrack: () => {},
    airborne: false,
    flight: null as YsmerythHandle['flight'],
    loops: 0,
    landings: 0,
    leaves: 0,
    passive: false,
    setPassive(on: boolean) {
      this.passive = on;
    },
    get actorId() {
      return opp!.id;
    },
    flyLoop() {
      if (this.airborne) return false;
      this.loops++;
      this.airborne = true;
      this.flight = 'loop';
      c.hub.airborne!(opp!.id, true);
      return true;
    },
    landNow() {
      if (!this.airborne) return;
      this.touchDown();
    },
    touchDown() {
      this.landings++;
      this.airborne = false;
      this.flight = null;
      c.hub.airborne!(opp!.id, false);
    },
    leave() {
      this.leaves++;
      this.flight = 'leave';
      return true;
    },
  };
  events.on('trial.started', (e) => c.started(e.trialId));
  events.on('trial.break', (e) => c.broke(e.trialId, e));
  events.on('trial.ended', (e) => c.ended(e.trialId, e.reason));
  events.on('actor.staggered', (e) => c.staggered(e.actorId));
  dr.addLethalHandler('ysmeryth.airborne-floor', (t) => (c.airborneFloor(t.id) ? ((t.health = 1), true) : false), -160);
  const ended: string[] = [];
  events.on('trial.ended', (e) => ended.push(e.reason));
  const tick = (s: number) => {
    for (let t = 0; t < s - 1e-9; t += DT) {
      trials.fixedUpdate(DT);
      c.tick(DT);
    }
  };
  const breakBy = (byId: string, targetId: string) => {
    dr.stagger(targetId, byId, 1000);
    tick(DT);
  };
  return { c, trials, dr, actors, player, feet, handle, tick, breakBy, ended, beats, invuln, stuns, spawned, unlocked, warnings, opp: () => opp! };
}

describe("Ysmeryth's trial controller (K6a PR 2)", () => {
  it('beginTrial spawns her and starts the trial with the exact options; idempotent while it runs', () => {
    const t = make();
    expect(t.c.beginTrial()).toBe(true);
    expect(t.spawned).toHaveLength(1);
    expect(t.trials.state()).toMatchObject({ id: 'ysmeryth-trial', breaksToWin: 3 });
    expect(t.unlocked).toEqual(['ysmeryth']);
    expect(t.c.beginTrial()).toBe(true);
    expect(t.spawned).toHaveLength(1);
    expect(trialOpts('x', CENTRE)).toEqual({
      id: 'ysmeryth-trial', opponentId: 'x', breaksToWin: 3, onLoss: 'restart',
      allowYield: { afterBreaks: 2 }, leaveDistance: 80, arenaCentre: { x: CENTRE.x, z: CENTRE.z },
    });
  });

  it('beginTrial fails without the roost anchors or the enemies service, and while another trial runs', () => {
    expect(make({ anchors: false }).c.beginTrial()).toBe(false);
    expect(make({ enemies: false }).c.beginTrial()).toBe(false);
    const t = make();
    const other = t.actors.spawn({ kind: 'hrolf', team: 'hostile', maxHealth: 100, maxPoise: 30 });
    t.trials.start({ id: 'hrolf-trial', opponentId: other.id });
    expect(t.c.beginTrial()).toBe(false);
    expect(t.trials.state()?.id).toBe('hrolf-trial');
  });

  it('K13 restarts it after a distance, teleport or load end (she is reused, not spawned again)', () => {
    for (const end of ['distance', 'teleport', 'loaded'] as const) {
      const t = make();
      t.c.beginTrial();
      if (end === 'distance') {
        for (let i = 0; i < 20; i++) {
          t.feet.z -= 5;
          t.tick(DT);
        }
      } else if (end === 'teleport') {
        t.feet.x += 500;
        t.tick(DT);
      } else t.trials.beginLoad();
      expect(t.ended).toEqual([end]);
      t.feet.x = CENTRE.x;
      t.feet.z = CENTRE.z - 10;
      t.tick(DT);
      expect(t.c.beginTrial()).toBe(true);
      expect(t.spawned).toHaveLength(1);
      expect(t.trials.state()?.id).toBe('ysmeryth-trial');
    }
  });

  it('brief guard: the 80 m rule never ends the trial while she flies; it ends when the player leaves the arena', () => {
    const t = make();
    t.c.beginTrial();
    t.breakBy(t.player.id, t.opp().id);
    expect(t.handle.airborne).toBe(true);
    // She is far out over the chasm (the arena rule measures the player to the roost's centre, never to her).
    t.opp().root?.position.set(CENTRE.x + 200, 30, CENTRE.z);
    t.tick(10);
    expect(t.ended).toEqual([]);
    expect(t.trials.state()?.id).toBe('ysmeryth-trial');
    // Airborne off, the player walked out past 80 m: the rule applies.
    t.handle.touchDown();
    for (let i = 0; i < 20; i++) {
      t.feet.z -= 5;
      t.tick(DT);
    }
    expect(t.ended).toEqual(['distance']);
  });

  it("brief guard on K0's opponent rule: suspended while she is airborne (the controller sets it), applies again on landing", () => {
    const t = make();
    t.c.beginTrial();
    const spy = vi.spyOn(t.trials, 'setOpponentAirborne');
    t.breakBy(t.player.id, t.opp().id);
    expect(spy).toHaveBeenLastCalledWith(true);
    t.handle.touchDown();
    expect(spy).toHaveBeenLastCalledWith(false);
  });

  it('each break flies her up (takeoff), invulnerable; landing clears both and starts a new round', () => {
    const t = make();
    t.c.beginTrial();
    t.breakBy(t.opp().id, t.player.id);
    expect(t.handle.loops).toBe(1);
    expect(t.invuln.get(t.opp().id)).toBe(true);
    expect(t.beats).toEqual(['takeoff']);
    // A second break cannot happen in the air; a stray one does not stack a second flight.
    t.c.broke('ysmeryth-trial');
    expect(t.handle.loops).toBe(1);
    t.handle.touchDown();
    expect(t.invuln.get(t.opp().id)).toBe(false);
    expect(t.beats).toEqual(['takeoff', 'landed']);
  });

  it('no break is scored while she flies: the player floored by a lingering burn stays at 1 HP without a break', () => {
    const t = make();
    t.c.beginTrial();
    t.breakBy(t.player.id, t.opp().id);
    expect(t.trials.state()).toMatchObject({ player: 1, opponent: 0 });
    t.tick(TRIAL_TUNING.pauseSeconds + 0.1);
    t.player.health = 3;
    t.dr.apply({ attackerId: null, targetId: t.player.id, amount: 50, kind: 'status' as never });
    t.tick(0.1);
    expect(t.player.health).toBe(1);
    expect(t.trials.state()).toMatchObject({ player: 1, opponent: 0 });
    // Landed: the trial's own floor scores again.
    t.handle.touchDown();
    t.player.health = 3;
    t.dr.apply({ attackerId: null, targetId: t.player.id, amount: 50, kind: 'status' as never });
    t.tick(0.1);
    expect(t.trials.state()).toMatchObject({ player: 1, opponent: 1 });
  });

  it('the call: only in a running trial, after callAfter, once per round, and stuns both through the trial service', () => {
    const t = make();
    expect(t.c.hub.callAllowed!('x')).toBe(false); // no trial
    t.c.beginTrial();
    t.tick(YSMERYTH.callAfter - 1);
    expect(t.c.hub.callAllowed!('x')).toBe(false);
    t.tick(1.1);
    expect(t.c.hub.callAllowed!('x')).toBe(true);
    t.c.hub.called!('x');
    expect(t.stuns.map((s) => s.seconds)).toEqual([YSMERYTH.callStun, YSMERYTH.callStun]);
    expect(t.beats).toContain('call');
    expect(t.c.hub.callAllowed!('x')).toBe(false); // once per round
    // The next round (a break, then her landing) opens it again after callAfter.
    t.breakBy(t.player.id, t.opp().id);
    t.handle.touchDown();
    t.tick(YSMERYTH.callAfter + 0.1);
    expect(t.c.hub.callAllowed!('x')).toBe(true);
  });

  it('the call never fires on a staggered player: it is skipped and stays available', () => {
    const t = make();
    t.c.beginTrial();
    t.tick(YSMERYTH.callAfter + 1);
    expect(t.c.hub.callAllowed!('x')).toBe(true);
    // The player staggered (by anything) just as the call's window opens.
    t.c.staggered(t.player.id);
    expect(t.c.hub.callAllowed!('x')).toBe(false);
    t.c.hub.called!('x');
    expect(t.stuns).toEqual([]);
    t.tick(CALL_GUARD_SECONDS + 0.1);
    expect(t.c.hub.callAllowed!('x')).toBe(true);
    t.c.hub.called!('x');
    expect(t.stuns).toHaveLength(2);
  });

  it('after a won or yielded end she leaves on her own after endDelay; endTrial stops a running trial and sends her off', () => {
    const t = make();
    t.c.beginTrial();
    t.breakBy(t.player.id, t.opp().id);
    t.handle.touchDown();
    t.tick(TRIAL_TUNING.pauseSeconds + 0.1);
    t.breakBy(t.opp().id, t.player.id);
    t.handle.touchDown();
    t.tick(TRIAL_TUNING.pauseSeconds + 0.1);
    expect(t.trials.canYield()).toBe(true);
    expect(t.trials.yield('ysmeryth-trial')).toBe(true);
    expect(t.ended).toEqual(['yielded']);
    t.tick(YSMERYTH.endDelay - 0.2);
    expect(t.handle.leaves).toBe(0);
    t.tick(0.3);
    expect(t.handle.leaves).toBe(1);
    const u = make();
    u.c.beginTrial();
    u.c.endTrial();
    expect(u.ended).toEqual(['stopped']);
    expect(u.handle.leaves).toBe(1);
  });

  it('a trial that ends mid-flight brings her down, passive and untouchable; a restart makes her hittable again; other trials are ignored', () => {
    const t = make();
    t.c.beginTrial();
    t.breakBy(t.player.id, t.opp().id);
    expect(t.handle.airborne).toBe(true);
    t.trials.stop('ysmeryth-trial');
    expect(t.handle.airborne).toBe(false);
    expect(t.handle.passive).toBe(true);
    expect(t.invuln.get(t.opp().id)).toBe(true);
    expect(t.c.beginTrial()).toBe(true);
    expect(t.handle.passive).toBe(false);
    expect(t.invuln.get(t.opp().id)).toBe(false);
    t.c.broke('hrolf-trial');
    t.c.ended('hrolf-trial', 'won');
    expect(t.handle.loops).toBe(1);
  });

  it('the deciding break flies no loop (no takeoff then landing); after the win she is passive and untouchable until she leaves', () => {
    const t = make();
    t.c.beginTrial();
    for (let i = 0; i < YSMERYTH.breaksToWin; i++) {
      t.breakBy(t.player.id, t.opp().id);
      if (t.handle.airborne) t.handle.touchDown();
      t.tick(TRIAL_TUNING.pauseSeconds + 0.1);
    }
    expect(t.ended).toEqual(['won']);
    expect(t.handle.loops).toBe(YSMERYTH.breaksToWin - 1);
    expect(t.handle.passive).toBe(true);
    expect(t.invuln.get(t.opp().id)).toBe(true);
    t.tick(YSMERYTH.endDelay + 0.1);
    expect(t.handle.leaves).toBe(1);
  });

  it('failure: beginTrial while she is flying off is refused (she would despawn under the new trial)', () => {
    const t = make();
    t.c.beginTrial();
    t.c.endTrial();
    expect(t.handle.flight).toBe('leave');
    expect(t.c.beginTrial()).toBe(false);
    expect(t.warnings.some((w) => w.includes('leaving'))).toBe(true);
  });
});
