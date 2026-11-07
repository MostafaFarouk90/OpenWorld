import type { GameContext } from '../../core/Game';
import type { GamePlugin } from '../../core/plugins';
import type { JournalService } from '../../quests/journalTabs';
import type { QuestsService } from '../../quests/service';
import { requiredQuests, actStartNote, stillNeededNote, type ActStartRow, type NotePorts } from '../act4/notes';
import { lastChanceNote, scarNote } from '../../hud/act5/scarNote';
import { ACT5_JOURNAL_STRINGS_EN } from '../../hud/act5/strings.en';

/** Where Act 5 begins (M47 self-starts at Rimfoot when the gate opens). */
export const A5_START_ROW: ActStartRow = { act: 5, gateFlag: 'story.gate.a5', firstQuest: 'm47', textKey: 'hud.journal.start.a5' };
/** Gated quests whose wait the journal spells out: M52 (M47 to M51, R26) and M54 (D09, R27; Q12). */
export const A5_STILL_NEEDED: readonly string[] = ['m52', 'm54'];

/**
 * Act 5 N9 (plans/act5-N9.md section 4): the Act 5 start pointer, the still-needed lists, the last-chance warning and the Scar
 * line, all through the `journal.registerNote` hook. Uses L9's pure functions with its own row only (L9's plugin keeps Acts 3 and 4, so no pointer shows twice): no Act 4 file is edited.
 */
const hudJournalAct5: GamePlugin = {
  id: 'hud-journal-act5',
  dependsOn: ['core', 'quests'],
  setup(ctx: GameContext) {
    ctx.strings.register('en', ACT5_JOURNAL_STRINGS_EN);
    const svc = ctx.services as unknown as { get(n: string): unknown };
    const journal = svc.get('journal') as JournalService | undefined;
    const registerNote = journal?.registerNote?.bind(journal);
    if (!registerNote) return;
    const quests = (): QuestsService | undefined => svc.get('quests') as QuestsService | undefined;
    const ports: NotePorts = {
      flag: (k) => ctx.state.getBool(k),
      questState: (id) => quests()?.state(id) ?? 'inactive',
      questDef: (id) => quests()?.get(id),
      t: (k, p) => ctx.strings.t(k, p),
    };
    // The choice flag holds a string ('rekindle' | 'let-it-die'), so "set" means any truthy value, not a boolean.
    const isSet = (k: string): boolean => ctx.state.getBool(k) || ctx.state.getNumber(k) > 0 || (typeof ctx.state.getFlag(k) === 'string' && ctx.state.getFlag(k) !== '');
    const scars = (): number | undefined => (svc.get('spells') as { scars?: number } | undefined)?.scars;
    const offs = [
      registerNote(() => actStartNote(ports, [A5_START_ROW])),
      ...A5_STILL_NEEDED.map((gate) => registerNote(() => stillNeededNote(ports, gate))),
      registerNote(() => lastChanceNote({ ...ports, needs: (id) => requiredQuests(quests()?.get(id)?.startWhen) })),
      registerNote(() => scarNote({ flag: isSet, scars, t: ports.t })),
    ];
    ctx.systems.add({
      id: 'hud-journal-act5.teardown',
      dispose() {
        for (const off of offs.splice(0)) off();
      },
    });
  },
};

export default hudJournalAct5;
