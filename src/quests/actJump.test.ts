import { describe, expect, it, vi } from 'vitest';
import { ACT2_PREREQS, clampJumpDestination, getActJump, parseActJump, registerActJump, resolveActJump } from './actJump';
import { ACT1_PREREQS, type Act1JumpPorts } from './act1Jump';

describe('parseActJump', () => {
  it('parses act1 and act2 with and without &new', () => {
    expect(parseActJump('?act1=m03&new')).toEqual({ act: 1, id: 'm03', fresh: true });
    expect(parseActJump('?act2=m11&new')).toEqual({ act: 2, id: 'm11', fresh: true });
    expect(parseActJump('?act2=m11')).toEqual({ act: 2, id: 'm11', fresh: false });
    expect(parseActJump('?new&act12=x')).toEqual({ act: 12, id: 'x', fresh: true });
  });
  it('rejects junk, a missing id, act0, and non-numeric acts', () => {
    for (const s of ['', '?', '?junk=1&new', '?act1=&new', '?act1&new', '?act0=m01&new', '?act=m01&new', '?actx=m01&new', '?act1x=m01&new', '?act-1=m01', '?act01=m01']) {
      expect(parseActJump(s), s).toBeNull();
    }
  });
  it('skips an empty-id act parameter for a later valid one', () => {
    expect(parseActJump('?act1=&act2=m11&new')).toEqual({ act: 2, id: 'm11', fresh: true });
  });
});

describe('registry', () => {
  it('registers act 1 and act 2 at load', () => {
    expect(getActJump(1)?.prereqs).toBe(ACT1_PREREQS);
    expect(getActJump(2)?.prereqs).toBe(ACT2_PREREQS);
    expect(ACT2_PREREQS).toEqual({});
  });
  it('throws on a duplicate act and the undo frees it', () => {
    expect(() => registerActJump(1, { prereqs: {} })).toThrow(/already registered/);
    const undo = registerActJump(7, { prereqs: { a: [] } });
    expect(() => registerActJump(7, { prereqs: {} })).toThrow();
    expect(getActJump(7)).toBeDefined();
    undo();
    expect(getActJump(7)).toBeUndefined();
    const undo2 = registerActJump(7, { prereqs: {} });
    undo();
    expect(getActJump(7)).toBeDefined();
    undo2();
  });
  it('rejects an invalid act number', () => {
    expect(() => registerActJump(0, { prereqs: {} })).toThrow();
    expect(() => registerActJump(1.5, { prereqs: {} })).toThrow();
  });
});

describe('resolveActJump', () => {
  it('resolves an act 1 jump with its prerequisites', () => {
    const warn = vi.fn();
    expect(resolveActJump('?act1=m04&new', warn)).toEqual({ act: 1, id: 'm04', fresh: true, prereqs: ACT1_PREREQS.m04 });
    expect(warn).not.toHaveBeenCalled();
  });
  it('refuses ?act2=m11 with an empty table: one warning, no result', () => {
    const warn = vi.fn();
    expect(resolveActJump('?act2=m11&new', warn)).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });
  it('resolves an act 2 id once the table has it, and refuses an unregistered act', () => {
    ACT2_PREREQS.m11 = ['m10'];
    try {
      expect(resolveActJump('?act2=m11&new', vi.fn())?.prereqs).toEqual(['m10']);
    } finally {
      delete ACT2_PREREQS.m11;
    }
    const warn = vi.fn();
    expect(resolveActJump('?act9=x&new', warn)).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });
  it('refuses a toString-style id and a missing &new', () => {
    const warn = vi.fn();
    expect(resolveActJump('?act2=toString&new', warn)).toBeNull();
    ACT2_PREREQS.m11 = [];
    try {
      expect(resolveActJump('?act2=m11', warn)).toBeNull();
    } finally {
      delete ACT2_PREREQS.m11;
    }
    expect(warn).toHaveBeenCalledTimes(2);
  });
  it('returns null for a URL with no act parameter, silently', () => {
    const warn = vi.fn();
    expect(resolveActJump('?other=1', warn)).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('clamp port', () => {
  const at = { x: 1, y: 2, z: 3 };
  it('passes the destination through clamp when given', () => {
    const ports: Pick<Act1JumpPorts, 'clamp'> = { clamp: (p) => ({ x: p.x + 10, y: p.y, z: p.z }) };
    expect(clampJumpDestination(ports, at)).toEqual({ x: 11, y: 2, z: 3 });
  });
  it('leaves the destination unchanged without clamp', () => {
    expect(clampJumpDestination({}, at)).toBe(at);
  });
});
