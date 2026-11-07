// Plugin `act5-ending` (N12 PR 2, plan 9): wires the final ending director (act5EndingDirector.ts) to the quests, the
// scenes service, N9's Act 5 screens (the title card, the epilogue, the credits), N8's credits cues, N13's after-ending
// wake and the save service. It provides `act5Ending` so N11's M56 can hold saves at the confirm (`holdSaves()`); the
// director releases that hold once `world.afterEnding` is written and N13 has woken the world, then saves once.
import type { GamePlugin } from '../core/plugins';
import { finalEnding } from './actEndings';
import { FinalEndingDirector } from './act5EndingDirector';
import { ACT5_ENDING_DATA, ACT5_ENDING_STRINGS_EN } from './act5EndingData';
import { playCredits, stepCredits, stopCue } from '../music/act5Cues';

declare module '../core/Services' {
  interface GameServices {
    /** N12 PR 2: the final ending director (N11's M56 calls `holdSaves()` at the confirm). */
    act5Ending: FinalEndingDirector;
  }
}

/** The title card's phase-card id on N9's screens. */
export const ACT5_TITLE_CARD_ID = 'ending-title';
export const ACT5_SAVE_HOLD = 'm56.ending';

const plugin: GamePlugin = {
  id: 'act5-ending',
  dependsOn: ['core'],
  setup(ctx) {
    // stand-in strings until N11 PR 2 registers its own (act5EndingData.ts)
    ctx.strings.register('en', ACT5_ENDING_STRINGS_EN);
    const t = (k: string) => ctx.strings.t(k);
    const screens = () => ctx.services.get('act5Screens');
    const music = () => ctx.services.get('music') as never;
    const warn = (m: string) => console.warn(m);
    const director = new FinalEndingDirector(finalEnding(), ACT5_ENDING_DATA, {
      getFlag: (k) => ctx.state.getFlag(k as never),
      setFlag: (k, v) => ctx.state.setFlag(k as never, v as never),
      emitActEnded: (e) => ctx.events.emit('act.ended', e),
      busy: () =>
        ctx.hud.modalOpen !== null ||
        ctx.services.get('dialogue')?.active === true ||
        (ctx.services.get('scenes')?.active ?? null) !== null ||
        screens()?.active() === true,
      playScene: async (id) => {
        const scenes = ctx.services.get('scenes');
        if (!scenes) return warn(`act5-ending: no scenes service, ${id} not played`);
        return scenes.play(id);
      },
      showTitle: async (card) => {
        const s = screens();
        if (!s) return warn('act5-ending: no act5Screens, the title card is not shown');
        await s.showPhaseCard(ACT5_TITLE_CARD_ID, card.lineKey ? [t(card.lineKey)] : [], card.titleKey);
      },
      showEpilogue: async (deck) => {
        const s = screens();
        if (!s) return warn('act5-ending: no act5Screens, the epilogue is not shown');
        await s.showEpilogue(deck);
      },
      showCredits: async (def, onStep) => {
        const s = screens();
        if (!s) return warn('act5-ending: no act5Screens, the credits are not shown');
        await s.showCredits(def, { onStep });
      },
      music: {
        credits: (verse, tie) => playCredits(music(), verse, { tie }),
        step: (step, verse, tie) => stepCredits(music(), step, verse, { tie }),
        stop: () => stopCue(music()),
      },
      wake: async () => {
        const a = ctx.services.get('afterEnding' as never) as { wake(): Promise<void> } | undefined;
        if (a) await a.wake();
      },
      suspendSaves: () => ctx.services.get('save')?.suspend(ACT5_SAVE_HOLD) ?? (() => {}),
      save: async () => ctx.services.get('save')?.saveNow('manual'),
      warn,
    });
    ctx.services.provide?.('act5Ending', director);
    ctx.events.on('quest.completed', (e) => director.onQuestCompleted(e.questId));
    ctx.events.on('save.loaded', () => director.onLoaded());
    ctx.systems.add({ id: 'act5-ending', fixedPhase: 'rules', order: 854, fixedUpdate: () => director.tick() });
    (globalThis as { __act5Ending?: FinalEndingDirector }).__act5Ending = director;
  },
  dispose() {
    delete (globalThis as { __act5Ending?: unknown }).__act5Ending;
  },
};

export default plugin;
