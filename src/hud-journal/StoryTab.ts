import type { GameContext } from '../core/Game';
import { TAB_STORY, type JournalTab } from '../quests/journalTabs';
import { recapLines } from './storyRecap';

export function createStoryTab(ctx: GameContext): JournalTab {
  return {
    id: TAB_STORY,
    titleKey: 'quest.journal.tab.story',
    visible: () => true,
    render(root) {
      const doc = root.ownerDocument;
      const t = (k: string): string => ctx.strings.t(k);
      root.replaceChildren();
      const heading = doc.createElement('div');
      heading.className = 'journal-heading';
      heading.textContent = t('hud.journal.story.heading');
      root.appendChild(heading);
      const lines = recapLines(ctx, t);
      if (lines.length === 0) {
        const p = doc.createElement('p');
        p.className = 'journal-empty';
        p.textContent = t('hud.journal.story.empty');
        root.appendChild(p);
        return;
      }
      for (const line of lines) {
        const p = doc.createElement('p');
        p.className = 'story-line';
        p.textContent = line;
        root.appendChild(p);
      }
    },
  };
}
