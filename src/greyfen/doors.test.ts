// The Greyfen interiors' doors on the real controller (revision 2 items 3 and 8): the dive interiors lock until their quest
// starts, entry is refused under aggro, and the exit-only far doors let a player out under aggro with no outside prompt.
import { describe, expect, it } from 'vitest';
import { InteriorController, TRANSITION, type InteriorError, type InteriorPorts } from '../interiors/InteriorController';
import { boundsContain, layoutInterior, standsIn, type InteriorLayout } from '../interiors/layout';
import type { Vec3 } from '../physics/PhysicsWorld';
import { resolveLayout } from '../region/resolveLayout';
import { heightAt } from '../terrain/heightfield';
import { CHAPEL_DOOR_ID, CHAPEL_TOWER_DOOR_ID } from './chapelInterior';
import { DEEPS_ARENA_DOOR_ID, DEEPS_DOOR_ID } from './deepsInterior';
import { GREYFEN_LAYOUT } from './greyfen.layout';
import { HUT_DOOR_ID } from './hutInterior';
import { GREYFEN_DOOR_LOCKS, GREYFEN_INTERIORS } from './interiors';

const DT = 1 / 60;
const layouts = new Map<string, InteriorLayout>(GREYFEN_INTERIORS.map((d) => [d.id, layoutInterior(d, heightAt)]));
const outside = new Map(resolveLayout(GREYFEN_LAYOUT, heightAt).anchors.map((a) => [a.id, { position: a.position, yaw: a.yaw }]));

function setup() {
  const feet: Vec3 = { x: 0, y: 0, z: 0 };
  const flags = new Set<string>();
  const state = { aggro: false };
  const ports: InteriorPorts = {
    feet: () => feet,
    yaw: () => 0,
    dead: () => false,
    topContext: () => 'gameplay',
    hostileAggro: () => state.aggro,
    travelling: () => false,
    anchor: (id) => outside.get(id) ?? [...layouts.values()].flatMap((l) => l.anchors).find((a) => a.id === id),
    freeze: () => () => {},
    fade: () => {},
    teleport: (f) => {
      Object.assign(feet, f);
      return { ready: () => true };
    },
    groundBelow: () => true,
    onFloor: (id, at) => standsIn(layouts.get(id)!, at),
    aboveTerrain: (at) => at.y,
    applyEnvironment: () => {},
    emit: () => {},
    warn: () => {},
  };
  const c = new InteriorController(ports);
  for (const [id, l] of layouts) c.add({ id, doors: l.def.doors, contains: (p) => boundsContain(l.bounds, p) });
  for (const [doorId, flag] of Object.entries(GREYFEN_DOOR_LOCKS)) c.setDoorLock(doorId, () => !flags.has(flag));
  const settle = async <T,>(p: Promise<T>) => {
    for (let i = 0; i < Math.ceil((TRANSITION.fadeOutSeconds + TRANSITION.fadeInSeconds + 0.5) / DT); i++) c.tick(DT);
    return p;
  };
  return { c, feet, flags, state, settle };
}

const reason = async (p: Promise<unknown>, settle: (p: Promise<unknown>) => Promise<unknown>) => {
  try {
    await settle(p);
  } catch (e) {
    return (e as InteriorError).reason;
  }
  return 'resolved';
};

describe('the Greyfen interiors\' doors', () => {
  it('keeps the chapel and the Deeps locked until R13 and D05 start; the hut is never locked', async () => {
    const t = setup();
    expect(await reason(t.c.enter('greyfen-chapel', CHAPEL_DOOR_ID), t.settle)).toBe('locked');
    expect(await reason(t.c.enter('greyfen-deeps', DEEPS_DOOR_ID), t.settle)).toBe('locked');
    expect(await reason(t.c.enter('greyfen-hut', HUT_DOOR_ID), t.settle)).toBe('resolved');
    expect(t.c.current).toBe('greyfen-hut');
    expect(await reason(t.c.exit(), t.settle)).toBe('resolved');
    t.flags.add(GREYFEN_DOOR_LOCKS[CHAPEL_DOOR_ID]!);
    expect(await reason(t.c.enter('greyfen-chapel', CHAPEL_DOOR_ID), t.settle)).toBe('resolved');
    expect(t.c.current).toBe('greyfen-chapel');
  });

  it('refuses entry under aggro, and lets the player out of both far doors under aggro onto the ground outside', async () => {
    for (const [id, door, far, lock] of [
      ['greyfen-chapel', CHAPEL_DOOR_ID, CHAPEL_TOWER_DOOR_ID, 'greyfen.chapel.tower-exit'],
      ['greyfen-deeps', DEEPS_DOOR_ID, DEEPS_ARENA_DOOR_ID, 'greyfen.deeps.arena-exit'],
    ] as const) {
      const t = setup();
      t.flags.add(GREYFEN_DOOR_LOCKS[door]!);
      t.state.aggro = true;
      expect(await reason(t.c.enter(id, door), t.settle), id).toBe('aggro');
      t.state.aggro = false;
      expect(await reason(t.c.enter(id, door), t.settle), id).toBe('resolved');
      // A live leech or Murkjaw never traps anyone: exits do not check aggro.
      t.state.aggro = true;
      expect(await reason(t.c.exit(far), t.settle), id).toBe('resolved');
      expect(t.c.current).toBeNull();
      const out = outside.get(lock)!.position;
      expect(Math.hypot(t.feet.x - out.x, t.feet.z - out.z), id).toBeLessThan(2);
      expect(t.feet.y, id).toBeCloseTo(heightAt(t.feet.x, t.feet.z), 0);
    }
  });

  it('gives the far doors no outside prompt (no way in from the tower stump or the collapsed wall)', () => {
    const far = GREYFEN_INTERIORS.flatMap((d) => d.doors).filter((d) => d.doorId === CHAPEL_TOWER_DOOR_ID || d.doorId === DEEPS_ARENA_DOOR_ID);
    expect(far).toHaveLength(2);
    for (const d of far) expect(d.outsideInteractable, d.doorId).toBe(false);
    for (const d of GREYFEN_INTERIORS.flatMap((x) => x.doors).filter((x) => !far.includes(x))) expect(d.outsideInteractable, d.doorId).not.toBe(false);
  });
});
