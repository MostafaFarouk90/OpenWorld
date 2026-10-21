import { describe, expect, it } from 'vitest';
import { ForgeShrineBinding } from './forgeShrine';

function make(opts: { lit?: boolean; waystoneLit?: boolean; canLight?: () => boolean } = {}) {
  const log = { flags: [] as string[], emitted: [] as string[] };
  let lit = opts.lit ?? false;
  const b = new ForgeShrineBinding('hushed-anvil', {
    waystoneLit: () => opts.waystoneLit ?? false,
    isLit: () => lit,
    setFlag: (k) => {
      log.flags.push(k);
      lit = true;
    },
    emitRekindled: (id) => log.emitted.push(id),
    canLight: opts.canLight,
  });
  return { b, log };
}

describe('ForgeShrineBinding', () => {
  it('lights its flag and announces once on its own rekindle', () => {
    const { b, log } = make();
    b.onRekindled('hushed-anvil');
    b.onRekindled('hushed-anvil');
    expect(log.flags).toEqual(['shrine.hushed-anvil.lit']);
    expect(log.emitted).toEqual(['hushed-anvil']);
  });

  it('ignores every other waystone, including the Quenchstone and unknown ids', () => {
    const { b, log } = make();
    for (const id of ['quenchstone', 'weeping-bellows', '', 'nope']) b.onRekindled(id);
    expect(log.flags).toEqual([]);
  });

  it('sync lights silently from a lit waystone and does nothing otherwise', () => {
    const a = make({ waystoneLit: true });
    a.b.sync();
    expect(a.log.flags).toEqual(['shrine.hushed-anvil.lit']);
    expect(a.log.emitted).toEqual([]);
    const c = make();
    c.b.sync();
    expect(c.log.flags).toEqual([]);
  });

  it('canLight vetoes both paths until it passes', () => {
    let ok = false;
    const { b, log } = make({ waystoneLit: true, canLight: () => ok });
    b.onRekindled('hushed-anvil');
    b.sync();
    expect(log.flags).toEqual([]);
    ok = true;
    b.onRekindled('hushed-anvil');
    expect(log.flags).toHaveLength(1);
  });

  it('an already lit shrine is left alone', () => {
    const { b, log } = make({ lit: true, waystoneLit: true });
    b.onRekindled('hushed-anvil');
    b.sync();
    expect(log.flags).toEqual([]);
    expect(log.emitted).toEqual([]);
  });

  it('lightNow lights and announces once, and respects canLight', () => {
    let ok = false;
    const { b, log } = make({ canLight: () => ok });
    b.lightNow();
    expect(log.flags).toEqual([]);
    ok = true;
    b.lightNow();
    b.lightNow();
    expect(log.flags).toHaveLength(1);
    expect(log.emitted).toEqual(['hushed-anvil']);
  });
});
