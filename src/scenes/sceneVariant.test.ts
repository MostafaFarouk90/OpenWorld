// v0.9 item 8: the `variant` step (one step picked by a test of flags, favour bands, snapshot highs or a named predicate).
import { describe, expect, it, vi } from 'vitest';
import { SceneRunner, type SceneRunnerPorts } from './SceneRunner';
import { sceneTestHolds, type SceneTestReader } from './sceneTest';
import { snapshotFlag, type FavourTrack } from '../state/favour';
import type { SceneDef } from './types';

function world(flags: Record<string, unknown> = {}, live: Partial<Record<FavourTrack, number>> = {}): SceneTestReader & { flags: Map<string, unknown> } {
  const m = new Map(Object.entries(flags));
  return { flags: m, getFlag: (k) => m.get(k), favour: (t) => live[t] ?? 0 };
}

/** A taken snapshot with the given values. */
function snap(id: string, vals: Partial<Record<FavourTrack, number>>): Record<string, unknown> {
  const out: Record<string, unknown> = { [snapshotFlag(id, 'taken')]: true };
  for (const [t, v] of Object.entries(vals)) out[snapshotFlag(id, t as FavourTrack)] = v;
  return out;
}

function rig(reader?: SceneTestReader) {
  const writes: string[] = [];
  const flagsWritten = new Map<string, unknown>();
  const ports: SceneRunnerPorts = {
    setFlag: (k, v) => {
      writes.push(k);
      flagsWritten.set(k, v);
    },
    emit: vi.fn(),
    hold: () => () => {},
    checkpointSave: vi.fn(),
    canStage: () => false,
    shot: vi.fn(() => null),
    anim: vi.fn(),
    move: vi.fn(),
    spawn: vi.fn(),
    warn: vi.fn(),
    reader,
  };
  const r = new SceneRunner(ports);
  const run = (s: number) => {
    for (let t = 0; t < s; t += 1 / 60) r.tick(1 / 60);
  };
  return { r, ports, writes, flagsWritten, run };
}

/** M56's welcome: the marshal speaks if Halvard was hearthbound at the M52 snapshot, the keepers if dragons were highest. */
const WELCOME: SceneDef = {
  id: 'mock-m56-welcome',
  steps: [
    { wait: 0.5 },
    {
      variant: {
        cases: [
          { when: { band: { snapshot: 'm52', track: 'halvard', in: ['hearthbound'] } }, step: { flag: { key: 'story.m56.welcome', value: 'marshal' } } },
          { when: { highest: { snapshot: 'm52', is: 'dragons' } }, step: { flag: { key: 'story.m56.welcome', value: 'keepers' } } },
        ],
        otherwise: { flag: { key: 'story.m56.welcome', value: 'alone' } },
      },
    },
    { flag: { key: 'story.m56.welcomed' } },
  ],
};

