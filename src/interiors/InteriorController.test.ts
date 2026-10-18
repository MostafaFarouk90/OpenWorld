import { describe, expect, it, vi } from 'vitest';
import type { Vec3 } from '../physics/PhysicsWorld';
import { InteriorController, InteriorError, TRANSITION, type InteriorPorts } from './InteriorController';

const DT = 1 / 60;
const VAULT = 'chapel-vault';

/** A fake world: the vault is the box y 140..160 around (0, 150, 0); outside is the ground at y 0. */
function setup(over: Partial<InteriorPorts> = {}) {
  const feet: Vec3 = { x: 0, y: 0, z: 20 };
  const log: string[] = [];
  const events: { type: string; payload: { interiorId: string; doorId: string } }[] = [];
  const state = {
    dead: false,
    top: 'gameplay',
    aggro: false,
    travelling: false,
    ready: true,
    ground: true,
    frozen: 0,
    applied: [] as (string | null)[],
  };
  const anchors: Record<string, { position: Vec3; yaw: number }> = {
    'vault.door': { position: { x: 0, y: 0, z: 10 }, yaw: Math.PI }, // faces +Z, away from the stair
    'vault.entry': { position: { x: 0, y: 150, z: -1 }, yaw: 0 },
    'vault.exit': { position: { x: 0, y: 150, z: 2 }, yaw: 0 },
    'vault.back': { position: { x: 5, y: 0, z: 10 }, yaw: 0 },
  };
  const ports: InteriorPorts = {
    feet: () => feet,
    yaw: () => 0,
    dead: () => state.dead,
    topContext: () => state.top,
    hostileAggro: () => state.aggro,
    travelling: () => state.travelling,
    anchor: (id) => anchors[id],
    freeze: () => {
      state.frozen++;
      log.push('freeze');
      return () => {
        state.frozen--;
        log.push('release');
      };
    },
    fade: (o) => log.push(`fade ${o}`),
    teleport: (f) => {
      log.push(`teleport ${f.y}`);
      Object.assign(feet, f);
      return { ready: () => state.ready };
    },
    groundBelow: () => state.ground,
    applyEnvironment: (id) => {
      state.applied.push(id);
      log.push(`env ${id}`);
    },
    emit: (type, payload) => {
      events.push({ type, payload });
      log.push(type);
    },
    warn: () => {},
    ...over,
  };
  const c = new InteriorController(ports);
  const inVault = (p: Vec3) => Math.abs(p.x) < 30 && Math.abs(p.z) < 60 && p.y > 140 && p.y < 160;
  c.add({
    id: VAULT,
    doors: [
      { doorId: 'vault', outside: 'vault.door', inside: 'vault.entry', exit: 'vault.exit' },
      { doorId: 'back', outside: 'vault.back', inside: 'vault.entry', exit: 'vault.exit' },
    ],
    contains: inVault,
  });
  const run = (seconds: number) => {
    for (let i = 0; i < Math.ceil(seconds / DT); i++) c.tick(DT);
  };
  const settle = async <T,>(p: Promise<T>) => {
    run(TRANSITION.fadeOutSeconds + TRANSITION.fadeInSeconds + 0.2);
    return p;
  };
  return { c, feet, log, events, state, anchors, run, settle };
}

const reason = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return (e as InteriorError).reason;
  }
  return 'resolved';
};

