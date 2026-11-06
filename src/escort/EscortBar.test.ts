import { describe, expect, it } from 'vitest';
import { StubDocument, type StubElement } from '../hud/dom';
import { EscortBar } from './EscortBar';
import type { EscortView } from './EscortEngine';

const t = (k: string) => ({ 'hud.escort.title': 'Escort', 'quest.m40.escort': 'The boy king' })[k] ?? k;

describe('escort bar', () => {
  it('is hidden with no escort, and on a read that throws', () => {
    const bar = new EscortBar(new StubDocument(), () => null, t);
    bar.update();
    expect(bar.element.style.display).toBe('none');
    const broken = new EscortBar(new StubDocument(), () => { throw new Error('x'); }, t);
    broken.update();
    expect(broken.element.style.display).toBe('none');
  });

  it('shows the title, one pip per member (hollow when kneeling) and no cart row without a cart', () => {
    let v: EscortView = { id: 'm40', nameKey: 'quest.m40.escort', members: [{ id: 'edric', kneeling: false }, { id: 'rook', kneeling: true }], cart: null };
    const bar = new EscortBar(new StubDocument(), () => v, t);
    bar.update();
    expect(bar.element.style.display).toBe('block');
    expect(bar.snapshot()).toEqual({ title: 'The boy king', pips: [true, false], cart: null });
    const pips = (bar.element.children[1] as StubElement).children;
    expect(pips.map((p) => p.className)).toEqual(['owg-escort-pip', 'owg-escort-pip down']);
    expect((bar.element.children[2] as StubElement).style.display).toBe('none');
    v = { ...v, nameKey: null, members: [{ id: 'carter', kneeling: false }], cart: { health: 150, max: 600 } };
    bar.update();
    expect(bar.snapshot()).toEqual({ title: 'Escort', pips: [true], cart: 0.25 });
    expect((bar.element.children[2] as StubElement).style.display).toBe('block');
    expect(((bar.element.children[2] as StubElement).children[0] as StubElement).style.width).toBe('25%');
  });
});
