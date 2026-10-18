import { describe, expect, it } from 'vitest';
import { StubDocument, textOf } from './dom';
import { Toasts } from './Toasts';

describe('Toasts', () => {
  it('shows a message and expires it', () => {
    const t = new Toasts(new StubDocument());
    t.show('hello');
    expect(textOf(t.element)).toBe('hello');
    t.tick(2);
    expect(t.element.children).toHaveLength(1);
    t.tick(1);
    expect(t.element.children).toHaveLength(0);
  });

  it('keeps at most three and ignores empty text and bad dt', () => {
    const t = new Toasts(new StubDocument());
    ['a', 'b', 'c', 'd'].forEach((s) => t.show(s));
    t.show('');
    expect(t.element.children).toHaveLength(3);
    t.tick(Number.NaN);
    t.tick(-1);
    expect(t.element.children).toHaveLength(3);
    expect(textOf(t.element)).toBe('b c d');
  });

  it('dispose clears everything', () => {
    const t = new Toasts(new StubDocument());
    t.show('x');
    t.dispose();
    t.tick(10);
    expect(t.element.children).toHaveLength(0);
  });
});