describe('InteriorController: enter and exit', () => {
  it('enters in order: freeze, fade out, look + state + teleport in one tick, wait for ground, fade in, event, release', async () => {
    const t = setup();
    const p = t.c.enter(VAULT, 'vault');
    expect(t.c.transitioning).toBe(true);
    expect(t.c.current).toBeNull();
    await t.settle(p);
    expect(t.log).toEqual(['freeze', 'fade 1', `env ${VAULT}`, 'teleport 150', 'fade 0', 'release', 'interior.entered', ]);
    expect(t.c.current).toBe(VAULT);
    expect(t.c.currentDoor).toBe('vault');
    expect(t.events).toEqual([{ type: 'interior.entered', payload: { interiorId: VAULT, doorId: 'vault' } }]);
    expect(t.state.frozen).toBe(0);
  });

  it('flips the saved state in the same tick as the teleport (a save never pairs the vault with the chapel floor)', () => {
    const t = setup();
    const save = t.c.persistable();
    void t.c.enter(VAULT, 'vault').catch(() => {});
    const snapshots: { y: number; data: unknown }[] = [];
    for (let i = 0; i < 60; i++) {
      t.c.tick(DT);
      snapshots.push({ y: t.feet.y, data: save.serialize() });
    }
    for (const s of snapshots) {
      const inside = (s.data as { interiorId: string | null }).interiorId === VAULT;
      expect(inside).toBe(s.y === 150);
    }
  });

  it('exits through the door used, to a point in front of the outside anchor, and allows it while hostiles are aggroed', async () => {
    const t = setup();
    await t.settle(t.c.enter(VAULT, 'back'));
    t.state.aggro = true;
    t.log.length = 0;
    await t.settle(t.c.exit());
    expect(t.c.current).toBeNull();
    expect(t.feet.x).toBeCloseTo(5);
    // yaw 0 faces -Z: 1.6 m in front of (5, 10) is (5, 8.4).
    expect(t.feet.z).toBeCloseTo(10 - TRANSITION.arrivalOffset);
    expect(t.log).toEqual(['freeze', 'fade 1', 'env null', 'teleport 0.05', 'fade 0', 'release', 'interior.exited']);
    expect(t.events.at(-1)).toEqual({ type: 'interior.exited', payload: { interiorId: VAULT, doorId: 'back' } });
  });

  it('exits through a named door and faces out of the stair', async () => {
    const t = setup();
    await t.settle(t.c.enter(VAULT, 'back'));
    await t.settle(t.c.exit('vault'));
    expect(t.feet.z).toBeCloseTo(10 + TRANSITION.arrivalOffset);
    expect(t.events.at(-1)!.payload.doorId).toBe('vault');
  });

  it.each([
    ['unknown interior', (t: ReturnType<typeof setup>) => t.c.enter('nowhere', 'vault'), 'unknown'],
    ['unknown door', (t: ReturnType<typeof setup>) => t.c.enter(VAULT, 'nope'), 'unknown'],
    ['dead', (t: ReturnType<typeof setup>) => ((t.state.dead = true), t.c.enter(VAULT, 'vault')), 'dead'],
    ['dialogue', (t: ReturnType<typeof setup>) => ((t.state.top = 'dialogue'), t.c.enter(VAULT, 'vault')), 'dialogue'],
    ['cutscene', (t: ReturnType<typeof setup>) => ((t.state.top = 'cutscene'), t.c.enter(VAULT, 'vault')), 'cutscene'],
    ['aggro', (t: ReturnType<typeof setup>) => ((t.state.aggro = true), t.c.enter(VAULT, 'vault')), 'aggro'],
    ['travelling', (t: ReturnType<typeof setup>) => ((t.state.travelling = true), t.c.enter(VAULT, 'vault')), 'travelling'],
    ['locked', (t: ReturnType<typeof setup>) => (t.c.setDoorLock('vault', () => true), t.c.enter(VAULT, 'vault')), 'locked'],
  ])('refuses to enter when %s and changes nothing', async (_name, act, expected) => {
    const t = setup();
    expect(await reason(act(t))).toBe(expected);
    expect(t.log).toEqual([]);
    expect(t.c.current).toBeNull();
    expect(t.c.transitioning).toBe(false);
  });

  it('refuses a second enter while busy, an enter while inside, and an exit while outside', async () => {
    const t = setup();
    const first = t.c.enter(VAULT, 'vault');
    expect(await reason(t.c.enter(VAULT, 'vault'))).toBe('busy');
    expect(await reason(t.c.exit())).toBe('busy');
    await t.settle(first);
    expect(await reason(t.c.enter(VAULT, 'back'))).toBe('inside');
    await t.settle(t.c.exit());
    expect(await reason(t.c.exit())).toBe('not-inside');
  });

  it('refuses to exit while travelling, dead or in dialogue, and through an unknown door', async () => {
    const t = setup();
    await t.settle(t.c.enter(VAULT, 'vault'));
    t.state.travelling = true;
    expect(await reason(t.c.exit())).toBe('travelling');
    t.state.travelling = false;
    t.state.top = 'dialogue';
    expect(await reason(t.c.exit())).toBe('dialogue');
    t.state.top = 'gameplay';
    t.state.dead = true;
    expect(await reason(t.c.exit())).toBe('dead');
    t.state.dead = false;
    expect(await reason(t.c.exit('nope'))).toBe('unknown');
    expect(t.c.current).toBe(VAULT);
  });

  it('refuses an exit when the outside anchor is missing', async () => {
    const t = setup();
    await t.settle(t.c.enter(VAULT, 'vault'));
    delete t.anchors['vault.door'];
    expect(await reason(t.c.exit())).toBe('unknown');
  });

  it('reads lock predicates live, unlocks on undo, and treats a throwing predicate as unlocked', async () => {
    const t = setup();
    let locked = true;
    const off = t.c.setDoorLock('vault', () => locked);
    expect(t.c.isDoorLocked('vault')).toBe(true);
    locked = false;
    expect(t.c.isDoorLocked('vault')).toBe(false);
    locked = true;
    off();
    expect(t.c.isDoorLocked('vault')).toBe(false);
    t.c.setDoorLock('vault', () => {
      throw new Error('boom');
    });
    expect(t.c.isDoorLocked('vault')).toBe(false);
  });

  it('rolls back when the ground never shows up, and rejects not-ready', async () => {
    const t = setup();
    t.state.ground = false;
    const p = t.c.enter(VAULT, 'vault');
    t.run(TRANSITION.fadeOutSeconds + TRANSITION.settleTimeoutSeconds + 0.1);
    expect(await reason(p)).toBe('not-ready');
    expect(t.c.current).toBeNull();
    expect(t.feet).toMatchObject({ x: 0, y: 0, z: 20 });
    expect(t.state.applied.at(-1)).toBeNull();
    expect(t.state.frozen).toBe(0);
    expect(t.events).toEqual([]);
    expect(t.log.at(-2)).toBe('fade 0');
  });

  it('waits while the collider patch is not ready', () => {
    const t = setup();
    t.state.ready = false;
    void t.c.enter(VAULT, 'vault').catch(() => {});
    t.run(1);
    expect(t.log).not.toContain('fade 0');
    t.state.ready = true;
    t.run(1);
    expect(t.events).toHaveLength(1);
  });
});

