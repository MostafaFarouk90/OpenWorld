// v0.8 item 9: the scene sequencer, headless: steps, flags at checkpoints, skip, cancel, a queue, and a load at every step.
import { describe, expect, it, vi } from 'vitest';
import { SceneRunner, type SceneRunnerPorts } from './SceneRunner';
import type { SceneDef } from './types';

function rig(staged = false) {
  const flags = new Map<string, unknown>();
  const writes: string[] = [];
  const events: { e: string; p: Record<string, unknown> }[] = [];
  const holds = { taken: 0, released: 0 };
  const ports: SceneRunnerPorts = {
    setFlag: (k, v) => {
      writes.push(k);
      flags.set(k, v);
    },
    emit: (e, p) => events.push({ e, p }),
    hold: () => {
      holds.taken++;
      return () => holds.released++;
    },
    checkpointSave: vi.fn(),
    canStage: () => staged,
    shot: vi.fn(() => ({ release: vi.fn() })),
    anim: vi.fn(),
    move: vi.fn(),
    spawn: vi.fn(),
    warn: vi.fn(),
  };
  const r = new SceneRunner(ports);
  const run = (seconds: number) => {
    for (let t = 0; t < seconds; t += 1 / 60) r.tick(1 / 60);
  };
  return { r, ports, flags, writes, events, holds, run };
}

/** A mock M39: Gaut's last stand, with his retirement flag after the second checkpoint. */
const M39: SceneDef = {
  id: 'mock-m39',
  steps: [
    { line: { speakerId: 'gaut', textKey: 'l1', seconds: 1 } },
    { flag: { key: 'story.m39.stairs' } },
    { checkpoint: 'stairs' },
    { move: { who: 'player', to: 'keep.top' } },
    { shot: { position: { x: 0, y: 1, z: 0 }, lookAt: { x: 0, y: 0, z: 1 }, seconds: 1 } },
    { spawn: 'm39.guard' },
    { flag: { key: 'story.m39.fought' } },
    { checkpoint: 'top' },
    { line: { speakerId: 'gaut', textKey: 'l2', seconds: 2 } },
    { flag: { key: 'story.m39.gautFalls' } },
    { flag: { key: 'story.m39.complete' } },
  ],
};
/** A mock ending: no checkpoint, flags only at the end. */
const ENDING: SceneDef = {
  id: 'mock-ending',
  steps: [{ wait: 1 }, { flag: { key: 'story.a4.ending.seen' } }, { anim: { who: 'player', clip: 'kneel' } }, { line: { speakerId: 'wulfhild', textKey: 'e1' } }, { flag: { key: 'story.gate.a5' } }],
};

