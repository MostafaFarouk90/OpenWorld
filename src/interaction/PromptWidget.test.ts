import { describe, expect, it, vi } from 'vitest';
import type { InteractionSystem } from './InteractionSystem';
import { createPromptWidget } from './PromptWidget';

function fakeEl(): any {
  const el: any = { className: '', textContent: '', style: {}, children: [] as any[], removed: false };
  el.appendChild = (c: any) => el.children.push(c);
  el.remove = () => { el.removed = true; };
  return el;
}

function make(focus: any, progress = 0) {
  const interaction = { focus, holdProgress: progress } as unknown as InteractionSystem;
  const text = vi.fn((k: string, p: Record<string, string | number>) => `${k}|${p.key}|${p.name}`);
  const w = createPromptWidget({ interaction, text, glyph: () => 'F', doc: { createElement: () => fakeEl() } as any });
  return { w, interaction: interaction as any, text };
}

describe('PromptWidget', () => {
  it('is hidden with no focus', () => {
    const { w } = make(null);
    w.update(0);
    expect(w.element.style.display).toBe('none');
    expect(w.id).toBe('core.interaction-prompt');
    expect(w.order).toBe(0);
  });
  it('shows default prompt key with glyph and name', () => {
    const { w } = make({ kind: 'door', name: 'Bakery door' });
    w.update(0);
    const el: any = w.element;
    expect(el.style.display).toBe('');
    expect(el.children[0].textContent).toBe('interact.door|F|Bakery door');
  });
  it('uses an explicit promptKey and empty name default', () => {
    const { w } = make({ kind: 'door', promptKey: 'interact.locked' });
    w.update(0);
    expect((w.element as any).children[0].textContent).toBe('interact.locked|F|');
  });
  it('hold ring follows holdProgress; hidden for press interactables', () => {
    const { w, interaction } = make({ kind: 'kneel', holdSeconds: 1.5 }, 0.5);
    w.update(0);
    const ring = (w.element as any).children[1];
    expect(ring.style.width).toBe('50%');
    expect(ring.style.display).toBe('');
    interaction.holdProgress = 7;
    w.update(0);
    expect(ring.style.width).toBe('100%');
    interaction.focus = { kind: 'door' };
    w.update(0);
    expect(ring.style.display).toBe('none');
  });
  it('hides again when focus goes away, and dispose removes the element', () => {
    const { w, interaction } = make({ kind: 'door' });
    w.update(0);
    interaction.focus = null;
    w.update(0);
    expect(w.element.style.display).toBe('none');
    w.dispose();
    expect((w.element as any).removed).toBe(true);
  });
  it('only re-renders text when it changes', () => {
    const { w, text } = make({ kind: 'door' });
    w.update(0);
    w.update(0);
    const el: any = w.element;
    expect(el.children[0].textContent).toBe('interact.door|F|');
    expect(text).toHaveBeenCalledTimes(2);
  });
});