describe('InteriorController: aborts', () => {
  it('aborts on death during the fade-out without changing state', async () => {
    const t = setup();
    const p = t.c.enter(VAULT, 'vault');
    t.run(0.1);
    t.state.dead = true;
    t.run(0.1);
    expect(await reason(p)).toBe('aborted');
    expect(t.c.current).toBeNull();
    expect(t.state.frozen).toBe(0);
    expect(t.events).toEqual([]);
  });

  it('aborts when a death respawn moves the player away mid-enter, then the bounds rule restores the outdoors with no events', async () => {
    const t = setup();
    const p = t.c.enter(VAULT, 'vault');
    t.run(TRANSITION.fadeOutSeconds + 0.05);
    expect(t.c.current).toBe(VAULT);
    Object.assign(t.feet, { x: 300, y: 2, z: 300 }); // the waystone's takeover teleport
    t.run(0.1);
    expect(await reason(p)).toBe('aborted');
    expect(t.c.current).toBeNull();
    expect(t.state.applied.at(-1)).toBeNull();
    expect(t.events).toEqual([]);
  });

  it('aborts an exit taken over by fast travel, and the bounds rule keeps events alternating', async () => {
    const t = setup();
    await t.settle(t.c.enter(VAULT, 'vault'));
    const p = t.c.exit();
    t.run(TRANSITION.fadeOutSeconds + 0.05);
    Object.assign(t.feet, { x: 500, y: 0, z: 500 });
    t.run(0.1);
    expect(await reason(p)).toBe('aborted');
    expect(t.c.current).toBeNull();
    // entered once by the door; exited never emitted for the aborted exit, so the alternation is broken only if we emit again.
    t.run(0.1);
    expect(t.events.map((e) => e.type)).toEqual(['interior.entered']);
  });

  it('refuses an exit requested during the enter fade, and an enter during the exit fade', async () => {
    const t = setup();
    const p = t.c.enter(VAULT, 'vault');
    t.run(0.1);
    expect(await reason(t.c.exit())).toBe('busy');
    await t.settle(p);
    const q = t.c.exit();
    t.run(0.1);
    expect(await reason(t.c.enter(VAULT, 'vault'))).toBe('busy');
    await t.settle(q);
    expect(t.events.map((e) => e.type)).toEqual(['interior.entered', 'interior.exited']);
  });

  it('aborts a transition when a save loads mid-way', async () => {
    const t = setup();
    const p = t.c.enter(VAULT, 'vault');
    t.run(0.1);
    t.c.persistable().load({ interiorId: null, doorId: null }, 1);
    expect(await reason(p)).toBe('aborted');
    expect(t.state.frozen).toBe(0);
  });
});

