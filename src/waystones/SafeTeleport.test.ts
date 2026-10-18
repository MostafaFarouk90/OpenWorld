import { describe, expect, it, vi } from 'vitest';
import { SafeTeleport, type TeleportPorts } from './SafeTeleport';

function setup(over: Partial<TeleportPorts> = {}) {
  const log: string[] = [];
  const state = { ready: true, grounded: true, resident: true };
  const ports: TeleportPorts = {
    place: vi.fn((f) => log.push(`place:${f.x},${f.y.toFixed(2)},${f.z}`)),
    freeze: vi.fn(() => {
      log.push('freeze');
      return () => log.push('release');
    }),
    ready: () => state.ready,
    groundedBelow: () => state.grounded,
    chunksResident: () => state.resident,
    fade: vi.fn((o) => log.push(`fade:${o}`)),
    heightAt: () => 10,
    ...over,
  };
  return { tp: new SafeTeleport(ports), ports, state, log };
}

const run = (tp: SafeTeleport, seconds: number, dt = 1 / 60) => {
  for (let t = 0; t < seconds; t += dt) tp.update(dt);
};

describe('SafeTeleport', () => {
  it('fades, places, freezes, waits for ground, releases and resolves ok', async () => {
    const { tp, log } = setup();
    const p = tp.start({ x: 5, y: 10, z: 5 }, 1);
    expect(tp.active).toBe(true);
    run(tp, 1);
    await expect(p).resolves.toEqual({ ok: true });
    expect(tp.active).toBe(false);
    expect(log.indexOf('fade:1')).toBeLessThan(log.findIndex((l) => l.startsWith('place')));
    expect(log.indexOf('freeze')).toBeLessThan(log.findIndex((l) => l.startsWith('place'))); // frozen from the fade
    expect(log.indexOf('release')).toBeGreaterThan(log.findIndex((l) => l.startsWith('place')));
    expect(log[log.length - 1]).toBe('fade:0');
  });

  it('stays frozen until the ground condition holds, not a fixed tick count', async () => {
    const { tp, state, log } = setup();
    state.ready = false;
    const p = tp.start({ x: 0, y: 10, z: 0 }, 0);
    run(tp, 1.5);
    expect(tp.active).toBe(true);
    expect(log).not.toContain('release');
    state.ready = true;
    run(tp, 1);
    await expect(p).resolves.toEqual({ ok: true });
  });

  it('needs at least one tick after placement before trusting the ground ray', async () => {
    const { tp, ports } = setup();
    const p = tp.start({ x: 0, y: 10, z: 0 }, 0);
    // Reach the exact tick of placement.
    tp.update(0.31);
    expect(ports.place).toHaveBeenCalledTimes(1);
    expect(tp.active).toBe(true);
    tp.update(1 / 60);
    tp.update(1 / 60);
    tp.update(10); // chunk reveal check passes immediately
    await expect(p).resolves.toEqual({ ok: true });
  });

  it('retries once at heightAt + 0.05 after the timeout', async () => {
    const { tp, state, ports } = setup();
    state.grounded = false;
    const p = tp.start({ x: 3, y: 12, z: 4 }, 0);
    run(tp, 2.5);
    expect((ports.place as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
    const second = (ports.place as ReturnType<typeof vi.fn>).mock.calls[1][0];
    expect(second.y).toBeCloseTo(12.05, 5);
    state.grounded = true;
    run(tp, 1);
    await expect(p).resolves.toEqual({ ok: true });
  });

  it('falls back to the origin stone and reports terrain-not-ready', async () => {
    const { tp, state, ports } = setup();
    const placed: string[] = [];
    (ports.place as ReturnType<typeof vi.fn>).mockImplementation((f: { x: number }) => {
      placed.push(String(f.x));
      state.grounded = f.x === 99;
    });
    const p = tp.start({ x: 1, y: 10, z: 0 }, 0, { feet: { x: 99, y: 10, z: 0 }, yaw: 0 });
    run(tp, 8);
    await expect(p).resolves.toEqual({ ok: false, reason: 'terrain-not-ready' });
    expect(placed).toContain('99');
    expect(tp.active).toBe(false);
  });

  it('with no fallback stays frozen, resolves failed, and releases when terrain arrives', async () => {
    const { tp, state, log } = setup();
    state.grounded = false;
    const p = tp.start({ x: 1, y: 10, z: 0 }, 0);
    run(tp, 6);
    await expect(p).resolves.toEqual({ ok: false, reason: 'terrain-not-ready' });
    expect(tp.active).toBe(true);
    const freezes = () => log.filter((l) => l === 'freeze').length;
    const releases = () => log.filter((l) => l === 'release').length;
    expect(releases()).toBe(freezes() - 1); // the last freeze is still held
    state.grounded = true;
    run(tp, 0.1);
    expect(tp.active).toBe(false);
    expect(releases()).toBe(freezes());
  });

  it('keeps the fade black until chunks are resident, capped at 3 s', async () => {
    const { tp, state, ports } = setup();
    state.resident = false;
    const p = tp.start({ x: 0, y: 10, z: 0 }, 0);
    run(tp, 1);
    expect(tp.active).toBe(true);
    expect((ports.fade as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0]).toBe(1);
    run(tp, 3.5);
    await expect(p).resolves.toEqual({ ok: true });
    expect((ports.fade as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0]).toBe(0);
  });

  it('rejects a second start while active', async () => {
    const { tp } = setup();
    const a = tp.start({ x: 0, y: 10, z: 0 }, 0);
    await expect(tp.start({ x: 1, y: 10, z: 0 }, 0)).resolves.toEqual({ ok: false, reason: 'busy' });
    run(tp, 2);
    await a;
  });

  it('lifts a destination below the terrain onto it', () => {
    const { tp, ports } = setup();
    tp.start({ x: 0, y: -5, z: 0 }, 0);
    run(tp, 0.5);
    const y = (ports.place as ReturnType<typeof vi.fn>).mock.calls[0][0].y;
    expect(y).toBeGreaterThanOrEqual(10);
  });

  it('ignores NaN or negative dt and idle updates', () => {
    const { tp } = setup();
    tp.update(1);
    tp.start({ x: 0, y: 10, z: 0 }, 0);
    tp.update(NaN);
    tp.update(-1);
    expect(tp.active).toBe(true);
  });

  it('exposes the destination while travelling', () => {
    const { tp } = setup();
    expect(tp.destination).toBeNull();
    tp.start({ x: 7, y: 10, z: 8 }, 0);
    expect(tp.destination).toMatchObject({ x: 7, z: 8 });
  });
});

describe('SafeTeleport takeover and fade freeze', () => {
  it('freezes the player from the start of the fade', () => {
    const { tp, log } = setup();
    void tp.start({ x: 0, y: 10, z: 0 }, 0);
    expect(log.slice(0, 2)).toEqual(['fade:1', 'freeze']);
  });

  it('a takeover cancels the job in flight: the old caller hears busy, the new one completes', async () => {
    const { tp, ports } = setup();
    const first = tp.start({ x: 1, y: 10, z: 0 }, 0);
    run(tp, 0.2);
    const second = tp.start({ x: 2, y: 10, z: 0 }, 0, null, { takeover: true });
    await expect(first).resolves.toEqual({ ok: false, reason: 'busy' });
    run(tp, 2);
    await expect(second).resolves.toEqual({ ok: true });
    const placed = (ports.place as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0].x);
    expect(placed).toEqual([2]);
  });

  it('without takeover a second start is busy and the first still completes', async () => {
    const { tp } = setup();
    const first = tp.start({ x: 1, y: 10, z: 0 }, 0);
    await expect(tp.start({ x: 2, y: 10, z: 0 }, 0)).resolves.toEqual({ ok: false, reason: 'busy' });
    run(tp, 2);
    await expect(first).resolves.toEqual({ ok: true });
  });
});
