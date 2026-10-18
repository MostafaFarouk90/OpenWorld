import { describe, expect, it } from 'vitest';
import { DeathTimeline, resolveRespawnPoint } from './Respawn';
import { RESPAWN } from './tuning';

describe('DeathTimeline', () => {
  it('is idle until a death', () => {
    const t = new DeathTimeline();
    expect(t.tick()).toBe('idle');
    expect(t.pending).toBe(false);
  });
  it('emits respawn exactly on tick delayTicks, once', () => {
    const t = new DeathTimeline();
    t.onDied();
    expect(t.pending).toBe(true);
    for (let i = 1; i < RESPAWN.delayTicks; i++) expect(t.tick()).toBe('dead');
    expect(t.tick()).toBe('respawn');
    expect(RESPAWN.delayTicks).toBe(150);
    expect(t.tick()).toBe('idle');
    expect(t.pending).toBe(false);
  });
  it('ignores a second death while pending', () => {
    const t = new DeathTimeline();
    t.onDied();
    for (let i = 0; i < 100; i++) t.tick();
    t.onDied();
    let n = 100;
    while (t.tick() !== 'respawn') n++;
    expect(n + 1).toBe(RESPAWN.delayTicks);
  });
  it('can die again after respawning', () => {
    const t = new DeathTimeline();
    t.onDied();
    for (let i = 0; i < RESPAWN.delayTicks; i++) t.tick();
    t.onDied();
    expect(t.pending).toBe(true);
  });
  it('cancel stops the countdown', () => {
    const t = new DeathTimeline();
    t.onDied();
    t.tick();
    t.cancel();
    expect(t.pending).toBe(false);
    expect(t.tick()).toBe('idle');
  });
  it('resumes with the remaining ticks', () => {
    const t = new DeathTimeline();
    t.resume(3);
    expect(t.remainingTicks).toBe(3);
    expect([t.tick(), t.tick(), t.tick(), t.tick()]).toEqual(['dead', 'dead', 'respawn', 'idle']);
  });
  it('resume(0) respawns on the next tick and bad input is ignored', () => {
    const t = new DeathTimeline();
    t.resume(NaN);
    expect(t.pending).toBe(false);
    t.resume(0);
    expect(t.tick()).toBe('respawn');
  });
});

describe('resolveRespawnPoint', () => {
  const world = { x: 1, y: 2, z: 3 };
  const anchors: Record<string, { position: { x: number; y: number; z: number }; yaw: number }> = {
    'waystone.w1': { position: { x: 10, y: 0, z: 10 }, yaw: 1 },
    'brightwater.player-spawn': { position: { x: 5, y: 0, z: 5 }, yaw: 2 },
  };
  const find = (n: string) => anchors[n];

  it('prefers the rested waystone', () => {
    const r = resolveRespawnPoint({ lastRestedWaystoneId: 'w1', findAnchor: find, worldSpawn: world });
    expect(r).toEqual({ position: { x: 10, y: 0, z: 10 }, yaw: 1, source: 'waystone' });
  });
  it('falls back to player-spawn with no waystone rested', () => {
    const r = resolveRespawnPoint({ lastRestedWaystoneId: null, findAnchor: find, worldSpawn: world });
    expect(r.source).toBe('player-spawn');
    expect(r.yaw).toBe(2);
  });
  it('falls back when the waystone anchor is missing', () => {
    const r = resolveRespawnPoint({ lastRestedWaystoneId: 'gone', findAnchor: find, worldSpawn: world });
    expect(r.source).toBe('player-spawn');
  });
  it('falls back to the world spawn with yaw 0', () => {
    const r = resolveRespawnPoint({ lastRestedWaystoneId: 'w1', findAnchor: () => undefined, worldSpawn: world });
    expect(r).toEqual({ position: world, yaw: 0, source: 'world' });
  });
  it('treats a throwing lookup as missing', () => {
    const r = resolveRespawnPoint({
      lastRestedWaystoneId: 'w1',
      findAnchor: (n) => {
        if (n.startsWith('waystone.')) throw new Error('x');
        return find(n);
      },
      worldSpawn: world,
    });
    expect(r.source).toBe('player-spawn');
    const all = resolveRespawnPoint({
      lastRestedWaystoneId: 'w1',
      findAnchor: () => {
        throw new Error('x');
      },
      worldSpawn: world,
    });
    expect(all.source).toBe('world');
  });
  it('returns copies of positions', () => {
    const r = resolveRespawnPoint({ lastRestedWaystoneId: null, findAnchor: () => undefined, worldSpawn: world });
    expect(r.position).not.toBe(world);
  });
});