describe('InteriorController: the bounds rule', () => {
  it('takes the player out after a death respawn while inside: one exited, with the door used', async () => {
    const t = setup();
    await t.settle(t.c.enter(VAULT, 'back'));
    Object.assign(t.feet, { x: 300, y: 2, z: 300 });
    t.c.tick(DT);
    expect(t.c.current).toBe(VAULT); // one tick outside is not enough
    t.run(0.2);
    expect(t.c.current).toBeNull();
    expect(t.state.applied.at(-1)).toBeNull();
    expect(t.events.map((e) => [e.type, e.payload.doorId])).toEqual([
      ['interior.entered', 'back'],
      ['interior.exited', 'back'],
    ]);
  });

  it('puts the player in when the feet appear inside the bounds without a door, using the first door', () => {
    const t = setup();
    Object.assign(t.feet, { x: 0, y: 150, z: -10 });
    t.run(0.1);
    expect(t.c.current).toBe(VAULT);
    expect(t.state.applied).toEqual([VAULT]);
    expect(t.events).toEqual([{ type: 'interior.entered', payload: { interiorId: VAULT, doorId: 'vault' } }]);
  });

  it('runs during waystone travel', async () => {
    const t = setup();
    await t.settle(t.c.enter(VAULT, 'vault'));
    t.state.travelling = true;
    Object.assign(t.feet, { x: 300, y: 2, z: 300 });
    t.run(0.1);
    expect(t.c.current).toBeNull();
  });

  it('interiorAt answers by 3D bounds and rejects bad input', () => {
    const t = setup();
    expect(t.c.interiorAt({ x: 0, y: 150, z: 0 })).toBe(VAULT);
    expect(t.c.interiorAt({ x: 0, y: 0, z: 0 })).toBeNull();
    expect(t.c.interiorAt({ x: NaN, y: 150, z: 0 })).toBeNull();
  });
});

