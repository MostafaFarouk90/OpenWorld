import { describe, expect, it } from 'vitest';
import { AnchorRegistry } from './AnchorRegistry';

const a = (id: string, extra = {}) => ({ id, position: { x: 1, y: 2, z: 3 }, yaw: 0.5, ...extra });

describe('AnchorRegistry', () => {
  it('defines, gets, finds and lists', () => {
    const r = new AnchorRegistry();
    r.define(a('brightwater.loft-bed'));
    expect(r.get('brightwater.loft-bed').position).toEqual({ x: 1, y: 2, z: 3 });
    expect(r.find('nope.x')).toBeUndefined();
    expect(r.all().map((x) => x.id)).toEqual(['brightwater.loft-bed']);
  });
  it('accepts multi-dot ids', () => {
    expect(() => new AnchorRegistry().define(a('spawn.t05.wraith-1'))).not.toThrow();
  });
  it('get throws with the id when missing', () => {
    expect(() => new AnchorRegistry().get('x.y')).toThrow('Anchor "x.y" not found');
  });
  it('duplicate throws', () => {
    const r = new AnchorRegistry();
    r.define(a('a.b'));
    expect(() => r.define(a('a.b'))).toThrow(/duplicate/);
  });
  it.each(['', 'single', 'A.b', 'a..b', 'a.b.', '.a.b', 'a b.c', 'a.b_c'])('invalid id %j throws', (id) => {
    expect(() => new AnchorRegistry().define(a(id))).toThrow(/invalid anchor id/);
  });
  it('non-finite coordinates throw', () => {
    const r = new AnchorRegistry();
    expect(() => r.define({ id: 'a.b', position: { x: NaN, y: 0, z: 0 }, yaw: 0 })).toThrow(/non-finite/);
    expect(() => r.define({ id: 'a.b', position: { x: 0, y: Infinity, z: 0 }, yaw: 0 })).toThrow(/non-finite/);
    expect(() => r.define({ id: 'a.b', position: { x: 0, y: 0, z: 0 }, yaw: NaN })).toThrow(/non-finite/);
    expect(r.find('a.b')).toBeUndefined();
  });
  it('withTag filters', () => {
    const r = new AnchorRegistry();
    r.define(a('a.one', { tags: ['waystone'] }));
    r.define(a('a.two', { tags: ['npc', 'waystone'] }));
    r.define(a('a.three'));
    expect(r.withTag('waystone').map((x) => x.id)).toEqual(['a.one', 'a.two']);
    expect(r.withTag('none')).toEqual([]);
  });
  it('undefine removes and allows redefining; copies input', () => {
    const r = new AnchorRegistry();
    const src = a('a.b');
    const off = r.define(src);
    src.position.x = 99;
    expect(r.get('a.b').position.x).toBe(1);
    off();
    expect(r.find('a.b')).toBeUndefined();
    expect(() => r.define(a('a.b'))).not.toThrow();
    off();
    expect(r.find('a.b')).toBeDefined();
  });
});
