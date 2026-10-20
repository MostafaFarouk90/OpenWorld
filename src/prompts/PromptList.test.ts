import { describe, expect, it } from 'vitest';
import { StubDocument, textOf } from '../hud/dom';
import { PromptList } from './PromptList';

describe('PromptList', () => {
  it('renders one child per row with opacity and replaces on re-render', () => {
    const list = new PromptList(new StubDocument());
    list.render([
      { mechanic: 'sprint', text: 'Hold Shift to sprint', opacity: 1, state: 'shown' },
      { mechanic: 'jump', text: 'Press Space', opacity: 0.5, state: 'fading' },
    ]);
    expect(list.element.children).toHaveLength(2);
    expect(list.element.children[0].className).toBe('owg-prompt');
    expect(list.element.children[1].style.opacity).toBe('0.5');
    expect(list.element.children[1].getAttribute('data-state')).toBe('fading');
    expect(textOf(list.element)).toContain('Hold Shift to sprint');
    list.render([]);
    expect(list.element.children).toHaveLength(0);
  });

  it('draws the key glyph as a keycap inside the text, and plain text without one', () => {
    const list = new PromptList(new StubDocument());
    list.render([
      { mechanic: 'sprint', text: 'Hold Shift to sprint', key: 'Shift', opacity: 1, state: 'shown' },
      { mechanic: 'lockSwap', text: 'Flick the mouse to switch target', opacity: 1, state: 'shown' },
    ]);
    const [withKey, plain] = list.element.children;
    expect(withKey.children.map((c) => c.className)).toEqual(['', 'owg-key', '']);
    expect(withKey.children[1].textContent).toBe('Shift');
    expect(withKey.children.map((c) => c.textContent).join('')).toBe('Hold Shift to sprint');
    expect(plain.children).toHaveLength(0);
    expect(plain.textContent).toBe('Flick the mouse to switch target');
  });

  it('splits at keyAt, so a rebound P is the keycap and not the P of "Press"', () => {
    const list = new PromptList(new StubDocument());
    list.render([{ mechanic: 'interact', text: 'Press P to speak or use', key: 'P', keyAt: 6, opacity: 1, state: 'shown' }]);
    expect(list.element.children[0].children.map((c) => c.textContent)).toEqual(['Press ', 'P', ' to speak or use']);
  });
});