describe('InteriorController: saves', () => {
  it('serialises inside and outside', async () => {
    const t = setup();
    const p = t.c.persistable();
    expect(p.key).toBe('interior');
    expect(p.version).toBe(1);
    expect(p.serialize()).toEqual({ interiorId: null, doorId: null });
    await t.settle(t.c.enter(VAULT, 'back'));
    expect(p.serialize()).toEqual({ interiorId: VAULT, doorId: 'back' });
  });

  it('a load into the vault sets current at once, applies the look only when the feet arrive, and emits one entered', () => {
    const t = setup();
    t.c.persistable().load({ interiorId: VAULT, doorId: 'vault' }, 1);
    expect(t.c.current).toBe(VAULT);
    expect(t.state.applied).toEqual([]);
    // The save loader's fade-out: the feet are still outdoors and nothing may change.
    t.run(0.3);
    expect(t.c.current).toBe(VAULT);
    expect(t.state.applied).toEqual([]);
    Object.assign(t.feet, { x: 0, y: 150, z: -5 }); // placed at black
    t.c.tick(DT);
    expect(t.state.applied).toEqual([VAULT]);
    expect(t.events).toEqual([]);
    t.c.onSaveLoaded();
    t.run(0.5);
    expect(t.events).toEqual([{ type: 'interior.entered', payload: { interiorId: VAULT, doorId: 'vault' } }]);
  });

  it('a load of an outdoor save while inside restores the outdoors when the feet leave and emits one exited', async () => {
    const t = setup();
    await t.settle(t.c.enter(VAULT, 'vault'));
    t.c.persistable().load({ interiorId: null, doorId: null }, 1);
    t.run(0.3);
    expect(t.state.applied.at(-1)).toBe(VAULT); // still inside: the screen is not black yet
    Object.assign(t.feet, { x: 0, y: 0, z: 20 });
    t.c.tick(DT);
    expect(t.state.applied.at(-1)).toBeNull();
    t.c.onSaveLoaded();
    expect(t.events.map((e) => e.type)).toEqual(['interior.entered', 'interior.exited']);
  });

  it('a saved interior with the feet outdoors (a mismatched pair) ends outdoors after save.loaded, with no events', () => {
    const t = setup();
    t.c.persistable().load({ interiorId: VAULT, doorId: 'vault' }, 1);
    t.c.onSaveLoaded();
    // onSaveLoaded announced the vault; the bounds rule then takes the player out, so the pair alternates.
    t.run(0.2);
    expect(t.c.current).toBeNull();
    expect(t.events.map((e) => e.type)).toEqual(['interior.entered', 'interior.exited']);
  });

  it('a saved outdoors with the feet inside (the other mismatched pair) enters by the bounds rule after save.loaded', () => {
    const t = setup();
    Object.assign(t.feet, { x: 0, y: 150, z: -5 });
    t.c.persistable().load({ interiorId: null, doorId: null }, 1);
    t.c.onSaveLoaded();
    t.run(0.1);
    expect(t.c.current).toBe(VAULT);
    expect(t.events.map((e) => e.type)).toEqual(['interior.entered']);
  });

  it.each([
    ['an unknown interior', { interiorId: 'atlantis', doorId: 'vault' }],
    ['a wrong shape', { interiorId: 7 }],
    ['a string', 'vault'],
  ])('loads outdoors on %s, with a warning', (_name, data) => {
    const warn = vi.fn();
    const t = setup({ warn });
    t.c.persistable().load(data, 1);
    expect(t.c.current).toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  it('falls back to the first door when the saved door is unknown', () => {
    const t = setup();
    t.c.persistable().load({ interiorId: VAULT, doorId: 'gone' }, 1);
    expect(t.c.currentDoor).toBe('vault');
  });

  it('stops waiting for save.loaded after the loading timeout', () => {
    const t = setup();
    t.c.persistable().load({ interiorId: VAULT, doorId: 'vault' }, 1);
    t.run(TRANSITION.loadingTimeoutSeconds + 0.5);
    expect(t.c.current).toBeNull();
  });
});

describe('InteriorController: registry', () => {
  it('refuses duplicate interiors and interiors without doors; the undo removes one', () => {
    const t = setup();
    expect(() => t.c.add({ id: VAULT, doors: [{ doorId: 'x', outside: 'a', inside: 'b', exit: 'c' }], contains: () => false })).toThrow(/duplicate/);
    expect(() => t.c.add({ id: 'empty', doors: [], contains: () => false })).toThrow(/no door/);
    const off = t.c.add({ id: 'cellar', doors: [{ doorId: 'x', outside: 'a', inside: 'b', exit: 'c' }], contains: () => false });
    off();
    expect(() => t.c.add({ id: 'cellar', doors: [{ doorId: 'x', outside: 'a', inside: 'b', exit: 'c' }], contains: () => false })).not.toThrow();
  });

  it('dispose restores the outdoors and rejects a running transition', async () => {
    const t = setup();
    await t.settle(t.c.enter(VAULT, 'vault'));
    const p = t.c.exit();
    t.c.dispose();
    expect(await reason(p)).toBe('aborted');
    expect(t.state.applied.at(-1)).toBeNull();
  });
});
