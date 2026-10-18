// Quest journal: a pure model builder, a thin DOM widget (no-op without `document`) and the J toggle.
import type { ObjectiveDef, QuestDef, QuestState } from './types';
import { TAB_QUESTS, type JournalTabs } from './journalTabs';

/** Ports: what the journal reads. */
export interface JournalQuestView {
  def: QuestDef;
  state: QuestState;
  objectives: { def: ObjectiveDef; progress: number; done: boolean; current: boolean }[];
}
export interface JournalQuestSource { all(): JournalQuestView[] }
export interface JournalStrings { t(key: string, params?: Record<string, string | number>): string }

export interface JournalObjectiveLine { id: string; text: string; progress: string; done: boolean; current: boolean; optional: boolean }
export interface JournalSection {
  questId: string;
  state: 'active' | 'completed' | 'failed';
  title: string;
  summary: string;
  objectives: JournalObjectiveLine[];
}
export interface JournalModel { sections: JournalSection[]; empty: boolean; emptyText: string }

export const JOURNAL_EMPTY_KEY = 'quest.journal.empty';
const ORDER: Record<string, number> = { active: 0, completed: 1, failed: 2 };

export function buildJournalModel(quests: JournalQuestSource, strings: JournalStrings): JournalModel {
  const sections: JournalSection[] = [];
  for (const q of quests.all()) {
    if (q.state === 'inactive') continue;
    sections.push({
      questId: q.def.id,
      state: q.state,
      title: strings.t(q.def.titleKey),
      summary: strings.t(q.def.summaryKey),
      objectives: q.objectives.map((o) => {
        const req = o.def.required ?? 1;
        return {
          id: o.def.id,
          text: strings.t(o.def.textKey),
          progress: req > 1 ? `(${Math.min(o.progress, req)}/${req})` : '',
          done: o.done,
          current: o.current,
          optional: !!o.def.optional,
        };
      }),
    });
  }
  // stable sort keeps the registry order inside a group
  const indexed = sections.map((s, i) => ({ s, i }));
  indexed.sort((a, b) => ORDER[a.s.state] - ORDER[b.s.state] || a.i - b.i);
  const sorted = indexed.map((x) => x.s);
  return { sections: sorted, empty: sorted.length === 0, emptyText: strings.t(JOURNAL_EMPTY_KEY) };
}

export interface JournalWidget { element: HTMLElement | null; refresh(): void; dispose(): void }

export interface JournalPanelOpts { tabs: JournalTabs; t(key: string): string }

export function createJournalPanel(
  source: () => JournalModel,
  doc: Document | undefined = typeof document === 'undefined' ? undefined : document,
  opts?: JournalPanelOpts,
): JournalWidget {
  if (!doc) return { element: null, refresh() {}, dispose() {} };
  const root = doc.createElement('div');
  root.className = 'journal-panel';
  root.setAttribute('role', 'dialog');
  let activeTab = TAB_QUESTS;

  const renderQuests = (into: HTMLElement): void => {
    const m = source();
    if (m.empty) {
      const p = doc.createElement('p');
      p.className = 'journal-empty';
      p.textContent = m.emptyText;
      into.appendChild(p);
      return;
    }
    for (const s of m.sections) {
      const sec = doc.createElement('section');
      sec.className = `journal-quest journal-${s.state}`;
      const h = doc.createElement('h3');
      h.textContent = s.title;
      const sum = doc.createElement('p');
      sum.textContent = s.summary;
      const ul = doc.createElement('ul');
      for (const o of s.objectives) {
        const li = doc.createElement('li');
        li.className = o.done ? 'done' : o.current ? 'current' : '';
        li.textContent = `${o.done ? '[x]' : '[ ]'} ${o.text}${o.progress ? ' ' + o.progress : ''}`;
        ul.appendChild(li);
      }
      sec.append(h, sum, ul);
      into.appendChild(sec);
    }
  };

  const render = (): void => {
    root.textContent = '';
    const tabs = opts?.tabs.visible() ?? [];
    if (!opts || tabs.length === 0) { renderQuests(root); return; }
    if (activeTab !== TAB_QUESTS && !tabs.some((t) => t.id === activeTab)) activeTab = TAB_QUESTS;
    const bar = doc.createElement('div');
    bar.className = 'journal-tabs';
    bar.setAttribute('role', 'tablist');
    const mk = (id: string, title: string): void => {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = `journal-tab${id === activeTab ? ' active' : ''}`;
      b.dataset.tab = id;
      b.textContent = title;
      b.addEventListener('click', () => { activeTab = id; render(); });
      bar.appendChild(b);
    };
    mk(TAB_QUESTS, opts.t('quest.journal.tab.quests'));
    for (const t of tabs) mk(t.id, opts.t(t.titleKey));
    const body = doc.createElement('div');
    body.className = 'journal-body';
    if (activeTab === TAB_QUESTS) renderQuests(body);
    else {
      try { opts.tabs.get(activeTab)?.render(body); } catch (e) {
        body.textContent = '';
        console.warn(`[quests] journal tab "${activeTab}" failed: ${String(e)}`);
      }
    }
    root.append(bar, body);
  };
  render();
  const off = opts?.tabs.onChange(render);
  return {
    element: root,
    refresh: render,
    dispose() { off?.(); root.remove(); },
  };
}

/** The slice of the HUD the toggle needs. */
export interface JournalHud { openModal(w: JournalWidget): (() => void) | null; modalOpen: string | null }
export interface JournalToggleState { close: (() => void) | null; widget: JournalWidget | null }

export function createJournalToggleState(): JournalToggleState { return { close: null, widget: null }; }

/** J pressed. Returns true when the journal is open afterwards. Refused (false) when another modal is open. */
export function toggleJournal(hud: JournalHud, make: () => JournalWidget, state: JournalToggleState): boolean {
  if (state.close && !hud.modalOpen) { // closed externally (Esc): forget the stale handle
    state.widget?.dispose();
    state.close = null;
    state.widget = null;
  }
  if (state.close) {
    const c = state.close;
    state.close = null;
    state.widget?.dispose();
    state.widget = null;
    c();
    return false;
  }
  if (hud.modalOpen) return false;
  const w = make();
  const close = hud.openModal(w);
  if (!close) { w.dispose(); return false; }
  state.close = close;
  state.widget = w;
  return true;
}
