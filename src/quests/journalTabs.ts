// Journal tab slots. The Quests tab is built in; Favour and "Story so far" are slots that thread 8 fills through
// `journal.registerTab`. An unfilled slot shows a placeholder.
export interface JournalTab {
  id: string;
  titleKey: string;
  visible(): boolean;
  render(root: HTMLElement): void;
}

export interface JournalService {
  /** Replaces the renderer of the tab with this id (or adds a new tab). Dispose restores the previous one. */
  registerTab(tab: JournalTab): () => void;
}

export const TAB_QUESTS = 'quests';
export const TAB_FAVOUR = 'favour';
export const TAB_STORY = 'story';
export const FAVOUR_TAB_FLAG = 'story.m08.favourTab';
export const PLACEHOLDER_KEY = 'quest.journal.tab.placeholder';

export class JournalTabs implements JournalService {
  private readonly tabs: JournalTab[];
  private readonly listeners = new Set<() => void>();

  constructor(slots: JournalTab[]) { this.tabs = [...slots]; }

  registerTab(tab: JournalTab): () => void {
    const i = this.tabs.findIndex((t) => t.id === tab.id);
    const previous = i >= 0 ? this.tabs[i] : undefined;
    if (i >= 0) this.tabs[i] = tab; else this.tabs.push(tab);
    this.notify();
    let live = true;
    return () => {
      if (!live) return;
      live = false;
      const j = this.tabs.indexOf(tab);
      if (j < 0) return;
      if (previous) this.tabs[j] = previous; else this.tabs.splice(j, 1);
      this.notify();
    };
  }

  /** Tabs to show now, in slot order. A tab whose `visible` throws is hidden. */
  visible(): JournalTab[] {
    return this.tabs.filter((t) => { try { return t.visible(); } catch { return false; } });
  }

  get(id: string): JournalTab | undefined { return this.tabs.find((t) => t.id === id); }

  onChange(l: () => void): () => void {
    this.listeners.add(l);
    return () => { this.listeners.delete(l); };
  }

  private notify(): void { for (const l of [...this.listeners]) { try { l(); } catch { /* ignore */ } } }
}

/** The slots the journal ships with: Favour (from M08, the three Houses) and Story so far. */
export function defaultSlots(flag: (key: string) => unknown, placeholder: (root: HTMLElement) => void): JournalTab[] {
  return [
    { id: TAB_FAVOUR, titleKey: 'quest.journal.tab.favour', visible: () => flag(FAVOUR_TAB_FLAG) === true, render: placeholder },
    { id: TAB_STORY, titleKey: 'quest.journal.tab.story', visible: () => true, render: placeholder },
  ];
}
