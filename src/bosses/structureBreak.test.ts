// v0.8 item 11: the structure-break hook, alone and through BossRegistry's acceptBreak.
import { describe, expect, it, vi } from 'vitest';
import { StructureBreaks } from './structureBreak';

describe('StructureBreaks', () => {
  it('a strike arms one break, which acceptBreak consumes once', () => {
    const emit = vi.fn();
    const b = new StructureBreaks(emit);
    b.register({ id: 'bellows.left', bossId: 'bellows-engine' });
    expect(b.acceptBreak('bellows-engine')).toBe(false);
    expect(b.strike('bellows.left')).toBe('armed');
    expect(emit).toHaveBeenCalledWith('structure.struck', { id: 'bellows.left', bossId: 'bellows-engine' });
    expect(b.acceptBreak('eormen')).toBe(false);
    expect(b.acceptBreak('bellows-engine')).toBe(true);
    expect(b.acceptBreak('bellows-engine')).toBe(false);
  });
  it('a windowed part takes a strike only within its seconds after the named telegraph', () => {
    const b = new StructureBreaks();
    b.register({ id: 'vent', bossId: 'bellows-engine', strikeWindow: { afterTelegraph: 'bellows.inhale', seconds: 2 } });
    expect(b.strike('vent')).toBe('closed');
    b.telegraph('bellows-engine', 'bellows.slam');
    expect(b.strike('vent')).toBe('closed');
    b.telegraph('bellows-engine', 'bellows.inhale');
    b.tick(1.5);
    expect(b.strike('vent')).toBe('armed');
    expect(b.strike('vent')).toBe('closed');
    b.telegraph('bellows-engine', 'bellows.inhale');
    b.tick(2.1);
    expect(b.strike('vent')).toBe('closed');
  });
  it('rejects a duplicate part and a bad window; an unknown strike reads unknown; the undo removes', () => {
    const b = new StructureBreaks();
    const off = b.register({ id: 'p', bossId: 'x' });
    expect(() => b.register({ id: 'p', bossId: 'x' })).toThrow();
    expect(() => b.register({ id: 'q', bossId: 'x', strikeWindow: { afterTelegraph: 't', seconds: 0 } })).toThrow();
    expect(b.strike('nope')).toBe('unknown');
    off();
    expect(b.strike('p')).toBe('unknown');
  });
});
