import { describe, expect, it, vi } from 'vitest';
import { InputContexts } from './InputContexts';

describe('InputContexts', () => {
  it('is gameplay when empty', () => {
    expect(new InputContexts().top()).toBe('gameplay');
  });

  it('pushes and pops in order', () => {
    const c = new InputContexts();
    const popMenu = c.push('menu', 'a');
    const popDlg = c.push('dialogue', 'b');
    expect(c.top()).toBe('dialogue');
    popDlg();
    expect(c.top()).toBe('menu');
    popMenu();
    expect(c.top()).toBe('gameplay');
  });

  it('popping out of order removes only that entry', () => {
    const c = new InputContexts();
    const popMenu = c.push('menu', 'a');
    c.push('dialogue', 'b');
    popMenu();
    expect(c.top()).toBe('dialogue');
    expect(c.owners()).toEqual(['b']);
  });

  it('pop twice is safe and does not remove another entry', () => {
    const c = new InputContexts();
    const pop = c.push('menu', 'a');
    c.push('menu', 'b');
    pop();
    pop();
    expect(c.owners()).toEqual(['b']);
  });

  it('notifies only when the top changes', () => {
    const c = new InputContexts();
    const l = vi.fn();
    const off = c.onChange(l);
    const p1 = c.push('menu', 'a');
    expect(l).toHaveBeenLastCalledWith('menu');
    const p2 = c.push('menu', 'b'); // same top: no event
    expect(l).toHaveBeenCalledTimes(1);
    p2();
    expect(l).toHaveBeenCalledTimes(1);
    p1();
    expect(l).toHaveBeenLastCalledWith('gameplay');
    off();
    c.push('cutscene', 'x');
    expect(l).toHaveBeenCalledTimes(2);
  });

  it('popping a buried entry does not notify', () => {
    const c = new InputContexts();
    const bottom = c.push('menu', 'a');
    c.push('dialogue', 'b');
    const l = vi.fn();
    c.onChange(l);
    bottom();
    expect(l).not.toHaveBeenCalled();
  });
});
