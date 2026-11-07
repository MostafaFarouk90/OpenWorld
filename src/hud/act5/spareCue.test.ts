import { describe, expect, it } from 'vitest';
import { SPARE_WINDOW_S, SpareCue } from './spareCue';

describe('SpareCue', () => {
  it('is hidden until Vey\'s window opens, counts down, and closes with the event', () => {
    const c = new SpareCue();
    expect(c.seconds).toBeNull();
    c.window({ bossId: 'vey', open: true });
    expect(c.seconds).toBe(SPARE_WINDOW_S);
    c.tick(2.2);
    expect(c.seconds).toBe(4);
    c.tick(10);
    expect(c.seconds).toBe(0);
    c.window({ bossId: 'vey', open: false });
    expect(c.seconds).toBeNull();
  });
  it('ignores other bosses and junk, and reset clears it', () => {
    const c = new SpareCue();
    c.window({ bossId: 'ulthred', open: true });
    c.window(null);
    c.window({ bossId: 3 as never, open: true });
    expect(c.seconds).toBeNull();
    c.window({ bossId: 'vey', open: true });
    c.reset();
    expect(c.seconds).toBeNull();
  });
});
