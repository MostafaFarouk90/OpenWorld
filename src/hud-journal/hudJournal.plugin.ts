import type { GameContext } from '../core/Game';
import type { GamePlugin } from '../core/plugins';
import type { JournalService } from '../quests/journalTabs';
import { FavourTab } from './FavourTab';
import { createStoryTab } from './StoryTab';
import { recapLines } from './storyRecap';
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
    // The ending card body is the same recap the Story tab shows.
    endingOptions.recap = () => recapLines(ctx, (k) => ctx.strings.t(k)).slice(0, 6);
    const offs = [journal.registerTab(favour.tab), journal.registerTab(createStoryTab(ctx))];
    disposers.set(ctx, () => { endingOptions.recap = undefined; for (const off of offs) off(); favour.dispose(); });
  },
  dispose() {
    for (const [ctx, fn] of disposers) { fn(); disposers.delete(ctx); }
  },
};

const disposers = new Map<GameContext, () => void>();

export default hudJournalPlugin;