describe('sceneTestHolds', () => {
  const none = new Map<string, () => boolean>();
  it('an empty test holds, even without a reader', () => {
    expect(sceneTestHolds({}, undefined, none)).toBe(true);
  });
  it('flags read the flag condition', () => {
    const w = world({ 'story.m31.won': true });
    expect(sceneTestHolds({ flags: { all: ['story.m31.won'] } }, w, none)).toBe(true);
    expect(sceneTestHolds({ flags: { none: ['story.m31.won'] } }, w, none)).toBe(false);
  });
  it('band reads the snapshot, or the live favour without one', () => {
    const w = world(snap('m52', { halvard: 72 }), { halvard: 10 });
    expect(sceneTestHolds({ band: { snapshot: 'm52', track: 'halvard', in: ['hearthbound'] } }, w, none)).toBe(true);
    expect(sceneTestHolds({ band: { track: 'halvard', in: ['hearthbound'] } }, w, none)).toBe(false);
    expect(sceneTestHolds({ band: { track: 'halvard', in: ['cold'] } }, w, none)).toBe(true);
  });
  it('a snapshot not taken yet reads false, for band and highest alike', () => {
    const w = world({ [snapshotFlag('m52', 'halvard')]: 90 });
    expect(sceneTestHolds({ band: { snapshot: 'm52', track: 'halvard', in: ['hearthbound', 'stoked', 'banked', 'cold'] } }, w, none)).toBe(false);
    expect(sceneTestHolds({ highest: { snapshot: 'm52', is: 'halvard' } }, w, none)).toBe(false);
  });
  it('highest names the top track, or tie', () => {
    expect(sceneTestHolds({ highest: { snapshot: 'd09', is: 'dragons' } }, world(snap('d09', { dragons: 60, halvard: 40 })), none)).toBe(true);
    expect(sceneTestHolds({ highest: { snapshot: 'd09', is: 'tie' } }, world(snap('d09', { dragons: 60, halvard: 60 })), none)).toBe(true);
    expect(sceneTestHolds({ highest: { snapshot: 'd09', is: 'dragons' } }, world(snap('d09', { dragons: 60, halvard: 60 })), none)).toBe(false);
  });
  it('a named test runs; unknown or throwing reads false with a warning', () => {
    const warn = vi.fn();
    const tests = new Map<string, () => boolean>([
      ['scars', () => true],
      ['boom', () => {
        throw new Error('x');
      }],
    ]);
    expect(sceneTestHolds({ test: 'scars' }, undefined, tests, warn)).toBe(true);
    expect(sceneTestHolds({ test: 'nope' }, undefined, tests, warn)).toBe(false);
    expect(sceneTestHolds({ test: 'boom' }, undefined, tests, warn)).toBe(false);
    expect(warn).toHaveBeenCalledTimes(2);
  });
  it('a world test without a reader reads false with a warning', () => {
    const warn = vi.fn();
    expect(sceneTestHolds({ flags: { all: ['a'] } }, undefined, none, warn)).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('the variant step', () => {
  it('picks the first case that holds', async () => {
    const t = rig(world(snap('m52', { halvard: 80, dragons: 90 })));
    t.r.register(WELCOME);
    const done = t.r.play(WELCOME.id);
    t.run(2);
    expect(await done).toBe('finished');
    expect(t.flagsWritten.get('story.m56.welcome')).toBe('marshal');
    expect(t.flagsWritten.get('story.m56.welcomed')).toBe(true);
  });
  it('falls to the second case, then to otherwise', async () => {
    const a = rig(world(snap('m52', { halvard: 30, dragons: 90 })));
    a.r.register(WELCOME);
    const da = a.r.play(WELCOME.id);
    a.run(2);
    await da;
    expect(a.flagsWritten.get('story.m56.welcome')).toBe('keepers');
    const b = rig(world({}));
    b.r.register(WELCOME);
    const db = b.r.play(WELCOME.id);
    b.run(2);
    await db;
    expect(b.flagsWritten.get('story.m56.welcome')).toBe('alone');
  });
  it('with no case holding and no otherwise, it is skipped', async () => {
    const t = rig(world({}));
    t.r.register({ id: 'v', steps: [{ variant: { cases: [{ when: { flags: { all: ['x'] } }, step: { flag: { key: 'never' } } }] } }, { flag: { key: 'after' } }] });
    const done = t.r.play('v');
    t.run(1);
    expect(await done).toBe('finished');
    expect(t.writes).toEqual(['after']);
  });
  it('a named test registered by an owner decides; its undo removes it; a duplicate throws', async () => {
    const t = rig(world({}));
    let scars = 3;
    const undo = t.r.registerTest('scars.many', () => scars >= 3);
    expect(() => t.r.registerTest('scars.many', () => true)).toThrow();
    const def: SceneDef = {
      id: 'scar',
      steps: [{ variant: { cases: [{ when: { test: 'scars.many' }, step: { flag: { key: 'scar', value: 'many' } } }], otherwise: { flag: { key: 'scar', value: 'few' } } } }],
    };
    t.r.register(def);
    let done = t.r.play('scar');
    t.run(0.5);
    await done;
    expect(t.flagsWritten.get('scar')).toBe('many');
    scars = 1;
    done = t.r.play('scar');
    t.run(0.5);
    await done;
    expect(t.flagsWritten.get('scar')).toBe('few');
    undo();
    scars = 5;
    done = t.r.play('scar');
    t.run(0.5);
    await done;
    expect(t.flagsWritten.get('scar')).toBe('few');
  });
  it('register refuses a nested variant and a checkpoint inside a variant', () => {
    const t = rig(world({}));
    expect(() =>
      t.r.register({ id: 'n', steps: [{ variant: { cases: [{ when: {}, step: { variant: { cases: [] } } }] } }] }),
    ).toThrow(/nests/);
    expect(() => t.r.register({ id: 'c', steps: [{ variant: { cases: [], otherwise: { checkpoint: 'x' } } }] })).toThrow(/checkpoint/);
  });
  it('a skip writes the flag of the case it would pick now', async () => {
    const t = rig(world(snap('m52', { dragons: 90 })));
    t.r.register(WELCOME);
    const done = t.r.play(WELCOME.id);
    t.run(0.1);
    expect(t.r.skip()).toBe(true);
    expect(await done).toBe('skipped');
    expect(t.flagsWritten.get('story.m56.welcome')).toBe('keepers');
    expect(t.writes.sort()).toEqual(['story.m56.welcome', 'story.m56.welcomed']);
  });
  it('replaying with the same world picks the same case (the snapshot, not live favour, decides)', async () => {
    const w = world(snap('m52', { halvard: 75 }), { halvard: 0 });
    const picks: unknown[] = [];
    for (let i = 0; i < 3; i++) {
      const t = rig(w);
      t.r.register(WELCOME);
      const done = t.r.play(WELCOME.id);
      t.run(2);
      await done;
      picks.push(t.flagsWritten.get('story.m56.welcome'));
    }
    expect(picks).toEqual(['marshal', 'marshal', 'marshal']);
  });
});
