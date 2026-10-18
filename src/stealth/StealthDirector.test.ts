import { describe, expect, it, vi } from 'vitest';
import type { Anchor } from '../layout/AnchorRegistry';
import { SaveSuspensions } from '../save/suspend';
import type { GuardPerceptionState, P3 } from './perceptionPort';
import type { StealthSectionDef } from './sections';
import { StealthDirector, type StealthPorts } from './StealthDirector';
import { STEALTH } from './tuning';

const DT = 1 / 60;

const SECTION: StealthSectionDef = {
  id: 'test.section',
  quest: { id: 'q', liveFrom: 'o1', liveUntil: 'o2', exitArmedAfter: ['o1'] },
  bounds: { anchor: 'sec.centre', half: { x: 20, y: 5, z: 20 } },
  checkpoints: [
    { id: 'cp.a', anchor: 'sec.a', volume: { anchor: 'sec.a', half: { x: 2, y: 3, z: 2 } } },
    { id: 'cp.b', anchor: 'sec.b', volume: { anchor: 'sec.b', half: { x: 2, y: 3, z: 2 } } },
  ],
  exit: { anchor: 'sec.exit', half: { x: 2, y: 3, z: 2 } },
  guardGroups: ['g'],
  hideSpots: [{ id: 'hide:t-1', anchor: 'sec.hide' }],
};

