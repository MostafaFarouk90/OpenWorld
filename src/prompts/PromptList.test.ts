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
});
