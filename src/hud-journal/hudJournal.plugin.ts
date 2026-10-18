import type { GameContext } from '../core/Game';
import type { GamePlugin } from '../core/plugins';
import type { JournalService } from '../quests/journalTabs';
import { FavourTab } from './FavourTab';
import { createStoryTab } from './StoryTab';
import { endingRecapLines } from './storyRecap';
import { endingOptions } from '../hud/ActEndingCard';
import { HUD_JOURNAL_STRINGS_EN } from './strings.en';

/**
 * Fills the journal's Favour and Story so far slots. A separate plugin so `hud` stays core only: the
 * `journal` service exists only once `quests` has set up.
 */
const hudJournalPlugin: GamePlugin = {
  id: 'hud-journal',
  dependsOn: ['core', 'quests'],
  setup(ctx: GameContext) {
    ctx.strings.register('en', HUD_JOURNAL_STRINGS_EN);
    const journal = (ctx.services as unknown as { get(n: string): unknown }).get('journal') as JournalService | undefined;
    if (!journal) return;
    const favour = new FavourTab(ctx);
    // The ending card body is the latest six outcome beats of the recap the Story tab shows (see endingRecap).
    const mine = (): string[] => endingRecapLines(ctx, (k) => ctx.strings.t(k), ENDING_RECAP_LINES);
    endingOptions.recap = mine;
    const offs = [journal.registerTab(favour.tab), journal.registerTab(createStoryTab(ctx))];
    // Per-instance cleanup: the system is recorded in this plugin's own scope, so closing that scope (and only
    // that one) disposes it. Plugin-level dispose() has no ctx, so nothing module-wide is kept.
    ctx.systems.add({
      id: 'hud-journal.teardown',
      dispose() {
        // Only clear the hook if it is still ours: another Game may have set its own since.
        if (endingOptions.recap === mine) endingOptions.recap = undefined;
        for (const off of offs) off();
        favour.dispose();
      },
    });
  },
};

/** Lines of the recap the ending card shows (the latest beats, not Act 1's opening). */
export const ENDING_RECAP_LINES = 6;

export default hudJournalPlugin;
