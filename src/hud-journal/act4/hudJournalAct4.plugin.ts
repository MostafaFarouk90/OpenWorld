import type { GameContext } from '../../core/Game';
import type { GamePlugin } from '../../core/plugins';
import type { JournalService } from '../../quests/journalTabs';
import type { QuestsService } from '../../quests/service';
import { TrackTab, type TrackTabSpec } from './TrackTab';
import { STILL_NEEDED_GATES, actStartNote, stillNeededNote, type NotePorts } from './notes';
import { HUD_JOURNAL_ACT4_STRINGS_EN } from './strings.en';

/** Design 3: the Ashwalkers' favour shows from M43 (the walkers' trials). */
export const ASHWALKERS_TAB: TrackTabSpec = {
  id: 'ashwalkers',
  track: 'ashwalkers',
  flag: 'story.m43.complete',
  titleKey: 'hud.journal.ashwalkers.tab',
  headingKey: 'hud.journal.ashwalkers.heading',
  nameKey: 'hud.journal.ashwalkers.name',
};

/**
 * Act 4 L9 (plans/act4-L9.md sections 2 and 3): the Ashwalkers' favour tab, the act start pointer and the "still needed"
 * lists, all through the `journal` service. Without it (no quests plugin) it does nothing.
 */
const hudJournalAct4: GamePlugin = {
  id: 'hud-journal-act4',
  dependsOn: ['core', 'quests'],
  setup(ctx: GameContext) {
    ctx.strings.register('en', HUD_JOURNAL_ACT4_STRINGS_EN);
    const svc = (ctx.services as unknown as { get(n: string): unknown });
    const journal = svc.get('journal') as JournalService | undefined;
    if (!journal) return;
    const quests = (): QuestsService | undefined => svc.get('quests') as QuestsService | undefined;
    const ports: NotePorts = {
      flag: (k) => ctx.state.getBool(k),
      questState: (id) => quests()?.state(id) ?? 'inactive',
      questDef: (id) => quests()?.get(id),
      t: (k, p) => ctx.strings.t(k, p),
    };
    const tab = new TrackTab(ctx, ASHWALKERS_TAB);
    const offs = [journal.registerTab(tab.tab)];
    if (journal.registerNote) {
      offs.push(journal.registerNote(() => actStartNote(ports)));
      for (const gate of STILL_NEEDED_GATES) offs.push(journal.registerNote(() => stillNeededNote(ports, gate)));
    }
    ctx.systems.add({
      id: 'hud-journal-act4.teardown',
      dispose() {
        for (const off of offs.splice(0)) off();
        tab.dispose();
      },
    });
  },
};

export default hudJournalAct4;
