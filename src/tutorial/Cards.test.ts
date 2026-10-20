import { describe, expect, it, vi } from 'vitest';
import { BeatCards, LineCards, lineSeconds, splitSpeaker } from './Cards';

function fakeDoc() {
  const mk = (): any => {
    const e: any = { style: {}, className: '', textContent: '', children: [] as any[] };
    e.appendChild = (c: any) => e.children.push(c);
    e.append = (...c: any[]) => e.children.push(...c);
    return e;
  };
  return { createElement: () => mk() } as unknown as Document;
}
function deps(doc: Document | null = fakeDoc()) {
  const mounted: { slot: string; id: string; element: any }[] = [];
  const mount = vi.fn((slot: string, w: { id: string; element: HTMLElement }, _order?: number) => {
    const m = { slot, ...w };
    mounted.push(m);
    return () => mounted.splice(mounted.indexOf(m), 1);
  });
  return { d: { doc, mount }, mounted, mount };
}

describe('splitSpeaker and lineSeconds', () => {
  it('splits a short leading name and leaves other lines whole', () => {
    expect(splitSpeaker('Sir Gaut: Run!')).toEqual({ speaker: 'Sir Gaut', body: 'Run!' });
    expect(splitSpeaker('No speaker here')).toEqual({ speaker: null, body: 'No speaker here' });
    expect(splitSpeaker('Strike. Then: block')).toEqual({ speaker: null, body: 'Strike. Then: block' });
    expect(splitSpeaker('A very long sentence that is not a name: body').speaker).toBeNull();
  });
  it('keeps a line up long enough to read, within 5 to 11 s', () => {
    expect(lineSeconds('Run!')).toBe(5);
    expect(lineSeconds('x'.repeat(60))).toBeCloseTo(7.3);
    expect(lineSeconds('x'.repeat(400))).toBe(11);
  });
});

describe('LineCards', () => {
  it('draws a speaker caption and a body, and drops the card when its time is up', () => {
    const { d, mounted } = deps();
    const c = new LineCards(d);
    c.show('Sir Gaut: Up the lane into Kettlewick.', 'subtitle');
    expect(mounted).toHaveLength(1);
    expect(mounted[0].slot).toBe('subtitle');
    const [who, body] = mounted[0].element.children;
    expect(who.textContent).toBe('Sir Gaut');
    expect(body.textContent).toBe('Up the lane into Kettlewick.');
    expect(mounted[0].element.style.background).toContain('rgba(20,16,12');
    const up = lineSeconds('Sir Gaut: Up the lane into Kettlewick.');
    c.tick(up - 0.1);
    expect(mounted).toHaveLength(1);
    c.tick(0.2);
    expect(mounted).toHaveLength(0);
  });
  it('holds at most two cards per slot, the oldest going first', () => {
    const { d, mounted } = deps();
    const c = new LineCards(d);
    c.show('one', 'subtitle');
    c.show('two', 'subtitle');
    c.show('three', 'subtitle');
    c.show('a toast', 'toast');
    expect(c.count('subtitle')).toBe(2);
    expect(mounted.filter((m) => m.slot === 'subtitle').map((m) => m.element.children[0].textContent)).toEqual(['two', 'three']);
    expect(c.count('toast')).toBe(1);
  });
  it('runs headless and disposes everything', () => {
    const { d } = deps(null);
    const c = new LineCards(d);
    c.show('Sir Gaut: hi', 'subtitle');
    expect(c.count('subtitle')).toBe(1);
    c.dispose();
    expect(c.count('subtitle')).toBe(0);
    const live = deps();
    const c2 = new LineCards(live.d);
    c2.show('x', 'toast');
    c2.dispose();
    expect(live.mounted).toHaveLength(0);
  });
});

describe('BeatCards', () => {
  it('shows a start card in top-center, then hides it after 4 s', () => {
    const { d, mounted } = deps();
    const b = new BeatCards(d);
    b.show({ kind: 'start', kicker: 'Knighting Day · 3 of 15', title: 'A Warm Welcome' });
    expect(mounted[0].slot).toBe('top-center');
    expect(mounted[0].element.children.map((c: any) => c.textContent)).toEqual(['Knighting Day · 3 of 15', 'A Warm Welcome']);
    b.tick(3.9);
    expect(b.showing?.title).toBe('A Warm Welcome');
    b.tick(0.2);
    expect(b.showing).toBeNull();
    expect(mounted).toHaveLength(0);
  });
  it('a start right after a done waits for the done card, so both are read', () => {
    const { d } = deps();
    const b = new BeatCards(d);
    b.show({ kind: 'done', kicker: 'Done', title: 'Eyes Up' });
    b.show({ kind: 'start', kicker: 'Knighting Day · 3 of 15', title: 'A Warm Welcome' });
    expect(b.showing).toMatchObject({ kind: 'done', title: 'Eyes Up' });
    b.tick(2.6);
    expect(b.showing).toMatchObject({ kind: 'start', title: 'A Warm Welcome' });
  });
  it('a done card takes over from the start card still up for the same beat', () => {
    const { d, mounted } = deps();
    const b = new BeatCards(d);
    b.show({ kind: 'start', kicker: 'k', title: 'Eyes Up' });
    b.show({ kind: 'done', kicker: 'Done', title: 'Eyes Up' });
    expect(b.showing?.kind).toBe('done');
    expect(mounted).toHaveLength(1);
  });
  it('a skip chain: a new start card replaces the start card still up', () => {
    const { d, mounted } = deps();
    const b = new BeatCards(d);
    b.show({ kind: 'start', kicker: 'k', title: 'Run' });
    b.show({ kind: 'start', kicker: 'k', title: 'Over the Wall' });
    expect(b.showing?.title).toBe('Over the Wall');
    expect(mounted).toHaveLength(1);
  });
  it('tutorial toasts mount under the beat card in top-center, capped at two', () => {
    const { d, mounted, mount } = deps();
    const c = new LineCards(d);
    for (const x of ['a', 'b', 'c']) c.show(x, 'toast');
    expect(mounted.map((m) => m.slot)).toEqual(['top-center', 'top-center']);
    expect(mount.mock.calls[0][2]).toBe(5);
    c.clear();
    expect(mounted).toHaveLength(0);
  });
  it('a newer queued card of the same kind replaces the older (skip chains), and clear drops all', () => {
    const { d, mounted } = deps();
    const b = new BeatCards(d);
    b.show({ kind: 'done', kicker: 'Done', title: 'T1' });
    b.show({ kind: 'start', kicker: 'k', title: 'T2' });
    b.show({ kind: 'start', kicker: 'k', title: 'T3' });
    b.tick(3);
    expect(b.showing?.title).toBe('T3');
    b.clear();
    expect(b.showing).toBeNull();
    expect(mounted).toHaveLength(0);
  });
});
