import type { GameContext } from '../../core/Game';
import type { GamePlugin } from '../../core/plugins';
import type { JournalService } from '../../quests/journalTabs';
import { DragonsTab } from './DragonsTab';
import { HUD_JOURNAL_ACT3_STRINGS_EN } from './strings.en';

/**
 * K15 PR 2: registers the dragons' trust tab through `journal.registerTab`. Its own plugin so the shipped hud-journal stays
 * Houses only; without the `quests` journal service it does nothing.
 */
const dragonsTabPlugin: GamePlugin = {
  id: 'hud-journal-act3',
  dependsOn: ['core', 'quests'],
  setup(ctx: GameContext) {
    ctx.strings.register('en', HUD_JOURNAL_ACT3_STRINGS_EN);
    const journal = (ctx.services as unknown as { get(n: string): unknown }).get('journal') as JournalService | undefined;
    if (!journal) return;
    const dragons = new DragonsTab(ctx);
    const off = journal.registerTab(dragons.tab);
    // Closing this plugin's scope disposes the tab and its listeners (the hud-journal plugin does the same).
    ctx.systems.add({
      id: 'hud-journal-act3.teardown',
      dispose() {
        off();
        dragons.dispose();
      },
    });
  },
};

export default dragonsTabPlugin;
