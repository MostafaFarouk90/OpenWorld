import { describe, expect, it, vi } from 'vitest';
import type { ClassId } from '../actors/classes';
import type { PlayerAvatar } from '../characters/PlayerAvatar';
import { KitSwapper } from './KitSwapper';

const avatar = (classId: ClassId) => ({ classId, dispose: vi.fn() }) as unknown as PlayerAvatar & { classId: ClassId; dispose: ReturnType<typeof vi.fn> };

function make() {
  const s = { worn: 'knight' as ClassId | null, attached: true, idle: true, swapOk: true };
  const pending = new Map<ClassId, { resolve(a: PlayerAvatar): void; reject(e: unknown): void }>();
  const swap = vi.fn((_a: PlayerAvatar) => {
    if (s.swapOk) s.worn = (_a as unknown as { classId: ClassId }).classId;
    return s.swapOk;
  });
  const warn = vi.fn();
  const failed = vi.fn();
  const build = vi.fn(
    (c: ClassId) =>
      new Promise<PlayerAvatar>((resolve, reject) => {
        pending.set(c, { resolve, reject });
      }),
  );
  const k = new KitSwapper({ wornClass: () => s.worn, attached: () => s.attached, idle: () => s.idle, build, swap, warn, failed });
  const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
  return { k, s, pending, swap, warn, failed, build, flush };
}

describe('KitSwapper', () => {
  it('does not swap before the first avatar is attached', async () => {
    const t = make();
    t.s.attached = false;
    t.s.worn = null;
    t.k.request('warden');
    t.pending.get('warden')!.resolve(avatar('warden'));
    await t.flush();
    t.k.tick();
    expect(t.swap).not.toHaveBeenCalled();
    t.s.attached = true;
    t.k.tick();
    expect(t.swap).toHaveBeenCalledTimes(1);
    expect(t.k.pending).toBeNull();
  });

  it('waits for an idle moment', async () => {
    const t = make();
    t.k.request('warden');
    const a = avatar('warden');
    t.pending.get('warden')!.resolve(a);
    await t.flush();
    t.s.idle = false;
    t.k.tick();
    t.k.tick();
    expect(t.swap).not.toHaveBeenCalled();
    expect(t.k.pending).toBe('warden');
    t.s.idle = true;
    t.k.tick();
    expect(t.swap).toHaveBeenCalledWith(a);
    expect(a.dispose).not.toHaveBeenCalled();
  });

  it('a stale load is disposed when it lands and the newer one is swapped', async () => {
    const t = make();
    t.k.request('warden');
    t.k.request('ashblade');
    const a = avatar('warden');
    const b = avatar('ashblade');
    t.pending.get('ashblade')!.resolve(b);
    t.pending.get('warden')!.resolve(a);
    await t.flush();
    expect(a.dispose).toHaveBeenCalledTimes(1);
    t.k.tick();
    expect(t.swap).toHaveBeenCalledTimes(1);
    expect(t.swap).toHaveBeenCalledWith(b);
    expect(t.s.worn).toBe('ashblade');
  });

  it('a stale load that lands first is disposed too', async () => {
    const t = make();
    t.k.request('warden');
    t.k.request('ashblade');
    const a = avatar('warden');
    t.pending.get('warden')!.resolve(a);
    await t.flush();
    expect(a.dispose).toHaveBeenCalledTimes(1);
    t.pending.get('ashblade')!.resolve(avatar('ashblade'));
    await t.flush();
    t.k.tick();
    expect(t.swap).toHaveBeenCalledTimes(1);
  });

  it('a load failure warns, calls failed and keeps the current look', async () => {
    const t = make();
    t.k.request('warden');
    t.pending.get('warden')!.reject(new Error('boom'));
    await t.flush();
    expect(t.warn).toHaveBeenCalledTimes(1);
    expect(t.warn.mock.calls[0][0]).toContain('boom');
    expect(t.failed).toHaveBeenCalledWith('warden');
    expect(t.k.pending).toBeNull();
    t.k.tick();
    expect(t.swap).not.toHaveBeenCalled();
    expect(t.s.worn).toBe('knight');
  });

  it('a stale failure is ignored', async () => {
    const t = make();
    t.k.request('warden');
    t.k.request('ashblade');
    t.pending.get('warden')!.reject(new Error('late'));
    await t.flush();
    expect(t.failed).not.toHaveBeenCalled();
    expect(t.k.pending).toBe('ashblade');
  });

  it('requesting the worn class does nothing', () => {
    const t = make();
    t.k.request('knight');
    expect(t.build).not.toHaveBeenCalled();
    expect(t.k.pending).toBeNull();
  });

  it('requesting the class already pending does not rebuild', () => {
    const t = make();
    t.k.request('warden');
    t.k.request('warden');
    expect(t.build).toHaveBeenCalledTimes(1);
  });

  it('a swap that returns false is retried next tick', async () => {
    const t = make();
    t.k.request('warden');
    t.pending.get('warden')!.resolve(avatar('warden'));
    await t.flush();
    t.s.swapOk = false;
    t.k.tick();
    expect(t.k.pending).toBe('warden');
    t.s.swapOk = true;
    t.k.tick();
    expect(t.swap).toHaveBeenCalledTimes(2);
    expect(t.k.pending).toBeNull();
  });

  it('drops the target when the worn class turns out to match, and dispose releases the ready avatar', async () => {
    const t = make();
    t.k.request('warden');
    const a = avatar('warden');
    t.pending.get('warden')!.resolve(a);
    await t.flush();
    t.s.worn = 'warden';
    t.k.tick();
    expect(t.swap).not.toHaveBeenCalled();
    expect(a.dispose).toHaveBeenCalledTimes(1);
    expect(t.k.pending).toBeNull();

    const u = make();
    u.k.request('warden');
    const b = avatar('warden');
    u.pending.get('warden')!.resolve(b);
    await u.flush();
    u.k.dispose();
    expect(b.dispose).toHaveBeenCalledTimes(1);
  });
});