function world() {
  const anchors = new Map<string, Anchor>();
  const put = (id: string, x: number, z: number) => anchors.set(id, { id, position: { x, y: 0, z }, yaw: 0 });
  put('sec.centre', 0, 0);
  put('sec.a', -15, 0);
  put('sec.b', 0, 0);
  put('sec.exit', 15, 0);
  put('sec.hide', 5, 5);
  const feet: P3 = { x: -40, y: 0, z: 0 };
  const quest = { live: true, armed: false };
  const guards = new Map<string, GuardPerceptionState>([['guard-1', { awareness: 0, sees: false, hears: false, distance: 10 }]]);
  let released = 0;
  const loading = { v: false };
  const tp = { hold: false, pending: [] as (() => void)[] };
  const suspensions = new SaveSuspensions(() => void released++);
  const events: string[] = [];
  const saves: string[] = [];
  const teleports: P3[] = [];
  let resets = 0;
  const ports: StealthPorts = {
    find: (id) => anchors.get(id),
    interiorAt: () => null,
    playerFeet: () => feet,
    sectionLive: () => quest.live,
    exitArmed: () => quest.armed,
    guards: () => [...guards.keys()],
    guardState: (id) => guards.get(id) ?? null,
    resetGuards: () => void resets++,
    teleport: (p) => {
      teleports.push({ ...p });
      if (tp.hold) return new Promise<boolean>((res) => tp.pending.push(() => (Object.assign(feet, p), res(true))));
      Object.assign(feet, p);
      return Promise.resolve(true);
    },
    paused: () => loading.v,
    suspend: (r) => suspensions.suspend(r),
    checkpointSave: (r) => {
      saves.push(`${r} held=${suspensions.active}`);
    },
    emit: {
      section: (s, p) => events.push(`section ${s} ${p}`),
      alert: (o, _s, st) => events.push(`alert ${o} ${st}`),
      noticed: (o) => events.push(`noticed ${o}`),
      caught: (o, _s, c) => events.push(`caught ${o} ${c}`),
      checkpoint: (_s, c) => events.push(`checkpoint ${c}`),
    },
    warn: vi.fn(),
  };
  const d = new StealthDirector([SECTION], ports);
  const at = (x: number, z: number) => Object.assign(feet, { x, y: 0, z });
  return { d, ports, feet, at, quest, guards, suspensions, events, saves, teleports, resets: () => resets, loading, tp, get released() { return released; } };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('StealthDirector', () => {
  it('entering a live section takes a hold and leaving the box releases it with exited', () => {
    const w = world();
    w.d.fixedUpdate(DT);
    expect(w.suspensions.active).toBe(false);
    w.at(-10, 10);
    w.d.fixedUpdate(DT);
    expect(w.events).toContain('section test.section entered');
    expect(w.suspensions.active).toBe(true);
    w.at(-40, 0);
    w.d.fixedUpdate(DT);
    expect(w.events.at(-1)).toBe('section test.section exited');
    expect(w.suspensions.active).toBe(false);
  });

  it('a section that is not live is never entered', () => {
    const w = world();
    w.quest.live = false;
    w.at(0, 10);
    w.d.fixedUpdate(DT);
    expect(w.d.section).toBeNull();
    expect(w.suspensions.active).toBe(false);
  });

  it('the exit clears only once armed', () => {
    const w = world();
    w.at(15, 0);
    w.d.fixedUpdate(DT);
    expect(w.d.section).not.toBeNull();
    w.quest.armed = true;
    w.d.fixedUpdate(DT);
    expect(w.events.at(-1)).toBe('section test.section cleared');
    expect(w.suspensions.active).toBe(false);
  });

  it('the quest closing mid-section (a bribe) exits and releases', () => {
    const w = world();
    w.at(0, 10);
    w.d.fixedUpdate(DT);
    w.quest.live = false;
    w.d.fixedUpdate(DT);
    expect(w.events.at(-1)).toBe('section test.section exited');
    expect(w.suspensions.active).toBe(false);
  });

  it('checkpoints advance forward only and save with the hold released, then hold again', () => {
    const w = world();
    w.at(-15, 0);
    w.d.fixedUpdate(DT);
    expect(w.saves).toEqual(['stealth:cp.a held=false']);
    expect(w.suspensions.active).toBe(true);
    w.at(0, 0);
    w.d.fixedUpdate(DT);
    w.at(-15, 0);
    w.d.fixedUpdate(DT);
    expect(w.saves).toEqual(['stealth:cp.a held=false', 'stealth:cp.b held=false']);
    expect(w.d.checkpointOf('test.section')).toBe('cp.b');
    expect(w.events.filter((e) => e.startsWith('checkpoint'))).toEqual(['checkpoint cp.a', 'checkpoint cp.b']);
  });

  it('a checkpoint save taken while another hold is active defers until the last release', () => {
    const w = world();
    const other = w.suspensions.suspend('chase');
    w.at(-15, 0);
    w.d.fixedUpdate(DT);
    expect(w.saves).toEqual(['stealth:cp.a held=true']); // the save manager defers a save asked for while held
    other();
    expect(w.suspensions.active).toBe(true); // our own hold is back, so the deferred save waits for the exit
    w.at(-40, 0);
    w.d.fixedUpdate(DT);
    expect(w.suspensions.active).toBe(false);
    expect(w.released).toBe(1); // the release-to-zero runs the deferred save
  });

  it('caught after the grace: teleports to the latest checkpoint, resets guards, keeps the section and the hold, never saves', async () => {
    const w = world();
    w.at(0, 0);
    w.d.fixedUpdate(DT); // enters and reaches cp.b
    const savesBefore = w.saves.length;
    w.at(5, 0);
    w.guards.set('guard-1', { awareness: 1, sees: true, hears: false, distance: 8 });
    const n = Math.ceil(STEALTH.caughtGraceSeconds / DT);
    for (let i = 0; i < n + 1; i++) w.d.fixedUpdate(DT);
    expect(w.events).toContain('caught guard-1 cp.b');
    expect(w.teleports).toEqual([{ x: 0, y: 0, z: 0 }]);
    expect(w.resets()).toBe(1);
    expect(w.d.section?.id).toBe('test.section');
    expect(w.suspensions.active).toBe(true);
    await flush();
    w.guards.set('guard-1', { awareness: 0, sees: false, hears: false, distance: 8 });
    w.d.fixedUpdate(DT);
    expect(w.saves.length).toBe(savesBefore);
    expect(w.events.filter((e) => e.includes('exited'))).toEqual([]);
  });

  it('alert events fire on state changes only and the eye reports the worst guard', () => {
    const w = world();
    w.at(5, 0);
    w.d.fixedUpdate(DT);
    expect(w.d.eye()).toEqual({ level: 0, state: 'calm', observerId: null });
    w.guards.set('guard-1', { awareness: 0.5, sees: true, hears: false, distance: 8 });
    w.d.fixedUpdate(DT);
    w.d.fixedUpdate(DT);
    expect(w.events.filter((e) => e.startsWith('alert'))).toEqual(['alert guard-1 suspicious']);
    expect(w.d.eye()).toEqual({ level: 0.5, state: 'suspicious', observerId: 'guard-1' });
    expect(w.d.suspicion('guard-1')).toBe(0.5);
  });

  it('the eye is null outside a section', () => {
    expect(world().d.eye()).toBeNull();
  });

  it('ai.spotted maps to stealth.noticed only for the live section guards', () => {
    const w = world();
    w.d.onSpotted('guard-1');
    expect(w.events).toEqual([]);
    w.at(5, 0);
    w.d.fixedUpdate(DT);
    w.d.onSpotted('stranger');
    w.d.onSpotted('guard-1');
    expect(w.events.filter((e) => e.startsWith('noticed'))).toEqual(['noticed guard-1']);
  });

  it('hitting a watch guard counts as caught', () => {
    const w = world();
    w.at(5, 0);
    w.d.fixedUpdate(DT);
    w.d.onPlayerHitGuard('guard-1');
    expect(w.events.some((e) => e.startsWith('caught guard-1'))).toBe(true);
  });

  it('hide spots: only in the live section, not while an alerted guard watches', () => {
    const w = world();
    expect(w.d.hide('hide:t-1')).toBe(false);
    w.at(5, 0);
    w.d.fixedUpdate(DT);
    expect(w.d.hide('hide:nope')).toBe(false);
    expect(w.d.hide('hide:t-1')).toBe(true);
    expect(w.d.hidden).toBe(true);
    w.d.unhide();
    w.guards.set('guard-1', { awareness: 1, sees: true, hears: false, distance: 8 });
    w.d.fixedUpdate(DT);
    expect(w.d.hide('hide:t-1')).toBe(false);
  });

  it('persists checkpoint ids; unknown ids are dropped with a warning', () => {
    const w = world();
    w.at(-15, 0);
    w.d.fixedUpdate(DT);
    expect(w.d.serialize()).toEqual({ checkpoints: { 'test.section': 'cp.a' } });
    const w2 = world();
    w2.d.load({ checkpoints: { 'test.section': 'cp.b', 'gone.section': 'x', 'test.section2': 1 } });
    expect(w2.d.checkpointOf('test.section')).toBe('cp.b');
    expect(w2.ports.warn).toHaveBeenCalledTimes(2);
    w2.d.load(null);
    expect(w2.d.checkpointOf('test.section')).toBeNull();
  });

  it('load inside a live section teleports to its stored checkpoint and re-enters next tick', async () => {
    const w = world();
    w.d.load({ checkpoints: { 'test.section': 'cp.a' } });
    w.at(10, 10);
    w.d.onLoaded();
    expect(w.teleports).toEqual([{ x: -15, y: 0, z: 0 }]);
    expect(w.resets()).toBe(1);
    await flush();
    w.d.fixedUpdate(DT);
    expect(w.events).toContain('section test.section entered');
  });

  it('load outside a section, or after it closed, does nothing', () => {
    const w = world();
    w.d.onLoaded();
    w.at(10, 10);
    w.quest.live = false;
    w.d.onLoaded();
    expect(w.teleports).toEqual([]);
  });

  it('load while a section was active drops its hold before the rule runs', () => {
    const w = world();
    w.at(5, 0);
    w.d.fixedUpdate(DT);
    expect(w.suspensions.active).toBe(true);
    w.at(-40, 0);
    w.d.onLoaded();
    expect(w.suspensions.active).toBe(false);
    expect(w.d.section).toBeNull();
  });

  it('the load itself emits exited for the section it drops', () => {
    const w = world();
    w.at(5, 0);
    w.d.fixedUpdate(DT);
    w.at(-40, 0);
    w.d.onLoaded();
    expect(w.events.at(-1)).toBe('section test.section exited');
  });

  it('cleared is latched: standing on the armed exit does not loop entered and cleared', () => {
    const w = world();
    w.quest.armed = true;
    w.at(15, 0);
    for (let i = 0; i < 10; i++) w.d.fixedUpdate(DT);
    expect(w.events.filter((e) => e.startsWith('section'))).toEqual(['section test.section entered', 'section test.section cleared']);
    // The window closing and reopening clears the latch.
    w.quest.live = false;
    w.d.fixedUpdate(DT);
    w.quest.live = true;
    w.quest.armed = false;
    w.d.fixedUpdate(DT);
    expect(w.events.filter((e) => e.endsWith('entered'))).toHaveLength(2);
  });

  it('skips ticks while a save is loading (between the load teleport and save.loaded)', () => {
    const w = world();
    w.loading.v = true;
    w.at(0, 0);
    w.d.fixedUpdate(DT);
    expect(w.d.section).toBeNull();
    w.loading.v = false;
    w.d.fixedUpdate(DT);
    expect(w.d.section?.id).toBe('test.section');
  });

  it('a stale capture teleport resolving late does not end a newer capture', async () => {
    const w = world();
    w.at(0, 0);
    w.d.fixedUpdate(DT);
    w.tp.hold = true;
    w.d.onPlayerHitGuard('guard-1');
    w.d.onLoaded(); // a load while the capture teleport is still in flight starts a newer one
    expect(w.tp.pending).toHaveLength(2);
    w.tp.pending[0]();
    await flush();
    // Still mid-teleport: a hit is ignored, not a second capture.
    w.d.onPlayerHitGuard('guard-1');
    expect(w.events.filter((e) => e.startsWith('caught'))).toHaveLength(1);
    w.tp.pending[1]();
    await flush();
    w.d.fixedUpdate(DT);
    w.d.onPlayerHitGuard('guard-1');
    expect(w.events.filter((e) => e.startsWith('caught'))).toHaveLength(2);
  });

  it('re-entering never teleports forward', () => {
    const w = world();
    w.at(0, 0);
    w.d.fixedUpdate(DT);
    w.at(-40, 0);
    w.d.fixedUpdate(DT);
    w.at(-18, 10);
    w.d.fixedUpdate(DT);
    expect(w.teleports).toEqual([]);
    expect(w.d.checkpointOf('test.section')).toBe('cp.b');
  });

  it('interior bounds: the section is live while interiorAt says so', () => {
    const w = world();
    const inside = { v: false };
    const d = new StealthDirector([{ ...SECTION, bounds: { interior: 'counting-house' } }], { ...w.ports, interiorAt: () => (inside.v ? 'counting-house' : null) });
    w.at(100, 100);
    d.fixedUpdate(DT);
    expect(d.section).toBeNull();
    inside.v = true;
    d.fixedUpdate(DT);
    expect(d.section?.id).toBe('test.section');
    inside.v = false;
    d.fixedUpdate(DT);
    expect(d.section).toBeNull();
    expect(w.events.at(-1)).toBe('section test.section exited');
  });

  it('dispose releases the hold and is idempotent', () => {
    const w = world();
    w.at(5, 0);
    w.d.fixedUpdate(DT);
    w.d.dispose();
    w.d.dispose();
    expect(w.suspensions.active).toBe(false);
    w.d.fixedUpdate(DT);
    expect(w.suspensions.active).toBe(false);
  });
});