describe('SceneRunner', () => {
  it('runs headless to the end: flags at checkpoints and the end, holds released, no shot or anim', async () => {
    const t = rig(false);
    t.r.register(M39);
    const done = t.r.play('mock-m39');
    expect(t.r.active).toBe('mock-m39');
    expect(t.holds.taken).toBe(1);
    t.run(0.5);
    expect(t.writes).toEqual([]);
    t.run(1);
    expect(t.writes).toEqual(['story.m39.stairs']);
    expect(t.r.serialize()).toEqual({ id: 'mock-m39', checkpoint: 'stairs' });
    t.run(5);
    expect(await done).toBe('finished');
    expect(t.writes).toEqual(['story.m39.stairs', 'story.m39.fought', 'story.m39.gautFalls', 'story.m39.complete']);
    expect(t.ports.shot).not.toHaveBeenCalled();
    expect(t.ports.spawn).toHaveBeenCalledWith('m39.guard');
    expect(t.ports.checkpointSave).toHaveBeenCalledTimes(2);
    expect(t.holds.released).toBe(1);
    expect(t.r.serialize()).toBeNull();
    expect(t.events.map((e) => e.e)).toEqual(['scene.started', 'scene.line', 'scene.checkpoint', 'scene.checkpoint', 'scene.line', 'scene.ended']);
  });

  it('staged: the shot is taken and released, the anim plays', () => {
    const t = rig(true);
    t.r.register(M39);
    t.r.register(ENDING);
    void t.r.play('mock-m39');
    t.run(10);
    expect(t.ports.shot).toHaveBeenCalledTimes(1);
    const handle = (t.ports.shot as any).mock.results[0].value;
    expect(handle.release).toHaveBeenCalled();
    void t.r.play('mock-ending');
    t.run(10);
    expect(t.ports.anim).toHaveBeenCalledWith('player', 'kneel');
  });

  it('a skip writes every flag the scene would have written, once', async () => {
    const t = rig();
    t.r.register(M39);
    const done = t.r.play('mock-m39');
    t.run(1.2);
    expect(t.r.skip()).toBe(true);
    expect(await done).toBe('skipped');
    expect(t.writes.sort()).toEqual(['story.m39.complete', 'story.m39.fought', 'story.m39.gautFalls', 'story.m39.stairs']);
    expect(t.r.skip()).toBe(false);
  });

  it('an unskippable scene refuses skip', () => {
    const t = rig();
    t.r.register({ ...ENDING, id: 'x', skippable: false });
    void t.r.play('x');
    expect(t.r.skip()).toBe(false);
  });

  it('a cancel (death) keeps only the flags up to the last checkpoint', async () => {
    const t = rig();
    t.r.register(M39);
    const done = t.r.play('mock-m39');
    // Past the first checkpoint, inside the fight (the shot's second).
    t.run(1.5);
    t.r.cancel();
    expect(await done).toBe('cancelled');
    expect(t.writes).toEqual(['story.m39.stairs']);
    expect(t.r.serialize()).toBeNull();
    expect(t.holds.released).toBe(1);
  });

  it('a second scene waits for the first', async () => {
    const t = rig();
    t.r.register(M39);
    t.r.register(ENDING);
    const a = t.r.play('mock-m39');
    const b = t.r.play('mock-ending');
    expect(t.r.active).toBe('mock-m39');
    t.run(6);
    expect(await a).toBe('finished');
    expect(t.r.active).toBe('mock-ending');
    t.run(6);
    expect(await b).toBe('finished');
    expect(t.holds).toEqual({ taken: 2, released: 2 });
  });

  it('rejects a duplicate id and a repeated checkpoint name; an unknown scene resolves cancelled', async () => {
    const t = rig();
    t.r.register(M39);
    expect(() => t.r.register(M39)).toThrow();
    expect(() => t.r.register({ id: 'y', steps: [{ checkpoint: 'a' }, { checkpoint: 'a' }] })).toThrow();
    expect(await t.r.play('nope')).toBe('cancelled');
  });

  /**
   * A save can only exist at a checkpoint (autosave is held between them, and the entry is written only there): build the
   * save the real held state would make at every step index, load it into a fresh runner, replay to the end, and check
   * every flag is written exactly once overall and Gaut's fall never comes before its step.
   */
  for (const def of [M39, ENDING]) {
    it(`a load at every step of ${def.id} never writes a flag twice`, async () => {
      const all = def.steps.filter((s): s is { flag: { key: string } } => 'flag' in s).map((s) => s.flag.key);
      for (let stop = 0; stop <= def.steps.length; stop++) {
        const a = rig();
        a.r.register(def);
        void a.r.play(def.id);
        // Advance until `stop` steps have run.
        let guard = 0;
        while (a.r.active && (a.r as any).run.at < stop && guard++ < 2000) a.r.tick(1 / 60);
        const saved = JSON.parse(JSON.stringify(a.r.serialize()));
        const before = [...a.writes];
        // A save holds only what was written at the last checkpoint: the flags in the buffer are not in it.
        const b = rig();
        b.r.register(def);
        b.r.load(saved);
        const done = b.r.resume();
        if (!saved) {
          expect(done).toBeNull();
          continue;
        }
        b.run(30);
        expect(await done).toBe('finished');
        const total = [...before, ...b.writes];
        for (const k of all) expect(total.filter((x) => x === k), `${def.id} stop ${stop} ${k}`).toHaveLength(1);
        if (def === M39) expect(total.indexOf('story.m39.gautFalls')).toBeGreaterThan(total.indexOf('story.m39.fought'));
      }
    });
  }

  it('a save naming an unknown scene or checkpoint is dropped or replayed from the start, with a warning', () => {
    const t = rig();
    t.r.register(M39);
    t.r.load({ id: 'gone', checkpoint: null });
    expect(t.r.resume()).toBeNull();
    t.r.load({ id: 'mock-m39', checkpoint: 'nowhere' });
    void t.r.resume();
    expect(t.r.active).toBe('mock-m39');
    expect(t.ports.warn).toHaveBeenCalledTimes(2);
  });
});
