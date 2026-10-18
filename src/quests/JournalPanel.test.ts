import { describe, it, expect } from 'vitest';
import {
  buildJournalModel, createJournalPanel, toggleJournal, createJournalToggleState,
  type JournalQuestView, type JournalWidget, type JournalHud,
} from './JournalPanel';

const strings = { t: (k: string) => `T:${k}` };
function q(id: string, state: any, objs: Array<[number, number, boolean?]> = [[1, 0]]): JournalQuestView {
  return {
    def: { id, titleKey: `${id}.title`, summaryKey: `${id}.sum`, objectives: [] },
    state,
    objectives: objs.map(([req, prog, done], i) => ({
      def: { id: `o${i}`, type: 'goTo' as const, textKey: `${id}.o${i}`, target: 'x', required: req },
      progress: prog, done: !!done, current: i === 0,
    })),
  };
}

describe('buildJournalModel', () => {
  it('orders active, completed, failed; hides inactive', () => {
    const m = buildJournalModel({ all: () => [q('f', 'failed'), q('c', 'completed'), q('i', 'inactive'), q('a1', 'active'), q('a2', 'active')] }, strings);
    expect(m.sections.map((s) => s.questId)).toEqual(['a1', 'a2', 'c', 'f']);
    expect(m.sections[0].title).toBe('T:a1.title');
    expect(m.sections[0].summary).toBe('T:a1.sum');
    expect(m.empty).toBe(false);
  });
  it('shows progress only when required > 1', () => {
    const m = buildJournalModel({ all: () => [q('a', 'active', [[3, 2], [1, 0], [1, 1, true]])] }, strings);
    const o = m.sections[0].objectives;
    expect(o[0].progress).toBe('(2/3)');
    expect(o[1].progress).toBe('');
    expect(o[2].done).toBe(true);
    expect(o[0].text).toBe('T:a.o0');
  });
  it('empty log uses the empty key', () => {
    const m = buildJournalModel({ all: () => [] }, strings);
    expect(m.empty).toBe(true);
    expect(m.emptyText).toBe('T:quest.journal.empty');
  });
});

describe('createJournalPanel', () => {
  it('is a no-op without document', () => {
    const w = createJournalPanel(() => buildJournalModel({ all: () => [] }, strings), undefined);
    expect(w.element).toBeNull();
    w.refresh(); w.dispose();
  });
});

describe('toggleJournal', () => {
  function mk() {
    let modal: string | null = null; let opened = 0; let closed = 0; let disposed = 0;
    const hud: JournalHud = {
      get modalOpen() { return modal; },
      openModal: () => { opened++; modal = 'journal'; return () => { closed++; modal = null; }; },
    } as JournalHud;
    const make = (): JournalWidget => ({ element: null, refresh() {}, dispose() { disposed++; } });
    return { hud, make, setModal: (m: string | null) => { modal = m; }, c: () => ({ opened, closed, disposed }) };
  }
  it('opens when closed and closes when open', () => {
    const t = mk(); const st = createJournalToggleState();
    expect(toggleJournal(t.hud, t.make, st)).toBe(true);
    expect(toggleJournal(t.hud, t.make, st)).toBe(false);
    expect(t.c()).toEqual({ opened: 1, closed: 1, disposed: 1 });
    expect(toggleJournal(t.hud, t.make, st)).toBe(true);
  });
  it('is refused when another modal is open', () => {
    const t = mk(); const st = createJournalToggleState();
    t.setModal('inventory');
    expect(toggleJournal(t.hud, t.make, st)).toBe(false);
    expect(t.c().opened).toBe(0);
  });
  it('recovers when closed externally', () => {
    const t = mk(); const st = createJournalToggleState();
    toggleJournal(t.hud, t.make, st);
    t.setModal(null);
    expect(toggleJournal(t.hud, t.make, st)).toBe(true);
    expect(t.c().opened).toBe(2);
  });
});
